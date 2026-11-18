#include "ui/grid.h"

#include <algorithm>

#include "app/format.h"
#include "ui/theme.h"

namespace painel::ui {
namespace {

constexpr int kMargin = 6;
constexpr int kGap = 5;
constexpr int kPagerHeight = 28;
constexpr int kPad = 7;
constexpr int kCell = 3;  // robô de 39×27 px
constexpr uint32_t kGestureClickGuardMs = 400;

void animBorderOpa(void* obj, int32_t v) {
  lv_obj_set_style_border_opa(static_cast<lv_obj_t*>(obj), static_cast<lv_opa_t>(v), 0);
}
void animBob(void* obj, int32_t v) {
  lv_obj_set_style_translate_y(static_cast<lv_obj_t*>(obj), v < 50 ? 0 : -2, 0);
}
void animSlide(void* obj, int32_t v) { lv_obj_set_x(static_cast<lv_obj_t*>(obj), v); }

void startAnim(lv_obj_t* obj, lv_anim_exec_xcb_t cb, int32_t from, int32_t to, uint32_t ms, bool reverse) {
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, obj);
  lv_anim_set_exec_cb(&a, cb);
  lv_anim_set_values(&a, from, to);
  lv_anim_set_duration(&a, ms);
  if (reverse) lv_anim_set_reverse_duration(&a, ms);
  lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
  lv_anim_start(&a);
}

lv_obj_t* arrowButton(lv_obj_t* parent, const char* symbol) {
  lv_obj_t* btn = box(parent);
  lv_obj_set_size(btn, 72, kPagerHeight);
  lv_obj_add_flag(btn, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_t* l = label(btn, &lv_font_montserrat_20, color::kInkDim, symbol);
  lv_obj_center(l);
  return btn;
}

}  // namespace

void Grid::create(lv_obj_t* parent, int top, int height, OpenHandler onOpen) {
  onOpen_ = std::move(onOpen);
  const int width = lv_obj_get_width(parent) > 0 ? lv_obj_get_width(parent) : 480;

  area_ = box(parent);
  lv_obj_set_pos(area_, 0, top);
  lv_obj_set_size(area_, width, height);
  lv_obj_add_flag(area_, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(area_, onGesture, LV_EVENT_GESTURE, this);

  const int gridHeight = height - kPagerHeight;
  const int tileW = (width - 2 * kMargin - (kCols - 1) * kGap) / kCols;
  const int tileH = (gridHeight - kMargin - (kRows - 1) * kGap) / kRows;
  for (int slot = 0; slot < kPerPage; ++slot) buildTile(tiles_[slot], slot, tileW, tileH);

  empty_ = label(area_, &font_disp_18, color::kInkDim,
                 "Nenhuma sessão agora.\n\nQuando você abrir uma no\nClaude Code ela aparece aqui.");
  lv_obj_set_style_text_align(empty_, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_align(empty_, LV_ALIGN_CENTER, 0, -20);

  pager_ = box(area_);
  lv_obj_set_size(pager_, width, kPagerHeight);
  lv_obj_align(pager_, LV_ALIGN_BOTTOM_MID, 0, 0);
  prev_ = arrowButton(pager_, LV_SYMBOL_LEFT);
  lv_obj_align(prev_, LV_ALIGN_LEFT_MID, 60, 0);
  lv_obj_add_event_cb(prev_, onPrev, LV_EVENT_CLICKED, this);
  next_ = arrowButton(pager_, LV_SYMBOL_RIGHT);
  lv_obj_align(next_, LV_ALIGN_RIGHT_MID, -60, 0);
  lv_obj_add_event_cb(next_, onNext, LV_EVENT_CLICKED, this);
  pagerText_ = label(pager_, &font_mono_12, color::kInkDim);
  lv_obj_center(pagerText_);
}

void Grid::buildTile(Tile& tile, int slot, int width, int height) {
  const int col = slot % kCols;
  const int row = slot / kCols;
  tile.box = box(area_);
  lv_obj_set_pos(tile.box, kMargin + col * (width + kGap), kMargin + row * (height + kGap));
  lv_obj_set_size(tile.box, width, height);
  lv_obj_set_style_radius(tile.box, 10, 0);
  lv_obj_set_style_bg_color(tile.box, hex(color::kTile), 0);
  lv_obj_set_style_bg_opa(tile.box, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(tile.box, 1, 0);
  lv_obj_set_style_border_color(tile.box, hex(color::kLine), 0);
  lv_obj_set_style_border_color(tile.box, hex(color::kInk), LV_STATE_PRESSED);
  lv_obj_set_style_bg_color(tile.box, hex(color::kTileHi), LV_STATE_PRESSED);
  lv_obj_add_flag(tile.box, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_flag(tile.box, LV_OBJ_FLAG_GESTURE_BUBBLE);
  lv_obj_set_user_data(tile.box, &tile);
  lv_obj_add_event_cb(tile.box, onTileClick, LV_EVENT_CLICKED, this);

  tile.bar = box(tile.box);
  lv_obj_set_size(tile.bar, 3, height - 20);
  lv_obj_set_pos(tile.bar, 0, 10);
  lv_obj_set_style_bg_opa(tile.bar, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(tile.bar, 2, 0);

  lv_obj_t* bot = tile.bot.create(tile.box, kCell);
  lv_obj_set_pos(bot, kPad + 1, kPad);

  tile.time = label(tile.box, &font_mono_12, color::kInkDim);
  lv_obj_align(tile.time, LV_ALIGN_TOP_RIGHT, -kPad, kPad - 1);
  tile.ctx = label(tile.box, &font_mono_12, color::kInkFaint);
  lv_obj_align(tile.ctx, LV_ALIGN_TOP_RIGHT, -kPad, kPad + 14);

  const int textW = width - 2 * kPad;
  tile.name = label(tile.box, &font_disp_15, color::kInk);
  lv_obj_set_pos(tile.name, kPad, kPad + tile.bot.height() + 2);
  lv_obj_set_size(tile.name, textW, 2 * lv_font_get_line_height(&font_disp_15));
  lv_label_set_long_mode(tile.name, LV_LABEL_LONG_MODE_DOTS);

  tile.word = label(tile.box, &font_mono_12, color::kInk);
  lv_obj_set_size(tile.word, textW, lv_font_get_line_height(&font_mono_12));
  lv_obj_align(tile.word, LV_ALIGN_BOTTOM_LEFT, kPad, -7);
  lv_label_set_long_mode(tile.word, LV_LABEL_LONG_MODE_DOTS);

  // "terminou · ver": listras azuis que andam embaixo do tile até você abrir a sessão
  tile.stripe = box(tile.box);
  lv_obj_set_size(tile.stripe, width - 16, 3);
  lv_obj_align(tile.stripe, LV_ALIGN_BOTTOM_MID, 0, -1);
  tile.stripeLine = lv_line_create(tile.stripe);
  static const lv_point_precise_t kStripePoints[] = {{0, 1}, {200, 1}};
  lv_line_set_points(tile.stripeLine, kStripePoints, 2);
  lv_obj_set_style_line_width(tile.stripeLine, 3, 0);
  lv_obj_set_style_line_color(tile.stripeLine, hex(color::kUnseen), 0);
  lv_obj_set_style_line_dash_width(tile.stripeLine, 10, 0);
  lv_obj_set_style_line_dash_gap(tile.stripeLine, 10, 0);
  lv_obj_add_flag(tile.stripe, LV_OBJ_FLAG_HIDDEN);
  lv_obj_add_flag(tile.box, LV_OBJ_FLAG_HIDDEN);
}

int Grid::pageCount() const {
  return std::max(1, static_cast<int>((sessions_.size() + kPerPage - 1) / kPerPage));
}

void Grid::update(const std::vector<Session>& sessions, int64_t serverNow) {
  sessions_ = sessions;
  page_ = std::min(page_, pageCount() - 1);
  render(serverNow);
}

void Grid::render(int64_t serverNow) {
  lastNow_ = serverNow;
  for (int slot = 0; slot < kPerPage; ++slot) {
    Tile& tile = tiles_[slot];
    const int index = page_ * kPerPage + slot;
    if (index >= static_cast<int>(sessions_.size())) {
      tile.index = -1;
      lv_obj_add_flag(tile.box, LV_OBJ_FLAG_HIDDEN);
      continue;
    }
    tile.index = index;
    lv_obj_remove_flag(tile.box, LV_OBJ_FLAG_HIDDEN);
    fillTile(tile, sessions_[index], serverNow);
  }
  if (sessions_.empty()) lv_obj_remove_flag(empty_, LV_OBJ_FLAG_HIDDEN);
  else lv_obj_add_flag(empty_, LV_OBJ_FLAG_HIDDEN);

  const int pages = pageCount();
  if (pages > 1) {
    lv_label_set_text_fmt(pagerText_, "%d / %d  ·  %d sessões", page_ + 1, pages, static_cast<int>(sessions_.size()));
  } else {
    lv_label_set_text(pagerText_, "");
  }
  lv_obj_set_style_opa(prev_, page_ > 0 ? LV_OPA_COVER : LV_OPA_0, 0);
  lv_obj_set_style_opa(next_, page_ < pages - 1 ? LV_OPA_COVER : LV_OPA_0, 0);
}

void Grid::fillTile(Tile& tile, const Session& s, int64_t serverNow) {
  const uint32_t c = statusColor(s);
  lv_obj_set_style_bg_color(tile.bar, hex(c), 0);
  tile.bot.draw({s.id, s.project, accessoryOf(s), c, color::kTile,
                 s.status == "idle" && s.unseen ? color::kUnseen : color::kInkDim});
  lv_label_set_text(tile.name, oneLine(s.name).c_str());
  lv_label_set_text(tile.word, upper(tileWord(s)).c_str());
  lv_obj_set_style_text_color(tile.word, hex(c), 0);
  lv_label_set_text(tile.time, s.stale ? "sem sinal" : elapsed(s.since, serverNow).c_str());
  lv_label_set_text(tile.ctx, s.contextTokens >= 0 ? tokens(s.contextTokens).c_str() : "");
  lv_obj_set_style_opa(tile.box, s.status == "ended" ? LV_OPA_50 : LV_OPA_COVER, 0);
  setAnimations(tile, s);
}

void Grid::setAnimations(Tile& tile, const Session& s) {
  const bool waiting = s.status == "waiting";
  const bool working = s.status == "working" && !s.stale;
  const bool unseen = s.status == "idle" && s.unseen;
  const std::string key = std::string(waiting ? "w" : "") + (working ? "r" : "") + (unseen ? "u" : "");
  if (key == tile.animKey) return;
  tile.animKey = key;

  lv_anim_delete(tile.box, animBorderOpa);
  lv_anim_delete(tile.bot.obj(), animBob);
  lv_anim_delete(tile.stripeLine, animSlide);
  lv_obj_set_style_translate_y(tile.bot.obj(), 0, 0);

  // Esperando você: borda vermelha pulsando (como o ::after da web).
  lv_obj_set_style_border_width(tile.box, waiting ? 2 : 1, 0);
  lv_obj_set_style_border_color(tile.box, hex(waiting ? color::kWaiting : unseen ? 0x2f3d5e : color::kLine), 0);
  lv_obj_set_style_border_opa(tile.box, LV_OPA_COVER, 0);
  if (waiting) startAnim(tile.box, animBorderOpa, 64, 255, 700, true);
  if (working) startAnim(tile.bot.obj(), animBob, 0, 100, 900, false);
  if (unseen) {
    lv_obj_remove_flag(tile.stripe, LV_OBJ_FLAG_HIDDEN);
    startAnim(tile.stripeLine, animSlide, -20, 0, 1200, false);
  } else {
    lv_obj_add_flag(tile.stripe, LV_OBJ_FLAG_HIDDEN);
  }
}

void Grid::tick(int64_t serverNow) {
  lastNow_ = serverNow;
  for (Tile& tile : tiles_) {
    if (tile.index < 0) continue;
    const Session& s = sessions_[tile.index];
    lv_label_set_text(tile.time, s.stale ? "sem sinal" : elapsed(s.since, serverNow).c_str());
  }
}

void Grid::goToPage(int page) {
  const int clamped = std::clamp(page, 0, pageCount() - 1);
  if (clamped == page_) return;
  page_ = clamped;
  render(lastNow_);
}

void Grid::onTileClick(lv_event_t* e) {
  auto* self = static_cast<Grid*>(lv_event_get_user_data(e));
  auto* tile = static_cast<Tile*>(lv_obj_get_user_data(lv_event_get_current_target_obj(e)));
  if (lv_tick_elaps(self->gestureAt_) < kGestureClickGuardMs) return;  // foi um deslize, não um toque
  if (!tile || tile->index < 0 || tile->index >= static_cast<int>(self->sessions_.size())) return;
  if (self->onOpen_) self->onOpen_(self->sessions_[tile->index]);
}

void Grid::onGesture(lv_event_t* e) {
  auto* self = static_cast<Grid*>(lv_event_get_user_data(e));
  const lv_dir_t dir = lv_indev_get_gesture_dir(lv_indev_active());
  if (dir == LV_DIR_LEFT) self->goToPage(self->page_ + 1);
  else if (dir == LV_DIR_RIGHT) self->goToPage(self->page_ - 1);
  else return;
  self->gestureAt_ = lv_tick_get();
  lv_indev_wait_release(lv_indev_active());
}

void Grid::onPrev(lv_event_t* e) {
  auto* self = static_cast<Grid*>(lv_event_get_user_data(e));
  self->goToPage(self->page_ - 1);
}

void Grid::onNext(lv_event_t* e) {
  auto* self = static_cast<Grid*>(lv_event_get_user_data(e));
  self->goToPage(self->page_ + 1);
}

}  // namespace painel::ui
