// Toque capacitivo CST9217 (SensorLib), lido a cada ciclo do LVGL. O controlador conta do canto oposto ao da
// tela: o BSP da Waveshare espelha X e Y (mirror_x = mirror_y = 1), e aqui também.
#include <Arduino.h>
#include <TouchDrv.hpp>
#include <Wire.h>

#include "board_amoled/display.h"
#include "board_amoled/pins.h"

namespace board {
namespace {

TouchDrvCST92xx gTouch;

void read(lv_indev_t*, lv_indev_data_t* data) {
  const TouchPoints& points = gTouch.getTouchPoints();
  if (!points.hasPoints()) {
    data->state = LV_INDEV_STATE_RELEASED;
    return;
  }
  const TouchPoint& p = points.getPoint(0);
  const int x = p.x < kWidth ? p.x : kWidth - 1;
  const int y = p.y < kHeight ? p.y : kHeight - 1;
  data->point.x = kWidth - 1 - x;
  data->point.y = kHeight - 1 - y;
  data->state = LV_INDEV_STATE_PRESSED;
}

}  // namespace

lv_indev_t* startTouch(lv_display_t* display) {
  Wire.begin(kI2cSda, kI2cScl, kI2cHz);
  gTouch.setPins(kTouchReset, kTouchInt);
  if (!gTouch.begin(Wire, kTouchAddress, kI2cSda, kI2cScl)) {
    Serial.println("[toque] CST9217 não respondeu em 0x5A");
    return nullptr;
  }
  Serial.printf("[toque] %s em 0x%02X\n", gTouch.getModelName(), kTouchAddress);
  lv_indev_t* indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, read);
  lv_indev_set_display(indev, display);
  return indev;
}

}  // namespace board
