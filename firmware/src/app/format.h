// Textos e cálculos compartilhados pela grade e pelo detalhe (porte de public/format.js).
#pragma once

#include <cstdint>
#include <string>

#include "app/model.h"

namespace painel {

/** "rodando", "esperando você"… */
const char* statusWord(const std::string& status);
/** "lendo", "editando"… (vazio se não conhecer) */
const char* activityWord(const std::string& activity);
/** Palavra do tile: "aprovar?", "responder", "terminou · ver", "editando"… */
std::string tileWord(const Session& session);
/** "agora", "42s", "3 min", "2 h 05", "3 d" */
std::string elapsed(int64_t since, int64_t now);
/** 84213 → "84k"; 1250000 → "1,3M" */
std::string tokens(int64_t count);
/** Ícone ao lado do robozinho: atividade enquanto trabalha/espera, "done" se terminou sem você ver. */
std::string accessoryOf(const Session& session);
/** Hora local "HH:MM" a partir de epoch em ms e do fuso em minutos. */
std::string clockText(int64_t epochMs, int tzOffsetMin);
/** Dia da semana e hora local, "qui 21:00". */
std::string weekdayClock(int64_t epochMs, int tzOffsetMin);
/** Tira quebras de linha (para linhas únicas). */
std::string oneLine(const std::string& text);

}  // namespace painel
