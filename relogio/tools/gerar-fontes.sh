#!/usr/bin/env bash
# Baixa as mesmas fontes do mostrador (Space Grotesk e JetBrains Mono, OFL 1.1) e gera as do relógio
# (resources/fonts/*.fnt e *.png). Precisa do uv (usa o Pillow só durante a geração).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -fsSL -o "$TMP/SpaceGrotesk-Bold.ttf" \
  https://raw.githubusercontent.com/floriankarsten/space-grotesk/master/fonts/ttf/static/SpaceGrotesk-Bold.ttf
curl -fsSL -o "$TMP/JetBrainsMono-Regular.ttf" \
  https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Regular.ttf
curl -fsSL -o "$TMP/JetBrainsMono-SemiBold.ttf" \
  https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-SemiBold.ttf

uv run --quiet --with pillow python tools/gerar-fontes.py "$TMP"
