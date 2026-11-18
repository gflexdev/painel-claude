#include "app/http.h"

#include <cstdlib>

namespace painel::http {
namespace {

constexpr int kConnectTimeoutMs = 5000;
constexpr int kReadTimeoutMs = 10000;
constexpr size_t kMaxHead = 8 * 1024;
constexpr size_t kMaxBody = 256 * 1024;

}  // namespace

bool safeHeaderValue(const std::string& value) {
  if (value.empty()) return false;
  for (char c : value) {
    if (static_cast<unsigned char>(c) <= 0x20 || c == 0x7F) return false;
  }
  return true;
}

std::string requestText(const Endpoint& ep, const char* method, const std::string& path, const std::string& body,
                        const char* accept) {
  std::string text;
  text.reserve(256 + body.size());
  text += method;
  text += ' ';
  text += path;
  text += " HTTP/1.0\r\nHost: ";
  text += ep.host + ":" + std::to_string(ep.port);
  text += "\r\nAuthorization: Bearer ";
  text += ep.token;
  text += "\r\nAccept: ";
  text += accept;
  text += "\r\nUser-Agent: painel-bancada/1\r\n";
  if (std::string(method) == "POST") {
    text += "Content-Type: application/json\r\nContent-Length: " + std::to_string(body.size()) + "\r\n";
  }
  text += "\r\n";
  text += body;
  return text;
}

int readHead(platform::Conn& conn, int timeoutMs, std::string& rest, std::string& error) {
  std::string head;
  char buf[512];
  const int64_t deadline = platform::monoMs() + timeoutMs;
  size_t end = std::string::npos;
  while ((end = head.find("\r\n\r\n")) == std::string::npos) {
    if (head.size() > kMaxHead) {
      error = "cabeçalho grande demais";
      return 0;
    }
    const int64_t left = deadline - platform::monoMs();
    if (left <= 0) {
      error = "Mac não respondeu a tempo";
      return 0;
    }
    const int n = conn.read(buf, sizeof buf, static_cast<int>(left));
    if (n < 0) {
      error = "conexão fechada antes da resposta";
      return 0;
    }
    head.append(buf, n);
  }
  rest = head.substr(end + 4);
  // "HTTP/1.1 200 OK"
  const size_t space = head.find(' ');
  const int status = space == std::string::npos ? 0 : std::atoi(head.c_str() + space + 1);
  if (status <= 0) error = "resposta HTTP inválida";
  return status;
}

Response request(const Endpoint& ep, const char* method, const std::string& path, const std::string& body) {
  Response res;
  if (!safeHeaderValue(ep.host) || !safeHeaderValue(ep.token)) {
    res.error = "host ou token inválido";
    return res;
  }
  auto conn = platform::makeConn();
  if (!conn->open(ep.host, ep.port, kConnectTimeoutMs, res.error)) return res;
  const std::string text = requestText(ep, method, path, body, "application/json");
  if (!conn->writeAll(text.data(), text.size())) {
    res.error = "falha ao enviar";
    conn->close();
    return res;
  }
  res.status = readHead(*conn, kReadTimeoutMs, res.body, res.error);
  if (res.status == 0) {
    conn->close();
    return res;
  }
  char buf[1024];
  const int64_t deadline = platform::monoMs() + kReadTimeoutMs;
  while (res.body.size() < kMaxBody) {
    const int64_t left = deadline - platform::monoMs();
    if (left <= 0) break;
    const int n = conn->read(buf, sizeof buf, static_cast<int>(left));
    if (n < 0) {  // fim normal: HTTP/1.0 fecha a conexão
      conn->close();
      return res;
    }
    res.body.append(buf, n);
  }
  conn->close();
  res.status = 0;  // estourou o tamanho ou o tempo: resposta incompleta não vale como sucesso
  res.error = res.body.size() >= kMaxBody ? "resposta grande demais" : "resposta incompleta (tempo esgotado)";
  return res;
}

void SseParser::feed(const char* data, size_t len) {
  for (size_t i = 0; i < len; ++i) {
    const char c = data[i];
    if (c == '\n') {
      if (!pending_.empty() && pending_.back() == '\r') pending_.pop_back();
      line(pending_);
      pending_.clear();
    } else if (pending_.size() < max_) {
      pending_ += c;
    } else {
      overflow_ = true;
    }
  }
}

void SseParser::line(const std::string& text) {
  if (text.empty()) {  // fim do evento
    if (!overflow_ && !data_.empty()) onEvent_(event_.empty() ? "message" : event_, data_);
    event_.clear();
    data_.clear();
    overflow_ = false;
    return;
  }
  if (text[0] == ':') return;  // comentário (ping)
  const size_t colon = text.find(':');
  const std::string field = text.substr(0, colon);
  std::string value = colon == std::string::npos ? "" : text.substr(colon + 1);
  if (!value.empty() && value[0] == ' ') value.erase(0, 1);
  if (field == "event") {
    event_ = value;
  } else if (field == "data") {
    if (data_.size() + value.size() > max_) {
      overflow_ = true;
      return;
    }
    if (!data_.empty()) data_ += '\n';
    data_ += value;
  }
}

}  // namespace painel::http
