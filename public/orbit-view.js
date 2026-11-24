// Modo Mapa (proposta 4): projetos em volta do núcleo (o robô do painel) e as sessões em órbita em volta do
// projeto, com o personagem escolhido. As linhas têm a cor da situação; quem espera você pulsa em vermelho.
// Controles embaixo à esquerda: até que nível mostrar, zoom e "caber na tela". Tocar numa sessão abre o detalhe.
import { ACTIVITY_WORD, STATUS_WORD, accessoryOf, el } from './format.js';
import { ALL_LEVELS, LEVELS, radialLayout } from './orbit.js';
import { readPref, writePref } from './prefs.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LEVELS_KEY = 'painel-claude-mapa-nivel';
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const FIT_MARGIN = 110;
/** Espaço da barra de controle embaixo, para o mapa não ficar por baixo dela. */
const TOOLS_SPACE = 70;
const DRAG_START = 5;
const STEP = 1.25;
const MIN_HEIGHT = 380;
const TONE_WORD = Object.freeze({ waiting: 'esperando', error: 'com erro', unseen: 'para ver', working: 'rodando' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};

function subline(node) {
  // Projeto: só a situação mais urgente (o total vai no selo), para caber na pílula.
  if (node.kind !== 'session') {
    const tone = Object.keys(TONE_WORD).find((t) => node.counts[t]);
    return tone ? `${node.counts[tone]} ${TONE_WORD[tone]}` : plural(node.total, 'sessão', 'sessões');
  }
  const { session } = node;
  if (session.permission) return 'aprovar?';
  if (session.status === 'idle' && session.unseen) return 'terminou · ver';
  if (session.status === 'working' && session.activity) return ACTIVITY_WORD[session.activity] ?? 'rodando';
  return STATUS_WORD[session.status] ?? session.status;
}

/** Em tela larga o leque vira uma elipse deitada, para usar a largura; `wide` é esse fator (1 = círculo). */
let wide = 1;
const polar = (angle, r) => [r * Math.cos(angle) * wide, r * Math.sin(angle)];
/** Curva do pai (ou do núcleo) até o filho, que sai e chega "em pé" em relação ao centro, como galhos. */
function branchPath(item) {
  const from = item.parent ?? { angle: item.angle, r: 0 };
  const mid = (from.r + item.r) / 2;
  const [x1, y1] = polar(from.angle, Math.max(from.r, 72));
  const [c1x, c1y] = polar(from.angle, mid);
  const [c2x, c2y] = polar(item.angle, mid);
  const fix = (n) => n.toFixed(1);
  return `M${fix(x1)} ${fix(y1)} C${fix(c1x)} ${fix(c1y)} ${fix(c2x)} ${fix(c2y)} ${fix(item.x * wide)} ${fix(item.y)}`;
}

/** O personagem do núcleo: sempre o mesmo, o do próprio painel. */
const CORE_SEED = Object.freeze({ id: 'painel-claude', name: 'Painel Claude', project: 'painel-claude', accessory: null });

/**
 * @param {{ stage: HTMLElement, avatar: Function & { key: () => string },
 *   onOpenSession: (session: object) => void, pinned: () => string[] }} options
 * `avatar(seed)` desenha o personagem escolhido (nos círculos e no núcleo); `avatar.key()` muda quando o estilo muda.
 */
export function createOrbit({ stage, avatar, onOpenSession, pinned = () => [] }) {
  const world = el('div', 'orbit-world');
  const links = svg('svg', { class: 'orbit-links', 'aria-hidden': 'true' });
  const rings = el('div', 'orbit-rings');
  rings.setAttribute('aria-hidden', 'true');
  const nucleus = el('div', 'orbit-core');
  const coreFace = el('div', 'orbit-core-face');
  coreFace.setAttribute('aria-hidden', 'true');
  let coreKey = '';
  const coreCount = el('span', 'orbit-core-count');
  nucleus.append(coreFace, coreCount);
  const orbs = el('div', 'orbit-orbs');
  world.append(rings, links, nucleus, orbs);

  const tools = el('div', 'orbit-tools');
  tools.append(el('span', 'orbit-tools-label', 'mostrar até'));
  const levelBox = el('div', 'orbit-levels');
  levelBox.setAttribute('role', 'group');
  levelBox.setAttribute('aria-label', 'Até que nível mostrar');
  const levelButtons = [['projetos', LEVELS.projetos], ['sessões', LEVELS.sessoes], ['filhas', LEVELS.filhas]].map(([label, level]) => {
    const button = el('button', 'orbit-btn', label);
    button.type = 'button';
    button.dataset.level = String(level);
    button.addEventListener('click', () => setLevels(level));
    levelBox.append(button);
    return button;
  });
  const zoomOut = el('button', 'orbit-btn square', '−');
  const zoomIn = el('button', 'orbit-btn square', '+');
  const zoomFit = el('button', 'orbit-btn', 'caber na tela');
  [zoomOut, zoomIn, zoomFit].forEach((button) => { button.type = 'button'; });
  zoomOut.setAttribute('aria-label', 'Diminuir o zoom');
  zoomIn.setAttribute('aria-label', 'Aumentar o zoom');
  tools.append(levelBox, zoomOut, zoomIn, zoomFit);
  const hint = el('p', 'orbit-hint', 'Tocar numa sessão abre o painel lateral; arrastar move o mapa.');
  stage.append(world, tools, hint);

  let tree = null;
  const storedLevel = Number(readPref(LEVELS_KEY, LEVELS.sessoes));
  let levels = storedLevel >= 1 && storedLevel <= ALL_LEVELS ? storedLevel : LEVELS.sessoes;
  let bounds = { minX: -400, maxX: 400, minY: -400, maxY: 400 };
  const view = { k: 1, x: 0, y: 0 };
  /** Enquanto a pessoa não mexe, o mapa se ajusta sozinho ao tamanho da tela e ao que há para mostrar. */
  let auto = true;
  let selectedId = null;
  const parts = new Map();
  const lines = new Map();

  // ---------- zoom e arrasto ----------
  const applyView = () => { world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; };
  function fit() {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    const boxWidth = (bounds.maxX - bounds.minX) * wide + 2 * FIT_MARGIN;
    const boxHeight = bounds.maxY - bounds.minY + 2 * FIT_MARGIN;
    view.k = clamp(Math.min(width / boxWidth, (height - TOOLS_SPACE) / boxHeight), MIN_ZOOM, 1.3);
    view.x = width / 2 - ((bounds.minX + bounds.maxX) / 2) * wide * view.k;
    view.y = (height - TOOLS_SPACE) / 2 - ((bounds.minY + bounds.maxY) / 2) * view.k;
    auto = true;
    applyView();
  }
  function zoomAt(cx, cy, factor) {
    const next = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
    view.x = cx - (cx - view.x) * (next / view.k);
    view.y = cy - (cy - view.y) * (next / view.k);
    view.k = next;
    auto = false;
    applyView();
  }
  const middle = () => { const box = stage.getBoundingClientRect(); return [box.width / 2, box.height / 2]; };
  const local = (event) => { const box = stage.getBoundingClientRect(); return [event.clientX - box.left, event.clientY - box.top]; };

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    const [cx, cy] = local(event);
    // Pinça do trackpad chega como roda + ctrl; dois dedos arrastando, como rolagem miúda (move o mapa).
    if (event.ctrlKey || event.metaKey || event.deltaMode !== 0) {
      zoomAt(cx, cy, Math.exp(-(event.deltaMode !== 0 ? event.deltaY * 16 : event.deltaY) * 0.01));
      return;
    }
    view.x -= event.deltaX;
    view.y -= event.deltaY;
    auto = false;
    applyView();
  }, { passive: false });

  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let dragged = false;
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.orbit-tools')) return;
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 1) { drag = { at: local(event), moved: false }; dragged = false; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 };
      drag = null;
    }
  });
  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const now = local(event);
    pointers.set(event.pointerId, now);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, distance / pinch.distance);
      pinch.distance = distance;
      dragged = true;
      return;
    }
    if (!drag) return;
    const dx = now[0] - drag.at[0];
    const dy = now[1] - drag.at[1];
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_START) return;
    if (!drag.moved) {
      drag.moved = true;
      dragged = true;
      stage.setPointerCapture(event.pointerId);
      stage.setAttribute('data-dragging', '');
    }
    view.x += dx;
    view.y += dy;
    drag.at = now;
    auto = false;
    applyView();
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) { drag = null; stage.removeAttribute('data-dragging'); }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  // Soltar depois de arrastar não conta como toque num círculo.
  stage.addEventListener('click', (event) => {
    if (!dragged) return;
    dragged = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);

  zoomIn.addEventListener('click', () => zoomAt(...middle(), STEP));
  zoomOut.addEventListener('click', () => zoomAt(...middle(), 1 / STEP));
  zoomFit.addEventListener('click', fit);
  new ResizeObserver(() => { if (tree && !stage.hidden) render(tree); }).observe(stage);
  window.addEventListener('resize', () => { if (tree && !stage.hidden) render(tree); });

  // ---------- círculos ----------
  function setLevels(next) {
    levels = next;
    writePref(LEVELS_KEY, next);
    auto = true;
    if (tree) render(tree);
  }

  function createOrb(id) {
    const button = el('button', 'orb');
    button.type = 'button';
    const disc = el('span', 'orb-disc');
    const face = el('span', 'orb-face');
    const badge = el('span', 'orb-badge');
    disc.append(face, badge);
    const label = el('span', 'orb-label');
    const name = el('b', 'orb-name');
    const sub = el('span', 'orb-sub');
    label.append(name, sub);
    button.append(disc, label);
    const orb = { button, face, badge, name, sub, faceKey: '', item: null };
    button.addEventListener('click', () => activate(orb.item));
    parts.set(id, orb);
    orbs.append(button);
    return orb;
  }

  function fillOrb(orb, item, pins) {
    const { node } = item;
    orb.item = item;
    orb.button.dataset.tone = node.tone;
    orb.button.dataset.kind = node.kind;
    orb.button.dataset.depth = String(Math.min(item.depth, 4));
    orb.button.style.left = `${(item.x * wide).toFixed(1)}px`;
    orb.button.style.top = `${item.y.toFixed(1)}px`;
    orb.button.toggleAttribute('data-pinned', node.kind === 'project' && pins.includes(node.groupKey));
    orb.button.toggleAttribute('data-selected', node.kind === 'session' && node.session.id === selectedId);
    orb.name.textContent = node.kind === 'project' && node.machine ? `${node.label} · ${node.machine}` : node.label;
    orb.sub.textContent = subline(node);
    // Projeto: quantas sessões, no selo. Sessão: o personagem.
    orb.badge.textContent = node.kind === 'session' ? '' : String(node.total);
    orb.badge.hidden = node.kind === 'session';
    orb.button.setAttribute('aria-label', `${node.label}: ${orb.sub.textContent}. ${node.kind === 'session' ? 'Toque para abrir o detalhe.' : 'Toque para aproximar.'}`);
    if (node.kind !== 'session') {
      orb.face.replaceChildren();
      orb.faceKey = '';
      return;
    }
    const { session } = node;
    const faceKey = `${session.id}|${session.name}|${session.project}|${accessoryOf(session)}|${avatar.key()}`;
    if (orb.faceKey !== faceKey) {
      orb.faceKey = faceKey;
      orb.face.replaceChildren(avatar({ id: session.id, name: session.name, project: session.project, accessory: accessoryOf(session) }));
    }
  }

  /** Sessão: abre o detalhe. Projeto: aproxima o mapa nele. */
  function activate(item) {
    if (!item) return;
    if (item.node.kind === 'session') { onOpenSession(item.node.session); return; }
    const [cx, cy] = middle();
    view.k = clamp(Math.max(view.k, 1.1), MIN_ZOOM, MAX_ZOOM);
    view.x = cx - item.x * wide * view.k;
    view.y = cy - item.y * view.k;
    auto = false;
    applyView();
  }

  function drawLine(item) {
    const line = lines.get(item.id) ?? (() => {
      const path = svg('path');
      links.append(path);
      const created = { path, d: '' };
      lines.set(item.id, created);
      return created;
    })();
    const d = branchPath(item);
    if (line.d !== d) {
      line.d = d;
      line.path.setAttribute('d', d);
    }
    line.path.setAttribute('data-tone', item.node.tone);
    line.path.setAttribute('data-depth', String(Math.min(item.depth, 4)));
  }

  function drawRings(layout) {
    const radii = [...new Set(layout.nodes.filter((n) => n.depth <= 2).map((n) => Math.round(n.r)))];
    rings.replaceChildren(...radii.map((r) => {
      const ring = el('span', 'orbit-ring');
      ring.style.width = `${2 * r * wide}px`;
      ring.style.height = `${2 * r}px`;
      return ring;
    }));
  }

  /** O mapa ocupa o que sobra da tela abaixo dele (a barra de uso muda de altura). */
  function fitHeight() {
    const top = stage.getBoundingClientRect().top;
    const height = `${Math.max(MIN_HEIGHT, Math.round(window.innerHeight - top - 20))}px`;
    if (stage.style.height !== height) stage.style.height = height;
  }

  function render(nextTree) {
    tree = nextTree;
    fitHeight();
    const box = stage.getBoundingClientRect();
    wide = box.height ? clamp((box.width / box.height) * 0.8, 1, 1.7) : 1;
    // Projetos fixados (o mesmo pino dos quadros) vêm primeiro, a partir do alto, e ficam em destaque.
    const pins = pinned();
    const rank = (node) => { const at = pins.indexOf(node.groupKey); return at === -1 ? pins.length : at; };
    const ordered = {
      ...tree,
      children: tree.children.map((node, order) => ({ node, order }))
        .sort((a, b) => rank(a.node) - rank(b.node) || a.order - b.order).map(({ node }) => node),
    };
    const layout = radialLayout(ordered, levels);
    bounds = layout.bounds;
    const shown = new Set(layout.nodes.map((item) => item.id));
    stage.dataset.tone = tree.tone;
    coreCount.textContent = plural(tree.total, 'sessão', 'sessões');
    nucleus.dataset.tone = tree.tone;
    if (coreKey !== avatar.key()) {
      coreKey = avatar.key();
      coreFace.replaceChildren(avatar(CORE_SEED));
    }
    nucleus.setAttribute('aria-label', `Núcleo: ${coreCount.textContent}`);
    levelButtons.forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.level) === levels)));
    drawRings(layout);
    layout.nodes.forEach((item) => {
      fillOrb(parts.get(item.id) ?? createOrb(item.id), item, pins);
      drawLine(item);
    });
    [...parts.keys()].filter((id) => !shown.has(id)).forEach((id) => { parts.get(id).button.remove(); parts.delete(id); });
    [...lines.keys()].filter((id) => !shown.has(id)).forEach((id) => { lines.get(id).path.remove(); lines.delete(id); });
    if (auto) fit(); else applyView();
  }

  return {
    render,
    /** Marca a sessão aberta no painel lateral. */
    select(id) {
      selectedId = id;
      parts.forEach((orb) => orb.button.toggleAttribute('data-selected', orb.item?.node.kind === 'session' && orb.item.node.session.id === id));
    },
    /** O mapa saiu da tela (nada a parar hoje: as animações são de CSS). */
    pause() {},
  };
}
