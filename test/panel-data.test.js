import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_KEPT, createPanelData, loadPanelData } from '../src/panel-data.js';

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'painel-dados-')), 'painel.json');

test('arquivar e desarquivar: grava em disco com modo 600, sem arquivo .tmp sobrando', () => {
  const file = tempFile();
  let changes = 0;
  const panel = createPanelData({ file, onChange: () => { changes += 1; } });
  assert.equal(panel.setArchived('s1', true), true);
  assert.equal(panel.setArchived('s1', true), false, 'arquivar de novo não muda nada');
  assert.equal(panel.isArchived('s1'), true);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).archived, ['s1']);
  assert.throws(() => statSync(`${file}.tmp`));
  assert.equal(panel.setArchived('s1', false), true);
  assert.equal(createPanelData({ file }).isArchived('s1'), false);
  assert.equal(changes, 2);
});

test('ids inválidos não entram, nem pela API nem pelo arquivo', () => {
  const file = tempFile();
  const panel = createPanelData({ file });
  assert.equal(panel.setArchived('../x', true), false);
  assert.equal(panel.adopt('s1', { jobId: '--rm' }), false);
  writeFileSync(file, JSON.stringify({
    jobs: { ok: 'abcd1234', 'a/b': 'abcd1234', bad: '-x' },
    parents: { filha: 'mae', eu: 'eu', 'x y': 'mae' },
    archived: ['s1', 's1', '../fora', 42],
  }));
  assert.deepEqual(loadPanelData(file), { jobs: { ok: 'abcd1234' }, parents: { filha: 'mae' }, archived: ['s1'] });
  assert.deepEqual(loadPanelData(join(tmpdir(), 'nao-existe-painel.json')), { jobs: {}, parents: {}, archived: [] });
});

test('sessão aberta pelo painel guarda o id curto e a mãe; forget apaga tudo dela', () => {
  const panel = createPanelData({ file: tempFile() });
  panel.adopt('filha', { jobId: '7c5dcf5d', parentId: 'mae' });
  panel.adopt('neta', { jobId: 'aaaa1111', parentId: 'filha' });
  assert.equal(panel.jobOf('filha'), '7c5dcf5d');
  assert.equal(panel.parentOf('filha'), 'mae');
  assert.equal(panel.depthOf('neta'), 2);
  panel.setArchived('filha', true);
  panel.forget('filha');
  assert.equal(panel.jobOf('filha'), null);
  assert.equal(panel.parentOf('filha'), null);
  assert.equal(panel.isArchived('filha'), false);
});

test('guarda no máximo 500 de cada', () => {
  const panel = createPanelData({ file: tempFile() });
  for (let i = 0; i < MAX_KEPT + 20; i += 1) panel.setArchived(`s${i}`, true);
  assert.equal(panel.archivedIds().length, MAX_KEPT);
  assert.equal(panel.isArchived('s0'), false, 'os mais antigos saem primeiro');
  assert.equal(panel.isArchived(`s${MAX_KEPT + 19}`), true);
});
