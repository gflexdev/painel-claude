#!/bin/sh
# Hook PermissionRequest do Claude Code: pergunta ao painel e espera o toque em Permitir/Negar.
# O diálogo do Mac aparece ao mesmo tempo; quem responder primeiro vale.
# Sem resposta (ou painel fora do ar), não imprime nada e fica valendo o diálogo do Mac.
curl -s -m 590 -X POST \
  -H 'Content-Type: application/json' \
  --data-binary @- \
  "http://127.0.0.1:${PAINEL_PORT:-7777}/permission" 2>/dev/null
exit 0
