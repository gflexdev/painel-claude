import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { createVigia, createVigiaRoutes, avisoLine } from '../src/vigia.js';
import { createScreenTokenCheck } from '../src/tokens.js';
import { sendJson } from '../src/http.js';

const SCREEN_TOKEN = 'token-das-telas-de-teste';
const WATCH_TOKEN = 'token-do-relogio-de-teste-com-folga';
const ev = (name, id, extra = {}) => ({ hook_event_name: name, session_id: id, cwd: '/u/projeto-a', ...extra });
const tick = () => new Promise((resolve) => { setImmediate(resolve); });

/**
 * Store de verdade (lógica de estado real) ligado à Vigia pelo ponto único `onSessionChange`,
 * com um envio falso que anota os Avisos.
 */
function setup({ dir = mkdtempSync(join(tmpdir(), 'painel-vigia-')), decorateAfter = (s) => s } = {}) {
  const avisos = [];
  const vigia = createVigia({ file: join(dir, 'vigia.json'), send: (aviso) => { avisos.push(aviso); } });
  const store = createStore({
    stateFile: join(dir, 'state.json'),
    eventsLog: join(dir, 'eventos.log'),
    debug: false,
    onError: (context, error) => { throw new Error(`${context}: ${error?.message ?? error}`); },
    onSessionChange: (before, after, event) => vigia.observe(before, after && decorateAfter(after), event),
  });
  const hook = (name, id, extra = {}, options = {}) => store.ingest(ev(name, id, extra), options);
  return { dir, vigia, store, avisos, hook };
}

/** Abre uma sessão rodando e a vigia. */
function watchedSession(app, id = 's1', options = {}) {
  app.hook('UserPromptSubmit', id, { prompt: 'faz o deploy' }, options);
  assert.equal(app.vigia.watch(id), true);
}

test('sem vigia não há Aviso, mesmo mudando de Situação', () => {
  const app = setup();
  app.hook('UserPromptSubmit', 's1', { prompt: 'oi' });
  app.hook('PermissionRequest', 's1', { tool_name: 'Bash', tool_input: { command: 'ls' } });
  app.hook('PostToolUse', 's1');
  app.hook('Stop', 's1', { background_tasks: [{ type: 'shell', status: 'running', command: 'npm run dev' }] });
  app.hook('UserPromptSubmit', 's1', { prompt: 'de novo' });
  app.hook('StopFailure', 's1', { error: 'rate limit' });
  app.hook('UserPromptSubmit', 's1', { prompt: 'e de novo' });
  app.hook('Stop', 's1');
  assert.deepEqual(app.avisos, []);
});

test('terminou avisa e encerra a vigia', () => {
  const app = setup();
  watchedSession(app);
  app.hook('Stop', 's1');
  assert.deepEqual(app.avisos.map((a) => a.situation), ['done']);
  assert.equal(app.vigia.isWatched('s1'), false);
  app.hook('UserPromptSubmit', 's1', { prompt: 'mais uma' });
  app.hook('Stop', 's1');
  assert.equal(app.avisos.length, 1, 'depois de terminou, só vigiando de novo');
});

test('erro avisa e encerra a vigia', () => {
  const app = setup();
  watchedSession(app);
  app.hook('StopFailure', 's1', { error: 'rate limit' });
  assert.deepEqual(app.avisos.map((a) => a.situation), ['error']);
  assert.equal(app.vigia.isWatched('s1'), false);
});

test('esperando você avisa uma vez (pedidos seguidos não repetem) e mantém a vigia', () => {
  const app = setup();
  watchedSession(app);
  app.hook('PermissionRequest', 's1', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
  app.hook('Notification', 's1', { notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' });
  app.hook('PermissionRequest', 's1', { tool_name: 'Edit', tool_input: { file_path: '/u/a.js' } });
  app.hook('PreToolUse', 's1', { tool_name: 'AskUserQuestion' });
  assert.deepEqual(app.avisos.map((a) => a.situation), ['waiting']);
  assert.equal(app.vigia.isWatched('s1'), true);
  // Aprovou, voltou a rodar e terminou: chega o último Aviso.
  app.hook('PostToolUse', 's1');
  app.hook('Stop', 's1');
  assert.deepEqual(app.avisos.map((a) => a.situation), ['waiting', 'done']);
  assert.equal(app.vigia.isWatched('s1'), false);
});

test('comando em segundo plano avisa e mantém a vigia (com a lista do Claude Code e sem ela)', () => {
  const app = setup();
  watchedSession(app);
  app.hook('Stop', 's1', { background_tasks: [{ type: 'shell', status: 'running', command: 'npm run dev' }] });
  assert.deepEqual(app.avisos.map((a) => a.situation), ['background']);
  assert.equal(app.vigia.isWatched('s1'), true);
  // Sem `background_tasks`: vale o comando lançado com run_in_background neste turno.
  app.hook('UserPromptSubmit', 's1', { prompt: 'sobe o build' });
  app.hook('PreToolUse', 's1', { tool_name: 'Bash', tool_input: { command: 'npm run build', run_in_background: true } });
  app.hook('PostToolUse', 's1');
  app.hook('Stop', 's1');
  assert.deepEqual(app.avisos.map((a) => a.situation), ['background', 'background']);
  assert.equal(app.vigia.isWatched('s1'), true);
  // Acordou e terminou de vez.
  app.hook('UserPromptSubmit', 's1', { prompt: '<task-notification>' });
  app.hook('Stop', 's1');
  assert.deepEqual(app.avisos.map((a) => a.situation), ['background', 'background', 'done']);
});

test('subagente ou workflow em segundo plano não avisa', () => {
  const app = setup();
  watchedSession(app);
  app.hook('Stop', 's1', { background_tasks: [{ type: 'subagent', status: 'running', agent_type: 'Explore' }] });
  app.hook('UserPromptSubmit', 's1', { prompt: 'segue' });
  app.hook('Stop', 's1', {
    background_tasks: [{ type: 'shell', status: 'running', command: 'npm run dev' }, { type: 'workflow', status: 'running' }],
  });
  // Sem a lista: subagente ainda ativo quando o turno acaba.
  app.hook('UserPromptSubmit', 's1', { prompt: 'delega' });
  app.hook('SubagentStart', 's1', { agent_id: 'a1', agent_type: 'Explore' });
  app.hook('Stop', 's1');
  assert.deepEqual(app.avisos, []);
  assert.equal(app.vigia.isWatched('s1'), true);
});

test('sessão de máquina remota segue as mesmas regras e o Aviso diz a máquina', () => {
  const app = setup();
  watchedSession(app, 'r1', { machine: 'vps-dev' });
  app.store.applyTranscript('r1', 'vps-dev', { meta: { title: 'Deploy da API' }, summary: null });
  app.hook('PermissionRequest', 'r1', { tool_name: 'Bash', tool_input: { command: 'ls' } }, { machine: 'vps-dev' });
  app.hook('PermissionRequest', 'r1', { tool_name: 'Bash', tool_input: { command: 'ls -la' } }, { machine: 'vps-dev' });
  app.hook('PostToolUse', 'r1', {}, { machine: 'vps-dev' });
  app.hook('Stop', 'r1', {}, { machine: 'vps-dev' });
  assert.deepEqual(app.avisos, [
    { id: 'r1', situation: 'waiting', name: 'Deploy da API', project: 'projeto-a', machine: 'vps-dev' },
    { id: 'r1', situation: 'done', name: 'Deploy da API', project: 'projeto-a', machine: 'vps-dev' },
  ]);
  assert.equal(app.vigia.isWatched('r1'), false);
  assert.match(avisoLine(app.avisos[1]), /done · Deploy da API · projeto-a · vps-dev/);
});

test('vigiar de novo depois de terminou volta a avisar', () => {
  const app = setup();
  watchedSession(app);
  app.hook('Stop', 's1');
  app.hook('UserPromptSubmit', 's1', { prompt: 'outra coisa' });
  assert.equal(app.vigia.watch('s1'), true);
  app.hook('Stop', 's1');
  assert.deepEqual(app.avisos.map((a) => a.situation), ['done', 'done']);
});

test('sessão encerrada (pelo hook ou pelo painel) perde a vigia sem Aviso', () => {
  const app = setup();
  watchedSession(app, 's1');
  watchedSession(app, 's2');
  app.hook('SessionEnd', 's1');
  app.store.end('s2');
  assert.deepEqual(app.avisos, []);
  assert.equal(app.vigia.isWatched('s1'), false);
  assert.equal(app.vigia.isWatched('s2'), false);
});

test('sessão esquecida pelo painel perde a vigia sem Aviso', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'painel-vigia-'));
  const old = Date.now() - 13 * 3600_000;
  const session = { id: 'velha', status: 'working', detail: 'pensando', statusSince: old, lastEventAt: old, startedAt: old };
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ velha: session }));
  writeFileSync(join(dir, 'vigia.json'), JSON.stringify({ watched: ['velha'] }));
  const app = setup({ dir });
  assert.equal(app.store.get('velha'), undefined);
  await tick();
  assert.equal(app.vigia.isWatched('velha'), false);
  assert.deepEqual(app.avisos, []);
});

test('a vigia fica em disco (0600) e volta ao reabrir o arquivo', () => {
  const app = setup();
  watchedSession(app, 's1');
  watchedSession(app, 's2');
  app.vigia.unwatch('s2');
  const file = join(app.dir, 'vigia.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const reopened = createVigia({ file });
  assert.equal(reopened.isWatched('s1'), true);
  assert.equal(reopened.isWatched('s2'), false);
});

test('o Aviso nunca leva o detalhe do tile, o comando, o pedido nem trecho da resposta', () => {
  // Como em test/watch.test.js: o fake guarda o comando em `permission.tool` (a descrição pronta da grade).
  const app = setup({
    decorateAfter: (s) => ({ ...s, permission: { id: 'p1', kind: 'permission', tool: 'Bash: rm -rf segredo', toolName: 'Bash', count: 1 } }),
  });
  app.hook('UserPromptSubmit', 's1', { prompt: 'pedido-confidencial com detalhes' });
  app.vigia.watch('s1');
  app.hook('PermissionRequest', 's1', { tool_name: 'Bash', tool_input: { command: 'rm -rf segredo' } });
  app.hook('PostToolUse', 's1', { tool_response: { stdout: 'saida-do-comando' } });
  app.hook('Stop', 's1', { background_tasks: [{ type: 'shell', status: 'running', command: 'npm run servidor-secreto' }] });
  app.hook('UserPromptSubmit', 's1', { prompt: 'outro pedido-confidencial' });
  app.hook('Stop', 's1', { last_assistant_message: 'trecho-da-resposta' });
  app.hook('UserPromptSubmit', 's1', { prompt: 'mais um pedido-confidencial' });
  app.vigia.watch('s1');
  app.hook('StopFailure', 's1', { error: 'rate limit com dado-privado' });
  assert.deepEqual(app.avisos.map((a) => a.situation), ['waiting', 'background', 'done', 'error']);
  app.avisos.forEach((aviso) => {
    assert.deepEqual(Object.keys(aviso).sort(), ['id', 'name', 'project', 'situation']);
  });
  const text = JSON.stringify(app.avisos) + app.avisos.map(avisoLine).join('\n');
  assert.doesNotMatch(text, /segredo|rm -rf|pedido-confidencial|saida-do-comando|servidor-secreto|trecho-da-resposta|dado-privado|permissão|rate limit/);
  assert.equal(app.avisos[0].name, 'sessão s1', 'sem título, o nome não vem do pedido');
});

test('a lista das Telas ganha watched só quando verdadeiro', () => {
  const app = setup();
  watchedSession(app, 's1');
  app.hook('UserPromptSubmit', 's2', { prompt: 'oi' });
  const decorated = app.store.view().sessions.map(app.vigia.decorate);
  const byId = Object.fromEntries(decorated.map((s) => [s.id, s]));
  assert.equal(byId.s1.watched, true);
  assert.equal('watched' in byId.s2, false);
});

test('um envio que falha não derruba a ingestão', async () => {
  const errors = [];
  const dir = mkdtempSync(join(tmpdir(), 'painel-vigia-'));
  const vigia = createVigia({ file: join(dir, 'vigia.json'), send: async () => { throw new Error('fora do ar'); }, onError: (c) => errors.push(c) });
  const store = createStore({
    stateFile: join(dir, 'state.json'), eventsLog: join(dir, 'e.log'), debug: false, onError: () => {},
    onSessionChange: (before, after, event) => vigia.observe(before, after, event),
  });
  store.ingest(ev('UserPromptSubmit', 's1', { prompt: 'x' }));
  vigia.watch('s1');
  store.ingest(ev('Stop', 's1'));
  await tick();
  assert.equal(store.get('s1').status, 'idle');
  assert.deepEqual(errors, ['falha ao mandar o Aviso']);
});

/** Servidor de verdade só com as rotas de vigiar e a conferência real do token das Telas. */
async function routes() {
  const dir = mkdtempSync(join(tmpdir(), 'painel-vigia-rotas-'));
  const vigia = createVigia({ file: join(dir, 'vigia.json') });
  const sessions = { s1: { id: 's1', status: 'working' }, fim: { id: 'fim', status: 'ended' } };
  const hasScreenToken = createScreenTokenCheck(SCREEN_TOKEN);
  const handler = createVigiaRoutes({
    vigia,
    store: { get: (id) => sessions[id] },
    allowed: (req, url) => hasScreenToken(req, url, { headerOnly: true }),
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (handler.handle(req, res, url)) return;
    sendJson(res, 404, { success: false });
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { token, method = 'POST', query = '' } = {}) => {
    const response = await fetch(`${base}${path}${query}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(method === 'POST' && { body: '{}' }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const close = () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  return { vigia, call, close };
}

test('rotas: vigiar e parar de vigiar com o token das Telas no cabeçalho', async () => {
  const app = await routes();
  try {
    const on = await app.call('/api/sessions/s1/watch', { token: SCREEN_TOKEN });
    assert.equal(on.status, 200);
    assert.deepEqual(on.body.data, { id: 's1', watched: true });
    assert.equal(app.vigia.isWatched('s1'), true);
    const again = await app.call('/api/sessions/s1/watch', { token: SCREEN_TOKEN });
    assert.deepEqual(again.body.data, { id: 's1', watched: true });
    const off = await app.call('/api/sessions/s1/unwatch', { token: SCREEN_TOKEN });
    assert.equal(off.status, 200);
    assert.deepEqual(off.body.data, { id: 's1', watched: false });
    assert.equal(app.vigia.isWatched('s1'), false);
  } finally {
    await app.close();
  }
});

test('rotas: sem token, token na URL ou outro token dão 401', async () => {
  const app = await routes();
  try {
    assert.equal((await app.call('/api/sessions/s1/watch')).status, 401);
    assert.equal((await app.call('/api/sessions/s1/watch', { query: `?t=${SCREEN_TOKEN}` })).status, 401);
    // Aqui só o das Telas é conferido; o do relógio, ligado como no server.js, fica em test/watch.test.js.
    assert.equal((await app.call('/api/sessions/s1/watch', { token: WATCH_TOKEN })).status, 401);
    assert.equal((await app.call('/api/sessions/s1/unwatch', { token: WATCH_TOKEN })).status, 401);
    assert.equal(app.vigia.isWatched('s1'), false);
  } finally {
    await app.close();
  }
});

test('rotas: sessão desconhecida ou encerrada não é vigiada; só POST', async () => {
  const app = await routes();
  try {
    assert.equal((await app.call('/api/sessions/nao-existe/watch', { token: SCREEN_TOKEN })).status, 404);
    assert.equal((await app.call('/api/sessions/fim/watch', { token: SCREEN_TOKEN })).status, 404);
    assert.equal((await app.call('/api/sessions/s1/watch', { token: SCREEN_TOKEN, method: 'GET' })).status, 405);
    assert.equal(app.vigia.isWatched('fim'), false);
  } finally {
    await app.close();
  }
});
