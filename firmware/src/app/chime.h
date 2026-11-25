// Sons curtos do mostrador, gerados na hora (sem arquivo de áudio): PCM mono de 16 bits.
// Só a conta; quem toca é a plataforma (I2S na placa, SDL no simulador).
#pragma once

#include <cstdint>
#include <vector>

namespace painel {

enum class Chime {
  /** Uma sessão passou a esperar você: dois toques subindo, com timbre de 8 bits como o Clawd. */
  Waiting,
};

constexpr int kChimeSampleRate = 16000;

/** As amostras do som, já com o volume (0–100) aplicado. */
std::vector<int16_t> renderChime(Chime chime, int volumePercent, int sampleRate = kChimeSampleRate);

}  // namespace painel
