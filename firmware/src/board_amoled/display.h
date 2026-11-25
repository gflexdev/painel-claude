// Tela e toque da Waveshare ESP32-S3-Touch-AMOLED-1.75.
#pragma once

#include <lvgl.h>

namespace board {

/** Liga o CO5300 (QSPI) e cria o display do LVGL. O brilho fica em painel::platform::setBacklight. */
lv_display_t* startDisplay();
/** Liga o CST9217 (I2C 0x5A) e cria o dispositivo de entrada do LVGL. nullptr se não achar. */
lv_indev_t* startTouch(lv_display_t* display);

}  // namespace board
