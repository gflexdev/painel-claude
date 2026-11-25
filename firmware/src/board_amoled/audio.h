// Alto-falante da Waveshare AMOLED 1,75" (conector SPK): ES8311 + NS4150B.
#pragma once

#include "app/chime.h"

namespace board {

/** Liga o I2S e o ES8311. Chame depois de startTouch (o I2C já está de pé). Volume 0 = mudo. */
void startAudio(int volumePercent);

}  // namespace board
