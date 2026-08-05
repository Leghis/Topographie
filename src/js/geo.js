/**
 * Les deux lectures géodésiques du site.
 *
 *  - la barre d'état, qui suit le défilement comme un cheminement du nord vers
 *    le sud du relief affiché ;
 *  - le réticule de visée, qui suit le pointeur et lit les coordonnées du point
 *    visé.
 *
 * Les deux interrogent le même modèle numérique de terrain (voir terrain.js),
 * donc affichent la même chose au même endroit.
 */
import { coordonneesEn, formaterMetres, pointVersRelief } from './terrain.js';

/* ------------------------------------------------------- barre d'état */

export function initBarreEtat() {
  const barre = document.querySelector('[data-geo-status]');
  if (!barre) return;

  const sortie = {
    e: barre.querySelector('[data-geo="e"]'),
    n: barre.querySelector('[data-geo="n"]'),
    z: barre.querySelector('[data-geo="z"]'),
  };
  if (!sortie.e || !sortie.n || !sortie.z) return;

  let planifie = false;

  const rafraichir = () => {
    planifie = false;
    const course = document.documentElement.scrollHeight - window.innerHeight;
    const avancement = course > 0 ? window.scrollY / course : 0;

    // Le défilement descend le relief : on marche vers le sud, en dérivant
    // légèrement vers l'est comme sur un cheminement réel.
    const v = avancement;
    const u = 0.5 + Math.sin(avancement * Math.PI * 1.5) * 0.28;

    const { e, n, z } = coordonneesEn(u, v);
    sortie.e.textContent = formaterMetres(e);
    sortie.n.textContent = formaterMetres(n);
    sortie.z.textContent = formaterMetres(z, 1);
  };

  const planifier = () => {
    if (planifie) return;
    planifie = true;
    requestAnimationFrame(rafraichir);
  };

  addEventListener('scroll', planifier, { passive: true });
  addEventListener('resize', planifier, { passive: true });
  rafraichir();
}

/* ---------------------------------------------------------- réticule */

export function initReticule() {
  const reticule = document.querySelector('[data-reticle]');
  const zone = reticule?.closest('[data-reticle-zone]');
  if (!reticule || !zone) return;

  // Sur écran tactile il n'y a pas de curseur à suivre : l'effet coûterait
  // sans rien apporter.
  if (!matchMedia('(pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const sortie = {
    e: reticule.querySelector('[data-geo="e"]'),
    n: reticule.querySelector('[data-geo="n"]'),
    z: reticule.querySelector('[data-geo="z"]'),
  };

  let x = 0;
  let y = 0;
  let planifie = false;
  let cadre = zone.getBoundingClientRect();

  const dessiner = () => {
    planifie = false;
    const { u, v } = pointVersRelief(x, y, cadre);
    const { e, n, z } = coordonneesEn(u, v);

    reticule.style.setProperty('--rx', `${(x - cadre.left).toFixed(1)}px`);
    reticule.style.setProperty('--ry', `${(y - cadre.top).toFixed(1)}px`);

    if (sortie.e) sortie.e.textContent = formaterMetres(e);
    if (sortie.n) sortie.n.textContent = formaterMetres(n);
    if (sortie.z) sortie.z.textContent = formaterMetres(z, 1);
  };

  zone.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      x = event.clientX;
      y = event.clientY;
      reticule.setAttribute('data-active', '');
      if (planifie) return;
      planifie = true;
      requestAnimationFrame(dessiner);
    },
    { passive: true },
  );

  zone.addEventListener('pointerleave', () => reticule.removeAttribute('data-active'));

  const remesurer = () => {
    cadre = zone.getBoundingClientRect();
  };
  addEventListener('resize', remesurer, { passive: true });
  addEventListener('scroll', remesurer, { passive: true });
}
