# Painel Claude: como funciona por dentro

Este documento é para quem vai mexer no código ou integrar outra tela (ESP32, widget). Para instalar e usar, veja
o [README](../README.md).

```
Sessões do Claude Code ──hooks──▶ servidor no Mac (127.0.0.1:7777) ──SSE/JSON──▶ navegador, celular, widget, ESP32
        └── status line ──(uso do plano)──┘
```

## Peças

| Pasta | O que é |
|---|---|
| `src/` | Servidor Node sem dependências: recebe os hooks, guarda o estado e serve a API e o painel. |
| `src/state.js` | Reducer puro: evento do hook → estado da sessão (rodando, esperando, parada, erro). |
| `src/transcript.js` | Lê o transcript (`~/.claude/projects/*.jsonl`): título, modelo, contexto, último pedido e resposta. |
| `src/permissions.js`, `src/questions.js` | Fila de pedidos de permissão, pergunta e plano, e validação das respostas. |
| `src/usage.js` | Uso do plano (`rate_limits`) recebido pela status line. |
| `src/remote.js` | Entrada autenticada das outras máquinas (VPS). |
| `hooks/` | Scripts que o Claude Code chama: `enviar-evento.sh`, `permissao.sh`, `statusline.sh`, `enviar-uso.sh`. |
| `public/` | O painel web (PWA): grade, detalhe, barra de uso, estilos de personagem. |
| `scripts/` | Instalação no Mac e na VPS, ícones e empacotamento. |
| `widget-mac/` | Widget do macOS (SwiftUI + WidgetKit). Veja o [README dele](../widget-mac/README.md). |
| `firmware/` | Display ESP32 de bancada (LVGL). Veja o [README dele](../firmware/README.md). |
| `test/` | Testes (`npm test`, `node:test`). |

## Hooks

O instalador acrescenta em `~/.claude/settings.json`:

- `hooks/enviar-evento.sh` em SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Notification, Stop,
  StopFailure, PreCompact e SessionEnd. Faz um `curl` para `POST /hook` com timeout de 1 s e sai sempre com 0:
  com o servidor fora do ar, o Claude não percebe.
- `hooks/permissao.sh` em PermissionRequest (timeout de 600 s). Veja abaixo.
- `hooks/statusline.sh` como status line. Repassa o JSON a `hooks/enviar-uso.sh` (no máximo uma vez por minuto,
  em segundo plano) e chama a status line que a pessoa já tinha. O comando original fica em
  `~/.config/painel-claude/statusline-original.cmd`, e o `desinstalar.sh` devolve a configuração de antes.

`/hook`, `/permission` e `/usage` só aceitam pedidos do próprio Mac (127.0.0.1, sem cabeçalhos de proxy). O que
chega pelo `tailscale serve` é recusado.

## Aprovar permissão, pergunta e plano

Quando o Claude Code pede permissão, `hooks/permissao.sh` manda o pedido ao servidor e fica esperando. O diálogo
do Mac aparece **ao mesmo tempo**, e vale quem responder primeiro:

- Alguém tocou em **Permitir** ou **Negar** no painel ou no widget: o servidor responde ao hook com a decisão
  (`hookSpecificOutput.decision`), e o diálogo do Mac fecha.
- Responderam no Mac: o Claude cancela o hook, e o pedido some da tela.
- Ninguém respondeu em 9,5 min: o servidor responde 204, o hook desiste, e fica só o diálogo do Mac.

O mesmo cartão serve para:

- **Pergunta** (AskUserQuestion): o painel devolve `updatedInput` com a pergunta original mais `answers`, que o
  Claude Code valida.
- **Plano** (ExitPlanMode): aprovar é `allow`; recusar é `deny`.

## API

Todas as rotas `/api/*` pedem `Authorization: Bearer <token>`. Só as de leitura aceitam também `?t=<token>`,
porque o `EventSource` não manda cabeçalho.

| Rota | O que devolve |
|---|---|
| `GET /api/stream` | SSE: evento `snapshot` a cada mudança e ping a cada 25 s |
| `GET /api/sessions` | `{ now, version, usage, sessions: [...] }` (o mesmo snapshot) |
| `GET /api/sessions/:id` | detalhe + `summary { lastPrompt, answer, recentTools }` + `permissions[]` com o comando inteiro |
| `POST /api/permissions/:id` | `{ "decision": "allow" \| "deny", "answers"?: { pergunta: opção \| [opções] \| texto } }`. Token **só no cabeçalho**. Responde 410 se o pedido já foi respondido e 400 se faltar resposta |
| `POST /api/sessions/:id/seen` | tira o "terminou · ver" da sessão |
| `POST /hook`, `POST /permission`, `POST /usage` | entrada dos hooks e da status line; só do próprio Mac |
| `POST /remote/hook`, `/remote/permission`, `/remote/transcript` | entrada das outras máquinas (veja abaixo) |
| `GET /health` | contagem de sessões, sem token |

Item de `sessions` (enxuto de propósito, para caber num ESP32):

```json
{ "id": "…", "name": "Deploy do site", "project": "site", "origin": "app", "machine": "",
  "status": "working|waiting|idle|error|ended", "detail": "Bash: Roda os testes", "activity": "bash",
  "unseen": false, "model": "opus 5.5", "contextTokens": 84213, "turns": 7,
  "since": 1794930914178, "lastEventAt": 1794930914178, "stale": false }
```

- `machine` vem vazio nas sessões do Mac e com o nome da máquina nas outras.
- `stale: true` quer dizer que a sessão está marcada como rodando, mas sem nenhum evento há 15 min.
  Provavelmente foi fechada sem `SessionEnd`.
- Com pedido pendente, o item ganha `permission: { id, kind, tool, count }`.
- `usage` é `{ fiveHour?, sevenDay?: { usedPercentage, resetsAt }, updatedAt }`, com os horários em ms. O cálculo
  do ritmo fica em `public/pace.js`, puro, para o widget e o ESP32 usarem a mesma conta.

O HTML leva a versão dos arquivos de `public/` (um hash), e cada snapshot também. Quando as duas diferem, a página
recarrega sozinha, uma vez por versão.

## Uso do plano

O Claude Code manda à status line um JSON com `rate_limits` (janelas de 5 h e de 7 dias, `used_percentage` e
`resets_at` em segundos). A status line do painel repassa esse JSON a `POST /usage`, e o servidor guarda só o
`rate_limits`, em `~/.config/painel-claude/uso.json`.

Limite conhecido: a status line só roda nas sessões de terminal. Sessões no app do Claude não rodam a status
line, então, sem nenhuma sessão de terminal aberta, o número não atualiza. O painel avisa há quanto tempo foi a
última leitura.

## Sessões de outra máquina (VPS)

Os hooks de lá **empurram** os eventos para o Mac pela tailnet (`http://<IP do Mac na tailnet>:7777/remote/*`).
O estado, a espera de permissão e a API já estão no Mac. Do lado de lá bastam `sh`, `curl` e `jq`, sem serviço
novo nem porta aberta.

O transcript fica na VPS. Quando o painel quer o resumo, o hook manda em segundo plano o fim do arquivo (768 KB),
e o Mac interpreta.

Segurança da entrada `/remote/*`:

- só aceita conexão **direta** de um IP da tailnet (100.64.0.0/10 ou fd7a:115c:a1e0::/48). O que chega pelo
  `tailscale serve` é recusado (403);
- pede o **token da máquina**, separado do token das telas e comparado em tempo constante (401 se errar);
- prende o token ao IP da máquina na tailnet: o token vindo de outro aparelho dá 403;
- a origem sai do token, não do evento. Uma máquina não mexe em sessão do Mac nem de outra máquina (409);
- limita o corpo: 4 MB por evento e 1 MB de transcript (413 acima disso).

O hook de lá nunca segura o Claude. O de evento usa `--connect-timeout 1 -m 1` e sai sempre com 0. O de
permissão segue a mesma regra do Mac: vale quem responder primeiro. Sem o Mac, ele desiste em ~1 s.

Instalar, do Mac (precisa de um alias SSH, aqui `vps-dev`, no `~/.ssh/config`, e da máquina na mesma tailnet):

```bash
npm run install-vps -- vps-dev --nome vps-dev
```

O que muda:

- **no Mac:** `~/.config/painel-claude/config.json` ganha `remotes.<nome>`, com o token e o IP da máquina na
  tailnet;
- **na máquina:** os scripts vão para `~/.local/share/painel-claude/hooks/`, e o token vai para
  `~/.config/painel-claude/` (modo 600). O token passa só pela entrada do ssh, nunca aparece em tela. Os hooks
  entram em `~/.claude/settings.json`, com backup ao lado.

Para desfazer: `npm run uninstall-vps -- vps-dev --nome vps-dev`.

Limites:

- Com VPN corporativa ligada (ex.: Cisco AnyConnect), o Mac às vezes perde as rotas do Tailscale. As sessões
  remotas param de atualizar até desligar a VPN.
- O resumo das sessões remotas fica só na memória. Depois de reiniciar o servidor, volta no próximo evento.

## Instalar como app (PWA)

O painel tem manifest, ícones (192, 512 e maskable), ícone da Apple e um service worker. O service worker não
guarda estado: só mostra a tela "Sem conexão com o Mac" quando o Mac não responde. O Android e o iPhone só
instalam como app uma página em HTTPS, por isso o `tailscale serve`. No próprio Mac, `http://127.0.0.1` já conta
como seguro.

Os ícones saem de `scripts/gerar-icones.js`, pixel art desenhada no próprio script:

```bash
node scripts/gerar-icones.js
```

## Estilos de personagem

`public/bot.js` desenha o robô e `public/agents.js` os outros estilos: Bichinho, Fantasminha, Astronauta e Selo.
Regras comuns:

- o corpo (forma ou cor) vem do id da sessão;
- um detalhe tem a cor do projeto (a mesma do chapéu do robô);
- a situação usa `currentColor`, que o CSS define pela situação do tile.

O estilo escolhido fica no `localStorage` do aparelho (`painel-claude-agente`).

## Desenvolvimento

```bash
npm test
PAINEL_DIR=/tmp/painel-teste PAINEL_PORT=7788 PAINEL_DEBUG=1 npm start
```

- Com `PAINEL_DEBUG=1`, os eventos vão para `eventos.log`. Nesse log, prompt, `tool_input` e mensagens aparecem
  só como nomes de campos ou tamanho, sem o conteúdo.
- `bash instalar.sh --aqui` instala usando a própria pasta em vez de copiar.
- `bash instalar.sh --sem-servico` faz tudo menos o serviço launchd. Serve para testar com outro `HOME`.
- Reiniciar o serviço: `launchctl kickstart -k gui/$(id -u)/br.com.gflex.painel-claude`.
- Gerar o pacote para mandar a alguém: `bash scripts/empacotar.sh`. O resultado sai em
  `dist/painel-claude-AAAA-MM-DD.zip`, sem estado, tokens, segredos do firmware nem builds. O script para se achar
  algo com cara de token.
