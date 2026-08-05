/**
 * Audit responsive + accessibilité automatisé.
 * Vérifie sur chaque page et chaque largeur :
 *   - débordement horizontal du document
 *   - éléments individuels qui dépassent la fenêtre
 *   - cibles tactiles sous 44 px
 *   - erreurs de console
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5199/Topographie/';
const PAGES = ['', 'services.html', 'methode.html', 'terrains.html', 'materiel.html', 'contact.html', '404.html'];
const WIDTHS = [320, 360, 375, 414, 480, 640, 768, 834, 1024, 1280, 1440, 1920];

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();

let problemes = 0;
const consoleErrors = new Map();

page.on('console', (msg) => {
  if (msg.type() !== 'error' && msg.type() !== 'warning') return;
  const key = `${page.url()} :: ${msg.text()}`;
  consoleErrors.set(key, (consoleErrors.get(key) || 0) + 1);
});
page.on('pageerror', (err) => {
  const key = `${page.url()} :: PAGEERROR ${err.message}`;
  consoleErrors.set(key, (consoleErrors.get(key) || 0) + 1);
});

for (const p of PAGES) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + p, { waitUntil: 'networkidle' });

    const res = await page.evaluate(() => {
      const de = document.documentElement;
      const vw = de.clientWidth;
      // Un élément qui dépasse mais qu'un ancêtre rogne ne cause aucun
      // débordement visible : c'est exactement le cas des tracés de terrain.
      const estRogne = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p);
          if (/hidden|clip|auto|scroll/.test(o.overflowX) || /hidden|clip/.test(o.overflow)) return true;
        }
        return false;
      };

      const debordants = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.ownerSVGElement) continue; // contenu interne d'un SVG
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (estRogne(el)) continue;
        if (r.right > vw + 1 || r.left < -1) {
          debordants.push({
            sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
            left: Math.round(r.left),
            right: Math.round(r.right),
          });
        }
      }

      const petitesCibles = [];
      for (const el of document.querySelectorAll('a[href], button')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        // Les liens en ligne dans un paragraphe suivent la ligne de texte :
        // la règle des 44 px vise les commandes, pas le texte courant.
        if (el.closest('p, li') && cs.display.includes('inline')) continue;
        if (r.height < 44 || r.width < 24) {
          petitesCibles.push({ txt: (el.textContent || '').trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) });
        }
      }

      return {
        scrollW: de.scrollWidth,
        clientW: vw,
        debordants: debordants.slice(0, 6),
        petitesCibles: petitesCibles.slice(0, 6),
      };
    });

    const nom = (p || 'index') + ' @ ' + w;
    const lignes = [];
    if (res.scrollW > res.clientW + 1) lignes.push(`  scrollWidth ${res.scrollW} > ${res.clientW}`);
    for (const d of res.debordants) lignes.push(`  déborde: ${d.sel} [${d.left} → ${d.right}]`);
    for (const c of res.petitesCibles) lignes.push(`  cible ${c.w}×${c.h} « ${c.txt} »`);

    if (lignes.length) {
      problemes += lignes.length;
      console.log(`✗ ${nom}`);
      console.log(lignes.join('\n'));
    }
  }
}

console.log(`\n--- console ---`);
if (!consoleErrors.size) console.log('  aucune erreur ni avertissement');
for (const [k, n] of consoleErrors) console.log(`  ×${n} ${k}`);

console.log(`\n${problemes === 0 ? '✓ aucun problème de mise en page' : `✗ ${problemes} problème(s)`}`);
await browser.close();
