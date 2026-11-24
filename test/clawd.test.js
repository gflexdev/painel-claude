import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAWD_FX, CLAWD_PARTS, CLAWD_VIEW, lookFor } from '../public/clawd.js';

const BOX = { left: 0, top: 0, width: 200, height: 110 }; // 10 px por pixel do desenho
const CENTER = { x: 80, y: 55 }; // coluna 8, linha 6.5 (a tela começa na linha 1)
const cells = (rects) => rects.flatMap(([x, y, w, h]) => Array.from({ length: w * h }, (_, i) => `${x + (i % w)},${y + Math.floor(i / w)}`));
const mirror = (rects) => cells(rects).map((cell) => { const [x, y] = cell.split(',').map(Number); return `${15 - x},${y}`; });

test('o bicho cabe na tela e não invade a coluna do ícone de atividade', () => {
  Object.entries(CLAWD_PARTS).forEach(([name, rects]) => rects.forEach(([x, y, w, h]) => {
    assert.ok(x >= 0 && x + w <= 16, `${name} sai pelos lados`);
    assert.ok(y >= CLAWD_VIEW.y && y + h <= CLAWD_VIEW.y + CLAWD_VIEW.height, `${name} sai por cima ou por baixo`);
  }));
});

test('corpo, braços, pernas e todas as caras são simétricos', () => {
  const pairs = [['arm-l', 'arm-r'], ['legs-a', 'legs-b']];
  pairs.forEach(([a, b]) => assert.deepEqual(mirror(CLAWD_PARTS[a]).sort(), cells(CLAWD_PARTS[b]).sort(), `${a}/${b}`));
  ['body', 'ground', 'mouth', 'eyes-open', 'eyes-shut', 'eyes-happy', 'eyes-x'].forEach((name) => {
    assert.deepEqual(mirror(CLAWD_PARTS[name]).sort(), cells(CLAWD_PARTS[name]).sort(), name);
  });
});

test('olhos e boca ficam dentro do corpo, mesmo olhando um pixel para qualquer lado', () => {
  const [[bx, by, bw, bh]] = CLAWD_PARTS.body;
  ['eyes-open', 'eyes-shut', 'eyes-happy', 'eyes-x', 'mouth'].forEach((name) => cells(CLAWD_PARTS[name]).forEach((cell) => {
    const [x, y] = cell.split(',').map(Number);
    [-1, 0, 1].forEach((d) => {
      assert.ok(x + d >= bx && x + d < bx + bw, `${name} sai do corpo na horizontal`);
      if (name === 'eyes-open') assert.ok(y + d >= by && y + d < by + bh, `${name} sai do corpo na vertical`);
    });
  }));
});

test('efeitos são desenhos de pixel retangulares', () => {
  Object.entries(CLAWD_FX).forEach(([name, { shape }]) => {
    shape.forEach((row) => assert.match(row, /^[.#]+$/, name));
    assert.equal(new Set(shape.map((row) => row.length)).size, 1, name);
  });
});

test('lookFor: olha para o lado do ponteiro, um pixel por eixo', () => {
  assert.deepEqual(lookFor(BOX, { x: CENTER.x + 100, y: CENTER.y }), { lx: 1, ly: 0 });
  assert.deepEqual(lookFor(BOX, { x: CENTER.x - 100, y: CENTER.y - 100 }), { lx: -1, ly: -1 });
  assert.deepEqual(lookFor(BOX, { x: CENTER.x, y: CENTER.y + 60 }), { lx: 0, ly: 1 });
});

test('lookFor: olha para a frente com o ponteiro em cima dele, longe ou fora da janela', () => {
  assert.deepEqual(lookFor(BOX, { x: CENTER.x + 5, y: CENTER.y - 5 }), { lx: 0, ly: 0 });
  assert.deepEqual(lookFor(BOX, { x: CENTER.x + 1000, y: CENTER.y }), { lx: 0, ly: 0 });
  assert.deepEqual(lookFor(BOX, null), { lx: 0, ly: 0 });
  assert.deepEqual(lookFor({ left: 0, top: 0, width: 0, height: 0 }, { x: 10, y: 10 }), { lx: 0, ly: 0 });
});
