// Clawd, o bichinho laranja de pixel do Claude Code: porte de public/clawd.js e public/clawd.css.
// Aqui só a conta, sem LVGL: a pose em cada instante (as animações da web são em degraus, steps(1)) e os
// retângulos a pintar, em unidades do desenho (1 unidade = 1 pixel do bicho).
#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace painel::clawd {

/** Jeito de se mexer, pela situação da sessão. */
enum class Mood { Working, Waiting, Error, Unseen, Idle, Ended };

/** Área desenhada, em unidades: x de 0 a 20 (bicho + ícone), y de -3 a 12 (os efeitos sobem até -3). */
constexpr int kCols = 21;
constexpr int kRows = 15;
constexpr int kTop = -3;

constexpr uint32_t kBody = 0xd97757;
constexpr uint32_t kInk = 0x16110d;
constexpr uint32_t kHeart = 0xff6b8b;

struct Rect {
  int x, y, w, h;
  uint32_t color;
  uint8_t opa;  // 0–255
};

struct Look {
  Mood mood = Mood::Idle;
  uint32_t ground = 0x5b606c;     // cor da situação, no chão embaixo dele
  uint32_t fxDim = 0x8d919c;      // zzz
  uint32_t sparkle = 0x7aa2ff;    // brilho de "terminou"
  std::string accessory;          // ícone da atividade (read, write, bash…); vazio = sem
  uint32_t accessoryColor = 0;
};

/** Os retângulos do Clawd em `ms` (relógio monotônico), com o pulo do toque se `pokeAgeMs` < 620. */
std::vector<Rect> frame(const Look& look, int64_t ms, int64_t pokeAgeMs = -1);
/** Uma chave que muda só quando o desenho muda (para não redesenhar à toa). */
uint32_t keyOf(const std::vector<Rect>& rects);
/** Quanto tempo dura o pulo do toque. */
constexpr int64_t kPokeMs = 620;

}  // namespace painel::clawd
