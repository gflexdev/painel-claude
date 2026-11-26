#!/bin/bash
# Gera o .zip para mandar a outras pessoas, sem nada pessoal (estado, tokens, segredos do firmware,
# builds, anotações da bancada). Sai em dist/painel-claude-AAAA-MM-DD.zip.
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP="$(date +%Y-%m-%d)"
STAGE="$(mktemp -d)/painel-claude"
mkdir -p "$STAGE" dist

rsync -a \
  --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude '.DS_Store' \
  --exclude 'docs/ideia-bancada.md' \
  --exclude 'firmware/.pio' --exclude 'firmware/.vscode' --exclude 'firmware/include/secrets.h' \
  --exclude 'firmware/capturas' \
  --exclude 'relogio/bin' --exclude 'relogio/gerado' \
  --exclude 'widget-mac/build' --exclude 'widget-mac/*.xcodeproj/xcuserdata' \
  ./ "$STAGE/"

# Nenhum token, IP de tailnet ou segredo pode ir junto.
if grep -rIl -E 'PAINEL_TOKEN *= *"[A-Za-z0-9]{12,}|"token" *: *"[A-Za-z0-9]{12,}' "$STAGE" >/dev/null; then
  echo "Achei algo com cara de token no pacote; confira antes de mandar:" >&2
  grep -rIl -E 'PAINEL_TOKEN *= *"[A-Za-z0-9]{12,}|"token" *: *"[A-Za-z0-9]{12,}' "$STAGE" >&2
  exit 1
fi

OUT="$PWD/dist/painel-claude-$STAMP.zip"
rm -f "$OUT"
ditto -c -k --norsrc --noextattr --keepParent "$STAGE" "$OUT"
rm -rf "$(dirname "$STAGE")"
echo "Pacote: $OUT"
echo "Quem receber: descompacta, abre o Terminal na pasta e roda: bash instalar.sh"
