import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanSubscription, createPush, createPushRoutes, TEST_AVISO } from '../src/push.js';
import { generateVapidKeys } from '../src/webpush.js';
import { sendJson } from '../src/http.js';

const VAPID = generateVapidKeys();
const TOKEN = 'token-das-telas-de-teste';

/** Um aparelho de mentira: endpoint no FCM e chaves de verdade (a criptografia precisa de um ponto na curva). */
function device(name) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
}

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'painel-avisos-')), 'aparelhos.json');

/** Transporte falso: anota cada envio e responde o status escolhido por endpoint (200 se não disser). */
function fakeTransport(statusByName = {}) {
  const calls = [];
  const transport = async (endpoint, req) => {
    calls.push({ endpoint, ...req });
    const status = statusByName[endpoint.split('/').at(-1)] ?? 200;
    if (status instanceof Error) throw status;
    return { status };
  };
  return { transport, calls };
}

test('inscrição: só serviço de push conhecido, https, chave P-256 e auth de 16 bytes', () => {
  const ok = device('a');
  assert.deepEqual(cleanSubscription({ ...ok, expirationTime: null }), ok);
  assert.ok(cleanSubscription({ ...ok, endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/x' }));
  assert.ok(cleanSubscription({ ...ok, endpoint: 'https://web.push.apple.com/QGx' }));
  assert.equal(cleanSubscription({ ...ok, endpoint: 'http://fcm.googleapis.com/fcm/send/a' }), null);
  assert.equal(cleanSubscription({ ...ok, endpoint: 'https://127.0.0.1/fcm/send/a' }), null);
  assert.equal(cleanSubscription({ ...ok, endpoint: 'https://fcm.googleapis.com.mal.example/x' }), null);
  assert.equal(cleanSubscription({ ...ok, endpoint: 'https://fcm.googleapis.com:8443/x' }), null);
  assert.equal(cleanSubscription({ ...ok, keys: { ...ok.keys, p256dh: 'abc' } }), null);
  assert.equal(cleanSubscription({ ...ok, keys: { ...ok.keys, auth: 'AAAA' } }), null);
  assert.equal(cleanSubscription(null), null);
});

test('inscrições ficam em disco (0600), sem duplicar, e voltam ao reabrir', () => {
  const file = tempFile();
  const push = createPush({ file, vapid: VAPID });
  const a = device('a');
  assert.equal(push.subscribe(a), true);
  assert.equal(push.subscribe(a), true);
  assert.equal(push.subscribe(device('b')), true);
  assert.equal(push.subscribe({ endpoint: 'https://exemplo.invalid/x', keys: a.keys }), false);
  assert.equal(push.count(), 2);
  const renewed = { ...a, keys: device('x').keys };
  push.subscribe(renewed);
  assert.equal(push.count(), 2, 'o mesmo endpoint com chaves novas substitui, não duplica');
  assert.equal(statSync(file).mode & 0o777, 0o600);

  const reopened = createPush({ file, vapid: VAPID });
  assert.equal(reopened.count(), 2);
  assert.equal(reopened.unsubscribe(a.endpoint), true);
  assert.equal(reopened.unsubscribe(a.endpoint), false);
  assert.equal(createPush({ file, vapid: VAPID }).count(), 1);
});

test('o mesmo Aviso vai a todas as inscrições, criptografado, com VAPID, urgência alta e TTL curto', async () => {
  const { transport, calls } = fakeTransport();
  const push = createPush({ file: tempFile(), vapid: VAPID, transport });
  ['a', 'b', 'c'].forEach((name) => push.subscribe(device(name)));
  const aviso = { status: 'done', name: 'Deploy do site', project: 'site', sessionId: 's1' };

  const result = await push.send(aviso);

  assert.deepEqual(result, { sent: 3, removed: 0, failed: 0, devices: 3 });
  assert.deepEqual(calls.map((c) => c.endpoint.split('/').at(-1)).sort(), ['a', 'b', 'c']);
  for (const call of calls) {
    assert.equal(call.headers['Content-Encoding'], 'aes128gcm');
    assert.equal(call.headers.Urgency, 'high');
    assert.ok(Number(call.headers.TTL) > 0 && Number(call.headers.TTL) <= 3600);
    assert.match(call.headers.Authorization, new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${VAPID.publicKey}$`));
    assert.equal(call.body.includes(Buffer.from('Deploy do site')), false, 'o corpo vai criptografado');
  }
});

test('404 e 410 apagam a inscrição; outro erro só vai ao log, sem o conteúdo do Aviso nem o endpoint', async () => {
  const file = tempFile();
  const lines = [];
  const { transport } = fakeTransport({ some: 410, sumiu: 404, cheio: 429, caiu: new Error('getaddrinfo ENOTFOUND') });
  const push = createPush({ file, vapid: VAPID, transport, log: (line) => lines.push(line) });
  ['ok', 'some', 'sumiu', 'cheio', 'caiu'].forEach((name) => push.subscribe(device(name)));

  const result = await push.send({ status: 'error', name: 'Segredo do cliente', project: 'projeto-x', sessionId: 's9' });

  assert.deepEqual(result, { sent: 1, removed: 2, failed: 2, devices: 3 });
  const kept = JSON.parse(readFileSync(file, 'utf8')).devices.map((d) => d.endpoint.split('/').at(-1)).sort();
  assert.deepEqual(kept, ['caiu', 'cheio', 'ok']);
  assert.equal(createPush({ file, vapid: VAPID }).count(), 3);
  const log = lines.join('\n');
  assert.match(log, /HTTP 429/);
  assert.match(log, /ENOTFOUND/);
  for (const secret of ['Segredo do cliente', 'projeto-x', 's9', '/fcm/send/']) assert.equal(log.includes(secret), false, secret);
});

test('notify não espera o serviço de push: quem chama segue na hora', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let delivered = 0;
  const transport = async () => {
    await pending;
    delivered += 1;
    return { status: 201 };
  };
  const push = createPush({ file: tempFile(), vapid: VAPID, transport });
  push.subscribe(device('a'));

  assert.equal(push.notify(TEST_AVISO), undefined);
  assert.equal(delivered, 0);
  release();
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.equal(delivered, 1);
});

async function serve(push) {
  const routes = createPushRoutes({ push, hasToken: (req) => req.headers.authorization === `Bearer ${TOKEN}` });
  const server = createServer((req, res) => {
    routes.handle(req, res, new URL(req.url, 'http://x')).then((handled) => { if (!handled) sendJson(res, 404, { success: false }); });
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, token = TOKEN) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  return { call, close: () => new Promise((resolve) => { server.close(resolve); }) };
}

test('rotas: chave pública, inscrever, Aviso de teste e remover, todas com token', async () => {
  const { transport, calls } = fakeTransport();
  const push = createPush({ file: tempFile(), vapid: VAPID, transport });
  const { call, close } = await serve(push);
  try {
    const key = await call('GET', '/api/push/key');
    assert.deepEqual(key.body.data, { publicKey: VAPID.publicKey, devices: 0 });

    const sub = device('celular');
    assert.deepEqual((await call('POST', '/api/push/subscribe', sub)).body.data, { devices: 1 });
    assert.deepEqual((await call('POST', '/api/push/subscribe', sub)).body.data, { devices: 1 });
    assert.equal((await call('POST', '/api/push/subscribe', { endpoint: 'https://exemplo.invalid/x' })).status, 400);
    assert.equal((await call('POST', '/api/push/subscribe', '{nada')).status, 400);

    const sent = await call('POST', '/api/push/test');
    assert.deepEqual(sent.body.data, { sent: 1, removed: 0, failed: 0, devices: 1 });
    assert.equal(calls.length, 1);

    assert.deepEqual((await call('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint })).body.data, { removed: true, devices: 0 });
    assert.equal((await call('POST', '/api/push/unsubscribe', {})).status, 400);
  } finally {
    await close();
  }
});

test('rotas: sem token ou com token errado respondem 401 e não mexem em nada', async () => {
  const { transport, calls } = fakeTransport();
  const push = createPush({ file: tempFile(), vapid: VAPID, transport });
  push.subscribe(device('a'));
  const { call, close } = await serve(push);
  try {
    assert.equal((await call('GET', '/api/push/key', undefined, null)).status, 401);
    assert.equal((await call('POST', '/api/push/subscribe', device('b'), 'errado')).status, 401);
    assert.equal((await call('POST', '/api/push/unsubscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/a' }, null)).status, 401);
    assert.equal((await call('POST', '/api/push/test', undefined, null)).status, 401);
    assert.equal((await call('GET', '/api/push/test')).status, 405);
    assert.equal(push.count(), 1);
    assert.equal(calls.length, 0);
  } finally {
    await close();
  }
});
