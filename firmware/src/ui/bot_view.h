// Desenha o robozinho (app/bot.h) num canvas LVGL, com pixels quadrados de `cell` px.
#pragma once

#include <lvgl.h>

#include <cstdint>
#include <string>

namespace painel::ui {

struct BotLook {
  std::string id;
  std::string project;
  std::string accessory;
  uint32_t body = 0;       // cor do corpo (status)
  uint32_t background = 0;  // fundo do tile (os olhos têm essa cor)
  uint32_t accessoryColor = 0;
};

class BotView {
 public:
  /** Cria o canvas (13×9 células). O buffer é liberado quando o objeto for apagado. */
  lv_obj_t* create(lv_obj_t* parent, int cell);
  /** Redesenha só se o visual mudou. */
  void draw(const BotLook& look);
  lv_obj_t* obj() const { return canvas_; }
  int width() const;
  int height() const;

 private:
  void fillCell(int col, int row, lv_color_t color);
  lv_obj_t* canvas_ = nullptr;
  int cell_ = 1;
  bool ready_ = false;
  std::string key_;
};

}  // namespace painel::ui
