#!/bin/sh
# Hook do Claude Code: repassa o evento (JSON no stdin) ao painel no próprio Mac.
# Nunca falha nem segura o Claude: timeout curto e saída sempre 0.
curl -s -m 1 -o /dev/null -X POST \
  -H 'Content-Type: application/json' \
  --data-binary @- \
  "http://127.0.0.1:${PAINEL_PORT:-7777}/hook" >/dev/null 2>&1
exit 0
