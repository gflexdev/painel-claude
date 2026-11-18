// Touch capacitivo GT911 por I2C (sem INT/RST ligados na placa: leitura por polling).
#pragma once

#include <lvgl.h>

namespace board {

/** Procura o GT911 (0x5D ou 0x14) e cria o dispositivo de entrada do LVGL. nullptr se não achar. */
lv_indev_t* startTouch(lv_display_t* display);

}  // namespace board
