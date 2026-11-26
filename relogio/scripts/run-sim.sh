#!/usr/bin/env bash
# Compila e carrega o app no simulador, que fala com o painel de verdade pelo ts.net.
# Uso: relogio/scripts/run-sim.sh [fr165|fr165m]   (padrão: fr165)
set -euo pipefail
DEVICE="${1:-${DEVICE:-fr165}}"
source "$(dirname "$0")/sdk-env.sh"

"$(dirname "$0")/build.sh" "$DEVICE"
"$(dirname "$0")/abrir-simulador.sh"
"$SDK_BIN/monkeydo" "$PRG" "$DEVICE"
