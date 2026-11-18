#!/bin/sh
# Repassa ao painel o JSON que o Claude Code manda à status line (o painel só lê `rate_limits`).
# No máximo uma vez por minuto, em segundo plano e com timeout curto: nunca atrasa a status line.
STAMP="${TMPDIR:-/tmp}/painel-claude-uso.stamp"
if [ -n "$(find "$STAMP" -mmin -1 2>/dev/null)" ]; then
  cat >/dev/null
  exit 0
fi
touch "$STAMP"
curl -s -m 1 -H 'Content-Type: application/json' --data-binary @- \
  "http://127.0.0.1:${PAINEL_PORT:-7777}/usage" >/dev/null 2>&1
exit 0
