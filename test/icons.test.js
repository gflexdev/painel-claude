import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ART, crc32, pixelColor, renderPng, renderSvg } from '../scripts/gerar-icones.js';

test('desenho do ícone é 16×16', () => {
  assert.equal(ART.length, 16);
  ART.forEach((row) => assert.equal(row.length, 16));
});

test('crc32 bate com o valor conhecido', () => {
  assert.equal(crc32(Buffer.from('IEND')), 0xae426082);
});

test('PNG tem assinatura, tamanho certo e termina em IEND', () => {
  const png = renderPng(48);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 48);
  assert.equal(png.readUInt32BE(20), 48);
  assert.equal(png.subarray(-8, -4).toString('ascii'), 'IEND');
});

test('o robô cabe na área segura dos ícones maskable (raio de 40%)', () => {
  const size = 256;
  let farthest = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixelColor(x + 0.5, y + 0.5, size);
      const isRobot = (r === 0xff && g === 0xb2) || (r === 0xff && g === 0x4f);
      if (isRobot) farthest = Math.max(farthest, Math.hypot(x - size / 2, y - size / 2));
    }
  }
  assert.ok(farthest < size * 0.4, `robô chega a ${farthest.toFixed(0)}px do centro`);
});

test('SVG tem o mesmo desenho', () => {
  const svg = renderSvg();
  const filled = ART.join('').replaceAll('.', '').length;
  assert.equal((svg.match(/<rect x=/g) ?? []).length, filled);
});
