/**
 * Audit des interactions : clavier, menu mobile, mouvement réduit,
 * apparition au défilement, réticule et barre d'état géodésique.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5199/Topographie/';
const browser = await chromium.launch();

const resultats = [];
const verifier = (nom, ok, detail = '') => {
  resultats.push({ nom, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${nom}${detail ? ' — ' + detail : ''}`);
};

/* ------------------------------------------------ apparition au défilement */
{
  const page = await (await browser.newContext()).newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const arme = await page.evaluate(() => document.documentElement.hasAttribute('data-reveal'));
  verifier('le mécanisme d’apparition est armé par le script', arme);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  const [vus, total] = await page.evaluate(() => [
    document.querySelectorAll('.reveal[data-shown]').length,
    document.querySelectorAll('.reveal').length,
  ]);
  verifier('toutes les sections apparaissent après défilement', vus === total, `${vus}/${total}`);
  await page.close();
}

/* --------------------------------------- contenu visible sans JavaScript */
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const opacites = await page.evaluate(() =>
    [...document.querySelectorAll('.reveal')].map((el) => getComputedStyle(el).opacity),
  );
  verifier(
    'sans JavaScript, tout le contenu reste visible',
    opacites.length > 0 && opacites.every((o) => o === '1'),
    `${opacites.filter((o) => o === '1').length}/${opacites.length} à opacité 1`,
  );
  await ctx.close();
}

/* ------------------------------------------------ mouvement réduit */
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const etat = await page.evaluate(() => ({
    armeReveal: document.documentElement.hasAttribute('data-reveal'),
    reticuleAffiche: getComputedStyle(document.querySelector('.reticle')).display,
    opaciteReveal: getComputedStyle(document.querySelector('.reveal')).opacity,
    animationCourbe: getComputedStyle(document.querySelector('.terrain__level')).animationName,
  }));
  verifier('mouvement réduit : pas de masquage des sections', !etat.armeReveal && etat.opaciteReveal === '1');
  verifier('mouvement réduit : réticule désactivé', etat.reticuleAffiche === 'none', etat.reticuleAffiche);
  verifier(
    'mouvement réduit : tracé des courbes désactivé',
    etat.animationCourbe === 'none',
    etat.animationCourbe,
  );
  await ctx.close();
}

/* ------------------------------------------------------- menu mobile */
{
  const page = await (await browser.newContext()).newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const toggle = page.locator('[data-nav-toggle]');
  const panel = page.locator('[data-nav-panel]');

  verifier('menu fermé au chargement', (await toggle.getAttribute('aria-expanded')) === 'false');

  await toggle.click();
  await page.waitForTimeout(150);
  verifier('menu ouvert au clic', (await toggle.getAttribute('aria-expanded')) === 'true' && (await panel.isVisible()));
  verifier(
    'le focus entre dans le panneau',
    await page.evaluate(() => document.querySelector('[data-nav-panel]').contains(document.activeElement)),
  );
  verifier(
    'le fond ne défile plus derrière le panneau',
    (await page.evaluate(() => document.documentElement.style.overflow)) === 'hidden',
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  verifier('Échap referme le menu', (await toggle.getAttribute('aria-expanded')) === 'false');
  verifier(
    'le focus revient sur le bouton',
    await page.evaluate(() => document.activeElement === document.querySelector('[data-nav-toggle]')),
  );
  verifier(
    'le défilement du fond est rendu',
    (await page.evaluate(() => document.documentElement.style.overflow)) === '',
  );

  // Passage en navigation large pendant que le menu est ouvert.
  await toggle.click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  verifier(
    'l’élargissement referme le menu et rend le défilement',
    (await page.evaluate(() => document.documentElement.style.overflow)) === '',
  );
  await page.close();
}

/* ------------------------------------------------------ parcours clavier */
{
  const page = await (await browser.newContext()).newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.keyboard.press('Tab');
  await page.waitForTimeout(300); // la remontée du lien est une transition
  const premier = await page.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    return {
      cls: el.className,
      txt: el.textContent.trim().slice(0, 30),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
    };
  });
  verifier('le premier Tab atteint le lien d’évitement', premier.cls.includes('skip-link'), premier.txt);
  verifier(
    'le lien d’évitement devient visible au focus',
    premier.top >= 0 && premier.bottom > 0,
    `top ${premier.top}, bottom ${premier.bottom}`,
  );

  const sansContour = await page.evaluate(() => {
    const manquants = [];
    for (const el of document.querySelectorAll('a[href], button')) {
      // Un élément non rendu à cette largeur ne peut pas recevoir le focus :
      // le tester n'apprendrait rien.
      if (!el.getClientRects().length) continue;
      el.focus();
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      if (!outline) manquants.push(el.textContent.trim().slice(0, 24) || el.className);
    }
    return manquants;
  });
  verifier('tous les éléments focusables ont un contour visible', sansContour.length === 0, sansContour.join(' | '));
  await page.close();
}

/* -------------------------------- barre d’état géodésique et réticule */
{
  const page = await (await browser.newContext()).newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400); // le module géo est chargé en différé

  // Le sélecteur doit viser la barre d'état : le réticule porte les mêmes
  // attributs, et il est plus haut dans le document.
  const lireBarre = () =>
    page.evaluate(() =>
      ['e', 'n', 'z'].map((k) => document.querySelector(`.geo-status [data-geo="${k}"]`).textContent).join(' | '),
    );

  const avant = await lireBarre();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
  await page.waitForTimeout(300);
  const apres = await lireBarre();
  verifier('la barre d’état suit le défilement', avant !== apres, `${avant}  →  ${apres}`);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(400, 400);
  await page.waitForTimeout(200);
  const reticule = await page.evaluate(() => {
    const r = document.querySelector('[data-reticle]');
    return { actif: r.hasAttribute('data-active'), rx: r.style.getPropertyValue('--rx') };
  });
  verifier('le réticule suit le pointeur', reticule.actif && reticule.rx !== '', JSON.stringify(reticule));
  await page.close();
}

await browser.close();

const echecs = resultats.filter((r) => !r.ok);
console.log(`\n${echecs.length === 0 ? `✓ ${resultats.length} contrôles passés` : `✗ ${echecs.length} échec(s) sur ${resultats.length}`}`);
process.exit(echecs.length === 0 ? 0 : 1);
