/**
 * Contrôle du contraste sur les pages rendues.
 *
 * On mesure la couleur calculée de chaque texte contre le premier arrière-plan
 * opaque rencontré en remontant l'arbre — c'est-à-dire ce que l'œil voit, et
 * non ce que le jeton annonce.
 *
 * Seuils WCAG 2.2 AA : 4,5:1 pour le texte courant, 3:1 à partir de 24 px,
 * ou de 18,66 px en gras.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5199/Topographie/';
const PAGES = ['', 'services.html', 'methode.html', 'terrains.html', 'materiel.html', 'contact.html', '404.html'];

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.setViewportSize({ width: 1280, height: 900 });

let echecs = 0;
const vus = new Set();

for (const p of PAGES) {
  await page.goto(BASE + p, { waitUntil: 'networkidle' });

  const resultats = await page.evaluate(() => {
    const lin = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    // Chromium rend le résultat d'un color-mix sous la forme
    // `color(srgb 0.94 0.90 0.86)`, en composantes 0–1 et non 0–255.
    const parse = (s) => {
      const n = (s.match(/[\d.]+/g) || []).map(Number);
      if (s.startsWith('color(')) return n.slice(0, 3).map((v) => v * 255);
      return n;
    };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };

    // Remonte jusqu'au premier fond réellement opaque.
    const fond = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] >= 0.95)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };

    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.getClientRects().length) continue;
      // Seuls les éléments porteurs de texte propre nous intéressent.
      const texte = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();
      if (!texte) continue;

      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.95) continue;
      const fg = parse(cs.color).slice(0, 3);
      const bg = fond(el);
      const r = ratio(fg, bg);

      const px = parseFloat(cs.fontSize);
      const gras = parseInt(cs.fontWeight, 10) >= 700 || parseFloat(cs.fontWeight) >= 700;
      const grandTexte = px >= 24 || (px >= 18.66 && gras);
      const seuil = grandTexte ? 3 : 4.5;

      if (r < seuil) {
        out.push({
          sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''),
          txt: texte.slice(0, 40),
          r: Math.round(r * 100) / 100,
          seuil,
          px: Math.round(px * 10) / 10,
          fg: cs.color,
        });
      }
    }
    return out;
  });

  for (const r of resultats) {
    const cle = `${r.sel}|${r.fg}|${r.r}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    echecs++;
    console.log(`✗ ${(p || 'index').padEnd(14)} ${r.r}:1 (seuil ${r.seuil}) ${r.px}px  ${r.sel}  « ${r.txt} »  ${r.fg}`);
  }
}

await browser.close();
console.log(echecs === 0 ? '\n✓ tous les textes rendus passent le seuil WCAG AA' : `\n✗ ${echecs} texte(s) sous le seuil`);
process.exit(echecs === 0 ? 0 : 1);
