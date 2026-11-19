// Quadros por projeto (proposta 4): agrupa os itens da grade (sessões soltas e famílias) por projeto e máquina,
// conta as situações de cada quadro, calcula a largura e põe os fixados primeiro. Puro, para os testes e para
// outras telas usarem.
const NO_PROJECT = 'sem projeto';

export const groupKeyOf = (session) => `${session.machine ?? ''}\u0000${session.project || ''}`;

/** Quantas sessões estão em cada situação (as mesmas dos contadores do topo). */
export function countsOf(sessions) {
  const count = (predicate) => sessions.filter(predicate).length;
  return {
    waiting: count((s) => s.status === 'waiting'),
    error: count((s) => s.status === 'error'),
    unseen: count((s) => s.status === 'idle' && s.unseen),
    working: count((s) => s.status === 'working'),
    idle: count((s) => s.status === 'idle' && !s.unseen),
  };
}

/** Rótulos dos contadores do quadro, só os que não são zero: "1 esperando", "2 rodando", "1 para ver"… */
export function countLabels(counts) {
  const words = [
    ['waiting', 'esperando', 'esperando'],
    ['error', 'com erro', 'com erro'],
    ['unseen', 'para ver', 'para ver'],
    ['working', 'rodando', 'rodando'],
    ['idle', 'parada', 'paradas'],
  ];
  return words.filter(([status]) => counts[status] > 0)
    .map(([status, one, many]) => ({ status, text: `${counts[status]} ${counts[status] === 1 ? one : many}` }));
}

/**
 * Itens da grade (já na ordem de urgência) → quadros por projeto e máquina. Cada item leva `session` (a principal,
 * que decide o projeto) e `sessions` (todas as dele, para a conta). O quadro fica na posição do item mais urgente.
 */
export function groupItems(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = groupKeyOf(item.session);
    const group = groups.get(key)
      ?? { key, label: item.session.project || NO_PROJECT, machine: item.session.machine ?? '', items: [], sessions: [] };
    groups.set(key, { ...group, items: [...group.items, item], sessions: [...group.sessions, ...item.sessions] });
  });
  return [...groups.values()].map((group) => ({ ...group, counts: countsOf(group.sessions) }));
}

/**
 * Quantas colunas da grade o quadro ocupa: o mínimo de linhas que cabe na tela e, com essas linhas, a menor
 * largura. 9 sessões em 7 colunas viram 5 de largura (2 linhas), e sobra lugar ao lado.
 */
export function spanOf(count, columns) {
  const cols = Math.max(1, columns);
  const rows = Math.ceil(Math.max(1, count) / cols);
  return Math.min(cols, Math.ceil(Math.max(1, count) / rows));
}

/** Quadros fixados vão para o começo, na ordem em que foram fixados; os outros seguem na ordem de urgência. */
export function pinnedFirst(groups, pinned) {
  const rank = (group) => {
    const index = pinned.indexOf(group.key);
    return index === -1 ? pinned.length : index;
  };
  return groups.map((group, order) => ({ group, order }))
    .sort((a, b) => rank(a.group) - rank(b.group) || a.order - b.order)
    .map(({ group }) => group);
}

/**
 * O que aparece nos quadros, na grade e no mapa: arquivadas no painel ficam de fora, e as de tarefa agendada
 * também, se o aparelho escondeu. Quem espera você aparece sempre.
 */
export function visibleSessions(sessions, { showScheduled = true } = {}) {
  return sessions.filter((s) => s.status === 'waiting' || (!s.archived && (showScheduled || !s.scheduled)));
}
