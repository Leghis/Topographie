#!/usr/bin/env bash
# Sous-ensemble des polices au strict nécessaire : français + signes techniques
# (degrés, exposants, flèches, tolérances, espaces insécables typographiques).
#
# À relancer uniquement si le jeu de caractères du site change.
# Les .woff2 produits sont versionnés — le build n'a donc besoin ni de Python
# ni de fontTools.
#
# Prérequis : python3 -m pip install fonttools brotli
set -euo pipefail
cd "$(dirname "$0")/.."

# Latin de base + toutes les diacritiques du français + ligatures Œ/œ/Æ/æ,
# ponctuation typographique française (guillemets, tiret cadratin, espace fine
# insécable U+202F) et symboles métier (° ² ³ ± × ≈ ≤ ≥ ⌀ → ↓ ‰ № €).
UNICODES="U+0020-007E,U+00A0,U+00A9,U+00AB,U+00BB,U+00B0,U+00B1,U+00B2,U+00B3,U+00B7,U+00D7,\
U+00C0,U+00C2,U+00C6-00CB,U+00CE,U+00CF,U+00D4,U+00D9,U+00DB,U+00DC,\
U+00E0,U+00E2,U+00E6-00EB,U+00EE,U+00EF,U+00F4,U+00F9,U+00FB,U+00FC,U+00FF,\
U+0152,U+0153,U+0178,\
U+2010-2014,U+2018,U+2019,U+201C,U+201D,U+2020,U+2022,U+2026,U+202F,U+2030,\
U+20AC,U+2116,U+2190,U+2192,U+2193,U+2212,U+2248,U+2264,U+2265,U+2300"

echo "→ Archivo Variable (axes wght + wdth conservés)"
python3 -m fontTools.subset \
  node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2 \
  --unicodes="$UNICODES" \
  --layout-features='kern,liga,calt,tnum,frac,ss01' \
  --flavor=woff2 \
  --output-file=public/fonts/archivo-var.woff2

echo "→ IBM Plex Mono 400"
python3 -m fontTools.subset \
  node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2 \
  --unicodes="$UNICODES" \
  --layout-features='kern,liga,calt' \
  --flavor=woff2 \
  --output-file=public/fonts/plex-mono.woff2

ls -l public/fonts/
