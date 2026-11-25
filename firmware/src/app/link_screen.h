// O que a tela de estado diz quando não dá para mostrar as sessões: Wi-Fi, Mac sem resposta ou
// token recusado. Igual em todas as telas; cada uma desenha do seu jeito.
#pragma once

#include <cstdint>
#include <string>

#include "app/client.h"

namespace painel {

struct LinkState {
  Link link = Link::Connecting;
  std::string linkMessage;  // erro da última tentativa
  std::string networkNote;  // recado da plataforma ("Conectando ao Wi-Fi casa…")
  std::string where;        // "host:porta"
  int64_t now = 0;          // monoMs
  int64_t startedAt = 0;    // monoMs do boot
  int64_t offlineSince = 0;  // monoMs (0 = online)
  int64_t lastContact = 0;  // monoMs do último sinal do Mac (0 = nunca)
  int64_t retryAt = 0;      // monoMs da próxima tentativa
  int64_t offlineScreenAfterMs = 45000;
};

struct LinkScreen {
  enum class Tone { None, Warn, Bad };
  Tone tone = Tone::None;  // None = não mostra a tela de estado
  std::string title;
  std::string text;
  std::string hint;
};

LinkScreen describeLink(const LinkState& st);

}  // namespace painel
