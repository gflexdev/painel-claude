// Cliente do servidor painel-claude: uma thread segura o SSE (/api/stream) e reconecta com backoff;
// outra faz as chamadas avulsas (detalhe, decisão, "vista", vigiar). A interface lê tudo por poll(), sem travar.
#pragma once

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <memory>
#include <mutex>
#include <string>

#include "app/http.h"
#include "app/model.h"

namespace painel {

enum class Link { Connecting, Online, Offline, Unauthorized };

struct ClientEvent {
  enum class Type { Snapshot, Link, Detail, Decision, Seen, Watch } type = Type::Link;
  std::shared_ptr<Snapshot> snapshot;
  std::shared_ptr<Detail> detail;
  Link link = Link::Connecting;
  int status = 0;        // HTTP (0 = falha de rede)
  std::string id;        // sessão (Detail/Seen/Watch) ou pedido (Decision)
  std::string message;   // erro legível
  bool allow = false;    // Decision
  bool watched = false;  // Watch com status 200: como a sessão ficou no painel
  int64_t retryAt = 0;   // Link Offline: quando tenta de novo (monoMs)
};

class Client {
 public:
  explicit Client(http::Endpoint endpoint) : endpoint_(std::move(endpoint)) {}
  Client(const Client&) = delete;
  Client& operator=(const Client&) = delete;

  /** Sobe as threads. Chame uma vez. */
  void start();
  /** Próximo evento para a interface (false se não houver). Só a thread da interface chama. */
  bool poll(ClientEvent& out);
  /** monoMs do último sinal do Mac (snapshot ou ping); 0 se nunca houve. */
  int64_t lastContactMs() const { return lastContact_.load(); }

  void requestDetail(const std::string& sessionId);
  void postDecision(const std::string& requestId, bool allow, std::string body);
  void postSeen(const std::string& sessionId);
  /** Liga (`watch = true`) ou desliga a vigia da sessão: POST /api/sessions/:id/watch ou /unwatch. */
  void postWatch(const std::string& sessionId, bool watch);

  const http::Endpoint& endpoint() const { return endpoint_; }

 private:
  struct Command {
    enum class Kind { Detail, Decision, Seen, Watch } kind;
    std::string id;
    std::string body;
    bool allow = false;  // Decision: permitir; Watch: ligar a vigia
  };

  void streamLoop();
  /** Uma conexão de SSE; volta quando ela cai. Devolve o status HTTP (0 = rede). */
  int streamOnce(std::string& error);
  void apiLoop();
  void runCommand(const Command& cmd);
  void push(ClientEvent event);
  void enqueue(Command cmd);

  http::Endpoint endpoint_;
  std::atomic<int64_t> lastContact_{0};

  std::mutex eventsMutex_;
  std::deque<ClientEvent> events_;

  std::mutex commandsMutex_;
  std::condition_variable commandsReady_;
  std::deque<Command> commands_;
};

}  // namespace painel
