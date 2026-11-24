import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_STYLES, SPRITES, accentFor, bodyColorFor, initialsOf, normalizeStyle, shade, sigilShapeFor } from '../public/agents.js';

test('os 6 estilos estão na lista, com o Clawd primeiro (padrão)', () => {
  assert.deepEqual(AGENT_STYLES.map((s) => s.id), ['clawd', 'robo', 'bicho', 'fantasma', 'astro', 'selo']);
  AGENT_STYLES.forEach((style) => assert.ok(style.name && style.hint));
});

test('normalizeStyle: valor desconhecido ou vazio volta para o Clawd', () => {
  assert.equal(normalizeStyle('astro'), 'astro');
  assert.equal(normalizeStyle('robo'), 'robo');
  assert.equal(normalizeStyle('lixo'), 'clawd');
  assert.equal(normalizeStyle(null), 'clawd');
});

test('sprites são 12×12 e só usam as letras conhecidas', () => {
  Object.entries(SPRITES).forEach(([name, rows]) => {
    assert.equal(rows.length, 12, name);
    rows.forEach((row) => {
      assert.equal(row.length, 12, `${name}: "${row}"`);
      assert.match(row, /^[.kbdewas]+$/, `${name}: "${row}"`);
    });
    assert.ok(rows.join('').includes('s'), `${name} mostra a situação em algum pixel`);
    assert.ok(rows.join('').includes('a'), `${name} mostra o projeto em algum pixel`);
  });
});

test('cor do corpo é sempre a mesma para a sessão; a do projeto também', () => {
  assert.equal(bodyColorFor('sessao-1'), bodyColorFor('sessao-1'));
  assert.equal(accentFor('recital'), accentFor('recital'));
  assert.match(bodyColorFor('x'), /^#[0-9a-f]{6}$/);
});

test('shade escurece a cor', () => {
  assert.equal(shade('#ffffff'), '#9f9fa0');
  assert.equal(shade('#000000'), '#060607');
});

test('initialsOf: duas letras do nome da sessão', () => {
  assert.equal(initialsOf('Deploy do site'), 'DS');
  assert.equal(initialsOf('Painel Claude'), 'PC');
  assert.equal(initialsOf('keycloak'), 'KE');
  assert.equal(initialsOf('#87: Próximo passo'), 'PP');
  assert.equal(initialsOf(''), '?');
});

test('sigilShapeFor: forma fixa por sessão', () => {
  assert.equal(sigilShapeFor('abc'), sigilShapeFor('abc'));
  assert.ok(['circle', 'square', 'diamond', 'arch'].includes(sigilShapeFor('abc')));
});
