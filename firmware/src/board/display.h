// Display da placa: inicia o ST7701 e liga o LVGL ao painel RGB.
#pragma once

#include <lvgl.h>

namespace board {

/** Configura o ST7701, cria o painel RGB (framebuffer na PSRAM + bounce buffer) e o display LVGL. */
lv_display_t* startDisplay();

}  // namespace board
