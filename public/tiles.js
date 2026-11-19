// O quadrado de uma sessão (tile): personagem, nome, projeto, o que está fazendo, situação e tempo.
// Também a forma dele numa família (proposta 3): solto, família fechada (cartas e barrinhas) ou membro da aberta.
import { agentSvg } from './agents.js';
import { fillStrip, stripLabel, subagentChips } from './family-view.js';
import { ACTIVITY_WORD, STATUS_WORD, accessoryOf, el, elapsed, tokens } from './format.js';

export function statusWord(session) {
  if (session.permission) {
    if (session.permission.agentType) return `aprovar? · ◇ ${session.permission.agentType}`;
    const verb = session.permission.kind === 'question' ? 'responder' : session.permission.kind === 'plan' ? 'aprovar plano' : 'aprovar?';
    return session.permission.count > 1 ? `${verb} (${session.permission.count})` : verb;
  }
  if (session.status === 'idle' && session.unseen) return 'terminou · ver';
  if (session.status === 'working' && session.activity) return ACTIVITY_WORD[session.activity] ?? 'rodando';
  return STATUS_WORD[session.status] ?? session.status;
}

/**
 * @param {{ agentStyle: () => string, serverNow: () => number, onClick: (tile: object) => void }} options
 */
export function createTiles({ agentStyle, serverNow, onClick }) {
  const tiles = new Map();

  function createTile(session) {
    const button = el('button', 'tile');
    button.type = 'button';
    const bot = el('div', 'bot');
    const lineage = el('span', 'lineage');
    const name = el('h2', 'name');
    const project = el('div', 'project');
    const detailLine = el('div', 'detail-line');
    const agents = el('ul', 'agent-chips');
    const strip = el('div', 'tile-strip');
    const badge = el('span', 'tile-badge');
    const statusLine = el('div', 'status-line');
    const word = el('span', 'status-word');
    const time = el('span', 'elapsed');
    statusLine.append(word, time);
    button.append(bot, lineage, name, project, detailLine, agents, strip, statusLine, badge);
    const tile = {
      id: session.id, session, button, bot, lineage, name, project, detail: detailLine, agents, strip, badge, word, time, botKey: '', closedFamily: false,
    };
    button.addEventListener('click', () => onClick(tile));
    return tile;
  }

  function updateTile(tile, session) {
    const accessory = accessoryOf(session);
    const style = agentStyle();
    const botKey = `${style}|${session.name}|${session.project}|${accessory}`;
    if (tile.botKey !== botKey) {
      tile.bot.replaceChildren(agentSvg(style, { id: session.id, name: session.name, project: session.project, accessory }));
      tile.botKey = botKey;
    }
    tile.session = session;
    tile.button.dataset.status = session.status;
    tile.button.toggleAttribute('data-stale', session.stale);
    tile.button.toggleAttribute('data-unseen', session.status === 'idle' && session.unseen);
    tile.name.textContent = session.name;
    const projectText = [session.project, session.origin, session.contextTokens ? `${tokens(session.contextTokens)} ctx` : '']
      .filter(Boolean).join(' · ');
    // Sessão de outra máquina (ex.: vps-dev) leva a marca na frente; a de tarefa agendada, o relógio.
    tile.project.replaceChildren(
      ...(session.machine ? [el('span', 'machine', session.machine), ' '] : []),
      ...(session.scheduled ? [el('span', 'scheduled-mark', '⏱'), ' '] : []),
      projectText,
    );
    if (session.scheduled) tile.project.title = 'Sessão de uma tarefa agendada do app do Claude';
    else tile.project.removeAttribute('title');
    tile.button.toggleAttribute('data-remote', Boolean(session.machine));
    tile.detail.textContent = session.stale ? `sem sinal há ${elapsed(session.lastEventAt, serverNow())}` : session.detail;
    tile.lineage.textContent = session.parentId ? `${'↳'.repeat(Math.min(session.depth ?? 1, 3))} sessão filha` : '';
    tile.lineage.hidden = !session.parentId;
    tile.button.toggleAttribute('data-child', Boolean(session.parentId));
    tile.word.textContent = statusWord(session);
    tile.time.textContent = elapsed(session.since, serverNow());
    const extra = session.scheduled ? ', tarefa agendada' : '';
    tile.button.setAttribute('aria-label', `${session.name}: ${tile.word.textContent}, ${session.detail}${extra}`);
  }

  /** O tile da sessão (cria na primeira vez) já atualizado; `seen` junta quem apareceu neste desenho. */
  function tileFor(session, seen) {
    seen.add(session.id);
    const tile = tiles.get(session.id) ?? createTile(session);
    tiles.set(session.id, tile);
    updateTile(tile, session);
    return tile;
  }

  /**
   * Como o quadrado aparece: 'single' (solto: faixa só com losangos), 'closed' (família fechada: cartas,
   * barrinhas, selo) ou 'member' (dentro da família aberta: papel em cima e etiquetas de subagente).
   */
  function setMode(tile, session, mode, members = []) {
    const kids = mode === 'closed' ? members.slice(1).map((m) => m.session) : [];
    const subagents = mode === 'closed'
      ? members.reduce((sum, m) => sum + (m.session.subagentCount ?? 0), 0)
      : session.subagentCount ?? 0;
    tile.closedFamily = mode === 'closed';
    tile.button.toggleAttribute('data-family', mode === 'closed');
    tile.button.toggleAttribute('data-member', mode === 'member');
    if (mode === 'closed') tile.button.setAttribute('aria-expanded', 'false');
    else tile.button.removeAttribute('aria-expanded');

    fillStrip(tile.strip, {
      kids,
      subagents: mode !== 'member' ? subagents : 0,
      label: stripLabel({ kids, subagents, firstAgent: session.subagents?.[0], activityWord: ACTIVITY_WORD }),
    });
    tile.agents.replaceChildren(...(mode === 'member' ? subagentChips(session, ACTIVITY_WORD) : []));
    tile.agents.hidden = !tile.agents.children.length;

    const waitingKids = kids.filter((s) => s.status === 'waiting').length;
    tile.badge.textContent = waitingKids ? String(waitingKids) : '';
    tile.badge.hidden = !waitingKids;
    if (waitingKids) tile.badge.setAttribute('aria-label', `${waitingKids} sessão de dentro espera você`);

    if (mode === 'member') {
      tile.lineage.textContent = session.parentId ? `${'↳'.repeat(Math.min(session.depth ?? 1, 3))} sessão filha` : 'principal';
      tile.lineage.hidden = false;
    }
    if (mode === 'closed') tile.button.setAttribute('aria-label', `${session.name}: família com ${kids.length + 1} sessões. Toque para abrir.`);
  }

  return {
    tileFor,
    setMode,
    get: (id) => tiles.get(id),
    /** Esquece (e tira da tela) quem não apareceu no último desenho. */
    prune(seen) {
      [...tiles.keys()].filter((id) => !seen.has(id)).forEach((id) => {
        tiles.get(id).button.remove();
        tiles.delete(id);
      });
    },
    forEach: (fn) => tiles.forEach(fn),
    /** O estilo do personagem mudou: redesenha todos na próxima vez. */
    resetFaces: () => tiles.forEach((tile) => { tile.botKey = ''; }),
    /** Marca o tile da sessão aberta no painel lateral. */
    select: (id) => tiles.forEach((tile, tileId) => tile.button.toggleAttribute('data-selected', tileId === id)),
  };
}
