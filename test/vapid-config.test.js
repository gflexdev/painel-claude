import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isVapidPair } from '../src/webpush.js';

// O diretório de dados é lido ao importar config.js: aponta para uma pasta de teste antes.
const dir = mkdtempSync(join(tmpdir(), 'painel-vapid-'));
process.env.PAINEL_DIR = dir;
const { ensureVapidKeys, CONFIG_FILE } = await import('../src/config.js');

test('chaves VAPID: geradas uma vez, guardadas 0600 sem mexer no resto, refeitas se estragarem', () => {
  writeFileSync(CONFIG_FILE, `${JSON.stringify({ token: 'das-telas', vapid: { subject: 'mailto:eu@exemplo.invalid' } })}\n`, { mode: 0o600 });

  const first = ensureVapidKeys();
  assert.ok(isVapidPair(first));
  assert.deepEqual(ensureVapidKeys(), first, 'a segunda vez lê as mesmas');

  const stored = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  assert.equal(stored.token, 'das-telas');
  assert.equal(stored.vapid.subject, 'mailto:eu@exemplo.invalid');
  assert.equal(stored.vapid.publicKey, first.publicKey);
  assert.equal(statSync(CONFIG_FILE).mode & 0o777, 0o600);

  writeFileSync(CONFIG_FILE, `${JSON.stringify({ ...stored, vapid: { ...stored.vapid, privateKey: 'estragada' } })}\n`, { mode: 0o600 });
  const next = ensureVapidKeys();
  assert.ok(isVapidPair(next));
  assert.notEqual(next.publicKey, first.publicKey);
});
