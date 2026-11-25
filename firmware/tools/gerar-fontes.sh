#!/usr/bin/env bash
# Gera as fontes LVGL (src/fonts/*.c) a partir das mesmas fontes da versão web:
# Space Grotesk (títulos) e JetBrains Mono (texto). As duas são OFL 1.1 (ver src/fonts/LICENCAS.md).
# Precisa de Node (usa lv_font_conv pelo npx). Só precisa rodar de novo se mudar tamanho ou faixa.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=src/fonts
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -fsSL -o "$TMP/grotesk-bold.ttf" \
  https://raw.githubusercontent.com/floriankarsten/space-grotesk/master/fonts/ttf/static/SpaceGrotesk-Bold.ttf
curl -fsSL -o "$TMP/mono-regular.ttf" \
  https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Regular.ttf
curl -fsSL -o "$TMP/mono-semibold.ttf" \
  https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-SemiBold.ttf

# ASCII + Latin-1 (acentos do português) + pontuação tipográfica comum em nomes e prompts.
RANGE="0x20-0x7E,0xA0-0xFF,0x2013-0x2014,0x2018-0x201D,0x2022,0x2026,0x2039-0x203A"

# Números grandes do mostrador redondo: só algarismos e o que aparece junto deles.
DIGITS="0x25,0x2C-0x2E,0x30-0x3A,0x2014"

gen() { # nome arquivo tamanho [faixa]
  npx --yes lv_font_conv@1.5.3 --no-compress --no-prefilter --bpp 4 --format lvgl \
    --lv-include lvgl.h --lv-font-name "$1" --size "$3" --font "$TMP/$2" -r "${4:-$RANGE}" \
    -o "$OUT/$1.c"
}

gen font_mono_12 mono-regular.ttf 12
gen font_mono_14 mono-regular.ttf 14
gen font_mono_16 mono-semibold.ttf 16
gen font_disp_15 grotesk-bold.ttf 15
gen font_disp_18 grotesk-bold.ttf 18
gen font_disp_24 grotesk-bold.ttf 24
gen font_disp_32 grotesk-bold.ttf 32
gen font_num_96 grotesk-bold.ttf 96 "$DIGITS"
ls -la "$OUT"
