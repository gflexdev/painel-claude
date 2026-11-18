// Robozinho de pixel: corpo pela sessão (sempre o mesmo), chapéu pelo projeto (sessões do mesmo projeto
// ficam parecidas) e um ícone ao lado dizendo o que ele está fazendo agora.
const SVG_NS = 'http://www.w3.org/2000/svg';
const BODY_COLS = 9;
const BODY_ROWS = 7;
const HALF = 4;
const HAT_ROWS = 3;
const ACC_SIZE = 4;
const CANVAS_COLS = BODY_COLS + ACC_SIZE;
const CANVAS_ROWS = HAT_ROWS + BODY_ROWS - 1;

const HATS = [
  ['.#####.', '.#####.', '#######'], // cartola
  ['...#...', '.#####.', '#######'], // gorro com pompom
  ['#.#.#.#', '#######', '.......'], // coroa
  ['..####.', '.######', '#######'], // boné
  ['...#...', '..###..', '.#####.'], // chapéu de festa
  ['.......', '.......', '#######'], // faixa
  ['##...##', '.#...#.', '.#####.'], // chifrinhos
];
const HAT_COLORS = ['#7aa2ff', '#ff8fd0', '#f5d547', '#5fe0d0', '#c49bff', '#ff9a5c', '#9be564', '#e8e4dc'];

/** Ícones 4×4 das atividades (o mesmo vocabulário do servidor). */
export const ACCESSORIES = Object.freeze({
  read: ['###.', '#.#.', '###.', '...#'],
  write: ['...#', '..#.', '.#..', '#...'],
  bash: ['#...', '.#..', '#...', '..##'],
  web: ['.##.', '####', '####', '.##.'],
  delegate: ['.##.', '####', '.##.', '#..#'],
  plan: ['#.##', '....', '#.##', '....'],
  ask: ['.##.', '...#', '..#.', '..#.'],
  mcp: ['#..#', '####', '.##.', '.#..'],
  think: ['....', '....', '#.#.', '....'],
  compact: ['#..#', '.##.', '.##.', '#..#'],
  done: ['##..', '###.', '#...', '#...'],
});

export function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

function randomFrom(seed) {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** Matriz [linha][coluna] do corpo: 0 vazio, 1 corpo, 2 olho/boca. Simétrica. A linha 0 (antena) vira chapéu. */
export function botCells(id) {
  const rand = randomFrom(seedFrom(id));
  const twinAntenna = rand() < 0.4;
  const arms = rand() < 0.5;
  const wideHead = rand() < 0.5;
  const mouth = rand() < 0.5;
  const legCol = rand() < 0.5 ? 2 : 3;
  const notches = [rand() < 0.3, rand() < 0.3];

  const half = Array.from({ length: BODY_ROWS }, (_, y) => Array.from({ length: HALF + 1 }, (__, x) => {
    if (y === 0) return twinAntenna ? Number(x === 2) : Number(x === HALF);
    if (y === 6) return Number(x === legCol);
    if (x === 0) return Number(arms ? y === 5 : y === 2 && wideHead);
    if (y === 2 && x === 2) return 2;
    if (y === 3 && x >= 2 && mouth) return x === HALF ? 2 : 1;
    if (y === 4) return Number(x >= 3 || (x === 2 && !notches[0]));
    if (x === 1) return Number(y !== 4 && !(y === 1 && notches[1]));
    return 1;
  }));
  return half.map((row) => [...row, ...row.slice(0, HALF).reverse()]);
}

export function hatFor(project) {
  const h = seedFrom(project || '?');
  return { shape: HATS[h % HATS.length], color: HAT_COLORS[(h >>> 8) % HAT_COLORS.length] };
}

export function rect(x, y, fill, cls) {
  const node = document.createElementNS(SVG_NS, 'rect');
  node.setAttribute('x', String(x));
  node.setAttribute('y', String(y));
  node.setAttribute('width', '1.02');
  node.setAttribute('height', '1.02');
  if (fill) node.setAttribute('fill', fill);
  if (cls) node.setAttribute('class', cls);
  return node;
}

export function drawPattern(group, pattern, offsetX, offsetY, fill) {
  pattern.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '#') group.appendChild(rect(offsetX + x, offsetY + y, fill));
  }));
}

/**
 * @param {string} id sessão (corpo)
 * @param {{ project?: string, accessory?: string | null }} options
 */
export function botSvg(id, { project = '', accessory = null } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${CANVAS_COLS} ${CANVAS_ROWS}`);
  svg.setAttribute('aria-hidden', 'true');

  const body = document.createElementNS(SVG_NS, 'g');
  body.setAttribute('class', 'body');
  const eyes = document.createElementNS(SVG_NS, 'g');
  eyes.setAttribute('class', 'eye');
  botCells(id).forEach((row, y) => row.forEach((cell, x) => {
    if (y === 0 || !cell) return;
    const node = rect(x, y + HAT_ROWS - 1, cell === 2 ? null : 'currentColor');
    (cell === 2 ? eyes : body).appendChild(node);
  }));
  body.appendChild(eyes);
  svg.appendChild(body);

  const hat = hatFor(project);
  const hatGroup = document.createElementNS(SVG_NS, 'g');
  hatGroup.setAttribute('class', 'hat');
  drawPattern(hatGroup, hat.shape, 1, 0, hat.color);
  svg.appendChild(hatGroup);

  const glyph = accessory && ACCESSORIES[accessory];
  if (glyph) {
    const acc = document.createElementNS(SVG_NS, 'g');
    acc.setAttribute('class', `acc acc-${accessory}`);
    drawPattern(acc, glyph, BODY_COLS, 0, 'currentColor');
    svg.appendChild(acc);
  }
  return svg;
}
