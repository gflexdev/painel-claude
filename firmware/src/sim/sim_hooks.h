// Recursos só do simulador: brilho desenhado como véu escuro, toque e captura de tela por script.
#pragma once

#include <lvgl.h>

#include <cstdint>
#include <string>

namespace painel::sim {

/** Cria o véu de brilho e o "dedo" virtual. Chame depois de criar o display. */
void init(lv_display_t* display);
void setBrightness(uint8_t percent);
/** O "dedo" que os comandos tap usam (para passar pelo mesmo filtro de toque do mouse). */
lv_indev_t* finger();
/**
 * Lê comandos de `path` (se existir), executa e apaga o arquivo. Uma linha por comando:
 *   tap X Y          toque rápido
 *   shot ARQ.bmp     salva a tela (sem o véu de brilho)
 *   wait MS          espera antes do próximo comando
 *   quit             fecha o simulador
 */
void runScript(const std::string& path);
bool quitRequested();

}  // namespace painel::sim
