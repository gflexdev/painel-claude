// O que cada plataforma (placa ou simulador) precisa fornecer ao código comum.
#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>

#include "app/chime.h"

namespace painel::platform {

/** Conexão TCP simples. read devolve >0 bytes lidos, 0 se deu timeout, -1 se fechou ou falhou. */
class Conn {
 public:
  virtual ~Conn() = default;
  /** Conecta; em caso de falha preenche `error` com algo legível para a tela. */
  virtual bool open(const std::string& host, uint16_t port, int timeoutMs, std::string& error) = 0;
  virtual bool writeAll(const char* data, size_t len) = 0;
  virtual int read(char* buf, size_t len, int timeoutMs) = 0;
  virtual void close() = 0;
};

std::unique_ptr<Conn> makeConn();

/** Relógio monotônico em ms (não volta para trás). */
int64_t monoMs();
void sleepMs(int ms);
/** Chamado antes de criar threads de rede (na placa ajusta a pilha das pthreads). */
void prepareThread(const char* name, size_t stackBytes);
void log(const char* fmt, ...);

/** Brilho da tela em % (0–100). */
void setBacklight(uint8_t percent);

/** Toca um som curto sem travar a interface. Placa sem alto-falante: não faz nada. */
void playChime(Chime chime);

}  // namespace painel::platform
