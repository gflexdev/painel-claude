---
status: accepted
---

# Avisos por Web Push, mesmo passando pelo Google

O dono quer sentir no pulso (Garmin Forerunner 165) quando uma **Sessão vigiada** termina, espera por ele ou dá
erro. Um app Connect IQ não recebe push: ele só pergunta ao Mac, e em segundo plano no máximo de 5 em 5 minutos.
Por isso o **Aviso** sai do painel como Web Push para o painel instalado no celular (Android, pelo Chrome), e o
relógio o repete como qualquer notificação do celular. O push é implementado com `node:crypto` (VAPID e a
criptografia do payload), sem dependência nova.

Isso abre uma exceção ao "nada sai do seu Mac" do README: o Aviso passa pelo serviço de push do Google. O payload
vai criptografado de ponta a ponta e leva só a situação, o nome da sessão e o projeto, nunca o comando nem um
trecho da resposta, porque também aparece na tela bloqueada e no relógio.

## Opções consideradas

- **Só o app do relógio, sem push:** o aviso chegaria até 5 minutos atrasado e não vibraria como notificação de
  verdade.
- **ntfy:** no servidor público ntfy.sh a mensagem passa aberta; mesmo com servidor próprio no Mac, o app do
  iPhone depende do ntfy.sh para acordar. Fica como plano B se o Garmin não repetir a notificação do painel.
- **Pushover:** é pago e a mensagem vai aberta para um serviço de fora.
