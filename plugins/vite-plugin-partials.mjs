/**
 * Inclusions HTML résolues au build.
 *
 * Le site est un vrai multi-pages : sept fichiers HTML statiques, aucun routeur,
 * aucun JS de rendu. Il faut donc un moyen de partager l'en-tête, le pied de
 * page et les blocs récurrents sans les recopier sept fois — et d'inliner les
 * SVG de terrain dans le document plutôt que de les injecter en JS, ce qui
 * retarderait le LCP.
 *
 * Syntaxe :
 *   <!--@ partials/header.html -->
 *   <!--@ partials/cta.html {"titre": "Parlons de votre parcelle"} -->
 *   <!--@ src/generated/terrain-hero.svg -->
 *
 * Les jetons {{cle}} sont remplacés par les valeurs fournies ; ceux qui restent
 * sans valeur sont retirés, pour qu'une variable facultative ne fuite jamais
 * dans la page. Les inclusions sont récursives.
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const INCLUDE = /<!--@\s+([^\s]+?)\s*(\{[\s\S]*?\})?\s*-->/g;
const MAX_DEPTH = 8;

export default function partials({ root = process.cwd(), globals = {} } = {}) {
  let server;

  const expand = (html, vars, depth = 0) => {
    if (depth > MAX_DEPTH) {
      throw new Error('vite-plugin-partials : inclusions imbriquées trop profondes (boucle ?)');
    }

    const out = html.replace(INCLUDE, (_match, file, json) => {
      const path = resolve(root, file);
      let source;
      try {
        source = readFileSync(path, 'utf8');
      } catch {
        throw new Error(`vite-plugin-partials : fichier introuvable — ${file}`);
      }
      const locals = json ? { ...vars, ...JSON.parse(json) } : vars;
      return expand(source, locals, depth + 1);
    });

    return out.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_m, key) =>
      vars[key] === undefined ? '' : String(vars[key]),
    );
  };

  return {
    name: 'partials',

    configureServer(devServer) {
      server = devServer;
      // Les partials ne font partie d'aucun graphe de modules : sans cela,
      // les modifier ne rafraîchirait rien en développement.
      server.watcher.add([resolve(root, 'src/partials'), resolve(root, 'src/generated')]);
      server.watcher.on('change', (file) => {
        if (file.includes('src/partials') || file.includes('src/generated')) {
          server.ws.send({ type: 'full-reload', path: '*' });
        }
      });
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const page = basename(ctx.filename).replace(/\.html$/, '');
        let out = expand(html, { ...globals, page });

        // L'onglet actif se déduit de la page en cours : une seule source de
        // vérité, et la bonne sémantique pour les lecteurs d'écran.
        out = out.replace(
          new RegExp(`(<a\\b[^>]*\\bdata-nav="${page}")`, 'g'),
          '$1 aria-current="page"',
        );

        return out;
      },
    },
  };
}
