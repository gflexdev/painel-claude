// As três visões do mostrador, uma por página do carrossel: Visão geral (o Mapa em órbita, com um Clawd por
// sessão em movimento e o Clawd grande no meio), Sessões (lista) e Uso do plano. Nenhuma fala com o servidor.
#pragma once

#include <lvgl.h>

#include <array>
#include <functional>
#include <string>
#include <vector>

#include "app/model.h"
#include "ui/clawd_view.h"

namespace painel::round {

using OpenSession = std::function<void(const std::string& id)>;

/** O que todas as visões recebem a cada atualização. */
struct Frame {
  const Snapshot* snap = nullptr;  // nullptr = ainda sem dado do Mac
  int64_t now = 0;                 // hora do Mac (epoch ms)
  int tzOffsetMin = -180;
};

class OverviewPage {
 public:
  void create(lv_obj_t* tile, OpenSession open);
  void update(const Frame& f);

 private:
  static constexpr int kMaxOrbs = 8;
  struct Orb {
    lv_obj_t* obj = nullptr;
    lv_obj_t* badge = nullptr;
    lv_obj_t* mark = nullptr;  // vigiada
    lv_obj_t* line = nullptr;
    lv_point_precise_t points[2] = {};
    ui::ClawdView clawd;
    std::string id;
    uint32_t color = 0;
    bool pulsing = false;
  };
  static void onOrb(lv_event_t* e);
  static void onCore(lv_event_t* e);

  OpenSession open_;
  std::array<Orb, kMaxOrbs> orbs_;
  lv_obj_t* core_ = nullptr;
  ui::ClawdView coreClawd_;
  lv_obj_t* count_ = nullptr;
  lv_obj_t* caption_ = nullptr;
  lv_obj_t* clock_ = nullptr;
  lv_obj_t* counters_ = nullptr;
  std::array<lv_obj_t*, 4> countN_{};
  std::array<lv_obj_t*, 4> countWord_{};
  std::array<lv_obj_t*, 4> countItem_{};
  uint32_t coreGlow_ = 0;
};

class ListPage {
 public:
  void create(lv_obj_t* tile, OpenSession open);
  void update(const Frame& f);

 private:
  static constexpr int kMaxRows = 16;
  struct Row {
    lv_obj_t* obj = nullptr;
    lv_obj_t* name = nullptr;
    lv_obj_t* word = nullptr;
    lv_obj_t* time = nullptr;
    lv_obj_t* mark = nullptr;  // vigiada
    ui::ClawdView clawd;
    bool pulsing = false;
  };
  static void onRow(lv_event_t* e);

  OpenSession open_;
  lv_obj_t* subtitle_ = nullptr;
  lv_obj_t* list_ = nullptr;
  lv_obj_t* empty_ = nullptr;
  std::array<Row, kMaxRows> rows_;
  std::vector<std::string> ids_;
};

class UsagePage {
 public:
  void create(lv_obj_t* tile);
  void update(const Frame& f);

 private:
  lv_obj_t* outer_ = nullptr;
  lv_obj_t* inner_ = nullptr;
  lv_obj_t* outerPace_ = nullptr;
  lv_obj_t* innerPace_ = nullptr;
  lv_obj_t* label_ = nullptr;
  lv_obj_t* big_ = nullptr;
  lv_obj_t* percentSign_ = nullptr;
  lv_obj_t* pace_ = nullptr;
  lv_obj_t* reset_ = nullptr;
  lv_obj_t* rows_ = nullptr;
  std::array<lv_obj_t*, 3> rowDot_{};
  std::array<lv_obj_t*, 3> rowName_{};
  std::array<lv_obj_t*, 3> rowValue_{};
  std::array<lv_obj_t*, 3> rowLine_{};
  lv_obj_t* footnote_ = nullptr;
};

}  // namespace painel::round
