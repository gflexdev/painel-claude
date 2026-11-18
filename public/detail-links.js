// Detalhe da sessão: subagentes (ativos e os que já terminaram) e sessões ligadas (mãe e filhas).
import { ACTIVITY_WORD, STATUS_WORD, el } from './format.js';

function agentRow(agent) {
  const row = el('li', 'agent-row');
  row.dataset.status = agent.status;
  const doing = agent.status === 'done'
    ? 'terminou'
    : agent.status === 'waiting' ? 'esperando você' : ACTIVITY_WORD[agent.activity] ?? 'rodando';
  const text = el('div', 'agent-text');
  text.append(el('strong', '', `◇ ${agent.type}`), el('small', '', [agent.description, agent.status === 'done' ? '' : agent.detail].filter(Boolean).join(' · ')));
  row.append(el('span', 'agent-dot'), text, el('span', 'agent-doing', doing));
  return row;
}

/** Preenche a seção de subagentes; some quando a sessão não usou nenhum. */
export function fillAgents(section, list, agents = []) {
  section.hidden = agents.length === 0;
  const active = agents.filter((a) => a.status !== 'done').length;
  section.querySelector('h3').textContent = `Subagentes · ${active} agora · ${agents.length} recentes`;
  const ordered = [...agents.filter((a) => a.status !== 'done'), ...agents.filter((a) => a.status === 'done')];
  list.replaceChildren(...ordered.map(agentRow));
}

const wrap = (node) => {
  const item = el('li');
  item.appendChild(node);
  return item;
};

function linkButton(prefix, session, onOpen) {
  const button = el('button', 'link-row');
  button.type = 'button';
  button.dataset.status = session.status;
  button.append(el('span', 'link-prefix', prefix), el('strong', '', session.name), el('small', '', STATUS_WORD[session.status] ?? session.status));
  button.addEventListener('click', () => onOpen(session.id, session));
  return button;
}

/** Mãe e filhas da sessão, a partir do snapshot; cada uma abre o próprio detalhe. */
export function fillLinks(section, list, session, sessions, onOpen) {
  const parent = session.parentId ? sessions.find((s) => s.id === session.parentId) : null;
  const children = sessions.filter((s) => s.parentId === session.id);
  const rows = [
    ...(parent ? [linkButton('↰ aberta por', parent, onOpen)] : []),
    ...(session.parentId && !parent ? [el('li', 'muted', '↰ aberta por outra sessão (fora do painel agora)')] : []),
    ...children.map((child) => linkButton('↳ abriu', child, onOpen)),
  ];
  section.hidden = rows.length === 0;
  list.replaceChildren(...rows.map((row) => (row.tagName === 'LI' ? row : wrap(row))));
}
