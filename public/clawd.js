// Estilo "Clawd": o bichinho laranja de pixel do Claude Code. O corpo é sempre o mesmo laranja (sem cor de
// projeto: qualquer mancha no rosto dele parece lágrima) e o chão embaixo dele tem a cor da situação
// (`currentColor`). Cada situação tem uma cara e um jeito de se mexer (clawd.css), e ele reage ao dono: segue o
// ponteiro com os olhos e pula quando é tocado.
import { ACCESSORIES, drawPattern } from './bot.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const CLAWD_COLOR = '#d97757';
const INK = '#16110d';
const HEART = '#ff6b8b';
/** Tela: 16 colunas do bicho + 4 do ícone de atividade; a linha 0 fica de fora (só os efeitos passam por ela). */
export const CLAWD_VIEW = Object.freeze({ x: 0, y: 1, width: 20, height: 11 });
const ACC_AT = Object.freeze({ x: 16, y: 1 });
/** Centro do corpo, nas mesmas unidades: é para cá que os olhos "apontam" a conta. */
const CENTER = Object.freeze({ x: 8, y: 6.5 });
/** Até onde (px da tela) ele presta atenção no ponteiro. */
const LOOK_RADIUS = 320;
const POKE_MS = 640;
const POKES = Object.freeze(['jump', 'spin']);

/** Peças do bicho em retângulos [x, y, largura, altura]; cada grupo vira um <g class="cl-…">. */
export const CLAWD_PARTS = Object.freeze({
  ground: [[3, 11, 10, 1]],
  'legs-a': [[3, 9, 1, 2], [10, 9, 1, 2]],
  'legs-b': [[5, 9, 1, 2], [12, 9, 1, 2]],
  body: [[2, 4, 12, 5]],
  'arm-l': [[0, 7, 2, 1]],
  'arm-r': [[14, 7, 2, 1]],
  'eyes-open': [[4, 5, 1, 2], [11, 5, 1, 2]],
  'eyes-shut': [[3, 6, 2, 1], [11, 6, 2, 1]],
  'eyes-happy': [[3, 6, 1, 1], [4, 5, 1, 1], [5, 6, 1, 1], [10, 6, 1, 1], [11, 5, 1, 1], [12, 6, 1, 1]],
  'eyes-x': [
    [3, 4, 1, 1], [5, 4, 1, 1], [4, 5, 1, 1], [3, 6, 1, 1], [5, 6, 1, 1],
    [10, 4, 1, 1], [12, 4, 1, 1], [11, 5, 1, 1], [10, 6, 1, 1], [12, 6, 1, 1],
  ],
  mouth: [[7, 7, 2, 1]],
});

/** Efeitos em desenho de pixel ('#'), com onde começam. */
export const CLAWD_FX = Object.freeze({
  'z-1': { at: [12, 0], shape: ['####', '..#.', '.#..', '####'] },
  'z-2': { at: [16, -2], shape: ['###', '.#.', '###'] },
  heart: { at: [5, -1], shape: ['##.##', '#####', '.###.', '..#..'] },
  sparkle: { at: [0, 1], shape: ['.#.', '###', '.#.'] },
});

/**
 * Para onde os olhos olham: -1, 0 ou 1 em cada eixo (um pixel inteiro, para não borrar).
 * @param {{ left: number, top: number, width: number, height: number }} box onde o desenho está na tela
 * @param {{ x: number, y: number } | null} point o ponteiro, ou null quando saiu da janela
 */
export function lookFor(box, point) {
  if (!point || !box.width || !box.height) return { lx: 0, ly: 0 };
  const cx = box.left + (box.width * (CENTER.x - CLAWD_VIEW.x)) / CLAWD_VIEW.width;
  const cy = box.top + (box.height * (CENTER.y - CLAWD_VIEW.y)) / CLAWD_VIEW.height;
  const dx = point.x - cx;
  const dy = point.y - cy;
  if (Math.hypot(dx, dy) > LOOK_RADIUS) return { lx: 0, ly: 0 };
  const axis = (delta, deadZone) => (Math.abs(delta) <= deadZone ? 0 : Math.sign(delta));
  return { lx: axis(dx, box.width * 0.15), ly: axis(dy, box.height * 0.25) };
}

function node(tag, attrs) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function part(name, fill) {
  const group = node('g', { class: `cl-${name}` });
  CLAWD_PARTS[name].forEach(([x, y, width, height]) => {
    group.appendChild(node('rect', { x, y, width: width + 0.02, height: height + 0.02, ...(fill ? { fill } : {}) }));
  });
  return group;
}

function fx(name, fill) {
  const group = node('g', { class: `cl-fx cl-${name}` });
  const { at: [x, y], shape } = CLAWD_FX[name];
  drawPattern(group, shape, x, y, fill);
  return group;
}

/**
 * O Clawd da sessão.
 * @param {{ accessory?: string | null }} session
 */
export function clawdSvg({ accessory = null } = {}) {
  const { x, y, width, height } = CLAWD_VIEW;
  const svg = node('svg', { viewBox: `${x} ${y} ${width} ${height}`, 'aria-hidden': 'true', class: 'agent agent-clawd' });

  const face = node('g', { class: 'cl-face' });
  face.append(part('eyes-open', INK), part('eyes-shut', INK), part('eyes-happy', INK), part('eyes-x', INK), part('mouth', INK));
  const top = node('g', { class: 'cl-top' });
  top.append(part('arm-l', CLAWD_COLOR), part('arm-r', CLAWD_COLOR), part('body', CLAWD_COLOR), face);
  const all = node('g', { class: 'cl-all' });
  all.append(part('legs-a', CLAWD_COLOR), part('legs-b', CLAWD_COLOR), top);

  svg.append(part('ground', 'currentColor'), all, fx('sparkle'), fx('z-1'), fx('z-2'), fx('heart', HEART));

  const glyph = accessory && ACCESSORIES[accessory];
  if (glyph) {
    const acc = node('g', { class: `acc acc-${accessory}` });
    drawPattern(acc, glyph, ACC_AT.x, ACC_AT.y, 'currentColor');
    svg.appendChild(acc);
  }
  return svg;
}

/** Onde um toque faz o Clawd reagir: no quadro inteiro, não só no desenho. */
const POKE_HOSTS = '.tile, .orb, .orbit-core, .detail-bot, .style-button, .picker-option';

/**
 * Liga as reações (uma vez por página): olhos que seguem o mouse e pulo/pirueta a cada toque.
 * Com "reduzir movimento" ligado no sistema, ele fica quieto.
 */
export function wireClawd(doc = document) {
  const win = doc.defaultView;
  if (!win || doc.documentElement.dataset.clawdWired) return;
  doc.documentElement.dataset.clawdWired = 'true';
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const timers = new WeakMap();
  let pointer = null;
  let frame = 0;

  const look = () => {
    frame = 0;
    doc.querySelectorAll('svg.agent-clawd').forEach((svg) => {
      const { lx, ly } = reduced.matches ? { lx: 0, ly: 0 } : lookFor(svg.getBoundingClientRect(), pointer);
      const key = `${lx},${ly}`;
      if (svg.dataset.look === key) return;
      svg.dataset.look = key;
      svg.style.setProperty('--lx', String(lx));
      svg.style.setProperty('--ly', String(ly));
    });
  };
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(look); };

  doc.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  }, { passive: true });
  doc.documentElement.addEventListener('pointerleave', () => { pointer = null; schedule(); });

  doc.addEventListener('pointerdown', (event) => {
    if (reduced.matches) return;
    const svg = event.target.closest?.(POKE_HOSTS)?.querySelector('svg.agent-clawd');
    if (!svg) return;
    const count = Number(svg.dataset.pokes ?? 0);
    svg.dataset.pokes = String(count + 1);
    svg.classList.remove('cl-poke', ...POKES.map((kind) => `cl-poke-${kind}`));
    svg.getBoundingClientRect(); // recomeça a animação mesmo com toques seguidos
    svg.classList.add('cl-poke', `cl-poke-${POKES[count % POKES.length]}`);
    win.clearTimeout(timers.get(svg));
    timers.set(svg, win.setTimeout(() => svg.classList.remove('cl-poke', ...POKES.map((kind) => `cl-poke-${kind}`)), POKE_MS));
  }, { passive: true });
}
