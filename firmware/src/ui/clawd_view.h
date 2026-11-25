// Desenha o Clawd (app/clawd.h) num canvas LVGL transparente, com `unit` px por pixel do bicho.
// Um timer só anima todos os Clawds visíveis; cada um redesenha apenas quando a pose muda.
#pragma once

#include <lvgl.h>

#include <cstdint>

#include "app/clawd.h"

namespace painel::ui {

class ClawdView {
 public:
  ClawdView() = default;
  ~ClawdView();
  ClawdView(const ClawdView&) = delete;
  ClawdView& operator=(const ClawdView&) = delete;

  /** Cria o canvas (21×15 unidades). O buffer é liberado quando o objeto for apagado. */
  lv_obj_t* create(lv_obj_t* parent, int unit);
  void setLook(const clawd::Look& look);
  /** Pulo com coração, como o toque na web. */
  void poke();
  lv_obj_t* obj() const { return canvas_; }
  int width() const { return clawd::kCols * unit_; }
  int height() const { return clawd::kRows * unit_; }
  /** Onde fica, dentro do canvas, o meio dos pés (para alinhar o bicho, não o canvas). */
  int bodyCenterX() const { return 8 * unit_; }

 private:
  void render(int64_t now, bool force);
  static void tickAll(lv_timer_t* timer);

  lv_obj_t* canvas_ = nullptr;
  lv_draw_buf_t* buf_ = nullptr;
  int unit_ = 1;
  clawd::Look look_;
  int64_t pokedAt_ = -1;
  uint32_t key_ = 0;
};

}  // namespace painel::ui
