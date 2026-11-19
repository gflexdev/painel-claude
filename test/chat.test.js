import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanMessage, createChat, wrapMessage } from '../src/chat.js';

const HOOK = fileURLToPath(new URL('../hooks/esperar-mensagem.sh', import.meta.url));

test('cleanMessage: só texto não vazio e até 4000 caracteres', () => {
  assert.equal(cleanMessage('  oi  '), 'oi');
  assert.equal(cleanMessage('   '), null);
  assert.equal(cleanMessage(42), null);
  assert.equal(cleanMessage('x'.repeat(4001)), null);
  assert.equal(cleanMessage('x'.repeat(4000)).length, 4000);
});

test('wrapMessage diz com honestidade de onde veio e não pede para pular permissões', () => {
  const text = wrapMessage(['roda os testes']);
  assert.match(text, /digitou no Painel Claude/);
  assert.match(text, /fora desta janela/);
  assert.match(text, /permissão/);
  assert.ok(text.endsWith('roda os testes'));
  assert.doesNotMatch(text, /Trate como um pedido novo|consentimento|autoriza|bypass|ignore/i);
  assert.match(wrapMessage(['a', 'b']), /^2 mensagens/);
});

test('ajuste desligado: wait sai na hora sem mensagem e send recusa', async () => {
  const chat = createChat({ enabled: false });
  assert.equal(await chat.wait('s1'), null);
  assert.equal(chat.send('s1', 'oi'), 'off');
  assert.equal(chat.stateOf('s1'), null);
});

test('sessão que nunca pendurou o hook não aceita mensagem', () => {
  const chat = createChat({ enabled: true });
  assert.equal(chat.send('s1', 'oi'), 'unavailable');
  assert.deepEqual(chat.historyOf('s1'), []);
});

test('com o hook esperando, a mensagem é entregue na hora e fica no histórico', async () => {
  const chat = createChat({ enabled: true, now: () => 123 });
  const waiting = chat.wait('s1');
  assert.equal(chat.stateOf('s1'), 'ready');
  assert.equal(chat.send('s1', 'oi'), 'delivered');
  assert.deepEqual(await waiting, ['oi']);
  assert.deepEqual(chat.historyOf('s1'), [{ id: 1, text: 'oi', at: 123, status: 'delivered' }]);
  assert.equal(chat.stateOf('s1'), 'busy');
});

test('com a sessão ocupada, as mensagens esperam na fila (pendentes) e saem juntas no próximo hook', async () => {
  const chat = createChat({ enabled: true });
  const first = chat.wait('s1');
  chat.send('s1', 'um');
  await first;
  assert.equal(chat.send('s1', 'dois'), 'queued');
  assert.equal(chat.send('s1', 'três'), 'queued');
  assert.deepEqual(chat.historyOf('s1').map((m) => m.status), ['delivered', 'pending', 'pending']);
  assert.deepEqual(await chat.wait('s1'), ['dois', 'três']);
  assert.deepEqual(chat.historyOf('s1').map((m) => m.status), ['delivered', 'delivered', 'delivered']);
});

test('a fila tem limite', async () => {
  const chat = createChat({ enabled: true });
  const first = chat.wait('s1');
  chat.send('s1', 'x');
  await first;
  for (let i = 0; i < 5; i += 1) assert.equal(chat.send('s1', `m${i}`), 'queued');
  assert.equal(chat.send('s1', 'demais'), 'full');
});

test('desligar o ajuste solta os hooks pendurados na hora e descarta a fila', async () => {
  const chat = createChat({ enabled: true });
  const a = chat.wait('a');
  const b = chat.wait('b');
  chat.send('a', 'x');
  await a;
  chat.send('a', 'pendente');
  chat.setEnabled(false);
  assert.equal(await b, null);
  assert.equal(chat.historyOf('a').at(-1).status, 'dropped');
  assert.equal(chat.stateOf('b'), null);
});

test('um hook novo da mesma sessão toma o lugar; conexão que caiu sai sem mensagem', async () => {
  const chat = createChat({ enabled: true });
  const old = chat.wait('s1');
  const controller = new AbortController();
  const fresh = chat.wait('s1', controller.signal);
  assert.equal(await old, null);
  controller.abort();
  assert.equal(await fresh, null);
  assert.equal(chat.stateOf('s1'), 'busy');
});

/** Servidor falso de /chat/wait para rodar o hook de verdade. */
async function withFakePanel(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  try {
    return await fn(server.address().port);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => { server.close(resolve); });
  }
}

function runHook(port, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('sh', [HOOK], { env: { ...process.env, PAINEL_PORT: String(port), ...env } });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('close', (code) => resolve({ code, stderr, stdout }));
    child.stdin.end(JSON.stringify({ session_id: 's1', hook_event_name: 'Stop' }));
  });
}

test('hook: com mensagem, escreve o texto no stderr e sai com 2', async () => {
  await withFakePanel((req, res) => {
    req.resume();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mensagem do painel: oi');
  }, async (port) => {
    const result = await runHook(port);
    assert.equal(result.code, 2);
    assert.equal(result.stderr, 'Mensagem do painel: oi');
    assert.equal(result.stdout, '');
  });
});

test('hook: 204 (ajuste desligado ou sem mensagem) sai com 0 na hora e calado', async () => {
  await withFakePanel((req, res) => { req.resume(); res.writeHead(204); res.end(); }, async (port) => {
    const started = Date.now();
    const result = await runHook(port);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.ok(Date.now() - started < 3000);
  });
});

test('hook: com o painel fora do ar, desiste depois de algumas tentativas', async () => {
  // Porta sem ninguém ouvindo: cada tentativa falha na hora.
  const result = await runHook(1, { PAINEL_CHAT_RETRY: '0', PAINEL_CHAT_TENTATIVAS: '3' });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
});
