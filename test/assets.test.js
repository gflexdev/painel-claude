import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assetVersion } from '../src/assets.js';

test('a versão da interface muda quando um arquivo muda e é estável sem mudança', () => {
  const dir = mkdtempSync(join(tmpdir(), 'painel-assets-'));
  writeFileSync(join(dir, 'app.js'), 'a');
  writeFileSync(join(dir, 'index.html'), '<html>');
  const first = assetVersion(dir);
  assert.equal(assetVersion(dir), first);
  writeFileSync(join(dir, 'app.js'), 'b');
  assert.notEqual(assetVersion(dir), first);
  assert.match(first, /^[0-9a-f]{12}$/);
});
