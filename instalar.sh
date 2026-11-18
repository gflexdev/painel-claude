#!/bin/bash
# Instala o Painel Claude neste Mac, para o usuário que rodar. De dentro da pasta baixada:
#   bash instalar.sh            instala (ou atualiza) em ~/.local/share/painel-claude/app
#   bash instalar.sh --aqui     usa esta pasta mesmo (para quem mexe no código)
# Pode rodar de novo quantas vezes quiser: o token e as sessões ficam em ~/.config/painel-claude.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${PAINEL_APP_DIR:-$HOME/.local/share/painel-claude/app}"
PORT="${PAINEL_PORT:-7777}"
[[ " $* " == *" --aqui "* ]] && DEST="$SRC"

say() { printf '%s\n' "$*"; }
ask() { # ask "pergunta" padrão(s|n) → 0 se sim
  local answer default="$2"
  read -r -p "$1 " answer || answer=""
  answer="$(printf '%s' "${answer:-$default}" | tr '[:upper:]' '[:lower:]')"
  [[ "$answer" == s* || "$answer" == y* ]]
}

[[ "$(uname)" == "Darwin" ]] || { say "Este instalador é para macOS."; exit 1; }

say "== Painel Claude =="

# 1. Node 20 ou mais novo
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1 && ask "Falta o Node.js. Instalar com o Homebrew agora? [S/n]" s; then
    brew install node
  else
    say "Instale o Node.js 20 ou mais novo (https://nodejs.org, versão LTS) e rode este script de novo."
    exit 1
  fi
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 20 )); then
  say "O Node.js daqui é a versão $(node -v); o painel precisa da 20 ou mais nova. Atualize e rode de novo."
  exit 1
fi
say "✔ Node.js $(node -v)"

# 2. Claude Code
if [[ ! -d "$HOME/.claude" ]]; then
  say "Aviso: não achei ~/.claude. Instale o Claude Code e abra uma vez antes; os hooks vão para ~/.claude/settings.json."
  ask "Continuar mesmo assim? [s/N]" n || exit 1
fi

# 3. Copia o app para um lugar fixo (a pasta baixada pode ser apagada depois)
if [[ "$DEST" != "$SRC" ]]; then
  mkdir -p "$DEST"
  rsync -a --delete \
    --exclude '.git' --exclude 'node_modules' --exclude 'dist' \
    --exclude 'docs/ideia-bancada.md' \
    --exclude 'firmware/.pio' --exclude 'firmware/include/secrets.h' \
    --exclude 'widget-mac/build' \
    "$SRC/" "$DEST/"
  say "✔ app copiado para $DEST"
fi

# 4. Hooks, status line e serviço (sobe com o Mac e reinicia se cair)
cd "$DEST"
FLAGS=()
for flag in "$@"; do
  case "$flag" in --sem-servico|--sem-statusline) FLAGS+=("$flag") ;; esac
done
node scripts/install.js ${FLAGS[@]+"${FLAGS[@]}"}

TOKEN="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(require("os").homedir()+"/.config/painel-claude/config.json","utf8")).token)')"
LINK=""

# 5. HTTPS pelo Tailscale (opcional): é o que deixa instalar o painel como app no celular
TS="$(command -v tailscale || true)"
[[ -z "$TS" && -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]] && TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
if [[ -n "$TS" ]] && "$TS" status >/dev/null 2>&1; then
  say
  say "O Tailscale está ligado. Com HTTPS por ele, o painel abre no celular de qualquer lugar e instala como app."
  say "Só aparelhos da SUA rede Tailscale enxergam esse endereço."
  if ask "Ligar o HTTPS pelo Tailscale? [S/n]" s; then
    if "$TS" serve --bg --https=443 "http://127.0.0.1:$PORT"; then
      DNS="$("$TS" status --json | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write((JSON.parse(d).Self?.DNSName||"").replace(/\.$/,"")))')"
      [[ -n "$DNS" ]] && LINK="https://$DNS/?t=$TOKEN"
      say "✔ HTTPS ligado. Para desligar: tailscale serve --https=443 off"
    else
      say "Não deu para ligar o HTTPS. No painel do Tailscale (admin), ative MagicDNS e HTTPS Certificates e rode de novo."
    fi
  fi
fi

# 6. Widget do Mac (opcional, precisa do Xcode e do XcodeGen)
if [[ -d widget-mac ]] && command -v xcodebuild >/dev/null 2>&1 && command -v xcodegen >/dev/null 2>&1; then
  say
  if ask "Compilar e instalar o widget do Mac (leva uns minutos)? [s/N]" n; then
    bash widget-mac/instalar.sh
  fi
fi

say
say "Pronto. Abra o painel:"
say "  neste Mac:  http://127.0.0.1:$PORT/?t=$TOKEN"
[[ -n "$LINK" ]] && say "  celular:    $LINK"
if [[ -n "$LINK" ]] && command -v qrencode >/dev/null 2>&1; then
  qrencode -t ansiutf8 "$LINK"
fi
say
say "Guarde o link: quem tiver o token pode aprovar comandos no seu Mac. Não compartilhe."
say "Sessões do Claude Code que já estavam abertas aparecem no próximo pedido; se alguma não aparecer, reabra-a."
