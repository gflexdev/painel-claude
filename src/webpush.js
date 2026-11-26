// Web Push sem dependência (ADR 0001), só com node:crypto: as chaves VAPID, o JWT que o serviço de push confere
// (RFC 8292, ES256) e a criptografia do payload para o aparelho (RFC 8291, conteúdo `aes128gcm` da RFC 8188).
// Tudo puro: nada aqui fala com a rede nem com o disco.
import { createECDH, createPrivateKey, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, sign, createCipheriv } from 'node:crypto';

/** Tamanho do registro no cabeçalho `aes128gcm`; o payload inteiro cabe num registro só. */
export const RECORD_SIZE = 4096;
const SALT_BYTES = 16;
const PUBLIC_KEY_BYTES = 65;
const AUTH_BYTES = 16;
const TAG_BYTES = 16;
const HEADER_BYTES = SALT_BYTES + 4 + 1 + PUBLIC_KEY_BYTES;
/** Maior payload que cabe: o registro leva também a marca de fim (1 byte) e a etiqueta do AES-GCM. */
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - HEADER_BYTES - TAG_BYTES - 1;
/** O JWT VAPID vale no máximo 24 h (RFC 8292); 12 h deixa folga para relógio adiantado. */
const JWT_TTL_S = 12 * 60 * 60;

export const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
export const fromB64url = (text) => Buffer.from(String(text ?? ''), 'base64url');

/** Chave pública P-256 sem compressão (0x04 ‖ x ‖ y) → JWK; lança se o ponto não estiver na curva. */
function publicJwk(publicKey) {
  const bytes = Buffer.isBuffer(publicKey) ? publicKey : fromB64url(publicKey);
  if (bytes.length !== PUBLIC_KEY_BYTES || bytes[0] !== 4) throw new Error('chave pública P-256 inválida');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64url(bytes.subarray(1, 33)), y: b64url(bytes.subarray(33)) };
  createPublicKey({ key: jwk, format: 'jwk' });
  return jwk;
}

/** true = é uma chave pública P-256 de verdade (65 bytes, ponto na curva). */
export function isPublicKey(publicKey) {
  try {
    publicJwk(publicKey);
    return true;
  } catch {
    return false;
  }
}

/** Par VAPID novo: { publicKey, privateKey } em base64url (65 e 32 bytes). */
export function generateVapidKeys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { publicKey: b64url(Buffer.concat([Buffer.from([4]), fromB64url(jwk.x), fromB64url(jwk.y)])), privateKey: jwk.d };
}

/** true = o par confere (a privada gera a pública). */
export function isVapidPair(keys) {
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(fromB64url(keys?.privateKey));
    return ecdh.getPublicKey().equals(fromB64url(keys?.publicKey));
  } catch {
    return false;
  }
}

/**
 * JWT VAPID (RFC 8292): ES256, com `aud` = origem do serviço de push, `exp` e `sub` (contato do painel).
 * @param {{ audience: string, subject: string, keys: { publicKey: string, privateKey: string }, now?: number }} opts
 */
export function vapidJwt({ audience, subject, keys, now = Date.now() }) {
  const key = createPrivateKey({ key: { ...publicJwk(keys.publicKey), d: keys.privateKey }, format: 'jwk' });
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + JWT_TTL_S, sub: subject }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${claims}.${b64url(signature)}`;
}

/** Cabeçalho Authorization do envio: `vapid t=<jwt>, k=<chave pública>`. */
export function vapidAuthorization({ endpoint, subject, keys, now }) {
  const jwt = vapidJwt({ audience: new URL(endpoint).origin, subject, keys, now });
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

const hkdf = (ikm, salt, info, length) => Buffer.from(hkdfSync('sha256', ikm, salt, info, length));

/**
 * Criptografa o payload para um aparelho (RFC 8291). Devolve o corpo pronto do POST: cabeçalho `aes128gcm`
 * (salt, tamanho do registro, chave pública efêmera do painel) e o registro criptografado.
 * `salt` e `serverPrivateKey` só são passados nos testes (vetores da RFC); no uso normal saem aleatórios.
 * @param {Buffer | string} payload
 * @param {{ p256dh: string, auth: string }} subscriptionKeys do PushSubscription do navegador (base64url)
 * @param {{ salt?: Buffer, serverPrivateKey?: Buffer }} [opts]
 */
export function encryptPayload(payload, subscriptionKeys, { salt = randomBytes(SALT_BYTES), serverPrivateKey } = {}) {
  const plaintext = Buffer.from(payload);
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error(`payload grande demais (${plaintext.length} bytes)`);
  const uaPublic = fromB64url(subscriptionKeys?.p256dh);
  const authSecret = fromB64url(subscriptionKeys?.auth);
  publicJwk(uaPublic);
  if (authSecret.length !== AUTH_BYTES) throw new Error('segredo de autenticação inválido');
  if (salt.length !== SALT_BYTES) throw new Error('salt inválido');

  const ecdh = createECDH('prime256v1');
  if (serverPrivateKey) ecdh.setPrivateKey(serverPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(ecdhSecret, authSecret, keyInfo, 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 = último registro; sem enchimento além dele.
  const record = Buffer.concat([cipher.update(plaintext), cipher.update(Buffer.from([2])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(HEADER_BYTES - PUBLIC_KEY_BYTES);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, SALT_BYTES);
  header.writeUInt8(PUBLIC_KEY_BYTES, SALT_BYTES + 4);
  return Buffer.concat([header, asPublic, record]);
}
