import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRemoteGate, createRemoteRoutes, summarizeTranscript } from '../src/remote.js';
import { createStore } from '../src/store.js';
import { createPermissions } from '../src/permissions.js';
import { isTailnetDirect } from '../src/network.js';
import { sendJson } from '../src/http.js';

const VPS_IP = '100.101.102.103';
const TOKEN = 'token-da-vps-de-teste-com-32-caracteres';
const OTHER_TOKEN = 'token-de-outra-maquina-com-32-chars';
const remotes = { 'vps-dev': { token: TOKEN, address: VPS_IP }, outra: { token: OTHER_TOKEN } };
const bearer = (token) => ({ authorization: `Bearer ${token}` });

test('só aceita conexão direta da tailnet', () => {
  assert.equal(isTailnetDirect(VPS_IP, {}), true);
  assert.equal(isTailnetDirect(`::ffff:${VPS_IP}`, {}), true);
  assert.equal(isTailnetDirect('fd7a:115c:a1e0::1234', {}), true);
  assert.equal(isTailnetDirect('127.0.0.1', {}), false, 'o tailscale serve chega como loopback');
  assert.equal(isTailnetDirect('192.168.0.10', {}), false);
  assert.equal(isTailnetDirect('100.128.0.1', {}), false, 'fora de 100.64.0.0/10');
  assert.equal(isTailnetDirect(VPS_IP, { 'x-forwarded-for': '1.2.3.4' }), false);
});

test('token certo identifica a máquina pelo token, não pelo que ela diz', () => {
  const gate = createRemoteGate(remotes);
  assert.deepEqual(gate.check(VPS_IP, bearer(TOKEN)), { status: 200, machine: 'vps-dev' });
  assert.deepEqual(gate.check('100.70.1.2', bearer(OTHER_TOKEN)), { status: 200, machine: 'outra' });
});

test('token errado, ausente ou o das telas é recusado com 401', () => {
  const gate = createRemoteGate(remotes);
  assert.equal(gate.check(VPS_IP, bearer('x'.repeat(39))).status, 401);
  assert.equal(gate.check(VPS_IP, {}).status, 401);
  assert.equal(gate.check(VPS_IP, { authorization: TOKEN }).status, 401, 'sem "Bearer " não vale');
  assert.equal(gate.check(VPS_IP, bearer(`${TOKEN}x`)).status, 401);
});

test('origem errada: fora da tailnet, por proxy ou de outro IP da máquina presa', () => {
  const gate = createRemoteGate(remotes);
  assert.equal(gate.check('127.0.0.1', bearer(TOKEN)).status, 403);
  assert.equal(gate.check('8.8.8.8', bearer(TOKEN)).status, 403);
  assert.equal(gate.check(VPS_IP, { ...bearer(TOKEN), 'tailscale-user-login': 'x@y' }).status, 403);
  assert.equal(gate.check('100.64.10.110', bearer(TOKEN)).status, 403, 'token da vps vindo de outro aparelho');
});

test('máquina com token curto ou nome inválido é ignorada', () => {
  const gate = createRemoteGate({ curta: { token: 'abc' }, 'Nome Ruim': { token: TOKEN } });
  assert.deepEqual(gate.names, []);
  assert.equal(gate.check(VPS_IP, bearer('abc')).status, 401);
});

test('summarizeTranscript tira meta e resumo do fim do arquivo', () => {
  const text = [
    '{"type":"custom-title","customTitle":"Deploy na VPS"}',
    '{"type":"assistant", cortada',
    '{"type":"user","entrypoint":"sdk-cli","message":{"role":"user","content":"sobe o build"}}',
    '{"type":"assistant","message":{"id":"m1","model":"claude-opus-5-5","usage":{"input_tokens":10,"output_tokens":5},"content":[{"type":"text","text":"**Pronto.**"}]}}',
  ].join('\n');
  const { meta, summary } = summarizeTranscript(text, 3);
  assert.equal(meta.title, 'Deploy na VPS');
  assert.equal(meta.model, 'opus 5.5');
  assert.equal(meta.contextTokens, 15);
  assert.equal(meta.turns, 3);
  assert.equal(summary.lastPrompt, 'sobe o build');
  assert.equal(summary.answer, '**Pronto.**');
});

/** Servidor de teste com as rotas remotas; `from` faz de conta que o pedido veio daquele IP. */
async function startRemote({ from = VPS_IP, limits } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'painel-remoto-'));
  const store = createStore({ stateFile: join(dir, 'state.json'), eventsLog: join(dir, 'e.log'), debug: false, onError: () => {} });
  const permissions = createPermissions({ timeoutMs: 5000, onChange: () => {} });
  const real = createRemoteGate(remotes);
  const gate = { check: (_addr, headers) => real.check(from, headers) };
  const routes = createRemoteRoutes({ gate, store, permissions, ...(limits && { limits }) });
  const server = createServer((req, res) => {
    routes.handle(req, res, new URL(req.url, 'http://x').pathname)
      .then((handled) => { if (!handled) sendJson(res, 404, {}); })
      .catch((error) => { if (!res.headersSent) sendJson(res, error.status ?? 500, { success: false, error: error.message }); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = bearer(TOKEN)) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const close = () => {
    server.closeAllConnections();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { store, permissions, post, close };
}

const event = (hook_event_name, extra = {}) => ({
  session_id: 'vps-s1',
  cwd: '/home/dev/projects/projeto-b',
  transcript_path: '/home/dev/.claude/projects/p/vps-s1.jsonl',
  hook_event_name,
  ...extra,
});

test('evento da VPS entra com a origem marcada e pede o transcript', async (t) => {
  const remote = await startRemote();
  t.after(remote.close);
  const res = await remote.post('/remote/hook', event('UserPromptSubmit', { prompt: 'roda os testes' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, data: { transcript: true } });
  const [view] = remote.store.view().sessions;
  assert.equal(view.machine, 'vps-dev');
  assert.equal(view.project, 'projeto-b');
  assert.equal(remote.store.get('vps-s1').transcriptPath, null, 'caminho da VPS não é lido no Mac');
});

test('token errado não altera nada (401)', async (t) => {
  const remote = await startRemote();
  t.after(remote.close);
  const res = await remote.post('/remote/hook', event('SessionStart'), bearer('errado'.repeat(6)));
  assert.equal(res.status, 401);
  assert.equal(remote.store.view().sessions.length, 0);
});

test('pedido que não veio da tailnet é recusado (403)', async (t) => {
  const remote = await startRemote({ from: '127.0.0.1' });
  t.after(remote.close);
  const res = await remote.post('/remote/hook', event('SessionStart'));
  assert.equal(res.status, 403);
  assert.equal(remote.store.view().sessions.length, 0);
});

test('corpo grande demais é recusado (413) sem criar sessão', async (t) => {
  const remote = await startRemote({ limits: { hook: 1024, transcript: 2048 } });
  t.after(remote.close);
  const big = await remote.post('/remote/hook', event('PreToolUse', { tool_name: 'Write', tool_input: { content: 'x'.repeat(4000) } }));
  assert.equal(big.status, 413);
  assert.equal(remote.store.view().sessions.length, 0);
  await remote.post('/remote/hook', event('SessionStart'));
  const bigTranscript = await remote.post('/remote/transcript', 'y'.repeat(5000), { ...bearer(TOKEN), 'x-painel-session': 'vps-s1' });
  assert.equal(bigTranscript.status, 413);
});

test('evento sem session_id válido ou JSON inválido dá 400', async (t) => {
  const remote = await startRemote();
  t.after(remote.close);
  assert.equal((await remote.post('/remote/hook', event('SessionStart', { session_id: '../x' }))).status, 400);
  assert.equal((await remote.post('/remote/hook', '{não é json')).status, 400);
});

test('máquina não mexe em sessão de outra (409) nem em sessão do Mac', async (t) => {
  const remote = await startRemote();
  t.after(remote.close);
  remote.store.ingest(event('SessionStart', { session_id: 'mac-s1' }));
  const res = await remote.post('/remote/hook', event('Stop', { session_id: 'mac-s1' }));
  assert.equal(res.status, 409);
  assert.equal(remote.store.get('mac-s1').machine, undefined);
  const transcript = await remote.post('/remote/transcript', '{}', { ...bearer(TOKEN), 'x-painel-session': 'mac-s1' });
  assert.equal(transcript.status, 404);
});

test('transcript da VPS vira título, modelo, turnos e resumo', async (t) => {
  const remote = await startRemote();
  t.after(remote.close);
  await remote.post('/remote/hook', event('Stop'));
  const jsonl = [
    '{"type":"custom-title","customTitle":"Testes do projeto-b"}',
    '{"type":"user","message":{"role":"user","content":"roda os testes"}}',
    '{"type":"assistant","message":{"id":"m1","model":"claude-sonnet-5-5","usage":{"input_tokens":100},"content":[{"type":"text","text":"Todos **passaram**."}]}}',
  ].join('\n');
  const res = await remote.post('/remote/transcript', jsonl, { ...bearer(TOKEN), 'x-painel-session': 'vps-s1', 'x-painel-turns': '4' });
  assert.equal(res.status, 200);
  const [view] = remote.store.view().sessions;
  assert.equal(view.name, 'Testes do projeto-b');
  assert.equal(view.model, 'sonnet 5.5');
  assert.equal(view.turns, 4);
  assert.equal(remote.store.remoteSummary('vps-s1').answer, 'Todos **passaram**.');
  const again = await (await remote.post('/remote/hook', event('PreToolUse', { tool_name: 'Bash', tool_input: {} }))).json();
  assert.equal(again.data.transcript, false, 'com resumo recente não pede de novo a cada ferramenta');
});

test('transcript de outra máquina para sessão da vps é recusado', async (t) => {
  const remote = await startRemote({ from: '100.70.1.2' });
  t.after(remote.close);
  remote.store.ingest(event('SessionStart'), { machine: 'vps-dev' });
  const res = await remote.post('/remote/transcript', '{}', { ...bearer(OTHER_TOKEN), 'x-painel-session': 'vps-s1' });
  assert.equal(res.status, 404);
});

test('permissão da VPS espera a decisão do painel e devolve a saída do hook', async (t) => {
  const remote = await startRemote();
  t.after(remote.close);
  const answer = remote.post('/remote/permission', event('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'touch /tmp/x' } }));
  let pending = [];
  for (let i = 0; i < 50 && !pending.length; i += 1) {
    await new Promise((r) => setTimeout(r, 10));
    pending = remote.permissions.forSession('vps-s1');
  }
  assert.equal(pending[0].preview, 'touch /tmp/x');
  assert.equal(remote.store.view().sessions[0].status, 'waiting');
  remote.permissions.decide(pending[0].id, 'allow');
  const res = await answer;
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
});
