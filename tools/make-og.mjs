/**
 * Produit public/og.jpg (1200 × 630) à partir de tools/og-source.html.
 * Le serveur de développement doit tourner : c'est lui qui résout les
 * inclusions et sert les polices et la feuille de style du site, pour que
 * l'image de partage utilise exactement la même typographie que les pages.
 *
 *   npm run dev        (dans un terminal)
 *   node tools/make-og.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:5199/Topographie/tools/og-source.html';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
// En JPEG : les milliers de segments de courbes gonflent inutilement un PNG,
// et l'image n'est lue que par les aperçus des réseaux sociaux.
await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 82 });
await browser.close();

console.log('public/og.jpg écrit');
