import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import partials from './plugins/vite-plugin-partials.mjs';

const root = process.cwd();
const page = (name) => resolve(root, `${name}.html`);

// Publié sur GitHub Pages sous /Topographie/. Un nom de domaine propre
// n'aurait qu'à repasser cette valeur à '/'.
const BASE = '/Topographie/';

export default defineConfig({
  base: BASE,
  appType: 'mpa',

  plugins: [
    partials({
      root,
      globals: {
        annee: String(new Date().getFullYear()),
      },
    }),
  ],

  build: {
    target: 'es2022',
    cssTarget: 'chrome100',
    assetsInlineLimit: 2048,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        index: page('index'),
        services: page('services'),
        methode: page('methode'),
        terrains: page('terrains'),
        materiel: page('materiel'),
        contact: page('contact'),
        notFound: page('404'),
      },
    },
  },

  server: { open: false },
});
