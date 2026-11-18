#!/bin/sh
# Manda ao painel o fim do transcript de uma sessão desta máquina (o Mac não lê o disco daqui).
# Chamado em segundo plano por evento.sh com: <session_id> <transcript_path>. Só lê sob ~/.claude/projects.
SID="$1"
CAMINHO="$2"
CONF="${PAINEL_REMOTO_DIR:-$HOME/.config/painel-claude}"
PROJETOS="${PAINEL_PROJETOS_DIR:-$HOME/.claude/projects}"
FIM_BYTES=786432
URL=$(sed -n 's/^PAINEL_URL=//p' "$CONF/remoto.conf" 2>/dev/null)
[ -n "$URL" ] && [ -r "$CONF/remoto.header" ] || exit 0
case "$SID" in '' | *[!A-Za-z0-9_-]*) exit 0 ;; esac
case "$CAMINHO" in "$PROJETOS"/*.jsonl) ;; *) exit 0 ;; esac
case "$CAMINHO" in *'/../'* | *'/./'*) exit 0 ;; esac
[ -f "$CAMINHO" ] || exit 0
TURNOS=$(grep -c '"turnOrigin":"human"' "$CAMINHO" 2>/dev/null)
{
  # O título pode ter ficado lá no começo; vai na frente do fim do arquivo.
  grep -a '"type":"custom-title"' "$CAMINHO" | tail -n 1 | head -c 4096
  grep -a '"type":"agent-name"' "$CAMINHO" | tail -n 1 | head -c 4096
  printf '\n'
  tail -c "$FIM_BYTES" "$CAMINHO"
} | curl -s -o /dev/null --connect-timeout 2 -m 15 -X POST \
  -H 'Content-Type: application/x-ndjson' -H "@$CONF/remoto.header" \
  -H "X-Painel-Session: $SID" -H "X-Painel-Turns: ${TURNOS:-0}" \
  --data-binary @- "$URL/remote/transcript" >/dev/null 2>&1
exit 0
