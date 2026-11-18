// Plataforma do simulador (macOS/Linux): sockets POSIX, std::chrono e um "brilho" simulado.
#include <arpa/inet.h>
#include <fcntl.h>
#include <netdb.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cerrno>
#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <thread>

#include "app/platform.h"
#include "sim/sim_hooks.h"

namespace painel::platform {
namespace {

class PosixConn final : public Conn {
 public:
  ~PosixConn() override { close(); }

  bool open(const std::string& host, uint16_t port, int timeoutMs, std::string& error) override {
    addrinfo hints{};
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    addrinfo* res = nullptr;
    const std::string service = std::to_string(port);
    if (getaddrinfo(host.c_str(), service.c_str(), &hints, &res) != 0 || !res) {
      error = "não achei " + host;
      return false;
    }
    for (addrinfo* ai = res; ai; ai = ai->ai_next) {
      fd_ = ::socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
      if (fd_ < 0) continue;
      int flags = fcntl(fd_, F_GETFL, 0);
      fcntl(fd_, F_SETFL, flags | O_NONBLOCK);
      int rc = ::connect(fd_, ai->ai_addr, ai->ai_addrlen);
      if (rc != 0 && errno == EINPROGRESS) {
        pollfd p{fd_, POLLOUT, 0};
        rc = ::poll(&p, 1, timeoutMs) == 1 ? 0 : -1;
        int soError = 0;
        socklen_t len = sizeof soError;
        if (rc == 0 && (getsockopt(fd_, SOL_SOCKET, SO_ERROR, &soError, &len) != 0 || soError != 0)) rc = -1;
      }
      if (rc == 0) {
        fcntl(fd_, F_SETFL, flags);
#ifdef SO_NOSIGPIPE
        int one = 1;
        setsockopt(fd_, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
        freeaddrinfo(res);
        return true;
      }
      ::close(fd_);
      fd_ = -1;
    }
    freeaddrinfo(res);
    error = "Mac não atende em " + host + ":" + std::to_string(port);
    return false;
  }

  bool writeAll(const char* data, size_t len) override {
    while (len > 0) {
#ifdef MSG_NOSIGNAL
      const ssize_t n = ::send(fd_, data, len, MSG_NOSIGNAL);  // Linux: sem SIGPIPE se o Mac fechar
#else
      const ssize_t n = ::send(fd_, data, len, 0);
#endif
      if (n <= 0) return false;
      data += n;
      len -= static_cast<size_t>(n);
    }
    return true;
  }

  int read(char* buf, size_t len, int timeoutMs) override {
    if (fd_ < 0) return -1;
    pollfd p{fd_, POLLIN, 0};
    const int ready = ::poll(&p, 1, timeoutMs);
    if (ready == 0) return 0;
    if (ready < 0) return errno == EINTR ? 0 : -1;
    const ssize_t n = ::recv(fd_, buf, len, 0);
    return n > 0 ? static_cast<int>(n) : -1;
  }

  void close() override {
    if (fd_ >= 0) ::close(fd_);
    fd_ = -1;
  }

 private:
  int fd_ = -1;
};

}  // namespace

std::unique_ptr<Conn> makeConn() { return std::make_unique<PosixConn>(); }

int64_t monoMs() {
  using namespace std::chrono;
  return duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

void sleepMs(int ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }

void prepareThread(const char*, size_t) {}

void log(const char* fmt, ...) {
  static std::mutex mutex;
  std::lock_guard<std::mutex> lock(mutex);
  va_list args;
  va_start(args, fmt);
  std::vfprintf(stderr, fmt, args);
  va_end(args);
  std::fputc('\n', stderr);
}

void setBacklight(uint8_t percent) { sim::setBrightness(percent); }

}  // namespace painel::platform
