// Firmware da Guition ESP32-4848S040: display de bancada do painel-claude.
#include <Arduino.h>
#include <WiFi.h>
#include <lvgl.h>

#include "app/app.h"
#include "app/client.h"
#include "app/platform.h"
#include "board/display.h"
#include "board/touch.h"

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

namespace {

constexpr uint32_t kWifiCheckMs = 500;

painel::Client* gClient = nullptr;
painel::App* gApp = nullptr;
uint32_t gLastWifiCheck = 0;

uint32_t tick() { return millis(); }

void startWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("painel-bancada");
  WiFi.setSleep(false);  // sem economia de energia: menos latência no SSE (a placa fica na tomada)
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
  painel::platform::setBacklight(0);  // apagado até a primeira imagem

  lv_init();
  lv_tick_set_cb(tick);
  lv_display_t* display = board::startDisplay();
  lv_indev_t* touch = board::startTouch(display);

  painel::http::Endpoint endpoint;
  endpoint.host = PAINEL_HOST;
  endpoint.port = PAINEL_PORT;
  endpoint.token = PAINEL_TOKEN;
  gClient = new painel::Client(endpoint);

  painel::AppOptions options;
  options.tzOffsetMin = PAINEL_TZ_OFFSET_MIN;
  options.brightFull = PAINEL_BRILHO_CHEIO;
  options.brightLow = PAINEL_BRILHO_BAIXO;
  gApp = new painel::App(*gClient, options);
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
