# Ideia para a bancada: Painel de agentes Claude (display ESP32)

> Registro preparado em 2026-11-17 no formato **Ideia / Peça** da spec da bancada
> (`bancada/docs/superpowers/specs/2026-11-15-bancada-design.md`, seção 5, fase 2).
> A bancada ainda não tem Ideias (fase 2 não implementada); quando tiver, importar o JSON do fim deste arquivo.

## Ideia

- **Título:** Painel de agentes Claude (display ESP32 na bancada)
- **Situação:** em andamento (`in_progress`): placa comprada em 2026-11-17, aguardando chegar
- **Descrição:** Tela touch fixa na bancada, ligada por Wi-Fi ao servidor `painel-claude` do Mac, mostrando as
  sessões do Claude Code (rodando, esperando você, terminou sem ver, erro) com robozinhos por sessão; tocar abre o
  resumo e permite aprovar/negar permissões e responder perguntas. Sem bateria (fica na tomada/USB), caixa
  impressa em 3D. O celular e o tablet já usam a versão web enquanto o hardware não chega.
- **Notas:**
  - Software pronto no Mac: `gflex/painel-claude` (API `/api/stream` em SSE + JSON enxuto pensado para ESP32).
  - Firmware a fazer: LVGL consumindo `/api/stream`; token no cabeçalho; tela "Mac offline há X".
  - Referência de comportamento: `brushknight/agents-deck` (sem licença: só estudar, não copiar).
  - Pesquisa de preços (17/11/2026, sem frete; ML internacional já com ICMS):
    - 4" 480×480 Guition ESP32-4848S040 — AliExpress ~R$ 146 com impostos (minha escolha)
    - 4" 320×480 Pcbfun ESP32-S3 capacitivo — Shopee ~R$ 131 (+ICMS se cobrado)
    - 2,8" CYD ESP32-2432S028R resistivo — ML ~R$ 74 (internacional) / ~R$ 142 (nacional, chega em 2–3 dias)
    - 7" 1024×600 Guition JC1060P470C (ESP32-P4) — AliExpress ~R$ 308 com impostos
  - Nada de 480×480 com envio nacional; os baratos vêm da China (2–3 semanas).

## Peças

| # | Precisa | Qtd | Situação | Componente no estoque | Nota |
|---|---|---|---|---|---|
| 1 | Display touch ESP32 com Wi-Fi: **Guition ESP32-4848S040** (ESP32-S3, 4" 480×480 IPS, GT911) | 1 | comprar · **comprado em 2026-11-17** | — (catalogar quando chegar) | AliExpress, loja oficial Guition: https://pt.aliexpress.com/item/1005008214679682.html |
| 2 | Cabo USB-C (ou o conector da placa escolhida) | 1 | comprar | — | Não achei cabo catalogado; provavelmente já tem — confirmar. |
| 3 | Fonte 5 V USB ≥ 1 A | 1 | tenho | — | Porta USB do Mac ou carregador de celular; não catalogado. |
| 4 | Caixa impressa em 3D (filamento PLA/PETG) | 1 | tenho | — | Modelar depois de escolher a placa (medidas do datasheet). Filamento não catalogado. |
| 5 | Tela provisória: Tablet Samsung Galaxy Tab A 8.0 (SM-T385M) | 1 | tenho | `b98e5e33-5c73-441e-9366-bd6a9e69b24b` | Já roda a versão web enquanto o ESP32 não chega. |

## JSON para importar (formato da spec)

```json
{
  "title": "Painel de agentes Claude (display ESP32 na bancada)",
  "status": "in_progress",
  "description": "Tela touch fixa na bancada, ligada por Wi-Fi ao servidor painel-claude do Mac, mostrando as sessões do Claude Code com robozinhos por sessão; tocar abre o resumo e permite aprovar/negar permissões e responder perguntas. Sem bateria, caixa impressa em 3D.",
  "notes": "Software: gflex/painel-claude (/api/stream SSE). Firmware: LVGL. Opções (17/11/2026): Guition ESP32-4848S040 4\" 480x480 ~R$146 AliExpress (escolha); Pcbfun ESP32-S3 4\" 320x480 ~R$131 Shopee; CYD 2,8\" ~R$74 ML; JC1060P470C 7\" ~R$308 AliExpress.",
  "parts": [
    { "need": "Display touch ESP32 com Wi-Fi: Guition ESP32-4848S040 (ESP32-S3, 4\" 480x480 IPS, GT911)", "quantity": 1, "status": "buy",
      "purchaseUrl": "https://pt.aliexpress.com/item/1005008214679682.html",
      "purchased": true, "purchasedAt": "2026-11-17",
      "note": "Comprado na loja oficial Guition no AliExpress (~R$ 146 com impostos). Catalogar no estoque quando chegar." },
    { "need": "Cabo USB-C", "quantity": 1, "status": "buy", "note": "Provavelmente já tem; confirmar e catalogar." },
    { "need": "Fonte 5 V USB >= 1 A", "quantity": 1, "status": "have", "note": "Porta USB do Mac ou carregador de celular." },
    { "need": "Caixa impressa em 3D", "quantity": 1, "status": "have", "note": "Modelar após escolher a placa." },
    { "need": "Tela provisória: tablet Galaxy Tab A 8.0", "quantity": 1, "status": "have",
      "componentId": "b98e5e33-5c73-441e-9366-bd6a9e69b24b", "note": "Roda a versão web." }
  ]
}
```
