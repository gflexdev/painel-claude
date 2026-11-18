# Firmware do display de bancada

Firmware da **Guition ESP32-4848S040** (ESP32-S3, 16 MB de flash e 8 MB de PSRAM, tela IPS de 4" 480×480 com
ST7701 e touch GT911) para o `painel-claude`. É um cliente do servidor que já roda no Mac: mostra as sessões do
Claude Code numa grade 4×4 e deixa aprovar permissões, aprovar planos e responder perguntas pela tela.

```
Sessões do Claude Code ──hooks──▶ painel-claude no Mac (:7777) ──SSE/JSON──▶ esta placa (Wi-Fi)
```

O mesmo código roda num **simulador no Mac** (janela SDL de 480×480), ligado ao servidor de verdade. Assim dá para
mexer na interface sem a placa.

## O que tem na tela

- **Grade 4×4 com páginas.** Deslize para o lado ou toque nas setas. A ordem vem do servidor: primeiro quem espera
  você, depois erro, **terminou · ver**, rodando e parada.
- **Tile:** cor do status na barra lateral e no texto, o robozinho da versão web (corpo pela sessão, chapéu pelo
  projeto, ícone pela atividade), o tempo no status e o contexto em tokens. Esperando você: borda vermelha que
  pulsa. Rodando: o robô balança. Terminou e você não viu: listras azuis andando.
- **Detalhe** (toque no tile): status, números (modelo, contexto, pedidos, há quanto tempo está aberta), último
  pedido, última resposta e ferramentas recentes. Se a sessão estava em "terminou · ver", abrir manda o
  `POST /api/sessions/:id/seen`.
- **Cartão de pedido:** **Permitir/Negar**, **Aprovar plano/Recusar** ou as opções da pergunta, com escolha
  múltipla e campo de texto com teclado na tela. Se o pedido já foi respondido no Mac (410), a tela avisa.
- **Barra do topo:** contadores (esperando, para ver, rodando, paradas), ponto de conexão e relógio na hora do
  Mac. Sem conexão, a barra mostra "Mac sem resposta há X". Depois de 45 s offline, ou se nunca conectou, a grade
  dá lugar à tela **Mac sem resposta**, com o motivo e a contagem até a próxima tentativa. A reconexão espera
  1 s, 2 s, 4 s… até 30 s. Token errado mostra a tela **Token recusado**.
- **Brilho:** cheio quando alguma sessão está esperando ou rodando, ou quando você tocou na tela no último minuto.
  Depois de 1,5 min sem nada disso, a tela escurece aos poucos. Com a tela escura, o primeiro toque só acende: não
  aperta botão nenhum sem querer.

## Preparar (uma vez)

1. PlatformIO: `uv tool install platformio` (ou a extensão do VS Code).
2. Segredos (o arquivo fica fora do git):

   ```bash
   cp include/secrets.example.h include/secrets.h
   ```

   Preencha:
   - `PAINEL_WIFI_SSID` e `PAINEL_WIFI_PASS`: rede de **2,4 GHz**.
   - `PAINEL_HOST`: IP do Mac na rede local (melhor reservar esse IP no roteador). Também funciona o nome mDNS,
     como `MacBook-de-Fulano.local`. Tailscale não serve: a placa não roda Tailscale.
   - `PAINEL_TOKEN`: o campo `token` de `~/.config/painel-claude/config.json`.

   Sem `secrets.h` o build compila com os valores de exemplo (sai um aviso) e a placa não conecta.

## Gravar na placa (quando ela chegar)

1. Ligue a placa no Mac pelo USB-C. A porta aparece como `/dev/cu.usbserial-*` ou `/dev/cu.wchusbserial-*`
   (ponte USB-serial; o firmware usa `ARDUINO_USB_CDC_ON_BOOT=0`).
2. Grave e abra o monitor serial:

   ```bash
   pio run -e guition -t upload
   ```

   ```bash
   pio device monitor -e guition
   ```

   Se o upload não começar, segure **BOOT**, aperte e solte **RST** e solte **BOOT**. Depois tente de novo.
3. No monitor devem aparecer `[touch] GT911 em 0x5D`, `[wifi] conectado: 192.168.x.x` e, sem erros de `[sse]`, a
   grade com as sessões.
4. O Mac precisa aceitar conexões de fora na porta 7777. O servidor já ouve em `0.0.0.0`. Se o firewall do macOS
   perguntar sobre o `node`, permita.

### Se algo vier estranho na primeira vez

| Sintoma | O que mexer |
|---|---|
| Vermelho e azul trocados | em `src/board/display.cpp`, troque o `0x36, 1, 0x00` (MADCTL) por `0x36, 1, 0x08` |
| Imagem espelhada ou tela de cabeça para baixo | `0xC7` (espelho em X) = `0x04`; bit `0x10` do `0x36` (espelho em Y) |
| Toque fora do lugar | em `src/board/touch.cpp`, inverta x/y ou espelhe (`kWidth - 1 - x`) na função `read` |
| Imagem andando ou tremendo com o Wi-Fi | aumente `kBounceLines` em `src/board/pins.h` (10 → 20) ou baixe `kPclkHz` para 10 MHz |
| Brilho baixo piscando | `kBacklightHz` = 150 em `src/board/pins.h` (valor do exemplo do ESPHome) |
| Tela muito clara ou escura quando escurece | `PAINEL_BRILHO_BAIXO` em `secrets.h` |
| Tela "Mac sem resposta" mas o Mac está ligado | confira o IP, o firewall e se `curl http://<ip>:7777/health` responde de outra máquina |

Os pinos, os tempos do painel e a sequência de init do ST7701 estão em `src/board/pins.h` e
`src/board/display.cpp`. Vieram da página da placa no ESPHome devices e do board JSON `esp32-4848S040CIY1`
(rzeldent/platformio-espressif32-sunton), conferidos entre si.

## Simulador no Mac

Precisa do SDL2 (`brew install sdl2`). Com o servidor `painel-claude` rodando no próprio Mac:

```bash
pio run -e sim && .pio/build/sim/program
```

Sem configuração, ele usa `127.0.0.1:7777` e lê o token de `~/.config/painel-claude/config.json`. Para mudar:
`PAINEL_HOST`, `PAINEL_PORT`, `PAINEL_TOKEN` e `PAINEL_TZ_OFFSET_MIN`. O mouse faz o papel do dedo, e o brilho
aparece como um véu escuro sobre a tela.

Dá para testar por script, sem mexer no mouse. Com `PAINEL_SIM_CMDS=/caminho/comandos.txt`, o simulador lê
esse arquivo, executa os comandos e apaga o arquivo:

```
tap 60 100
wait 1500
shot /tmp/detalhe.bmp
quit
```

Para ver o cartão de pedido sem esperar o Claude pedir algo, crie um pedido falso. O `curl` fica esperando até
alguém decidir na tela e então imprime a decisão:

```bash
curl -s -X POST http://127.0.0.1:7777/permission -H 'Content-Type: application/json' -d '{"hook_event_name":"PermissionRequest","session_id":"teste-bancada","cwd":"/tmp/teste-bancada","tool_name":"Bash","tool_input":{"command":"echo teste"}}'
```

Depois encerre a sessão de teste:

```bash
curl -s -X POST http://127.0.0.1:7777/hook -H 'Content-Type: application/json' -d '{"hook_event_name":"SessionEnd","session_id":"teste-bancada"}'
```

## Como o código está dividido

```
src/app/     comum à placa e ao simulador, sem LVGL
  model      structs e parse do JSON (ArduinoJson)
  http       HTTP/1.0 mínimo + parser de SSE
  client     thread do SSE (reconexão com backoff) + thread das chamadas avulsas; fila para a interface
  bot        robozinho: porte fiel de public/bot.js (mesmo hash, mesmo xorshift, mesmos chapéus)
  format     textos ("terminou · ver", "3 min", "84k")
  app        liga cliente e telas, barra do topo, telas de estado e brilho
src/ui/      LVGL: tema (cores da web), grade, detalhe, robô num canvas
src/board/   placa: ST7701 (init por SPI de 3 fios em software + painel RGB com bounce buffer), GT911,
             Wi-Fi/TCP, mDNS e PWM do brilho
src/sim/     simulador: sockets POSIX, janela SDL, toque e captura por script
src/fonts/   Space Grotesk e JetBrains Mono (as fontes da web) com acentos; geradas por tools/gerar-fontes.sh
```

A rede usa HTTP/1.0 de propósito: assim o Node responde sem `chunked` e fecha a conexão no fim, e o SSE chega
como texto corrido. A interface só roda na thread principal. As threads de rede conversam com ela por uma fila e
nunca chamam o LVGL.

Versões fixadas: pioarduino 55.03.312-1 (Arduino-ESP32 3.3, ESP-IDF 5.5), LVGL 9.5.0, ArduinoJson 7.4.3.

Licenças das fontes: Space Grotesk e JetBrains Mono são OFL 1.1 (ver `src/fonts/LICENCAS.md`).
