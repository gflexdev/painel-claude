#!/usr/bin/env bash
# Abre o simulador do Connect IQ, se ainda não estiver aberto, e espera ele subir.
set -euo pipefail
source "$(dirname "$0")/sdk-env.sh"
SIM_STARTUP_SECONDS=5

if ! pgrep -qf "ConnectIQ.app/Contents/MacOS/simulator"; then
    "$SDK_BIN/connectiq" &
    sleep "$SIM_STARTUP_SECONDS"
fi
