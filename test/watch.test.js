import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyEvent, markSeen, toView } from '../src/state.js';
import { createWatchRoutes, watchCounts, watchList, watchUsage, WATCH_LIMIT } from '../src/watch.js';
import { createActionRoutes } from '../src/actions.js';
import { createChat } from '../src/chat.js';
import { createPanelData } from '../src/panel-data.js';
import { normalizeFeatures } from '../src/config.js';
import { createScreenTokenCheck } from '../src/tokens.js';
import { sendJson } from '../src/http.js';

const SCREEN_TOKEN = 'token-das-telas-de-teste';
const WATCH_TOKEN = 'token-do-relogio-de-teste-com-folga';
const T0 = 1_700_000_000_000;
const ev = (name, id, extra = {}) => ({ hook_event_name: name, session_id: id, cwd: '/u/projeto-a', ...extra });

/** Sessões reais, montadas por eventos de hook, numa ordem que não é a de urgência. */
function sampleSessions() {
  let s = {};
  s = applyEvent(s, ev('UserPromptSubmit', 'rodando', { prompt: 'refatora o parser' }), T0);
  s = applyEvent(s, ev('Stop', 'parada-vista'), T0 + 1000);
  s = markSeen(s, 'parada-vista');
  s = applyEvent(s, ev('Stop', 'terminou'), T0 + 2000);
  s = applyEvent(s, ev('StopFailure', 'erro', { error: 'rate limit' }), T0 + 3000);
  s = applyEvent(s, ev('PermissionRequest', 'esperando', { tool_name: 'Bash', tool_input: { command: 'rm -rf segredo' } }), T0 + 4000);
  s = applyEvent(s, ev('UserPromptSubmit', 'arquivada', { prompt: 'algo' }), T0 + 5000);
  s = applyEvent(s, ev('SessionEnd', 'encerrada'), T0 + 6000);
  return s;
}

const USAGE = {
  fiveHour: { usedPercentage: 37, resetsAt: T0 + 60_000 + 2 * 3600_000 },
  sevenDay: { usedPercentage: 48.4, resetsAt: T0 + 60_000 + 3 * 86_400_000 },
  scoped: [{ label: 'Fable', usedPercentage: 12, resetsAt: 0 }, { label: 'b', usedPercentage: 1 }, { label: 'c', usedPercentage: 2 }],
  updatedAt: T0,
  source: 'app',
};

function fakeStore(raw, { archived = ['arquivada'], usage = USAGE } = {}) {
  const now = T0 + 60_000;
  // O servidor de verdade decora com o pedido de permissão (só o essencial, como na grade).
  const decorate = (v) => ({
    ...v,
    ...(archived.includes(v.id) && { archived: true }),
    ...(v.status === 'waiting' && { permission: { id: 'p1', kind: 'permission', tool: 'Bash: rm -rf segredo', toolName: 'Bash', count: 2 } }),
  });
  return {
    view: () => ({ now, usage, sessions: toView(raw, now).map(decorate) }),
    get: (id) => raw[id],
    all: () => Object.values(raw),
  };
}

/** Servidor de verdade com a rota do relógio e as rotas de ação, cada uma com sua conferência real de token. */
async function setup({ store = fakeStore(sampleSessions()), watchToken = WATCH_TOKEN } = {}) {
  const hasScreenToken = createScreenTokenCheck(SCREEN_TOKEN);
  const watch = createWatchRoutes({ store, watchToken: () => watchToken, hasScreenToken });
  const actions = createActionRoutes({
    store,
    chat: createChat({ enabled: false }),
    panel: createPanelData({ file: join(mkdtempSync(join(tmpdir(), 'painel-relogio-')), 'painel.json') }),
    control: { available: () => false },
    discovery: { latest: () => [], refresh: async () => [] },
    features: { get: () => normalizeFeatures({}), set: () => normalizeFeatures({}) },
    isLoopback: () => false,
    hasToken: hasScreenToken,
    logError: () => {},
    log: () => {},
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (watch.handle(req, res, url)) return;
    if (await actions.handle(req, res, url)) return;
    sendJson(res, 404, { success: false });
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { token, method = 'GET', query = '' } = {}) => {
    const response = await fetch(`${base}${path}${query}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(method === 'POST' && { body: '{}' }),
    });
    return { status: response.status, body: await response.json().catch(() => null), size: Number(response.headers.get('content-length')) };
  };
  const close = () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  return { call, close };
}

test('lista do relógio: só em movimento, sem arquivadas nem vistas, na ordem de urgência', async () => {
  const app = await setup();
  try {
    const { status, body } = await app.call('/api/watch', { token: WATCH_TOKEN });
    assert.equal(status, 200);
    const { sessions } = body.data;
    assert.deepEqual(sessions.map((s) => s.id), ['esperando', 'erro', 'terminou', 'rodando']);
    assert.deepEqual(sessions.map((s) => s.status), ['waiting', 'error', 'done', 'working']);
  } finally {
    await app.close();
  }
});

test('lista do relógio: campos mínimos, idade em segundos, nada do comando nem do pedido', async () => {
  const app = await setup();
  try {
    const { body } = await app.call('/api/watch', { token: WATCH_TOKEN });
    const [first] = body.data.sessions;
    assert.deepEqual(Object.keys(first).sort(), ['activity', 'age', 'ask', 'id', 'name', 'open', 'project', 'status']);
    assert.equal(first.project, 'projeto-a');
    assert.equal(first.age, 56);
    assert.equal(first.open, 56, 'aberta desde o primeiro evento');
    assert.deepEqual(first.ask, { kind: 'permission', tool: 'Bash', count: 2 });
    const text = JSON.stringify(body);
    // O nome é o mesmo da grade; o comando, o detalhe do tile e o texto do erro não vão.
    assert.doesNotMatch(text, /rm -rf|segredo|rate limit|permissão:/);
  } finally {
    await app.close();
  }
});

test('lista do relógio: no máximo 8, mesmo com muitas em movimento, e bem abaixo do limite do 165', async () => {
  let raw = {};
  for (let i = 0; i < 30; i += 1) {
    raw = applyEvent(raw, ev('UserPromptSubmit', `s${i}`, { prompt: 'x'.repeat(200) }), T0 + i);
  }
  const app = await setup({ store: fakeStore(raw, { archived: [] }) });
  try {
    const { body, size } = await app.call('/api/watch', { token: WATCH_TOKEN });
    assert.equal(body.data.sessions.length, WATCH_LIMIT);
    assert.equal(body.data.sessions[0].id, 's29', 'a mais recente primeiro, como na grade');
    assert.ok(size < 4 * 1024, `resposta de ${size} bytes`);
    assert.ok(body.data.sessions.every((s) => s.name.length <= 48));
  } finally {
    await app.close();
  }
});

test('lista do relógio: sessão de outra máquina leva o nome da máquina', () => {
  const [remote] = watchList([{ id: 'r', name: 'n', project: 'p', status: 'working', since: 0, machine: 'vps-dev' }], 5000);
  assert.equal(remote.machine, 'vps-dev');
  assert.equal(remote.age, 5);
});

test('token: o do relógio e o das Telas leem a lista; sem token, errado ou pela URL dá 401', async () => {
  const app = await setup();
  try {
    assert.equal((await app.call('/api/watch', { token: WATCH_TOKEN })).status, 200);
    assert.equal((await app.call('/api/watch', { token: SCREEN_TOKEN })).status, 200);
    assert.equal((await app.call('/api/watch')).status, 401);
    assert.equal((await app.call('/api/watch', { token: `${WATCH_TOKEN}x` })).status, 401);
    assert.equal((await app.call('/api/watch', { query: `?t=${WATCH_TOKEN}` })).status, 401);
    assert.equal((await app.call('/api/watch', { method: 'POST', token: WATCH_TOKEN })).status, 405);
  } finally {
    await app.close();
  }
});

test('token do relógio recebe 401 em qualquer outra rota', async () => {
  const app = await setup();
  try {
    assert.equal((await app.call('/api/settings', { token: WATCH_TOKEN })).status, 401);
    assert.equal((await app.call('/api/projects', { token: WATCH_TOKEN })).status, 401);
    assert.equal((await app.call('/api/sessions/esperando/archive', { method: 'POST', token: WATCH_TOKEN })).status, 401);
    assert.equal((await app.call('/api/sessions/esperando/message', { method: 'POST', token: WATCH_TOKEN })).status, 401);
    assert.equal((await app.call('/api/settings', { token: SCREEN_TOKEN })).status, 200, 'o das Telas segue valendo');
  } finally {
    await app.close();
  }
});

test('sem token do relógio gerado (ou revogado), só o das Telas lê a lista', async () => {
  for (const watchToken of [null, '', 'curto']) {
    const app = await setup({ watchToken });
    try {
      assert.equal((await app.call('/api/watch', { token: watchToken || 'qualquer' })).status, 401);
      assert.equal((await app.call('/api/watch', { token: SCREEN_TOKEN })).status, 200);
    } finally {
      await app.close();
    }
  }
});

test('token das Telas: cabeçalho ou ?t= no GET; só cabeçalho quando headerOnly', () => {
  const check = createScreenTokenCheck(SCREEN_TOKEN);
  const req = (authorization) => ({ headers: authorization ? { authorization } : {} });
  const url = (q = '') => new URL(`http://x/api/sessions${q}`);
  assert.equal(check(req(`Bearer ${SCREEN_TOKEN}`), url()), true);
  assert.equal(check(req(), url(`?t=${SCREEN_TOKEN}`)), true);
  assert.equal(check(req(), url(`?t=${SCREEN_TOKEN}`), { headerOnly: true }), false);
  assert.equal(check(req('Bearer '), url()), false);
  assert.equal(check(req(`Bearer ${SCREEN_TOKEN.slice(0, -1)}`), url()), false);
});

test('lista do relógio: contagem por situação de todas em movimento e o uso do plano', async () => {
  const app = await setup();
  try {
    const { body } = await app.call('/api/watch', { token: WATCH_TOKEN });
    assert.equal(body.data.total, 4);
    assert.deepEqual(body.data.counts, { waiting: 1, working: 1, done: 1, error: 1 });
    assert.deepEqual(body.data.usage, {
      fiveHour: { percent: 37, resetsIn: 7200 },
      sevenDay: { percent: 48, resetsIn: 259_200 },
      scoped: [{ label: 'Fable', percent: 12 }, { label: 'b', percent: 1 }],
    });
  } finally {
    await app.close();
  }
});

test('lista do relógio: atividade, contexto, modelo e pedidos quando houver; sem sinal fica de fora', () => {
  const base = { id: 'a', name: 'n', project: 'p', since: 0 };
  const [working, waiting] = watchList([
    { ...base, status: 'working', activity: 'write', contextTokens: 84_213, model: 'opus 5.5', turns: 7 },
    { ...base, id: 'b', status: 'waiting', permission: { kind: 'plan', count: 1 } },
    { ...base, id: 'c', status: 'working', stale: true },
  ], 1000, (id) => (id === 'a' ? 1 : null));
  assert.deepEqual(working, {
    id: 'a', name: 'n', project: 'p', status: 'working', age: 1, activity: 'write', context: 84_213, model: 'opus 5.5', turns: 7, open: 1,
  });
  assert.deepEqual(waiting.ask, { kind: 'plan', count: 1 });
  assert.equal(watchCounts([{ status: 'working', stale: true }, { status: 'idle', unseen: false }]).working, 0);
});

test('uso do plano: sem dado nenhum não vai', () => {
  assert.equal(watchUsage(null, 0), null);
  assert.equal(watchUsage({ scoped: [] }, 0), null);
  assert.deepEqual(watchUsage({ sevenDay: { usedPercentage: 10 } }, 0), { sevenDay: { percent: 10 } });
});
