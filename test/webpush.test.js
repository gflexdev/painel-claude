import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from 'node:crypto';
import {
  encryptPayload, fromB64url, generateVapidKeys, isPublicKey, isVapidPair, MAX_PAYLOAD_BYTES, vapidAuthorization, vapidJwt,
} from '../src/webpush.js';

// RFC 8291, seção 5 e apêndice A.
const RFC = Object.freeze({
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
});

/** O lado do aparelho (RFC 8291): abre o corpo com a chave privada dele. */
function decrypt(body, uaPrivate, auth) {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idLength);
  const record = body.subarray(21 + idLength);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', ecdh.computeSecret(asPublic), auth, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(record.subarray(-16));
  const padded = Buffer.concat([decipher.update(record.subarray(0, -16)), decipher.final()]);
  assert.equal(padded.at(-1), 2, 'o registro termina com a marca de último registro');
  return padded.subarray(0, -1).toString('utf8');
}

test('criptografia confere byte a byte com o exemplo da RFC 8291', () => {
  const body = encryptPayload(RFC.plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth }, {
    salt: fromB64url(RFC.salt),
    serverPrivateKey: fromB64url(RFC.asPrivate),
  });
  assert.equal(body.toString('base64url'), RFC.body);
  assert.equal(body.subarray(21, 86).toString('base64url'), RFC.asPublic, 'o cabeçalho leva a chave pública do painel');
});

test('criptografia com chave e salt aleatórios: o aparelho abre, e cada envio sai diferente', () => {
  const keys = { p256dh: RFC.uaPublic, auth: RFC.auth };
  const payload = JSON.stringify({ status: 'test' });
  const first = encryptPayload(payload, keys);
  const second = encryptPayload(payload, keys);
  assert.notDeepEqual(first, second);
  assert.equal(decrypt(first, fromB64url(RFC.uaPrivate), fromB64url(RFC.auth)), payload);
  assert.equal(decrypt(second, fromB64url(RFC.uaPrivate), fromB64url(RFC.auth)), payload);
});

test('criptografia recusa chave do aparelho inválida e payload grande demais', () => {
  assert.throws(() => encryptPayload('x', { p256dh: 'abc', auth: RFC.auth }), /chave pública/);
  assert.throws(() => encryptPayload('x', { p256dh: RFC.uaPublic, auth: 'curto' }), /autenticação/);
  assert.throws(() => encryptPayload('x'.repeat(MAX_PAYLOAD_BYTES + 1), { p256dh: RFC.uaPublic, auth: RFC.auth }), /grande demais/);
  assert.doesNotThrow(() => encryptPayload('x'.repeat(MAX_PAYLOAD_BYTES), { p256dh: RFC.uaPublic, auth: RFC.auth }));
});

test('chaves VAPID: o par gerado confere e a pública é um ponto P-256', () => {
  const keys = generateVapidKeys();
  assert.equal(fromB64url(keys.publicKey).length, 65);
  assert.equal(fromB64url(keys.privateKey).length, 32);
  assert.ok(isPublicKey(keys.publicKey));
  assert.ok(isVapidPair(keys));
  assert.equal(isVapidPair({ ...keys, publicKey: generateVapidKeys().publicKey }), false);
  assert.equal(isVapidPair(null), false);
  assert.equal(isPublicKey(`${keys.publicKey.slice(0, -2)}AA`), false, 'ponto fora da curva');
});

test('JWT VAPID: ES256 verificado com a chave pública, aud na origem do serviço e exp em até 24 h', () => {
  const keys = generateVapidKeys();
  const now = Date.UTC(2026, 10, 26, 12);
  const jwt = vapidJwt({ audience: 'https://fcm.googleapis.com', subject: 'https://exemplo.invalid', keys, now });
  const [header, claims, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(fromB64url(header)), { typ: 'JWT', alg: 'ES256' });
  const parsed = JSON.parse(fromB64url(claims));
  assert.equal(parsed.aud, 'https://fcm.googleapis.com');
  assert.equal(parsed.sub, 'https://exemplo.invalid');
  assert.ok(parsed.exp > now / 1000 && parsed.exp <= now / 1000 + 24 * 3600);

  const raw = fromB64url(keys.publicKey);
  const publicKey = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') },
    format: 'jwk',
  });
  const signed = Buffer.from(`${header}.${claims}`);
  const sig = fromB64url(signature);
  assert.equal(sig.length, 64, 'assinatura no formato do JWS (r ‖ s), não DER');
  assert.ok(verify('sha256', signed, { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig));
  assert.equal(verify('sha256', Buffer.from(`${header}.x${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig), false);
});

test('Authorization VAPID: t=<jwt>, k=<chave pública>, com aud tirado do endpoint', () => {
  const keys = generateVapidKeys();
  const value = vapidAuthorization({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc:def', subject: 'mailto:x@exemplo.invalid', keys });
  const match = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(value);
  assert.ok(match);
  assert.equal(match[2], keys.publicKey);
  assert.equal(JSON.parse(fromB64url(match[1].split('.')[1])).aud, 'https://fcm.googleapis.com');
});
