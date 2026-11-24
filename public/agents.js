// Estilos de personagem das sessões. Em todos: o corpo é da sessão (sempre igual), um detalhe tem a cor do
// projeto (a mesma do chapéu do robô) e a situação aparece em `currentColor` (a cor da situação no tile).
import { ACCESSORIES, botSvg, drawPattern, hatFor, rect, seedFrom } from './bot.js';
import { clawdSvg } from './clawd.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPRITE_SIZE = 12;
const ACC_COLS = 4;
const INK = '#0b0c10';
const PUPIL = '#14110a';
/** Cores de corpo: nenhuma igual às cores de situação (âmbar, vermelho, azul, verde), para não confundir. */
const BODY_COLORS = Object.freeze(['#c58bff', '#5fe0d0', '#ff8f6b', '#9be15d', '#ff8fd0', '#e8e4dc', '#f5d547', '#6fc3ff']);
const SIGIL_SHAPES = Object.freeze(['circle', 'square', 'diamond', 'arch']);

export const AGENT_STYLES = Object.freeze([
  { id: 'clawd', name: 'Clawd', hint: 'o laranjinha do Claude Code: anda, acena, comemora e dorme' },
  { id: 'robo', name: 'Robô', hint: 'corpo na cor da situação, chapéu do projeto' },
  { id: 'bicho', name: 'Bichinho', hint: 'orelhas do projeto; dorme quando parada' },
  { id: 'fantasma', name: 'Fantasminha', hint: 'cachecol do projeto; some devagar quando parada' },
  { id: 'astro', name: 'Astronauta', hint: 'visor inteiro na cor da situação' },
  { id: 'selo', name: 'Selo', hint: 'iniciais da sessão, anel na cor da situação' },
]);

/** Letras: k contorno, b corpo, d sombra do corpo, e pupila, w branco, a cor do projeto, s cor da situação. */
export const SPRITES = Object.freeze({
  bicho: [
    '..a......a..',
    '..aa....aa..',
    '...kkkkkk...',
    '..kbbbbbbk..',
    '.kbbbbbbbbk.',
    '.kbewbbewbk.',
    '.kbbbbbbbbk.',
    '.kbbbssbbbk.',
    '.kbbbbbbbbk.',
    '..kbbbbbbk..',
    '..kdk..kdk..',
    '............',
  ],
  fantasma: [
    '....kkkk....',
    '..kkbbbbkk..',
    '.kbbbbbbbbk.',
    '.kbbbbbbbbk.',
    'kbbewbbewbbk',
    'kbbeebbeebbk',
    'kbbbbssbbbbk',
    'kaaaaaaaaaak',
    'kbbbbbbbbbbk',
    'kbbbbbbbbbbk',
    'kbkbbkkbbkbk',
    '.k..k..k..k.',
  ],
  astro: [
    '...kkkkkk...',
    '..kwwwwwwk..',
    '.kwwkkkkwwk.',
    '.kwksssskwk.',
    '.kwkseeskwk.',
    '.kwksssskwk.',
    '.kwwkkkkwwk.',
    '..kwwwwwwk..',
    '.kbbbkkbbbk.',
    'kbbabbbbbbbk',
    'kbbbbbbbbbbk',
    '.kbbk..kbbk.',
  ],
});

/** Olhos fechados do bichinho (linha dos olhos), mostrados no lugar das pupilas quando a sessão está parada. */
const SHUT_EYES = Object.freeze({ bicho: { row: 5, cols: [3, 4, 7, 8] } });

export const DEFAULT_STYLE = 'clawd';
export const normalizeStyle = (value) => (AGENT_STYLES.some((s) => s.id === value) ? value : DEFAULT_STYLE);
export const bodyColorFor = (id) => BODY_COLORS[(seedFrom(id || '?') >>> 4) % BODY_COLORS.length];
export const accentFor = (project) => hatFor(project).color;
export const sigilShapeFor = (id) => SIGIL_SHAPES[(seedFrom(id || '?') >>> 9) % SIGIL_SHAPES.length];

/** Mistura 60% da cor com 40% do fundo do painel. */
export function shade(hex) {
  const channel = (i, bg) => Math.round(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) * 0.6 + bg * 0.4);
  return `#${[[0, 0x0e], [1, 0x0f], [2, 0x12]].map(([i, bg]) => channel(i, bg).toString(16).padStart(2, '0')).join('')}`;
}

/** "Deploy do site" → "DS"; "keycloak" → "KE"; ignora números e símbolos. */
const CONNECTORS = new Set(['a', 'o', 'e', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'em', 'com', 'para', 'por', 'the', 'of', 'and']);

export function initialsOf(name) {
  const words = (String(name ?? '').match(/\p{L}[\p{L}\p{N}]*/gu) ?? [])
    .filter((word) => !CONNECTORS.has(word.toLocaleLowerCase('pt-BR')));
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
  return letters ? letters.toLocaleUpperCase('pt-BR') : '?';
}

function svgRoot(style) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SPRITE_SIZE + ACC_COLS} ${SPRITE_SIZE}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `agent agent-${style}`);
  return svg;
}

function group(className) {
  const node = document.createElementNS(SVG_NS, 'g');
  node.setAttribute('class', className);
  return node;
}

function addAccessory(svg, accessory) {
  const glyph = accessory && ACCESSORIES[accessory];
  if (!glyph) return;
  const acc = group(`acc acc-${accessory}`);
  drawPattern(acc, glyph, SPRITE_SIZE, 0, 'currentColor');
  svg.appendChild(acc);
}

function spriteSvg(style, { id, project, accessory }) {
  const body = bodyColorFor(id);
  const fills = { k: INK, b: body, d: shade(body), w: style === 'astro' ? '#e8e4dc' : '#ffffff', a: accentFor(project) };
  const svg = svgRoot(style);
  const figure = group('figure');
  const mood = group('mood');
  const pupils = group('pupil');
  SPRITES[style].forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    if (ch === 's') mood.appendChild(rect(x, y, 'currentColor'));
    else if (ch === 'e') pupils.appendChild(rect(x, y, PUPIL));
    else figure.appendChild(rect(x, y, fills[ch]));
  }));
  figure.append(mood, pupils);
  const shut = SHUT_EYES[style];
  if (shut) {
    const lids = group('lids');
    shut.cols.forEach((x) => lids.appendChild(rect(x, shut.row, INK)));
    figure.appendChild(lids);
  }
  svg.appendChild(figure);
  addAccessory(svg, accessory);
  return svg;
}

function sigilShape(kind, size, attrs) {
  const center = SPRITE_SIZE / 2;
  const half = size / 2;
  const node = document.createElementNS(SVG_NS, kind === 'circle' ? 'circle' : kind === 'arch' ? 'path' : 'rect');
  if (kind === 'circle') {
    Object.assign(attrs, { cx: center, cy: center, r: half });
  } else if (kind === 'arch') {
    const left = center - half;
    const right = center + half;
    const bottom = center + half;
    Object.assign(attrs, { d: `M${left} ${bottom}V${center}A${half} ${half} 0 0 1 ${right} ${center}V${bottom}Z` });
  } else {
    Object.assign(attrs, { x: center - half, y: center - half, width: size, height: size, rx: size * 0.22 });
    if (kind === 'diamond') {
      Object.assign(attrs, { width: size * 0.78, height: size * 0.78, x: center - size * 0.39, y: center - size * 0.39, rx: size * 0.12 });
      attrs.transform = `rotate(45 ${center} ${center})`;
    }
  }
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function sigilSvg({ id, name, project, accessory }) {
  const svg = svgRoot('selo');
  const kind = sigilShapeFor(id);
  const figure = group('figure');
  figure.appendChild(sigilShape(kind, 11, { class: 'mood', fill: 'none', stroke: 'currentColor', 'stroke-width': 0.9 }));
  figure.appendChild(sigilShape(kind, 8.6, { fill: bodyColorFor(id) }));
  const text = document.createElementNS(SVG_NS, 'text');
  Object.entries({ x: 6, y: 6.15, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'initials' })
    .forEach(([key, value]) => text.setAttribute(key, String(value)));
  text.textContent = initialsOf(name);
  figure.appendChild(text);
  const dot = document.createElementNS(SVG_NS, 'circle');
  Object.entries({ cx: 10.2, cy: 1.8, r: 1.35, fill: accentFor(project), class: 'dot' })
    .forEach(([key, value]) => dot.setAttribute(key, String(value)));
  figure.appendChild(dot);
  svg.appendChild(figure);
  addAccessory(svg, accessory);
  return svg;
}

/**
 * O personagem da sessão no estilo escolhido.
 * @param {string} style um dos ids de AGENT_STYLES
 * @param {{ id: string, name?: string, project?: string, accessory?: string|null }} session
 */
export function agentSvg(style, { id, name = '', project = '', accessory = null }) {
  const chosen = normalizeStyle(style);
  if (chosen === 'clawd') return clawdSvg({ accessory });
  if (chosen === 'robo') return botSvg(id, { project, accessory });
  if (chosen === 'selo') return sigilSvg({ id, name, project, accessory });
  return spriteSvg(chosen, { id, project, accessory });
}
