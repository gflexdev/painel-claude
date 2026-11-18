#!/bin/sh
# Status line do Painel Claude: repassa o JSON ao painel (é ele que traz o uso do plano) e mostra a
# status line que a pessoa já tinha. Sem uma, mostra só o nome do modelo.
DIR=$(cd "$(dirname "$0")" && pwd)
CONF="${PAINEL_DIR:-$HOME/.config/painel-claude}"
input=$(cat)

printf '%s' "$input" | "$DIR/enviar-uso.sh" >/dev/null 2>&1 &

if [ -s "$CONF/statusline-original.cmd" ]; then
  printf '%s' "$input" | sh -c "$(cat "$CONF/statusline-original.cmd")"
else
  printf '%s' "$input" | sed -n 's/.*"display_name" *: *"\([^"]*\)".*/\1/p' | head -n 1
fi
