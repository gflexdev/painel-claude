# Relógio Garmin: teste de viabilidade

Teste feito em 2026-11-23, antes de escrever o app do relógio ([ADR 0002](adr/0002-relogio-pelo-cabo-com-token-na-build.md)).
A pergunta: um app Connect IQ no Forerunner 165 alcança o painel no endereço `https://…ts.net` do Tailscale?

## Como foi feito

Um app de teste descartável (fora do repositório) faz dois GET sem token e mostra o código e o tempo de cada um:
`/health`, que deve responder 200, e `/api/sessions`, que deve responder 401. O 401 já prova a ida e a volta até o
painel.

O ambiente de desenvolvimento é o do projeto `gflex/garmin-hevy`, que já tinha tudo validado no mesmo Mac:
- SDK 9.2.0, com os perfis `fr165` e `fr165m`, compilado com Java 11;
- a chave de desenvolvedor em `~/.garmin-ciq/`;
- o simulador e as capturas de tela pelos scripts dele;
- a instalação no relógio pelo OpenMTP.

## Resultados

| Onde | Situação | `/health` | `/api/sessions` (sem token) |
|---|---|---|---|
| Simulador do fr165 no Mac | Tailscale ligado no Mac | 200 · 286 ms | 401 · 54 ms |
| Forerunner 165 pelo celular (S25+) | Tailscale **desconectado** no celular | -300 · 299 ms | -300 · 359 ms |
| Forerunner 165 pelo celular (S25+) | Tailscale conectado no celular | **200 · 574 ms** | **401 · 358 ms** |

Com o Tailscale ligado, o Mac viu o celular em conexão direta pela rede de casa.

## O que isso decide

- **O relógio alcança o painel pela tailnet, sem expor nada à internet.** O Garmin Connect do Android passa pelo
  Tailscale do celular, sem ajuste nenhum. Não precisa de Funnel, túnel público nem proxy.
- **O Tailscale do celular precisa estar conectado.** Desconectado, o relógio recebe `-300` em menos de meio
  segundo. Esse erro, rápido assim, quer dizer "o celular não achou o painel": o app deve mostrar isso como
  "sem tailnet no celular", não como "Mac desligado".
- **O simulador alcança o painel direto.** O Mac está na tailnet e o `tailscale serve` tem certificado válido, então
  o simulador conversa com o painel de verdade. Não precisa do túnel cloudflared nem do mock que o `garmin-hevy` usa,
  e o conflito entre o túnel e o Tailscale anotado lá não existe aqui.
- **O tamanho da lista cabe.** `/api/sessions` tinha 7 kB com 16 sessões (cerca de 410 bytes cada). O limite medido no
  165 fica entre 27 kB (passa) e 158 kB (dá `-402`). Com umas 60 sessões a lista passaria do limite. Por isso, se
  um dia isso apertar, uma rota só com as sessões em movimento resolve.
- **Tempo:** cerca de 0,4 a 0,6 s por pedido pelo celular. Atualizar a lista a cada 10 s com o app aberto é folgado.

## O relógio repete a notificação do painel

Também em 2026-11-23, testamos a condição da [ADR 0001](adr/0001-avisos-por-web-push.md). Uma página temporária, no
mesmo endereço `ts.net` do painel (montada à parte com `tailscale serve --set-path` e desmontada depois), pediu
licença e mostrou uma notificação pelo service worker do painel. O painel estava instalado como app no S25+.
**A notificação chegou ao Forerunner 165.** O Garmin repete os Avisos do painel sem nenhum ajuste no Garmin Connect,
e o plano B da ADR 0001 (ntfy) não é necessário.

O teste usou uma notificação local, não um Web Push de verdade. O caminho até o relógio é o mesmo, mas a entrega pelo
serviço de push do Google só fica provada quando o painel mandar o primeiro Aviso.

## Ainda não testado

- O Web Push de ponta a ponta (VAPID e payload criptografado) com o app do painel fechado.
- O token dentro do arquivo compilado e as rotas que o relógio vai usar (lista e vigia).

## Cuidados para o app do relógio

- O endereço e o token devem entrar como constante na build, não como *properties*: o simulador (e,
  provavelmente, o relógio) guarda as properties da primeira execução e ignora as novas.
- Na instalação pelo OpenMTP, feche antes o *Android File Transfer Agent*, que segura a conexão USB do relógio.
- Linhas de texto longas são cortadas pela borda redonda: no teste, "health 200 574ms n=16" já perdeu as pontas.
