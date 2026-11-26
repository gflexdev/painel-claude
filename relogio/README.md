# App do relógio (Forerunner 165)

Watch-app Connect IQ com a cara e as visões do mostrador redondo (`firmware/src/round/`): as mesmas cores, as
mesmas fontes (Space Grotesk e JetBrains Mono) e o Clawd com as mesmas poses. Mostra as sessões **em movimento**,
até 8, na ordem de urgência da grade.

- **Três páginas**, trocadas deslizando para o lado ou com UP/DOWN (as bolinhas embaixo dizem onde você está):
  - **Visão geral**: o Mapa em órbita, com um Clawd por sessão e o Clawd grande no meio, na situação mais
    urgente. Ele pula e acena (esperando você), anda digitando (rodando), comemora (terminou), faz olhos de X
    (erro) ou dorme com zzz (tudo parado). Tocar num Clawd da órbita abre a sessão; tocar no do meio (ou START)
    faz ele pular com um coração. Em cima, a hora; embaixo, quantas esperam, rodam, terminaram e deram erro.
  - **Sessões**: a lista com o Clawd, o ícone da atividade, a palavra do tile ("APROVAR?", "EDITANDO"…) e o tempo
    na situação. UP/DOWN anda pela lista; START ou tocar abre a sessão.
  - **Uso do plano**: a janela de 5 h no arco de fora e a semana no de dentro, com o tracinho do ritmo e quando
    zera.
- **Detalhe**: o Clawd da sessão, o contexto no anel, os números (contexto, pedidos, aberta há quanto tempo) e o
  que ela está fazendo. UP/DOWN passa para a sessão vizinha; BACK (ou deslizar para baixo) volta.
- **Esperando você**: quando uma sessão passa a esperar você, o relógio vibra duas vezes (o "plim-plim" do
  mostrador) e abre a sessão sozinho, com a borda vermelha pulsando e o pedido ("PEDE PERMISSÃO · BASH"). Não há
  Permitir nem Negar: o relógio só acompanha, e a decisão fica para o Mac ou o celular. Ao abrir o app, quem já
  esperava não vibra de novo. Com o app fechado, quem avisa é o Aviso do celular, que o Garmin repete no pulso.

O que fica de fora do mostrador: o brilho que escurece sozinho (o relógio cuida da tela) e os botões de decidir
pedidos. O relógio nunca recebe o comando, o pedido nem trecho de resposta.

O pedido sai do relógio, passa pelo Garmin Connect do celular e pelo Tailscale do celular, e chega ao
`tailscale serve` do Mac (`https://<mac>.<rede>.ts.net`). Por isso o Tailscale do celular precisa estar conectado
(veja [docs/relogio-viabilidade.md](../docs/relogio-viabilidade.md)).

## Instalar

Precisa de: o painel instalado e o `tailscale serve` ligado (README da raiz), o SDK do Connect IQ marcado como
Current no SDK Manager, Java 11, a chave de desenvolvedor em `~/.garmin-ciq/developer_key.der` e o
[OpenMTP](https://openmtp.ganeshrvel.com).

```bash
relogio/scripts/instalar.sh
```

O script:
1. gera o token do relógio, se ainda não houver, e reinicia o painel para ele valer;
2. compila o app com o endereço do Mac na tailnet e o token como constantes (ADR 0002). Eles ficam em
   `relogio/gerado/` e o `.prg` em `relogio/bin/`, as duas pastas fora do git;
3. fecha o *Android File Transfer Agent*, mostra o `.prg` no Finder e abre o OpenMTP;
4. diz o passo que falta: arrastar o `.prg` para **GARMIN → Apps** no relógio e desconectar o cabo.

Para o Forerunner 165 Music, use `relogio/scripts/instalar.sh fr165m`. O cabeçalho do OpenMTP mostra o modelo.

## Token do relógio

O relógio tem um token só dele, separado do token das **Telas**. Ele vale só para a lista do relógio
(`GET /api/watch`): em qualquer outra rota recebe 401.

```bash
node scripts/relogio.js token     # gera (se não houver) e reinicia o painel
node scripts/relogio.js revogar   # apaga: o relógio passa a mostrar "token inválido"
```

Se o relógio se perder, revogue. Para voltar a usar, rode o `instalar.sh` de novo: ele gera outro token e
compila com ele.

## O que o relógio diz quando algo falha

| Na tela | Quer dizer |
|---|---|
| sem tailnet no celular | `-300` em menos de 2 s: o celular não achou o painel. Ligue o Tailscale do celular |
| painel não respondeu | `-300` demorado: o Mac está desligado ou o painel caiu |
| sem celular | `-104`: o relógio não está conectado ao celular |
| token inválido | 401: o token foi revogado ou trocado. Instale o app de novo |
| resposta grande | `-402`: a resposta passou do limite do 165 (~27 kB) |
| precisa de https | `-1001`: o endereço compilado não é https |

Sem dado ainda, a tela mostra o Clawd apagado, o motivo e o que fazer. Se já havia um painel na tela, ele fica,
e o erro aparece numa pílula vermelha no topo.

## Desenvolver

```bash
relogio/scripts/test.sh                 # testes (:test) da lógica pura, no simulador
relogio/scripts/run-sim.sh              # compila e abre no simulador, contra o painel de verdade pelo ts.net
relogio/scripts/screenshot-sim.sh       # captura a janela do simulador em relogio/bin/simulador.png
```

- Lógica pura e testada: `source/model/` (`Leitura` lê a resposta, `Palavras` monta os textos, `Cores` traz a
  paleta do mostrador, `Erros` dá nome aos erros) e `source/clawd/Clawd.mc` (porte de
  `firmware/src/app/clawd.cpp`: as poses quadro a quadro). As telas ficam em `source/ui/`, com as medidas do
  mostrador (466 px) levadas à tela de 390 px por `Tela.s`.
- Fontes: `relogio/tools/gerar-fontes.sh` baixa as mesmas do firmware e gera os BMFont de `resources/fonts/`
  (precisa do `uv`). Os tamanhos são maiores que a conta direta, porque a tela do 165 é fisicamente menor.
- O app anima a 8 quadros por segundo e busca a lista a cada 10 s, só enquanto está aberto.
- No `BehaviorDelegate`, o comportamento vem antes do evento bruto: a Visão geral e a lista devolvem `false` em
  `onSelect` para o START chegar em `onKey` e o toque em `onTap`, com as coordenadas.
- `PAINEL_URL=https://…` no `build.sh` troca o endereço. O simulador também recusa `http` (`-1001`). Para testar um
  painel de outro branch, suba-o numa porta livre, com uma cópia dos dados (`PAINEL_DIR`), e publique-o pela
  tailnet só enquanto testa: `tailscale serve --https=8443 http://127.0.0.1:<porta>`, sem `--bg`, some ao fechar.
- As capturas mostram sessões de verdade: ficam em `relogio/bin/`, fora do git.
- Os scripts seguem os do projeto `garmin-hevy`, onde o ambiente do Connect IQ foi validado.
