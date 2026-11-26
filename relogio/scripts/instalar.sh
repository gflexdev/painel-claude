#!/usr/bin/env bash
# Compila o app com o endereço e o token do relógio e deixa o .prg pronto para passar pelo cabo.
# Uso: relogio/scripts/instalar.sh [fr165|fr165m]   (padrão: fr165; o cabeçalho do OpenMTP diz qual é o seu)
# O macOS não fala MTP sozinho: a cópia é pelo OpenMTP, e este script abre tudo e diz o passo.
set -euo pipefail
DEVICE="${1:-${DEVICE:-fr165}}"
source "$(dirname "$0")/sdk-env.sh"

"$(dirname "$0")/build.sh" "$DEVICE"

# O agente do Android File Transfer segura o relógio e o OpenMTP não o enxerga. Ele volta no próximo login.
if pgrep -qf "Android File Transfer Agent"; then
    pkill -f "Android File Transfer Agent" || true
    echo "Fechei o Android File Transfer Agent, que segura a conexão USB do relógio."
fi

open -R "$PRG"
if [[ -d /Applications/OpenMTP.app ]]; then
    open -a OpenMTP
else
    echo "Instale o OpenMTP (https://openmtp.ganeshrvel.com) para copiar o app para o relógio."
fi

cat <<PASSOS

Pronto: $PRG
1. Ligue o relógio ao Mac pelo cabo da Garmin (feche o Garmin Express, se estiver aberto).
2. No OpenMTP, no lado do relógio, entre em Internal Storage → GARMIN → Apps.
3. Arraste o PainelClaude-$DEVICE.prg (já aberto no Finder) para dentro de Apps.
4. Desconecte o cabo. O "Painel Claude" aparece na lista de apps (START no mostrador).

O .prg leva o token do relógio: não o mande a ninguém. Para trocar o token: node scripts/relogio.js revogar,
e rode este script de novo.
PASSOS
