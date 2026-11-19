import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessoryOf, elapsed, placeOf, sessionFromHash, tokens } from '../public/format.js';
import { botCells, hatFor, seedFrom } from '../public/bot.js';

test('elapsed: agora, segundos, minutos, horas e dias', () => {
  const now = 10_000_000;
  assert.equal(elapsed(now - 3_000, now), 'agora');
  assert.equal(elapsed(now - 42_000, now), '42s');
  assert.equal(elapsed(now - 14 * 60_000, now), '14 min');
  assert.equal(elapsed(now - 125 * 60_000, now), '2 h 05');
  assert.equal(elapsed(now - 3 * 24 * 3600_000, now), '3 d');
});

test('tokens: k e M', () => {
  assert.equal(tokens(84_213), '84k');
  assert.equal(tokens(1_250_000), '1,3M');
  assert.equal(tokens(undefined), '');
});

test('accessoryOf: atividade ao trabalhar, bandeira quando terminou sem ver, nada parado', () => {
  assert.equal(accessoryOf({ status: 'working', activity: 'bash' }), 'bash');
  assert.equal(accessoryOf({ status: 'working', activity: null }), 'think');
  assert.equal(accessoryOf({ status: 'waiting', activity: 'ask' }), 'ask');
  assert.equal(accessoryOf({ status: 'idle', unseen: true }), 'done');
  assert.equal(accessoryOf({ status: 'idle', unseen: false }), null);
});

test('robozinho é simétrico e sempre igual para a mesma sessão', () => {
  const cells = botCells('sessao-123');
  assert.deepEqual(cells, botCells('sessao-123'));
  cells.forEach((row) => assert.deepEqual(row, [...row].reverse()));
  assert.equal(cells.length, 7);
  assert.equal(cells[0].length, 9);
});

test('chapéu depende só do projeto', () => {
  assert.deepEqual(hatFor('recital'), hatFor('recital'));
  assert.equal(typeof hatFor('').color, 'string');
  assert.notEqual(seedFrom('a'), seedFrom('b'));
});

test('sessionFromHash: lê #sessao=<id> do link do widget e recusa o resto', () => {
  assert.equal(sessionFromHash('#sessao=f664c84e-2faf-4db6-8933-3d25c71c2b29'), 'f664c84e-2faf-4db6-8933-3d25c71c2b29');
  assert.equal(sessionFromHash('#sessao=abc&x=1'), 'abc');
  assert.equal(sessionFromHash(''), null);
  assert.equal(sessionFromHash('#outra=abc'), null);
  assert.equal(sessionFromHash('#sessao='), null);
  assert.equal(sessionFromHash('#sessao=../api'), null);
  assert.equal(sessionFromHash(`#sessao=${'a'.repeat(81)}`), null);
});

test('placeOf: projeto e a pasta só quando ela é outra (worktree), sem o caminho inteiro', () => {
  assert.equal(placeOf({ cwd: '/Users/x/gflex/painel-claude', project: 'painel-claude' }), 'painel-claude');
  assert.equal(placeOf({ cwd: '/Users/x/painel-claude/.claude/worktrees/nifty-3866bb', project: 'painel-claude' }), 'painel-claude · nifty-3866bb');
  assert.equal(placeOf({ cwd: '/Users/x/app/', project: 'app' }), 'app');
  assert.equal(placeOf({ project: 'app' }), 'app');
  assert.equal(placeOf({ cwd: '/srv/api' }), 'api');
  assert.equal(placeOf({}), '');
});
