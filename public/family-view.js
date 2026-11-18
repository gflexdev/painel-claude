// Bloco de família na grade: cabeçalho (quantas sessões, quem espera você, recolher) e os tiles dentro.
import { el } from './format.js';
import { familySummary } from './families.js';

const STORAGE_KEY = 'painel-claude-familias-recolhidas';
const MAX_SUBAGENT_CHIPS = 3;

function readCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

const collapsed = readCollapsed();

function saveCollapsed() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed].slice(-50)));
  } catch { /* sem armazenamento: vale até recarregar */ }
}

export function createFamilyBlock(id, onToggle) {
  const section = el('section', 'family');
  const header = el('header', 'family-head');
  const title = el('span', 'family-title');
  const alert = el('span', 'family-alert');
  const toggle = el('button', 'family-toggle');
  toggle.type = 'button';
  header.append(title, alert, toggle);
  const body = el('div', 'family-body');
  section.append(header, body);
  toggle.addEventListener('click', () => {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    saveCollapsed();
    onToggle();
  });

  return {
    section,
    body,
    /** Atualiza o cabeçalho; devolve se a família está recolhida. */
    update(members) {
      const summary = familySummary(members);
      const isCollapsed = collapsed.has(id);
      section.toggleAttribute('data-collapsed', isCollapsed);
      section.toggleAttribute('data-waiting', summary.waiting > 0);
      section.setAttribute('aria-label', `Família de ${members[0].session.name}, ${summary.total} sessões`);
      const agents = summary.subagents === 1 ? '1 subagente' : `${summary.subagents} subagentes`;
      title.textContent = `família · ${summary.total} sessões${summary.subagents ? ` · ◇ ${agents}` : ''}`;
      const waitingChild = summary.firstWaiting && summary.firstWaiting.id !== members[0].session.id ? summary.firstWaiting : null;
      alert.textContent = summary.waiting
        ? `● ${waitingChild ? `${waitingChild.name} espera você` : `${summary.waiting} esperando você`}`
        : '';
      toggle.textContent = isCollapsed ? `+${summary.total - 1} ▾` : 'recolher ▴';
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
      toggle.setAttribute('aria-label', isCollapsed ? 'Mostrar as sessões da família' : 'Recolher a família');
      return isCollapsed;
    },
  };
}

/** Etiquetas dos subagentes ativos no tile: "◇ Explore · lendo". */
export function subagentChips(session, activityWord) {
  const list = session.subagents ?? [];
  const chips = list.slice(0, MAX_SUBAGENT_CHIPS).map((agent) => {
    const doing = agent.status === 'waiting' ? 'esperando' : activityWord[agent.activity] ?? 'rodando';
    const chip = el('li', 'agent-chip', `◇ ${agent.type} · ${doing}`);
    chip.dataset.status = agent.status;
    if (agent.description) chip.title = agent.description;
    return chip;
  });
  const extra = (session.subagentCount ?? list.length) - chips.length;
  if (extra > 0) chips.push(el('li', 'agent-chip more', `+${extra}`));
  return chips;
}
