#include "round/round_app.h"

#include <algorithm>
#include <cmath>

#include "app/link_screen.h"
#include "app/platform.h"
#include "round/look.h"

namespace painel::round {
namespace {

using namespace ui;

constexpr int kPagerY = 432;
constexpr int kLinkDots = 60;
constexpr double kPi = 3.14159265358979323846;

lv_obj_t* gTileObjs[3] = {};  // só há um mostrador

}  // namespace

RoundApp::RoundApp(Client& client, RoundOptions options)
    : client_(client), opt_(options), wake_(options.wake) {}

int64_t RoundApp::serverNow() const {
  if (!snapshot_) return 0;
  return snapshot_->now + (platform::monoMs() - snapshotMono_);
}

void RoundApp::build(lv_obj_t* screen) {
  startedMono_ = platform::monoMs();
  lv_obj_set_style_bg_color(screen, hex(tone::kBlack), 0);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);
  lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);

  tiles_ = lv_tileview_create(screen);
  lv_obj_set_size(tiles_, kSize, kSize);
  lv_obj_set_style_bg_opa(tiles_, LV_OPA_TRANSP, 0);
  lv_obj_set_scrollbar_mode(tiles_, LV_SCROLLBAR_MODE_OFF);
  for (int i = 0; i < 3; ++i) {
    gTileObjs[i] = lv_tileview_add_tile(tiles_, i, 0, LV_DIR_HOR);
    lv_obj_set_style_bg_opa(gTileObjs[i], LV_OPA_TRANSP, 0);
    lv_obj_set_scrollbar_mode(gTileObjs[i], LV_SCROLLBAR_MODE_OFF);
  }
  auto open = [this](const std::string& id) { openSession(id); };
  overview_.create(gTileObjs[0], open);
  list_.create(gTileObjs[1], open);
  usage_.create(gTileObjs[2]);
  lv_obj_add_event_cb(tiles_, onTileChanged, LV_EVENT_VALUE_CHANGED, this);

  lv_obj_t* pager = box(screen);
  lv_obj_remove_flag(pager, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_size(pager, LV_SIZE_CONTENT, 6);
  lv_obj_set_flex_flow(pager, LV_FLEX_FLOW_ROW);
  lv_obj_set_style_pad_column(pager, 8, 0);
  lv_obj_align(pager, LV_ALIGN_TOP_MID, 0, kPagerY);
  for (auto& dot : pager_) {
    dot = box(pager);
    lv_obj_remove_flag(dot, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(dot, 6, 6);
    lv_obj_set_style_radius(dot, 3, 0);
    lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
  }

  session_ = std::make_unique<SessionView>(client_, [this] { return serverNow(); });
  session_->create(screen);
  session_->onDecided([this](const std::string& decided) { openNextWaiting(decided); });

  // Tela de estado: o Clawd dormindo quando o Mac some (ou de olhos de X com token recusado).
  linkScreen_ = box(screen);
  lv_obj_set_size(linkScreen_, kSize, kSize);
  lv_obj_set_style_radius(linkScreen_, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(linkScreen_, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(linkScreen_, hex(tone::kBlack), 0);
  lv_obj_add_flag(linkScreen_, LV_OBJ_FLAG_CLICKABLE);
  for (int i = 0; i < kLinkDots; ++i) {
    const double a = 2 * kPi * i / kLinkDots;
    lv_obj_t* d = box(linkScreen_);
    lv_obj_remove_flag(d, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(d, 3, 3);
    lv_obj_set_style_radius(d, 2, 0);
    lv_obj_set_style_bg_opa(d, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(d, hex(0x2a2e38), 0);
    lv_obj_set_pos(d, kCenter + static_cast<int>(std::lround(221 * std::cos(a))) - 1,
                   kCenter + static_cast<int>(std::lround(221 * std::sin(a))) - 1);
  }
  lv_obj_t* lc = linkClawd_.create(linkScreen_, 6);
  lv_obj_set_pos(lc, kCenter - linkClawd_.bodyCenterX(), 54);
  linkTitle_ = centeredLabel(linkScreen_, &font_disp_24, color::kInk, 206, 330);
  lv_label_set_long_mode(linkTitle_, LV_LABEL_LONG_MODE_WRAP);
  linkText_ = centeredLabel(linkScreen_, &font_mono_12, color::kInkDim, 266, 320);
  lv_label_set_long_mode(linkText_, LV_LABEL_LONG_MODE_WRAP);
  linkHint_ = centeredLabel(linkScreen_, &font_mono_12, tone::kInkSoft, 330, 300);
  lv_label_set_long_mode(linkHint_, LV_LABEL_LONG_MODE_WRAP);

  renderPager();
  refresh();
  renderLinkScreen();
  wake_.update(false);
}

void RoundApp::setNetworkNote(const std::string& note) {
  if (note == networkNote_) return;
  networkNote_ = note;
  renderLinkScreen();
}

void RoundApp::loop() {
  ClientEvent ev;
  while (client_.poll(ev)) handle(ev);
  session_->loop();
  const int64_t now = platform::monoMs();
  if (now - lastSecond_ >= 1000) {
    lastSecond_ = now;
    refresh();
    session_->tick();
    renderLinkScreen();
  }
  goHomeWhenIdle(now);
  wake_.update(busy());
}

void RoundApp::goHomeWhenIdle(int64_t now) {
  if (answeredAt_ == 0) return;
  const int64_t lastActivity = std::max(answeredAt_, wake_.lastTouchMs());
  if (now - lastActivity < opt_.homeAfterAnswerMs) return;
  answeredAt_ = 0;
  // Um pedido que você abriu enquanto isso continua na tela; o resto volta para a Visão geral.
  if (session_->asksYou()) return;
  session_->close();
  lv_tileview_set_tile_by_index(tiles_, 0, 0, LV_ANIM_ON);
  renderPager();
}

void RoundApp::handle(ClientEvent& ev) {
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
      renderLinkScreen();
      break;
    }
    case ClientEvent::Type::Detail:
      session_->onDetail(ev);
      break;
    case ClientEvent::Type::Decision:
      session_->onDecision(ev);
      break;
    case ClientEvent::Type::Seen:
      if (ev.status != 200) platform::log("[api] seen falhou: %d %s", ev.status, ev.message.c_str());
      break;
  }
}

void RoundApp::applySnapshot(std::shared_ptr<Snapshot> snap) {
  if (!snap) return;
  snapshot_ = std::move(snap);
  snapshotMono_ = platform::monoMs();
  if (link_ != Link::Online) {
    link_ = Link::Online;
    offlineSince_ = 0;
    renderLinkScreen();
  }
  session_->onSnapshot(*snapshot_);
  // O pedido aberto foi respondido em algum lugar: daqui a pouco volta sozinho para a Visão geral.
  if (session_->answered() && answeredAt_ == 0) answeredAt_ = platform::monoMs();

  // Pedido novo: toca o som, acende a tela e abre a sessão sozinho (sem atropelar outro pedido que você está lendo).
  std::set<std::string> waiting;
  std::string fresh;
  for (const Session& s : snapshot_->sessions) {
    if (s.status != "waiting" || s.archived) continue;
    waiting.insert(s.id);
    if (!waitingIds_.count(s.id) && fresh.empty()) fresh = s.id;
  }
  waitingIds_ = std::move(waiting);
  const bool firstSnapshot = !seenFirstSnapshot_;
  seenFirstSnapshot_ = true;
  if (!fresh.empty()) {
    wake_.poke();
    if (!firstSnapshot) platform::playChime(Chime::Waiting);  // ao ligar, quem já esperava não toca de novo
    if (!session_->asksYou()) {
      answeredAt_ = 0;
      openSession(fresh);
    }
  }
  refresh();
}

void RoundApp::refresh() {
  Frame f;
  f.snap = snapshot_.get();
  f.now = serverNow();
  f.tzOffsetMin = opt_.tzOffsetMin;
  overview_.update(f);
  list_.update(f);
  usage_.update(f);
}

void RoundApp::openSession(const std::string& id) {
  if (!snapshot_) return;
  auto it = std::find_if(snapshot_->sessions.begin(), snapshot_->sessions.end(),
                         [&](const Session& s) { return s.id == id; });
  if (it != snapshot_->sessions.end()) session_->open(*it);
}

void RoundApp::openNextWaiting(const std::string& except) {
  if (snapshot_) {
    for (const Session& s : snapshot_->sessions) {
      if (s.hasPermission && !s.archived && s.id != except && s.permission.kind != "question") {
        answeredAt_ = 0;
        session_->open(s);
        return;
      }
    }
  }
  // Sem outro pedido: fica na sessão respondida (o Clawd volta a trabalhar) e depois vai para a Visão geral.
  if (answeredAt_ == 0) answeredAt_ = platform::monoMs();
}

void RoundApp::renderPager() {
  lv_obj_t* active = lv_tileview_get_tile_active(tiles_);
  for (int i = 0; i < 3; ++i) {
    const bool on = gTileObjs[i] == active;
    lv_obj_set_width(pager_[i], on ? 18 : 6);
    lv_obj_set_style_bg_color(pager_[i], hex(on ? color::kInk : tone::kDot), 0);
  }
}

void RoundApp::onTileChanged(lv_event_t* e) { static_cast<RoundApp*>(lv_event_get_user_data(e))->renderPager(); }

void RoundApp::renderLinkScreen() {
  const auto& ep = client_.endpoint();
  LinkState st;
  st.link = link_;
  st.linkMessage = linkMessage_;
  st.networkNote = networkNote_;
  st.where = ep.host + ":" + std::to_string(ep.port);
  st.now = platform::monoMs();
  st.startedAt = startedMono_;
  st.offlineSince = offlineSince_;
  st.lastContact = client_.lastContactMs();
  st.retryAt = retryAt_;
  st.offlineScreenAfterMs = opt_.offlineScreenAfterMs;
  const LinkScreen screen = describeLink(st);
  if (screen.tone == LinkScreen::Tone::None) {
    show(linkScreen_, false);
    return;
  }
  clawd::Look look;
  look.mood = link_ == Link::Unauthorized ? clawd::Mood::Error : clawd::Mood::Idle;
  look.ground = screen.tone == LinkScreen::Tone::Warn ? color::kWorking : color::kInkFaint;
  linkClawd_.setLook(look);
  setText(linkTitle_, screen.title);
  setText(linkText_, screen.text);
  setText(linkHint_, screen.hint);
  show(linkScreen_, true);
  lv_obj_move_foreground(linkScreen_);
}

bool RoundApp::busy() const {
  if (!snapshot_ || link_ != Link::Online) return false;
  return std::any_of(snapshot_->sessions.begin(), snapshot_->sessions.end(), [](const Session& s) {
    return s.status == "waiting" || (s.status == "working" && !s.stale);
  });
}

}  // namespace painel::round
