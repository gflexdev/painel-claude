#include "app/chime.h"

#include <algorithm>
#include <cmath>

namespace painel {
namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kAttackS = 0.004;   // sem estalo no começo da nota
constexpr double kDecayPerS = 18.0;  // cai rápido, como um "plim"
constexpr double kPeak = 0.55;       // folga para o amplificador pequeno não distorcer

struct Note {
  double hz;
  double startS;
  double lengthS;
};

/** Seno com um pouco da 3ª harmônica: soa "de videogame" sem ficar áspero como uma onda quadrada. */
double voice(double hz, double t) {
  const double phase = 2 * kPi * hz * t;
  return std::sin(phase) + 0.22 * std::sin(3 * phase);
}

double envelope(double t, double length) {
  if (t < 0 || t > length) return 0;
  const double attack = std::min(1.0, t / kAttackS);
  const double release = std::min(1.0, (length - t) / 0.01);
  return attack * release * std::exp(-kDecayPerS * t);
}

}  // namespace

std::vector<int16_t> renderChime(Chime chime, int volumePercent, int sampleRate) {
  const double volume = std::clamp(volumePercent, 0, 100) / 100.0;
  if (volume <= 0) return {};

  std::vector<Note> notes;
  switch (chime) {
    case Chime::Waiting:
      notes = {{988.0, 0.0, 0.16}, {1319.0, 0.13, 0.30}};  // si → mi, uma quarta acima
      break;
  }
  double total = 0;
  for (const Note& n : notes) total = std::max(total, n.startS + n.lengthS);

  const auto count = static_cast<size_t>(total * sampleRate);
  std::vector<int16_t> out(count);
  for (size_t i = 0; i < count; ++i) {
    const double t = static_cast<double>(i) / sampleRate;
    double v = 0;
    for (const Note& n : notes) v += voice(n.hz, t - n.startS) * envelope(t - n.startS, n.lengthS);
    v = std::clamp(v * kPeak * volume, -1.0, 1.0);
    out[i] = static_cast<int16_t>(v * 32767);
  }
  return out;
}

}  // namespace painel
