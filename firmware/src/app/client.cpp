#include "app/client.h"

#include <algorithm>
#include <cstdlib>
#include <thread>

#include "app/platform.h"

namespace painel {
namespace {

constexpr int kBackoffStartMs = 1000;
constexpr int kBackoffMaxMs = 30000;
constexpr int kUnauthorizedRetryMs = 60000;
constexpr int kConnectTimeoutMs = 5000;
constexpr int kHeadTimeoutMs = 10000;
/** O servidor manda ping a cada 25 s; sem nada por 70 s, a conexão morreu sem avisar. */
constexpr int64_t kSilenceLimitMs = 70000;
constexpr size_t kMaxEvents = 32;
constexpr size_t kStackBytes = 16 * 1024;

}  // namespace

bool validId(const std::string& id) {
  if (id.empty() || id.size() > 80) return false;
  return std::all_of(id.begin(), id.end(), [](char c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-';
  });
}

void Client::start() {
  platform::prepareThread("painel-sse", kStackBytes);
  std::thread([this] { streamLoop(); }).detach();
  platform::prepareThread("painel-api", kStackBytes);
  std::thread([this] { apiLoop(); }).detach();
}

bool Client::poll(ClientEvent& out) {
  std::lock_guard<std::mutex> lock(eventsMutex_);
  if (events_.empty()) return false;
  out = std::move(events_.front());
  events_.pop_front();
  return true;
}

void Client::push(ClientEvent event) {
  std::lock_guard<std::mutex> lock(eventsMutex_);
  // Snapshots antigos ainda não lidos não servem para nada: fica só o mais novo.
  if (event.type == ClientEvent::Type::Snapshot) {
    events_.erase(std::remove_if(events_.begin(), events_.end(),
                                 [](const ClientEvent& e) { return e.type == ClientEvent::Type::Snapshot; }),
                  events_.end());
  }
  // Fila cheia: descarta o aviso de conexão mais antigo; respostas de detalhe e decisão nunca se perdem.
  if (events_.size() >= kMaxEvents) {
    auto link = std::find_if(events_.begin(), events_.end(),
                             [](const ClientEvent& e) { return e.type == ClientEvent::Type::Link; });
    if (link != events_.end()) events_.erase(link);
  }
  events_.push_back(std::move(event));
}

void Client::streamLoop() {
  int backoff = kBackoffStartMs;
  for (;;) {
    ClientEvent connecting;
    connecting.link = Link::Connecting;
    push(connecting);

    std::string error;
    const int status = streamOnce(error);

    ClientEvent down;
    down.link = status == 401 ? Link::Unauthorized : Link::Offline;
    down.status = status;
    down.message = error;
    // Chegou a conectar e caiu depois: recomeça o backoff do início.
    if (status == 200) backoff = kBackoffStartMs;
    const int wait = status == 401 ? kUnauthorizedRetryMs : backoff + std::rand() % 500;
    down.retryAt = platform::monoMs() + wait;
    push(down);
    platform::log("[sse] caiu (%d): %s; nova tentativa em %d ms", status, error.c_str(), wait);
    platform::sleepMs(wait);
    backoff = std::min(backoff * 2, kBackoffMaxMs);
  }
}

int Client::streamOnce(std::string& error) {
  if (!http::safeHeaderValue(endpoint_.host) || !http::safeHeaderValue(endpoint_.token)) {
    error = "host ou token inválido (vazio, com espaço ou quebra de linha)";
    return 401;  // mesma tela de "token recusado": precisa corrigir a configuração
  }
  auto conn = platform::makeConn();
  if (!conn->open(endpoint_.host, endpoint_.port, kConnectTimeoutMs, error)) return 0;
  const std::string text = http::requestText(endpoint_, "GET", "/api/stream", "", "text/event-stream");
  if (!conn->writeAll(text.data(), text.size())) {
    error = "falha ao enviar o pedido";
    conn->close();
    return 0;
  }
  std::string rest;
  const int status = http::readHead(*conn, kHeadTimeoutMs, rest, error);
  if (status != 200) {
    if (status == 401) error = "token recusado pelo Mac";
    else if (status) error = "Mac respondeu HTTP " + std::to_string(status);
    conn->close();
    return status;
  }

  bool online = false;
  http::SseParser parser([&](const std::string& event, const std::string& data) {
    if (event != "snapshot") return;
    auto snap = std::make_shared<Snapshot>();
    std::string parseError;
    if (!parseSnapshot(data.data(), data.size(), *snap, parseError)) {
      platform::log("[sse] %s", parseError.c_str());
      return;
    }
    if (!online) {
      online = true;
      ClientEvent up;
      up.link = Link::Online;
      push(up);
    }
    ClientEvent ev;
    ev.type = ClientEvent::Type::Snapshot;
    ev.snapshot = std::move(snap);
    push(std::move(ev));
  });

  int64_t lastData = platform::monoMs();
  auto consume = [&](const char* data, size_t len) {
    lastData = platform::monoMs();
    lastContact_.store(lastData);
    parser.feed(data, len);
  };
  if (!rest.empty()) consume(rest.data(), rest.size());

  char buf[1024];
  for (;;) {
    const int n = conn->read(buf, sizeof buf, 1000);
    if (n > 0) {
      consume(buf, static_cast<size_t>(n));
    } else if (n < 0) {
      error = "o Mac fechou a conexão";
      break;
    } else if (platform::monoMs() - lastData > kSilenceLimitMs) {
      error = "sem sinal do Mac (nem ping)";
      break;
    }
  }
  conn->close();
  return 200;
}

void Client::enqueue(Command cmd) {
  {
    std::lock_guard<std::mutex> lock(commandsMutex_);
    // Pedir o mesmo detalhe duas vezes seguidas é desperdício: troca o pendente.
    if (cmd.kind == Command::Kind::Detail) {
      commands_.erase(std::remove_if(commands_.begin(), commands_.end(),
                                     [](const Command& c) { return c.kind == Command::Kind::Detail; }),
                      commands_.end());
    }
    commands_.push_back(std::move(cmd));
  }
  commandsReady_.notify_one();
}

void Client::requestDetail(const std::string& sessionId) {
  if (validId(sessionId)) enqueue({Command::Kind::Detail, sessionId, "", false});
}

void Client::postDecision(const std::string& requestId, bool allow, std::string body) {
  if (validId(requestId)) enqueue({Command::Kind::Decision, requestId, std::move(body), allow});
}

void Client::postSeen(const std::string& sessionId) {
  if (validId(sessionId)) enqueue({Command::Kind::Seen, sessionId, "{}", false});
}

void Client::apiLoop() {
  for (;;) {
    Command cmd;
    {
      std::unique_lock<std::mutex> lock(commandsMutex_);
      commandsReady_.wait(lock, [this] { return !commands_.empty(); });
      cmd = std::move(commands_.front());
      commands_.pop_front();
    }
    runCommand(cmd);
  }
}

void Client::runCommand(const Command& cmd) {
  ClientEvent ev;
  ev.id = cmd.id;
  if (cmd.kind == Command::Kind::Detail) {
    ev.type = ClientEvent::Type::Detail;
    const http::Response res = http::request(endpoint_, "GET", "/api/sessions/" + cmd.id);
    ev.status = res.status;
    if (res.status == 200) {
      auto detail = std::make_shared<Detail>();
      if (parseDetail(res.body.data(), res.body.size(), *detail, ev.message)) ev.detail = std::move(detail);
    } else {
      ev.message = res.status ? parseError(res.body.data(), res.body.size()) : res.error;
      if (ev.message.empty()) ev.message = "HTTP " + std::to_string(res.status);
    }
  } else if (cmd.kind == Command::Kind::Decision) {
    ev.type = ClientEvent::Type::Decision;
    ev.allow = cmd.allow;
    const http::Response res = http::request(endpoint_, "POST", "/api/permissions/" + cmd.id, cmd.body);
    ev.status = res.status;
    if (res.status != 200) {
      ev.message = res.status ? parseError(res.body.data(), res.body.size()) : res.error;
      if (ev.message.empty()) ev.message = "HTTP " + std::to_string(res.status);
    }
    platform::log("[api] decisão %s → %d", cmd.allow ? "allow" : "deny", res.status);
  } else {
    ev.type = ClientEvent::Type::Seen;
    const http::Response res = http::request(endpoint_, "POST", "/api/sessions/" + cmd.id + "/seen", cmd.body);
    ev.status = res.status;
    ev.message = res.error;
  }
  push(std::move(ev));
}

}  // namespace painel
