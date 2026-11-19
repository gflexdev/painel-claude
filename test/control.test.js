import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanLaunch, createControl, launchArgs, parseBackgrounded } from '../src/control.js';

function fakeControl(outputs = {}) {
  const calls = [];
  const run = async (bin, args, options) => {
    calls.push({ bin, args, cwd: options.cwd });
    if (args[0] === '--bg') return { stdout: outputs.bg ?? 'backgrounded · 7c5dcf5d · x\n', stderr: '' };
    return { stdout: '', stderr: '' };
  };
  return { control: createControl({ bin: '/bin/claude', run }), calls };
}

test('parseBackgrounded tira o id curto da saída do claude --bg', () => {
  assert.equal(parseBackgrounded('Starting…\nbackgrounded · 7c5dcf5d · flaky-test-fix\n'), '7c5dcf5d');
  assert.equal(parseBackgrounded('Workspace not trusted'), null);
});

test('cleanLaunch exige pedido, limita o tamanho e não deixa texto virar opção de linha de comando', () => {
  assert.throws(() => cleanLaunch({ prompt: '   ' }), /o que a sessão deve fazer/);
  assert.throws(() => cleanLaunch({ prompt: 'x'.repeat(4001) }), /4000/);
  assert.deepEqual(cleanLaunch({ prompt: ' corrige o bug ', name: '  meu   nome ' }), { prompt: 'corrige o bug', name: 'meu nome' });
  assert.equal(cleanLaunch({ prompt: '--dangerously-skip-permissions' }).prompt, ' --dangerously-skip-permissions');
  assert.equal(cleanLaunch({ prompt: 'x', name: '--bg' }).name, 'bg');
  assert.deepEqual(launchArgs({ prompt: '-p oi', name: '' }), ['--bg', ' -p oi']);
  assert.deepEqual(launchArgs({ prompt: 'oi', name: 'n' }), ['--bg', '--name', 'n', 'oi']);
});

test('launch roda claude --bg na pasta do projeto, sem shell, e devolve o id curto', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'painel-projeto-'));
  const { control, calls } = fakeControl();
  assert.deepEqual(await control.launch({ cwd, prompt: 'roda os testes; rm -rf /', name: 'testes' }), { jobId: '7c5dcf5d' });
  assert.deepEqual(calls, [{ bin: '/bin/claude', args: ['--bg', '--name', 'testes', 'roda os testes; rm -rf /'], cwd }]);
});

test('launch recusa pasta que não existe, caminho relativo e saída sem id', async () => {
  const { control } = fakeControl();
  await assert.rejects(control.launch({ cwd: '/nao/existe/painel', prompt: 'x' }), /pasta do projeto/);
  await assert.rejects(control.launch({ cwd: 'relativo', prompt: 'x' }), /pasta do projeto/);
  const untrusted = fakeControl({ bg: 'Workspace not trusted' });
  await assert.rejects(untrusted.control.launch({ cwd: tmpdir(), prompt: 'x' }), /Workspace not trusted/);
});

test('stop e rm usam só o id curto de segundo plano, validado', async () => {
  const { control, calls } = fakeControl();
  await control.stopJob('7c5dcf5d');
  await control.removeJob('7c5dcf5d');
  assert.deepEqual(calls.map((c) => c.args), [['stop', '7c5dcf5d'], ['rm', '7c5dcf5d']]);
  assert.throws(() => control.stopJob('--all'), /inválido/);
  assert.throws(() => control.removeJob('a b'), /inválido/);
  assert.equal(calls.length, 2);
});

test('sem o claude, nada roda e a mensagem explica', async () => {
  const control = createControl({ bin: null, run: async () => { throw new Error('não devia rodar'); } });
  assert.equal(control.available(), false);
  await assert.rejects(control.launch({ cwd: tmpdir(), prompt: 'x' }), /não achei o comando claude/);
});

test('control.js não manda sinais a processos nem usa shell', () => {
  const source = readFileSync(new URL('../src/control.js', import.meta.url), 'utf8');
  const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /process\.kill|SIGTERM|SIGKILL|\bspawn\(|[^.\w]exec\(|shell:\s*true/);
});
