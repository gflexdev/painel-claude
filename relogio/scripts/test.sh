#!/usr/bin/env bash
# Roda os testes (:test) da lógica pura no simulador. Não precisa do token: sem constantes, usa umas de mentira.
# Uso: relogio/scripts/test.sh [fr165|fr165m]   (padrão: fr165)
set -euo pipefail
DEVICE="${1:-${DEVICE:-fr165}}"
source "$(dirname "$0")/sdk-env.sh"

if [[ ! -f "$SEGREDOS" ]]; then
    mkdir -p "$(dirname "$SEGREDOS")"
    printf '%s\n' '// Constantes de mentira, só para os testes. A build de verdade regrava (scripts/build.sh).' \
        'import Toybox.Lang;' 'module Segredos {' \
        '    const URL as String = "https://painel.invalid";' \
        '    const TOKEN as String = "sem-token";' '}' > "$SEGREDOS"
fi

TEST_PRG="$APP_DIR/bin/PainelClaude-$DEVICE-test.prg"
mkdir -p "$APP_DIR/bin"
"$SDK_BIN/monkeyc" \
    --jungles "$APP_DIR/monkey.jungle" \
    --device "$DEVICE" \
    --output "$TEST_PRG" \
    --private-key "$DEVELOPER_KEY" \
    --unit-test \
    --warn

"$(dirname "$0")/abrir-simulador.sh"
"$SDK_BIN/monkeydo" "$TEST_PRG" "$DEVICE" -t
