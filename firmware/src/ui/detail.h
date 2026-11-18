// Detalhe de uma sessão (tela cheia): resumo, números e o cartão de pedido — permissão
// (Permitir/Negar), plano (Aprovar plano/Recusar) ou pergunta (opções e texto). Porte de public/detail.js.
#pragma once

#include <lvgl.h>

#include <deque>
#include <functional>
#include <memory>
#include <string>

#include "app/client.h"
#include "app/model.h"
#include "ui/bot_view.h"

namespace painel::ui {

class DetailView {
 public:
  DetailView(Client& client, std::function<int64_t()> serverNow)
      : client_(client), serverNow_(std::move(serverNow)) {}

  void create(lv_obj_t* parent);
  void open(const Session& session);
  void close();
  bool isOpen() const { return !openId_.empty(); }

  void onDetail(const ClientEvent& ev);
  void onDecision(const ClientEvent& ev);
  void onSnapshot(const Snapshot& snapshot);
  void tick();

 private:
  struct OptionRef {
    DetailView* self;
    std::string question;
    std::string label;
    bool multi;
    lv_obj_t* button;
  };
  struct TextRef {
    DetailView* self;
    std::string question;
    bool number;
  };

  void fillHeader(const Session& s);
  void rebuildBody();
  void buildStats(lv_obj_t* parent);
  void buildRequest(lv_obj_t* parent, const Request& request);
  void buildQuestion(lv_obj_t* parent, const Question& q);
  void buildSection(lv_obj_t* parent, const char* title, const std::string& text, uint32_t textColor,
                    const lv_font_t* font);
  void buildTools(lv_obj_t* parent);
  void paintOptions();
  void syncButtons();
  void decide(bool allow);
  void showKeyboard(lv_obj_t* textarea, bool number);
  void hideKeyboard();
  std::string statusText() const;

  static void onClose(lv_event_t* e);
  static void onAllow(lv_event_t* e);
  static void onDeny(lv_event_t* e);
  static void onOption(lv_event_t* e);
  static void onTextFocus(lv_event_t* e);
  static void onTextChanged(lv_event_t* e);
  static void onKeyboardDone(lv_event_t* e);
  static void onRefreshTimer(lv_timer_t* t);

  Client& client_;
  std::function<int64_t()> serverNow_;

  lv_obj_t* root_ = nullptr;
  lv_obj_t* name_ = nullptr;
  lv_obj_t* meta_ = nullptr;
  lv_obj_t* body_ = nullptr;
  lv_obj_t* status_ = nullptr;
  lv_obj_t* openedFor_ = nullptr;
  lv_obj_t* allow_ = nullptr;
  lv_obj_t* deny_ = nullptr;
  lv_obj_t* feedback_ = nullptr;
  lv_obj_t* keyboard_ = nullptr;
  BotView bot_;

  std::string openId_;
  Session session_;
  std::shared_ptr<Detail> detail_;
  std::string loadError_;
  bool hasRequest_ = false;
  Request request_;
  Picks picks_;
  bool deciding_ = false;
  bool requestClosed_ = false;
  std::deque<OptionRef> options_;
  std::deque<TextRef> texts_;
};

}  // namespace painel::ui
