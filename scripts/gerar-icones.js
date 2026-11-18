// Gera os ícones do app (PWA, Apple e favicon) a partir de um desenho em pixel art, sem dependências.
// Uso: node scripts/gerar-icones.js
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

/** 16×16. O robô fica dentro do círculo seguro de ícone "maskable" (80% do centro). */
export const ART = Object.freeze([
  '................',
  '................',
  '................',
  '.......rr.......',
  '.......aa.......',
  '...aaaaaaaaaa...',
  '..aaaaaaaaaaaa..',
  '..aaaweaaweaaa..',
  '..aaaeeaaeeaaa..',
  '...aaaaaaaaaa...',
  '...aaammmmaaa...',
  '...aaaaaaaaaa...',
  '.....aa..aa.....',
  '.....aa..aa.....',
  '................',
  '................',
]);

const PALETTE = Object.freeze({
  a: [0xff, 0xb2, 0x38], // corpo âmbar (a cor de "rodando")
  r: [0xff, 0x4f, 0x6a], // lâmpada da antena (a cor de "esperando você")
  e: [0x0e, 0x0f, 0x12], // olhos
  w: [0xe8, 0xe4, 0xdc], // brilho dos olhos
  m: [0x0e, 0x0f, 0x12], // boca
});
const BG_CENTER = [0x2a, 0x2e, 0x38];
const BG_EDGE = [0x0e, 0x0f, 0x12];
const SHADOW = [0x06, 0x07, 0x09];
const GRID = ART.length;
/** Margem em células ao redor do desenho: mantém o robô inteiro quando o Android recorta o ícone em círculo. */
const PAD = 2;
const VIEW = GRID + PAD * 2;

const mix = (from, to, t) => from.map((c, i) => Math.round(c + (to[i] - c) * t));
const cellAt = (gx, gy) => (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID ? ART[gy][gx] : '.');

/** Cor do pixel (x, y) num ícone de lado `size`: robô nítido, sombra deslocada e fundo com gradiente radial. */
export function pixelColor(x, y, size) {
  const cell = size / VIEW;
  const art = cellAt(Math.floor(x / cell) - PAD, Math.floor(y / cell) - PAD);
  if (art !== '.') return PALETTE[art];
  const shadowOffset = cell * 0.4;
  const shadowArt = cellAt(Math.floor((x - shadowOffset) / cell) - PAD, Math.floor((y - shadowOffset) / cell) - PAD);
  if (shadowArt !== '.') return SHADOW;
  const dx = x / size - 0.5;
  const dy = y / size - 0.45;
  return mix(BG_CENTER, BG_EDGE, Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.72));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** PNG RGB 8 bits, sem filtro por linha. */
export function renderPng(size) {
  const rowLength = size * 3 + 1;
  const raw = Buffer.alloc(rowLength * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * rowLength] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixelColor(x + 0.5, y + 0.5, size);
      const at = y * rowLength + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

/** Favicon vetorial com o mesmo desenho (fica nítido em qualquer tamanho). */
export function renderSvg() {
  const rects = ART.flatMap((row, y) => [...row].flatMap((ch, x) => (
    ch === '.' ? [] : [`<rect x="${x}" y="${y}" width="1" height="1" fill="${hex(PALETTE[ch])}"/>`]
  )));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges">`,
    `<rect width="${GRID}" height="${GRID}" rx="3" fill="${hex(BG_EDGE)}"/>`,
    ...rects,
    '</svg>',
    '',
  ].join('\n');
}

const OUTPUTS = Object.freeze([
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  OUTPUTS.forEach(([name, size]) => writeFileSync(join(PUBLIC_DIR, name), renderPng(size)));
  writeFileSync(join(PUBLIC_DIR, 'icon.svg'), renderSvg());
  process.stdout.write(`ícones gerados em ${PUBLIC_DIR}: ${OUTPUTS.map(([n]) => n).join(', ')}, icon.svg\n`);
}
