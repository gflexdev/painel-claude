// Simulador do display de bancada no Mac: a mesma interface e o mesmo cliente HTTP/SSE da placa,
// numa janela SDL de 480×480. Configuração por variáveis de ambiente:
//   PAINEL_HOST (127.0.0.1)  PAINEL_PORT (7777)  PAINEL_TOKEN (senão lê ~/.config/painel-claude/config.json)
//   PAINEL_TZ_OFFSET_MIN (-180)  PAINEL_SIM_CMDS (arquivo de comandos: tap/shot/wait/quit)
#include <ArduinoJson.h>
#include <lvgl.h>

#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>

#include "app/app.h"
#include "app/client.h"
#include "app/platform.h"
#include "sim/sim_hooks.h"

namespace {

constexpr int kWidth = 480;
constexpr int kHeight = 480;

std::string env(const char* name, const std::string& fallback) {
  const char* value = std::getenv(name);
  return value && *value ? value : fallback;
}

/** Token do próprio servidor do Mac (o simulador roda na mesma máquina). Não imprime o valor. */
std::string tokenFromServerConfig() {
  const std::string path = env("HOME", "") + "/.config/painel-claude/config.json";
  std::ifstream file(path);
  if (!file) return "";
  std::stringstream text;
  text << file.rdbuf();
  JsonDocument doc;
  if (deserializeJson(doc, text.str())) return "";
  return doc["token"] | "";
}

uint32_t tick() { return static_cast<uint32_t>(painel::platform::monoMs()); }

}  // namespace

int main() {
  painel::http::Endpoint endpoint;
  endpoint.host = env("PAINEL_HOST", "127.0.0.1");
  endpoint.port = static_cast<uint16_t>(std::atoi(env("PAINEL_PORT", "7777").c_str()));
  endpoint.token = env("PAINEL_TOKEN", tokenFromServerConfig());
  if (endpoint.token.empty()) painel::platform::log("[sim] sem token: defina PAINEL_TOKEN");
  const std::string script = env("PAINEL_SIM_CMDS", "");

  lv_init();
  lv_tick_set_cb(tick);
  lv_display_t* display = lv_sdl_window_create(kWidth, kHeight);
  lv_sdl_window_set_title(display, "Painel Claude · bancada (simulador)");
  lv_indev_t* mouse = lv_sdl_mouse_create();
  painel::sim::init(display);

  painel::Client client(endpoint);
  painel::AppOptions options;
  options.tzOffsetMin = std::atoi(env("PAINEL_TZ_OFFSET_MIN", "-180").c_str());
  painel::App app(client, options);
  app.build(lv_screen_active());
  app.wrapTouch(mouse);
  app.wrapTouch(painel::sim::finger());

  painel::platform::log("[sim] servidor %s:%u", endpoint.host.c_str(), endpoint.port);
  client.start();

  while (!painel::sim::quitRequested()) {
    lv_timer_handler();
    app.loop();
    painel::sim::runScript(script);
    painel::platform::sleepMs(5);
  }
  // As threads de rede vivem até o fim do processo e usam o Client: sai sem rodar destrutores.
  std::_Exit(0);
}
