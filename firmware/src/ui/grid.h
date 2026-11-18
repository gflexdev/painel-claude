// Grade 4×4 de sessões com paginação (deslizar ou tocar nas setas). A ordem vem do servidor:
// quem espera você primeiro, depois erro, "terminou · ver", rodando e parada.
#pragma once

#include <lvgl.h>

#include <array>
#include <functional>
#include <string>
#include <vector>

#include "app/model.h"
#include "ui/bot_view.h"

namespace painel::ui {

class Grid {
 public:
  static constexpr int kCols = 4;
  static constexpr int kRows = 4;
  static constexpr int kPerPage = kCols * kRows;

  using OpenHandler = std::function<void(const Session&)>;

  void create(lv_obj_t* parent, int top, int height, OpenHandler onOpen);
  void update(const std::vector<Session>& sessions, int64_t serverNow);
  /** Atualiza só os tempos ("3 min") e o "sem sinal há". */
  void tick(int64_t serverNow);

 private:
  struct Tile {
    lv_obj_t* box = nullptr;
    lv_obj_t* bar = nullptr;
    BotView bot;
    lv_obj_t* time = nullptr;
    lv_obj_t* ctx = nullptr;
    lv_obj_t* name = nullptr;
    lv_obj_t* word = nullptr;
    lv_obj_t* stripe = nullptr;
    lv_obj_t* stripeLine = nullptr;
    int index = -1;  // posição em sessions_ (-1 = vazio)
    std::string animKey;
  };

  void buildTile(Tile& tile, int slot, int width, int height);
  void fillTile(Tile& tile, const Session& s, int64_t serverNow);
  void setAnimations(Tile& tile, const Session& s);
  void render(int64_t serverNow);
  void goToPage(int page);
  int pageCount() const;

  static void onTileClick(lv_event_t* e);
  static void onGesture(lv_event_t* e);
  static void onPrev(lv_event_t* e);
  static void onNext(lv_event_t* e);

  lv_obj_t* area_ = nullptr;
  lv_obj_t* empty_ = nullptr;
  lv_obj_t* pager_ = nullptr;
  lv_obj_t* pagerText_ = nullptr;
  lv_obj_t* prev_ = nullptr;
  lv_obj_t* next_ = nullptr;
  std::array<Tile, kPerPage> tiles_{};
  std::vector<Session> sessions_;
  int page_ = 0;
  int64_t lastNow_ = 0;
  uint32_t gestureAt_ = 0;
  OpenHandler onOpen_;
};

}  // namespace painel::ui
