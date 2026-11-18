#include "board/display.h"

#include <Arduino.h>
#include <esp_heap_caps.h>
#include <esp_lcd_panel_ops.h>
#include <esp_lcd_panel_rgb.h>

#include "board/pins.h"

namespace board {
namespace {

constexpr int kDrawLines = 40;  // buffer parcial do LVGL (2 × 480 × 40 × 2 B = 75 KB)
constexpr uint8_t kDelay = 0xFF;  // marcador de pausa na tabela de init

esp_lcd_panel_handle_t gPanel = nullptr;

// Sequência de init do ST7701 desta placa: o preset 1 do ESPHome (init_sequences.py, ST7701S_1_INIT)
// mais o ajuste da página da Guition 4848S040 (CMD2 BK0 + 0xCD = 0x00, desliga o flag MDT).
// Formato: comando, nº de parâmetros, parâmetros… (nº = kDelay → pausa de <comando> ms).
const uint8_t kInit[] = {
    0x01, 0,                                                    // reset por software
    120, kDelay,
    0xFF, 5, 0x77, 0x01, 0x00, 0x00, 0x10,                       // CMD2 BK0
    0xC0, 2, 0x3B, 0x00,
    0xC1, 2, 0x0D, 0x02,
    0xC2, 2, 0x31, 0x05,
    0xCD, 1, 0x08,
    0xB0, 16, 0x00, 0x11, 0x18, 0x0E, 0x11, 0x06, 0x07, 0x08, 0x07, 0x22, 0x04, 0x12, 0x0F, 0xAA, 0x31, 0x18,
    0xB1, 16, 0x00, 0x11, 0x19, 0x0E, 0x12, 0x07, 0x08, 0x08, 0x08, 0x22, 0x04, 0x11, 0x11, 0xA9, 0x32, 0x18,
    0xFF, 5, 0x77, 0x01, 0x00, 0x00, 0x11,                       // CMD2 BK1
    0xB0, 1, 0x60,
    0xB1, 1, 0x32,
    0xB2, 1, 0x07,
    0xB3, 1, 0x80,
    0xB5, 1, 0x49,
    0xB7, 1, 0x85,
    0xB8, 1, 0x21,
    0xC1, 1, 0x78,
    0xC2, 1, 0x78,
    0xE0, 3, 0x00, 0x1B, 0x02,
    0xE1, 11, 0x08, 0xA0, 0x00, 0x00, 0x07, 0xA0, 0x00, 0x00, 0x00, 0x44, 0x44,
    0xE2, 12, 0x11, 0x11, 0x44, 0x44, 0xED, 0xA0, 0x00, 0x00, 0xEC, 0xA0, 0x00, 0x00,
    0xE3, 4, 0x00, 0x00, 0x11, 0x11,
    0xE4, 2, 0x44, 0x44,
    0xE5, 16, 0x0A, 0xE9, 0xD8, 0xA0, 0x0C, 0xEB, 0xD8, 0xA0, 0x0E, 0xED, 0xD8, 0xA0, 0x10, 0xEF, 0xD8, 0xA0,
    0xE6, 4, 0x00, 0x00, 0x11, 0x11,
    0xE7, 2, 0x44, 0x44,
    0xE8, 16, 0x09, 0xE8, 0xD8, 0xA0, 0x0B, 0xEA, 0xD8, 0xA0, 0x0D, 0xEC, 0xD8, 0xA0, 0x0F, 0xEE, 0xD8, 0xA0,
    0xEB, 7, 0x02, 0x00, 0xE4, 0xE4, 0x88, 0x00, 0x40,
    0xEC, 2, 0x3C, 0x00,
    0xED, 16, 0xAB, 0x89, 0x76, 0x54, 0x02, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x20, 0x45, 0x67, 0x98, 0xBA,
    0xFF, 5, 0x77, 0x01, 0x00, 0x00, 0x13,                       // CMD2 BK3
    0xE5, 1, 0xE4,
    0x3A, 1, 0x60,
    // ajuste da Guition 4848S040
    0xFF, 5, 0x77, 0x01, 0x00, 0x00, 0x10,
    0xCD, 1, 0x00,
    // orientação e cor (como o ESPHome faz depois da sequência)
    0xFF, 5, 0x77, 0x01, 0x00, 0x00, 0x10,
    0xC7, 1, 0x00,  // SDIR: sem espelho em X
    0x36, 1, 0x00,  // MADCTL: RGB, sem espelho em Y
    0x20, 0,        // INVOFF
    120, kDelay,
    0x11, 0,        // SLPOUT
    120, kDelay,
    0x29, 0,        // DISPON
    20, kDelay,
};

/** SPI de 3 fios em software, modo 3 (clock parado em alto, amostra na subida). 9 bits por palavra. */
void spiWord(bool isData, uint8_t value) {
  const uint16_t word = (isData ? 0x100 : 0) | value;
  digitalWrite(kLcdCs, LOW);
  for (int bit = 8; bit >= 0; --bit) {
    digitalWrite(kLcdSck, LOW);
    digitalWrite(kLcdSda, (word >> bit) & 1);
    delayMicroseconds(1);
    digitalWrite(kLcdSck, HIGH);
    delayMicroseconds(1);
  }
  digitalWrite(kLcdCs, HIGH);
}

void initController() {
  pinMode(kLcdCs, OUTPUT);
  pinMode(kLcdSck, OUTPUT);
  pinMode(kLcdSda, OUTPUT);
  digitalWrite(kLcdCs, HIGH);
  digitalWrite(kLcdSck, HIGH);
  for (size_t i = 0; i < sizeof kInit;) {
    const uint8_t cmd = kInit[i++];
    const uint8_t count = kInit[i++];
    if (count == kDelay) {
      delay(cmd);
      continue;
    }
    spiWord(false, cmd);
    for (uint8_t n = 0; n < count; ++n) spiWord(true, kInit[i++]);
  }
}

esp_lcd_panel_handle_t createPanel() {
  esp_lcd_rgb_panel_config_t cfg = {};
  cfg.clk_src = LCD_CLK_SRC_DEFAULT;
  cfg.timings.pclk_hz = kPclkHz;
  cfg.timings.h_res = kWidth;
  cfg.timings.v_res = kHeight;
  cfg.timings.hsync_pulse_width = kHsyncPulse;
  cfg.timings.hsync_back_porch = kHsyncBackPorch;
  cfg.timings.hsync_front_porch = kHsyncFrontPorch;
  cfg.timings.vsync_pulse_width = kVsyncPulse;
  cfg.timings.vsync_back_porch = kVsyncBackPorch;
  cfg.timings.vsync_front_porch = kVsyncFrontPorch;
  cfg.timings.flags.pclk_active_neg = 0;
  cfg.data_width = 16;
  cfg.bits_per_pixel = 16;
  cfg.num_fbs = 1;
  cfg.bounce_buffer_size_px = kWidth * kBounceLines;
  cfg.dma_burst_size = 64;
  cfg.hsync_gpio_num = kLcdHsync;
  cfg.vsync_gpio_num = kLcdVsync;
  cfg.de_gpio_num = kLcdDe;
  cfg.pclk_gpio_num = kLcdPclk;
  cfg.disp_gpio_num = -1;
  for (int i = 0; i < 16; ++i) cfg.data_gpio_nums[i] = kLcdData[i];
  cfg.flags.fb_in_psram = 1;

  esp_lcd_panel_handle_t panel = nullptr;
  ESP_ERROR_CHECK(esp_lcd_new_rgb_panel(&cfg, &panel));
  ESP_ERROR_CHECK(esp_lcd_panel_reset(panel));
  ESP_ERROR_CHECK(esp_lcd_panel_init(panel));
  return panel;
}

void flush(lv_display_t* display, const lv_area_t* area, uint8_t* pixels) {
  // No painel RGB isto copia a área para o framebuffer (PSRAM); o DMA varre a tela sozinho.
  esp_lcd_panel_draw_bitmap(gPanel, area->x1, area->y1, area->x2 + 1, area->y2 + 1, pixels);
  lv_display_flush_ready(display);
}

void* drawBuffer(size_t bytes) {
  void* buf = heap_caps_aligned_alloc(64, bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
  if (!buf) buf = heap_caps_aligned_alloc(64, bytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  return buf;
}

}  // namespace

lv_display_t* startDisplay() {
  initController();
  gPanel = createPanel();

  lv_display_t* display = lv_display_create(kWidth, kHeight);
  const size_t bytes = kWidth * kDrawLines * sizeof(uint16_t);
  void* buf1 = drawBuffer(bytes);
  void* buf2 = drawBuffer(bytes);
  if (!buf1) {
    Serial.println("[display] sem memória para o buffer do LVGL");
    abort();  // reinicia a placa; sem buffer não há o que mostrar
  }
  lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
  lv_display_set_buffers(display, buf1, buf2, bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(display, flush);
  return display;
}

}  // namespace board
