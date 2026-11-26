#include "round/session_view.h"

#include <algorithm>

#include "app/format.h"
#include "app/platform.h"
#include "round/look.h"

namespace painel::round {
namespace {

using namespace ui;

constexpr int64_t kToastMs = 1300;
constexpr int64_t kContextWindow = 200000;
constexpr int64_t kLongContextWindow = 1000000;  // modelos [1m]
constexpr int kClawdUnit = 5;

lv_obj_t* passive(lv_obj_t* parent) {
  lv_obj_t* b = box(parent);
  lv_obj_remove_flag(b, LV_OBJ_FLAG_CLICKABLE);
  return b;
}

lv_obj_t* wrapLabel(lv_obj_t* parent, const lv_font_t* font, uint32_t c, int x, int y, int w, int lines) {
  lv_obj_t* l = label(parent, font, c);
  lv_obj_set_pos(l, x, y);
  lv_obj_set_width(l, w);
  lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
  lv_label_set_long_mode(l, LV_LABEL_LONG_MODE_DOTS);
  const int lh = lv_font_get_line_height(font);
  lv_obj_set_height(l, lh * lines + 2 * (lines - 1));
  lv_obj_set_style_text_line_space(l, 2, 0);
  return l;
}

lv_obj_t* roundButton(lv_obj_t* parent, uint32_t bg, uint32_t border, lv_obj_t** text, uint32_t ink) {
  lv_obj_t* b = box(parent);
  lv_obj_set_size(b, 144, 56);
  lv_obj_set_style_radius(b, 28, 0);
  lv_obj_set_style_bg_opa(b, bg ? LV_OPA_COVER : LV_OPA_TRANSP, 0);
  lv_obj_set_style_bg_color(b, hex(bg), 0);
  lv_obj_set_style_border_width(b, border ? 2 : 0, 0);
  lv_obj_set_style_border_color(b, hex(border), 0);
  lv_obj_set_style_transform_scale(b, 245, LV_STATE_PRESSED);
  lv_obj_set_style_opa(b, LV_OPA_50, LV_STATE_DISABLED);
  *text = label(b, &font_disp_18, ink);
  lv_obj_center(*text);
  return b;
}

void edgeOpa(void* obj, int32_t v) { lv_obj_set_style_border_opa(static_cast<lv_obj_t*>(obj), static_cast<lv_opa_t>(v), 0); }

}  // namespace

void SessionView::create(lv_obj_t* screen) {
  root_ = box(screen);
  lv_obj_set_size(root_, kSize, kSize);
  lv_obj_set_style_radius(root_, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(root_, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(root_, hex(tone::kBlack), 0);
  lv_obj_add_flag(root_, LV_OBJ_FLAG_CLICKABLE);  // o toque não passa para o carrossel embaixo
  lv_obj_add_event_cb(root_, onGesture, LV_EVENT_GESTURE, this);

  ring_ = makeArc(root_, 456, 6, color::kWorking, true);
  lv_obj_set_style_arc_opa(ring_, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_arc_color(ring_, hex(tone::kTrack), LV_PART_MAIN);

  edge_ = passive(root_);
  lv_obj_set_size(edge_, kSize, kSize);
  lv_obj_set_style_radius(edge_, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_border_width(edge_, 6, 0);
  lv_obj_set_style_border_color(edge_, hex(color::kWaiting), 0);
  lv_obj_set_style_shadow_width(edge_, 0, 0);
  lv_obj_add_flag(edge_, LV_OBJ_FLAG_HIDDEN);

  lv_obj_t* back = box(root_);
  lv_obj_set_size(back, 64, 44);
  lv_obj_set_pos(back, kCenter - 32, 14);
  lv_obj_add_event_cb(back, onBack, LV_EVENT_CLICKED, this);
  lv_obj_t* arrow = label(back, &lv_font_montserrat_20, color::kInkDim, LV_SYMBOL_UP);
  lv_obj_center(arrow);

  chip_ = pill(root_, tone::kChip);
  lv_obj_remove_flag(chip_, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_align(chip_, LV_ALIGN_TOP_MID, 0, 54);
  chipDot_ = passive(chip_);
  lv_obj_set_size(chipDot_, 8, 8);
  lv_obj_set_style_radius(chipDot_, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(chipDot_, LV_OPA_COVER, 0);
  chipText_ = label(chip_, &font_mono_12, color::kInk);
  lv_obj_set_style_text_letter_space(chipText_, 1, 0);

  lv_obj_t* c = clawd_.create(root_, kClawdUnit);
  lv_obj_set_pos(c, kCenter - clawd_.bodyCenterX(), 72);

  name_ = wrapLabel(root_, &font_disp_24, color::kInk, kCenter - 160, 154, 320, 2);
  sub_ = wrapLabel(root_, &font_mono_12, color::kInkDim, kCenter - 150, 216, 300, 1);

  // Sessão sem pedido: números, o que está fazendo e o contexto.
  calm_ = passive(root_);
  lv_obj_set_size(calm_, kSize, kSize);
  lv_obj_t* stats = passive(calm_);
  lv_obj_set_size(stats, 310, LV_SIZE_CONTENT);
  lv_obj_set_pos(stats, kCenter - 155, 240);
  lv_obj_set_flex_flow(stats, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(stats, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  const char* words[3] = {"contexto", "pedidos", "aberta"};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t* cell = passive(stats);
    lv_obj_set_size(cell, 100, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(cell, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(cell, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    statValue_[i] = label(cell, &font_mono_16, color::kInk, "—");
    statLabel_[i] = label(cell, &font_mono_12, color::kInkDim, words[i]);
  }
  lv_obj_t* nowTitle = wrapLabel(calm_, &font_mono_12, color::kInkDim, kCenter - 100, 302, 200, 1);
  lv_obj_set_style_text_letter_space(nowTitle, 2, 0);
  lv_label_set_text(nowTitle, "AGORA");
  now_ = wrapLabel(calm_, &font_mono_14, 0xd6d4ce, kCenter - 150, 320, 300, 2);
  footer_ = wrapLabel(calm_, &font_mono_12, color::kInkDim, kCenter - 150, 392, 300, 1);

  // Sessão esperando você: o pedido e os botões.
  asks_ = passive(root_);
  lv_obj_set_size(asks_, kSize, kSize);
  lv_obj_t* card = passive(asks_);
  lv_obj_set_size(card, 340, LV_SIZE_CONTENT);
  lv_obj_set_pos(card, kCenter - 170, 238);
  lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(card, hex(tone::kBox), 0);
  lv_obj_set_style_border_width(card, 1, 0);
  lv_obj_set_style_border_color(card, hex(tone::kBoxLine), 0);
  lv_obj_set_style_radius(card, 14, 0);
  lv_obj_set_style_pad_hor(card, 14, 0);
  lv_obj_set_style_pad_ver(card, 10, 0);
  lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(card, 6, 0);
  reqTitle_ = label(card, &font_mono_12, color::kWaiting);
  lv_obj_set_style_text_letter_space(reqTitle_, 1, 0);
  preview_ = label(card, &font_mono_14, color::kInk);
  lv_obj_set_width(preview_, lv_pct(100));
  lv_obj_set_height(preview_, lv_font_get_line_height(&font_mono_14) * 2 + 2);
  lv_label_set_long_mode(preview_, LV_LABEL_LONG_MODE_DOTS);

  buttons_ = passive(asks_);
  lv_obj_set_size(buttons_, 300, 56);
  lv_obj_set_pos(buttons_, kCenter - 150, 336);
  lv_obj_set_flex_flow(buttons_, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(buttons_, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  deny_ = roundButton(buttons_, 0, 0x3a3e48, &denyText_, color::kInk);
  allow_ = roundButton(buttons_, color::kIdle, 0, &allowText_, color::kAllowInk);
  lv_obj_add_event_cb(deny_, onDeny, LV_EVENT_CLICKED, this);
  lv_obj_add_event_cb(allow_, onAllow, LV_EVENT_CLICKED, this);
  onlyMac_ = wrapLabel(asks_, &font_disp_15, tone::kInkSoft, kCenter - 140, 342, 280, 2);
  lv_obj_set_style_text_align(onlyMac_, LV_TEXT_ALIGN_CENTER, 0);
  queue_ = wrapLabel(asks_, &font_mono_12, color::kInkDim, kCenter - 140, 404, 280, 1);

  toast_ = pill(root_, color::kIdle);
  lv_obj_remove_flag(toast_, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_pad_hor(toast_, 24, 0);
  lv_obj_set_style_pad_ver(toast_, 14, 0);
  lv_obj_set_style_shadow_width(toast_, 40, 0);
  lv_obj_set_style_shadow_color(toast_, hex(tone::kBlack), 0);
  lv_obj_set_style_shadow_opa(toast_, LV_OPA_70, 0);
  toastText_ = label(toast_, &font_disp_18, color::kAllowInk);
  lv_obj_align(toast_, LV_ALIGN_CENTER, 0, -10);
  lv_obj_add_flag(toast_, LV_OBJ_FLAG_HIDDEN);

  lv_obj_add_flag(root_, LV_OBJ_FLAG_HIDDEN);
}

const Request* SessionView::request() const {
  if (!detail_) return nullptr;
  for (const Request& r : detail_->requests) {
    if (r.id != answeredId_) return &r;
  }
  return nullptr;
}

void SessionView::open(const Session& session) {
  const bool same = openId_ == session.id;
  openId_ = session.id;
  session_ = session;
  if (!same) {
    detail_.reset();
    busy_ = false;
    answeredId_.clear();
    answered_ = false;
    toastUntil_ = 0;
    show(toast_, false);
  }
  client_.requestDetail(session.id);
  if (session.status == "idle" && session.unseen) client_.postSeen(session.id);
  render();
  show(root_, true);
  lv_obj_move_foreground(root_);
}

void SessionView::close() {
  openId_.clear();
  detail_.reset();
  setEdge(false);
  show(root_, false);
}

void SessionView::onSnapshot(const Snapshot& snapshot) {
  waitingIndex_ = 0;
  waitingTotal_ = 0;
  for (const Session& s : snapshot.sessions) {
    if (s.status != "waiting") continue;
    ++waitingTotal_;
    if (s.id == openId_) waitingIndex_ = waitingTotal_;
  }
  if (!isOpen()) return;
  auto it = std::find_if(snapshot.sessions.begin(), snapshot.sessions.end(),
                         [this](const Session& s) { return s.id == openId_; });
  if (it == snapshot.sessions.end()) {
    close();
    return;
  }
  // O pedido sumiu sem sair de "esperando": foi respondido em algum lugar. Pedido novo volta a perguntar.
  const bool newRequest = it->hasPermission && it->permission.id != session_.permission.id;
  const bool wasWaiting = session_.status == "waiting";
  const bool isWaiting = it->status == "waiting";
  if ((session_.hasPermission && !it->hasPermission) || (wasWaiting && !isWaiting)) answered_ = true;
  if ((newRequest && it->permission.id != answeredId_) || (!wasWaiting && isWaiting)) answered_ = false;
  session_ = *it;
  if (wasWaiting != isWaiting || newRequest) client_.requestDetail(openId_);
  render();
}

void SessionView::onDetail(const ClientEvent& ev) {
  if (ev.id != openId_ || !ev.detail) return;
  if (ev.status != 200) {
    platform::log("[detalhe] %d %s", ev.status, ev.message.c_str());
    return;
  }
  detail_ = ev.detail;
  render();
}

void SessionView::decide(bool allow) {
  const Request* req = request();
  if (!req || busy_) return;
  busy_ = true;
  client_.postDecision(req->id, allow, buildDecisionBody(allow, *req, {}));
  render();
}

void SessionView::onDecision(const ClientEvent& ev) {
  busy_ = false;
  const Request* answered = request();
  const bool plan = answered && answered->kind == "plan";
  if ((ev.status == 200 || ev.status == 410) && answered) {
    answeredId_ = answered->id;
    answered_ = true;
  }
  if (ev.status == 200) {
    const std::string word = ev.allow ? (plan ? "Plano aprovado" : "Permitido") : (plan ? "Plano recusado" : "Negado");
    showToast(word, ev.allow ? color::kIdle : 0x2a2e38, ev.allow ? color::kAllowInk : color::kInk, true);
  } else if (ev.status == 410) {
    showToast("Já respondido no Mac", 0x2a2e38, color::kInk, true);
  } else {
    showToast(ev.message.empty() ? "Não deu para enviar" : ev.message, color::kWaiting, 0x1a0508, false);
  }
  render();
}

void SessionView::showToast(const std::string& text, uint32_t bg, uint32_t ink, bool thenNext) {
  lv_label_set_text(toastText_, text.c_str());
  lv_obj_set_style_bg_color(toast_, hex(bg), 0);
  lv_obj_set_style_text_color(toastText_, hex(ink), 0);
  show(toast_, true);
  lv_obj_move_foreground(toast_);
  toastUntil_ = platform::monoMs() + kToastMs;
  toastThenNext_ = thenNext;
}

void SessionView::loop() {
  if (toastUntil_ == 0 || platform::monoMs() < toastUntil_) return;
  toastUntil_ = 0;
  show(toast_, false);
  if (toastThenNext_ && onDecided_) onDecided_(openId_);
}

void SessionView::tick() {
  if (isOpen()) render();
}

void SessionView::setEdge(bool on) {
  if (on == edgeOn_) return;
  edgeOn_ = on;
  show(edge_, on);
  lv_anim_delete(edge_, edgeOpa);
  if (!on) return;
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, edge_);
  lv_anim_set_exec_cb(&a, edgeOpa);
  lv_anim_set_values(&a, 120, 255);
  lv_anim_set_duration(&a, 700);
  lv_anim_set_reverse_duration(&a, 700);
  lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_path_cb(&a, lv_anim_path_ease_in_out);
  lv_anim_start(&a);
}

void SessionView::render() {
  if (!isOpen()) return;
  Session shown = session_;
  if (answered_ && shown.status == "waiting") {
    shown.status = "working";  // respondido: o Claude segue (ou roda a ferramenta) até o próximo hook
    shown.hasPermission = false;
  }
  const Session& s = shown;
  const int64_t now = serverNow_();
  const uint32_t c = statusColor(s);
  const bool waiting = s.status == "waiting";
  const Request* req = request();

  clawd_.setLook(clawdLookOf(s, true));
  setEdge(waiting);

  lv_obj_set_style_bg_color(chip_, hex(tintColor(c)), 0);
  lv_obj_set_style_bg_color(chipDot_, hex(c), 0);
  lv_obj_set_style_text_color(chipText_, hex(softColor(c)), 0);
  setText(chipText_, tileWordUpper(s) + " · " + upper(elapsed(s.since, now)));
  setText(name_, s.name.empty() ? s.id.substr(0, 8) : oneLine(s.name));
  setText(sub_, s.model.empty() ? s.project : s.project + " · " + s.model);

  // Anel: quanto do contexto já foi usado (escondido enquanto o vermelho pulsa na borda).
  const int64_t window = s.contextTokens > kContextWindow ? kLongContextWindow : kContextWindow;
  const int pct = s.contextTokens > 0 ? static_cast<int>(std::min<int64_t>(100, s.contextTokens * 100 / window)) : 0;
  show(ring_, !waiting);
  lv_arc_set_angles(ring_, 0, pct * 360 / 100);
  lv_obj_set_style_arc_color(ring_, hex(c), LV_PART_INDICATOR);

  show(calm_, !waiting);
  show(asks_, waiting);
  if (!waiting) {
    setText(statValue_[0], s.contextTokens >= 0 ? tokens(s.contextTokens) : "—");
    lv_obj_set_style_text_color(statValue_[0], hex(c), 0);
    setText(statValue_[1], s.turns >= 0 ? std::to_string(s.turns) : "—");
    const int64_t started = detail_ && detail_->startedAt > 0 ? detail_->startedAt : 0;
    setText(statValue_[2], started ? elapsed(started, now) : "—");
    std::string doing;
    if (detail_ && s.status == "working" && !detail_->recentTools.empty()) doing = detail_->recentTools.back();
    else if (detail_ && detail_->hasSummary && !detail_->answer.empty()) doing = detail_->answer;
    else doing = tileWord(s);
    setText(now_, oneLine(doing));
    setText(footer_, s.contextTokens > 0 ? std::to_string(pct) + "% do contexto · deslize para baixo" : "deslize para baixo para voltar");
    return;
  }

  const std::string kind = req ? req->kind : s.permission.kind;
  std::string title = "PEDE PERMISSÃO";
  if (kind == "plan") title = "PLANO PARA APROVAR";
  else if (kind == "question") title = "PERGUNTA PARA VOCÊ";
  else if (req && !(req->toolName.empty() && req->tool.empty())) title += " · " + upper(req->toolName.empty() ? req->tool : req->toolName);
  setText(reqTitle_, title);
  lv_obj_set_style_text_color(reqTitle_, hex(kind == "question" ? color::kQuestion : softColor(c)), 0);
  std::string preview = "carregando o pedido…";
  if (req) {
    if (!req->preview.empty()) preview = req->preview;
    else if (!req->questions.empty()) preview = req->questions.front().question;
  }
  setText(preview_, oneLine(preview));

  const bool canDecide = req && kind != "question";
  show(buttons_, canDecide);
  show(onlyMac_, kind == "question");
  setText(onlyMac_, "Pergunta com opções: responda no Mac ou no celular");
  setText(denyText_, kind == "plan" ? "Recusar" : "Negar");
  setText(allowText_, kind == "plan" ? "Aprovar" : "Permitir");
  for (lv_obj_t* b : {deny_, allow_}) {
    if (busy_) lv_obj_add_state(b, LV_STATE_DISABLED);
    else lv_obj_remove_state(b, LV_STATE_DISABLED);
  }
  setText(queue_, waitingTotal_ > 1 && waitingIndex_ > 0
                      ? std::to_string(waitingIndex_) + " de " + std::to_string(waitingTotal_) + " esperando você"
                      : "deslize para baixo para voltar");
}

void SessionView::onBack(lv_event_t* e) { static_cast<SessionView*>(lv_event_get_user_data(e))->close(); }

void SessionView::onGesture(lv_event_t* e) {
  if (lv_indev_get_gesture_dir(lv_indev_active()) == LV_DIR_BOTTOM) {
    static_cast<SessionView*>(lv_event_get_user_data(e))->close();
  }
}

void SessionView::onAllow(lv_event_t* e) { static_cast<SessionView*>(lv_event_get_user_data(e))->decide(true); }
void SessionView::onDeny(lv_event_t* e) { static_cast<SessionView*>(lv_event_get_user_data(e))->decide(false); }

}  // namespace painel::round
