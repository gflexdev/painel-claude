#!/usr/bin/env bash
# Captura a janela do simulador em PNG, sem pedir permissão de acessibilidade.
# Uso: relogio/scripts/screenshot-sim.sh [arquivo.png]   (padrão: relogio/bin/simulador.png)
# A captura mostra sessões de verdade: fica em bin/, fora do git.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-$APP_DIR/bin/simulador.png}"
SIM_PID="$(pgrep -f "ConnectIQ.app/Contents/MacOS/simulator" | head -1 || true)"

if [[ -z "$SIM_PID" ]]; then
    echo "Simulador não está aberto. Rode relogio/scripts/run-sim.sh antes." >&2
    exit 1
fi

# O ID da janela vem do CoreGraphics (sim-window-id.swift), compilado uma vez e reaproveitado.
SWIFT_SOURCE="$APP_DIR/scripts/sim-window-id.swift"
WINDOW_ID_TOOL="$APP_DIR/bin/.tools/sim-window-id"
if [[ ! -x "$WINDOW_ID_TOOL" || "$SWIFT_SOURCE" -nt "$WINDOW_ID_TOOL" ]]; then
    mkdir -p "$(dirname "$WINDOW_ID_TOOL")"
    swiftc -O "$SWIFT_SOURCE" -o "$WINDOW_ID_TOOL"
fi
WINDOW_ID="$("$WINDOW_ID_TOOL" "$SIM_PID")"

if [[ -z "$WINDOW_ID" ]]; then
    echo "Janela do simulador não encontrada (está minimizada?)." >&2
    exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
screencapture -x -o -l"$WINDOW_ID" "$OUTPUT"
echo "Captura salva em: $OUTPUT"
