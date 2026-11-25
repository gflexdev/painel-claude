// Som da Waveshare AMOLED 1,75": codec ES8311 (I2C 0x18, no mesmo barramento do toque) recebendo I2S e o
// amplificador NS4150B, ligado pelo GPIO46 só enquanto toca. Registros e divisores conferidos com o exemplo
// 08_ES8311 da Waveshare (MCLK de 4,096 MHz = 256 × 16 kHz).
#include "board_amoled/audio.h"

#include <Arduino.h>
#include <ESP_I2S.h>
#include <Wire.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

#include <vector>

#include "app/platform.h"
#include "board_amoled/pins.h"

namespace board {
namespace {

constexpr uint8_t kCodec = 0x18;
constexpr int kAmpWarmupMs = 30;   // o NS4150B leva uns ms para ligar sem estalo
constexpr int kTailMs = 60;        // silêncio no fim antes de desligar o amplificador
constexpr size_t kChunkFrames = 256;

I2SClass gI2s;
QueueHandle_t gQueue = nullptr;
int gVolume = 0;
bool gReady = false;

bool writeReg(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(kCodec);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

uint8_t readReg(uint8_t reg) {
  Wire.beginTransmission(kCodec);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(kCodec, static_cast<uint8_t>(1));
  return Wire.available() ? Wire.read() : 0;
}

/** Só a reprodução: o ES8311 escravo, I2S de 16 bits, DAC ligado e o volume pedido. */
bool initCodec(int volume) {
  if (!writeReg(0x00, 0x1F)) return false;  // reset
  delay(20);
  writeReg(0x00, 0x00);
  writeReg(0x00, 0x80);                     // liga
  writeReg(0x01, 0x3F);                     // todos os clocks, MCLK vindo do pino
  writeReg(0x06, readReg(0x06) & ~0x20);    // BCLK sem inverter
  // Divisores para MCLK 4,096 MHz e 16 kHz: pre_div 1, ×1, osr 0x10, bclk_div 4, lrck 0x00FF.
  writeReg(0x02, readReg(0x02) & 0x07);
  writeReg(0x03, 0x10);
  writeReg(0x04, 0x10);
  writeReg(0x05, 0x00);
  writeReg(0x06, (readReg(0x06) & 0xE0) | 0x03);
  writeReg(0x07, readReg(0x07) & 0xC0);
  writeReg(0x08, 0xFF);
  writeReg(0x00, readReg(0x00) & 0xBF);     // porta serial escrava
  writeReg(0x09, 0x00);                     // entrada do DAC: I2S 16 bits
  writeReg(0x0A, 0x00);
  writeReg(0x0D, 0x01);                     // analógico ligado
  writeReg(0x0E, 0x02);
  writeReg(0x12, 0x00);                     // DAC ligado
  writeReg(0x13, 0x10);                     // saída para o amplificador
  writeReg(0x1C, 0x6A);
  writeReg(0x37, 0x08);                     // sem equalizador no DAC
  writeReg(0x32, static_cast<uint8_t>(volume > 0 ? volume * 256 / 100 - 1 : 0));
  writeReg(0x31, readReg(0x31) & ~0x60);    // sem mudo
  return true;
}

void play(const std::vector<int16_t>& mono) {
  digitalWrite(kAmpEnable, HIGH);
  delay(kAmpWarmupMs);
  int16_t frames[kChunkFrames * 2];
  for (size_t i = 0; i < mono.size(); i += kChunkFrames) {
    const size_t n = std::min(kChunkFrames, mono.size() - i);
    for (size_t k = 0; k < n; ++k) frames[2 * k] = frames[2 * k + 1] = mono[i + k];  // mesmo som nos dois canais
    gI2s.write(reinterpret_cast<uint8_t*>(frames), n * 2 * sizeof(int16_t));
  }
  std::fill(std::begin(frames), std::end(frames), 0);
  const size_t tail = static_cast<size_t>(painel::kChimeSampleRate) * kTailMs / 1000;
  for (size_t i = 0; i < tail; i += kChunkFrames) gI2s.write(reinterpret_cast<uint8_t*>(frames), sizeof frames);
  digitalWrite(kAmpEnable, LOW);
}

void audioTask(void*) {
  painel::Chime chime;
  for (;;) {
    if (xQueueReceive(gQueue, &chime, portMAX_DELAY) == pdTRUE) play(painel::renderChime(chime, gVolume));
  }
}

}  // namespace

void startAudio(int volumePercent) {
  gVolume = volumePercent;
  pinMode(kAmpEnable, OUTPUT);
  digitalWrite(kAmpEnable, LOW);
  if (gVolume <= 0) {
    Serial.println("[som] mudo (PAINEL_SOM_VOLUME = 0)");
    return;
  }
  gI2s.setPins(kI2sBclk, kI2sWs, kI2sDout, -1, kI2sMclk);
  if (!gI2s.begin(I2S_MODE_STD, painel::kChimeSampleRate, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO,
                  I2S_STD_SLOT_BOTH)) {
    Serial.println("[som] I2S não iniciou");
    return;
  }
  if (!initCodec(gVolume)) {
    Serial.println("[som] ES8311 não respondeu em 0x18");
    return;
  }
  gQueue = xQueueCreate(4, sizeof(painel::Chime));
  xTaskCreatePinnedToCore(audioTask, "som", 4096, nullptr, 2, nullptr, 0);
  gReady = true;
  Serial.printf("[som] ES8311 pronto, volume %d\n", gVolume);
}

}  // namespace board

namespace painel::platform {

void playChime(Chime chime) {
  if (!board::gReady) return;
  xQueueSend(board::gQueue, &chime, 0);  // fila cheia: perde o som, não trava a tela
}

}  // namespace painel::platform
