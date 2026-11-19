import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countLabels, countsOf, groupItems, groupKeyOf, pinnedFirst, spanOf, visibleSessions } from '../public/groups.js';
import { clampWidth, MIN_WIDTH, KEEP_FOR_GRID } from '../public/sheet-resize.js';

const s = (id, project, status, extra = {}) => ({ id, name: id, project, status, machine: '', unseen: false, ...extra });
const item = (session, sessions = [session]) => ({ session, sessions });

test('countsOf e countLabels: só as situações que existem, no singular e no plural', () => {
  const counts = countsOf([s('a', 'p', 'waiting'), s('b', 'p', 'working'), s('c', 'p', 'working'), s('d', 'p', 'idle', { unseen: true }), s('e', 'p', 'idle')]);
  assert.deepEqual(counts, { waiting: 1, error: 0, unseen: 1, working: 2, idle: 1 });
  assert.deepEqual(countLabels(counts).map((c) => c.text), ['1 esperando', '1 para ver', '2 rodando', '1 parada']);
  assert.deepEqual(countLabels(countsOf([s('a', 'p', 'idle'), s('b', 'p', 'idle')])).map((c) => c.text), ['2 paradas']);
});

test('groupItems: junta por projeto e máquina, na ordem de urgência, e conta as sessões das famílias', () => {
  const mae = s('mae', 'painel', 'working');
  const filha = s('filha', 'painel', 'waiting', { parentId: 'mae' });
  const groups = groupItems([
    item(s('deploy', 'loja', 'waiting')),
    item(mae, [mae, filha]),
    item(s('vps', 'loja', 'idle', { machine: 'vps-dev' })),
    item(s('testes', 'loja', 'working')),
    item(s('solta', '', 'idle')),
  ]);
  assert.deepEqual(groups.map((g) => [g.label, g.machine, g.items.length, g.sessions.length]), [
    ['loja', '', 2, 2], ['painel', '', 1, 2], ['loja', 'vps-dev', 1, 1], ['sem projeto', '', 1, 1],
  ]);
  assert.equal(groups[1].counts.waiting, 1, 'a filha que espera conta no quadro da família');
  assert.equal(groups[0].key, groupKeyOf({ project: 'loja' }));
});

test('spanOf: largura do quadro em colunas, com o mínimo de linhas', () => {
  assert.equal(spanOf(1, 6), 1);
  assert.equal(spanOf(3, 6), 3);
  assert.equal(spanOf(6, 6), 6);
  assert.equal(spanOf(9, 7), 5, '9 em 7 colunas: 2 linhas de 5');
  assert.equal(spanOf(12, 4), 4);
  assert.equal(spanOf(0, 4), 1);
  assert.equal(spanOf(5, 0), 1, 'sem colunas medidas, uma');
});

test('pinnedFirst: fixados no começo, na ordem em que foram fixados; o resto segue a urgência', () => {
  const groups = ['a', 'b', 'c', 'd'].map((key) => ({ key }));
  assert.deepEqual(pinnedFirst(groups, ['c', 'a']).map((g) => g.key), ['c', 'a', 'b', 'd']);
  assert.deepEqual(pinnedFirst(groups, ['x']).map((g) => g.key), ['a', 'b', 'c', 'd']);
  assert.deepEqual(groups.map((g) => g.key), ['a', 'b', 'c', 'd'], 'não altera a lista original');
});

test('visibleSessions: arquivadas e agendadas escondidas somem, menos quem espera você', () => {
  const list = [
    s('arq', 'p', 'idle', { archived: true }),
    s('arq-esperando', 'p', 'waiting', { archived: true }),
    s('agendada', 'p', 'idle', { scheduled: true }),
    s('agendada-esperando', 'p', 'waiting', { scheduled: true }),
    s('normal', 'p', 'working'),
  ];
  assert.deepEqual(visibleSessions(list).map((x) => x.id), ['arq-esperando', 'agendada', 'agendada-esperando', 'normal']);
  assert.deepEqual(visibleSessions(list, { showScheduled: false }).map((x) => x.id), ['arq-esperando', 'agendada-esperando', 'normal']);
});

test('clampWidth: o painel lateral respeita o mínimo e deixa espaço para a grade', () => {
  assert.equal(clampWidth(100, 1440), MIN_WIDTH);
  assert.equal(clampWidth(600, 1440), 600);
  assert.equal(clampWidth(5000, 1440), 1440 - KEEP_FOR_GRID);
  assert.equal(clampWidth(500, 500), MIN_WIDTH, 'tela pequena: fica no mínimo');
});
