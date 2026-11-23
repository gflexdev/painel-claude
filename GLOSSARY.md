# Painel Claude

Mostra as sessões do Claude Code do Mac (e de máquinas ligadas a ele) e deixa o dono agir nelas de longe, por
várias telas.

## Linguagem

### Sessões

**Sessão**:
Uma conversa do Claude Code que o painel enxerga, aberta no terminal, no app do Claude ou numa máquina remota.
_Evitar_: agente, conversa, chat

**Situação**:
Em que pé a sessão está: rodando, esperando você, terminou, erro, parada ou encerrada.
_Evitar_: status, estado

**Esperando você**:
Situação de uma sessão parada num pedido de permissão, numa pergunta ou num plano para aprovar.
_Evitar_: bloqueada, pendente

**Terminou**:
Situação de uma sessão cujo turno acabou e que o dono ainda não viu.
_Evitar_: concluída, pronta

**Em movimento**:
Sessão que está rodando, esperando você, com erro ou com terminou ainda não visto, e não arquivada.
_Evitar_: ativa, aberta

### Avisos

**Vigiar**:
Pedir ao painel que mande um **Aviso** quando uma sessão chegar a terminou, esperando você ou erro.
_Evitar_: marcar, acompanhar, seguir

**Sessão vigiada**:
Uma sessão que o dono escolheu vigiar, até ela chegar a terminou ou erro; só ela gera **Avisos**.

**Aviso**:
A notificação que o painel manda ao celular do dono, e que o relógio repete no pulso.
_Evitar_: notificação, alerta, push

### Telas

**Tela**:
Um lugar onde o dono vê as sessões e age nelas: painel web, widget do Mac, display da bancada ou relógio.
_Evitar_: cliente, dispositivo

## Relações

- Um **Aviso** sai sempre de uma **Sessão vigiada**; sessão que não é vigiada nunca gera **Aviso**
- Um **Aviso** nasce de uma mudança de **Situação** para terminou, esperando você ou erro
- Também nasce um **Aviso** quando o turno acaba deixando só comandos em segundo plano (um servidor de dev, um
  build): a sessão continua rodando para o painel, mas o dono fica sabendo que o resto acabou
- O **Aviso** de terminou ou erro encerra a vigia; os de esperando você e de comando em segundo plano não, e a
  sessão continua **vigiada**
- Subagente ou workflow em segundo plano não gera **Aviso**: a sessão vai acordar de novo sozinha
- Para ser avisado de novo depois de terminou, o dono vigia a sessão outra vez
- Uma **Sessão vigiada** tem uma vigia só, a mesma em todas as **Telas**
- O dono vigia pelo painel web (na sessão, ou ao mandar um pedido ou abrir uma sessão nova) e pelo relógio;
  o relógio só vigia, não aprova nada
- O relógio mostra só sessões **em movimento**, até 8, na ordem de urgência
- Cada **Aviso** vai a todo aparelho que deu licença para recebê-lo; o relógio recebe repetindo o celular

## Exemplo de conversa

> **Dev:** "A sessão do deploy pediu permissão no meio do caminho. Vai **Aviso**?"
> **Dono:** "Só se ela for **vigiada**. Se eu não vigiei, ela aparece em **esperando você** nas **Telas**, mas
> o celular fica quieto."
> **Dev:** "E se era **vigiada**, depois que eu aprovo ela para de avisar?"
> **Dono:** "Não. Ela continua **vigiada** até terminar; aí chega o último **Aviso** e a vigia acaba."

## Ambiguidades resolvidas

- "marcar" servia tanto para vigiar quanto para "marcar como vista" (tirar o terminou): o primeiro agora é
  **Vigiar**; o segundo continua sendo "ver" a sessão.
- "notificação" é também o nome do evento `Notification` dos hooks do Claude Code: o que o painel manda ao
  celular é **Aviso**.
- "acompanhar" já nomeia a parte do painel onde se lê o detalhe da sessão, por isso não serve para **Vigiar**.
