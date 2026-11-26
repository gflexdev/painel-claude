import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// O diretório de dados é lido ao importar config.js: aponta para uma pasta de teste antes.
const dir = mkdtempSync(join(tmpdir(), 'painel-token-relogio-'));
process.env.PAINEL_DIR = dir;
const { ensureWatchToken, revokeWatchToken, CONFIG_FILE } = await import('../src/config.js');

test('token do relógio: gera uma vez, guarda 0600, não mexe no resto e revoga', () => {
  writeFileSync(CONFIG_FILE, `${JSON.stringify({ token: 'das-telas', port: 7777 })}\n`, { mode: 0o600 });

  const first = ensureWatchToken();
  assert.equal(first.created, true);
  assert.ok(first.token.length >= 32);
  const again = ensureWatchToken();
  assert.deepEqual(again, { token: first.token, created: false });

  const stored = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  assert.equal(stored.token, 'das-telas');
  assert.equal(stored.port, 7777);
  assert.equal(stored.watch.token, first.token);
  assert.equal(statSync(CONFIG_FILE).mode & 0o777, 0o600);

  assert.equal(revokeWatchToken(), true);
  assert.equal(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')).watch, undefined);
  assert.equal(revokeWatchToken(), false);

  const next = ensureWatchToken();
  assert.notEqual(next.token, first.token, 'depois de revogar, sai um token novo');
});

test('constantes do relógio: só https, sem ?t=, e o texto vira string Monkey C escapada', async () => {
  const { checkUrl, secretsSource } = await import('../scripts/relogio.js');
  assert.equal(checkUrl('https://mac.rede.ts.net/'), 'https://mac.rede.ts.net');
  assert.equal(checkUrl('https://mac.rede.ts.net:8443'), 'https://mac.rede.ts.net:8443');
  assert.throws(() => checkUrl('http://mac.rede.ts.net'), /https/);
  assert.throws(() => checkUrl('https://mac.rede.ts.net/?t=abc'), /sem \?t=/);
  const source = secretsSource({ url: 'https://x', token: 'a"b\\c' });
  assert.match(source, /module Segredos/);
  assert.match(source, /const TOKEN as String = "a\\"b\\\\c";/);
});
