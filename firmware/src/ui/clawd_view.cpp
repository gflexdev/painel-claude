#include "ui/clawd_view.h"

#include <algorithm>
#include <cstring>
#include <vector>

#include "app/platform.h"

namespace painel::ui {
namespace {

constexpr uint32_t kFrameMs = 40;  // as animações da web andam em degraus; 25 quadros/s sobram

std::vector<ClawdView*>& registry() {
  static std::vector<ClawdView*> views;
  return views;
}

lv_timer_t* gTimer = nullptr;

void freeBuffer(lv_event_t* e) {
  auto* buf = static_cast<lv_draw_buf_t*>(lv_event_get_user_data(e));
  if (buf) lv_draw_buf_destroy(buf);
}

}  // namespace

ClawdView::~ClawdView() {
  auto& views = registry();
  views.erase(std::remove(views.begin(), views.end(), this), views.end());
}

lv_obj_t* ClawdView::create(lv_obj_t* parent, int unit) {
  unit_ = unit;
  canvas_ = lv_canvas_create(parent);
  buf_ = lv_draw_buf_create(width(), height(), LV_COLOR_FORMAT_ARGB8888, LV_STRIDE_AUTO);
  if (!buf_) {
    LV_LOG_ERROR("sem memória para o Clawd");
    lv_obj_add_flag(canvas_, LV_OBJ_FLAG_HIDDEN);
    return canvas_;
  }
  lv_canvas_set_draw_buf(canvas_, buf_);
  lv_obj_add_event_cb(canvas_, freeBuffer, LV_EVENT_DELETE, buf_);
  lv_obj_remove_flag(canvas_, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_flag(canvas_, LV_OBJ_FLAG_EVENT_BUBBLE);
  registry().push_back(this);
  if (!gTimer) gTimer = lv_timer_create(tickAll, kFrameMs, nullptr);
  render(platform::monoMs(), true);
  return canvas_;
}

void ClawdView::setLook(const clawd::Look& look) {
  const bool changed = look.mood != look_.mood || look.ground != look_.ground || look.accessory != look_.accessory ||
                       look.accessoryColor != look_.accessoryColor || look.sparkle != look_.sparkle;
  look_ = look;
  if (changed) render(platform::monoMs(), false);
}

void ClawdView::poke() {
  pokedAt_ = platform::monoMs();
  render(pokedAt_, false);
}

void ClawdView::render(int64_t now, bool force) {
  if (!buf_) return;
  const int64_t pokeAge = pokedAt_ >= 0 ? now - pokedAt_ : -1;
  const std::vector<clawd::Rect> rects = clawd::frame(look_, now, pokeAge);
  const uint32_t key = clawd::keyOf(rects);
  if (!force && key == key_) return;
  key_ = key;

  auto* data = static_cast<uint8_t*>(buf_->data);
  const uint32_t stride = buf_->header.stride;
  const int w = width();
  const int h = height();
  for (int y = 0; y < h; ++y) std::memset(data + y * stride, 0, static_cast<size_t>(w) * 4);
  for (const clawd::Rect& r : rects) {
    const int x0 = std::max(0, r.x * unit_);
    const int y0 = std::max(0, (r.y - clawd::kTop) * unit_);
    const int x1 = std::min(w, (r.x + r.w) * unit_);
    const int y1 = std::min(h, (r.y - clawd::kTop + r.h) * unit_);
    const uint8_t red = (r.color >> 16) & 0xFF;
    const uint8_t green = (r.color >> 8) & 0xFF;
    const uint8_t blue = r.color & 0xFF;
    for (int y = y0; y < y1; ++y) {
      uint8_t* px = data + y * stride + x0 * 4;
      for (int x = x0; x < x1; ++x, px += 4) {
        px[0] = blue;  // ARGB8888 do LVGL fica B, G, R, A na memória
        px[1] = green;
        px[2] = red;
        px[3] = r.opa;
      }
    }
  }
  lv_obj_invalidate(canvas_);
}

void ClawdView::tickAll(lv_timer_t*) {
  const int64_t now = platform::monoMs();
  for (ClawdView* view : registry()) {
    if (view->canvas_ && lv_obj_is_visible(view->canvas_)) view->render(now, false);
  }
}

}  // namespace painel::ui
