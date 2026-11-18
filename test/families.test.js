import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familySummary, groupFamilies } from '../public/families.js';

const s = (id, extra = {}) => ({ id, status: 'idle', ...extra });

test('sem vínculos, cada sessão é um item solto na mesma ordem', () => {
  const items = groupFamilies([s('a'), s('b')]);
  assert.deepEqual(items.map((i) => [i.kind, i.session.id]), [['single', 'a'], ['single', 'b']]);
});

test('a família ocupa o lugar do membro mais urgente, com a raiz primeiro e as filhas em árvore', () => {
  const items = groupFamilies([
    s('filha-esperando', { parentId: 'pai', status: 'waiting' }),
    s('solta'),
    s('pai', { status: 'working' }),
    s('neta', { parentId: 'filha-esperando' }),
    s('filha-2', { parentId: 'pai' }),
  ]);
  assert.equal(items[0].kind, 'family');
  assert.deepEqual(items[0].members.map((m) => [m.session.id, m.level]),
    [['pai', 0], ['filha-esperando', 1], ['neta', 2], ['filha-2', 1]]);
  assert.equal(items[1].session.id, 'solta');
  assert.equal(items.length, 2);
});

test('pai fora do snapshot: a filha fica solta', () => {
  const items = groupFamilies([s('filha', { parentId: 'sumiu' })]);
  assert.equal(items[0].kind, 'single');
});

test('ciclo de pais não trava', () => {
  const items = groupFamilies([s('a', { parentId: 'b' }), s('b', { parentId: 'a' })]);
  assert.equal(items.length, 1);
  assert.equal(items[0].members.length, 2);
});

test('familySummary conta quem espera e os subagentes', () => {
  const [family] = groupFamilies([s('pai', { subagentCount: 1 }), s('f', { parentId: 'pai', status: 'waiting', subagentCount: 2 })]);
  assert.deepEqual(familySummary(family.members).waiting, 1);
  assert.equal(familySummary(family.members).firstWaiting.id, 'f');
  assert.equal(familySummary(family.members).subagents, 3);
});
