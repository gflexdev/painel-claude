// Dados que vêm do servidor painel-claude (mesmo JSON da versão web).
#pragma once

#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace painel {

struct PermissionRef {
  std::string id;
  std::string kind;  // permission | plan | question
  std::string tool;
  int count = 0;
};

struct Session {
  std::string id;
  std::string name;
  std::string project;
  std::string origin;
  std::string status;  // working | waiting | idle | error | ended
  std::string detail;
  std::string activity;  // vazio = sem atividade
  std::string model;
  bool unseen = false;
  bool stale = false;
  bool archived = false;
  int64_t since = 0;
  int64_t lastEventAt = 0;
  int64_t contextTokens = -1;  // -1 = sem dado
  int turns = -1;
  bool hasPermission = false;
  PermissionRef permission;
};

/** Uma janela de limite do plano (5 h ou 7 dias): quanto já foi usado e quando zera. */
struct UsageWindow {
  bool known = false;
  int percent = 0;
  int64_t resetsAt = 0;  // epoch ms
};

/** Limite só de um modelo (ex.: "Fable"), quando o plano tem. */
struct ScopedUsage {
  std::string label;
  int percent = 0;
  int64_t resetsAt = 0;
};

/** Uso do plano, como a status line do Claude Code manda em `rate_limits`. */
struct Usage {
  UsageWindow fiveHour;
  UsageWindow sevenDay;
  std::vector<ScopedUsage> scoped;
};

struct Snapshot {
  int64_t now = 0;
  std::string version;
  std::vector<Session> sessions;
  Usage usage;
};

struct Option {
  std::string label;
  std::string description;
};

struct Question {
  std::string question;
  std::string header;
  std::string kind;  // choice | text | number
  bool multiSelect = false;
  std::vector<Option> options;
};

/** Pedido segurado no Mac à espera de decisão: permissão, plano ou pergunta. */
struct Request {
  std::string id;
  std::string kind;
  std::string tool;
  std::string toolName;
  std::string preview;
  std::vector<Question> questions;
};

struct Detail {
  Session session;
  std::string cwd;
  std::string lastPrompt;
  int64_t startedAt = 0;
  std::vector<Request> requests;
  bool hasSummary = false;
  std::string summaryPrompt;
  std::string answer;
  std::vector<std::string> recentTools;
};

/** Resposta escolhida na tela para uma pergunta: opções (uma ou várias) ou texto digitado. */
struct Pick {
  std::vector<std::string> chosen;
  std::string text;
};
using Picks = std::map<std::string, Pick>;

/** Snapshot do SSE (objeto direto, sem envelope). */
bool parseSnapshot(const char* json, size_t len, Snapshot& out, std::string& error);
/** Detalhe de GET /api/sessions/:id (envelope { success, data }). */
bool parseDetail(const char* json, size_t len, Detail& out, std::string& error);
/** Mensagem de erro de uma resposta { success: false, error } (vazio se não houver). */
std::string parseError(const char* json, size_t len);
/** Corpo de POST /api/permissions/:id. `answers` só vai em pergunta aprovada. */
std::string buildDecisionBody(bool allow, const Request& request, const Picks& picks);
/** Todas as perguntas do pedido têm resposta? (libera o botão de enviar) */
bool allAnswered(const Request& request, const Picks& picks);

}  // namespace painel
