---
status: accepted
---

# Relógio instalado pelo cabo, com endereço e token dentro do arquivo

O app do relógio precisa do endereço do painel (o link `https://…ts.net` do Tailscale) e de um token. Os ajustes
de um app Connect IQ que não está publicado na loja (instalado pelo cabo ou como beta) não aparecem no Garmin
Connect do celular, só no Garmin Express do computador, segundo os relatos do fórum de desenvolvedores. Por isso um
script no Mac compila o app com o endereço e o token dentro e copia o `.prg` para `GARMIN/APPS` pelo USB. O arquivo
compilado fica fora do git, como os segredos do firmware do ESP32.

O relógio tem um token próprio, que só lê a lista de sessões e liga ou desliga a vigia. Se o relógio se perder,
esse token é revogado sem trocar o das outras **Telas**, no mesmo espírito do token separado das máquinas
remotas. Trocar o endereço ou o token pede compilar e passar pelo cabo de novo.

## Opções consideradas

- **App beta na loja Connect IQ, visível só para a conta do dono:** a instalação e as atualizações viriam sem
  cabo, mas o token seria digitado no Garmin Express e guardado pela Garmin, e cada versão teria de ser enviada ao
  painel de desenvolvedor da Garmin.
- **Publicar na loja:** os ajustes voltariam ao celular, mas o app ficaria público e passaria pela revisão da
  Garmin, para algo que só o dono usa.
