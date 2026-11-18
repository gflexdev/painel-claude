#!/bin/sh
# Gera o projeto, compila em Release, instala em ~/Applications e abre o app da barra de menus.
set -eu
cd "$(dirname "$0")"

command -v xcodegen >/dev/null || { echo "Falta o XcodeGen: brew install xcodegen"; exit 1; }
xcodegen generate --quiet
xcodebuild -project PainelClaude.xcodeproj -scheme PainelClaude -configuration Release \
  -derivedDataPath build/dd build -quiet

APP="build/dd/Build/Products/Release/Painel Claude.app"
DEST="$HOME/Applications/Painel Claude.app"
pkill -x "Painel Claude" 2>/dev/null || true
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
cp -R "$APP" "$DEST"
open "$DEST"

echo "Instalado em $DEST"
pluginkit -m -p com.apple.widgetkit-extension | grep -q painel-claude \
  && echo "Widget registrado. Adicione pela galeria: clique direito na mesa → Editar Widgets → Painel Claude." \
  || echo "O sistema ainda não listou o widget; espere alguns segundos e abra a galeria."
