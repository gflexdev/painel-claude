// O lado do aparelho nos testes do Web Push: um aparelho com chaves de verdade e a abertura do corpo (RFC 8291),
// como o navegador faz antes de entregar o Aviso ao service worker. Não é um arquivo de teste (não termina em .test.js).
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';

/** Abre o corpo `aes128gcm` com a chave privada do aparelho. */
export function decrypt(body, uaPrivate, auth) {
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

/** Um aparelho inscrito no FCM: a inscrição que o navegador mandaria e o `open` que lê o que chegou para ele. */
export function pushDevice(name) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    subscription: {
      endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
      keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
    },
    open: (body) => JSON.parse(decrypt(body, ecdh.getPrivateKey(), auth)),
  };
}
