#include "app/model.h"

#include <ArduinoJson.h>

namespace painel {
namespace {

constexpr size_t kMaxAnswer = 2400;  // o resto não cabe na tela de 4"

std::string str(JsonVariantConst v, size_t max = 0) {
  if (!v.is<const char*>()) return {};
  std::string s = v.as<const char*>();
  if (max && s.size() > max) {
    size_t cut = max;
    while (cut > 0 && (static_cast<unsigned char>(s[cut]) & 0xC0) == 0x80) --cut;  // não corta UTF-8 no meio
    s = s.substr(0, cut) + "…";
  }
  return s;
}

int64_t num(JsonVariantConst v, int64_t fallback) {
  return v.is<int64_t>() || v.is<double>() ? v.as<int64_t>() : fallback;
}

Session readSession(JsonObjectConst o) {
  Session s;
  s.id = str(o["id"]);
  s.name = str(o["name"]);
  s.project = str(o["project"]);
  s.origin = str(o["origin"]);
  s.status = str(o["status"]);
  s.detail = str(o["detail"]);
  s.activity = str(o["activity"]);
  s.model = str(o["model"]);
  s.unseen = o["unseen"] | false;
  s.stale = o["stale"] | false;
  s.archived = o["archived"] | false;
  s.since = num(o["since"], 0);
  s.lastEventAt = num(o["lastEventAt"], 0);
  s.contextTokens = num(o["contextTokens"], -1);
  s.turns = static_cast<int>(num(o["turns"], -1));
  JsonObjectConst p = o["permission"];
  if (!p.isNull()) {
    s.hasPermission = true;
    s.permission.id = str(p["id"]);
    s.permission.kind = str(p["kind"]);
    s.permission.tool = str(p["tool"]);
    s.permission.count = static_cast<int>(num(p["count"], 1));
  }
  return s;
}

int percentOf(JsonVariantConst v) {
  const int64_t p = num(v, 0);
  return static_cast<int>(p < 0 ? 0 : p > 100 ? 100 : p);
}

UsageWindow readWindow(JsonObjectConst o) {
  UsageWindow w;
  if (o.isNull() || !(o["usedPercentage"].is<double>() || o["usedPercentage"].is<int64_t>())) return w;
  w.known = true;
  w.percent = percentOf(o["usedPercentage"]);
  w.resetsAt = num(o["resetsAt"], 0);
  return w;
}

Usage readUsage(JsonObjectConst o) {
  Usage u;
  if (o.isNull()) return u;
  u.fiveHour = readWindow(o["fiveHour"]);
  u.sevenDay = readWindow(o["sevenDay"]);
  for (JsonObjectConst s : o["scoped"].as<JsonArrayConst>()) {
    if (s["label"].isNull()) continue;
    u.scoped.push_back({str(s["label"], 24), percentOf(s["usedPercentage"]), num(s["resetsAt"], 0)});
  }
  return u;
}

Request readRequest(JsonObjectConst o) {
  Request r;
  r.id = str(o["id"]);
  r.kind = str(o["kind"]);
  r.tool = str(o["tool"]);
  r.toolName = str(o["toolName"]);
  r.preview = str(o["preview"]);
  for (JsonObjectConst q : o["questions"].as<JsonArrayConst>()) {
    Question question;
    question.question = str(q["question"]);
    question.header = str(q["header"]);
    question.kind = str(q["kind"]);
    if (question.kind.empty()) question.kind = "choice";
    question.multiSelect = q["multiSelect"] | false;
    for (JsonObjectConst opt : q["options"].as<JsonArrayConst>()) {
      question.options.push_back({str(opt["label"]), str(opt["description"])});
    }
    r.questions.push_back(std::move(question));
  }
  return r;
}

}  // namespace

bool parseSnapshot(const char* json, size_t len, Snapshot& out, std::string& error) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, json, len);
  if (err) {
    error = std::string("JSON do snapshot: ") + err.c_str();
    return false;
  }
  Snapshot snap;
  snap.now = num(doc["now"], 0);
  snap.version = str(doc["version"]);
  for (JsonObjectConst s : doc["sessions"].as<JsonArrayConst>()) snap.sessions.push_back(readSession(s));
  snap.usage = readUsage(doc["usage"]);
  out = std::move(snap);
  return true;
}

bool parseDetail(const char* json, size_t len, Detail& out, std::string& error) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, json, len);
  if (err) {
    error = std::string("JSON do detalhe: ") + err.c_str();
    return false;
  }
  if (!(doc["success"] | false)) {
    error = str(doc["error"]);
    if (error.empty()) error = "resposta sem sucesso";
    return false;
  }
  JsonObjectConst data = doc["data"];
  Detail d;
  d.session = readSession(data);
  d.cwd = str(data["cwd"]);
  d.lastPrompt = str(data["lastPrompt"]);
  d.startedAt = num(data["startedAt"], 0);
  for (JsonObjectConst r : data["permissions"].as<JsonArrayConst>()) d.requests.push_back(readRequest(r));
  JsonObjectConst summary = data["summary"];
  if (!summary.isNull()) {
    d.hasSummary = true;
    d.summaryPrompt = str(summary["lastPrompt"]);
    d.answer = str(summary["answer"], kMaxAnswer);
    for (JsonVariantConst t : summary["recentTools"].as<JsonArrayConst>()) d.recentTools.push_back(str(t, 80));
  }
  out = std::move(d);
  return true;
}

std::string parseError(const char* json, size_t len) {
  JsonDocument doc;
  if (deserializeJson(doc, json, len)) return {};
  return str(doc["error"]);
}

bool allAnswered(const Request& request, const Picks& picks) {
  for (const Question& q : request.questions) {
    auto it = picks.find(q.question);
    if (it == picks.end()) return false;
    bool answered = q.kind == "choice" ? !it->second.chosen.empty() : it->second.text.find_first_not_of(" \t\n") != std::string::npos;
    if (!answered) return false;
  }
  return true;
}

std::string buildDecisionBody(bool allow, const Request& request, const Picks& picks) {
  JsonDocument doc;
  doc["decision"] = allow ? "allow" : "deny";
  if (allow && request.kind == "question") {
    JsonObject answers = doc["answers"].to<JsonObject>();
    for (const Question& q : request.questions) {
      auto it = picks.find(q.question);
      if (it == picks.end()) continue;
      if (q.kind != "choice") {
        answers[q.question] = it->second.text;
      } else if (q.multiSelect) {
        JsonArray list = answers[q.question].to<JsonArray>();
        for (const std::string& label : it->second.chosen) list.add(label);
      } else if (!it->second.chosen.empty()) {
        answers[q.question] = it->second.chosen.front();
      }
    }
  }
  std::string body;
  serializeJson(doc, body);
  return body;
}

}  // namespace painel
