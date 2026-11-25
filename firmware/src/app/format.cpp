#include "app/format.h"

#include <cstdio>
#include <map>

namespace painel {

const char* statusWord(const std::string& status) {
  static const std::map<std::string, const char*> words = {
      {"working", "rodando"}, {"waiting", "esperando você"}, {"idle", "parada"},
      {"error", "erro"},      {"ended", "encerrada"},
  };
  auto it = words.find(status);
  return it == words.end() ? status.c_str() : it->second;
}

const char* activityWord(const std::string& activity) {
  static const std::map<std::string, const char*> words = {
      {"read", "lendo"},        {"write", "editando"},    {"bash", "rodando comando"}, {"web", "na web"},
      {"delegate", "delegando"}, {"plan", "planejando"},  {"ask", "perguntando"},     {"mcp", "usando conector"},
      {"think", "pensando"},    {"compact", "compactando"},
  };
  auto it = words.find(activity);
  return it == words.end() ? "" : it->second;
}

std::string tileWord(const Session& s) {
  if (s.hasPermission) {
    const std::string& kind = s.permission.kind;
    std::string verb = kind == "question" ? "responder" : kind == "plan" ? "aprovar plano" : "aprovar?";
    return s.permission.count > 1 ? verb + " (" + std::to_string(s.permission.count) + ")" : verb;
  }
  if (s.status == "idle" && s.unseen) return "terminou · ver";
  if (s.status == "working" && !s.activity.empty()) {
    const char* word = activityWord(s.activity);
    return *word ? word : "rodando";
  }
  return statusWord(s.status);
}

std::string elapsed(int64_t since, int64_t now) {
  int64_t seconds = (now - since + 500) / 1000;
  if (seconds < 0) seconds = 0;
  if (seconds < 10) return "agora";
  if (seconds < 60) return std::to_string(seconds) + "s";
  int64_t minutes = seconds / 60;
  if (minutes < 60) return std::to_string(minutes) + " min";
  int64_t hours = minutes / 60;
  if (hours < 48) {
    char buf[24];
    std::snprintf(buf, sizeof buf, "%lld h %02lld", static_cast<long long>(hours), static_cast<long long>(minutes % 60));
    return buf;
  }
  return std::to_string(hours / 24) + " d";
}

std::string tokens(int64_t count) {
  if (count < 0) return "";
  char buf[24];
  if (count >= 1000000) {
    std::snprintf(buf, sizeof buf, "%.1fM", static_cast<double>(count) / 1e6);
    for (char* p = buf; *p; ++p) {
      if (*p == '.') *p = ',';
    }
    return buf;
  }
  std::snprintf(buf, sizeof buf, "%lldk", static_cast<long long>((count + 500) / 1000));
  return buf;
}

std::string accessoryOf(const Session& s) {
  if (s.status == "idle" && s.unseen) return "done";
  if (s.status == "working" || s.status == "waiting") return s.activity.empty() ? "think" : s.activity;
  return "";
}

std::string clockText(int64_t epochMs, int tzOffsetMin) {
  if (epochMs <= 0) return "--:--";
  int64_t minutes = epochMs / 60000 + tzOffsetMin;
  int64_t dayMinutes = ((minutes % 1440) + 1440) % 1440;
  char buf[8];
  std::snprintf(buf, sizeof buf, "%02d:%02d", static_cast<int>(dayMinutes / 60), static_cast<int>(dayMinutes % 60));
  return buf;
}

std::string weekdayClock(int64_t epochMs, int tzOffsetMin) {
  if (epochMs <= 0) return "--";
  static const char* const kDays[7] = {"qui", "sex", "sáb", "dom", "seg", "ter", "qua"};  // 1/1/1970 foi quinta
  const int64_t minutes = epochMs / 60000 + tzOffsetMin;
  const int64_t day = minutes >= 0 ? minutes / 1440 : (minutes - 1439) / 1440;
  return std::string(kDays[((day % 7) + 7) % 7]) + " " + clockText(epochMs, tzOffsetMin);
}

std::string oneLine(const std::string& text) {
  std::string out;
  out.reserve(text.size());
  for (char c : text) out += (c == '\n' || c == '\r' || c == '\t') ? ' ' : c;
  return out;
}

}  // namespace painel
