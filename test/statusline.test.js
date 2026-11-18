import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPainelStatusLine, withPainelStatusLine, withoutPainelStatusLine } from '../scripts/statusline.js';

const SCRIPT = '/opt/painel-claude/hooks/statusline.sh';

test('sem status line: liga a do painel e não há original para guardar', () => {
  const { settings, original } = withPainelStatusLine({ model: 'opus' }, SCRIPT);
  assert.deepEqual(settings.statusLine, { type: 'command', command: `'${SCRIPT}'`, padding: 0 });
  assert.equal(settings.model, 'opus');
  assert.equal(original, null);
});

test('com status line própria: embrulha e devolve o comando original, mantendo o padding', () => {
  const mine = { type: 'command', command: 'bash ~/.claude/scripts/statusline.sh', padding: 2 };
  const { settings, original } = withPainelStatusLine({ statusLine: mine }, SCRIPT);
  assert.equal(settings.statusLine.padding, 2);
  assert.ok(isPainelStatusLine(settings.statusLine.command, SCRIPT));
  assert.deepEqual(original, mine);
});

test('rodar de novo não embrulha duas vezes', () => {
  const first = withPainelStatusLine({}, SCRIPT).settings;
  const again = withPainelStatusLine(first, SCRIPT);
  assert.equal(again.original, undefined);
  assert.deepEqual(again.settings, first);
});

test('desinstalar devolve a status line de antes, ou tira a do painel', () => {
  const mine = { type: 'command', command: 'bash ~/x.sh', padding: 1 };
  const wrapped = withPainelStatusLine({ statusLine: mine }, SCRIPT).settings;
  assert.deepEqual(withoutPainelStatusLine(wrapped, mine, SCRIPT).statusLine, mine);
  assert.equal('statusLine' in withoutPainelStatusLine(wrapped, null, SCRIPT), false);
  const foreign = { statusLine: mine };
  assert.deepEqual(withoutPainelStatusLine(foreign, null, SCRIPT), foreign);
});

test('hooks/statusline.sh roda a status line original com o mesmo JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'painel-sl-'));
  writeFileSync(join(dir, 'statusline-original.cmd'), 'cat | sed -n "s/.*display_name\\":\\"\\([^\\"]*\\)\\".*/[\\1]/p"');
  const output = execFileSync('sh', ['hooks/statusline.sh'], {
    input: '{"model":{"display_name":"Opus 5.5"}}',
    env: { ...process.env, PAINEL_DIR: dir, PAINEL_PORT: '9' },
    encoding: 'utf8',
  });
  assert.equal(output.trim(), '[Opus 5.5]');
});

test('hooks/statusline.sh sem original mostra só o modelo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'painel-sl-'));
  const output = execFileSync('sh', ['hooks/statusline.sh'], {
    input: '{"model":{"id":"x","display_name":"Sonnet 5.5"},"cwd":"/tmp"}',
    env: { ...process.env, PAINEL_DIR: dir, PAINEL_PORT: '9' },
    encoding: 'utf8',
  });
  assert.equal(output.trim(), 'Sonnet 5.5');
});
