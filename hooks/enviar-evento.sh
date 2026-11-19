#!/bin/sh
# Hook do Claude Code: repassa o evento (JSON no stdin) ao painel no próprio Mac.
# Lê o evento e devolve o controle na hora: o envio segue em segundo plano, com timeout curto.
# Assim o hook nunca segura o Claude, mesmo com o Mac ocupado ou o painel fora do ar.
TMP=$(mktemp "${TMPDIR:-/tmp}/painel-evento.XXXXXX") || exit 0
cat > "$TMP"
( curl -s -m 2 -o /dev/null -X POST \
    -H 'Content-Type: application/json' \
    --data-binary @"$TMP" \
    "http://127.0.0.1:${PAINEL_PORT:-7777}/hook" >/dev/null 2>&1
  rm -f "$TMP" ) </dev/null >/dev/null 2>&1 &
exit 0
