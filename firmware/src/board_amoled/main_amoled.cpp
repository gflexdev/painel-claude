// Firmware da Waveshare ESP32-S3-Touch-AMOLED-1.75: o mostrador redondo de mesa do painel-claude.
#include <Arduino.h>
#include <WiFi.h>
#include <lvgl.h>

#include "app/client.h"
#include "app/platform.h"
#include "board_amoled/audio.h"
#include "board_amoled/display.h"
#include "round/round_app.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#warning "Sem include/secrets.h: compilando com os valores de exemplo. Copie secrets.example.h e preencha."
#include "secrets.example.h"
#endif

#ifndef PAINEL_BRILHO_CHEIO
#define PAINEL_BRILHO_CHEIO 100
#endif
#ifndef PAINEL_BRILHO_BAIXO
#define PAINEL_BRILHO_BAIXO 10
#endif
#ifndef PAINEL_SOM_VOLUME
#define PAINEL_SOM_VOLUME 70
#endif

namespace {

constexpr uint32_t kWifiCheckMs = 500;

painel::Client* gClient = nullptr;
painel::round::RoundApp* gApp = nullptr;
uint32_t gLastWifiCheck = 0;

uint32_t tick() { return millis(); }

void startWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("painel-mostrador");
  WiFi.setSleep(false);  // fica na tomada: menos latência no SSE
  WiFi.setAutoReconnect(true);
  WiFi.begin(PAINEL_WIFI_SSID, PAINEL_WIFI_PASS);
}

void checkWifi() {
  if (millis() - gLastWifiCheck < kWifiCheckMs) return;
  gLastWifiCheck = millis();
  const bool up = WiFi.status() == WL_CONNECTED;
  gApp->setNetworkNote(up ? "" : std::string("Conectando ao Wi-Fi ") + PAINEL_WIFI_SSID + "…");
  static bool wasUp = false;
  if (up && !wasUp) Serial.printf("[wifi] conectado: %s\n", WiFi.localIP().toString().c_str());
  wasUp = up;
}

}  // namespace

void setup() {
  Serial.begin(115200);
  Serial.printf("[painel] PSRAM %u KB livres, heap interno %u KB\n", ESP.getFreePsram() / 1024,
                heap_caps_get_free_size(MALLOC_CAP_INTERNAL) / 1024);

  lv_init();
  lv_tick_set_cb(tick);
  lv_display_t* display = board::startDisplay();
  lv_indev_t* touch = board::startTouch(display);
  board::startAudio(PAINEL_SOM_VOLUME);

  painel::http::Endpoint endpoint;
  endpoint.host = PAINEL_HOST;
  endpoint.port = PAINEL_PORT;
  endpoint.token = PAINEL_TOKEN;
  gClient = new painel::Client(endpoint);

  painel::round::RoundOptions options;
  options.tzOffsetMin = PAINEL_TZ_OFFSET_MIN;
  options.wake.brightFull = PAINEL_BRILHO_CHEIO;
  options.wake.brightLow = PAINEL_BRILHO_BAIXO;
  gApp = new painel::round::RoundApp(*gClient, options);
  gApp->build(lv_screen_active());
  if (touch) gApp->wrapTouch(touch);

  startWifi();
  gClient->start();
  Serial.printf("[painel] servidor %s:%d\n", PAINEL_HOST, PAINEL_PORT);
}

void loop() {
  lv_timer_handler();
  gApp->loop();
  checkWifi();
  delay(5);
}
