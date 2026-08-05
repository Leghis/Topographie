/**
 * Apparition à l'entrée dans le champ de vision.
 *
 * En amélioration progressive stricte : le contenu est visible par défaut, et
 * c'est le script qui, une fois sûr de pouvoir animer, arme le mécanisme en
 * posant un drapeau sur la racine. Sans JavaScript, avec un JavaScript en
 * erreur ou sur un navigateur ancien, la page reste entièrement lisible —
 * le contraire serait inacceptable sur les connexions et les terminaux
 * auxquels ce site s'adresse.
 *
 * L'observation est levée après le premier passage : rejouer l'animation à
 * chaque défilement transformerait la page en diaporama.
 */
export function initReveal() {
  const cibles = document.querySelectorAll('.reveal');
  if (!cibles.length) return;

  if (
    !('IntersectionObserver' in window) ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  document.documentElement.setAttribute('data-reveal', '');

  const observateur = new IntersectionObserver(
    (entrees) => {
      for (const entree of entrees) {
        if (!entree.isIntersecting) continue;
        entree.target.setAttribute('data-shown', '');
        observateur.unobserve(entree.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
  );

  cibles.forEach((el) => observateur.observe(el));
}
