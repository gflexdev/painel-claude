#include "app/clawd.h"

#include <initializer_list>

#include "app/bot.h"

namespace painel::clawd {
namespace {

struct Part {
  int x, y, w, h;
};

constexpr Part kGround{3, 11, 10, 1};
constexpr Part kLegsA[] = {{3, 9, 1, 2}, {10, 9, 1, 2}};
constexpr Part kLegsB[] = {{5, 9, 1, 2}, {12, 9, 1, 2}};
constexpr Part kBodyPart{2, 4, 12, 5};
constexpr Part kArmL{0, 7, 2, 1};
constexpr Part kArmR{14, 7, 2, 1};
constexpr Part kEyesOpen[] = {{4, 5, 1, 2}, {11, 5, 1, 2}};
constexpr Part kEyesBlink[] = {{4, 6, 1, 1}, {11, 6, 1, 1}};
constexpr Part kEyesShut[] = {{3, 6, 2, 1}, {11, 6, 2, 1}};
constexpr Part kEyesHappy[] = {{3, 6, 1, 1}, {4, 5, 1, 1}, {5, 6, 1, 1}, {10, 6, 1, 1}, {11, 5, 1, 1}, {12, 6, 1, 1}};
constexpr Part kEyesX[] = {{3, 4, 1, 1}, {5, 4, 1, 1}, {4, 5, 1, 1}, {3, 6, 1, 1}, {5, 6, 1, 1},
                           {10, 4, 1, 1}, {12, 4, 1, 1}, {11, 5, 1, 1}, {10, 6, 1, 1}, {12, 6, 1, 1}};
constexpr Part kMouth{7, 7, 2, 1};

constexpr int kAccX = 16;
constexpr int kAccY = 1;

// Efeitos em desenho de pixel, com onde começam.
const char* const kZ1[] = {"####", "..#.", ".#..", "####"};
const char* const kZ2[] = {"###", ".#.", "###"};
const char* const kHeartShape[] = {"##.##", "#####", ".###.", "..#.."};
const char* const kSparkle[] = {".#.", "###", ".#."};

/** Fase de 0 a 999 dentro de um período, com atraso (negativo = adiantado, como animation-delay). */
int phase(int64_t ms, int periodMs, int delayMs = 0) {
  int64_t t = (ms - delayMs) % periodMs;
  if (t < 0) t += periodMs;
  return static_cast<int>(t * 1000 / periodMs);
}

/** Keyframes em degraus: cada par é (a partir de ‰, valor). */
int step(int ph, std::initializer_list<std::pair<int, int>> keys) {
  int value = 0;
  for (const auto& [from, v] : keys) {
    if (ph >= from) value = v;
  }
  return value;
}

struct Pose {
  int allX = 0, allY = 0, topY = 0;
  int legsAY = 0, legsBY = 0, armLY = 0, armRY = 0;
  enum class Eyes { Open, Blink, Shut, Happy, X } eyes = Eyes::Open;
  bool mouth = false;
  uint8_t groundOpa = 82;  // 0,32 da web
  int groundShrink = 0;
  bool z = false;
  int zQuarter1 = 0, zQuarter2 = 0;
  uint8_t sparkleOpa = 0;
  bool heart = false;
  int heartY = 0;
  uint8_t heartOpa = 0;
};

Pose poseOf(const Look& look, int64_t ms, int64_t pokeAge) {
  Pose p;
  const bool blink = phase(ms, 3800) >= 950;
  p.eyes = blink ? Pose::Eyes::Blink : Pose::Eyes::Open;
  switch (look.mood) {
    case Mood::Working:
      p.legsAY = step(phase(ms, 440), {{0, 0}, {500, -1}});
      p.legsBY = step(phase(ms, 440, -220), {{0, 0}, {500, -1}});
      p.armLY = step(phase(ms, 260), {{0, 0}, {500, -1}});
      p.armRY = step(phase(ms, 260, -130), {{0, 0}, {500, -1}});
      p.groundOpa = phase(ms, 880) < 500 ? 82 : 180;
      break;
    case Mood::Waiting: {
      const int hop = phase(ms, 1500);
      p.allY = step(hop, {{0, 0}, {620, -2}, {680, -3}, {760, -2}, {820, 0}});
      p.groundShrink = hop >= 620 && hop < 820 ? 3 : 0;
      p.armRY = step(phase(ms, 360), {{0, -1}, {500, -3}});
      p.mouth = true;
      break;
    }
    case Mood::Error:
      p.eyes = Pose::Eyes::X;
      p.allX = step(phase(ms, 2400), {{0, 0}, {830, -1}, {860, 1}, {890, -1}, {920, 1}, {950, 0}});
      p.armLY = p.armRY = 1;
      break;
    case Mood::Unseen:
      p.eyes = Pose::Eyes::Happy;
      p.allY = step(phase(ms, 2400), {{0, 0}, {640, -2}, {700, 0}, {740, -2}, {800, 0}});
      p.armLY = p.armRY = -2;
      p.sparkleOpa = phase(ms, 1200) < 500 ? 255 : 64;
      break;
    case Mood::Idle:
    case Mood::Ended:
      p.eyes = Pose::Eyes::Shut;
      p.topY = step(phase(ms, 3200), {{0, 0}, {500, 1}});
      p.z = look.mood == Mood::Idle;
      p.zQuarter1 = phase(ms, 3200) / 250;
      p.zQuarter2 = phase(ms, 3200, -1600) / 250;
      break;
  }
  if (pokeAge >= 0 && pokeAge < kPokeMs) {
    const int ph = static_cast<int>(pokeAge * 1000 / kPokeMs);
    p.allY = step(ph, {{0, 1}, {150, -3}, {400, -4}, {650, -2}, {850, 0}});
    p.allX = 0;
    p.heart = true;
    p.heartY = step(ph, {{0, 1}, {350, -1}, {700, -2}});
    p.heartOpa = ph < 700 ? 255 : 150;
    p.z = false;
  }
  return p;
}

void add(std::vector<Rect>& out, const Part& part, int dx, int dy, uint32_t color, uint8_t opa = 255) {
  out.push_back({part.x + dx, part.y + dy, part.w, part.h, color, opa});
}

void addShape(std::vector<Rect>& out, const char* const* rows, int n, int x0, int y0, uint32_t color, uint8_t opa) {
  for (int y = 0; y < n; ++y) {
    for (int x = 0; rows[y][x]; ++x) {
      if (rows[y][x] == '#') out.push_back({x0 + x, y0 + y, 1, 1, color, opa});
    }
  }
}

/** zzz: some (quarto 0), aparece, sobe na diagonal e apaga pela metade (steps(4) da web). */
void addZ(std::vector<Rect>& out, const char* const* rows, int n, int x0, int y0, int quarter, uint32_t color) {
  if (quarter <= 0) return;
  const int dx = quarter >= 2 ? 1 : 0;
  const int dy = quarter == 2 ? -1 : quarter == 3 ? -2 : 0;
  addShape(out, rows, n, x0 + dx, y0 + dy, color, quarter == 3 ? 128 : 255);
}

}  // namespace

std::vector<Rect> frame(const Look& look, int64_t ms, int64_t pokeAgeMs) {
  const Pose p = poseOf(look, ms, pokeAgeMs);
  std::vector<Rect> out;
  out.reserve(40);
  const uint32_t ground = look.mood == Mood::Ended ? 0x5b606c : look.ground;
  const uint32_t body = look.mood == Mood::Ended ? 0x6b6f78 : kBody;

  add(out, {kGround.x + p.groundShrink / 2 + p.groundShrink % 2, kGround.y, kGround.w - p.groundShrink, 1}, 0, 0,
      ground, p.groundOpa);

  const int ax = p.allX;
  const int ay = p.allY;
  for (const Part& leg : kLegsA) add(out, leg, ax, ay + p.legsAY, body);
  for (const Part& leg : kLegsB) add(out, leg, ax, ay + p.legsBY, body);
  const int ty = ay + p.topY;
  add(out, kArmL, ax, ty + p.armLY, body);
  add(out, kArmR, ax, ty + p.armRY, body);
  add(out, kBodyPart, ax, ty, body);

  auto eyes = [&](const Part* parts, int n) {
    for (int i = 0; i < n; ++i) add(out, parts[i], ax, ty, kInk);
  };
  switch (p.eyes) {
    case Pose::Eyes::Open: eyes(kEyesOpen, 2); break;
    case Pose::Eyes::Blink: eyes(kEyesBlink, 2); break;
    case Pose::Eyes::Shut: eyes(kEyesShut, 2); break;
    case Pose::Eyes::Happy: eyes(kEyesHappy, 6); break;
    case Pose::Eyes::X: eyes(kEyesX, 10); break;
  }
  if (p.mouth) add(out, kMouth, ax, ty, kInk);

  if (p.sparkleOpa) addShape(out, kSparkle, 3, 0, 1, look.sparkle, p.sparkleOpa);
  if (p.z) {
    addZ(out, kZ1, 4, 12, 0, p.zQuarter1, look.fxDim);
    addZ(out, kZ2, 3, 16, -2, p.zQuarter2, look.fxDim);
  }
  if (p.heart) addShape(out, kHeartShape, 4, 5, -1 + p.heartY, kHeart, p.heartOpa);

  if (const char* const* glyph = bot::accessory(look.accessory)) {
    addShape(out, glyph, bot::kAccSize, kAccX, kAccY, look.accessoryColor, 255);
  }
  return out;
}

uint32_t keyOf(const std::vector<Rect>& rects) {
  // FNV-1a sobre os retângulos: barato (uns 40) e muda só quando algum pixel muda.
  uint32_t h = 2166136261u;
  for (const Rect& r : rects) {
    for (uint32_t v : {static_cast<uint32_t>(r.x + 64), static_cast<uint32_t>(r.y + 64), static_cast<uint32_t>(r.w),
                       static_cast<uint32_t>(r.h), r.color, static_cast<uint32_t>(r.opa)}) {
      h ^= v;
      h *= 16777619u;
    }
  }
  return h;
}

}  // namespace painel::clawd
