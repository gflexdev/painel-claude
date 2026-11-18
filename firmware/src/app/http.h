// HTTP/1.0 mínimo sobre platform::Conn. HTTP/1.0 de propósito: o Node responde sem chunked e fecha
// a conexão no fim, e o SSE chega como texto corrido.
#pragma once

#include <cstdint>
#include <functional>
#include <string>

#include "app/platform.h"

namespace painel::http {

struct Endpoint {
  std::string host;
  uint16_t port = 7777;
  std::string token;
};

struct Response {
  int status = 0;     // 0 = não chegou resposta
  std::string body;
  std::string error;  // falha de rede (vazio se veio resposta)
};

/** Host e token vão em cabeçalho: não podem ter espaço, CR, LF ou controle (evita injetar cabeçalhos). */
bool safeHeaderValue(const std::string& value);

/** Faz uma requisição completa (abre, envia, lê até fechar). */
Response request(const Endpoint& ep, const char* method, const std::string& path, const std::string& body = "");

/** Monta o texto da requisição (exposto para o stream reutilizar). */
std::string requestText(const Endpoint& ep, const char* method, const std::string& path, const std::string& body,
                        const char* accept);

/** Lê a linha de status e os cabeçalhos. Devolve o status (0 se falhar) e o que já veio do corpo em `rest`. */
int readHead(platform::Conn& conn, int timeoutMs, std::string& rest, std::string& error);

/** Parser de Server-Sent Events: alimente com pedaços; chama onEvent(nome, dados) a cada linha vazia. */
class SseParser {
 public:
  using Handler = std::function<void(const std::string& event, const std::string& data)>;
  explicit SseParser(Handler onEvent, size_t maxEvent = 256 * 1024) : onEvent_(std::move(onEvent)), max_(maxEvent) {}
  void feed(const char* data, size_t len);

 private:
  void line(const std::string& text);
  Handler onEvent_;
  size_t max_;
  std::string pending_;
  std::string event_;
  std::string data_;
  bool overflow_ = false;
};

}  // namespace painel::http
