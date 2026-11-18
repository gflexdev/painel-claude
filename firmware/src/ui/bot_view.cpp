#include "ui/bot_view.h"

#include "app/bot.h"
#include "ui/theme.h"

namespace painel::ui {
namespace {

void freeBuffer(lv_event_t* e) {
  auto* buf = static_cast<lv_draw_buf_t*>(lv_event_get_user_data(e));
  if (buf) lv_draw_buf_destroy(buf);
}

}  // namespace

int BotView::width() const { return bot::kCanvasCols * cell_; }
int BotView::height() const { return bot::kCanvasRows * cell_; }

lv_obj_t* BotView::create(lv_obj_t* parent, int cell) {
  cell_ = cell;
  canvas_ = lv_canvas_create(parent);
  // ARGB8888 com fundo transparente: os olhos são furos que mostram o fundo, como no SVG da web.
  lv_draw_buf_t* buf = lv_draw_buf_create(width(), height(), LV_COLOR_FORMAT_ARGB8888, LV_STRIDE_AUTO);
  if (!buf) {
    LV_LOG_ERROR("sem memória para o robô");
    lv_obj_add_flag(canvas_, LV_OBJ_FLAG_HIDDEN);  // o objeto continua existindo; draw() vira no-op
    return canvas_;
  }
  ready_ = true;
  lv_canvas_set_draw_buf(canvas_, buf);
  lv_obj_add_event_cb(canvas_, freeBuffer, LV_EVENT_DELETE, buf);
  lv_obj_remove_flag(canvas_, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_flag(canvas_, LV_OBJ_FLAG_EVENT_BUBBLE);
  return canvas_;
}

void BotView::fillCell(int col, int row, lv_color_t color) {
  for (int y = 0; y < cell_; ++y) {
    for (int x = 0; x < cell_; ++x) lv_canvas_set_px(canvas_, col * cell_ + x, row * cell_ + y, color, LV_OPA_COVER);
  }
}

void BotView::draw(const BotLook& look) {
  char colors[64];
  lv_snprintf(colors, sizeof colors, "|%06lx|%06lx|%06lx", static_cast<unsigned long>(look.body),
              static_cast<unsigned long>(look.background), static_cast<unsigned long>(look.accessoryColor));
  const std::string key = look.id + "|" + look.project + "|" + look.accessory + colors;
  if (!ready_ || key == key_) return;
  key_ = key;

  lv_canvas_fill_bg(canvas_, hex(look.background), LV_OPA_TRANSP);

  // Corpo: a linha 0 (antena) é coberta pelo chapéu; o corpo começa na linha HAT_ROWS. 2 = olho/boca (furo).
  const bot::Cells cells = bot::cellsFor(look.id);
  for (int y = 1; y < bot::kBodyRows; ++y) {
    for (int x = 0; x < bot::kBodyCols; ++x) {
      if (cells[y][x] == 1) fillCell(x, y + bot::kHatRows - 1, hex(look.body));
    }
  }

  const bot::Hat hat = bot::hatFor(look.project);
  for (int y = 0; y < bot::kHatRows; ++y) {
    for (int x = 0; x < bot::kHatCols; ++x) {
      if (hat.shape[y][x] == '#') fillCell(1 + x, y, hex(hat.color));
    }
  }

  if (const char* const* glyph = bot::accessory(look.accessory)) {
    for (int y = 0; y < bot::kAccSize; ++y) {
      for (int x = 0; x < bot::kAccSize; ++x) {
        if (glyph[y][x] == '#') fillCell(bot::kBodyCols + x, y, hex(look.accessoryColor));
      }
    }
  }
  lv_obj_invalidate(canvas_);
}

}  // namespace painel::ui
