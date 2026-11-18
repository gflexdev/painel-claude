#include "board/touch.h"

#include <Arduino.h>
#include <Wire.h>

#include "board/pins.h"

namespace board {
namespace {

constexpr uint16_t kRegStatus = 0x814E;
constexpr uint16_t kRegPoint1 = 0x8150;
constexpr uint16_t kRegProduct = 0x8140;
constexpr uint8_t kAddresses[] = {0x5D, 0x14};

uint8_t gAddr = 0;
struct {
  bool pressed = false;
  int16_t x = 0;
  int16_t y = 0;
} gLast;

bool readRegs(uint16_t reg, uint8_t* out, size_t len) {
  Wire.beginTransmission(gAddr);
  Wire.write(static_cast<uint8_t>(reg >> 8));
  Wire.write(static_cast<uint8_t>(reg & 0xFF));
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(gAddr, static_cast<uint8_t>(len)) != len) return false;
  for (size_t i = 0; i < len; ++i) out[i] = Wire.read();
  return true;
}

void writeReg(uint16_t reg, uint8_t value) {
  Wire.beginTransmission(gAddr);
  Wire.write(static_cast<uint8_t>(reg >> 8));
  Wire.write(static_cast<uint8_t>(reg & 0xFF));
  Wire.write(value);
  Wire.endTransmission();
}

int16_t clampTo(int value, int max) { return static_cast<int16_t>(value < 0 ? 0 : value >= max ? max - 1 : value); }

void read(lv_indev_t*, lv_indev_data_t* data) {
  uint8_t status = 0;
  if (readRegs(kRegStatus, &status, 1) && (status & 0x80)) {
    // Há leitura nova: bit 7 = pronto, bits 0–3 = quantos dedos.
    const uint8_t points = status & 0x0F;
    uint8_t p[4];
    if (points > 0 && points <= 5 && readRegs(kRegPoint1, p, sizeof p)) {
      gLast.pressed = true;
      gLast.x = clampTo(p[0] | (p[1] << 8), kWidth);
      gLast.y = clampTo(p[2] | (p[3] << 8), kHeight);
    } else {
      gLast.pressed = false;
    }
    writeReg(kRegStatus, 0);
  }
  // Sem leitura nova (o GT911 atualiza a cada ~10 ms): mantém o último estado.
  data->point.x = gLast.x;
  data->point.y = gLast.y;
  data->state = gLast.pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

}  // namespace

lv_indev_t* startTouch(lv_display_t* display) {
  Wire.begin(kTouchSda, kTouchScl, kTouchI2cHz);
  for (uint8_t addr : kAddresses) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      gAddr = addr;
      break;
    }
  }
  if (!gAddr) {
    Serial.println("[touch] GT911 não respondeu em 0x5D nem 0x14");
    return nullptr;
  }
  char product[5] = {};
  readRegs(kRegProduct, reinterpret_cast<uint8_t*>(product), 4);
  Serial.printf("[touch] GT911 em 0x%02X (produto %s)\n", gAddr, product);

  lv_indev_t* indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, read);
  lv_indev_set_display(indev, display);
  return indev;
}

}  // namespace board
