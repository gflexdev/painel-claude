#include "app/watch.h"

namespace painel {

bool WatchToggle::start(const std::string& id) {
  if (!pending_.empty() || !validId(id)) return false;
  pending_ = id;
  return true;
}

void WatchToggle::confirm(const std::string& id, bool watched, int64_t nowMs) {
  if (!pendingFor(id)) return;
  pending_.clear();
  heldId_ = id;
  heldWatched_ = watched;
  heldAt_ = nowMs;
}

void WatchToggle::fail(const std::string& id) {
  if (pendingFor(id)) pending_.clear();
}

void WatchToggle::applyTo(std::vector<Session>& sessions, int64_t nowMs) {
  if (heldId_.empty()) return;
  if (nowMs - heldAt_ > kHoldMs) {
    heldId_.clear();
    return;
  }
  for (Session& s : sessions) {
    if (s.id != heldId_) continue;
    if (s.watched == heldWatched_) heldId_.clear();  // o servidor já sabe: daqui em diante vale o dele
    else s.watched = heldWatched_;
    return;
  }
}

std::string WatchToggle::label(const Session& s) const {
  if (pendingFor(s.id)) return s.watched ? "parando de vigiar…" : "vigiando…";
  return s.watched ? "Parar de vigiar" : "Vigiar";
}

}  // namespace painel
