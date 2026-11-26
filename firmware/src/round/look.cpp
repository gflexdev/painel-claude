#include "round/look.h"

#include <algorithm>

#include "app/format.h"

namespace painel::round {

using ui::color::kError;
using ui::color::kUnseen;
using ui::color::kWaiting;
using ui::color::kWorking;

bool inMotion(const Session& s) {
  if (s.archived || s.stale) return false;
  return s.status == "working" || s.status == "waiting" || s.status == "error" || (s.status == "idle" && s.unseen);
}

std::vector<const Session*> inMotionOf(const Snapshot& snap) {
  std::vector<const Session*> out;
  for (const Session& s : snap.sessions) {
    if (inMotion(s)) out.push_back(&s);
  }
  return out;
}

std::string situationWord(const Session& s) {
  if (s.stale) return "sem sinal";
  if (s.status == "idle" && s.unseen) return "terminou";
  return statusWord(s.status);
}

std::string tileWordUpper(const Session& s) {
  if (s.stale) return "SEM SINAL";
  if (s.status == "idle") return s.unseen ? "TERMINOU · VER" : "PARADA";
  return ui::upper(tileWord(s));
}

clawd::Mood moodOf(const Session& s) {
  if (s.stale) return clawd::Mood::Idle;
  if (s.status == "working") return clawd::Mood::Working;
  if (s.status == "waiting") return clawd::Mood::Waiting;
  if (s.status == "error") return clawd::Mood::Error;
  if (s.status == "idle") return s.unseen ? clawd::Mood::Unseen : clawd::Mood::Idle;
  return clawd::Mood::Ended;
}

clawd::Look clawdLookOf(const Session& s, bool withAccessory) {
  clawd::Look look;
  look.mood = moodOf(s);
  look.ground = ui::statusColor(s);
  look.sparkle = kUnseen;
  if (withAccessory) {
    look.accessory = accessoryOf(s);
    look.accessoryColor = ui::statusColor(s);
  }
  return look;
}

clawd::Look clawdLookOfAll(const std::vector<const Session*>& moving) {
  if (moving.empty()) {
    clawd::Look look;
    look.mood = clawd::Mood::Idle;
    look.ground = ui::color::kIdle;
    return look;
  }
  return clawdLookOf(*moving.front(), false);  // o servidor já manda na ordem de urgência
}

uint32_t softColor(uint32_t c) {
  if (c == kWaiting) return 0xff8a9b;
  if (c == kWorking) return 0xffc86e;
  if (c == kUnseen) return 0xa3bfff;
  if (c == kError) return 0xe0a3ff;
  return c;
}

uint32_t tintColor(uint32_t c) {
  if (c == kWaiting) return 0x2a0c13;
  if (c == kWorking) return 0x241a08;
  if (c == kUnseen) return 0x0f1630;
  if (c == kError) return 0x210d2a;
  return tone::kChip;
}

lv_obj_t* makeArc(lv_obj_t* parent, int diameter, int width, uint32_t color, bool rounded) {
  lv_obj_t* arc = lv_arc_create(parent);
  lv_obj_set_size(arc, diameter, diameter);
  lv_obj_set_pos(arc, kCenter - diameter / 2, kCenter - diameter / 2);
  lv_obj_remove_style(arc, nullptr, LV_PART_KNOB);
  lv_obj_remove_flag(arc, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_pad_all(arc, 0, 0);
  lv_obj_set_style_bg_opa(arc, LV_OPA_TRANSP, 0);
  lv_obj_set_style_arc_opa(arc, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_arc_width(arc, width, LV_PART_MAIN);
  lv_obj_set_style_arc_width(arc, width, LV_PART_INDICATOR);
  lv_obj_set_style_arc_color(arc, ui::hex(color), LV_PART_INDICATOR);
  lv_obj_set_style_arc_rounded(arc, rounded, LV_PART_MAIN);
  lv_obj_set_style_arc_rounded(arc, rounded, LV_PART_INDICATOR);
  lv_arc_set_bg_angles(arc, 0, 360);
  lv_arc_set_rotation(arc, 270);  // 0° no topo, sentido horário
  lv_arc_set_angles(arc, 0, 0);
  return arc;
}

lv_obj_t* centeredLabel(lv_obj_t* parent, const lv_font_t* font, uint32_t color, int y, int w,
                        const std::string& text) {
  lv_obj_t* l = ui::label(parent, font, color, text);
  lv_obj_set_width(l, w);
  lv_obj_set_style_text_align(l, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_pos(l, kCenter - w / 2, y);
  return l;
}

lv_obj_t* pill(lv_obj_t* parent, uint32_t bg) {
  lv_obj_t* p = ui::box(parent);
  lv_obj_set_size(p, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_set_style_bg_color(p, ui::hex(bg), 0);
  lv_obj_set_style_bg_opa(p, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(p, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_pad_hor(p, 12, 0);
  lv_obj_set_style_pad_ver(p, 6, 0);
  lv_obj_set_flex_flow(p, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(p, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(p, 8, 0);
  return p;
}

lv_obj_t* watchMark(lv_obj_t* parent, int r, uint32_t bg) {
  const int ring = std::max(1, r / 3);
  lv_obj_t* m = ui::box(parent);
  lv_obj_remove_flag(m, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_size(m, r * 2, r * 2);
  lv_obj_set_style_radius(m, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(m, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(m, ui::hex(bg), 0);
  lv_obj_set_style_border_width(m, ring, 0);
  lv_obj_set_style_border_color(m, ui::hex(ui::color::kQuestion), 0);
  lv_obj_t* dot = ui::box(m);
  lv_obj_remove_flag(dot, LV_OBJ_FLAG_CLICKABLE);
  const int d = std::max(2, (r - ring * 2) * 2);
  lv_obj_set_size(dot, d, d);
  lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(dot, ui::hex(ui::color::kQuestion), 0);
  lv_obj_center(dot);
  return m;
}

void setWatchMarkBg(lv_obj_t* mark, uint32_t bg) { lv_obj_set_style_bg_color(mark, ui::hex(bg), 0); }

void setText(lv_obj_t* label, const std::string& text) {
  const char* current = lv_label_get_text(label);
  if (current && text == current) return;
  lv_label_set_text(label, text.c_str());
}

void show(lv_obj_t* obj, bool visible) {
  if (visible == !lv_obj_has_flag(obj, LV_OBJ_FLAG_HIDDEN)) return;
  if (visible) lv_obj_remove_flag(obj, LV_OBJ_FLAG_HIDDEN);
  else lv_obj_add_flag(obj, LV_OBJ_FLAG_HIDDEN);
}

namespace {
void outlineOpa(void* obj, int32_t v) { lv_obj_set_style_outline_opa(static_cast<lv_obj_t*>(obj), static_cast<lv_opa_t>(v), 0); }
}  // namespace

void pulseOutline(lv_obj_t* obj, uint32_t color, bool on) {
  lv_anim_delete(obj, outlineOpa);
  lv_obj_set_style_outline_color(obj, ui::hex(color), 0);
  if (!on) {
    lv_obj_set_style_outline_opa(obj, LV_OPA_TRANSP, 0);
    return;
  }
  lv_anim_t a;
  lv_anim_init(&a);
  lv_anim_set_var(&a, obj);
  lv_anim_set_exec_cb(&a, outlineOpa);
  lv_anim_set_values(&a, 60, 255);
  lv_anim_set_duration(&a, 700);
  lv_anim_set_reverse_duration(&a, 700);
  lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
  lv_anim_set_path_cb(&a, lv_anim_path_ease_in_out);
  lv_anim_start(&a);
}

}  // namespace painel::round
