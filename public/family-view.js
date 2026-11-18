// Famílias na grade (proposta 3 do Claude Design):
// - fechada: o quadrado da sessão principal, com cartas atrás, uma barrinha por sessão de dentro, losangos dos
//   subagentes e um selo quando alguém de dentro espera você;
// - aberta: um bloco no lugar, com a principal, a linha ligando às filhas e as etiquetas dos subagentes.
import { el } from './format.js';
import { familySummary } from './families.js';

const MAX_SUBAGENT_CHIPS = 3;
const MAX_BARS = 8;
const MAX_DIAMONDS = 6;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function bar(status) {
  const node = el('span', 'strip-bar');
  node.dataset.status = status;
  return node;
}

function diamonds(count) {
  return Array.from({ length: Math.min(count, MAX_DIAMONDS) }, () => el('span', 'strip-agent'));
}

/**
 * Faixa embaixo do quadrado. Família fechada: barrinhas das sessões de dentro + losangos de todos os
 * subagentes. Sessão solta com subagentes: só os losangos.
 */
export function fillStrip(strip, { kids = [], subagents = 0, label = '' }) {
  const marks = el('span', 'strip-marks');
  marks.append(...kids.slice(0, MAX_BARS).map((s) => bar(s.unseen && s.status === 'idle' ? 'unseen' : s.status)), ...diamonds(subagents));
  strip.replaceChildren(marks, el('span', 'strip-label', label));
  strip.hidden = kids.length === 0 && subagents === 0;
}

/** Texto da faixa: "3 sessões · ◇ 1"; sem família, o subagente ("◇ Explore · lendo") ou a contagem. */
export function stripLabel({ kids = [], subagents = 0, firstAgent = null, activityWord = {} }) {
  if (kids.length) return [plural(kids.length, 'sessão', 'sessões'), subagents ? `◇ ${subagents}` : ''].filter(Boolean).join(' · ');
  if (subagents === 1 && firstAgent) {
    const doing = firstAgent.status === 'waiting' ? 'esperando' : activityWord[firstAgent.activity] ?? 'rodando';
    return `${firstAgent.type} · ${doing}`;
  }
  return subagents ? plural(subagents, 'subagente', 'subagentes') : '';
}

/** Bloco da família aberta: cabeçalho, a principal, a linha e as filhas. */
export function createFamilyBlock(onClose) {
  const section = el('section', 'family-open');
  const head = el('header', 'family-head');
  const marks = el('span', 'strip-marks');
  const title = el('span', 'family-title');
  const alert = el('span', 'family-alert');
  const close = el('button', 'family-close', 'fechar ▴');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar a família');
  close.addEventListener('click', onClose);
  head.append(marks, title, alert, close);
  const body = el('div', 'family-body');
  const rootSlot = el('div', 'family-root');
  const link = el('span', 'family-link');
  link.setAttribute('aria-hidden', 'true');
  const kids = el('div', 'family-kids');
  body.append(rootSlot, link, kids);
  section.append(head, body);

  return {
    section,
    rootSlot,
    kids,
    update(members) {
      const summary = familySummary(members);
      const root = members[0].session;
      const children = members.slice(1).map((m) => m.session);
      section.setAttribute('aria-label', `Família de ${root.name}, aberta`);
      marks.replaceChildren(...children.slice(0, MAX_BARS).map((s) => bar(s.status)), ...diamonds(summary.subagents));
      title.textContent = `${root.name} · ${plural(children.length, 'sessão aberta', 'sessões abertas')} por ela`;
      const waitingChild = children.find((s) => s.status === 'waiting');
      alert.textContent = waitingChild ? `● ${waitingChild.name} espera você` : '';
      section.toggleAttribute('data-waiting', Boolean(waitingChild));
    },
  };
}

/** Etiquetas dos subagentes ativos, usadas nos quadrados dentro da família aberta. */
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
