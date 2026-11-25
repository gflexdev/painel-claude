#include "sim/sim_hooks.h"

#include <cstdio>
#include <deque>
#include <fstream>
#include <sstream>

#include "app/platform.h"

namespace painel::sim {
namespace {

lv_obj_t* gVeil = nullptr;
lv_indev_t* gFinger = nullptr;
std::deque<std::string> gQueue;
int64_t gWaitUntil = 0;
bool gQuit = false;

struct Touch {
  int x = 0;
  int y = 0;
  int frames = 0;  // >0 = pressionado por mais N leituras
  int dx = 0;      // passo por leitura (arrastar)
  int dy = 0;
  bool releasePending = false;
} gTouch;

constexpr int kSwipeFrames = 10;

void readFinger(lv_indev_t*, lv_indev_data_t* data) {
  data->point.x = gTouch.x;
  data->point.y = gTouch.y;
  if (gTouch.frames > 0) {
    --gTouch.frames;
    gTouch.x += gTouch.dx;
    gTouch.y += gTouch.dy;
    data->state = LV_INDEV_STATE_PRESSED;
    gTouch.releasePending = true;
  } else {
    data->state = LV_INDEV_STATE_RELEASED;
    gTouch.releasePending = false;
  }
}

void writeLe(std::ofstream& out, uint32_t v, int bytes) {
  for (int i = 0; i < bytes; ++i) out.put(static_cast<char>((v >> (8 * i)) & 0xFF));
}

/** BMP 24 bits. O LVGL guarda RGB888 como B,G,R na memória, a mesma ordem do BMP. */
bool saveBmp(const std::string& path) {
  lv_draw_buf_t* shot = lv_snapshot_take(lv_screen_active(), LV_COLOR_FORMAT_RGB888);
  if (!shot) return false;
  const uint32_t w = shot->header.w;
  const uint32_t h = shot->header.h;
  const uint32_t rowBytes = (w * 3 + 3) & ~3u;
  std::ofstream out(path, std::ios::binary);
  out.put('B');
  out.put('M');
  writeLe(out, 54 + rowBytes * h, 4);
  writeLe(out, 0, 4);
  writeLe(out, 54, 4);
  writeLe(out, 40, 4);
  writeLe(out, w, 4);
  writeLe(out, h, 4);
  writeLe(out, 1, 2);
  writeLe(out, 24, 2);
  writeLe(out, 0, 4);
  writeLe(out, rowBytes * h, 4);
  writeLe(out, 2835, 4);
  writeLe(out, 2835, 4);
  writeLe(out, 0, 4);
  writeLe(out, 0, 4);
  const std::string pad(rowBytes - w * 3, '\0');
  for (int32_t y = static_cast<int32_t>(h) - 1; y >= 0; --y) {
    const uint8_t* row = shot->data + y * shot->header.stride;
    out.write(reinterpret_cast<const char*>(row), w * 3);
    out.write(pad.data(), static_cast<std::streamsize>(pad.size()));
  }
  lv_draw_buf_destroy(shot);
  return out.good();
}

void execute(const std::string& line) {
  std::istringstream in(line);
  std::string cmd;
  in >> cmd;
  if (cmd == "tap") {
    in >> gTouch.x >> gTouch.y;
    gTouch.dx = gTouch.dy = 0;
    gTouch.frames = 3;
    gWaitUntil = platform::monoMs() + 250;
  } else if (cmd == "swipe") {
    int x2 = 0;
    int y2 = 0;
    in >> gTouch.x >> gTouch.y >> x2 >> y2;
    gTouch.dx = (x2 - gTouch.x) / kSwipeFrames;
    gTouch.dy = (y2 - gTouch.y) / kSwipeFrames;
    gTouch.frames = kSwipeFrames + 1;
    gWaitUntil = platform::monoMs() + 700;
  } else if (cmd == "shot") {
    std::string path;
    in >> path;
    lv_refr_now(nullptr);
    platform::log("[sim] captura %s: %s", path.c_str(), saveBmp(path) ? "ok" : "falhou");
  } else if (cmd == "wait") {
    int ms = 0;
    in >> ms;
    gWaitUntil = platform::monoMs() + ms;
  } else if (cmd == "quit") {
    gQuit = true;
  }
}

}  // namespace

/** Tela redonda: um anel preto cobre os cantos que o vidro de verdade não tem. */
void addRoundMask(lv_display_t* display) {
  constexpr int kRing = 120;
  const int w = lv_display_get_horizontal_resolution(display);
  lv_obj_t* mask = lv_obj_create(lv_display_get_layer_sys(display));
  lv_obj_remove_style_all(mask);
  lv_obj_set_size(mask, w + 2 * kRing, w + 2 * kRing);
  lv_obj_set_pos(mask, -kRing, -kRing);
  lv_obj_set_style_radius(mask, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_border_width(mask, kRing, 0);
  lv_obj_set_style_border_color(mask, lv_color_hex(0x1b1d22), 0);
  lv_obj_set_style_border_opa(mask, LV_OPA_COVER, 0);
  lv_obj_remove_flag(mask, LV_OBJ_FLAG_CLICKABLE);
}

void init(lv_display_t* display, bool round) {
  gVeil = lv_obj_create(lv_display_get_layer_sys(display));
  lv_obj_remove_style_all(gVeil);
  lv_obj_set_size(gVeil, lv_pct(100), lv_pct(100));
  lv_obj_set_style_bg_color(gVeil, lv_color_black(), 0);
  lv_obj_set_style_bg_opa(gVeil, LV_OPA_TRANSP, 0);
  lv_obj_remove_flag(gVeil, LV_OBJ_FLAG_CLICKABLE);
  if (round) addRoundMask(display);

  gFinger = lv_indev_create();
  lv_indev_set_type(gFinger, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(gFinger, readFinger);
  lv_indev_set_display(gFinger, display);
}

void setBrightness(uint8_t percent) {
  if (!gVeil) return;
  // 100% = sem véu; 10% = quase preto, como a tela de verdade no brilho baixo.
  const int opa = 255 - (static_cast<int>(percent) * 255 / 100);
  lv_obj_set_style_bg_opa(gVeil, static_cast<lv_opa_t>(opa * 85 / 100), 0);
}

lv_indev_t* finger() { return gFinger; }

void runScript(const std::string& path) {
  if (!path.empty()) {
    std::ifstream file(path);
    if (file) {
      std::string line;
      while (std::getline(file, line)) {
        if (!line.empty()) gQueue.push_back(line);
      }
      file.close();
      std::remove(path.c_str());
    }
  }
  while (!gQueue.empty() && platform::monoMs() >= gWaitUntil && !gTouch.releasePending && gTouch.frames == 0) {
    const std::string line = gQueue.front();
    gQueue.pop_front();
    platform::log("[sim] %s", line.c_str());
    execute(line);
  }
}

bool quitRequested() { return gQuit; }

}  // namespace painel::sim
