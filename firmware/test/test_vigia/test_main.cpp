// Testes do que é lógica pura na vigia do mostrador: ler o `watched` das sessões, ler a resposta de
// POST /api/sessions/:id/watch e /unwatch, e o estado do botão (a caminho, confirmado, rótulo).
// Rodam no Mac, sem placa nem LVGL: pio test -e test
#include <unity.h>

#include <cstring>
#include <string>

#include "app/model.h"
#include "app/watch.h"

using namespace painel;

namespace {

Snapshot snapshotOf(const char* json) {
  Snapshot snap;
  std::string error;
  TEST_ASSERT_TRUE_MESSAGE(parseSnapshot(json, std::strlen(json), snap, error), error.c_str());
  return snap;
}

Session sessionWith(const std::string& id, bool watched) {
  Session s;
  s.id = id;
  s.watched = watched;
  return s;
}

}  // namespace

void setUp() {}
void tearDown() {}

// ---------------------------------------------------------------- modelo

void test_snapshot_reads_watched() {
  const Snapshot snap = snapshotOf(R"({"now":1,"sessions":[{"id":"a","watched":true},{"id":"b"}]})");
  TEST_ASSERT_EQUAL(2, snap.sessions.size());
  TEST_ASSERT_TRUE(snap.sessions[0].watched);
  TEST_ASSERT_FALSE(snap.sessions[1].watched);
}

void test_snapshot_ignores_watched_that_is_not_bool() {
  const Snapshot snap = snapshotOf(R"({"now":1,"sessions":[{"id":"a","watched":"sim"},{"id":"b","watched":1}]})");
  TEST_ASSERT_FALSE(snap.sessions[0].watched);
  TEST_ASSERT_FALSE(snap.sessions[1].watched);
}

void test_detail_reads_watched() {
  const char* json = R"({"success":true,"data":{"id":"a","watched":true}})";
  Detail d;
  std::string error;
  TEST_ASSERT_TRUE(parseDetail(json, std::strlen(json), d, error));
  TEST_ASSERT_TRUE(d.session.watched);
}

void test_watch_result_reads_confirmed_state() {
  bool watched = false;
  const char* on = R"({"success":true,"data":{"id":"a","watched":true}})";
  TEST_ASSERT_TRUE(parseWatchResult(on, std::strlen(on), watched));
  TEST_ASSERT_TRUE(watched);
  const char* off = R"({"success":true,"data":{"id":"a","watched":false}})";
  TEST_ASSERT_TRUE(parseWatchResult(off, std::strlen(off), watched));
  TEST_ASSERT_FALSE(watched);
}

void test_watch_result_without_field_is_rejected() {
  bool watched = true;
  const char* missing = R"({"success":true,"data":{"id":"a"}})";
  TEST_ASSERT_FALSE(parseWatchResult(missing, std::strlen(missing), watched));
  const char* failed = R"({"success":false,"error":"sessão não encontrada"})";
  TEST_ASSERT_FALSE(parseWatchResult(failed, std::strlen(failed), watched));
  const char* junk = "not json";
  TEST_ASSERT_FALSE(parseWatchResult(junk, std::strlen(junk), watched));
}

// ---------------------------------------------------------------- botão

void test_label_follows_state() {
  WatchToggle t;
  TEST_ASSERT_EQUAL_STRING("Vigiar", t.label(sessionWith("a", false)).c_str());
  TEST_ASSERT_EQUAL_STRING("Parar de vigiar", t.label(sessionWith("a", true)).c_str());
}

void test_label_while_on_the_way() {
  WatchToggle t;
  TEST_ASSERT_TRUE(t.start("a"));
  TEST_ASSERT_EQUAL_STRING("vigiando…", t.label(sessionWith("a", false)).c_str());
  TEST_ASSERT_EQUAL_STRING("parando de vigiar…", t.label(sessionWith("a", true)).c_str());
  // Outra sessão não está a caminho.
  TEST_ASSERT_EQUAL_STRING("Vigiar", t.label(sessionWith("b", false)).c_str());
}

void test_one_request_at_a_time() {
  WatchToggle t;
  TEST_ASSERT_TRUE(t.start("a"));
  TEST_ASSERT_TRUE(t.pendingFor("a"));
  TEST_ASSERT_FALSE(t.start("a"));
  TEST_ASSERT_FALSE(t.start("b"));
  t.fail("a");
  TEST_ASSERT_FALSE(t.pendingFor("a"));
  TEST_ASSERT_TRUE(t.start("b"));
}

void test_invalid_id_does_not_start() {
  WatchToggle t;
  TEST_ASSERT_FALSE(t.start(""));
  TEST_ASSERT_FALSE(t.start("a/../b"));
  TEST_ASSERT_FALSE(t.pendingFor(""));
}

void test_answer_for_another_session_is_ignored() {
  WatchToggle t;
  TEST_ASSERT_TRUE(t.start("a"));
  t.confirm("b", true, 0);
  TEST_ASSERT_TRUE(t.pendingFor("a"));
  t.fail("b");
  TEST_ASSERT_TRUE(t.pendingFor("a"));
}

void test_confirmed_state_wins_over_an_older_snapshot() {
  WatchToggle t;
  t.start("a");
  t.confirm("a", true, 1000);
  TEST_ASSERT_FALSE(t.pendingFor("a"));
  std::vector<Session> stale = {sessionWith("a", false), sessionWith("b", false)};
  t.applyTo(stale, 1500);
  TEST_ASSERT_TRUE(stale[0].watched);
  TEST_ASSERT_FALSE(stale[1].watched);
}

void test_server_wins_once_it_agrees() {
  WatchToggle t;
  t.start("a");
  t.confirm("a", true, 1000);
  std::vector<Session> agrees = {sessionWith("a", true)};
  t.applyTo(agrees, 1200);
  TEST_ASSERT_TRUE(agrees[0].watched);
  // Depois de concordar, quem manda é o servidor: parar de vigiar no painel web aparece aqui.
  std::vector<Session> later = {sessionWith("a", false)};
  t.applyTo(later, 1300);
  TEST_ASSERT_FALSE(later[0].watched);
}

void test_confirmed_state_expires() {
  WatchToggle t;
  t.start("a");
  t.confirm("a", true, 1000);
  std::vector<Session> stale = {sessionWith("a", false)};
  t.applyTo(stale, 1000 + WatchToggle::kHoldMs + 1);
  TEST_ASSERT_FALSE(stale[0].watched);
}

void test_failure_leaves_the_server_state() {
  WatchToggle t;
  t.start("a");
  t.fail("a");
  std::vector<Session> list = {sessionWith("a", false)};
  t.applyTo(list, 10);
  TEST_ASSERT_FALSE(list[0].watched);
  TEST_ASSERT_EQUAL_STRING("Vigiar", t.label(list[0]).c_str());
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_snapshot_reads_watched);
  RUN_TEST(test_snapshot_ignores_watched_that_is_not_bool);
  RUN_TEST(test_detail_reads_watched);
  RUN_TEST(test_watch_result_reads_confirmed_state);
  RUN_TEST(test_watch_result_without_field_is_rejected);
  RUN_TEST(test_label_follows_state);
  RUN_TEST(test_label_while_on_the_way);
  RUN_TEST(test_one_request_at_a_time);
  RUN_TEST(test_invalid_id_does_not_start);
  RUN_TEST(test_answer_for_another_session_is_ignored);
  RUN_TEST(test_confirmed_state_wins_over_an_older_snapshot);
  RUN_TEST(test_server_wins_once_it_agrees);
  RUN_TEST(test_confirmed_state_expires);
  RUN_TEST(test_failure_leaves_the_server_state);
  return UNITY_END();
}
