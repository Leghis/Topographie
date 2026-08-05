/** Menu mobile : ouverture, piège de focus, fermeture au clavier. */

const FOCUSABLES = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const panel = document.querySelector('[data-nav-panel]');
  if (!toggle || !panel) return;

  const media = window.matchMedia('(min-width: 60rem)');
  let ouvert = false;

  const definirEtat = (etat) => {
    ouvert = etat;
    toggle.setAttribute('aria-expanded', String(etat));
    panel.hidden = !etat;
    // Le fond ne doit pas défiler derrière le panneau plein écran.
    document.documentElement.style.overflow = etat ? 'hidden' : '';
    toggle.querySelector('[data-nav-label]').textContent = etat ? 'Fermer' : 'Menu';
  };

  toggle.addEventListener('click', () => {
    definirEtat(!ouvert);
    if (ouvert) panel.querySelector(FOCUSABLES)?.focus();
    else toggle.focus();
  });

  panel.addEventListener('click', (event) => {
    if (event.target.closest('a')) definirEtat(false);
  });

  document.addEventListener('keydown', (event) => {
    if (!ouvert) return;

    if (event.key === 'Escape') {
      definirEtat(false);
      toggle.focus();
      return;
    }

    if (event.key !== 'Tab') return;

    // Le focus reste dans le panneau tant qu'il est ouvert.
    const cibles = [toggle, ...panel.querySelectorAll(FOCUSABLES)];
    const premier = cibles[0];
    const dernier = cibles[cibles.length - 1];

    if (event.shiftKey && document.activeElement === premier) {
      event.preventDefault();
      dernier.focus();
    } else if (!event.shiftKey && document.activeElement === dernier) {
      event.preventDefault();
      premier.focus();
    }
  });

  // Passage en navigation large pendant que le panneau est ouvert : il n'a
  // plus lieu d'être, et laisser `overflow: hidden` bloquerait la page.
  media.addEventListener('change', (event) => {
    if (event.matches && ouvert) definirEtat(false);
  });

  definirEtat(false);
}
