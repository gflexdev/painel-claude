// Brilho da Guition ESP32-4848S040: PWM no pino do backlight.
#include <Arduino.h>

#include "app/platform.h"
#include "board/pins.h"

namespace painel::platform {

void setBacklight(uint8_t percent) {
  static bool attached = false;
  if (!attached) attached = ledcAttach(board::kBacklight, board::kBacklightHz, 10);
  const uint32_t duty = static_cast<uint32_t>(percent > 100 ? 100 : percent) * 1023 / 100;
  ledcWrite(board::kBacklight, duty);
}

}  // namespace painel::platform
