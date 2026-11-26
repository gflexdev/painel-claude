#!/usr/bin/env bash
# Descobre o SDK marcado como "Current" no SDK Manager e exporta os caminhos usados pelos outros scripts.
set -euo pipefail

CIQ_HOME="$HOME/Library/Application Support/Garmin/ConnectIQ"
CURRENT_CFG="$CIQ_HOME/current-sdk.cfg"

if [[ ! -f "$CURRENT_CFG" ]]; then
    echo "SDK do Connect IQ não encontrado. Abra o SDK Manager, baixe um SDK e marque-o como Current." >&2
    exit 1
fi

SDK_DIR="$(tr -d '\r\n' < "$CURRENT_CFG")"
export SDK_BIN="${SDK_DIR%/}/bin"
export DEVELOPER_KEY="${DEVELOPER_KEY:-$HOME/.garmin-ciq/developer_key.der}"
export DEVICE="${DEVICE:-fr165}"

if [[ ! -f "$DEVELOPER_KEY" ]]; then
    echo "Chave de desenvolvedor não encontrada em $DEVELOPER_KEY (veja relogio/README.md)." >&2
    exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export APP_DIR
export REPO_DIR="$(cd "$APP_DIR/.." && pwd)"
export SEGREDOS="$APP_DIR/gerado/Segredos.mc"
export PRG="$APP_DIR/bin/PainelClaude-$DEVICE.prg"
