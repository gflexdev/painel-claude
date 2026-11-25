# Firmware do display de bancada

Firmware da **Guition ESP32-4848S040** (ESP32-S3, 16 MB de flash e 8 MB de PSRAM, tela IPS de 4" 480×480 com
ST7701 e touch GT911) para o `painel-claude`. É um cliente do servidor que já roda no Mac: mostra as sessões do
Claude Code numa grade 4×4 e deixa aprovar permissões, aprovar planos e responder perguntas pela tela.

```
Sessões do Claude Code ──hooks──▶ painel-claude no Mac (:7777) ──SSE/JSON──▶ esta placa (Wi-Fi)
```

O mesmo código roda num **simulador no Mac** (janela SDL de 480×480), ligado ao servidor de verdade. Assim dá para
mexer na interface sem a placa.

## Mostrador redondo (Waveshare ESP32-S3-Touch-AMOLED-1.75)

O mesmo cliente também roda na **Waveshare ESP32-S3-Touch-AMOLED-1.75** (inclui a `-G`, com GPS): AMOLED redonda
de 1,75" e 466×466 com CO5300 por QSPI, toque CST9217, ESP32-S3R8 com 8 MB de PSRAM e 16 MB de flash. É um
mostrador de mesa, mais de visão geral que de detalhe. Protótipo das telas no Claude Design:
<https://claude.ai/artifact/8RZDAqUh62Z2nEUVsb6q49>.

- **Três visões**, trocadas arrastando para o lado (as bolinhas embaixo mostram onde você está):
  - **Visão geral**: o Mapa em órbita, com um Clawd por sessão em movimento (até 8) e o Clawd grande no meio.
    O do meio mostra a situação mais urgente: pula e acena (esperando você), anda digitando (rodando), comemora
    (terminou), olhos de X (erro) ou dorme com zzz (tudo parado). Tocar nele faz ele pular com um coração.
  - **Sessões**: lista com o Clawd, o ícone da atividade e a palavra do tile ("APROVAR?", "EDITANDO"…).
  - **Uso do plano**: janela de 5 h por fora e semana por dentro, com o tracinho do ritmo e quando zera.
- **Detalhe**: toque numa sessão. Mostra o Clawd dela, o contexto no anel, os números e o que está fazendo.
  Arrastar para baixo ou tocar no ^ volta.
- **Esperando você**: o pedido novo abre sozinho, com a borda pulsando em vermelho e **Permitir / Negar** (ou
  **Aprovar / Recusar** o plano). Depois de responder, vai para o próximo pedido. Pergunta com opções fica para o
  Mac ou o celular.
- **Som**: quando uma sessão passa a esperar você, toca um "plim-plim" curto (gerado na hora, sem arquivo) no
  alto-falante do kit, ligado no conector **SPK**. O volume é `PAINEL_SOM_VOLUME` em `secrets.h` (0 a 100; 0 =
  mudo). Ao ligar, quem já esperava não toca de novo. O amplificador fica ligado o tempo todo (ligado só na hora
  do som, ele não acordava a tempo e o alto-falante ficava mudo). A antena de GPS não é usada: pode ficar fora.
- **Brilho**: o mesmo da Guition, mas pelo comando de brilho do próprio AMOLED (não há backlight).
- Fundo preto puro: no AMOLED o pixel preto fica apagado e a borda do vidro some.

Gravar (o `secrets.h` é o mesmo da Guition). A placa usa o USB nativo do ESP32-S3, então a porta aparece como
`/dev/cu.usbmodem*`:

```bash
pio run -e amoled -t upload
```

```bash
pio device monitor -e amoled
```

Se o upload não começar, segure **BOOT**, aperte e solte **RST** e solte **BOOT**. No monitor devem aparecer
`[toque] CST9217 em 0x5A`, `[som] ES8311 pronto`, `[painel] telas prontas: heap interno … KB` e
`[wifi] conectado: …`. Gravado e conferido na placa em 25/11/2026: imagem centrada, toque no lugar certo e som.

Simulador redondo (janela de 466×466 com máscara redonda; aceita `swipe X1 Y1 X2 Y2` nos comandos; o som sai no
alto-falante do Mac, com `PAINEL_SOM_VOLUME=0` para calar):

```bash
pio run -e sim-round && .pio/build/sim-round/program
```

| Sintoma na primeira vez | O que mexer |
|---|---|
| Imagem deslocada alguns pixels para o lado | `kColumnOffset` em `src/board_amoled/pins.h` (6 é o valor da Waveshare) |
| Toque espelhado ou trocado | em `src/board_amoled/touch.cpp`, a função `read` já espelha X e Y como o BSP da Waveshare; se vier ao contrário, tire o `kWidth - 1 -` |
| Sem som | confira o alto-falante no conector SPK (não no BAT, que é igual) e, no monitor, `[som] ES8311 pronto` e `[som] tocou …` a cada aviso; `PAINEL_SOM_VOLUME` acima de 0 |
| Cores trocadas | troque `draw16bitRGBBitmap` por `draw16bitBeRGBBitmap` em `src/board_amoled/display.cpp` |

Pinos e endereços vieram do `HARDWARE_REFERENCE.md` do repositório `waveshareteam/ESP32-S3-Touch-AMOLED-1.75`.
Tela pela Arduino_GFX 1.6.9 e toque pela SensorLib 0.5.2.

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
  clawd      Clawd: porte de public/clawd.js e das animações de clawd.css (poses em degraus)
  wake       brilho e toque (a tela escura só acende no primeiro toque), comum às duas placas
  link_screen  texto da tela de estado (Wi-Fi, Mac sem resposta, token recusado)
  format     textos ("terminou · ver", "3 min", "84k")
  app        liga cliente e telas, barra do topo, telas de estado e brilho
src/ui/      LVGL: tema (cores da web), grade, detalhe, robô e Clawd num canvas
src/round/   mostrador redondo: carrossel (visão geral, sessões, uso), detalhe e tela de estado
src/board_amoled/  Waveshare AMOLED 1,75": CO5300 (Arduino_GFX), CST9217 (SensorLib) e main
src/esp32/   comum às placas ESP32: TCP pelo WiFiClient, mDNS e pthreads
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
