/**
 * Lecture du modèle numérique de terrain affiché en fond de page.
 *
 * Le champ d'altitudes est produit au build en même temps que les courbes de
 * niveau : la cote annoncée par la barre d'état et par le réticule est donc
 * bien celle du relief dessiné sous le curseur, pas un nombre décoratif.
 *
 * Le repère est calé sur Douala en WGS 84 / UTM zone 32N (EPSG:32632) :
 * le centre du relief tombe sur E 585 238 / N 447 816, position réelle du
 * centre-ville.
 */
import field from '../generated/terrain-field.js';

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 1040;

/** Emprise au sol du relief : 4 000 m sur 2 600 m. */
const METRES_PAR_UNITE = 2.5;

const CENTRE_DOUALA = { e: 585238, n: 447816 };
const ORIGINE = {
  e: CENTRE_DOUALA.e - (VIEW_WIDTH / 2) * METRES_PAR_UNITE,
  n: CENTRE_DOUALA.n + (VIEW_HEIGHT / 2) * METRES_PAR_UNITE,
};

const octets = Uint8Array.from(atob(field.data), (c) => c.charCodeAt(0));
const borne = (v, min, max) => (v < min ? min : v > max ? max : v);

/** Altitude en mètres au point (u, v) normalisé sur le relief. Interpolation bilinéaire. */
export function altitudeEn(u, v) {
  const x = borne(u, 0, 1) * (field.w - 1);
  const y = borne(v, 0, 1) * (field.h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.w - 1, x0 + 1);
  const y1 = Math.min(field.h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const lire = (ix, iy) => octets[iy * field.w + ix];

  const haut = lire(x0, y0) * (1 - fx) + lire(x1, y0) * fx;
  const bas = lire(x0, y1) * (1 - fx) + lire(x1, y1) * fx;
  const t = (haut * (1 - fy) + bas * fy) / 255;

  return field.zMin + t * (field.zMax - field.zMin);
}

/** Coordonnées planes UTM 32N au point (u, v) normalisé sur le relief. */
export function coordonneesEn(u, v) {
  return {
    e: ORIGINE.e + borne(u, 0, 1) * VIEW_WIDTH * METRES_PAR_UNITE,
    n: ORIGINE.n - borne(v, 0, 1) * VIEW_HEIGHT * METRES_PAR_UNITE,
    z: altitudeEn(u, v),
  };
}

/**
 * Convertit un point de l'écran en position normalisée sur le relief, en
 * tenant compte du recadrage `preserveAspectRatio="slice"` : sans cela le
 * réticule annoncerait des coordonnées décalées par rapport aux courbes
 * réellement visibles.
 */
export function pointVersRelief(x, y, rect) {
  const echelle = Math.max(rect.width / VIEW_WIDTH, rect.height / VIEW_HEIGHT);
  const largeur = VIEW_WIDTH * echelle;
  const hauteur = VIEW_HEIGHT * echelle;
  return {
    u: (x - rect.left - (rect.width - largeur) / 2) / largeur,
    v: (y - rect.top - (rect.height - hauteur) / 2) / hauteur,
  };
}

/** Séparateur de milliers à la française : espace fine insécable. */
export function formaterMetres(valeur, decimales = 0) {
  const arrondi = valeur.toFixed(decimales);
  const [entier, fraction] = arrondi.split('.');
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return fraction ? `${groupe},${fraction}` : groupe;
}
