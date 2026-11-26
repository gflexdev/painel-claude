import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createActionRoutes, knownProjects } from '../src/actions.js';
import { createChat } from '../src/chat.js';
import { createPanelData } from '../src/panel-data.js';
import { normalizeFeatures } from '../src/config.js';
import { isLocalHook } from '../src/network.js';
import { sendJson } from '../src/http.js';
import { createVigia } from '../src/vigia.js';

const TOKEN = 'token-de-teste';
const PROJECT = mkdtempSync(join(tmpdir(), 'painel-acoes-'));

/** Servidor de verdade com as rotas de ação e dependências falsas; devolve o que cada uma recebeu. */
async function setup({ features = {}, agents = [], refreshes = null } = {}) {
  let current = normalizeFeatures(features);
  const calls = [];
  const ended = [];
  const sessions = {
    s1: { id: 's1', cwd: PROJECT, status: 'idle' },
    bg: { id: 'bg', cwd: PROJECT, status: 'working' },
    remota: { id: 'remota', cwd: '/srv/x', status: 'idle', machine: 'vps' },
  };
  const store = {
    get: (id) => sessions[id],
    all: () => Object.values(sessions),
    noteChat: () => {},
    end: (id) => ended.push(id),
  };
  const chat = createChat({ enabled: current.chat });
  const panel = createPanelData({ file: join(mkdtempSync(join(tmpdir(), 'painel-acoes-dados-')), 'painel.json') });
  const control = {
    available: () => true,
    launch: async (args) => { calls.push(['launch', args]); return { jobId: 'abcd1234' }; },
    stopJob: async (id) => { calls.push(['stop', id]); },
    removeJob: async (id) => { calls.push(['rm', id]); },
  };
  // refreshes: o que o `claude agents` devolve a cada consulta (a sessão nova demora a aparecer); depois, `agents`.
  const pending = refreshes ? [...refreshes] : [];
  const discovery = { latest: () => agents, refresh: async () => (pending.length ? pending.shift() : agents) };
  const vigia = createVigia({ file: join(mkdtempSync(join(tmpdir(), 'painel-acoes-vigia-')), 'vigia.json') });
  const linked = [];
  const actions = createActionRoutes({
    store,
    chat,
    panel,
    control,
    discovery,
    features: { get: () => current, set: (next) => { current = normalizeFeatures(next); chat.setEnabled(current.chat); return current; } },
    isLoopback: (req) => isLocalHook(req.socket.remoteAddress ?? '', req.headers),
    hasToken: (req) => req.headers.authorization === `Bearer ${TOKEN}`,
    vigia,
    logError: () => {},
    log: () => {},
    link: { tries: 3, everyMs: 5, onDone: (result) => linked.push(result) },
  });
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    actions.handle(req, res, url).then((handled) => { if (!handled) sendJson(res, 404, { success: false }); });
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, headers = {}) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body ?? {}),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json().catch(() => null) };
  };
  const close = () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  const linkDone = async (count = 1) => {
    while (linked.length < count) await new Promise((resolve) => { setTimeout(resolve, 5); });
  };
  return { post, close, calls, ended, panel, chat, vigia, linkDone, base, features: () => current };
}

test('Ajustes: só muda do próprio Mac e com token; pelo proxy (celular) é recusado', async () => {
  const app = await setup();
  try {
    assert.equal((await app.post('/api/settings', { chat: true }, { Authorization: 'Bearer errado' })).status, 401);
    const viaProxy = await app.post('/api/settings', { chat: true }, { 'X-Forwarded-For': '100.64.0.5' });
    assert.equal(viaProxy.status, 403);
    assert.match(viaProxy.body.error, /abra o painel no Mac/);
    assert.equal(app.features().chat, false);
    const local = await app.post('/api/settings', { chat: true, launch: 'sim', outra: true });
    assert.equal(local.status, 200);
    assert.deepEqual(local.body.data.features, { chat: true, launch: false, closeRemove: false });
    assert.equal((await app.post('/api/settings', { nada: 1 })).status, 400);
    const read = async (headers) => (await fetch(`${app.base}/api/settings`, { headers: { Authorization: `Bearer ${TOKEN}`, ...headers } })).json();
    assert.equal((await read({})).data.canChange, true);
    assert.equal((await read({ 'X-Forwarded-For': '100.64.0.5' })).data.canChange, false);
    assert.equal((await read({ 'X-Forwarded-For': '100.64.0.5' })).data.features.chat, true);
  } finally {
    await app.close();
  }
});

test('grupo 2 desligado: mensagem, abrir e fechar respondem 403 "desligado nos Ajustes"', async () => {
  const app = await setup({ agents: [{ sessionId: 'bg', kind: 'background', jobId: 'abcd1234' }] });
  try {
    for (const [path, body] of [['/api/sessions/s1/message', { text: 'oi' }], ['/api/sessions', { cwd: PROJECT, prompt: 'x' }], ['/api/sessions/bg/close'], ['/api/sessions/bg/remove']]) {
      const result = await app.post(path, body);
      assert.equal(result.status, 403, path);
      assert.equal(result.body.error, 'desligado nos Ajustes');
    }
    assert.deepEqual(app.calls, []);
    const projects = await fetch(`${app.base}/api/projects`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.equal(projects.status, 403);
  } finally {
    await app.close();
  }
});

test('arquivar vale sempre (grupo 1) e pede token', async () => {
  const app = await setup();
  try {
    assert.equal((await app.post('/api/sessions/s1/archive', {}, { Authorization: '' })).status, 401);
    assert.equal((await app.post('/api/sessions/s1/archive')).body.data.changed, true);
    assert.equal(app.panel.isArchived('s1'), true);
    assert.equal((await app.post('/api/sessions/s1/unarchive')).body.data.changed, true);
    assert.equal((await app.post('/api/sessions/nao-existe/archive')).status, 404);
  } finally {
    await app.close();
  }
});

test('chat ligado: mensagem para sessão que ainda não ouve dá 409; com o hook esperando, entrega', async () => {
  const app = await setup({ features: { chat: true } });
  try {
    assert.equal((await app.post('/api/sessions/s1/message', { text: 'oi' })).status, 409);
    assert.equal((await app.post('/api/sessions/s1/message', { text: '' })).status, 400);
    assert.equal((await app.post('/api/sessions/s1/message', { text: 'x'.repeat(4001) })).status, 400);
    assert.equal((await app.post('/api/sessions/remota/message', { text: 'oi' })).status, 409);
    const waiting = fetch(`${app.base}/chat/wait`, { method: 'POST', body: JSON.stringify({ session_id: 's1', hook_event_name: 'Stop' }) });
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    const sent = await app.post('/api/sessions/s1/message', { text: 'roda os testes' });
    assert.equal(sent.body.data.status, 'delivered');
    const response = await waiting;
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /Painel Claude/);
    assert.ok(text.endsWith('roda os testes'));
  } finally {
    await app.close();
  }
});

test('/chat/wait: com o ajuste desligado responde 204 na hora; pelo proxy, 403', async () => {
  const app = await setup();
  try {
    const started = Date.now();
    const off = await fetch(`${app.base}/chat/wait`, { method: 'POST', body: JSON.stringify({ session_id: 's1', hook_event_name: 'Stop' }) });
    assert.equal(off.status, 204);
    assert.ok(Date.now() - started < 1000);
    const proxied = await fetch(`${app.base}/chat/wait`, { method: 'POST', headers: { 'X-Forwarded-For': '1.2.3.4' }, body: '{}' });
    assert.equal(proxied.status, 403);
  } finally {
    await app.close();
  }
});

test('desligar o chat nos Ajustes solta o hook pendurado com 204', async () => {
  const app = await setup({ features: { chat: true } });
  try {
    const waiting = fetch(`${app.base}/chat/wait`, { method: 'POST', body: JSON.stringify({ session_id: 's1', hook_event_name: 'Stop' }) });
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    await app.post('/api/settings', { chat: false });
    assert.equal((await waiting).status, 204);
  } finally {
    await app.close();
  }
});

test('abrir: só em pasta de projeto conhecida; filha abre na pasta da mãe', async () => {
  const app = await setup({ features: { launch: true } });
  try {
    assert.equal((await app.post('/api/sessions', { cwd: '/etc', prompt: 'x' })).status, 400);
    assert.equal((await app.post('/api/sessions', { cwd: PROJECT, prompt: 'x' })).body.data.jobId, 'abcd1234');
    assert.equal((await app.post('/api/sessions', { parentId: 's1', prompt: 'filha' })).status, 200);
    assert.equal((await app.post('/api/sessions', { parentId: 'remota', prompt: 'x' })).status, 404);
    assert.deepEqual(app.calls.map(([, args]) => args.cwd), [PROJECT, PROJECT]);
  } finally {
    await app.close();
  }
});

test('fechar e apagar: só sessões de segundo plano, pelo id curto; interativa dá 409 e nada roda', async () => {
  const app = await setup({ features: { closeRemove: true }, agents: [{ sessionId: 'bg', kind: 'background', jobId: 'abcd1234' }] });
  try {
    const interactive = await app.post('/api/sessions/s1/close');
    assert.equal(interactive.status, 409);
    assert.deepEqual(app.calls, []);
    assert.equal((await app.post('/api/sessions/bg/close')).status, 200);
    assert.equal((await app.post('/api/sessions/bg/remove')).status, 200);
    assert.deepEqual(app.calls, [['stop', 'abcd1234'], ['rm', 'abcd1234']]);
    assert.deepEqual(app.ended, ['bg', 'bg']);
  } finally {
    await app.close();
  }
});

test('knownProjects: pastas das sessões deste Mac, worktree vira o repositório', () => {
  const projects = knownProjects([
    { cwd: '/u/dev/site/.claude/worktrees/x' },
    { cwd: '/u/dev/site' },
    { cwd: '/u/dev/api' },
    { cwd: '/srv/x', machine: 'vps' },
  ]);
  assert.deepEqual(projects, [{ path: '/u/dev/api', name: 'api' }, { path: '/u/dev/site', name: 'site' }]);
});

/** Deixa o hook do chat de s1 esperando, para a próxima mensagem ser entregue. */
async function listening(app) {
  const waiting = fetch(`${app.base}/chat/wait`, { method: 'POST', body: JSON.stringify({ session_id: 's1', hook_event_name: 'Stop' }) });
  await new Promise((resolve) => { setTimeout(resolve, 100); });
  return waiting;
}

test('pedido com "vigiar" liga a vigia da sessão; sem "vigiar" não liga', async () => {
  const app = await setup({ features: { chat: true } });
  try {
    let waiting = listening(app);
    const plain = await app.post('/api/sessions/s1/message', { text: 'roda os testes' });
    assert.equal(plain.status, 200);
    assert.equal(plain.body.data.watched, false);
    assert.equal(app.vigia.isWatched('s1'), false);
    await waiting;
    waiting = listening(app);
    const watched = await app.post('/api/sessions/s1/message', { text: 'agora o build', vigiar: true });
    assert.equal(watched.status, 200);
    assert.equal(watched.body.data.watched, true);
    assert.equal(app.vigia.isWatched('s1'), true);
    await waiting;
  } finally {
    await app.close();
  }
});

test('pedido com "vigiar" que não chega à sessão não liga a vigia', async () => {
  const app = await setup({ features: { chat: true } });
  try {
    assert.equal((await app.post('/api/sessions/s1/message', { text: 'oi', vigiar: true })).status, 409);
    assert.equal((await app.post('/api/sessions/s1/message', { text: '', vigiar: true })).status, 400);
    assert.equal(app.vigia.isWatched('s1'), false);
  } finally {
    await app.close();
  }
});

test('sessão nova com "vigiar" liga a vigia quando o id dela aparece', async () => {
  const agents = [{ sessionId: 'nova-1', kind: 'background', jobId: 'abcd1234' }];
  const app = await setup({ features: { launch: true }, refreshes: [[]], agents });
  try {
    const opened = await app.post('/api/sessions', { cwd: PROJECT, prompt: 'x', vigiar: true });
    assert.equal(opened.status, 200);
    assert.equal(app.vigia.isWatched('nova-1'), false);
    await app.linkDone();
    assert.equal(app.vigia.isWatched('nova-1'), true);
    assert.equal(app.panel.jobOf('nova-1'), 'abcd1234');
  } finally {
    await app.close();
  }
});

test('sessão nova sem "vigiar" não é vigiada; se o id nunca aparece, nada fica vigiado', async () => {
  const agents = [{ sessionId: 'nova-1', kind: 'background', jobId: 'abcd1234' }];
  const plain = await setup({ features: { launch: true }, agents });
  try {
    assert.equal((await plain.post('/api/sessions', { cwd: PROJECT, prompt: 'x' })).status, 200);
    await plain.linkDone();
    assert.equal(plain.panel.jobOf('nova-1'), 'abcd1234');
    assert.equal(plain.vigia.isWatched('nova-1'), false);
  } finally {
    await plain.close();
  }
  const lost = await setup({ features: { launch: true }, agents: [{ sessionId: 'outra', kind: 'background', jobId: 'ffff0000' }] });
  try {
    assert.equal((await lost.post('/api/sessions', { cwd: PROJECT, prompt: 'x', vigiar: true })).status, 200);
    await lost.linkDone();
    assert.equal(lost.vigia.isWatched('outra'), false);
    assert.equal(lost.panel.jobOf('outra'), null);
  } finally {
    await lost.close();
  }
});
