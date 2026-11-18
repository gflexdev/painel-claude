// Robozinho de pixel: porte fiel de public/bot.js, para a placa desenhar o mesmo robô que a web.
// Corpo pela sessão (sempre o mesmo), chapéu pelo projeto e um ícone 4×4 com a atividade.
#pragma once

#include <array>
#include <cstdint>
#include <string>

namespace painel::bot {

constexpr int kBodyCols = 9;
constexpr int kBodyRows = 7;
constexpr int kHatRows = 3;
constexpr int kHatCols = 7;
constexpr int kAccSize = 4;
constexpr int kCanvasCols = kBodyCols + kAccSize;           // 13
constexpr int kCanvasRows = kHatRows + kBodyRows - 1;        // 9

/** 0 vazio, 1 corpo, 2 olho/boca. A linha 0 (antena) vira chapéu e não é desenhada. */
using Cells = std::array<std::array<uint8_t, kBodyCols>, kBodyRows>;

struct Hat {
  const char* const* shape;  // kHatRows linhas de kHatCols ('#' = pixel)
  uint32_t color;            // 0xRRGGBB
};

/** FNV-1a sobre as unidades UTF-16 do texto (igual a charCodeAt no JS). */
uint32_t seedFrom(const std::string& utf8);
Cells cellsFor(const std::string& sessionId);
Hat hatFor(const std::string& project);
/** Ícone 4×4 da atividade (nullptr se não houver). */
const char* const* accessory(const std::string& name);

}  // namespace painel::bot
