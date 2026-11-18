// Famílias de sessões: uma sessão e as que ela abriu no app do Claude (campo parentId do snapshot).
// Puro: recebe a lista já ordenada pelo servidor (mais urgente primeiro) e devolve os itens da grade.

const MAX_DEPTH = 8;

/** Raiz da família dentro do snapshot (sobe pelos pais presentes; para em ciclo ou pai ausente). */
function rootOf(session, byId, order) {
  let current = session;
  const path = [current];
  for (let i = 0; i < MAX_DEPTH; i += 1) {
    const parent = current.parentId && byId.get(current.parentId);
    if (!parent) return current;
    if (path.includes(parent)) {
      // Ciclo: a raiz é o membro do ciclo que vem primeiro na ordem, igual para todos.
      const cycle = path.slice(path.indexOf(parent));
      return cycle.reduce((a, b) => (order.get(a.id) <= order.get(b.id) ? a : b));
    }
    path.push(parent);
    current = parent;
  }
  return current;
}

/**
 * @returns {Array<{ kind: 'single', session } | { kind: 'family', id, members: Array<{ session, level }> }>}
 * A família ocupa a posição do membro mais urgente; dentro dela vem a raiz e depois as filhas em árvore.
 */
export function groupFamilies(sessions) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const order = new Map(sessions.map((s, i) => [s.id, i]));
  const childrenOf = new Map();
  const rootIds = new Map();
  sessions.forEach((session) => {
    const root = rootOf(session, byId, order);
    rootIds.set(session.id, root.id);
    if (session.id !== root.id && byId.has(session.parentId)) {
      childrenOf.set(session.parentId, [...(childrenOf.get(session.parentId) ?? []), session]);
    }
  });

  const walk = (session, level, out) => {
    if (out.some((m) => m.session.id === session.id)) return out;
    out.push({ session, level });
    [...(childrenOf.get(session.id) ?? [])]
      .sort((a, b) => order.get(a.id) - order.get(b.id))
      .forEach((child) => walk(child, level + 1, out));
    return out;
  };

  const items = [];
  const placed = new Set();
  sessions.forEach((session) => {
    const rootId = rootIds.get(session.id);
    if (placed.has(rootId)) return;
    placed.add(rootId);
    const members = walk(byId.get(rootId), 0, []);
    items.push(members.length > 1
      ? { kind: 'family', id: rootId, members }
      : { kind: 'single', session: members[0].session });
  });
  return items;
}

/** Resumo do cabeçalho da família: quantas sessões e quem precisa de você. */
export function familySummary(members) {
  const waiting = members.filter((m) => m.session.status === 'waiting');
  return {
    total: members.length,
    waiting: waiting.length,
    firstWaiting: waiting[0]?.session ?? null,
    subagents: members.reduce((sum, m) => sum + (m.session.subagentCount ?? 0), 0),
  };
}
