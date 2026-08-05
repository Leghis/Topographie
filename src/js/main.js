import '../styles/main.css';

import { initNav } from './nav.js';
import { initReveal } from './reveal.js';

initNav();
initReveal();

// Les lectures géodésiques n'existent que sur les pages qui portent un relief.
// Leur code — et le champ d'altitudes qui va avec — n'est donc chargé que là,
// et seulement une fois la page interactive.
if (document.querySelector('[data-geo-status], [data-reticle]')) {
  const charger = () =>
    import('./geo.js').then(({ initBarreEtat, initReticule }) => {
      initBarreEtat();
      initReticule();
    });

  if ('requestIdleCallback' in window) requestIdleCallback(charger, { timeout: 1200 });
  else setTimeout(charger, 200);
}
