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
  StopFailure, PreCompact, SessionEnd, SubagentStart e SubagentStop. Faz um `curl` para `POST /hook` com timeout de 1 s e sai sempre com 0:
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

## Subagentes

Quando a sessão usa a ferramenta Agent, chegam `SubagentStart` e `SubagentStop` com `agent_id` e `agent_type`, e
toda ferramenta usada dentro do subagente (PreToolUse, PostToolUse, PermissionRequest) vem com o mesmo
`agent_id`. `src/subagents.js` guarda os 8 mais recentes por sessão. A descrição vem do `tool_input.description`
da chamada à ferramenta Agent que precedeu o `SubagentStart` do mesmo tipo. A sessão mãe fica "delegando" e o
detalhe diz qual subagente está fazendo o quê. Um pedido de permissão de subagente leva `agentType`.

## Sessões filhas (app do Claude)

O app do Claude no Mac guarda um arquivo por sessão em
`~/Library/Application Support/Claude/claude-code-sessions/<conta>/<org>/local_<id>.json`. `src/app-links.js` lê
dali só `cliSessionId` (o id dos hooks), `priorCliSessionIds`, `spawnedFrom.sessionId` e `startChain.depth`, e só
dos arquivos mexidos nas últimas 24 h (mais o arquivo da mãe, se for mais antigo). Relê a cada 20 s, só o que
mudou. Não é formato documentado: se mudar, o painel só deixa de agrupar. A pasta pode ser trocada com
`PAINEL_CLAUDE_APP_DIR`.

O app também guarda amostras do uso do plano em `plan-usage-history.json` (`{ t, u: { sd, fh } }`, % da semana
e das 5 h). `src/app-usage.js` lê a mais nova; ela só vale se for mais nova que o último dado da status line. O
horário do reset vem do último conhecido pela status line, empurrado de 7 em 7 dias (`nextReset`). Sem nenhum,
o snapshot leva `resetsAt: null` e a tela mostra só o %. Arquivo: `PAINEL_CLAUDE_APP_USAGE`.

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
- `subagentCount` (subagentes ativos) e `subagents` (até 4: `{ id, type, description, status, detail, activity }`).
  O detalhe (`GET /api/sessions/:id`) traz `subagentsRecent` com os ativos e os que terminaram.
- Sessão aberta por outra no app do Claude ganha `parentId` (id da mãe) e `depth`. A família se monta na tela
  (`public/families.js`).
- `permission.agentType` vem preenchido quando o pedido é de um subagente.
- `usage` é `{ fiveHour?, sevenDay?: { usedPercentage, resetsAt }, updatedAt, source }`, com os horários em ms;
  `source` é `statusline` ou `app`, e `resetsAt` pode ser `null` quando o reset ainda não é conhecido. O cálculo
  do ritmo fica em `public/pace.js`, puro, para o widget e o ESP32 usarem a mesma conta.

O HTML leva a versão dos arquivos de `public/` (um hash), e cada snapshot também. Quando as duas diferem, a página
recarrega sozinha, uma vez por versão.

## Uso do plano

Três fontes; vale o dado mais novo. Tudo fica em `~/.config/painel-claude/uso.json`, com `source`.

1. **`/usage` pelo `claude` do Mac** (`src/usage-probe.js`, `source: "cli"`), a principal. O servidor roda
   `claude -p "/usage" --output-format stream-json --verbose --no-session-persistence --strict-mcp-config
   --settings '{"disableAllHooks":true}'` numa pasta própria (`~/.config/painel-claude/sonda-uso`) e lê
   `usage_report.rate_limits.limits` (documentado em code.claude.com/docs/en/agent-sdk/typescript, marcado como
   experimental): `weekly_all` vira `sevenDay`, janela de sessão vira `fiveHour` e os limites por modelo vão em
   `scoped`. Custa 0 tokens. A cada 5 min com sessão rodando e 30 min parado, com espera dobrando a cada falha
   (até 1 h). O caminho do `claude` vem de `claudeBin` no `config.json`, gravado pelo instalador, ou dos lugares de
   sempre (`~/.local/bin`, Homebrew). Os hooks ficam desligados na consulta, então ela não aparece no painel.
2. **Status line** (`source: "statusline"`): o Claude Code manda `rate_limits` à status line nas sessões de
   terminal, e o painel recebe em `POST /usage`. Atualiza na hora.
3. **App do Claude** (`source: "app"`): `plan-usage-history.json`, poucas amostras por dia (veja acima).

O painel não usa o token OAuth do Keychain, cookies nem o endpoint `api/oauth/usage`: os termos do Claude Code
proíbem coletar ou intermediar as credenciais da assinatura (code.claude.com/docs/en/legal-and-compliance).

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
