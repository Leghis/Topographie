# MLS TOPO SARL — site vitrine

Site de **MLS TOPO SARL**, cabinet de topographie et de géomatique établi à Douala (Cameroun),
intervenant sur l'ensemble du territoire.

En ligne : <https://leghis.github.io/Topographie/>

---

## Ce que c'est

Sept pages HTML statiques, aucun framework, aucun routeur, aucune dépendance expédiée au
navigateur. Construit avec Vite et du CSS écrit à la main.

| Page | Rôle |
|---|---|
| `index.html` | Accueil : les trois métiers, le protocole de bornage, la méthode de mesure |
| `services.html` | Les quinze prestations, réparties en trois pôles |
| `methode.html` | Procédure d'immatriculation, géodésie, réglementation du travail aérien |
| `terrains.html` | Vente de terrains, et les six vérifications faites avant mise en vente |
| `materiel.html` | Vente d'appareils topographiques |
| `contact.html` | Coordonnées et préparation de l'appel |
| `404.html` | Page d'erreur (servie par GitHub Pages) |

### Contact affiché sur le site

`+237 697 55 76 89` (appel et WhatsApp) et `+237 652 12 78 79`.
Ces numéros apparaissent dans `src/partials/header.html`, `footer.html`, `chrome.html`,
`cta.html` et dans `contact.html`.

---

## Le relief

Le fond du site est un **modèle numérique de terrain en courbes de niveau**, généré au build
par `scripts/generate-terrain.mjs` : bruit fractal à octaves en crête, distorsion du domaine,
extraction des isohypses par `d3-contour`, simplification de Douglas-Peucker, puis découpe au
cadre visible. Équidistance 5 m, courbes maîtresses tous les 25 m, cotes portées le long de la
courbe et orientées selon sa tangente.

Le script écrit aussi `src/generated/terrain-field.js` : le champ d'altitudes
sous-échantillonné et quantifié sur un octet (≈ 2,8 Ko). C'est lui qui permet à la barre d'état
et au réticule d'afficher la **cote réelle du relief sous le curseur** plutôt qu'un nombre
décoratif.

Le repère est calé sur Douala en WGS 84 / UTM zone 32N (EPSG:32632), centre du relief à
E 585 238 / N 447 816.

`d3-contour` est une dépendance de développement : rien n'en est expédié au navigateur.

---

## Développement

```bash
npm install
npm run dev      # http://localhost:5173/Topographie/
npm run build    # produit dist/
npm run preview
```

Le site est servi sous le préfixe `/Topographie/` (`base` dans `vite.config.js`), qui
correspond au chemin GitHub Pages. Avec un nom de domaine propre, il suffit de repasser cette
valeur à `'/'`.

### Régénérer les polices

Les `.woff2` de `public/fonts/` sont des sous-ensembles versionnés (français + signes
techniques) : le build n'a donc besoin ni de Python ni de fontTools. Pour les reconstruire
après un changement du jeu de caractères :

```bash
python3 -m pip install fonttools brotli
./scripts/subset-fonts.sh
```

### Régénérer l'image de partage

Nécessite que le serveur de développement tourne.

```bash
npm run og
```

---

## Audits

```bash
npm run audit
```

Enchaîne trois contrôles sur le serveur de développement :

- **`tools/audit.mjs`** — 7 pages × 12 largeurs (320 → 1920 px) : débordement horizontal,
  éléments hors cadre, cibles tactiles sous 44 px, erreurs de console.
- **`tools/audit-interaction.mjs`** — menu mobile (ouverture, piège de focus, `Échap`,
  restitution du défilement), parcours clavier, lien d'évitement, contour de focus,
  `prefers-reduced-motion`, lisibilité **sans JavaScript**, barre d'état et réticule.
- **`tools/audit-contraste.mjs`** — contraste WCAG 2.2 AA mesuré sur les couleurs **rendues**,
  chaque texte étant comparé au premier arrière-plan opaque au-dessus de lui.

---

## Structure

```
index.html …  404.html      les sept pages
vite.config.js               MPA : une entrée par page
plugins/
  vite-plugin-partials.mjs   inclusions <!--@ … --> résolues au build
scripts/
  generate-terrain.mjs       relief en courbes de niveau + champ d'altitudes
  subset-fonts.sh            sous-ensemble des polices
src/
  partials/                  en-tête, pied de page, chrome, marque, appels à l'action
  styles/                    tokens · base · layout · components · signature · pages
  js/                        nav · reveal · geo · terrain
  generated/                 produit par generate-terrain.mjs
public/                      polices, favicon, image de partage, robots, sitemap
tools/                       audits et fabrication de l'image de partage
```

Le CSS est organisé en couches (`@layer tokens, base, layout, components, pages`) déclarées
une fois dans `src/styles/main.css`. Aucune valeur visuelle n'est écrite en dur dans un
composant : tout dérive des jetons de `tokens.css`, dont les couleurs de texte portent en
commentaire leur ratio de contraste vérifié.

---

## Déploiement

Chaque poussée sur `main` déclenche `.github/workflows/deploy.yml`, qui construit le site et
le publie sur GitHub Pages. La source doit être réglée sur « GitHub Actions » dans les
paramètres Pages du dépôt.
