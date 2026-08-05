/**
 * Génère les modèles numériques de terrain du site, en courbes de niveau.
 *
 * Le rendu suit les conventions du dessin topographique : équidistance
 * constante, courbes maîtresses accentuées tous les N intervalles, cotes
 * portées le long de la courbe et orientées selon sa tangente.
 *
 * Exécuté au build (`npm run terrain`). d3-contour reste une devDependency :
 * rien de tout cela n'est expédié au navigateur, seuls les SVG produits le sont.
 */
import { contours } from 'd3-contour';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'src/generated');

/* ------------------------------------------------------------------ bruit */

/** PRNG déterministe : le terrain doit être identique à chaque build. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Bruit de valeur sur grille, interpolé en smootherstep. */
function makeValueNoise(seed) {
  const SIZE = 256;
  const rand = mulberry32(seed);
  const grid = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();

  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smootherstep(x - x0);
    const fy = smootherstep(y - y0);
    const at = (ix, iy) => grid[(iy & (SIZE - 1)) * SIZE + (ix & (SIZE - 1))];
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

/**
 * Relief fractal. Les octaves en crête (`ridged`) cassent l'aspect « bulles »
 * du bruit fractal simple et produisent des lignes de crête et des thalwegs
 * crédibles.
 */
function makeRelief(seed, { octaves = 5, ridgeFrom = 2, lacunarity = 2.05, gain = 0.5 } = {}) {
  const layers = Array.from({ length: octaves }, (_, i) => makeValueNoise(seed + i * 977));
  const warpX = makeValueNoise(seed + 5501);
  const warpY = makeValueNoise(seed + 8807);

  return (x, y) => {
    // Distorsion du domaine : les courbes cessent d'être concentriques.
    const wx = x + (warpX(x * 1.7, y * 1.7) - 0.5) * 0.85;
    const wy = y + (warpY(x * 1.7, y * 1.7) - 0.5) * 0.85;

    let sum = 0;
    let norm = 0;
    let amp = 1;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      const raw = layers[o](wx * freq, wy * freq);
      const shaped = o >= ridgeFrom ? 1 - Math.abs(raw * 2 - 1) : raw;
      sum += shaped * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}

/* ---------------------------------------------------------------- maillage */

function buildField(width, height, relief, { scale }) {
  const values = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      values[y * width + x] = relief(x / scale, y / scale);
    }
  }
  return values;
}

/** Lissage léger : supprime l'aliasing de grille qui rend les courbes crénelées. */
function blur(values, width, height, passes = 2) {
  let src = values;
  let dst = new Float64Array(values.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            sum += src[ny * width + nx];
            count++;
          }
        }
        dst[y * width + x] = sum / count;
      }
    }
    [src, dst] = [dst, src];
  }
  return src;
}

/* -------------------------------------------------------- géométrie / SVG */

/** Douglas-Peucker : divise le poids des fichiers par ~4 sans perte visible. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let maxDist = -1;
    let maxIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let dist;
      if (lenSq === 0) {
        dist = Math.hypot(px - ax, py - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    if (maxDist > tolerance) {
      keep[maxIndex] = 1;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Découpe une polyligne au cadre visible (Liang-Barsky segment par segment,
 * les tronçons contigus étant recousus). Sans cela chaque courbe traînerait
 * toute sa géométrie hors champ : le fichier double pour rien.
 */
function clipPolyline(points, x0, y0, x1, y1) {
  const runs = [];
  let current = null;

  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const dx = bx - ax;
    const dy = by - ay;

    let t0 = 0;
    let t1 = 1;
    const edges = [
      [-dx, ax - x0],
      [dx, x1 - ax],
      [-dy, ay - y0],
      [dy, y1 - ay],
    ];
    let visible = true;
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) {
          visible = false;
          break;
        }
        continue;
      }
      const r = q / p;
      if (p < 0) {
        if (r > t1) {
          visible = false;
          break;
        }
        if (r > t0) t0 = r;
      } else {
        if (r < t0) {
          visible = false;
          break;
        }
        if (r < t1) t1 = r;
      }
    }
    if (!visible) {
      current = null;
      continue;
    }

    const start = [ax + t0 * dx, ay + t0 * dy];
    const end = [bx - (1 - t1) * dx, by - (1 - t1) * dy];

    if (current && Math.hypot(current.at(-1)[0] - start[0], current.at(-1)[1] - start[1]) < 1e-6) {
      current.push(end);
    } else {
      current = [start, end];
      runs.push(current);
    }
    if (t1 < 1) current = null; // le tracé ressort du cadre : on coupe le fil
  }

  return runs.filter((run) => run.length > 1);
}

const round = (n, precision = 1) => {
  const f = 10 ** precision;
  return String(Math.round(n * f) / f);
};

function toPath(points, precision) {
  let d = `M${round(points[0][0], precision)} ${round(points[0][1], precision)}`;
  for (let i = 1; i < points.length; i++) {
    d += `L${round(points[i][0], precision)} ${round(points[i][1], precision)}`;
  }
  return d;
}

const perimeter = (points) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
};

/**
 * Place une cote le long de la courbe, comme sur une minute de terrain :
 * on cherche un segment assez long et proche de l'horizontale, et on oriente
 * le texte selon la tangente sans jamais le retourner.
 */
function labelAnchor(points, minSegment) {
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const length = Math.hypot(bx - ax, by - ay);
    if (length < minSegment) continue;

    let angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;

    // On privilégie les segments longs et lisibles (proches de l'horizontale).
    const score = length - Math.abs(angle) * 0.9;
    if (!best || score > best.score) {
      best = { x: (ax + bx) / 2, y: (ay + by) / 2, angle, score };
    }
  }
  return best;
}

/* ----------------------------------------------------------- construction */

function buildContours(config) {
  const {
    gridWidth,
    gridHeight,
    viewWidth,
    viewHeight,
    margin,
    seed,
    noiseScale,
    reliefOptions,
    interval,
    indexEvery,
    baseElevation,
    elevationSpan,
    tolerance,
    precision,
    minRingLength,
    label,
  } = config;

  // d3-contour referme les anneaux sur la bordure de la grille, ce qui produit
  // de longs segments rectilignes. On calcule donc sur une grille débordante et
  // on recadre : les artefacts de bord tombent hors du viewBox.
  const fieldWidth = gridWidth + margin * 2;
  const fieldHeight = gridHeight + margin * 2;

  const relief = makeRelief(seed, reliefOptions);
  const field = blur(
    buildField(fieldWidth, fieldHeight, relief, { scale: noiseScale }),
    fieldWidth,
    fieldHeight,
  );

  let min = Infinity;
  let max = -Infinity;
  for (const v of field) {
    if (v < min) min = v;
    if (v > max) max = v;
  }

  // Le champ normalisé est exprimé en mètres : les seuils sont alors de
  // véritables cotes, et l'équidistance a un sens.
  const elevations = Float64Array.from(field, (v) => baseElevation + ((v - min) / (max - min)) * elevationSpan);

  const thresholds = [];
  const first = Math.ceil(baseElevation / interval) * interval;
  for (let z = first; z < baseElevation + elevationSpan; z += interval) thresholds.push(z);

  const generator = contours().size([fieldWidth, fieldHeight]).thresholds(thresholds);
  const bands = generator(Array.from(elevations));

  const sx = viewWidth / (gridWidth - 1);
  const sy = viewHeight / (gridHeight - 1);
  // Léger débord : le `preserveAspectRatio="slice"` recadre déjà, mais on garde
  // une réserve pour que le trait de coupe ne devienne jamais visible.
  const bleedX = viewWidth * 0.02;
  const bleedY = viewHeight * 0.02;

  const levels = [];
  for (const band of bands) {
    const elevation = band.value;
    const isIndex = Math.round(elevation / interval) % indexEvery === 0;
    const rings = [];

    for (const polygon of band.coordinates) {
      for (const ring of polygon) {
        const scaled = ring.map(([x, y]) => [(x - margin) * sx, (y - margin) * sy]);
        const reduced = simplify(scaled, tolerance);
        if (reduced.length < 4) continue;

        for (const run of clipPolyline(
          reduced,
          -bleedX,
          -bleedY,
          viewWidth + bleedX,
          viewHeight + bleedY,
        )) {
          const length = perimeter(run);
          if (length < minRingLength) continue;
          rings.push({ d: toPath(run, precision), points: run, length });
        }
      }
    }
    if (rings.length) levels.push({ elevation, isIndex, rings });
  }

  // Cotes : uniquement sur les courbes maîtresses, et une seule par courbe,
  // sur la plus longue — comme on le ferait à la main.
  const labels = [];
  if (label) {
    for (const level of levels) {
      if (!level.isIndex) continue;
      const candidates = level.rings
        .filter((r) => r.length > label.minRingLength)
        .sort((a, b) => b.length - a.length)
        .slice(0, label.perLevel);
      for (const ring of candidates) {
        const anchor = labelAnchor(ring.points, label.minSegment);
        if (!anchor) continue;
        const inset = label.inset;
        if (anchor.x < inset || anchor.x > viewWidth - inset) continue;
        if (anchor.y < inset || anchor.y > viewHeight - inset) continue;
        if (labels.some((l) => Math.hypot(l.x - anchor.x, l.y - anchor.y) < label.spacing)) continue;
        labels.push({ ...anchor, text: String(Math.round(level.elevation)) });
      }
    }
  }

  return { levels, labels, elevations, fieldWidth, fieldHeight };
}

/**
 * Exporte le champ d'altitudes, sous-échantillonné et quantifié sur un octet.
 * C'est ce qui permet à la barre d'état et au réticule d'afficher la cote
 * réelle du relief sous le curseur — la lecture est vraie, pas simulée, pour
 * environ 2 Ko.
 */
function encodeField({ elevations, fieldWidth, fieldHeight }, config, sampleWidth = 56) {
  const { gridWidth, gridHeight, margin, baseElevation, elevationSpan } = config;
  const sampleHeight = Math.max(2, Math.round((sampleWidth * gridHeight) / gridWidth));
  const bytes = new Uint8Array(sampleWidth * sampleHeight);

  for (let j = 0; j < sampleHeight; j++) {
    for (let i = 0; i < sampleWidth; i++) {
      // Position dans la fenêtre visible du champ (hors marge de débord).
      const gx = margin + Math.round((i / (sampleWidth - 1)) * (gridWidth - 1));
      const gy = margin + Math.round((j / (sampleHeight - 1)) * (gridHeight - 1));
      const z = elevations[Math.min(fieldHeight - 1, gy) * fieldWidth + Math.min(fieldWidth - 1, gx)];
      const t = (z - baseElevation) / elevationSpan;
      bytes[j * sampleWidth + i] = Math.max(0, Math.min(255, Math.round(t * 255)));
    }
  }

  return {
    w: sampleWidth,
    h: sampleHeight,
    zMin: baseElevation,
    zMax: baseElevation + elevationSpan,
    data: Buffer.from(bytes).toString('base64'),
  };
}

/* ------------------------------------------------------------------ rendu */

function renderSvg({ levels, labels }, config) {
  const { viewWidth, viewHeight, id, labelSize } = config;
  const parts = [];

  parts.push(
    `<svg class="terrain" viewBox="0 0 ${viewWidth} ${viewHeight}" ` +
      `preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" ` +
      `xmlns="http://www.w3.org/2000/svg" data-terrain="${id}">`,
  );

  levels.forEach((level, index) => {
    const cls = level.isIndex ? 'terrain__level terrain__level--index' : 'terrain__level';
    parts.push(
      `<g class="${cls}" style="--level:${index}" data-elevation="${Math.round(level.elevation)}">`,
    );
    for (const ring of level.rings) {
      parts.push(`<path pathLength="1" d="${ring.d}"/>`);
    }
    parts.push('</g>');
  });

  if (labels.length) {
    parts.push(`<g class="terrain__cotes" font-size="${labelSize}">`);
    for (const l of labels) {
      parts.push(
        `<text x="${round(l.x)}" y="${round(l.y)}" ` +
          `transform="rotate(${round(l.angle)} ${round(l.x)} ${round(l.y)})" ` +
          `text-anchor="middle" dominant-baseline="middle" paint-order="stroke fill">${l.text}</text>`,
      );
    }
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('');
}

/* --------------------------------------------------------------- terrains */

const TERRAINS = [
  {
    // Relief principal de la page d'accueil : dense, avec cotes lisibles.
    id: 'hero',
    file: 'terrain-hero.svg',
    exportField: 'terrain-field.js',
    gridWidth: 200,
    gridHeight: 130,
    margin: 16,
    viewWidth: 1600,
    viewHeight: 1040,
    seed: 20260804,
    noiseScale: 46,
    reliefOptions: { octaves: 5, ridgeFrom: 2, lacunarity: 2.05, gain: 0.52 },
    interval: 5,
    indexEvery: 5,
    baseElevation: 0,
    elevationSpan: 185,
    tolerance: 2.9,
    precision: 0,
    minRingLength: 240,
    labelSize: 15,
    label: { perLevel: 4, minRingLength: 300, minSegment: 24, spacing: 165, inset: 70 },
  },
  {
    // Bandeau discret réutilisé en fond de section : moins de lignes, pas de cotes.
    id: 'band',
    file: 'terrain-band.svg',
    gridWidth: 170,
    gridHeight: 64,
    margin: 14,
    viewWidth: 1600,
    viewHeight: 600,
    seed: 76165, // décret n° 76-165
    noiseScale: 34,
    reliefOptions: { octaves: 4, ridgeFrom: 2, lacunarity: 2.1, gain: 0.5 },
    interval: 10,
    indexEvery: 4,
    baseElevation: 0,
    elevationSpan: 210,
    tolerance: 3.4,
    precision: 0,
    minRingLength: 300,
    labelSize: 15,
    label: null,
  },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const config of TERRAINS) {
  const data = buildContours(config);
  const svg = renderSvg(data, config);
  writeFileSync(resolve(OUT_DIR, config.file), svg);

  const paths = data.levels.reduce((n, l) => n + l.rings.length, 0);
  const size = (Buffer.byteLength(svg) / 1024).toFixed(1);
  console.log(
    `  ${config.file.padEnd(20)} ${String(data.levels.length).padStart(3)} courbes · ` +
      `${String(paths).padStart(3)} tracés · ${String(data.labels.length).padStart(2)} cotes · ${size} Ko`,
  );

  if (config.exportField) {
    const field = encodeField(data, config);
    const module =
      '// Généré par scripts/generate-terrain.mjs — ne pas modifier à la main.\n' +
      `export default ${JSON.stringify(field)};\n`;
    writeFileSync(resolve(OUT_DIR, config.exportField), module);
    console.log(
      `  ${config.exportField.padEnd(20)} champ ${field.w}×${field.h} · ` +
        `${(Buffer.byteLength(module) / 1024).toFixed(1)} Ko`,
    );
  }
}
