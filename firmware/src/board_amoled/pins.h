// Pinos da Waveshare ESP32-S3-Touch-AMOLED-1.75 (inclui a -G, com GPS): AMOLED redonda 466×466 com CO5300
// por QSPI e toque CST9217 no I2C da placa. Fonte: HARDWARE_REFERENCE.md do repositório
// waveshareteam/ESP32-S3-Touch-AMOLED-1.75 (conferido com o BSP de lá e o exemplo de LVGL em Arduino).
#pragma once

#include <cstdint>

namespace board {

constexpr int kWidth = 466;
constexpr int kHeight = 466;
/** O CO5300 endereça 480 colunas; o vidro de 466 começa na coluna 6 (o mesmo do exemplo da Waveshare). */
constexpr uint8_t kColumnOffset = 6;

constexpr int kLcdCs = 12;
constexpr int kLcdSck = 38;
constexpr int kLcdD0 = 4;
constexpr int kLcdD1 = 5;
constexpr int kLcdD2 = 6;
constexpr int kLcdD3 = 7;
constexpr int kLcdReset = 39;

// I2C da placa (toque, PMIC, RTC, IMU e GPS da -G dividem o mesmo barramento).
constexpr int kI2cSda = 15;
constexpr int kI2cScl = 14;
constexpr uint32_t kI2cHz = 400000;
constexpr int kTouchInt = 11;
constexpr int kTouchReset = 40;
constexpr uint8_t kTouchAddress = 0x5A;

// Som: I2S para o ES8311 e o amplificador NS4150B (ligado em nível alto, como no BSP da Waveshare).
constexpr int kI2sMclk = 42;
constexpr int kI2sBclk = 9;
constexpr int kI2sWs = 45;
constexpr int kI2sDout = 8;
constexpr int kAmpEnable = 46;

/** Linhas por buffer do LVGL (dois buffers em RAM interna com DMA). */
constexpr int kBufferLines = 40;

}  // namespace board
