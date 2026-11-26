// Peças comuns do mostrador redondo (466×466 AMOLED): tamanho, cores e pequenos construtores.
// Fundo preto puro: no AMOLED o pixel preto fica apagado, a borda do vidro some e a tela gasta menos.
#pragma once

#include <lvgl.h>

#include <cstdint>
#include <string>
#include <vector>

#include "app/clawd.h"
#include "app/model.h"
#include "ui/theme.h"

namespace painel::round {

constexpr int kSize = 466;
constexpr int kCenter = kSize / 2;

namespace tone {
constexpr uint32_t kBlack = 0x000000;
constexpr uint32_t kTrack = 0x14161b;
constexpr uint32_t kChip = 0x121318;
constexpr uint32_t kRow = 0x111216;
constexpr uint32_t kBox = 0x0f1014;
constexpr uint32_t kBoxLine = 0x23262e;
constexpr uint32_t kDot = 0x3a3e48;
constexpr uint32_t kInkSoft = 0xb9bcc4;
}  // namespace tone

/** Rodando, esperando você, erro ou terminou sem ver — e não arquivada nem sem sinal. */
bool inMotion(const Session& s);
/** As sessões em movimento, na ordem do servidor (a mais urgente primeiro). */
std::vector<const Session*> inMotionOf(const Snapshot& snap);
/** "esperando você", "rodando", "terminou", "parada", "erro"… */
std::string situationWord(const Session& s);
/** Palavra curta em maiúsculas, como nos tiles da web: "APROVAR?", "EDITANDO", "TERMINOU · VER"… */
std::string tileWordUpper(const Session& s);
/** O Clawd da sessão: jeito de se mexer pela situação, chão na cor dela e o ícone da atividade. */
clawd::Look clawdLookOf(const Session& s, bool withAccessory);
/** O Clawd do conjunto: a situação mais urgente entre as sessões em movimento (ou dormindo). */
clawd::Look clawdLookOfAll(const std::vector<const Session*>& moving);
/** Cor mais clara da mesma situação, para texto pequeno sobre preto. */
uint32_t softColor(uint32_t statusColor);
/** Fundo escuro tingido da situação (chip, linha de destaque). */
uint32_t tintColor(uint32_t statusColor);

/** Arco sem botão nem clique, centrado no mostrador; `diameter` é a borda de fora. */
lv_obj_t* makeArc(lv_obj_t* parent, int diameter, int width, uint32_t color, bool rounded);
/** Rótulo centrado na horizontal, na altura `y`, com largura `w` e texto centralizado. */
lv_obj_t* centeredLabel(lv_obj_t* parent, const lv_font_t* font, uint32_t color, int y, int w,
                        const std::string& text = "");
/** Pílula: caixa arredondada com fundo, conteúdo em linha. */
lv_obj_t* pill(lv_obj_t* parent, uint32_t bg);
/** Marca de vigiada (◉, como no relógio): anel e ponto na cor de pergunta; `r` é o raio, `bg` o fundo do meio. */
lv_obj_t* watchMark(lv_obj_t* parent, int r, uint32_t bg);
/** Troca o fundo do meio da marca (a linha muda de cor quando a sessão espera você). */
void setWatchMarkBg(lv_obj_t* mark, uint32_t bg);
/** Troca o texto só se mudou (o LVGL redesenha a cada set, mesmo com o mesmo texto). */
void setText(lv_obj_t* label, const std::string& text);
void show(lv_obj_t* obj, bool visible);
/** Contorno que pulsa (quem espera você). `on = false` para e apaga. */
void pulseOutline(lv_obj_t* obj, uint32_t color, bool on);

}  // namespace painel::round
