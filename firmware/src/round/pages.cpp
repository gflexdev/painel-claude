#include "round/pages.h"

#include <algorithm>
#include <cmath>

#include "app/format.h"
#include "round/look.h"

namespace painel::round {
namespace {

using namespace ui;

constexpr double kPi = 3.14159265358979323846;
constexpr int kOrbit = 129;        // raio da órbita dos Clawds
constexpr int kOrbitDots = 40;     // a órbita é tracejada, como no Mapa da web
constexpr int kOrb = 48;           // círculo de cada sessão (o contorno de 2 px fica por fora)
constexpr int kOrbMark = 8;        // raio da marca de vigiada no círculo da sessão
constexpr int kRowMark = 7;        // e na linha da lista
constexpr int kCore = 124;         // núcleo com o Clawd grande
constexpr int kLineFrom = kCore / 2 + 2;
constexpr int kLineTo = kOrbit - kOrb / 2 - 4;
constexpr int kUsageOuter = 430;
constexpr int kUsageInner = 378;
constexpr int kUsageWidth = 14;
constexpr int kUsageSweep = 270;
constexpr int kUsageRotation = 135;  // abre embaixo, como um mostrador
constexpr int kNearLimit = 90;
constexpr int64_t kFiveHoursMs = 5LL * 3600 * 1000;
constexpr int64_t kWeekMs = 7LL * 24 * 3600 * 1000;

/** Caixa sem clique: o toque passa para quem está embaixo (linha, página). */
lv_obj_t* passive(lv_obj_t* parent) {
  lv_obj_t* b = box(parent);
  lv_obj_remove_flag(b, LV_OBJ_FLAG_CLICKABLE);
  return b;
}

lv_obj_t* dot(lv_obj_t* parent, int size, uint32_t c) {
  lv_obj_t* d = passive(parent);
  lv_obj_set_size(d, size, size);
  lv_obj_set_style_radius(d, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(d, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(d, hex(c), 0);
  return d;
}

std::string percentText(int p) { return std::to_string(p) + "%"; }

uint32_t usageColor(int percent, uint32_t base) { return percent >= kNearLimit ? color::kWaiting : base; }

/** Quanto da janela já passou (0–1), ou -1 se não dá para saber. */
double elapsedFraction(const UsageWindow& w, int64_t now, int64_t windowMs) {
  if (!w.known || w.resetsAt <= now) return -1;
  const double left = static_cast<double>(w.resetsAt - now) / static_cast<double>(windowMs);
  return std::clamp(1.0 - left, 0.0, 1.0);
}

/** "nesse ritmo fecha em ~84%", como a barra de uso da web. */
std::string paceText(const UsageWindow& w, double fraction) {
  if (fraction < 0.08) return "começou agora";
  const int projected = static_cast<int>(std::lround(w.percent / fraction));
  if (projected > 100) return "nesse ritmo acaba antes de zerar";
  return "nesse ritmo fecha em ~" + std::to_string(projected) + "%";
}

std::string resetText(int64_t resetsAt, const Frame& f, bool week) {
  if (resetsAt <= 0) return "";
  if (resetsAt <= f.now) return "zera logo";
  const std::string when = week ? weekdayClock(resetsAt, f.tzOffsetMin) : clockText(resetsAt, f.tzOffsetMin);
  return "zera " + when + " · em " + elapsed(f.now, resetsAt);
}

void styleUsageArc(lv_obj_t* arc) {
  lv_obj_set_style_arc_opa(arc, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_arc_color(arc, hex(tone::kTrack), LV_PART_MAIN);
  lv_arc_set_rotation(arc, kUsageRotation);
  lv_arc_set_bg_angles(arc, 0, kUsageSweep);
  lv_arc_set_range(arc, 0, 100);
  lv_arc_set_value(arc, 0);
}

/** Tracinho branco do "ritmo": onde o uso deveria estar se fosse gasto por igual na janela. */
lv_obj_t* paceMarker(lv_obj_t* parent, int diameter) {
  lv_obj_t* m = makeArc(parent, diameter + 8, kUsageWidth + 8, color::kInk, false);
  lv_arc_set_rotation(m, kUsageRotation);
  lv_obj_add_flag(m, LV_OBJ_FLAG_HIDDEN);
  return m;
}

void placePace(lv_obj_t* marker, double fraction) {
  show(marker, fraction >= 0);
  if (fraction < 0) return;
  const int a = static_cast<int>(std::lround(fraction * kUsageSweep));
  lv_arc_set_angles(marker, std::max(0, a - 1), a + 1);
}

}  // namespace

// ---------------------------------------------------------------- Visão geral

void OverviewPage::create(lv_obj_t* tile, OpenSession open) {
  open_ = std::move(open);

  for (int i = 0; i < kOrbitDots; ++i) {
    const double a = 2 * kPi * i / kOrbitDots;
    lv_obj_t* d = dot(tile, 2, 0x262a33);
    lv_obj_set_pos(d, kCenter + static_cast<int>(std::lround(kOrbit * std::cos(a))) - 1,
                   kCenter + static_cast<int>(std::lround(kOrbit * std::sin(a))) - 1);
  }

  for (Orb& orb : orbs_) {
    orb.line = lv_line_create(tile);
    lv_obj_set_style_line_width(orb.line, 2, 0);
    lv_obj_set_style_line_rounded(orb.line, true, 0);
    lv_obj_add_flag(orb.line, LV_OBJ_FLAG_HIDDEN);
    lv_obj_remove_flag(orb.line, LV_OBJ_FLAG_CLICKABLE);
  }
  for (Orb& orb : orbs_) {
    orb.obj = box(tile);
    lv_obj_set_size(orb.obj, kOrb, kOrb);
    lv_obj_set_style_radius(orb.obj, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(orb.obj, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(orb.obj, hex(tone::kBox), 0);
    lv_obj_set_style_bg_color(orb.obj, hex(color::kTileHi), LV_STATE_PRESSED);
    lv_obj_set_style_border_width(orb.obj, 2, 0);
    lv_obj_set_style_outline_width(orb.obj, 4, 0);
    lv_obj_set_style_outline_pad(orb.obj, 0, 0);
    lv_obj_set_style_outline_opa(orb.obj, LV_OPA_TRANSP, 0);
    lv_obj_add_flag(orb.obj, LV_OBJ_FLAG_OVERFLOW_VISIBLE);
    lv_obj_set_user_data(orb.obj, &orb);
    lv_obj_add_event_cb(orb.obj, onOrb, LV_EVENT_CLICKED, this);
    // Clawd de 2 px por pixel: o meio do corpo cai no meio do círculo.
    lv_obj_t* c = orb.clawd.create(orb.obj, 2);
    lv_obj_set_pos(c, kOrb / 2 - 2 - orb.clawd.bodyCenterX(), -1);
    orb.badge = dot(orb.obj, 18, color::kWaiting);
    lv_obj_set_pos(orb.badge, kOrb - 14, -8);
    lv_obj_t* bang = label(orb.badge, &font_mono_12, 0x1a0508, "!");
    lv_obj_center(bang);
    lv_obj_add_flag(orb.badge, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(orb.obj, LV_OBJ_FLAG_HIDDEN);
  }
  // Vigiada: o ◉ embaixo à direita, do lado oposto ao "!" de quem espera você. Fica na página, por cima do
  // círculo, porque fora da caixa dele o LVGL não redesenha.
  for (Orb& orb : orbs_) {
    orb.mark = watchMark(tile, kOrbMark, tone::kBlack);
    lv_obj_add_flag(orb.mark, LV_OBJ_FLAG_HIDDEN);
  }

  core_ = box(tile);
  lv_obj_set_size(core_, kCore, kCore);
  lv_obj_set_pos(core_, kCenter - kCore / 2, kCenter - kCore / 2);
  lv_obj_set_style_radius(core_, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(core_, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(core_, hex(0x12141a), 0);
  lv_obj_set_style_outline_width(core_, 1, 0);
  lv_obj_set_style_outline_color(core_, hex(0x262a33), 0);
  lv_obj_set_style_shadow_width(core_, 34, 0);
  lv_obj_set_style_shadow_opa(core_, 70, 0);
  lv_obj_add_event_cb(core_, onCore, LV_EVENT_CLICKED, this);
  lv_obj_t* big = coreClawd_.create(core_, 4);
  lv_obj_set_pos(big, kCore / 2 - coreClawd_.bodyCenterX(), -12);
  count_ = label(core_, &font_disp_24, color::kInk, "—");
  lv_obj_align(count_, LV_ALIGN_TOP_MID, 0, 50);
  caption_ = label(core_, &font_mono_12, color::kInkDim, "em movimento");
  lv_obj_align(caption_, LV_ALIGN_TOP_MID, 0, 82);

  clock_ = centeredLabel(tile, &font_mono_16, tone::kInkSoft, 24, 160, "--:--");

  counters_ = passive(tile);
  lv_obj_set_size(counters_, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(counters_, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(counters_, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_END);
  lv_obj_set_style_pad_column(counters_, 12, 0);
  lv_obj_align(counters_, LV_ALIGN_TOP_MID, 0, 386);
  for (int i = 0; i < 4; ++i) {
    countItem_[i] = passive(counters_);
    lv_obj_set_size(countItem_[i], LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(countItem_[i], LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(countItem_[i], LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_END);
    lv_obj_set_style_pad_column(countItem_[i], 4, 0);
    countN_[i] = label(countItem_[i], &font_disp_18, color::kInk);
    countWord_[i] = label(countItem_[i], &font_mono_12, color::kInkDim);
    lv_obj_set_style_pad_bottom(countWord_[i], 2, 0);
  }
}

void OverviewPage::onOrb(lv_event_t* e) {
  auto* self = static_cast<OverviewPage*>(lv_event_get_user_data(e));
  auto* obj = static_cast<lv_obj_t*>(lv_event_get_current_target(e));
  const auto* orb = static_cast<const Orb*>(lv_obj_get_user_data(obj));
  if (orb && !orb->id.empty()) self->open_(orb->id);
}

void OverviewPage::onCore(lv_event_t* e) {
  static_cast<OverviewPage*>(lv_event_get_user_data(e))->coreClawd_.poke();
}

void OverviewPage::update(const Frame& f) {
  setText(clock_, clockText(f.now, f.tzOffsetMin));
  if (!f.snap) return;
  const auto moving = inMotionOf(*f.snap);
  const int n = std::min<int>(static_cast<int>(moving.size()), kMaxOrbs);

  for (int i = 0; i < kMaxOrbs; ++i) {
    Orb& orb = orbs_[i];
    if (i >= n) {
      show(orb.obj, false);
      show(orb.line, false);
      show(orb.mark, false);
      if (orb.pulsing) pulseOutline(orb.obj, color::kWaiting, false);
      orb.pulsing = false;
      orb.id.clear();
      continue;
    }
    const Session& s = *moving[i];
    const uint32_t c = statusColor(s);
    const double a = (-90.0 + 360.0 * i / n) * kPi / 180.0;
    const int cx = kCenter + static_cast<int>(std::lround(kOrbit * std::cos(a)));
    const int cy = kCenter + static_cast<int>(std::lround(kOrbit * std::sin(a)));
    lv_obj_set_pos(orb.obj, cx - kOrb / 2, cy - kOrb / 2);
    lv_obj_set_style_border_color(orb.obj, hex(c), 0);
    orb.points[0] = {static_cast<lv_value_precise_t>(kCenter + kLineFrom * std::cos(a)),
                     static_cast<lv_value_precise_t>(kCenter + kLineFrom * std::sin(a))};
    orb.points[1] = {static_cast<lv_value_precise_t>(kCenter + kLineTo * std::cos(a)),
                     static_cast<lv_value_precise_t>(kCenter + kLineTo * std::sin(a))};
    lv_line_set_points(orb.line, orb.points, 2);
    lv_obj_set_style_line_color(orb.line, hex(c), 0);
    const bool waiting = s.status == "waiting";
    lv_obj_set_style_line_opa(orb.line, waiting ? 190 : 115, 0);
    orb.clawd.setLook(clawdLookOf(s, false));
    show(orb.badge, waiting);
    lv_obj_set_pos(orb.mark, cx + kOrb / 2 - kOrbMark - 2, cy + kOrb / 2 - kOrbMark - 2);
    show(orb.mark, s.watched);
    if (waiting != orb.pulsing || c != orb.color) pulseOutline(orb.obj, color::kWaiting, waiting);
    orb.pulsing = waiting;
    orb.color = c;
    orb.id = s.id;
    show(orb.obj, true);
    show(orb.line, true);
  }

  const clawd::Look all = clawdLookOfAll(moving);
  coreClawd_.setLook(all);
  if (all.ground != coreGlow_) {
    coreGlow_ = all.ground;
    lv_obj_set_style_shadow_color(core_, hex(all.ground), 0);
  }
  setText(count_, std::to_string(moving.size()));
  setText(caption_, moving.empty() ? "tudo parado" : "em movimento");

  struct Count {
    const char* word;
    uint32_t color;
    int n;
  };
  Count counts[4] = {{"esperando", color::kWaiting, 0}, {"rodando", color::kWorking, 0},
                     {"ver", color::kUnseen, 0}, {"erro", color::kError, 0}};
  for (const Session* s : moving) {
    if (s->status == "waiting") ++counts[0].n;
    else if (s->status == "working") ++counts[1].n;
    else if (s->status == "idle") ++counts[2].n;
    else if (s->status == "error") ++counts[3].n;
  }
  for (int i = 0; i < 4; ++i) {
    show(countItem_[i], counts[i].n > 0);
    setText(countN_[i], std::to_string(counts[i].n));
    lv_obj_set_style_text_color(countN_[i], hex(counts[i].color), 0);
    setText(countWord_[i], counts[i].word);
  }
}

// ---------------------------------------------------------------- Sessões

void ListPage::create(lv_obj_t* tile, OpenSession open) {
  open_ = std::move(open);
  lv_obj_t* title = centeredLabel(tile, &font_mono_12, color::kInkDim, 36, 200, "SESSÕES");
  lv_obj_set_style_text_letter_space(title, 2, 0);
  subtitle_ = centeredLabel(tile, &font_mono_12, tone::kInkSoft, 54, 300);

  list_ = box(tile);
  lv_obj_remove_flag(list_, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_flag(list_, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_scroll_dir(list_, LV_DIR_VER);
  lv_obj_set_scrollbar_mode(list_, LV_SCROLLBAR_MODE_OFF);
  lv_obj_set_size(list_, 354, 330);
  lv_obj_set_pos(list_, kCenter - 177, 82);
  lv_obj_set_flex_flow(list_, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(list_, 6, 0);
  lv_obj_set_style_pad_ver(list_, 2, 0);
  lv_obj_set_style_pad_bottom(list_, 44, 0);  // a última linha sobe até onde o círculo é largo

  for (int i = 0; i < kMaxRows; ++i) {
    Row& r = rows_[i];
    r.obj = box(list_);
    lv_obj_set_size(r.obj, lv_pct(100), 54);
    lv_obj_set_style_radius(r.obj, 12, 0);
    lv_obj_set_style_bg_opa(r.obj, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(r.obj, hex(tone::kRow), 0);
    lv_obj_set_style_bg_color(r.obj, hex(color::kTileHi), LV_STATE_PRESSED);
    lv_obj_set_style_border_side(r.obj, LV_BORDER_SIDE_LEFT, 0);
    lv_obj_set_style_border_width(r.obj, 3, 0);
    lv_obj_set_style_outline_width(r.obj, 1, 0);
    lv_obj_set_style_outline_pad(r.obj, -1, 0);
    lv_obj_set_style_outline_opa(r.obj, LV_OPA_TRANSP, 0);
    lv_obj_set_style_pad_left(r.obj, 6, 0);
    lv_obj_set_style_pad_right(r.obj, 14, 0);
    lv_obj_set_flex_flow(r.obj, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(r.obj, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(r.obj, 10, 0);
    lv_obj_set_user_data(r.obj, reinterpret_cast<void*>(static_cast<intptr_t>(i)));
    lv_obj_add_event_cb(r.obj, onRow, LV_EVENT_CLICKED, this);

    lv_obj_t* holder = passive(r.obj);
    lv_obj_set_size(holder, 42, 30);
    lv_obj_add_flag(holder, LV_OBJ_FLAG_OVERFLOW_VISIBLE);
    lv_obj_t* c = r.clawd.create(holder, 2);
    lv_obj_set_pos(c, 0, -7);

    lv_obj_t* mid = passive(r.obj);
    lv_obj_set_height(mid, LV_SIZE_CONTENT);
    lv_obj_set_flex_grow(mid, 1);
    lv_obj_set_flex_flow(mid, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(mid, 2, 0);
    r.name = label(mid, &font_disp_15, color::kInk);
    r.word = label(mid, &font_mono_12, color::kInkDim);
    lv_obj_set_style_text_letter_space(r.word, 1, 0);
    lv_obj_set_height(r.name, lv_font_get_line_height(&font_disp_15));
    lv_obj_set_height(r.word, lv_font_get_line_height(&font_mono_12));
    for (lv_obj_t* l : {r.name, r.word}) {
      lv_obj_set_width(l, lv_pct(100));
      lv_label_set_long_mode(l, LV_LABEL_LONG_MODE_DOTS);
    }
    r.mark = watchMark(r.obj, kRowMark, tone::kRow);
    lv_obj_add_flag(r.mark, LV_OBJ_FLAG_HIDDEN);
    r.time = label(r.obj, &font_mono_12, color::kInkDim);
    lv_obj_add_flag(r.obj, LV_OBJ_FLAG_HIDDEN);
  }
  empty_ = centeredLabel(tile, &font_disp_18, color::kInkDim, 214, 300, "nenhuma sessão aberta");
}

void ListPage::onRow(lv_event_t* e) {
  auto* self = static_cast<ListPage*>(lv_event_get_user_data(e));
  auto* obj = static_cast<lv_obj_t*>(lv_event_get_current_target(e));
  const auto index = static_cast<size_t>(reinterpret_cast<intptr_t>(lv_obj_get_user_data(obj)));
  if (index < self->ids_.size()) self->open_(self->ids_[index]);
}

void ListPage::update(const Frame& f) {
  if (!f.snap) {
    setText(subtitle_, "conectando…");
    return;
  }
  const auto moving = inMotionOf(*f.snap);
  setText(subtitle_, std::to_string(moving.size()) + " em movimento · " + clockText(f.now, f.tzOffsetMin));

  // Em movimento primeiro (na ordem do servidor), depois as paradas.
  std::vector<const Session*> shownList(moving.begin(), moving.end());
  for (const Session& s : f.snap->sessions) {
    if (!s.archived && s.status != "ended" && !inMotion(s)) shownList.push_back(&s);
  }

  ids_.clear();
  int shown = 0;
  for (const Session* sp : shownList) {
    if (shown >= kMaxRows) break;
    const Session& s = *sp;
    Row& r = rows_[shown++];
    ids_.push_back(s.id);
    const uint32_t c = statusColor(s);
    const bool moves = inMotion(s);
    const bool waiting = s.status == "waiting";
    const uint32_t rowBg = waiting ? tintColor(c) : tone::kRow;
    lv_obj_set_style_bg_color(r.obj, hex(rowBg), 0);
    setWatchMarkBg(r.mark, rowBg);
    show(r.mark, s.watched);
    lv_obj_set_style_border_color(r.obj, hex(c), 0);
    if (waiting != r.pulsing) pulseOutline(r.obj, color::kWaiting, waiting);
    r.pulsing = waiting;
    r.clawd.setLook(clawdLookOf(s, true));
    setText(r.name, s.name.empty() ? s.id.substr(0, 8) : oneLine(s.name));
    setText(r.word, tileWordUpper(s));
    lv_obj_set_style_text_color(r.word, hex(moves ? softColor(c) : color::kInkDim), 0);
    lv_obj_set_style_text_color(r.name, hex(moves ? color::kInk : color::kInkDim), 0);
    setText(r.time, elapsed(s.since, f.now));
    show(r.obj, true);
  }
  for (int i = shown; i < kMaxRows; ++i) {
    if (rows_[i].pulsing) pulseOutline(rows_[i].obj, color::kWaiting, false);
    rows_[i].pulsing = false;
    show(rows_[i].obj, false);
  }
  show(empty_, shown == 0);
}

// ---------------------------------------------------------------- Uso do plano

void UsagePage::create(lv_obj_t* tile) {
  outer_ = makeArc(tile, kUsageOuter, kUsageWidth, color::kWorking, true);
  inner_ = makeArc(tile, kUsageInner, kUsageWidth, color::kUnseen, true);
  styleUsageArc(outer_);
  styleUsageArc(inner_);
  outerPace_ = paceMarker(tile, kUsageOuter);
  innerPace_ = paceMarker(tile, kUsageInner);

  label_ = centeredLabel(tile, &font_mono_12, color::kInkDim, 78, 220, "5 H");
  lv_obj_set_style_text_letter_space(label_, 2, 0);

  lv_obj_t* bigRow = passive(tile);
  lv_obj_set_size(bigRow, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(bigRow, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(bigRow, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_END);
  lv_obj_set_style_pad_column(bigRow, 2, 0);
  lv_obj_align(bigRow, LV_ALIGN_TOP_MID, 0, 102);
  big_ = label(bigRow, &font_num_96, color::kWorking, "—");
  percentSign_ = label(bigRow, &font_disp_32, color::kWorking, "%");
  lv_obj_set_style_pad_bottom(percentSign_, 18, 0);

  const int paceY = 102 + lv_font_get_line_height(&font_num_96) - 10;
  pace_ = centeredLabel(tile, &font_mono_12, color::kInk, paceY, 320);
  reset_ = centeredLabel(tile, &font_mono_12, color::kInkDim, paceY + 18, 320);

  rows_ = passive(tile);
  lv_obj_set_size(rows_, 250, LV_SIZE_CONTENT);
  lv_obj_set_pos(rows_, kCenter - 125, 292);
  lv_obj_set_flex_flow(rows_, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(rows_, 9, 0);
  for (int i = 0; i < 3; ++i) {
    rowLine_[i] = passive(rows_);
    lv_obj_set_size(rowLine_[i], lv_pct(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(rowLine_[i], LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(rowLine_[i], LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(rowLine_[i], 10, 0);
    rowDot_[i] = dot(rowLine_[i], 10, color::kUnseen);
    rowName_[i] = label(rowLine_[i], &font_mono_12, tone::kInkSoft);
    lv_obj_set_style_text_letter_space(rowName_[i], 2, 0);
    lv_obj_set_flex_grow(rowName_[i], 1);
    rowValue_[i] = label(rowLine_[i], &font_disp_18, color::kUnseen);
    lv_obj_add_flag(rowLine_[i], LV_OBJ_FLAG_HIDDEN);
  }
  footnote_ = label(rows_, &font_mono_12, color::kInkDim);
  lv_obj_set_width(footnote_, lv_pct(100));
  lv_obj_set_style_text_align(footnote_, LV_TEXT_ALIGN_CENTER, 0);
}

void UsagePage::update(const Frame& f) {
  const Usage empty;
  const Usage& u = f.snap ? f.snap->usage : empty;
  const bool hasFive = u.fiveHour.known;
  const UsageWindow& primary = hasFive ? u.fiveHour : u.sevenDay;

  if (!primary.known) {
    lv_arc_set_value(outer_, 0);
    show(inner_, false);
    show(outerPace_, false);
    show(innerPace_, false);
    setText(label_, "USO DO PLANO");
    setText(big_, "—");
    show(percentSign_, false);
    lv_obj_set_style_text_color(big_, hex(color::kInkDim), 0);
    setText(pace_, "sem dado de uso ainda");
    setText(reset_, "chega quando a status line manda");
    for (lv_obj_t* line : rowLine_) show(line, false);
    setText(footnote_, "");
    return;
  }

  const int64_t windowMs = hasFive ? kFiveHoursMs : kWeekMs;
  const double fraction = elapsedFraction(primary, f.now, windowMs);
  const uint32_t c = usageColor(primary.percent, hasFive ? color::kWorking : color::kUnseen);
  lv_arc_set_value(outer_, primary.percent);
  lv_obj_set_style_arc_color(outer_, hex(c), LV_PART_INDICATOR);
  placePace(outerPace_, fraction);
  setText(label_, hasFive ? "5 H" : "SEMANA");
  setText(big_, std::to_string(primary.percent));
  show(percentSign_, true);
  lv_obj_set_style_text_color(big_, hex(c), 0);
  lv_obj_set_style_text_color(percentSign_, hex(c), 0);
  setText(pace_, fraction >= 0 ? paceText(primary, fraction) : "");
  setText(reset_, resetText(primary.resetsAt, f, !hasFive));

  // Arco de dentro e linhas: a semana (se a de fora é a de 5 h) e os limites por modelo.
  struct Line {
    std::string name;
    int percent;
    uint32_t color;
    bool ring;
  };
  std::vector<Line> lines;
  if (hasFive && u.sevenDay.known) lines.push_back({"SEMANA", u.sevenDay.percent, color::kUnseen, false});
  for (const ScopedUsage& s : u.scoped) lines.push_back({upper("só " + s.label), s.percent, tone::kInkSoft, true});
  if (lines.size() > 3) lines.resize(3);

  show(inner_, !lines.empty());
  const bool weekInside = hasFive && u.sevenDay.known;
  placePace(innerPace_, weekInside ? elapsedFraction(u.sevenDay, f.now, kWeekMs) : -1);
  if (!lines.empty()) {
    lv_arc_set_value(inner_, lines.front().percent);
    lv_obj_set_style_arc_color(inner_, hex(usageColor(lines.front().percent, lines.front().color)), LV_PART_INDICATOR);
  }
  for (size_t i = 0; i < rowLine_.size(); ++i) {
    const bool used = i < lines.size();
    show(rowLine_[i], used);
    if (!used) continue;
    const Line& l = lines[i];
    const uint32_t lc = usageColor(l.percent, l.color);
    lv_obj_set_style_bg_opa(rowDot_[i], l.ring ? LV_OPA_TRANSP : LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(rowDot_[i], hex(lc), 0);
    lv_obj_set_style_border_width(rowDot_[i], l.ring ? 2 : 0, 0);
    lv_obj_set_style_border_color(rowDot_[i], hex(color::kInkDim), 0);
    setText(rowName_[i], l.name);
    setText(rowValue_[i], percentText(l.percent));
    lv_obj_set_style_text_color(rowValue_[i], hex(lc), 0);
  }
  std::string foot;
  if (weekInside && u.sevenDay.resetsAt > 0) {
    const double wf = elapsedFraction(u.sevenDay, f.now, kWeekMs);
    const bool onPace = wf < 0 || u.sevenDay.percent <= static_cast<int>(wf * 100) + 5;
    foot = std::string(onPace ? "semana no ritmo" : "semana acima do ritmo") + " · zera " +
           weekdayClock(u.sevenDay.resetsAt, f.tzOffsetMin);
  }
  setText(footnote_, foot);
}

}  // namespace painel::round
