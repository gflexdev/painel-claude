import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_LEVELS, CORE_RADIUS, LEVELS, buildTree, radialLayout, toneOf } from '../public/orbit.js';

const s = (id, project, status = 'idle', extra = {}) => ({ id, name: id, project, status, machine: '', unseen: false, ...extra });

test('mapa: árvore projeto → sessão → filhas, com o tom mais urgente subindo', () => {
  const tree = buildTree([
    s('mae', 'app'),
    s('filha', 'outro', 'working', { parentId: 'mae' }),
    s('neta', 'outro', 'waiting', { parentId: 'filha' }),
    s('solta', 'app', 'idle', { unseen: true }),
    s('x', 'api'),
    s('orfa', 'api', 'idle', { parentId: 'sumiu' }),
  ]);
  assert.deepEqual(tree.children.map((p) => [p.label, p.total, p.tone]), [['app', 4, 'waiting'], ['api', 2, 'idle']]);
  const app = tree.children[0];
  assert.deepEqual(app.children.map((n) => [n.label, n.children.length, n.tone]), [['mae', 1, 'waiting'], ['solta', 0, 'unseen']]);
  assert.equal(app.children[0].children[0].children[0].label, 'neta');
  assert.equal(toneOf(s('a', 'p', 'idle', { unseen: true })), 'unseen');
});

test('mapa: sessões num ciclo de pais não somem', () => {
  const tree = buildTree([s('a', 'p', 'idle', { parentId: 'b' }), s('b', 'p', 'idle', { parentId: 'a' })]);
  assert.equal(tree.total, 2);
  assert.equal(tree.children[0].sessions.length, 2);
});

test('mapa: os níveis (projetos, sessões, filhas) escolhem até onde a hierarquia aparece', () => {
  const tree = buildTree([
    s('mae', 'app'), s('filha', 'app', 'idle', { parentId: 'mae' }), s('neta', 'app', 'idle', { parentId: 'filha' }),
    s('solta', 'app'), s('x', 'api'),
  ]);
  const ids = (levels) => radialLayout(tree, levels).nodes.map((n) => n.node.label).sort().join(',');
  assert.equal(ids(LEVELS.projetos), 'api,app');
  assert.equal(ids(LEVELS.sessoes), 'api,app,mae,solta,x');
  assert.equal(ids(LEVELS.filhas), 'api,app,filha,mae,neta,solta,x');
  assert.equal(ALL_LEVELS, LEVELS.filhas);
});

test('mapa: filhos mais longe do centro que o pai, dentro da fatia dele, sem se encostar; o mapa cresce com muitas', () => {
  const sessions = [];
  ['a', 'b', 'c'].forEach((project) => { for (let i = 0; i < 6; i += 1) sessions.push(s(`${project}${i}`, project)); });
  const { nodes, radius, bounds } = radialLayout(buildTree(sessions));
  assert.equal(nodes.length, 3 + 18);
  nodes.filter((n) => n.depth === 2).forEach((n) => {
    assert.ok(n.r > n.parent.r);
    assert.ok(Math.abs(n.angle - n.parent.angle) <= Math.PI / 3 + 1e-9);
  });
  assert.ok(nodes.filter((n) => n.depth === 1).every((n) => n.r > CORE_RADIUS * 2), 'projetos fora do núcleo');
  const ring = nodes.filter((n) => n.depth === 2);
  const closest = Math.min(...ring.flatMap((a, i) => ring.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
  assert.ok(closest > 80, `círculos a ${Math.round(closest)} px`);
  assert.ok(bounds.maxX >= radius * 0.9);
  const many = [];
  for (let i = 0; i < 90; i += 1) many.push(s(`m${i}`, `p${i % 5}`));
  assert.ok(radialLayout(buildTree(many)).radius > radius);
});
