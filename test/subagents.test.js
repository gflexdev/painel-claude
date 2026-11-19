import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, toView } from '../src/state.js';
import { activeSubagents, recentSubagents } from '../src/subagents.js';

const T0 = 1_000_000;
const S = 'sessao-1';

function run(events) {
  return events.reduce((sessions, [event, at]) => applyEvent(sessions, { session_id: S, cwd: '/r/app', ...event }, T0 + at), {});
}

const START = [
  [{ hook_event_name: 'UserPromptSubmit', prompt: 'revisa o checkout' }, 0],
  [{ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'Explore', description: 'Acha onde a validação é usada' } }, 10],
  [{ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' }, 20],
];

test('SubagentStart cria o subagente com a descrição pedida na ferramenta Agent', () => {
  const sessions = run(START);
  const [agent] = activeSubagents(sessions[S]);
  assert.deepEqual(
    { id: agent.id, type: agent.type, description: agent.description, status: agent.status },
    { id: 'a1', type: 'Explore', description: 'Acha onde a validação é usada', status: 'working' },
  );
  assert.equal(sessions[S].activity, 'delegate');
});

test('ferramenta usada dentro do subagente atualiza o subagente e a sessão diz quem está trabalhando', () => {
  const sessions = run([...START,
    [{ hook_event_name: 'PreToolUse', agent_id: 'a1', agent_type: 'Explore', tool_name: 'Read', tool_input: { file_path: '/r/app/schema.ts' } }, 30]]);
  const [agent] = activeSubagents(sessions[S]);
  assert.equal(agent.activity, 'read');
  assert.match(agent.detail, /schema\.ts/);
  assert.equal(sessions[S].status, 'working');
  assert.equal(sessions[S].activity, 'delegate');
  assert.match(sessions[S].detail, /^Explore: .*schema\.ts/);
});

test('pedido de permissão do subagente deixa a sessão esperando e diz de quem é', () => {
  const sessions = run([...START,
    [{ hook_event_name: 'PermissionRequest', agent_id: 'a1', agent_type: 'Explore', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Roda os testes' } }, 30]]);
  assert.equal(sessions[S].status, 'waiting');
  assert.match(sessions[S].detail, /Explore/);
  assert.equal(activeSubagents(sessions[S])[0].status, 'waiting');
});

test('SubagentStop encerra o subagente; ele continua na lista recente', () => {
  const sessions = run([...START, [{ hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' }, 40]]);
  assert.equal(activeSubagents(sessions[S]).length, 0);
  assert.equal(recentSubagents(sessions[S])[0].status, 'done');
});

test('sem descrição pendente, o subagente fica só com o tipo; guarda no máximo 8', () => {
  const events = [[{ hook_event_name: 'UserPromptSubmit', prompt: 'x' }, 0]];
  for (let i = 0; i < 10; i += 1) {
    events.push([{ hook_event_name: 'SubagentStart', agent_id: `a${i}`, agent_type: 'general-purpose' }, 10 + i * 2]);
    events.push([{ hook_event_name: 'SubagentStop', agent_id: `a${i}`, agent_type: 'general-purpose' }, 11 + i * 2]);
  }
  const sessions = run(events);
  assert.equal(recentSubagents(sessions[S]).length, 8);
  assert.equal(recentSubagents(sessions[S])[0].id, 'a9');
  assert.equal(recentSubagents(sessions[S])[0].description, '');
});

test('toView leva os subagentes ativos (no máximo 4) e a contagem', () => {
  const events = [[{ hook_event_name: 'UserPromptSubmit', prompt: 'x' }, 0]];
  for (let i = 0; i < 5; i += 1) events.push([{ hook_event_name: 'SubagentStart', agent_id: `b${i}`, agent_type: 'Explore' }, 10 + i]);
  const [view] = toView(run(events), T0 + 100);
  assert.equal(view.subagentCount, 5);
  assert.equal(view.subagents.length, 4);
  assert.deepEqual(Object.keys(view.subagents[0]).sort(), ['activity', 'description', 'detail', 'id', 'status', 'type']);
});

test('Stop da sessão fecha os subagentes que ficaram abertos e sem sinal há mais de 15 min', () => {
  const sessions = run([...START, [{ hook_event_name: 'Stop' }, 16 * 60_000]]);
  assert.equal(activeSubagents(sessions[S]).length, 0);
  assert.equal(sessions[S].status, 'idle');
});

test('Stop com subagente ainda rodando: a sessão fica aguardando, não "terminou"', () => {
  const sessions = run([...START, [{ hook_event_name: 'Stop' }, 50]]);
  assert.equal(sessions[S].status, 'working');
  assert.equal(sessions[S].detail, 'aguardando o subagente Explore');
  assert.notEqual(sessions[S].unseen, true);
  assert.equal(activeSubagents(sessions[S]).length, 1);
  assert.equal(toView(sessions, T0 + 20 * 60_000)[0].stale, false, 'esperando em segundo plano não é "sem sinal"');
});

test('Stop com background_tasks vazio vale mais que a conta de subagentes: terminou', () => {
  const sessions = run([...START, [{ hook_event_name: 'Stop', background_tasks: [] }, 50]]);
  assert.equal(sessions[S].status, 'idle');
  assert.equal(sessions[S].unseen, true);
});

test('quando um subagente termina, a sessão volta a delegar para o que sobrou, ou a pensar', () => {
  let sessions = run([...START,
    [{ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'code-reviewer', description: 'Revisa' } }, 25],
    [{ hook_event_name: 'SubagentStart', agent_id: 'a2', agent_type: 'code-reviewer' }, 26],
    [{ hook_event_name: 'SubagentStop', agent_id: 'a2', agent_type: 'code-reviewer' }, 30]]);
  assert.equal(sessions[S].detail, 'delegando para Explore');
  sessions = applyEvent(sessions, { session_id: S, hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' }, T0 + 40);
  assert.equal(sessions[S].detail, 'pensando');
  assert.equal(sessions[S].activity, 'think');
});
