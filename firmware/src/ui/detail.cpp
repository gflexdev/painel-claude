#include "ui/detail.h"

#include <algorithm>

#include "app/format.h"
#include "ui/theme.h"

namespace painel::ui {
namespace {

constexpr int kHeaderHeight = 74;
constexpr int kKeyboardHeight = 210;
constexpr uint32_t kRefreshAfterDecisionMs = 1500;

struct Copy {
  const char* title;
  const char* allow;
  const char* deny;
  const char* done;
};

const Copy& copyFor(const std::string& kind) {
  static const Copy permission{"Pedido de permissão", "Permitir", "Negar", "Permitido. O Claude segue."};
  static const Copy plan{"Plano para aprovar", "Aprovar plano", "Recusar", "Plano aprovado."};
  static const Copy question{"Pergunta do Claude", "Enviar resposta", "Dispensar", "Resposta enviada."};
  if (kind == "plan") return plan;
  if (kind == "question") return question;
  return permission;
}

lv_obj_t* column(lv_obj_t* parent, int gap) {
  lv_obj_t* col = box(parent);
  lv_obj_set_width(col, lv_pct(100));
  lv_obj_set_height(col, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(col, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(col, gap, 0);
  return col;
}

lv_obj_t* wrapLabel(lv_obj_t* parent, const lv_font_t* font, uint32_t textColor, const std::string& text) {
  lv_obj_t* l = label(parent, font, textColor, text);
  lv_obj_set_width(l, lv_pct(100));
  lv_label_set_long_mode(l, LV_LABEL_LONG_MODE_WRAP);
  return l;
}

lv_obj_t* actionButton(lv_obj_t* parent, const char* text, bool primary, uint32_t accent) {
  lv_obj_t* btn = box(parent);
  lv_obj_set_height(btn, 56);
  lv_obj_set_flex_grow(btn, primary ? 3 : 2);
  lv_obj_add_flag(btn, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_radius(btn, 12, 0);
  if (primary) {
    lv_obj_set_style_bg_color(btn, hex(color::kIdle), 0);
    lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, 0);
  } else {
    lv_obj_set_style_border_width(btn, 2, 0);
    lv_obj_set_style_border_color(btn, hex(accent), 0);
  }
  lv_obj_set_style_opa(btn, LV_OPA_40, LV_STATE_DISABLED);
  lv_obj_set_style_transform_scale(btn, 245, LV_STATE_PRESSED);
  lv_obj_t* l = label(btn, &font_disp_18, primary ? color::kAllowInk : accent, text);
  lv_obj_center(l);
  return btn;
}

void setEnabled(lv_obj_t* obj, bool enabled) {
  if (!obj) return;
  if (enabled) lv_obj_remove_state(obj, LV_STATE_DISABLED);
  else lv_obj_add_state(obj, LV_STATE_DISABLED);
}

}  // namespace

void DetailView::create(lv_obj_t* parent) {
  root_ = box(parent);
  lv_obj_set_size(root_, lv_pct(100), lv_pct(100));
  lv_obj_set_style_bg_color(root_, hex(color::kTile), 0);
  lv_obj_set_style_bg_opa(root_, LV_OPA_COVER, 0);
  lv_obj_add_flag(root_, LV_OBJ_FLAG_CLICKABLE);  // não deixa o toque passar para a grade
  lv_obj_add_flag(root_, LV_OBJ_FLAG_HIDDEN);

  lv_obj_t* header = box(root_);
  lv_obj_set_size(header, lv_pct(100), kHeaderHeight);
  lv_obj_set_style_border_side(header, LV_BORDER_SIDE_BOTTOM, 0);
  lv_obj_set_style_border_width(header, 1, 0);
  lv_obj_set_style_border_color(header, hex(color::kLine), 0);

  lv_obj_t* bot = bot_.create(header, 5);
  lv_obj_align(bot, LV_ALIGN_LEFT_MID, 14, 0);

  name_ = label(header, &font_disp_18, color::kInk);
  lv_obj_set_pos(name_, 92, 10);
  lv_obj_set_size(name_, 310, 2 * lv_font_get_line_height(&font_disp_18));
  lv_label_set_long_mode(name_, LV_LABEL_LONG_MODE_DOTS);
  meta_ = label(header, &font_mono_12, color::kInkFaint);
  lv_obj_set_pos(meta_, 92, 10 + 2 * lv_font_get_line_height(&font_disp_18) + 2);
  lv_obj_set_size(meta_, 310, lv_font_get_line_height(&font_mono_12));  // "…" só corta com altura fixa
  lv_label_set_long_mode(meta_, LV_LABEL_LONG_MODE_DOTS);

  lv_obj_t* closeBtn = box(header);
  lv_obj_set_size(closeBtn, 54, 54);
  lv_obj_align(closeBtn, LV_ALIGN_RIGHT_MID, -10, 0);
  lv_obj_add_flag(closeBtn, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_ext_click_area(closeBtn, 10);
  lv_obj_set_style_radius(closeBtn, 12, 0);
  lv_obj_set_style_border_width(closeBtn, 1, 0);
  lv_obj_set_style_border_color(closeBtn, hex(color::kLine), 0);
  lv_obj_set_style_bg_color(closeBtn, hex(color::kTileHi), 0);
  lv_obj_set_style_bg_opa(closeBtn, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(closeBtn, hex(color::kLine), LV_STATE_PRESSED);
  lv_obj_t* x = label(closeBtn, &lv_font_montserrat_20, color::kInk, LV_SYMBOL_CLOSE);
  lv_obj_center(x);
  lv_obj_add_event_cb(closeBtn, onClose, LV_EVENT_CLICKED, this);

  body_ = lv_obj_create(root_);
  lv_obj_remove_style_all(body_);
  lv_obj_set_pos(body_, 0, kHeaderHeight);
  lv_obj_set_size(body_, lv_pct(100), LV_VER_RES - kHeaderHeight);
  lv_obj_set_style_pad_hor(body_, 14, 0);
  lv_obj_set_style_pad_ver(body_, 12, 0);
  lv_obj_set_flex_flow(body_, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(body_, 12, 0);
  lv_obj_set_scroll_dir(body_, LV_DIR_VER);
  lv_obj_set_scrollbar_mode(body_, LV_SCROLLBAR_MODE_ACTIVE);
}

void DetailView::open(const Session& s) {
  const bool sameSession = openId_ == s.id;
  openId_ = s.id;
  session_ = s;
  if (!sameSession) {
    detail_.reset();
    loadError_.clear();
    hasRequest_ = false;
    picks_.clear();
    deciding_ = false;
    requestClosed_ = false;
  }
  fillHeader(s);
  rebuildBody();
  lv_obj_remove_flag(root_, LV_OBJ_FLAG_HIDDEN);
  lv_obj_move_foreground(root_);
  lv_obj_scroll_to_y(body_, 0, LV_ANIM_OFF);
  if (s.unseen) client_.postSeen(s.id);
  client_.requestDetail(s.id);
}

void DetailView::close() {
  hideKeyboard();
  openId_.clear();
  detail_.reset();
  lv_obj_add_flag(root_, LV_OBJ_FLAG_HIDDEN);
}

void DetailView::fillHeader(const Session& s) {
  const uint32_t c = statusColor(s);
  bot_.draw({s.id, s.project, accessoryOf(s), c, color::kTile,
             s.status == "idle" && s.unseen ? color::kUnseen : color::kInkDim});
  const std::string name = oneLine(s.name);
  lv_label_set_text(name_, name.c_str());
  // Nome curto ocupa uma linha e a linha de baixo sobe junto; longo usa duas e termina em "…".
  lv_point_t size;
  lv_text_get_size(&size, name.c_str(), &font_disp_18, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
  const int lines = size.x > lv_obj_get_width(name_) ? 2 : 1;
  const int lineH = lv_font_get_line_height(&font_disp_18);
  const int top = (kHeaderHeight - lines * lineH - lv_font_get_line_height(&font_mono_12) - 4) / 2;
  lv_obj_set_height(name_, lines * lineH);
  lv_obj_set_y(name_, top);
  lv_obj_set_y(meta_, top + lines * lineH + 4);
  std::string meta = s.origin;
  const std::string where = detail_ && !detail_->cwd.empty() ? detail_->cwd : s.project;
  if (!where.empty()) meta += meta.empty() ? where : " · " + where;
  lv_label_set_text(meta_, meta.c_str());
}

std::string DetailView::statusText() const {
  const Session& s = session_;
  std::string text = statusWord(s.status);
  if (s.status == "working" && !s.activity.empty()) text += std::string(" · ") + activityWord(s.activity);
  text += " há " + elapsed(s.since, serverNow_());
  if (!s.detail.empty()) text += " — " + oneLine(s.detail);
  return text;
}

void DetailView::rebuildBody() {
  hideKeyboard();
  lv_obj_clean(body_);
  options_.clear();
  texts_.clear();
  allow_ = deny_ = feedback_ = openedFor_ = nullptr;

  status_ = wrapLabel(body_, &font_mono_14, color::kInk, statusText());
  lv_obj_set_style_pad_all(status_, 10, 0);
  lv_obj_set_style_pad_left(status_, 14, 0);
  lv_obj_set_style_bg_color(status_, hex(color::kTileHi), 0);
  lv_obj_set_style_bg_opa(status_, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(status_, 8, 0);
  lv_obj_set_style_border_side(status_, LV_BORDER_SIDE_LEFT, 0);
  lv_obj_set_style_border_width(status_, 4, 0);
  lv_obj_set_style_border_color(status_, hex(statusColor(session_)), 0);

  buildStats(body_);
  if (hasRequest_) buildRequest(body_, request_);

  const std::string prompt = detail_ && !detail_->summaryPrompt.empty() ? detail_->summaryPrompt
                             : detail_ ? detail_->lastPrompt : "";
  buildSection(body_, "Último pedido", prompt.empty() ? "sem pedido registrado" : prompt,
               prompt.empty() ? color::kInkFaint : color::kInkDim, &font_mono_14);
  std::string answer;
  uint32_t answerColor = color::kInk;
  if (!loadError_.empty()) {
    answer = "não consegui ler o resumo (" + loadError_ + ")";
    answerColor = color::kWaiting;
  } else if (!detail_) {
    answer = "carregando…";
    answerColor = color::kInkFaint;
  } else if (detail_->answer.empty()) {
    answer = "ainda sem resposta em texto";
    answerColor = color::kInkFaint;
  } else {
    answer = detail_->answer;
  }
  buildSection(body_, "Última resposta", answer, answerColor, &font_mono_14);
  buildTools(body_);
}

void DetailView::buildStats(lv_obj_t* parent) {
  const Session& s = session_;
  lv_obj_t* row = box(parent);
  lv_obj_set_size(row, lv_pct(100), LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW_WRAP);
  lv_obj_set_style_pad_column(row, 22, 0);
  lv_obj_set_style_pad_row(row, 8, 0);
  auto stat = [row](const char* name, const std::string& value) -> lv_obj_t* {
    if (value.empty()) return nullptr;
    lv_obj_t* col = box(row);
    lv_obj_set_size(col, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(col, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(col, 2, 0);
    label(col, &font_mono_12, color::kInkFaint, upper(name));
    return label(col, &font_mono_16, color::kInk, value);
  };
  stat("modelo", s.model);
  stat("contexto", s.contextTokens >= 0 ? tokens(s.contextTokens) + " tokens" : "");
  stat("pedidos seus", s.turns >= 0 ? std::to_string(s.turns) : "");
  const int64_t started = detail_ ? detail_->startedAt : 0;
  openedFor_ = stat("aberta há", started > 0 ? elapsed(started, serverNow_()) : "");
}

void DetailView::buildRequest(lv_obj_t* parent, const Request& request) {
  const Copy& copy = copyFor(request.kind);
  const uint32_t accent = requestColor(request.kind);

  lv_obj_t* card = column(parent, 10);
  lv_obj_set_style_pad_all(card, 14, 0);
  lv_obj_set_style_radius(card, 14, 0);
  lv_obj_set_style_border_width(card, 1, 0);
  lv_obj_set_style_border_color(card, hex(accent), 0);
  lv_obj_set_style_bg_color(card, lv_color_mix(hex(accent), hex(color::kTile), 30), 0);
  lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0);

  label(card, &font_mono_12, accent, upper(copy.title));
  if (request.kind != "question" && !request.tool.empty()) wrapLabel(card, &font_disp_18, color::kInk, request.tool);
  if (!request.preview.empty()) {
    lv_obj_t* pre = lv_obj_create(card);
    lv_obj_remove_style_all(pre);
    lv_obj_set_width(pre, lv_pct(100));
    lv_obj_set_height(pre, LV_SIZE_CONTENT);
    lv_obj_set_style_max_height(pre, 150, 0);
    lv_obj_set_style_pad_all(pre, 10, 0);
    lv_obj_set_style_radius(pre, 8, 0);
    lv_obj_set_style_bg_color(pre, hex(color::kPreviewBg), 0);
    lv_obj_set_style_bg_opa(pre, LV_OPA_COVER, 0);
    lv_obj_set_scroll_dir(pre, LV_DIR_VER);
    wrapLabel(pre, &font_mono_12, color::kInk, request.preview);
  }
  for (const Question& q : request.questions) buildQuestion(card, q);

  lv_obj_t* actions = box(card);
  lv_obj_set_size(actions, lv_pct(100), LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(actions, LV_FLEX_FLOW_ROW);
  lv_obj_set_style_pad_column(actions, 10, 0);
  lv_obj_set_style_pad_top(actions, 4, 0);
  deny_ = actionButton(actions, copy.deny, false, color::kWaiting);
  allow_ = actionButton(actions, copy.allow, true, color::kIdle);
  lv_obj_add_event_cb(deny_, onDeny, LV_EVENT_CLICKED, this);
  lv_obj_add_event_cb(allow_, onAllow, LV_EVENT_CLICKED, this);

  feedback_ = wrapLabel(card, &font_mono_12, color::kInkDim,
                        "O diálogo também está aberto no Mac; vale quem responder primeiro.");
  paintOptions();
  syncButtons();
}

void DetailView::buildQuestion(lv_obj_t* parent, const Question& q) {
  lv_obj_t* box_ = column(parent, 8);
  if (!q.header.empty()) {
    lv_obj_t* chip = label(box_, &font_mono_12, color::kQuestion, upper(q.header));
    lv_obj_set_style_bg_color(chip, lv_color_mix(hex(color::kQuestion), hex(color::kTile), 50), 0);
    lv_obj_set_style_bg_opa(chip, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_hor(chip, 8, 0);
    lv_obj_set_style_pad_ver(chip, 3, 0);
    lv_obj_set_style_radius(chip, 6, 0);
  }
  wrapLabel(box_, &font_disp_18, color::kInk, q.question);

  if (q.kind != "choice") {
    lv_obj_t* ta = lv_textarea_create(box_);
    lv_obj_set_width(ta, lv_pct(100));
    lv_textarea_set_one_line(ta, true);
    lv_textarea_set_placeholder_text(ta, "sua resposta");
    lv_obj_set_style_text_font(ta, &font_mono_16, 0);
    lv_obj_set_style_bg_color(ta, hex(color::kTileHi), 0);
    lv_obj_set_style_border_color(ta, hex(color::kLine), 0);
    lv_obj_set_style_text_color(ta, hex(color::kInk), 0);
    if (q.kind == "number") lv_textarea_set_accepted_chars(ta, "0123456789.,-");
    auto it = picks_.find(q.question);
    if (it != picks_.end()) lv_textarea_set_text(ta, it->second.text.c_str());
    texts_.push_back({this, q.question, q.kind == "number"});
    lv_obj_add_event_cb(ta, onTextFocus, LV_EVENT_CLICKED, &texts_.back());
    lv_obj_add_event_cb(ta, onTextChanged, LV_EVENT_VALUE_CHANGED, &texts_.back());
    return;
  }
  if (q.multiSelect) label(box_, &font_mono_12, color::kInkFaint, "pode marcar mais de uma");
  for (const Option& opt : q.options) {
    lv_obj_t* btn = column(box_, 3);
    lv_obj_add_flag(btn, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_pad_hor(btn, 14, 0);
    lv_obj_set_style_pad_ver(btn, 11, 0);
    lv_obj_set_style_radius(btn, 12, 0);
    lv_obj_set_style_border_width(btn, 1, 0);
    lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, 0);
    lv_obj_set_style_min_height(btn, 52, 0);
    wrapLabel(btn, &font_disp_15, color::kInk, opt.label);
    if (!opt.description.empty()) wrapLabel(btn, &font_mono_12, color::kInkDim, opt.description);
    for (uint32_t i = 0; i < lv_obj_get_child_count(btn); ++i) lv_obj_add_flag(lv_obj_get_child(btn, i), LV_OBJ_FLAG_EVENT_BUBBLE);
    options_.push_back({this, q.question, opt.label, q.multiSelect, btn});
    lv_obj_add_event_cb(btn, onOption, LV_EVENT_CLICKED, &options_.back());
  }
}

void DetailView::buildSection(lv_obj_t* parent, const char* title, const std::string& text, uint32_t textColor,
                              const lv_font_t* font) {
  lv_obj_t* sec = column(parent, 6);
  lv_obj_set_style_pad_top(sec, 6, 0);
  label(sec, &font_mono_12, color::kInkFaint, upper(title));
  wrapLabel(sec, font, textColor, text);
}

void DetailView::buildTools(lv_obj_t* parent) {
  lv_obj_t* sec = column(parent, 6);
  lv_obj_set_style_pad_top(sec, 6, 0);
  label(sec, &font_mono_12, color::kInkFaint, upper("Ferramentas recentes"));
  lv_obj_t* chips = box(sec);
  lv_obj_set_size(chips, lv_pct(100), LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(chips, LV_FLEX_FLOW_ROW_WRAP);
  lv_obj_set_style_pad_column(chips, 6, 0);
  lv_obj_set_style_pad_row(chips, 6, 0);
  const bool none = !detail_ || detail_->recentTools.empty();
  if (none) {
    label(chips, &font_mono_12, color::kInkFaint, "nenhuma");
    return;
  }
  for (const std::string& t : detail_->recentTools) {
    lv_obj_t* chip = label(chips, &font_mono_12, color::kInkDim, t);
    lv_obj_set_style_bg_color(chip, hex(color::kTileHi), 0);
    lv_obj_set_style_bg_opa(chip, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_hor(chip, 9, 0);
    lv_obj_set_style_pad_ver(chip, 5, 0);
    lv_obj_set_style_radius(chip, 7, 0);
    lv_obj_set_style_max_width(chip, 440, 0);
    lv_obj_set_height(chip, lv_font_get_line_height(&font_mono_12) + 10);
    lv_label_set_long_mode(chip, LV_LABEL_LONG_MODE_DOTS);
  }
}

void DetailView::paintOptions() {
  for (const OptionRef& ref : options_) {
    auto it = picks_.find(ref.question);
    const bool on = it != picks_.end() &&
                    std::find(it->second.chosen.begin(), it->second.chosen.end(), ref.label) != it->second.chosen.end();
    lv_obj_set_style_border_color(ref.button, hex(on ? color::kQuestion : color::kLine), 0);
    lv_obj_set_style_border_width(ref.button, on ? 2 : 1, 0);
    lv_obj_set_style_bg_color(ref.button,
                              on ? lv_color_mix(hex(color::kQuestion), hex(color::kTileHi), 40) : hex(color::kTileHi), 0);
  }
}

void DetailView::syncButtons() {
  const bool blocked = deciding_ || requestClosed_;
  setEnabled(deny_, !blocked);
  setEnabled(allow_, !blocked && (request_.kind != "question" || allAnswered(request_, picks_)));
}

void DetailView::decide(bool allow) {
  if (!hasRequest_ || deciding_ || requestClosed_) return;
  if (allow && request_.kind == "question" && !allAnswered(request_, picks_)) return;
  deciding_ = true;
  hideKeyboard();
  syncButtons();
  if (feedback_) lv_label_set_text(feedback_, "enviando…");
  client_.postDecision(request_.id, allow, buildDecisionBody(allow, request_, picks_));
}

void DetailView::onDetail(const ClientEvent& ev) {
  if (ev.id != openId_) return;
  if (!ev.detail) {
    loadError_ = ev.message.empty() ? "HTTP " + std::to_string(ev.status) : ev.message;
    if (!deciding_) rebuildBody();
    return;
  }
  loadError_.clear();
  detail_ = ev.detail;
  session_ = detail_->session;
  const Request* first = detail_->requests.empty() ? nullptr : &detail_->requests.front();
  const std::string newId = first ? first->id : "";
  const bool sameRequest = hasRequest_ && first && request_.id == newId;
  const bool typing = keyboard_ && !lv_obj_has_flag(keyboard_, LV_OBJ_FLAG_HIDDEN);
  if (sameRequest && (deciding_ || typing)) {
    // Resposta atrasada do mesmo pedido: não reabilita os botões nem fecha o teclado no meio do uso.
    fillHeader(session_);
    return;
  }
  if (!sameRequest) {
    picks_.clear();
    requestClosed_ = false;
  }
  hasRequest_ = first != nullptr;
  if (first) request_ = *first;
  deciding_ = false;
  fillHeader(session_);
  rebuildBody();
}

void DetailView::onDecision(const ClientEvent& ev) {
  if (!hasRequest_ || ev.id != request_.id) return;
  if (ev.status == 200) {
    if (feedback_) lv_label_set_text(feedback_, ev.allow ? copyFor(request_.kind).done : "Recusado. O Claude foi avisado.");
    lv_timer_t* t = lv_timer_create(onRefreshTimer, kRefreshAfterDecisionMs, this);
    lv_timer_set_repeat_count(t, 1);
    return;
  }
  deciding_ = false;
  if (ev.status == 410) {
    requestClosed_ = true;
    if (feedback_) lv_label_set_text(feedback_, "Esse pedido já foi respondido no Mac.");
  } else if (feedback_) {
    lv_label_set_text_fmt(feedback_, "Não consegui enviar (%s). Tente de novo.", ev.message.c_str());
  }
  syncButtons();
}

void DetailView::onSnapshot(const Snapshot& snapshot) {
  if (openId_.empty()) return;
  auto it = std::find_if(snapshot.sessions.begin(), snapshot.sessions.end(),
                         [this](const Session& s) { return s.id == openId_; });
  if (it == snapshot.sessions.end()) return;
  session_ = *it;
  fillHeader(session_);
  if (status_) {
    lv_label_set_text(status_, statusText().c_str());
    lv_obj_set_style_border_color(status_, hex(statusColor(session_)), 0);
  }
  // Pedido novo chegou (ou foi respondido no Mac): busca o detalhe de novo.
  const std::string current = it->hasPermission ? it->permission.id : "";
  const std::string shown = hasRequest_ ? request_.id : "";
  if (!deciding_ && current != shown) client_.requestDetail(openId_);
}

void DetailView::tick() {
  if (openId_.empty()) return;
  if (status_) lv_label_set_text(status_, statusText().c_str());
  if (openedFor_ && detail_ && detail_->startedAt > 0) {
    lv_label_set_text(openedFor_, elapsed(detail_->startedAt, serverNow_()).c_str());
  }
}

void DetailView::showKeyboard(lv_obj_t* textarea, bool number) {
  if (!keyboard_) {
    keyboard_ = lv_keyboard_create(root_);
    lv_obj_set_size(keyboard_, lv_pct(100), kKeyboardHeight);
    lv_obj_align(keyboard_, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_add_event_cb(keyboard_, onKeyboardDone, LV_EVENT_READY, this);
    lv_obj_add_event_cb(keyboard_, onKeyboardDone, LV_EVENT_CANCEL, this);
  }
  lv_keyboard_set_mode(keyboard_, number ? LV_KEYBOARD_MODE_NUMBER : LV_KEYBOARD_MODE_TEXT_LOWER);
  lv_keyboard_set_textarea(keyboard_, textarea);
  lv_obj_remove_flag(keyboard_, LV_OBJ_FLAG_HIDDEN);
  lv_obj_set_height(body_, LV_VER_RES - kHeaderHeight - kKeyboardHeight);
  lv_obj_update_layout(body_);
  lv_obj_scroll_to_view_recursive(textarea, LV_ANIM_ON);
}

void DetailView::hideKeyboard() {
  if (!keyboard_) return;
  lv_keyboard_set_textarea(keyboard_, nullptr);
  lv_obj_add_flag(keyboard_, LV_OBJ_FLAG_HIDDEN);
  lv_obj_set_height(body_, LV_VER_RES - kHeaderHeight);
}

void DetailView::onClose(lv_event_t* e) { static_cast<DetailView*>(lv_event_get_user_data(e))->close(); }
void DetailView::onAllow(lv_event_t* e) { static_cast<DetailView*>(lv_event_get_user_data(e))->decide(true); }
void DetailView::onDeny(lv_event_t* e) { static_cast<DetailView*>(lv_event_get_user_data(e))->decide(false); }

void DetailView::onOption(lv_event_t* e) {
  auto* ref = static_cast<OptionRef*>(lv_event_get_user_data(e));
  DetailView* self = ref->self;
  if (self->deciding_ || self->requestClosed_) return;
  Pick next = self->picks_[ref->question];
  auto& chosen = next.chosen;
  auto found = std::find(chosen.begin(), chosen.end(), ref->label);
  if (!ref->multi) chosen = {ref->label};
  else if (found != chosen.end()) chosen.erase(found);
  else chosen.push_back(ref->label);
  Picks updated = self->picks_;
  updated[ref->question] = next;
  self->picks_ = std::move(updated);
  self->paintOptions();
  self->syncButtons();
}

void DetailView::onTextFocus(lv_event_t* e) {
  auto* ref = static_cast<TextRef*>(lv_event_get_user_data(e));
  ref->self->showKeyboard(lv_event_get_target_obj(e), ref->number);
}

void DetailView::onTextChanged(lv_event_t* e) {
  auto* ref = static_cast<TextRef*>(lv_event_get_user_data(e));
  Picks updated = ref->self->picks_;
  updated[ref->question].text = lv_textarea_get_text(lv_event_get_target_obj(e));
  ref->self->picks_ = std::move(updated);
  ref->self->syncButtons();
}

void DetailView::onKeyboardDone(lv_event_t* e) { static_cast<DetailView*>(lv_event_get_user_data(e))->hideKeyboard(); }

void DetailView::onRefreshTimer(lv_timer_t* t) {
  auto* self = static_cast<DetailView*>(lv_timer_get_user_data(t));
  self->deciding_ = false;
  if (!self->openId_.empty()) self->client_.requestDetail(self->openId_);
}

}  // namespace painel::ui
