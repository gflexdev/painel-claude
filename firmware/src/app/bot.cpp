#include "app/bot.h"

#include <cstring>

namespace painel::bot {
namespace {

constexpr int kHalf = 4;

const char* const kHats[][kHatRows] = {
    {".#####.", ".#####.", "#######"},  // cartola
    {"...#...", ".#####.", "#######"},  // gorro com pompom
    {"#.#.#.#", "#######", "......."},  // coroa
    {"..####.", ".######", "#######"},  // boné
    {"...#...", "..###..", ".#####."},  // chapéu de festa
    {".......", ".......", "#######"},  // faixa
    {"##...##", ".#...#.", ".#####."},  // chifrinhos
};
constexpr uint32_t kHatColors[] = {0x7aa2ff, 0xff8fd0, 0xf5d547, 0x5fe0d0, 0xc49bff, 0xff9a5c, 0x9be564, 0xe8e4dc};

struct Glyph {
  const char* name;
  const char* rows[kAccSize];
};
const Glyph kAccessories[] = {
    {"read", {"###.", "#.#.", "###.", "...#"}},     {"write", {"...#", "..#.", ".#..", "#..."}},
    {"bash", {"#...", ".#..", "#...", "..##"}},     {"web", {".##.", "####", "####", ".##."}},
    {"delegate", {".##.", "####", ".##.", "#..#"}}, {"plan", {"#.##", "....", "#.##", "...."}},
    {"ask", {".##.", "...#", "..#.", "..#."}},      {"mcp", {"#..#", "####", ".##.", ".#.."}},
    {"think", {"....", "....", "#.#.", "...."}},    {"compact", {"#..#", ".##.", ".##.", "#..#"}},
    {"done", {"##..", "###.", "#...", "#..."}},
};

/** xorshift32 do bot.js: mesma sequência de números para o mesmo seed. */
class Random {
 public:
  explicit Random(uint32_t seed) : state_(seed) {}
  double next() {
    state_ ^= state_ << 13;
    state_ ^= state_ >> 17;
    state_ ^= state_ << 5;
    return static_cast<double>(state_) / 4294967296.0;
  }

 private:
  uint32_t state_;
};

/** Decodifica UTF-8 e chama fn para cada unidade UTF-16 (pares substitutos acima de U+FFFF). */
template <typename Fn>
void forEachUtf16(const std::string& text, Fn fn) {
  const auto* p = reinterpret_cast<const unsigned char*>(text.data());
  const auto* end = p + text.size();
  while (p < end) {
    uint32_t cp = *p++;
    int extra = cp >= 0xF0 ? 3 : cp >= 0xE0 ? 2 : cp >= 0xC0 ? 1 : 0;
    if (extra) cp &= (0x3F >> extra);
    for (int i = 0; i < extra && p < end; ++i) cp = (cp << 6) | (*p++ & 0x3F);
    if (cp > 0xFFFF) {
      cp -= 0x10000;
      fn(static_cast<uint16_t>(0xD800 + (cp >> 10)));
      fn(static_cast<uint16_t>(0xDC00 + (cp & 0x3FF)));
    } else {
      fn(static_cast<uint16_t>(cp));
    }
  }
}

}  // namespace

uint32_t seedFrom(const std::string& utf8) {
  uint32_t h = 2166136261u;
  forEachUtf16(utf8, [&h](uint16_t unit) {
    h ^= unit;
    h *= 16777619u;
  });
  return h ? h : 1;
}

Cells cellsFor(const std::string& id) {
  Random rand(seedFrom(id));
  const bool twinAntenna = rand.next() < 0.4;
  const bool arms = rand.next() < 0.5;
  const bool wideHead = rand.next() < 0.5;
  const bool mouth = rand.next() < 0.5;
  const int legCol = rand.next() < 0.5 ? 2 : 3;
  const bool notch0 = rand.next() < 0.3;
  const bool notch1 = rand.next() < 0.3;

  auto cell = [&](int y, int x) -> uint8_t {
    if (y == 0) return twinAntenna ? x == 2 : x == kHalf;
    if (y == 6) return x == legCol;
    if (x == 0) return arms ? y == 5 : (y == 2 && wideHead);
    if (y == 2 && x == 2) return 2;
    if (y == 3 && x >= 2 && mouth) return x == kHalf ? 2 : 1;
    if (y == 4) return x >= 3 || (x == 2 && !notch0);
    if (x == 1) return y != 4 && !(y == 1 && notch1);
    return 1;
  };

  Cells cells{};
  for (int y = 0; y < kBodyRows; ++y) {
    for (int x = 0; x <= kHalf; ++x) cells[y][x] = cell(y, x);
    for (int x = 0; x < kHalf; ++x) cells[y][kBodyCols - 1 - x] = cells[y][x];  // espelho
  }
  return cells;
}

Hat hatFor(const std::string& project) {
  const uint32_t h = seedFrom(project.empty() ? "?" : project);
  constexpr uint32_t kHatCount = sizeof(kHats) / sizeof(kHats[0]);
  constexpr uint32_t kColorCount = sizeof(kHatColors) / sizeof(kHatColors[0]);
  return {kHats[h % kHatCount], kHatColors[(h >> 8) % kColorCount]};
}

const char* const* accessory(const std::string& name) {
  for (const Glyph& g : kAccessories) {
    if (name == g.name) return g.rows;
  }
  return nullptr;
}

}  // namespace painel::bot
