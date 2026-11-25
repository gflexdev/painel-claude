// Detalhe de uma sessão no mostrador redondo, por cima do carrossel: o Clawd dela, a situação, o contexto
// no anel e o que está fazendo agora. Se ela espera você, mostra o pedido e Permitir / Negar (ou Aprovar /
// Recusar o plano); pergunta com opções fica para o Mac ou o celular.
#pragma once

#include <lvgl.h>

#include <functional>
#include <memory>
#include <string>

#include "app/client.h"
#include "app/model.h"
#include "ui/clawd_view.h"

namespace painel::round {

class SessionView {
 public:
  SessionView(Client& client, std::function<int64_t()> serverNow)
      : client_(client), serverNow_(std::move(serverNow)) {}

  void create(lv_obj_t* screen);
  void open(const Session& session);
  void close();
  bool isOpen() const { return !openId_.empty(); }
  const std::string& openId() const { return openId_; }

  /** Depois de uma decisão aceita (e do aviso na tela), a app escolhe o próximo pedido ou fecha. */
  void onDecided(std::function<void(const std::string& decidedId)> next) { onDecided_ = std::move(next); }

  void onSnapshot(const Snapshot& snapshot);
  void onDetail(const ClientEvent& ev);
  void onDecision(const ClientEvent& ev);
  /** Chame no laço: cuida do tempo do aviso. */
  void loop();
  /** Chame a cada segundo: atualiza os tempos. */
  void tick();

 private:
  void render();
  void decide(bool allow);
  void showToast(const std::string& text, uint32_t bg, uint32_t ink, bool thenNext);
  void setEdge(bool on);
  const Request* request() const;

  static void onBack(lv_event_t* e);
  static void onGesture(lv_event_t* e);
  static void onAllow(lv_event_t* e);
  static void onDeny(lv_event_t* e);

  Client& client_;
  std::function<int64_t()> serverNow_;
  std::function<void(const std::string&)> onDecided_;

  std::string openId_;
  Session session_;
  std::shared_ptr<Detail> detail_;
  int waitingIndex_ = 0;
  int waitingTotal_ = 0;
  bool busy_ = false;
  bool edgeOn_ = false;
  int64_t toastUntil_ = 0;
  bool toastThenNext_ = false;

  lv_obj_t* root_ = nullptr;
  lv_obj_t* ring_ = nullptr;
  lv_obj_t* edge_ = nullptr;
  ui::ClawdView clawd_;
  lv_obj_t* chip_ = nullptr;
  lv_obj_t* chipDot_ = nullptr;
  lv_obj_t* chipText_ = nullptr;
  lv_obj_t* name_ = nullptr;
  lv_obj_t* sub_ = nullptr;

  lv_obj_t* calm_ = nullptr;
  lv_obj_t* statValue_[3] = {};
  lv_obj_t* statLabel_[3] = {};
  lv_obj_t* now_ = nullptr;
  lv_obj_t* footer_ = nullptr;

  lv_obj_t* asks_ = nullptr;
  lv_obj_t* reqTitle_ = nullptr;
  lv_obj_t* preview_ = nullptr;
  lv_obj_t* buttons_ = nullptr;
  lv_obj_t* deny_ = nullptr;
  lv_obj_t* denyText_ = nullptr;
  lv_obj_t* allow_ = nullptr;
  lv_obj_t* allowText_ = nullptr;
  lv_obj_t* onlyMac_ = nullptr;
  lv_obj_t* queue_ = nullptr;

  lv_obj_t* toast_ = nullptr;
  lv_obj_t* toastText_ = nullptr;
};

}  // namespace painel::round
