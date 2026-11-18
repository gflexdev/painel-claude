# Painel Claude — widget do macOS

Widget de mesa e da Central de Notificações (pequeno, médio e grande) que mostra as sessões do Claude Code que
o servidor do painel conhece, na mesma ordem do painel web, com o robozinho de cada uma. Quando uma sessão
espera você, o widget mostra o pedido e deixa responder ali mesmo:

| Pedido | Botões no widget |
|---|---|
| Permissão (Bash, Edit, …) | **Permitir** / **Negar** |
| Plano (ExitPlanMode) | **Aprovar** / **Recusar** |
| Pergunta (AskUserQuestion) com uma pergunta, escolha única | uma tecla por opção (até 4; no pequeno, até 2) |
| Pergunta com várias perguntas, múltipla escolha ou texto | **Responder no painel ›** (abre o painel web) |

Tocar numa sessão abre o painel web no navegador, já no detalhe dela (`#sessao=<id>`). Vale quem responder primeiro: widget, painel web ou o
diálogo do Mac.

Requer macOS 14 ou mais novo, Xcode 15+ e o servidor do painel rodando (`npm run install-mac` na pasta de cima).

## Como funciona

```
servidor :7777 ──SSE──▶ app "Painel Claude" (barra de menus) ──estado.json──▶ widget
                               ▲                                               │
                               └──────────── decisoes/*.json ◀── botão ────────┘
```

- **App hospedeiro** (`App/`): fica só na barra de menus, sem janela nem ícone no Dock. Escuta
  `GET /api/stream`, busca o pedido completo em `GET /api/sessions/:id` quando aparece um pedido novo e grava
  `~/Library/Application Support/PainelClaude/estado.json` (sem o token). Recarrega o widget na hora quando
  muda algo que importa (situação, pedido, sessão nova, "terminou · ver") e, para mudanças de detalhe
  (ferramenta em uso), no máximo uma vez por minuto, porque o WidgetKit tem orçamento de recargas.
- **Widget** (`Widget/`): roda em sandbox, só com acesso a essa pasta. Não fala com o servidor e não vê o
  token. O botão (uma App Intent) grava a decisão em `decisoes/`, o app manda `POST /api/permissions/:id`
  com o token no cabeçalho e o widget volta já atualizado (leva uns 0,2 s).
- O "há quanto tempo" anda sozinho: cada recarga gera 30 entradas, uma por minuto.
- `Shared/Robo.swift` é o porte de `public/bot.js`: mesmo hash e mesmo sorteio, o robô sai igual ao da web.

## Compilar e instalar

```bash
brew install xcodegen
```

```bash
./instalar.sh
```

O script gera o `PainelClaude.xcodeproj` a partir do `project.yml`, compila em Release, copia para
`~/Applications/Painel Claude.app` e abre o app. Só compilar:

```bash
xcodegen generate && xcodebuild -project PainelClaude.xcodeproj -scheme PainelClaude -configuration Release -derivedDataPath build/dd build
```

Depois, para pôr o widget na tela: clique com o botão direito na mesa → **Editar Widgets…** → procure
**Painel Claude** → escolha o tamanho. No menu do app (ícone na barra de menus) ligue
**Abrir ao iniciar o Mac**, para o widget continuar atualizado depois de reiniciar.

### Assinatura

O projeto assina **localmente (ad-hoc)**, sem conta Apple: serve para rodar neste Mac. Para assinar com um
time (por exemplo, para levar para outro Mac), troque no `project.yml`:

```yaml
CODE_SIGN_STYLE: Automatic
CODE_SIGN_IDENTITY: "Apple Development"
DEVELOPMENT_TEAM: <ID do time>
```

e compile com `-allowProvisioningUpdates`. Nada mais muda: o widget não usa App Group nem Keychain
compartilhado.

## Token

Não há o que configurar: na primeira vez o app lê o token de `~/.config/painel-claude/config.json` (o mesmo
arquivo do servidor) e guarda no **Keychain** (login, serviço `br.com.gflex.painel-claude.mac`). Depois ele
lê do Keychain. O token nunca vai para o código, para o `estado.json`, para o widget nem para URLs.

- Trocou o token do servidor? O app percebe o 401 e lê o `config.json` de novo. Também dá para forçar pelo
  menu: **Reimportar token do servidor**.
- Se o Keychain recusar a leitura sem perguntar (acontece depois de recompilar, porque a assinatura ad-hoc
  muda), o app usa o `config.json` direto e não abre diálogo nenhum.
- Para apagar: `security delete-generic-password -s br.com.gflex.painel-claude.mac`.

## Problemas

| Sintoma | O que fazer |
|---|---|
| Widget diz "Abra o app Painel Claude" ou "App Painel Claude fechado" | Abra `~/Applications/Painel Claude.app` |
| "Mac sem resposta do painel" | O servidor está fora: `launchctl kickstart -k gui/$(id -u)/br.com.gflex.painel-claude` |
| O widget não aparece na galeria | `pluginkit -m -p com.apple.widgetkit-extension \| grep painel`; se não listar, abra o app de novo |
| "Esse pedido já foi respondido no Mac." | Alguém respondeu antes (diálogo ou painel web); o widget só avisa |
| Tocar na sessão pede o token no navegador | Esse navegador nunca abriu o painel: cole o token uma vez (o hash `#sessao=` continua valendo) |

Logs do app: `log stream --predicate 'subsystem == "br.com.gflex.painel-claude.mac"'`.
