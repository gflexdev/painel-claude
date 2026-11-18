// Pinos e tempos da Guition ESP32-4848S040 (ESP32-S3 + painel 4" 480×480 ST7701 + touch GT911).
// Fontes: página da placa no ESPHome devices (Guition-ESP32-S3-4848S040) e o board JSON
// esp32-4848S040CIY1 do rzeldent/platformio-espressif32-sunton. Conferidos entre si.
#pragma once

namespace board {

constexpr int kWidth = 480;
constexpr int kHeight = 480;

// ST7701: configuração por SPI de 3 fios (9 bits: D/C + 8), só no boot.
constexpr int kLcdCs = 39;
constexpr int kLcdSck = 48;
constexpr int kLcdSda = 47;

// Interface RGB565 paralela (16 bits).
constexpr int kLcdDe = 18;
constexpr int kLcdVsync = 17;
constexpr int kLcdHsync = 16;
constexpr int kLcdPclk = 21;
// D0..D15 na ordem do esp_lcd: B0..B4, G0..G5, R0..R4.
constexpr int kLcdData[16] = {4, 5, 6, 7, 15, 8, 20, 3, 46, 9, 10, 11, 12, 13, 14, 0};

constexpr int kPclkHz = 12 * 1000 * 1000;
constexpr int kHsyncPulse = 8;
constexpr int kHsyncBackPorch = 20;
constexpr int kHsyncFrontPorch = 10;
constexpr int kVsyncPulse = 8;
constexpr int kVsyncBackPorch = 10;
constexpr int kVsyncFrontPorch = 10;
/** Bounce buffer em RAM interna: o DMA lê dali e não da PSRAM, então o Wi-Fi não faz a imagem tremer. */
constexpr int kBounceLines = 10;

constexpr int kBacklight = 38;
constexpr int kBacklightHz = 1000;  // se o brilho baixo piscar, teste 150 (valor do exemplo do ESPHome)

// GT911 (sem INT/RST ligados).
constexpr int kTouchSda = 19;
constexpr int kTouchScl = 45;
constexpr int kTouchI2cHz = 400000;

}  // namespace board
