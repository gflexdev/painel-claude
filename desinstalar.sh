#!/bin/bash
# Tira o Painel Claude deste Mac: hooks, status line (volta a sua de antes) e o serviço.
#   bash desinstalar.sh           mantém o token e o histórico em ~/.config/painel-claude
#   bash desinstalar.sh --tudo    apaga também o app copiado e ~/.config/painel-claude
set -euo pipefail

APP="${PAINEL_APP_DIR:-$HOME/.local/share/painel-claude/app}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[[ -f "$APP/scripts/uninstall.js" ]] || APP="$HERE"

node "$APP/scripts/uninstall.js"

if [[ " $* " == *" --tudo "* ]]; then
  rm -rf "$HOME/.local/share/painel-claude" "$HOME/.config/painel-claude"
  echo "✔ app e dados apagados"
fi
echo "Se você ligou o HTTPS pelo Tailscale e não usa para mais nada: tailscale serve --https=443 off"
echo "O widget, se instalado, sai apagando ~/Applications/Painel Claude.app."
