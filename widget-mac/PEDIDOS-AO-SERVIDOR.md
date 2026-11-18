# Pedidos ao servidor (e ao painel web)

O widget funciona com a API de hoje. Isto é o que falta para ele ficar completo, sem mexer em `src/` daqui.

## 1. Abrir o painel web direto numa sessão — feito

Tocar numa sessão do widget abre `http://127.0.0.1:7777/#sessao=<id>`. O painel web (`public/app.js`) abre o
detalhe dessa sessão no primeiro snapshot em que ela aparece, e também quando o hash muda com a aba aberta
(`hashchange`); depois limpa o hash. A leitura do hash é `sessionFromHash` em `public/format.js` (com teste em
`test/frontend.test.js`), e `public/api.js` passou a manter o hash quando a URL traz `?t=`.

## 2. (Opcional) Ordem explícita

O widget mostra as sessões na ordem em que chegam no snapshot (a mesma do painel web). Se a ordem passar
a ser feita no navegador e não no servidor, o widget precisa de um campo de ordem ou da mesma regra.
Hoje não precisa de nada.
