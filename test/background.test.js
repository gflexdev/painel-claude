import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, toView } from '../src/state.js';
import { backgroundPatch } from '../src/background.js';

const T0 = 1_000_000;
const ev = (hook_event_name, extra = {}) => ({ session_id: 's1', cwd: '/Users/x/dev/app', hook_event_name, ...extra });
const run = (events) => events.reduce((sessions, [event, at]) => applyEvent(sessions, event, T0 + at), {});

test('Stop com comando em segundo plano: a sessão continua rodando, não "terminou"', () => {
  const sessions = run([
    [ev('UserPromptSubmit', { prompt: 'sobe o servidor' }), 0],
    [ev('Stop', { background_tasks: [{ id: 't1', type: 'shell', status: 'running', description: 'servidor de dev', command: 'npm run dev' }] }), 10],
  ]);
  assert.equal(sessions.s1.status, 'working');
  assert.equal(sessions.s1.detail, 'em segundo plano: servidor de dev');
  assert.equal(sessions.s1.activity, 'bash');
  assert.notEqual(sessions.s1.unseen, true);
  assert.equal(toView(sessions, T0 + 60 * 60_000)[0].stale, false);
});

test('Stop com várias tarefas diz quantas; tarefa concluída não conta', () => {
  const patch = backgroundPatch(ev('Stop', { background_tasks: [
    { type: 'shell', status: 'running', command: 'a' },
    { type: 'subagent', status: 'running', agent_type: 'Explore' },
    { type: 'shell', status: 'completed', command: 'b' },
  ] }));
  assert.equal(patch.detail, 'aguardando 2 tarefas em segundo plano');
  assert.equal(backgroundPatch(ev('Stop', { background_tasks: [{ type: 'shell', status: 'killed' }] })), null);
});

test('backgroundPatch: sem background_tasks (campo ausente) devolve undefined; não é Stop, também', () => {
  assert.equal(backgroundPatch(ev('Stop')), undefined);
  assert.equal(backgroundPatch(ev('Stop', { background_tasks: 'x' })), undefined);
  assert.equal(backgroundPatch(ev('PreToolUse', { background_tasks: [] })), undefined);
  assert.equal(backgroundPatch(ev('Stop', { agent_id: 'a1', background_tasks: [{ type: 'shell' }] })), undefined);
});

test('Stop sem background_tasks: vale o comando lançado em segundo plano no turno', () => {
  const sessions = run([
    [ev('UserPromptSubmit', { prompt: 'roda os testes' }), 0],
    [ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test', description: 'testes longos', run_in_background: true } }), 5],
    [ev('Stop'), 10],
  ]);
  assert.equal(sessions.s1.status, 'working');
  assert.equal(sessions.s1.detail, 'em segundo plano: testes longos');
  // O próximo turno começa do zero.
  const next = applyEvent(applyEvent(sessions, ev('UserPromptSubmit', { prompt: 'e agora?' }), T0 + 20), ev('Stop'), T0 + 30);
  assert.equal(next.s1.status, 'idle');
  assert.equal(next.s1.unseen, true);
});

test('comando comum (sem segundo plano) não segura a sessão no Stop', () => {
  const sessions = run([
    [ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }), 0],
    [ev('Stop'), 10],
  ]);
  assert.equal(sessions.s1.status, 'idle');
});

test('com background_tasks vazio, terminou mesmo tendo lançado algo no turno', () => {
  const sessions = run([
    [ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'sleep 1', run_in_background: true } }), 0],
    [ev('Stop', { background_tasks: [] }), 10],
  ]);
  assert.equal(sessions.s1.status, 'idle');
});

test('UserPromptSubmit guarda quando foi o último pedido digitado', () => {
  const sessions = run([[ev('UserPromptSubmit', { prompt: 'oi' }), 42]]);
  assert.equal(sessions.s1.lastPromptAt, T0 + 42);
});
