// Mostrador redondo (Waveshare ESP32-S3-Touch-AMOLED-1.75, 466×466): carrossel com Visão geral, Sessões e
// Uso do plano; toque abre o detalhe da sessão; quem espera você aparece sozinho, com Permitir / Negar.
// Roda na thread da interface, igual ao App da tela quadrada.
#pragma once

#include <lvgl.h>

#include <memory>
#include <set>
#include <string>

#include "app/client.h"
#include "app/model.h"
#include "app/watch.h"
#include "app/wake.h"
#include "round/pages.h"
#include "round/session_view.h"
#include "ui/clawd_view.h"

namespace painel::round {

struct RoundOptions {
  int tzOffsetMin = -180;
  WakeOptions wake;
  /** Mac sem resposta por mais que isso: troca tudo pela tela "Mac sem resposta". */
  int64_t offlineScreenAfterMs = 45000;
  /** Depois de um pedido respondido (aqui, no Mac ou no celular), sem toque por isso: volta à Visão geral. */
  int64_t homeAfterAnswerMs = 30000;
};

class RoundApp {
 public:
  RoundApp(Client& client, RoundOptions options);
  void build(lv_obj_t* screen);
  void loop();
  void wrapTouch(lv_indev_t* indev) { wake_.wrapTouch(indev); }
  void setNetworkNote(const std::string& note);

 private:
  void handle(ClientEvent& ev);
  void applySnapshot(std::shared_ptr<Snapshot> snap);
  void onWatch(const ClientEvent& ev);
  void refresh();
  void renderLinkScreen();
  void renderPager();
  void openSession(const std::string& id);
  void openNextWaiting(const std::string& except);
  void goHomeWhenIdle(int64_t now);
  int64_t serverNow() const;
  bool busy() const;
  static void onTileChanged(lv_event_t* e);

  Client& client_;
  RoundOptions opt_;
  Wake wake_;
  /** Vigiar pelo detalhe: o pedido a caminho e o estado que o painel confirmou. */
  WatchToggle watch_;
  OverviewPage overview_;
  ListPage list_;
  UsagePage usage_;
  std::unique_ptr<SessionView> session_;

  lv_obj_t* tiles_ = nullptr;
  lv_obj_t* pager_[3] = {};
  lv_obj_t* linkScreen_ = nullptr;
  ui::ClawdView linkClawd_;
  lv_obj_t* linkTitle_ = nullptr;
  lv_obj_t* linkText_ = nullptr;
  lv_obj_t* linkHint_ = nullptr;

  std::shared_ptr<Snapshot> snapshot_;
  int64_t snapshotMono_ = 0;
  std::set<std::string> waitingIds_;
  bool seenFirstSnapshot_ = false;
  Link link_ = Link::Connecting;
  std::string linkMessage_;
  std::string networkNote_;
  int64_t retryAt_ = 0;
  int64_t startedMono_ = 0;
  int64_t offlineSince_ = 0;
  int64_t lastSecond_ = 0;
  /** Quando o pedido aberto foi respondido (0 = nada para voltar). */
  int64_t answeredAt_ = 0;
};

}  // namespace painel::round
