import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remotePlan, withRemoteHooks, withoutRemoteHooks } from '../scripts/vps.js';
import { HOOK_EVENTS, withPainelHooks } from '../scripts/mac.js';

const HOOKS = fileURLToPath(new URL('../hooks/remoto/', import.meta.url));
const TOKEN = 'token-de-teste-dos-hooks-remotos-32c';

function run(script, input, env) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn('sh', [join(HOOKS, script)], { env: { ...process.env, ...env } });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('close', (code) => resolve({ code, stdout, ms: Date.now() - started }));
    child.stdin.end(input);
  });
}

/** Pasta de configuração como a da VPS, apontando para `url`. */
function confDir(url) {
  const dir = mkdtempSync(join(tmpdir(), 'painel-hooks-'));
  writeFileSync(join(dir, 'remoto.conf'), `PAINEL_URL=${url}\n`);
  writeFileSync(join(dir, 'remoto.header'), `Authorization: Bearer ${TOKEN}\n`);
  return dir;
}

async function fakePainel(reply) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const request = { path: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
      requests.push(request);
      const [status, body] = reply(request);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { requests, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const waitFor = async (check) => {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise((r) => setTimeout(r, 30));
};

test('evento.sh manda o evento com o token e, quando pedido, o fim do transcript', async (t) => {
  const painel = await fakePainel((r) => (r.path === '/remote/hook' ? [200, '{"success":true,"data":{"transcript":true}}'] : [200, '{}']));
  const dir = confDir(painel.url);
  const projects = join(dir, 'projects');
  mkdirSync(join(projects, 'p'), { recursive: true });
  const transcript = join(projects, 'p', 's1.jsonl');
  writeFileSync(transcript, '{"type":"custom-title","customTitle":"T"}\n{"turnOrigin":"human"}\n{"turnOrigin":"human"}\n');
  t.after(() => { painel.close(); rmSync(dir, { recursive: true, force: true }); });

  const event = JSON.stringify({ session_id: 's1', transcript_path: transcript, hook_event_name: 'Stop' });
  const result = await run('evento.sh', event, { PAINEL_REMOTO_DIR: dir, PAINEL_PROJETOS_DIR: projects });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '', 'hook de evento não imprime nada para o Claude');
  await waitFor(() => painel.requests.length >= 2);
  const [hook, push] = painel.requests;
  assert.equal(hook.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(JSON.parse(hook.body).session_id, 's1');
  assert.equal(push.path, '/remote/transcript');
  assert.equal(push.headers['x-painel-session'], 's1');
  assert.equal(push.headers['x-painel-turns'], '2');
  assert.match(push.body, /"customTitle":"T"/);
});

test('transcript.sh não lê arquivo fora de ~/.claude/projects', async (t) => {
  const painel = await fakePainel(() => [200, '{}']);
  const dir = confDir(painel.url);
  t.after(() => { painel.close(); rmSync(dir, { recursive: true, force: true }); });
  const projects = join(dir, 'projects');
  const result = await run('transcript.sh', '', { PAINEL_REMOTO_DIR: dir, PAINEL_PROJETOS_DIR: projects });
  assert.equal(result.code, 0);
  const outside = spawn('sh', [join(HOOKS, 'transcript.sh'), 's1', join(dir, 'remoto.header')], {
    env: { ...process.env, PAINEL_REMOTO_DIR: dir, PAINEL_PROJETOS_DIR: projects },
  });
  await new Promise((r) => outside.on('close', r));
  const traversal = spawn('sh', [join(HOOKS, 'transcript.sh'), 's1', `${projects}/../remoto.jsonl`], {
    env: { ...process.env, PAINEL_REMOTO_DIR: dir, PAINEL_PROJETOS_DIR: projects },
  });
  await new Promise((r) => traversal.on('close', r));
  assert.equal(painel.requests.length, 0);
});

test('Mac fora do ar: evento.sh e permissao.sh saem com 0 em ~1 s, sem saída', async (t) => {
  // Porta fechada (recusa na hora) e endereço que não responde (espera o connect-timeout de 1 s).
  for (const url of ['http://127.0.0.1:9', 'http://10.255.255.1:7777']) {
    const dir = confDir(url);
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    for (const script of ['evento.sh', 'permissao.sh']) {
      const result = await run(script, '{"session_id":"s1","hook_event_name":"PermissionRequest"}', { PAINEL_REMOTO_DIR: dir });
      assert.equal(result.code, 0, `${script} em ${url}`);
      assert.equal(result.stdout, '', `${script} em ${url}`);
      assert.ok(result.ms < 2500, `${script} em ${url} levou ${result.ms} ms`);
    }
  }
});

test('sem configuração, os hooks remotos não fazem nada', async () => {
  const result = await run('evento.sh', '{}', { PAINEL_REMOTO_DIR: join(tmpdir(), 'nao-existe-painel') });
  assert.equal(result.code, 0);
  assert.ok(result.ms < 1000);
});

test('permissao.sh só repassa a resposta 200; erro do painel não vira saída', async (t) => {
  const decision = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}';
  const ok = await fakePainel(() => [200, decision]);
  const refused = await fakePainel(() => [401, '{"success":false,"error":"token inválido"}']);
  const okDir = confDir(ok.url);
  const refusedDir = confDir(refused.url);
  t.after(() => {
    ok.close(); refused.close();
    rmSync(okDir, { recursive: true, force: true }); rmSync(refusedDir, { recursive: true, force: true });
  });
  const input = '{"session_id":"s1","hook_event_name":"PermissionRequest"}';
  assert.equal((await run('permissao.sh', input, { PAINEL_REMOTO_DIR: okDir })).stdout, decision);
  const denied = await run('permissao.sh', input, { PAINEL_REMOTO_DIR: refusedDir });
  assert.equal(denied.code, 0);
  assert.equal(denied.stdout, '');
});

const other = { hooks: [{ type: 'command', command: 'bash "$HOME/.claude/hooks/outro.sh"' }] };

test('instalação na VPS usa os caminhos de lá e mantém os hooks existentes', () => {
  const before = { model: 'x', hooks: { SessionStart: [other], UserPromptSubmit: [{ hooks: [] }] } };
  const after = withRemoteHooks(before, '/home/dev');
  assert.deepEqual(Object.keys(after.hooks).sort(), [...HOOK_EVENTS].sort());
  assert.equal(after.hooks.SessionStart[0], other);
  assert.equal(after.hooks.SessionStart[1].hooks[0].command, '/home/dev/.local/share/painel-claude/hooks/evento.sh');
  assert.equal(after.hooks.PermissionRequest[0].hooks[0].command, remotePlan('/home/dev').PermissionRequest.command);
  assert.equal(after.hooks.PermissionRequest[0].hooks[0].timeout, 600);
  assert.deepEqual(withRemoteHooks(after, '/home/dev'), after, 'idempotente');
  assert.equal(before.hooks.SessionStart.length, 1, 'não altera o original');
});

test('desinstalar na VPS tira só os hooks remotos do painel', () => {
  const installed = withRemoteHooks({ hooks: { SessionStart: [other] } }, '/home/dev');
  assert.deepEqual(withoutRemoteHooks(installed).hooks, { SessionStart: [other] });
  const withMac = withPainelHooks({});
  assert.deepEqual(withoutRemoteHooks(withMac), withMac, 'não mexe nos hooks do Mac');
});
