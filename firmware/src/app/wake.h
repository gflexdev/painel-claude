// Brilho e toque, iguais em todas as telas: cheio enquanto há algo acontecendo ou depois de um toque,
// escurece aos poucos quando fica parado e, com a tela escura, o primeiro toque só acende (não clica).
#pragma once

#include <lvgl.h>

#include <cstdint>
#include <vector>

namespace painel {

struct WakeOptions {
  uint8_t brightFull = 100;
  uint8_t brightLow = 10;
  /** Toque mantém o brilho cheio por este tempo. */
  int64_t touchAwakeMs = 60000;
  /** Sem nada acontecendo e sem toque: escurece depois disso. */
  int64_t dimAfterMs = 90000;
};

class Wake {
 public:
  explicit Wake(WakeOptions options) : opt_(options) {}
  Wake(const Wake&) = delete;
  Wake& operator=(const Wake&) = delete;

  /** Embrulha a leitura do toque. Só um Wake pode embrulhar toques (o callback do LVGL não leva ponteiro). */
  void wrapTouch(lv_indev_t* indev);
  /** Chame no laço: `busy` = alguma sessão esperando ou rodando (mantém a tela acesa). */
  void update(bool busy);
  /** Marca agora como atividade (ex.: um pedido novo chegou). */
  void poke();
  uint8_t brightness() const { return brightness_; }
  int64_t lastTouchMs() const { return lastTouch_; }

 private:
  static void readTouch(lv_indev_t* indev, lv_indev_data_t* data);

  WakeOptions opt_;
  int64_t lastTouch_ = 0;
  int64_t lastActive_ = -1;
  int64_t lastFade_ = 0;
  uint8_t brightness_ = 0;
  bool swallowing_ = false;

  struct WrappedTouch {
    lv_indev_t* indev;
    lv_indev_read_cb_t original;
  };
  std::vector<WrappedTouch> touches_;
};

}  // namespace painel
