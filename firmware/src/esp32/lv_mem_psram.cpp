// Memória do LVGL na PSRAM (8 MB) em vez da RAM interna (~300 KB), que fica para o Wi-Fi, as pilhas das tarefas e
// os buffers de DMA da tela. Os objetos e os canvases dos Clawds somam centenas de KB; na RAM interna, a segunda
// tarefa de rede não conseguia pilha e a placa reiniciava. Sem PSRAM, cai no malloc comum.
#include <esp_heap_caps.h>
#include <lvgl.h>

#include <cstdlib>

namespace {
constexpr uint32_t kPsram = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
}

void lv_mem_init(void) {}

void lv_mem_deinit(void) {}

lv_mem_pool_t lv_mem_add_pool(void*, size_t) { return nullptr; }

void lv_mem_remove_pool(lv_mem_pool_t) {}

void* lv_malloc_core(size_t size) {
  void* p = heap_caps_malloc(size, kPsram);
  return p ? p : std::malloc(size);
}

void* lv_realloc_core(void* p, size_t new_size) {
  void* q = heap_caps_realloc(p, new_size, kPsram);
  return q ? q : std::realloc(p, new_size);
}

void lv_free_core(void* p) { heap_caps_free(p); }

void lv_mem_monitor_core(lv_mem_monitor_t*) {}

lv_result_t lv_mem_test_core(void) { return LV_RESULT_OK; }
