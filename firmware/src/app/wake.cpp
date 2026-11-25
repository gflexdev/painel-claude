#include "app/wake.h"

#include <algorithm>

#include "app/platform.h"

namespace painel {
namespace {

constexpr int64_t kFadeStepMs = 20;
constexpr int kFadeUpPerStep = 8;    // ~250 ms até o cheio
constexpr int kFadeDownPerStep = 1;  // ~2 s até o baixo

Wake* gTouchOwner = nullptr;

}  // namespace

void Wake::poke() { lastActive_ = platform::monoMs(); }

void Wake::update(bool busy) {
  const int64_t now = platform::monoMs();
  if (lastActive_ < 0) lastActive_ = now;
  const bool touched = lastTouch_ > 0 && now - lastTouch_ < opt_.touchAwakeMs;
  if (busy || touched) lastActive_ = now;
  const uint8_t target = now - lastActive_ < opt_.dimAfterMs ? opt_.brightFull : opt_.brightLow;
  if (brightness_ == target || now - lastFade_ < kFadeStepMs) return;
  lastFade_ = now;
  int next = brightness_;
  if (target > brightness_) next = std::min<int>(target, brightness_ + kFadeUpPerStep);
  else next = std::max<int>(target, brightness_ - kFadeDownPerStep);
  brightness_ = static_cast<uint8_t>(next);
  platform::setBacklight(brightness_);
}

void Wake::wrapTouch(lv_indev_t* indev) {
  gTouchOwner = this;
  touches_.push_back({indev, lv_indev_get_read_cb(indev)});
  lv_indev_set_read_cb(indev, readTouch);
}

void Wake::readTouch(lv_indev_t* indev, lv_indev_data_t* data) {
  Wake* self = gTouchOwner;
  for (const WrappedTouch& t : self->touches_) {
    if (t.indev == indev) t.original(indev, data);
  }
  if (data->state == LV_INDEV_STATE_PRESSED) {
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
