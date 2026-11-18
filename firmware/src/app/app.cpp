#include "app/app.h"

#include <algorithm>

#include "app/format.h"
#include "app/platform.h"
#include "ui/theme.h"

namespace painel {
namespace {

using namespace ui;

constexpr int kTopbarHeight = 46;
constexpr int64_t kFadeStepMs = 20;
constexpr int kFadeUpPerStep = 8;    // ~250 ms até o cheio
constexpr int kFadeDownPerStep = 1;  // ~2 s até o baixo
constexpr int64_t kNeverConnectedGraceMs = 8000;

App* gTouchOwner = nullptr;  // só há um App; o callback do LVGL não carrega ponteiro próprio

void blinkDot(void* obj, int32_t v) { lv_obj_set_style_opa(static_cast<lv_obj_t*>(obj), v < 50 ? LV_OPA_COVER : LV_OPA_20, 0); }

}  // namespace

App::App(Client& client, AppOptions options) : client_(client), opt_(options) {}

int64_t App::serverNow() const {
  if (!snapshot_) return 0;
  return snapshot_->now + (platform::monoMs() - snapshotMono_);
}

void App::build(lv_obj_t* screen) {
  startedMono_ = platform::monoMs();
  lastActive_ = startedMono_;
  lv_obj_set_style_bg_color(screen, hex(color::kBg), 0);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);
  lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);

  // Barra do topo: contadores (ou o aviso de Mac sem resposta), ponto de conexão e relógio.
  lv_obj_t* bar = box(screen);
  lv_obj_set_size(bar, LV_HOR_RES, kTopbarHeight);
  lv_obj_set_style_border_side(bar, LV_BORDER_SIDE_BOTTOM, 0);
  lv_obj_set_style_border_width(bar, 1, 0);
  lv_obj_set_style_border_color(bar, hex(color::kLine), 0);

  counters_ = box(bar);
  lv_obj_set_size(counters_, 370, kTopbarHeight);
  lv_obj_set_pos(counters_, 10, 0);
  lv_obj_set_flex_flow(counters_, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(counters_, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(counters_, 12, 0);
  const uint32_t colors[4] = {color::kWaiting, color::kUnseen, color::kWorking, color::kIdle};
  const char* words[4] = {"esperando", "para ver", "rodando", "paradas"};
  for (int i = 0; i < 4; ++i) {
    lv_obj_t* item = box(counters_);
    lv_obj_set_size(item, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(item, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(item, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_END);
    lv_obj_set_style_pad_column(item, 4, 0);
    countLabels_[i] = label(item, &font_disp_24, colors[i], "0");
    countWords_[i] = label(item, &font_mono_12, color::kInkDim, words[i]);
    lv_obj_set_style_pad_bottom(countWords_[i], 3, 0);
    lv_obj_set_user_data(countLabels_[i], reinterpret_cast<void*>(static_cast<uintptr_t>(colors[i])));
  }

  offlineText_ = label(bar, &font_mono_12, color::kInk);
  lv_obj_set_size(offlineText_, 360, lv_font_get_line_height(&font_mono_12));
  lv_label_set_long_mode(offlineText_, LV_LABEL_LONG_MODE_DOTS);
  lv_obj_align(offlineText_, LV_ALIGN_LEFT_MID, 12, 0);
  lv_obj_add_flag(offlineText_, LV_OBJ_FLAG_HIDDEN);

  clock_ = label(bar, &font_mono_16, color::kInk, "--:--");
  lv_obj_align(clock_, LV_ALIGN_RIGHT_MID, -12, 0);
  linkDot_ = box(bar);
  lv_obj_set_size(linkDot_, 10, 10);
  lv_obj_set_style_radius(linkDot_, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(linkDot_, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(linkDot_, hex(color::kInkFaint), 0);
  lv_obj_align(linkDot_, LV_ALIGN_RIGHT_MID, -72, 0);

  grid_.create(screen, kTopbarHeight, LV_VER_RES - kTopbarHeight,
               [this](const Session& s) { detail_->open(s); });

  detail_ = std::make_unique<DetailView>(client_, [this] { return serverNow(); });
  detail_->create(screen);

  // Tela de estado: Wi-Fi, Mac sem resposta, token recusado.
  statusScreen_ = box(screen);
  lv_obj_set_size(statusScreen_, LV_HOR_RES, LV_VER_RES);
  lv_obj_set_style_bg_color(statusScreen_, hex(color::kBg), 0);
  lv_obj_set_style_bg_opa(statusScreen_, LV_OPA_COVER, 0);
  lv_obj_add_flag(statusScreen_, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_flex_flow(statusScreen_, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(statusScreen_, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_row(statusScreen_, 14, 0);
  lv_obj_set_style_pad_hor(statusScreen_, 30, 0);
  statusBot_.create(statusScreen_, 8);
  statusTitle_ = label(statusScreen_, &font_disp_24, color::kInk);
  lv_obj_set_style_text_align(statusTitle_, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_width(statusTitle_, lv_pct(100));
  lv_label_set_long_mode(statusTitle_, LV_LABEL_LONG_MODE_WRAP);
  statusText_ = label(statusScreen_, &font_mono_14, color::kInkDim);
  lv_obj_set_style_text_align(statusText_, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_width(statusText_, lv_pct(100));
  lv_label_set_long_mode(statusText_, LV_LABEL_LONG_MODE_WRAP);
  statusHint_ = label(statusScreen_, &font_mono_12, color::kInkFaint);
  lv_obj_set_style_text_align(statusHint_, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_width(statusHint_, lv_pct(100));
  lv_label_set_long_mode(statusHint_, LV_LABEL_LONG_MODE_WRAP);

  renderTopbar();
  renderStatusScreen();
  updateBacklight();
}

void App::setNetworkNote(const std::string& note) {
  if (note == networkNote_) return;
  networkNote_ = note;
  renderStatusScreen();
  renderTopbar();
}

void App::loop() {
  ClientEvent ev;
  while (client_.poll(ev)) handle(ev);
  const int64_t now = platform::monoMs();
  if (now - lastSecond_ >= 1000) {
    lastSecond_ = now;
    tickSecond();
  }
  updateBacklight();
}

void App::handle(ClientEvent& ev) {
  switch (ev.type) {
    case ClientEvent::Type::Snapshot:
      applySnapshot(std::move(ev.snapshot));
      break;
    case ClientEvent::Type::Link: {
      const bool wasOnline = link_ == Link::Online;
      link_ = ev.link;
      linkMessage_ = ev.message;
      retryAt_ = ev.retryAt;
      if (link_ == Link::Online) offlineSince_ = 0;
      else if (wasOnline || offlineSince_ == 0) offlineSince_ = platform::monoMs();
      renderTopbar();
      renderStatusScreen();
      break;
    }
    case ClientEvent::Type::Detail:
      detail_->onDetail(ev);
      break;
    case ClientEvent::Type::Decision:
      detail_->onDecision(ev);
      break;
    case ClientEvent::Type::Seen:
      if (ev.status != 200) platform::log("[api] seen falhou: %d %s", ev.status, ev.message.c_str());
      break;
  }
}

void App::applySnapshot(std::shared_ptr<Snapshot> snap) {
  if (!snap) return;
  snapshot_ = std::move(snap);
  snapshotMono_ = platform::monoMs();
  if (link_ != Link::Online) {
    link_ = Link::Online;
    offlineSince_ = 0;
    renderStatusScreen();
  }
  grid_.update(snapshot_->sessions, serverNow());
  detail_->onSnapshot(*snapshot_);
  renderTopbar();
}

void App::tickSecond() {
  grid_.tick(serverNow());
  detail_->tick();
  renderTopbar();
  renderStatusScreen();
}

void App::renderTopbar() {
  const bool online = link_ == Link::Online;
  if (snapshot_) {
    int counts[4] = {0, 0, 0, 0};
    for (const Session& s : snapshot_->sessions) {
      if (s.status == "waiting") ++counts[0];
      else if (s.status == "idle" && s.unseen) ++counts[1];
      else if (s.status == "working") ++counts[2];
      else if (s.status == "idle") ++counts[3];
    }
    for (int i = 0; i < 4; ++i) {
      lv_label_set_text_fmt(countLabels_[i], "%d", counts[i]);
      const auto c = static_cast<uint32_t>(reinterpret_cast<uintptr_t>(lv_obj_get_user_data(countLabels_[i])));
      lv_obj_set_style_text_color(countLabels_[i], hex(counts[i] ? c : color::kInkFaint), 0);
    }
  }

  if (online) {
    lv_obj_remove_flag(counters_, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(offlineText_, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(counters_, LV_OBJ_FLAG_HIDDEN);
    lv_obj_remove_flag(offlineText_, LV_OBJ_FLAG_HIDDEN);
    std::string text;
    const int64_t contact = client_.lastContactMs();
    if (link_ == Link::Unauthorized) text = "Token recusado pelo Mac";
    else if (!networkNote_.empty()) text = networkNote_;
    else if (contact > 0) text = "Mac sem resposta há " + elapsed(contact, platform::monoMs()) + " · tentando de novo";
    else text = "Conectando ao Mac…";
    lv_label_set_text(offlineText_, text.c_str());
    lv_obj_set_style_text_color(offlineText_, hex(link_ == Link::Connecting && contact == 0 ? color::kInkDim : color::kWaiting), 0);
  }

  const int mode = online ? 0 : link_ == Link::Connecting ? 1 : 2;
  if (mode != dotMode_) updateDot(mode);
  lv_label_set_text(clock_, clockText(serverNow(), opt_.tzOffsetMin).c_str());
}

void App::updateDot(int mode) {
  dotMode_ = mode;
  const bool online = mode == 0;
  const uint32_t dot = online ? color::kIdle : mode == 1 ? color::kInkFaint : color::kWaiting;
  lv_obj_set_style_bg_color(linkDot_, hex(dot), 0);
  lv_anim_delete(linkDot_, blinkDot);
  lv_obj_set_style_opa(linkDot_, LV_OPA_COVER, 0);
  if (mode == 2) {
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, linkDot_);
    lv_anim_set_exec_cb(&a, blinkDot);
    lv_anim_set_values(&a, 0, 100);
    lv_anim_set_duration(&a, 1000);
    lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
    lv_anim_start(&a);
  }
  lv_obj_set_style_shadow_width(linkDot_, online ? 10 : 0, 0);
  lv_obj_set_style_shadow_color(linkDot_, hex(color::kIdle), 0);
}

void App::renderStatusScreen() {
  const int64_t now = platform::monoMs();
  const auto& ep = client_.endpoint();
  const std::string where = ep.host + ":" + std::to_string(ep.port);
  std::string title;
  std::string text;
  std::string hint;
  uint32_t botColor = color::kInkDim;

  if (link_ == Link::Unauthorized) {
    title = "Token recusado pelo Mac";
    text = "O servidor em " + where + " não aceitou o token gravado na placa.";
    hint = "Confira PAINEL_TOKEN em include/secrets.h (o campo token de ~/.config/painel-claude/config.json) e grave de novo.";
    botColor = color::kWaiting;
  } else if (link_ != Link::Online && !networkNote_.empty() && now - startedMono_ > kNeverConnectedGraceMs) {
    title = networkNote_;
    text = "Sem Wi-Fi não dá para falar com o Mac.";
    hint = "Confira PAINEL_WIFI_SSID e a senha em include/secrets.h (rede de 2,4 GHz).";
    botColor = color::kWorking;
  } else if (link_ != Link::Online) {
    const int64_t contact = client_.lastContactMs();
    const bool neverConnected = contact == 0 && now - startedMono_ > kNeverConnectedGraceMs;
    const bool longOffline = offlineSince_ > 0 && now - offlineSince_ > opt_.offlineScreenAfterMs;
    if (neverConnected || longOffline) {
      title = contact ? "Mac sem resposta há " + elapsed(contact, now) : "Mac sem resposta";
      text = linkMessage_.empty() ? where
             : linkMessage_.find(where) != std::string::npos ? linkMessage_
                                                             : linkMessage_ + "\n" + where;
      const int64_t wait = retryAt_ - now;
      hint = wait > 1000 ? "tentando de novo em " + std::to_string((wait + 999) / 1000) + " s" : "tentando de novo…";
      botColor = color::kWaiting;
    }
  }

  if (title.empty()) {
    lv_obj_add_flag(statusScreen_, LV_OBJ_FLAG_HIDDEN);
    return;
  }
  statusBot_.draw({"painel-bancada", "mac", "", botColor, color::kBg, color::kInkDim});
  lv_label_set_text(statusTitle_, title.c_str());
  lv_label_set_text(statusText_, text.c_str());
  lv_label_set_text(statusHint_, hint.c_str());
  lv_obj_remove_flag(statusScreen_, LV_OBJ_FLAG_HIDDEN);
  lv_obj_move_foreground(statusScreen_);
}

bool App::shouldStayBright() const {
  const int64_t now = platform::monoMs();
  if (now - lastTouch_ < opt_.touchAwakeMs && lastTouch_ > 0) return true;
  if (!snapshot_ || link_ != Link::Online) return false;
  return std::any_of(snapshot_->sessions.begin(), snapshot_->sessions.end(), [](const Session& s) {
    return s.status == "waiting" || (s.status == "working" && !s.stale);
  });
}

void App::updateBacklight() {
  const int64_t now = platform::monoMs();
  if (shouldStayBright()) lastActive_ = now;
  const uint8_t target = now - lastActive_ < opt_.dimAfterMs ? opt_.brightFull : opt_.brightLow;
  if (brightness_ == target || now - lastFade_ < kFadeStepMs) return;
  lastFade_ = now;
  int next = brightness_;
  if (target > brightness_) next = std::min<int>(target, brightness_ + kFadeUpPerStep);
  else next = std::max<int>(target, brightness_ - kFadeDownPerStep);
  brightness_ = static_cast<uint8_t>(next);
  platform::setBacklight(brightness_);
}

void App::wrapTouch(lv_indev_t* indev) {
  gTouchOwner = this;
  touches_.push_back({indev, lv_indev_get_read_cb(indev)});
  lv_indev_set_read_cb(indev, readTouch);
}

void App::readTouch(lv_indev_t* indev, lv_indev_data_t* data) {
  App* self = gTouchOwner;
  for (const WrappedTouch& t : self->touches_) {
    if (t.indev == indev) t.original(indev, data);
  }
  const bool pressed = data->state == LV_INDEV_STATE_PRESSED;
  if (pressed) {
    const bool dim = self->brightness_ < (self->opt_.brightFull + self->opt_.brightLow) / 2;
    if (dim && !self->swallowing_) self->swallowing_ = true;  // tela escura: este toque só acende
    self->lastTouch_ = platform::monoMs();
    self->lastActive_ = self->lastTouch_;
  } else {
    self->swallowing_ = false;
  }
  if (self->swallowing_) data->state = LV_INDEV_STATE_RELEASED;
}

}  // namespace painel
