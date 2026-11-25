// Cola tudo: lê os eventos do cliente, atualiza a grade, o detalhe, a barra do topo e as telas de
// estado (Wi-Fi, Mac sem resposta, token recusado) e cuida do brilho. Roda na thread da interface.
#pragma once

#include <lvgl.h>

#include <memory>
#include <string>
#include <vector>

#include "app/client.h"
#include "app/model.h"
#include "app/wake.h"
#include "ui/bot_view.h"
#include "ui/detail.h"
#include "ui/grid.h"

namespace painel {

struct AppOptions {
  int tzOffsetMin = -180;
  uint8_t brightFull = 100;
  uint8_t brightLow = 10;
  /** Toque mantém o brilho cheio por este tempo. */
  int64_t touchAwakeMs = 60000;
  /** Sem ninguém esperando/rodando e sem toque: escurece depois disso. */
  int64_t dimAfterMs = 90000;
  /** Mac sem resposta por mais que isso: troca a grade pela tela "Mac sem resposta". */
  int64_t offlineScreenAfterMs = 45000;
};

class App {
 public:
  App(Client& client, AppOptions options);
  void build(lv_obj_t* screen);
  /** Chame no laço principal, junto com lv_timer_handler(). */
  void loop();
  /** Embrulha a leitura do toque: com a tela escura, o primeiro toque só acende (não clica). */
  void wrapTouch(lv_indev_t* indev) { wake_.wrapTouch(indev); }
  /** Recado da plataforma para a tela de estado (ex.: "Conectando ao Wi-Fi casa…"); vazio = nada. */
  void setNetworkNote(const std::string& note);
  uint8_t brightness() const { return wake_.brightness(); }

 private:
  void handle(ClientEvent& ev);
  void applySnapshot(std::shared_ptr<Snapshot> snap);
  void tickSecond();
  void renderTopbar();
  void updateDot(int mode);
  void renderStatusScreen();
  int64_t serverNow() const;
  bool busy() const;

  Client& client_;
  AppOptions opt_;
  ui::Grid grid_;
  std::unique_ptr<ui::DetailView> detail_;

  lv_obj_t* counters_ = nullptr;
  lv_obj_t* countLabels_[4] = {};
  lv_obj_t* countWords_[4] = {};
  lv_obj_t* offlineText_ = nullptr;
  lv_obj_t* linkDot_ = nullptr;
  lv_obj_t* clock_ = nullptr;

  lv_obj_t* statusScreen_ = nullptr;
  ui::BotView statusBot_;
  lv_obj_t* statusTitle_ = nullptr;
  lv_obj_t* statusText_ = nullptr;
  lv_obj_t* statusHint_ = nullptr;

  std::shared_ptr<Snapshot> snapshot_;
  int64_t snapshotMono_ = 0;
  Link link_ = Link::Connecting;
  std::string linkMessage_;
  int64_t retryAt_ = 0;
  int64_t startedMono_ = 0;
  int64_t offlineSince_ = 0;
  std::string networkNote_;

  int64_t lastSecond_ = 0;
  Wake wake_;
  int dotMode_ = -1;
};

}  // namespace painel
