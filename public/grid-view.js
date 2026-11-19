// Modos Quadros e Grade: os itens da grade (sessões soltas e famílias da proposta 3) direto na grade, ou dentro
// de um quadro por projeto. Famílias abertas, quadros recolhidos e fixados valem por aparelho.
import { groupFamilies } from './families.js';
import { createFamilyBlock } from './family-view.js';
import { groupItems, pinnedFirst, spanOf } from './groups.js';
import { createBoard } from './boards.js';
import { readList, writePref } from './prefs.js';

const OPEN_FAMILIES_KEY = 'painel-claude-familias-abertas';
const COLLAPSED_KEY = 'painel-claude-quadros-recolhidos';
const PINNED_KEY = 'painel-claude-quadros-fixados';
const MAX_KEPT = 100;

/** Deixa `parent` com exatamente estes filhos, nesta ordem, mexendo só no que está fora do lugar. */
function place(parent, nodes) {
  nodes.forEach((node, index) => {
    if (parent.children[index] !== node) parent.insertBefore(node, parent.children[index] ?? null);
  });
  while (parent.children.length > nodes.length) parent.lastElementChild.remove();
}

/**
 * @param {{ grid: HTMLElement, ruler: HTMLElement, tiles: object, onChange: () => void }} options
 * `tiles` vem de createTiles; `onChange` pede um desenho novo (ex.: abriu uma família).
 */
export function createGridView({ grid, ruler, tiles, onChange }) {
  let openFamilies = new Set(readList(OPEN_FAMILIES_KEY));
  let collapsed = new Set(readList(COLLAPSED_KEY));
  let pinned = readList(PINNED_KEY);
  const families = new Map();
  const boards = new Map();
  let shownColumns = 0;
  let grouped = true;

  const saveSet = (key, set) => writePref(key, [...set].slice(-MAX_KEPT));
  const toggleIn = (set, id, on) => {
    const next = new Set(set);
    if (on) next.add(id); else next.delete(id);
    return next;
  };

  /** Família fechada tocada: abre no lugar (várias podem ficar abertas). */
  function openFamily(id) {
    openFamilies = toggleIn(openFamilies, id, true);
    saveSet(OPEN_FAMILIES_KEY, openFamilies);
    onChange();
    families.get(id)?.section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function closeFamily(id) {
    openFamilies = toggleIn(openFamilies, id, false);
    saveSet(OPEN_FAMILIES_KEY, openFamilies);
    onChange();
  }
  const handlers = {
    onToggle(key) {
      collapsed = toggleIn(collapsed, key, !collapsed.has(key));
      saveSet(COLLAPSED_KEY, collapsed);
      onChange();
    },
    onPin(key) {
      pinned = pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key];
      writePref(PINNED_KEY, pinned.slice(-MAX_KEPT));
      onChange();
    },
  };

  /** Colunas que cabem agora: conta as trilhas de uma grade vazia (a régua), que o CSS decide. */
  function gridColumns() {
    const tracks = getComputedStyle(ruler).gridTemplateColumns.split(' ').filter((t) => t.endsWith('px'));
    return Math.max(1, tracks.length);
  }

  /** Cada item da grade vira um nó: quadrado solto, quadrado de família fechada ou bloco da família aberta. */
  function buildItems(sessions, seen) {
    return groupFamilies(sessions).map((item) => {
      if (item.kind === 'single') {
        const tile = tiles.tileFor(item.session, seen);
        tiles.setMode(tile, item.session, 'single');
        return { node: tile.button, session: item.session, sessions: [item.session], wide: false };
      }
      const [root, ...children] = item.members;
      const all = item.members.map((m) => m.session);
      if (!openFamilies.has(item.id)) {
        const tile = tiles.tileFor(root.session, seen);
        tiles.setMode(tile, root.session, 'closed', item.members);
        children.forEach(({ session }) => tiles.tileFor(session, seen).button.remove());
        return { node: tile.button, session: root.session, sessions: all, wide: false };
      }
      const block = families.get(item.id) ?? createFamilyBlock(() => closeFamily(item.id));
      families.set(item.id, block);
      block.update(item.members);
      const rootTile = tiles.tileFor(root.session, seen);
      tiles.setMode(rootTile, root.session, 'member');
      place(block.rootSlot, [rootTile.button]);
      place(block.kids, children.map(({ session }) => {
        const tile = tiles.tileFor(session, seen);
        tiles.setMode(tile, session, 'member');
        return tile.button;
      }));
      return { node: block.section, session: root.session, sessions: all, wide: true, familyId: item.id };
    });
  }

  function renderBoards(items) {
    const groups = pinnedFirst(groupItems(items), pinned);
    const columns = gridColumns();
    shownColumns = columns;
    const keys = new Set(groups.map((group) => group.key));
    [...boards.keys()].filter((key) => !keys.has(key)).forEach((key) => boards.delete(key));
    place(grid, groups.map((group) => {
      const board = boards.get(group.key) ?? createBoard(group.key, handlers);
      boards.set(group.key, board);
      const isCollapsed = collapsed.has(group.key);
      const isPinned = pinned.includes(group.key);
      // Fixado ou com família aberta ocupa a linha toda; recolhido, uma coluna; senão, o que os quadrados pedem.
      const wide = isPinned || (!isCollapsed && group.items.some((item) => item.wide));
      const span = wide ? columns : isCollapsed ? 1 : spanOf(group.items.length, columns);
      board.update(group, { collapsed: isCollapsed, pinned: isPinned, span });
      place(board.body, isCollapsed ? [] : group.items.map((item) => item.node));
      return board.section;
    }));
  }

  return {
    openFamily,
    pinned: () => pinned,
    /** Desenha as sessões visíveis, em quadros (`grouped`) ou direto na grade. */
    render(sessions, { grouped: asBoards }) {
      grouped = asBoards;
      const seen = new Set();
      const items = buildItems(sessions, seen);
      const openIds = new Set(items.filter((i) => i.familyId).map((i) => i.familyId));
      [...families.keys()].filter((id) => !openIds.has(id)).forEach((id) => {
        families.get(id).section.remove();
        families.delete(id);
      });
      grid.toggleAttribute('data-grouped', grouped);
      if (grouped) renderBoards(items);
      else {
        boards.clear();
        place(grid, items.map((item) => item.node));
      }
      tiles.prune(seen);
    },
    /** A janela mudou de largura: os quadros precisam de outra largura se o número de colunas mudou. */
    needsResize: () => grouped && gridColumns() !== shownColumns,
  };
}
