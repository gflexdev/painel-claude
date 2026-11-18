// Plataforma da placa: TCP pelo WiFiClient, mDNS para nomes .local, pthreads com pilha maior e brilho por PWM.
#include <Arduino.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include <esp_pthread.h>
#include <esp_timer.h>

#include <cstdarg>
#include <mutex>

#include "app/platform.h"
#include "board/pins.h"

namespace painel::platform {
namespace {

constexpr int64_t kResolveCacheMs = 60000;

std::mutex gResolveMutex;
bool gMdnsStarted = false;
struct {
  std::string host;
  IPAddress ip;
  int64_t at = 0;
} gCache;  // protegido por gResolveMutex

bool endsWith(const std::string& text, const std::string& suffix) {
  return text.size() >= suffix.size() && text.compare(text.size() - suffix.size(), suffix.size(), suffix) == 0;
}

/** IP do host: número direto, nome .local por mDNS ou DNS comum. Guarda por 60 s (ou até falhar a conexão). */
bool resolve(const std::string& host, IPAddress& ip, std::string& error) {
  if (ip.fromString(host.c_str())) return true;
  std::lock_guard<std::mutex> lock(gResolveMutex);
  if (gCache.host == host && gCache.at > 0 && monoMs() - gCache.at < kResolveCacheMs) {
    ip = gCache.ip;
    return true;
  }
  bool found = false;
  if (endsWith(host, ".local")) {
    if (!gMdnsStarted) gMdnsStarted = MDNS.begin("painel-bancada");
    ip = MDNS.queryHost(host.substr(0, host.size() - 6).c_str(), 2000);
    found = ip != IPAddress(0, 0, 0, 0);
  } else {
    found = WiFi.hostByName(host.c_str(), ip) == 1;
  }
  if (!found) {
    error = "não achei " + host + " na rede";
    return false;
  }
  gCache.host = host;
  gCache.ip = ip;
  gCache.at = monoMs();
  return true;
}

void forget(const std::string& host) {
  std::lock_guard<std::mutex> lock(gResolveMutex);
  if (gCache.host == host) gCache.at = 0;
}

class WifiConn final : public Conn {
 public:
  bool open(const std::string& host, uint16_t port, int timeoutMs, std::string& error) override {
    if (WiFi.status() != WL_CONNECTED) {
      error = "sem Wi-Fi";
      return false;
    }
    IPAddress ip;
    if (!resolve(host, ip, error)) return false;
    if (!client_.connect(ip, port, timeoutMs)) {
      forget(host);  // o Mac pode ter trocado de IP
      error = "Mac não atende em " + host + ":" + std::to_string(port);
      return false;
    }
    client_.setNoDelay(true);
    return true;
  }

  bool writeAll(const char* data, size_t len) override {
    return client_.write(reinterpret_cast<const uint8_t*>(data), len) == len;
  }

  int read(char* buf, size_t len, int timeoutMs) override {
    const int64_t deadline = monoMs() + timeoutMs;
    for (;;) {
      const int available = client_.available();
      if (available > 0) {
        const size_t want = len < static_cast<size_t>(available) ? len : static_cast<size_t>(available);
        const int n = client_.read(reinterpret_cast<uint8_t*>(buf), want);
        return n > 0 ? n : -1;
      }
      if (!client_.connected()) return -1;
      if (monoMs() >= deadline) return 0;
      delay(5);
    }
  }

  void close() override { client_.stop(); }

 private:
  WiFiClient client_;
};

}  // namespace

std::unique_ptr<Conn> makeConn() { return std::make_unique<WifiConn>(); }

int64_t monoMs() { return esp_timer_get_time() / 1000; }

void sleepMs(int ms) { delay(ms); }

void prepareThread(const char* name, size_t stackBytes) {
  esp_pthread_cfg_t cfg = esp_pthread_get_default_config();
  cfg.stack_size = stackBytes;
  cfg.thread_name = name;
  cfg.prio = 5;
  cfg.pin_to_core = 0;  // rede no núcleo 0, interface (loop do Arduino) no 1
  cfg.inherit_cfg = false;
  esp_pthread_set_cfg(&cfg);
}

void log(const char* fmt, ...) {
  char buf[256];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof buf, fmt, args);
  va_end(args);
  Serial.println(buf);
}

void setBacklight(uint8_t percent) {
  static bool attached = false;
  if (!attached) attached = ledcAttach(board::kBacklight, board::kBacklightHz, 10);
  const uint32_t duty = static_cast<uint32_t>(percent > 100 ? 100 : percent) * 1023 / 100;
  ledcWrite(board::kBacklight, duty);
}

}  // namespace painel::platform
