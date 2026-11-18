#!/bin/sh
# Hook do Claude Code numa máquina remota (ex.: vps-dev): repassa o evento ao painel no Mac pela tailnet.
# Nunca falha nem segura o Claude: no máximo ~1 s (Mac dormindo ou fora da rede) e saída sempre 0.
# Quando o painel pede, manda o fim do transcript em segundo plano (transcript.sh).
CONF="${PAINEL_REMOTO_DIR:-$HOME/.config/painel-claude}"
URL=$(sed -n 's/^PAINEL_URL=//p' "$CONF/remoto.conf" 2>/dev/null)
[ -n "$URL" ] && [ -r "$CONF/remoto.header" ] || { cat >/dev/null; exit 0; }
EVENTO=$(cat)
RESPOSTA=$(printf '%s' "$EVENTO" | curl -s -f --connect-timeout 1 -m 1 -X POST \
  -H 'Content-Type: application/json' -H "@$CONF/remoto.header" \
  --data-binary @- "$URL/remote/hook" 2>/dev/null)
case "$RESPOSTA" in
  *'"transcript":true'*)
    command -v jq >/dev/null 2>&1 || exit 0
    CAMPOS=$(printf '%s' "$EVENTO" | jq -r '[.session_id // "", .transcript_path // ""] | @tsv' 2>/dev/null)
    SID=$(printf '%s' "$CAMPOS" | cut -f1)
    CAMINHO=$(printf '%s' "$CAMPOS" | cut -f2-)
    [ -n "$SID" ] && [ -n "$CAMINHO" ] || exit 0
    # Subshell em segundo plano, sem stdin/stdout herdados: o Claude não espera por ele.
    ( "$(dirname "$0")/transcript.sh" "$SID" "$CAMINHO" </dev/null >/dev/null 2>&1 & )
    ;;
esac
exit 0
