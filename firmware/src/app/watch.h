// Botão de vigiar no detalhe do mostrador, sem LVGL: um pedido por vez a caminho do painel, o estado que o
// painel confirmou e o rótulo do botão. A vigia é uma só (painel web, relógio e mostrador): a tela segue o
// que o servidor devolve.
#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "app/model.h"

namespace painel {

class WatchToggle {
 public:
  /** Por quanto tempo o estado confirmado vale sobre uma lista que saiu antes dele. */
  static constexpr int64_t kHoldMs = 5000;

  /** Começa a ligar ou desligar a vigia de `id`. false se já há um pedido a caminho ou o id não serve. */
  bool start(const std::string& id);
  bool pendingFor(const std::string& id) const { return !pending_.empty() && pending_ == id; }

  /** O painel respondeu: `watched` é como a sessão ficou. */
  void confirm(const std::string& id, bool watched, int64_t nowMs);
  /** O pedido não deu certo: a tela fica com o que o servidor manda. */
  void fail(const std::string& id);

  /** Corrige uma lista que ainda não sabe da vigia confirmada, até o servidor concordar ou o prazo passar. */
  void applyTo(std::vector<Session>& sessions, int64_t nowMs);

  /** "Vigiar", "Parar de vigiar", "vigiando…" ou "parando de vigiar…". */
  std::string label(const Session& s) const;

 private:
  std::string pending_;
  std::string heldId_;
  bool heldWatched_ = false;
  int64_t heldAt_ = 0;
};

}  // namespace painel
