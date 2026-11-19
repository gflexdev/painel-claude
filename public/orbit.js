// Modo Mapa: a mesma hierarquia dos quadros (projeto → sessão → sessões que ela abriu) em órbita em volta de um
// núcleo (o robô do painel). Aqui fica só a conta, pura: a árvore e as posições na tela.

/** Tom do círculo: a situação da sessão, com "terminou e você não viu" separado de "parada". */
export const toneOf = (session) => (session.status === 'idle' && session.unseen ? 'unseen' : session.status);

/** Do mais urgente para o menos: é o tom que o círculo de um pai mostra. */
const URGENCY = ['waiting', 'error', 'unseen', 'working', 'idle', 'ended'];

function summarize(sessions) {
  const counts = { waiting: 0, error: 0, unseen: 0, working: 0, idle: 0, ended: 0 };
  sessions.forEach((session) => { counts[toneOf(session)] = (counts[toneOf(session)] ?? 0) + 1; });
  return { total: sessions.length, counts, tone: URGENCY.find((tone) => counts[tone] > 0) ?? 'idle' };
}

/** A mesma chave dos quadros por projeto (groups.js), para o pino valer nas duas visões. */
const groupKey = (session) => `${session.machine ?? ''}\u0000${session.project || ''}`;

/**
 * Sessões (já na ordem de urgência) → árvore: raiz → projetos → sessões → sessões filhas.
 * Cada nó leva `sessions` (ele e tudo que está embaixo), a contagem por situação e o tom mais urgente.
 */
export function buildTree(sessions) {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const kidsOf = new Map();
  const tops = [];
  sessions.forEach((session) => {
    const parent = session.parentId && session.parentId !== session.id && byId.has(session.parentId) ? session.parentId : null;
    if (parent) kidsOf.set(parent, [...(kidsOf.get(parent) ?? []), session]);
    else tops.push(session);
  });

  const seen = new Set();
  const sessionNode = (session) => {
    seen.add(session.id);
    const children = (kidsOf.get(session.id) ?? []).filter((kid) => !seen.has(kid.id)).map(sessionNode);
    const all = [session, ...children.flatMap((child) => child.sessions)];
    return { id: `s:${session.id}`, kind: 'session', label: session.name, session, children, sessions: all, ...summarize(all) };
  };
  const topNodes = tops.map(sessionNode);
  // Sessões presas num ciclo de "quem abriu quem" não têm topo: entram como topo para não sumirem.
  sessions.forEach((session) => { if (!seen.has(session.id)) topNodes.push(sessionNode(session)); });

  const projects = new Map();
  topNodes.forEach((node) => {
    const key = groupKey(node.session);
    const project = projects.get(key)
      ?? { id: `p:${key}`, kind: 'project', label: node.session.project || 'sem projeto', machine: node.session.machine ?? '', groupKey: key, children: [] };
    projects.set(key, { ...project, children: [...project.children, node] });
  });
  const projectNodes = [...projects.values()].map((project) => {
    const all = project.children.flatMap((child) => child.sessions);
    return { ...project, sessions: all, ...summarize(all) };
  });
  return { id: 'root', kind: 'root', label: 'Tudo', children: projectNodes, sessions, ...summarize(sessions) };
}

/** Raio (em px do mapa) de cada nível: projetos, sessões, filhas, netas; daí em diante, mais um passo fixo. */
const RADII = Object.freeze([0, 200, 370, 510, 640]);
const RADIUS_STEP = 115;
/** Espaço que cada folha pede no anel das sessões; com mais folhas que isso, o mapa todo cresce. */
const LEAF_ARC = 100;
/** Raio do núcleo no centro (o robô), em px do mapa. */
export const CORE_RADIUS = 70;
/** Fatia mínima de um projeto, em folhas: o nome dele precisa de espaço. */
const PROJECT_MIN = 1.6;
/** Níveis: 1 = projetos, 2 = mais as sessões, 3 = tudo (filhas, netas…). */
export const LEVELS = Object.freeze({ projetos: 1, sessoes: 2, filhas: 3 });
export const ALL_LEVELS = LEVELS.filhas;

const radiusOf = (depth) => (depth < RADII.length ? RADII[depth] : RADII[RADII.length - 1] + (depth - RADII.length + 1) * RADIUS_STEP);

/**
 * Árvore → posições de todos os círculos até o nível pedido, em leque em volta do centro (0, 0).
 * Cada nó ganha uma fatia do círculo proporcional ao que tem embaixo, e os filhos ficam dentro da fatia do pai.
 */
export function radialLayout(tree, levels = ALL_LEVELS) {
  const maxDepth = levels >= ALL_LEVELS ? Infinity : Math.max(1, levels);
  const kidsOf = (node, depth) => (depth < maxDepth ? node.children : []);
  const weights = new Map();
  const weigh = (node, depth) => {
    const below = kidsOf(node, depth).reduce((sum, child) => sum + weigh(child, depth + 1), 0);
    const weight = Math.max(depth === 1 ? PROJECT_MIN : 1, below);
    weights.set(node.id, weight);
    return weight;
  };
  const leaves = weigh(tree, 0);
  const grow = Math.max(1, (leaves * LEAF_ARC) / (2 * Math.PI * RADII[2]));

  const placed = [];
  const place = (node, depth, from, to, parent) => {
    const angle = (from + to) / 2;
    const r = radiusOf(depth) * grow;
    const item = { id: node.id, node, depth, angle, r, x: r * Math.cos(angle), y: r * Math.sin(angle), parent };
    if (depth > 0) placed.push(item);
    const kids = kidsOf(node, depth);
    const total = kids.reduce((sum, child) => sum + weights.get(child.id), 0);
    let start = from;
    kids.forEach((child) => {
      const span = ((to - from) * weights.get(child.id)) / total;
      place(child, depth + 1, start, start + span, depth > 0 ? item : null);
      start += span;
    });
  };
  // Começa no alto e dá a volta inteira.
  place(tree, 0, -Math.PI / 2, (3 * Math.PI) / 2, null);
  const radius = placed.reduce((max, item) => Math.max(max, item.r), RADII[1]);
  // Caixa que contém tudo (com o núcleo no meio), para a tela enquadrar o que existe.
  const bounds = placed.reduce((box, item) => ({
    minX: Math.min(box.minX, item.x), maxX: Math.max(box.maxX, item.x), minY: Math.min(box.minY, item.y), maxY: Math.max(box.maxY, item.y),
  }), { minX: -CORE_RADIUS, maxX: CORE_RADIUS, minY: -CORE_RADIUS, maxY: CORE_RADIUS });
  return { nodes: placed, radius, bounds, deepest: placed.reduce((max, item) => Math.max(max, item.depth), 0) };
}
