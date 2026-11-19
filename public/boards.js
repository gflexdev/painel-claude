// Um quadro de projeto (modo Quadros): cabeçalho com seta de recolher, nome, máquina, "N sessões", os contadores
// por situação e o pino; embaixo, os quadrados e as famílias do projeto. Recolhido, mostra uma barrinha por sessão.
import { el } from './format.js';
import { countLabels } from './groups.js';

const MAX_BARS = 10;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const barStatus = (s) => (s.status === 'idle' && s.unseen ? 'unseen' : s.status);

/**
 * @param {string} key chave do quadro (máquina + projeto)
 * @param {{ onToggle: (key: string) => void, onPin: (key: string) => void }} handlers
 */
export function createBoard(key, { onToggle, onPin }) {
  const section = el('section', 'group');
  const bar = el('div', 'group-bar');
  const head = el('button', 'group-head');
  head.type = 'button';
  const chevron = el('span', 'group-chevron');
  chevron.setAttribute('aria-hidden', 'true');
  const title = el('h2', 'group-name');
  const machine = el('span', 'machine');
  const total = el('span', 'group-total');
  const scheduled = el('span', 'group-scheduled');
  const bars = el('span', 'strip-marks group-bars');
  bars.setAttribute('aria-hidden', 'true');
  const counts = el('span', 'group-counts');
  // Duas linhas fixas: nome em cima; sessões e contadores embaixo. Assim todo cabeçalho tem a mesma altura.
  const line1 = el('span', 'group-line');
  line1.append(chevron, title, machine);
  const line2 = el('span', 'group-line group-meta');
  line2.append(total, scheduled, bars, counts);
  head.append(line1, line2);
  const pin = el('button', 'group-pin');
  pin.type = 'button';
  pin.append(el('span', 'group-pin-mark', '⌖'));
  bar.append(head, pin);
  const body = el('div', 'grid group-grid');
  section.append(bar, body);
  head.addEventListener('click', () => onToggle(key));
  pin.addEventListener('click', () => onPin(key));

  return {
    section,
    body,
    /**
     * @param {{ label, machine, sessions, counts }} group
     * @param {{ collapsed: boolean, pinned: boolean, span: number }} state
     */
    update(group, { collapsed, pinned, span }) {
      section.style.setProperty('--span', String(span));
      section.toggleAttribute('data-collapsed', collapsed);
      section.toggleAttribute('data-waiting', group.counts.waiting > 0);
      section.toggleAttribute('data-pinned', pinned);
      section.setAttribute('aria-label', `Quadro ${group.label}${collapsed ? ', recolhido' : ''}`);
      head.setAttribute('aria-expanded', String(!collapsed));
      pin.setAttribute('aria-pressed', String(pinned));
      pin.setAttribute('aria-label', pinned ? `Soltar ${group.label} do começo` : `Fixar ${group.label} no começo`);
      pin.title = pinned ? 'Soltar do começo' : 'Fixar no começo';
      title.textContent = group.label;
      machine.hidden = !group.machine;
      machine.textContent = group.machine;
      total.textContent = plural(group.sessions.length, 'sessão', 'sessões');
      const scheduledCount = group.sessions.filter((s) => s.scheduled).length;
      scheduled.hidden = scheduledCount === 0;
      scheduled.textContent = scheduledCount ? `⏱ ${plural(scheduledCount, 'agendada', 'agendadas')}` : '';
      bars.hidden = !collapsed;
      bars.replaceChildren(...(collapsed ? group.sessions.slice(0, MAX_BARS).map((s) => {
        const node = el('span', 'strip-bar');
        node.dataset.status = barStatus(s);
        return node;
      }) : []));
      counts.replaceChildren(...countLabels(group.counts).map(({ status, text }) => {
        const chip = el('span', 'group-count', text);
        chip.dataset.status = status;
        return chip;
      }));
      body.hidden = collapsed;
    },
  };
}
