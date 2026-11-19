#!/bin/sh
# Hook do chat do painel (asyncRewake, em SessionStart e Stop): espera uma mensagem mandada pelo painel.
# Com o ajuste "Mandar mensagens às sessões" desligado, o painel responde 204 na hora e o hook sai com 0:
# nada fica pendurado. Ligado, a conexão fica aberta até chegar uma mensagem; aí o texto vai para o stderr e o
# hook sai com 2, e o Claude Code acorda a sessão com ele, mesmo parada. Sem mensagem (204, outro hook tomou o
# lugar, sessão encerrada), sai com 0. Painel fora do ar: tenta de novo algumas vezes (ex.: reinício do
# serviço) e desiste em ~1 min.
EVENTO=$(cat)
RESPOSTA=$(mktemp "${TMPDIR:-/tmp}/painel-chat.XXXXXX") || exit 0
trap 'rm -f "$RESPOSTA"' EXIT
FALHAS=0
while :; do
  CODIGO=$(printf '%s' "$EVENTO" | curl -s -m 43000 -o "$RESPOSTA" -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' --data-binary @- \
    "http://127.0.0.1:${PAINEL_PORT:-7777}/chat/wait" 2>/dev/null)
  case "$CODIGO" in
    200) cat "$RESPOSTA" >&2; exit 2 ;;
    000|5*)
      FALHAS=$((FALHAS + 1))
      [ "$FALHAS" -ge "${PAINEL_CHAT_TENTATIVAS:-12}" ] && exit 0
      sleep "${PAINEL_CHAT_RETRY:-5}" ;;
    *) exit 0 ;;
  esac
done
