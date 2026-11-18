#!/bin/sh
# Hook PermissionRequest numa máquina remota: pergunta ao painel no Mac e espera o toque em Permitir/Negar.
# O diálogo de lá aparece ao mesmo tempo; quem responder primeiro vale.
# Mac fora do ar: desiste em ~1 s, sem imprimir nada (fica valendo o diálogo). -f: erro HTTP não vira saída.
CONF="${PAINEL_REMOTO_DIR:-$HOME/.config/painel-claude}"
URL=$(sed -n 's/^PAINEL_URL=//p' "$CONF/remoto.conf" 2>/dev/null)
[ -n "$URL" ] && [ -r "$CONF/remoto.header" ] || { cat >/dev/null; exit 0; }
curl -s -f --connect-timeout 1 -m 590 -X POST \
  -H 'Content-Type: application/json' -H "@$CONF/remoto.header" \
  --data-binary @- "$URL/remote/permission" 2>/dev/null
exit 0
