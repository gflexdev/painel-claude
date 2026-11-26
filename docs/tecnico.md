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
| `src/background.js` | Stop com trabalho em segundo plano: a sessão continua "rodando". |
| `src/discover.js` | Sessões já abertas, pelo `claude agents --json`. |
| `src/panel-data.js` | O que é só do painel: arquivadas e sessões abertas por ele (`painel.json`). |
| `src/vigia.js` | Sessões vigiadas (`vigia.json`), as regras que fazem nascer um Aviso e as rotas de vigiar. |
| `src/actions.js` | Rotas de ação: arquivar, Ajustes, mensagem, abrir, fechar e apagar. |
| `src/chat.js`, `src/control.js` | Fila das mensagens para as sessões; `claude --bg`, `stop` e `rm`. |
| `src/webpush.js`, `src/push.js` | Avisos por Web Push: VAPID e criptografia do payload com `node:crypto`; inscrições dos aparelhos e envio. |
| `hooks/` | Scripts que o Claude Code chama: `enviar-evento.sh`, `permissao.sh`, `esperar-mensagem.sh`, `statusline.sh`, `enviar-uso.sh`. |
| `public/` | O painel web (PWA): quadros, grade, mapa, detalhe, Ajustes, barra de uso, estilos de personagem. |
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
- `hooks/esperar-mensagem.sh` em SessionStart e Stop, com `asyncRewake: true` e timeout de 12 h. É a entrega das
  mensagens do painel (veja [Mensagens para a sessão](#mensagens-para-a-sessão)). Fica sempre instalado; com o
  ajuste desligado, o painel o dispensa na hora.
- `hooks/statusline.sh` como status line. Repassa o JSON a `hooks/enviar-uso.sh` (no máximo uma vez por minuto,
  em segundo plano) e chama a status line que a pessoa já tinha. O comando original fica em
  `~/.config/painel-claude/statusline-original.cmd`, e o `desinstalar.sh` devolve a configuração de antes.

`/hook`, `/permission`, `/usage` e `/chat/wait` só aceitam pedidos do próprio Mac (127.0.0.1, sem cabeçalhos de
proxy). O que chega pelo `tailscale serve` é recusado.

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

## Trabalho em segundo plano

O Stop traz `background_tasks` (documentado em code.claude.com/docs/en/hooks, "Stop input"): o que ainda está em
andamento e vai acordar a sessão. Com algo lá que não terminou, a sessão fica `working` com `detail` "em segundo
plano: …" (`src/background.js`) e não vira "terminou · ver". Sem o campo (versões antigas), valem duas reservas:
subagentes ainda ativos que deram sinal nos últimos 15 min e comandos Bash com `run_in_background` lançados no
turno. Com a lista presente e vazia, vale ela: terminou. Quem espera em segundo plano não fica `stale`.

## Vigia e Avisos

O dono vigia uma sessão pelo detalhe dela no painel web (`POST /api/sessions/:id/watch` e `/unwatch`). A vigia fica
em `~/.config/painel-claude/vigia.json` (modo 600, escrita atômica, até 500 ids, só ids `[\w-]{1,80}`) e volta
depois de reiniciar o painel. É uma só para todas as Telas: a lista das sessões ganha `watched: true`.

O store chama a Vigia num ponto só (`onSessionChange(antes, depois, evento)` em `src/store.js`) a cada mudança
aplicada: evento de hook local ou remoto, adoção pelo `claude agents`, encerramento pelo painel e sessão esquecida
(`depois` vazio, também as esquecidas enquanto o painel estava desligado). As regras (`src/vigia.js`, as do
`GLOSSARY.md`):

- Só **Sessão vigiada** gera Aviso.
- Nasce Aviso quando a Situação **muda** para terminou (`idle` não vista), esperando você ou erro. Pedidos novos
  com a sessão já em esperando você não repetem o Aviso.
- Nasce também quando o turno acaba (Stop) e a sessão fica rodando só por comandos em segundo plano: todas as
  tarefas abertas de `background_tasks` são `shell`, ou, sem a lista, valem os comandos com `run_in_background`
  do turno e nenhum subagente ativo. Subagente, workflow ou colega entre elas: sem Aviso.
- Terminou e erro encerram a vigia; esperando você e comando em segundo plano a mantêm.
- Sessão encerrada ou esquecida perde a vigia, sem Aviso.
- Sessões de outras máquinas seguem as mesmas regras.

O Aviso leva só `{ id, situation: 'done' | 'error' | 'waiting' | 'background', name, project, machine? }`. O nome
é o título do Claude ou o do `claude agents`, nunca o primeiro pedido (sem nenhum dos dois, vai "sessão" e o
começo do id). Nunca leva o detalhe do tile, o comando, o pedido nem trecho da resposta. Por enquanto cada Aviso só
vai ao log do painel (`Aviso: done · nome · projeto · máquina`); o envio é a função `send` da Vigia, e falha nela
não atrasa nem derruba a ingestão dos eventos.

## Sessões já abertas (`claude agents --json`)

A cada 60 s o servidor roda `claude agents --json` (documentado: "Print active sessions (interactive and
background) as a JSON array and exit"), por `execFile`, sem shell, com o stdin fechado e timeout de 20 s. De cada
item usa `sessionId`, `cwd`, `kind`, `name`, `status` (`idle` ou `busy`), `startedAt` e, nas de segundo plano, o
id curto (`id`) que `claude stop` e `claude rm` aceitam. Sessão desconhecida entra como `adopted`, com o nome e a
pasta (`busy` = rodando; senão parada) e o transcript, se existir em `~/.claude/projects`. Até chegar o primeiro
hook ela segue o status da lista; se sumir da lista, encerra. Sessão que já fala por hook não é tocada. A sonda do
`/usage` roda numa pasta só dela e fica de fora. O painel não lê `~/.claude/sessions`. O caminho do `claude` é o
mesmo da sonda (`claudeBin` no `config.json` ou os lugares de sempre). `PAINEL_DESCOBRIR=0` desliga.

## Arquivar no painel

`POST /api/sessions/:id/archive` e `/unarchive` guardam o id em `~/.config/painel-claude/painel.json` (modo 600,
escrita atômica, até 500 ids, só ids `[\w-]{1,80}`). O app do Claude não é tocado. A sessão continua em
`/api/sessions`, com `archived: true`; o painel web a esconde dos quadros, da grade e do mapa, menos quando ela
espera você. O mesmo arquivo guarda as sessões abertas pelo painel (id curto e sessão mãe).

## Sessões filhas (app do Claude)

O app do Claude no Mac guarda um arquivo por sessão em
`~/Library/Application Support/Claude/claude-code-sessions/<conta>/<org>/local_<id>.json`. `src/app-links.js` lê
dali só `cliSessionId` (o id dos hooks), `priorCliSessionIds`, `spawnedFrom.sessionId`, `startChain.depth` e
`scheduledTaskId` (sessão de tarefa agendada: vira `scheduled: true`), e só dos arquivos mexidos nos últimos 30
dias (mais o arquivo da mãe, se for mais antigo). Só leitura. Relê a cada 20 s, só o que
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
| `POST /api/sessions/:id/archive`, `/unarchive` | arquiva ou desarquiva só no painel. Token **só no cabeçalho** |
| `POST /api/sessions/:id/watch`, `/unwatch` | vigia ou para de vigiar. 200 `{ id, watched }`; 404 se a sessão não existe ou foi encerrada (só em `watch`). Token das Telas **só no cabeçalho**; o do relógio não vale |
| `GET /api/settings` | `{ features, canChange }`: `canChange` é `true` só no próprio Mac (loopback sem proxy) |
| `POST /api/settings` | `{ chat?, launch?, closeRemove? }` (booleanos). Token no cabeçalho **e** do próprio Mac; senão 403 |
| `POST /api/sessions/:id/message` | `{ text }` (até 4000). Ajuste `chat`. 200 `{ status: delivered \| queued }`; 409 se a sessão ainda não ouve o painel |
| `GET /api/projects` | `{ projects: [{ path, name }], canLaunch }`: pastas de projeto vistas nas sessões. Ajuste `launch` |
| `POST /api/sessions` | `{ cwd, prompt, name? }` ou `{ parentId, prompt, name? }`. Ajuste `launch`. Roda `claude --bg` |
| `POST /api/sessions/:id/close`, `/remove` | `claude stop` / `claude rm`, só sessões em segundo plano. Ajuste `closeRemove` |
| `POST /chat/wait` | entrada do hook do chat; só do próprio Mac |
| `POST /hook`, `POST /permission`, `POST /usage` | entrada dos hooks e da status line; só do próprio Mac |
| `POST /remote/hook`, `/remote/permission`, `/remote/transcript` | entrada das outras máquinas (veja abaixo) |
| `GET /api/push/key` | `{ publicKey, devices }`: a chave pública VAPID, para o navegador se inscrever. Token **só no cabeçalho** |
| `POST /api/push/subscribe` | o `PushSubscription.toJSON()` do navegador. Registra o aparelho (o mesmo endpoint não duplica). 400 se a inscrição não vale. Token **só no cabeçalho** |
| `POST /api/push/unsubscribe` | `{ endpoint }`. Tira o aparelho da lista. Token **só no cabeçalho** |
| `POST /api/push/test` | manda o Aviso de teste a todos os aparelhos e espera: `{ sent, removed, failed, devices }`. Token **só no cabeçalho** |
| `GET /api/watch` | lista do relógio: `{ sessions, total, counts, usage? }` (veja abaixo). Token do relógio **ou** das Telas, **só no cabeçalho** |
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
- Campos opcionais, só quando valem: `scheduled: true` (tarefa agendada do app), `archived: true` (arquivada no
  painel), `background: true` (sessão em segundo plano: dá para fechar e apagar) e `chat: 'ready' | 'busy'` (com o
  ajuste de mensagens ligado e a sessão ouvindo o painel). Sessão aberta pelo "+ sessão filha" ganha `parentId`.
  `watched: true` marca a **Sessão vigiada** (também nas de outras máquinas); o widget e o display a ignoram.
- O snapshot leva `features: { chat, launch, closeRemove }`, os Ajustes.
- O detalhe traz também `lastPromptAt`, `lastChat` (`{ text, at }`, a última mensagem do painel) e `chatHistory`
  (até 10: `{ id, text, at, status: pending | delivered | dropped }`).
- `usage` é `{ fiveHour?, sevenDay?: { usedPercentage, resetsAt }, updatedAt, source }`, com os horários em ms;
  `source` é `statusline` ou `app`, e `resetsAt` pode ser `null` quando o reset ainda não é conhecido. O cálculo
  do ritmo fica em `public/pace.js`, puro, para o widget e o ESP32 usarem a mesma conta.

O HTML leva a versão dos arquivos de `public/` (um hash), e cada snapshot também. Quando as duas diferem, a página
recarrega sozinha, uma vez por versão.

## Ajustes (grupo 2)

`config.json` ganha `features: { chat, launch, closeRemove }`, todos `false` por padrão. O servidor lê na partida
e muda só por `POST /api/settings`, que pede o token no cabeçalho **e** que o pedido venha do próprio Mac
(`isLocalHook`: 127.0.0.1 sem cabeçalhos de proxy). O que chega pelo `tailscale serve` ou pela rede é recusado,
mesmo com o token. Com o ajuste desligado, a rota dele responde 403 "desligado nos Ajustes" e o botão some.

## Mensagens para a sessão

Um mecanismo só, documentado: um hook com `asyncRewake` (code.claude.com/docs/en/hooks, "Run hooks in the
background"). `hooks/esperar-mensagem.sh` roda em segundo plano em SessionStart e Stop e faz `POST /chat/wait`.

- **Ajuste desligado:** o servidor responde 204 na hora e o hook sai com 0. Nada fica pendurado.
- **Ajuste ligado:** a conexão fica aberta até chegar uma mensagem. Aí o servidor responde 200 com o texto, o hook
  o escreve no stderr e sai com 2, e o Claude Code acorda a sessão com ele como lembrete do sistema, mesmo parada.
  Sessão no meio do turno: a mensagem entra na fila (até 5) e sai no próximo Stop.
- **Ligar ou desligar:** desligar solta todos os hooks pendurados (204) e descarta a fila. Ligar vale para cada
  sessão a partir do próximo Stop ou SessionStart dela, que é quando o hook roda de novo; por isso o hook fica
  sempre instalado, e não é preciso rodar o instalador de novo.
- **Painel fora do ar:** o hook tenta de novo 12 vezes, de 5 em 5 s (um reinício do serviço), e desiste.
- O Claude Code encerra o hook depois de 12 h (`timeout` do `settings.json`); a sessão volta a ouvir no próximo
  Stop.

O texto que o Claude lê diz que a mensagem foi digitada pelo usuário no Painel Claude, fora daquela janela, e que
não vale como resposta a pedido de permissão. Não há outro caminho de entrega (o painel não usa o socket de
mensagens entre sessões nem lê arquivos internos do Claude Code).

## Abrir, fechar e apagar sessões

- **Abrir:** `claude --bg [--name <nome>] <pedido>` por `execFile`, sem shell, na pasta escolhida, que precisa ser
  uma das pastas de projeto vistas nas sessões deste Mac. Pedido que começa com `-` ganha um espaço na frente para
  não virar opção. O id curto que o `claude` imprime ("backgrounded · <id> · …") é ligado à sessão quando ela
  aparece no `claude agents`; "+ sessão filha" grava também a mãe, e a filha entra na família.
- **Fechar e apagar:** `claude stop <id>` e `claude rm <id>`, só para sessões abertas pelo painel ou listadas
  como `kind: "background"` pelo `claude agents --json`. O painel nunca manda sinal a processo nenhum, então
  sessões do app e do terminal não são fechadas por ele. `rm` apaga também o worktree da sessão.

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

## Relógio Garmin (Forerunner 165)

O app do relógio fica em `relogio/` (passo a passo em [relogio/README.md](../relogio/README.md)). Ele pede
`GET /api/watch` pelo celular (Garmin Connect → Tailscale do celular → `tailscale serve`) a cada 10 s com o app
aberto.

- **A lista** (`src/watch.js`): só as sessões **em movimento** (rodando, esperando você, erro, terminou não visto),
  não arquivadas nem sem sinal, até 8, na ordem da grade. Leva o que o mostrador redondo mostra, e nada além:
  - em cada sessão: `id`, `name` (até 48 caracteres), `project`, `status` (`waiting` | `error` | `done` |
    `working`, sendo `done` o terminou ainda não visto) e `age` (segundos na Situação); quando houver, `machine`,
    `activity`, `context` (tokens), `model`, `turns`, `open` (segundos desde que foi aberta) e `ask`
    (`{ kind, tool?, count }`: o tipo do pedido e o **nome** da ferramenta);
  - `total` e `counts` (`waiting`, `working`, `done`, `error`): todas em movimento, não só as 8;
  - `usage`: `fiveHour` e `sevenDay` (`{ percent, resetsIn }`, em segundos) e até 2 limites por modelo.
  Nunca vai o comando, o pedido, o detalhe do tile nem trecho de resposta. O `tool` da grade é a descrição pronta
  ("Bash: npm test") e leva o comando, por isso a grade passou a mandar também o `toolName`, e o relógio só recebe
  esse. Com 8 sessões a resposta tem uns 2 kB, longe dos ~27 kB que o 165 aceita.
- **O token do relógio** (ADR 0002): fica em `config.json` como `watch.token` (32 bytes, modo 600), separado do
  token das Telas. Vale só em `/api/watch` e só no cabeçalho; nas outras rotas o servidor confere só o das Telas,
  então ele recebe 401. O token das Telas também lê a lista. `node scripts/relogio.js token` gera e
  `node scripts/relogio.js revogar` apaga; os dois reiniciam o serviço, porque o token é lido no início.
- **Na build**: `relogio/scripts/build.sh` chama `node scripts/relogio.js segredos`, que grava o endereço (o
  `DNSName` do `tailscale status`, ou `PAINEL_URL`) e o token em `relogio/gerado/Segredos.mc`, fora do git. O
  token nunca aparece na tela. Não são *properties*, porque o simulador guarda as da primeira execução.

## Avisos (Web Push)

O **Aviso** (veja o [GLOSSARY.md](../GLOSSARY.md)) sai do painel como Web Push para cada aparelho que deu licença, e
o Garmin Connect o repete no relógio (ADR 0001). Tudo com `node:crypto`, sem dependência nova:

- **`src/webpush.js`** (puro): chaves VAPID P-256, o JWT VAPID com ES256 (RFC 8292, `aud` = origem do serviço de
  push, `exp` em 12 h, `sub` = contato do painel) e a criptografia do payload para o aparelho (RFC 8291, conteúdo
  `aes128gcm` da RFC 8188, um registro de 4096 bytes). Os testes conferem byte a byte o exemplo da RFC 8291 e
  verificam o JWT com a chave pública.
- **Chaves VAPID**: geradas na primeira partida e guardadas em `config.json` como `vapid: { publicKey, privateKey }`
  (modo 600). `vapid.subject` troca o contato que vai no JWT (padrão: o endereço do repositório). Trocar as chaves
  invalida as inscrições: cada aparelho pede a licença de novo.
- **Inscrições** (`src/push.js`): ficam em `aparelhos.json` (modo 600), até 20, sem duplicar o endpoint. Só aceita
  endpoint `https` dos serviços de push dos navegadores (`fcm.googleapis.com`, `*.push.services.mozilla.com`,
  `*.notify.windows.com`, `*.push.apple.com`), para o painel não fazer POST a qualquer endereço.
- **Envio**: o mesmo Aviso vai a todos os aparelhos, com `Urgency: high` e `TTL: 600`. Resposta 404 ou 410 apaga a
  inscrição (app desinstalado, licença retirada). Outros erros vão para o log só com o host do serviço e o motivo,
  nunca o conteúdo do Aviso nem o endpoint (que é um segredo do aparelho). `push.notify(aviso)` manda sem esperar,
  para a ingestão de eventos não parar; `push.send(aviso)` devolve `{ sent, removed, failed, devices }`.
- **Payload** (JSON, até ~3,9 kB): `{ status, name?, project?, machine?, sessionId? }`, com `status` = `done` |
  `error` | `waiting` | `background` | `test`. Nunca o comando, o pedido, o detalhe do tile nem trecho de resposta,
  porque aparece na tela bloqueada e no relógio.
- **Service worker** (`public/sw.js`): no `push`, mostra a notificação ("Terminou · nome", com o projeto e a
  máquina embaixo) com a etiqueta `sessao-<id>`, para o Aviso novo da mesma sessão substituir o anterior e vibrar
  de novo. O toque abre o painel (ou foca o que já está aberto) no detalhe da sessão, pelo `#sessao=<id>`.
- **Ajustes → Neste aparelho** (`public/push-settings.js`): a linha "Avisos neste aparelho" mostra o estado
  (recebendo, desligado, bloqueado, sem suporte), pede a licença com um toque, inscreve o aparelho e manda o Aviso
  de teste. Vale por aparelho, por isso funciona também no celular (as chaves de cima continuam só do Mac). Ao abrir
  o painel com a licença dada, ele se reinscreve em silêncio, caso o servidor tenha apagado a inscrição ou o
  navegador a tenha trocado.

## Instalar como app (PWA)

O painel tem manifest, ícones (192, 512 e maskable), ícone da Apple e um service worker. O service worker não
guarda estado: mostra a tela "Sem conexão com o Mac" quando o Mac não responde e recebe os Avisos (veja acima). O Android e o iPhone só
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

## Quadros, grade e mapa

Por aparelho (`localStorage`): o modo (`painel-claude-modo`), as agendadas à vista, os quadros recolhidos e
fixados, as famílias abertas, o nível do mapa e a largura do painel lateral.

- `public/groups.js` (puro): quadros por projeto e máquina, contadores, largura (`spanOf`: o mínimo de linhas e,
  com elas, a menor largura) e fixados primeiro (`pinnedFirst`). `visibleSessions` tira as arquivadas e, se
  pedido, as agendadas, menos quem espera você.
- `public/orbit.js` (puro): a árvore projeto → sessão → filhas e as posições em leque; `public/orbit-view.js`
  desenha, com o robô no núcleo. Sem animação com `prefers-reduced-motion`.
- `public/sheet-resize.js`: largura do painel lateral (arrastar, setas, dois cliques).

## Desenvolvimento

```bash
npm test
PAINEL_DIR=/tmp/painel-teste PAINEL_PORT=7788 PAINEL_DEBUG=1 npm start
```

- `PAINEL_DESCOBRIR=0` desliga a descoberta pelo `claude agents` (útil num painel de teste, para não trazer as
  suas sessões reais).
- Com `PAINEL_DEBUG=1`, os eventos vão para `eventos.log`. Nesse log, prompt, `tool_input` e mensagens aparecem
  só como nomes de campos ou tamanho, sem o conteúdo.
- `bash instalar.sh --aqui` instala usando a própria pasta em vez de copiar.
- `bash instalar.sh --sem-servico` faz tudo menos o serviço launchd. Serve para testar com outro `HOME`.
- Reiniciar o serviço: `launchctl kickstart -k gui/$(id -u)/br.com.gflex.painel-claude`.
- Gerar o pacote para mandar a alguém: `bash scripts/empacotar.sh`. O resultado sai em
  `dist/painel-claude-AAAA-MM-DD.zip`, sem estado, tokens, segredos do firmware nem builds. O script para se achar
  algo com cara de token.
