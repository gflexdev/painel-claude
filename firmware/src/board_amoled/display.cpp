// AMOLED da Waveshare 1,75": CO5300 por QSPI (Arduino_GFX) e o LVGL em modo parcial com dois buffers.
// O brilho do AMOLED é um comando do próprio CO5300: não há backlight nem PWM.
#include "board_amoled/display.h"

#include <Arduino.h>
#include <Arduino_GFX_Library.h>
#include <esp_heap_caps.h>

#include "app/platform.h"
#include "board_amoled/pins.h"

namespace board {
namespace {

Arduino_ESP32QSPI gBus(kLcdCs, kLcdSck, kLcdD0, kLcdD1, kLcdD2, kLcdD3);
Arduino_CO5300 gPanel(&gBus, kLcdReset, 0, kWidth, kHeight, kColumnOffset, 0, 0, 0);
bool gReady = false;

void flush(lv_display_t* display, const lv_area_t* area, uint8_t* pixels) {
  const int32_t w = lv_area_get_width(area);
  const int32_t h = lv_area_get_height(area);
  gPanel.draw16bitRGBBitmap(area->x1, area->y1, reinterpret_cast<uint16_t*>(pixels), w, h);
  lv_display_flush_ready(display);
}

/** O CO5300 só aceita janelas que começam em coordenada par e terminam em ímpar. */
void roundArea(lv_event_t* e) {
  auto* area = static_cast<lv_area_t*>(lv_event_get_param(e));
  area->x1 &= ~1;
  area->y1 &= ~1;
  area->x2 |= 1;
  area->y2 |= 1;
}

}  // namespace

lv_display_t* startDisplay() {
  if (!gPanel.begin()) Serial.println("[tela] CO5300 não respondeu");
  gPanel.setBrightness(0);  // apagado até a primeira imagem
  gPanel.fillScreen(RGB565_BLACK);
  gReady = true;

  const size_t bytes = static_cast<size_t>(kWidth) * kBufferLines * sizeof(uint16_t);
  void* first = heap_caps_malloc(bytes, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
  void* second = heap_caps_malloc(bytes, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
  if (!first || !second) Serial.println("[tela] sem RAM interna para os buffers do LVGL");

  lv_display_t* display = lv_display_create(kWidth, kHeight);
  lv_display_set_buffers(display, first, second, bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(display, flush);
  lv_display_add_event_cb(display, roundArea, LV_EVENT_INVALIDATE_AREA, nullptr);
  return display;
}

}  // namespace board

namespace painel::platform {

void setBacklight(uint8_t percent) {
  if (!board::gReady) return;
  const uint32_t clamped = percent > 100 ? 100 : percent;
  board::gPanel.setBrightness(static_cast<uint8_t>(clamped * 255 / 100));
}

}  // namespace painel::platform
