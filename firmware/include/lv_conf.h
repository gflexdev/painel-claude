/* Configuração do LVGL 9 para a placa e para o simulador. O que não está aqui fica no padrão do LVGL. */
#ifndef LV_CONF_H
#define LV_CONF_H

#define LV_COLOR_DEPTH 16

/* Memória: no simulador, malloc do sistema; nas placas, na PSRAM (src/esp32/lv_mem_psram.cpp). */
#ifdef PAINEL_SIM
  #define LV_USE_STDLIB_MALLOC LV_STDLIB_CLIB
#else
  #define LV_USE_STDLIB_MALLOC LV_STDLIB_CUSTOM
#endif
#define LV_USE_STDLIB_STRING LV_STDLIB_CLIB
#define LV_USE_STDLIB_SPRINTF LV_STDLIB_CLIB

/* O LVGL só é chamado pela thread da interface; a rede conversa com ela por fila. */
#define LV_USE_OS LV_OS_NONE

#define LV_DEF_REFR_PERIOD 20
#define LV_DPI_DEF 160

#define LV_USE_LOG 1
#define LV_LOG_LEVEL LV_LOG_LEVEL_WARN
#define LV_LOG_PRINTF 1

/* Fontes: as mesmas da versão web (Space Grotesk e JetBrains Mono), com acentos. */
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_20 1
#define LV_FONT_CUSTOM_DECLARE \
  LV_FONT_DECLARE(font_mono_12) LV_FONT_DECLARE(font_mono_14) LV_FONT_DECLARE(font_mono_16) \
  LV_FONT_DECLARE(font_disp_15) LV_FONT_DECLARE(font_disp_18) LV_FONT_DECLARE(font_disp_24) \
  LV_FONT_DECLARE(font_disp_32) LV_FONT_DECLARE(font_num_96)
#define LV_FONT_DEFAULT &font_mono_14
#define LV_USE_FONT_PLACEHOLDER 1

#define LV_USE_THEME_DEFAULT 1
#define LV_THEME_DEFAULT_DARK 1
#define LV_THEME_DEFAULT_GROW 0

#define LV_USE_FLEX 1
#define LV_USE_GRID 1
#define LV_USE_CANVAS 1
#define LV_USE_KEYBOARD 1
#define LV_USE_TEXTAREA 1
#define LV_USE_LINE 1

#ifdef PAINEL_SIM
  #define LV_USE_SNAPSHOT 1
  #define LV_SDL_INCLUDE_PATH <SDL.h>
  #define LV_SDL_RENDER_MODE LV_DISPLAY_RENDER_MODE_DIRECT
  #define LV_SDL_BUF_COUNT 1
  #define LV_SDL_FULLSCREEN 0
  #define LV_SDL_DIRECT_EXIT 1
#else
  #define LV_USE_SDL 0
#endif

#endif /* LV_CONF_H */
