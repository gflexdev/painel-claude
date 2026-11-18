import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, applyMeta, markSeen, projectOf, prune, sessionName, toView, STATUS } from '../src/state.js';

const T0 = 1_000_000;
const ev = (hook_event_name, extra = {}) => ({
  session_id: 's1',
  cwd: '/Users/x/dev/projeto-a',
  transcript_path: '/Users/x/.claude/projects/p/s1.jsonl',
  hook_event_name,
  ...extra,
});

test('sessão nova aparece parada ao abrir', () => {
  const s = applyEvent({}, ev('SessionStart'), T0);
  assert.equal(s.s1.status, STATUS.IDLE);
  assert.equal(s.s1.project, 'projeto-a');
});

test('pedido do usuário põe a sessão rodando e guarda o pedido', () => {
  const s = applyEvent({}, ev('UserPromptSubmit', { prompt: 'corrige o bug do login' }), T0);
  assert.equal(s.s1.status, STATUS.WORKING);
  assert.equal(s.s1.lastPrompt, 'corrige o bug do login');
});

test('ferramenta em uso vira o detalhe do tile', () => {
  const s = applyEvent({}, ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Roda os testes' } }), T0);
  assert.equal(s.s1.status, STATUS.WORKING);
  assert.equal(s.s1.detail, 'Bash: Roda os testes');
});

test('pedido de permissão e pergunta deixam a sessão esperando você', () => {
  const perm = applyEvent({}, ev('PermissionRequest', { tool_name: 'Edit', tool_input: { file_path: '/a/b/app.js' } }), T0);
  assert.equal(perm.s1.status, STATUS.WAITING);
  assert.equal(perm.s1.detail, 'permissão: Edit app.js');

  const ask = applyEvent({}, ev('PreToolUse', { tool_name: 'AskUserQuestion', tool_input: {} }), T0);
  assert.equal(ask.s1.status, STATUS.WAITING);

  const notif = applyEvent({}, ev('Notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }), T0);
  assert.equal(notif.s1.status, STATUS.WAITING);
});

test('aviso de ociosidade não tira a sessão do estado parado', () => {
  const s0 = applyEvent({}, ev('Stop'), T0);
  const s1 = applyEvent(s0, ev('Notification', { notification_type: 'idle_prompt', message: 'Claude is waiting for your input' }), T0 + 60_000);
  assert.equal(s1.s1.status, STATUS.IDLE);
  assert.equal(s1.s1.statusSince, T0);
});

test('Stop, StopFailure e SessionEnd', () => {
  assert.equal(applyEvent({}, ev('Stop'), T0).s1.status, STATUS.IDLE);
  const fail = applyEvent({}, ev('StopFailure', { error: 'rate_limit' }), T0);
  assert.equal(fail.s1.status, STATUS.ERROR);
  assert.equal(fail.s1.detail, 'rate_limit');
  assert.equal(applyEvent({}, ev('SessionEnd'), T0).s1.status, STATUS.ENDED);
});

test('statusSince só muda quando o estado muda', () => {
  const a = applyEvent({}, ev('UserPromptSubmit', { prompt: 'x' }), T0);
  const b = applyEvent(a, ev('PreToolUse', { tool_name: 'Read', tool_input: { file_path: '/r.md' } }), T0 + 5_000);
  assert.equal(b.s1.statusSince, T0);
  assert.equal(b.s1.lastEventAt, T0 + 5_000);
  const c = applyEvent(b, ev('Stop'), T0 + 9_000);
  assert.equal(c.s1.statusSince, T0 + 9_000);
});

test('não altera o mapa anterior', () => {
  const a = applyEvent({}, ev('UserPromptSubmit', { prompt: 'x' }), T0);
  const snapshot = structuredClone(a);
  applyEvent(a, ev('Stop'), T0 + 1);
  assert.deepEqual(a, snapshot);
});

test('ignora evento sem session_id e eventos desconhecidos', () => {
  const s = {};
  assert.equal(applyEvent(s, { hook_event_name: 'Stop' }, T0), s);
  assert.equal(applyEvent(s, ev('SubagentStop'), T0), s);
});

test('SessionStart de compactação não derruba quem está rodando', () => {
  const a = applyEvent({}, ev('UserPromptSubmit', { prompt: 'x' }), T0);
  const b = applyEvent(a, ev('SessionStart', { source: 'compact' }), T0 + 1);
  assert.equal(b.s1.status, STATUS.WORKING);
});

test('applyMeta põe o título e a origem', () => {
  const a = applyEvent({}, ev('SessionStart'), T0);
  const b = applyMeta(a, 's1', { title: 'Monitor de agentes', entrypoint: 'app' });
  assert.equal(b.s1.title, 'Monitor de agentes');
  assert.equal(applyMeta(b, 's1', { title: 'Monitor de agentes', entrypoint: 'app' }), b);
  assert.equal(applyMeta(b, 'nao-existe', { title: 'x' }), b);
});

test('prune remove encerradas antigas e esquecidas', () => {
  const ended = applyEvent({}, ev('SessionEnd'), T0);
  assert.ok(prune(ended, T0 + 60_000).s1);
  assert.equal(prune(ended, T0 + 11 * 60_000).s1, undefined);
  const idle = applyEvent({}, ev('Stop'), T0);
  assert.equal(prune(idle, T0 + 13 * 3600_000).s1, undefined);
});

test('toView: esperando, terminada não vista, rodando, parada vista', () => {
  let s = applyEvent({}, { ...ev('Stop'), session_id: 'parada-vista' }, T0);
  s = markSeen(s, 'parada-vista');
  s = applyEvent(s, { ...ev('Stop'), session_id: 'nao-vista' }, T0);
  s = applyEvent(s, { ...ev('UserPromptSubmit', { prompt: 'x' }), session_id: 'rodando' }, T0);
  s = applyEvent(s, { ...ev('PermissionRequest', { tool_name: 'Bash', tool_input: {} }), session_id: 'esperando' }, T0);
  const view = toView(s, T0 + 20 * 60_000);
  assert.deepEqual(view.map((v) => v.id), ['esperando', 'nao-vista', 'rodando', 'parada-vista']);
  assert.equal(view[2].stale, true);
  assert.equal(view[0].name, 'projeto-a');
});

test('Stop deixa "não visto"; novo pedido ou markSeen limpam', () => {
  const done = applyEvent({}, ev('Stop'), T0);
  assert.equal(done.s1.unseen, true);
  assert.equal(markSeen(done, 's1').s1.unseen, false);
  assert.equal(applyEvent(done, ev('UserPromptSubmit', { prompt: 'y' }), T0 + 1).s1.unseen, false);
  const seen = markSeen(done, 's1');
  assert.equal(markSeen(seen, 's1'), seen, 'já visto não muda nada');
});

test('atividade acompanha a ferramenta e a compactação', () => {
  const act = (name, input = {}) => applyEvent({}, ev('PreToolUse', { tool_name: name, tool_input: input }), T0).s1.activity;
  assert.equal(act('Read'), 'read');
  assert.equal(act('Edit'), 'write');
  assert.equal(act('Bash'), 'bash');
  assert.equal(act('WebFetch'), 'web');
  assert.equal(act('mcp__claude-in-chrome__navigate'), 'web');
  assert.equal(act('mcp__todo__listar'), 'mcp');
  assert.equal(act('Agent'), 'delegate');
  assert.equal(act('TodoWrite'), 'plan');
  assert.equal(act('AskUserQuestion'), 'ask');
  assert.equal(applyEvent({}, ev('PreCompact'), T0).s1.activity, 'compact');
  assert.equal(applyEvent({}, ev('PostToolUse'), T0).s1.activity, 'think');
  assert.equal(applyEvent({}, ev('Stop'), T0).s1.activity, null);
});

test('aviso de permissão em inglês não apaga o rótulo da pergunta e é traduzido quando vem sozinho', () => {
  const asked = applyEvent({}, ev('PermissionRequest', { tool_name: 'AskUserQuestion', tool_input: {} }), T0);
  const notified = applyEvent(asked, ev('Notification', {
    notification_type: 'permission_prompt', message: 'Claude needs your permission to use AskUserQuestion',
  }), T0 + 1);
  assert.equal(notified.s1.detail, 'pergunta para você');
  const alone = applyEvent({}, ev('Notification', {
    notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash',
  }), T0);
  assert.equal(alone.s1.detail, 'permissão: Bash');
  assert.equal(alone.s1.status, STATUS.WAITING);
});

test('pedido de permissão de pergunta mantém o rótulo amigável', () => {
  const s = applyEvent({}, ev('PermissionRequest', { tool_name: 'AskUserQuestion', tool_input: {} }), T0);
  assert.equal(s.s1.detail, 'pergunta para você');
});

test('applyMeta guarda modelo, contexto e turnos e ignora nulos', () => {
  const a = applyEvent({}, ev('SessionStart'), T0);
  const b = applyMeta(a, 's1', { model: 'opus 5.5', contextTokens: 84000, turns: 3, title: null });
  assert.equal(b.s1.model, 'opus 5.5');
  assert.equal(b.s1.contextTokens, 84000);
  assert.equal(b.s1.turns, 3);
  assert.equal(applyMeta(b, 's1', { model: null }), b);
  assert.equal(toView(b, T0)[0].contextTokens, 84000);
});

test('sessão de outra máquina leva o nome dela na tela e não guarda caminho de transcript', () => {
  const s = applyEvent({}, ev('SessionStart'), T0, 'vps-dev');
  assert.equal(s.s1.machine, 'vps-dev');
  assert.equal(s.s1.transcriptPath, null);
  const [view] = toView(s, T0);
  assert.equal(view.machine, 'vps-dev');
  assert.equal(toView(applyEvent({}, ev('SessionStart'), T0), T0)[0].machine, '', 'sessão do Mac: campo vazio');
});

test('evento de uma máquina não altera sessão de outra', () => {
  const mac = applyEvent({}, ev('SessionStart'), T0);
  assert.equal(applyEvent(mac, ev('Stop'), T0 + 1, 'vps-dev'), mac);
  const vps = applyEvent({}, ev('SessionStart'), T0, 'vps-dev');
  assert.equal(applyEvent(vps, ev('Stop'), T0 + 1), vps);
  assert.equal(applyEvent(vps, ev('Stop'), T0 + 1, 'vps-dev').s1.status, STATUS.IDLE);
});

test('projectOf: worktree do Claude vira o nome do repositório', () => {
  assert.equal(projectOf('/home/dev/projects/loja-web/.claude/worktrees/bridge-cse_01WrPB5HYD65v8hQYLWzc4wJ'), 'loja-web');
  assert.equal(projectOf('/Users/x/site/.claude-worktrees/feliz-turing'), 'site');
  assert.equal(projectOf('/Users/x/painel-claude'), 'painel-claude');
  assert.equal(projectOf(''), '');
});

test('sessionName: título; sem título, o primeiro pedido (sem barra de comando); senão o projeto', () => {
  assert.equal(sessionName({ id: 'abcdef12', title: 'Deploy', firstPrompt: 'x', project: 'p' }), 'Deploy');
  assert.equal(sessionName({ id: 'abcdef12', firstPrompt: '/deploy:flow fila', project: 'loja-web' }), 'deploy:flow fila');
  assert.equal(sessionName({ id: 'abcdef12', firstPrompt: 'corrige o login\ncom mais detalhes', project: 'p' }), 'corrige o login');
  assert.equal(sessionName({ id: 'abcdef12', firstPrompt: '<command-name>x</command-name>', project: 'p' }), 'p');
  assert.equal(sessionName({ id: 'abcdef12', project: '' }), 'abcdef12');
});

test('primeiro pedido fica guardado; os seguintes não trocam o nome', () => {
  const t0 = 1_000;
  let sessions = applyEvent({}, { hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: '/r/app/.claude/worktrees/w1', prompt: 'arruma a fila' }, t0);
  sessions = applyEvent(sessions, { hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'agora o deploy' }, t0 + 10);
  const [view] = toView(sessions, t0 + 20);
  assert.equal(view.name, 'arruma a fila');
  assert.equal(view.project, 'app');
});
