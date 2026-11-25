#include "app/link_screen.h"

#include "app/format.h"

namespace painel {
namespace {

constexpr int64_t kNeverConnectedGraceMs = 8000;

}  // namespace

LinkScreen describeLink(const LinkState& st) {
  LinkScreen out;
  if (st.link == Link::Unauthorized) {
    out.tone = LinkScreen::Tone::Bad;
    out.title = "Token recusado pelo Mac";
    out.text = "O servidor em " + st.where + " não aceitou o token gravado na placa.";
    out.hint = "Confira PAINEL_TOKEN em include/secrets.h (o campo token de ~/.config/painel-claude/config.json) e grave de novo.";
    return out;
  }
  if (st.link == Link::Online) return out;

  if (!st.networkNote.empty() && st.now - st.startedAt > kNeverConnectedGraceMs) {
    out.tone = LinkScreen::Tone::Warn;
    out.title = st.networkNote;
    out.text = "Sem Wi-Fi não dá para falar com o Mac.";
    out.hint = "Confira PAINEL_WIFI_SSID e a senha em include/secrets.h (rede de 2,4 GHz).";
    return out;
  }

  const bool neverConnected = st.lastContact == 0 && st.now - st.startedAt > kNeverConnectedGraceMs;
  const bool longOffline = st.offlineSince > 0 && st.now - st.offlineSince > st.offlineScreenAfterMs;
  if (!neverConnected && !longOffline) return out;

  out.tone = LinkScreen::Tone::Bad;
  out.title = st.lastContact ? "Mac sem resposta há " + elapsed(st.lastContact, st.now) : "Mac sem resposta";
  if (st.linkMessage.empty()) out.text = st.where;
  else if (st.linkMessage.find(st.where) != std::string::npos) out.text = st.linkMessage;
  else out.text = st.linkMessage + "\n" + st.where;
  const int64_t wait = st.retryAt - st.now;
  out.hint = wait > 1000 ? "tentando de novo em " + std::to_string((wait + 999) / 1000) + " s" : "tentando de novo…";
  return out;
}

}  // namespace painel
