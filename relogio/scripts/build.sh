#!/usr/bin/env bash
# Compila o app com o endereço do painel e o token do relógio dentro (ADR 0002).
# Uso: relogio/scripts/build.sh [fr165|fr165m]   (padrão: fr165)
# PAINEL_URL=https://… troca o endereço (padrão: o do Mac na tailnet).
set -euo pipefail
DEVICE="${1:-${DEVICE:-fr165}}"
source "$(dirname "$0")/sdk-env.sh"

# Sempre regrava as constantes: o token pode ter sido revogado e o endereço trocado.
node "$REPO_DIR/scripts/relogio.js" segredos "$SEGREDOS" ${PAINEL_URL:+--url "$PAINEL_URL"}

mkdir -p "$APP_DIR/bin"
"$SDK_BIN/monkeyc" \
    --jungles "$APP_DIR/monkey.jungle" \
    --device "$DEVICE" \
    --output "$PRG" \
    --private-key "$DEVELOPER_KEY" \
    --warn

echo "Gerado: $PRG"
