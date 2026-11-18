// Cores e fontes da versão web (public/style.css), para o display ficar igual ao tablet.
#pragma once

#include <lvgl.h>

#include <cstdint>
#include <string>

#include "app/model.h"

namespace painel::ui {

namespace color {
constexpr uint32_t kBg = 0x0e0f12;
constexpr uint32_t kTile = 0x181a20;
constexpr uint32_t kTileHi = 0x20232b;
constexpr uint32_t kLine = 0x2a2e38;
constexpr uint32_t kInk = 0xeceae4;
constexpr uint32_t kInkDim = 0x8d919c;
constexpr uint32_t kInkFaint = 0x5b606c;
constexpr uint32_t kWorking = 0xffb238;
constexpr uint32_t kWaiting = 0xff4f6a;
constexpr uint32_t kIdle = 0x4fd18b;
constexpr uint32_t kError = 0xd36cff;
constexpr uint32_t kEnded = 0x5b606c;
constexpr uint32_t kUnseen = 0x7aa2ff;
constexpr uint32_t kQuestion = 0x5fe0d0;
constexpr uint32_t kPreviewBg = 0x0b0c0f;
constexpr uint32_t kAllowInk = 0x062313;
}  // namespace color

inline lv_color_t hex(uint32_t rgb) { return lv_color_hex(rgb); }

/** Cor do status (a mesma do --c da web): parada sem ver = azul, sem sinal = cinza. */
uint32_t statusColor(const Session& s);
/** Cor do cartão de pedido pelo tipo. */
uint32_t requestColor(const std::string& kind);

/** Caixa sem nada: sem fundo, sem borda, sem padding, sem rolagem. */
lv_obj_t* box(lv_obj_t* parent);
lv_obj_t* label(lv_obj_t* parent, const lv_font_t* font, uint32_t textColor, const std::string& text = "");
/** Maiúsculas também para á, ê, ç… (Latin-1), como o text-transform da web. */
std::string upper(const std::string& utf8);

}  // namespace painel::ui
