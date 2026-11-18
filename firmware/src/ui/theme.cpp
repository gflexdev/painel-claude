#include "ui/theme.h"

namespace painel::ui {

uint32_t statusColor(const Session& s) {
  if (s.stale) return color::kInkDim;
  if (s.status == "idle" && s.unseen) return color::kUnseen;
  if (s.status == "working") return color::kWorking;
  if (s.status == "waiting") return color::kWaiting;
  if (s.status == "idle") return color::kIdle;
  if (s.status == "error") return color::kError;
  return color::kEnded;
}

uint32_t requestColor(const std::string& kind) {
  if (kind == "question") return color::kQuestion;
  if (kind == "plan") return color::kWorking;
  return color::kWaiting;
}

lv_obj_t* box(lv_obj_t* parent) {
  lv_obj_t* obj = lv_obj_create(parent);
  lv_obj_remove_style_all(obj);
  lv_obj_remove_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
  return obj;
}

lv_obj_t* label(lv_obj_t* parent, const lv_font_t* font, uint32_t textColor, const std::string& text) {
  lv_obj_t* l = lv_label_create(parent);
  lv_obj_set_style_text_font(l, font, 0);
  lv_obj_set_style_text_color(l, hex(textColor), 0);
  lv_label_set_text(l, text.c_str());
  return l;
}

std::string upper(const std::string& utf8) {
  std::string out = utf8;
  for (size_t i = 0; i < out.size(); ++i) {
    auto c = static_cast<unsigned char>(out[i]);
    if (c >= 'a' && c <= 'z') {
      out[i] = static_cast<char>(c - 32);
    } else if (c == 0xC3 && i + 1 < out.size()) {
      // U+00E0..U+00FE (à..þ) → U+00C0..U+00DE, exceto ÷ (U+00F7)
      auto next = static_cast<unsigned char>(out[i + 1]);
      if (next >= 0xA0 && next <= 0xBE && next != 0xB7) out[i + 1] = static_cast<char>(next - 0x20);
      ++i;
    }
  }
  return out;
}

}  // namespace painel::ui
