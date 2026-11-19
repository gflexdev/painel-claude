// Faixa de uso do plano (5 h e semana): quanto já foi, onde deveria estar para fechar em 100% no reset
// e o que fazer com isso (acelerar, manter ou segurar).
import { el, elapsed } from './format.js';
import { WINDOWS, paceOf } from './pace.js';

/** Dado mais velho que isso ganha o aviso "atualizado há …" (a status line só roda com sessão aberta). */
const STALE_MS = 30 * 60_000;
/** De onde veio o número e depois de quanto tempo ele é avisado como velho. */
const ORIGIN = Object.freeze({
  cli: { label: 'vem do /usage do claude', staleAfter: 45 * 60_000 },
  statusline: { label: 'vem da status line de uma sessão aberta', staleAfter: STALE_MS },
  app: { label: 'vem do app do Claude', staleAfter: 3 * 60 * 60_000 },
});
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const HOUR_MINUTE = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Duração até um instante: "2 d 14 h", "34 h 46" ou "12 min". */
function untilLabel(from, to) {
  const hours = Math.floor((to - from) / 3_600_000);
  return hours >= 48 ? `${Math.floor(hours / 24)} d ${hours % 24} h` : elapsed(from, to);
}

const pct = (value) => `${Math.round(value)}%`;
const rate = (value, unit) => `${value < 10 ? value.toFixed(1).replace('.', ',') : Math.round(value)}%/${unit}`;

/** 16:40 se for hoje; "sáb 09:00" se for outro dia. */
function whenLabel(ms, now) {
  const date = new Date(ms);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return sameDay ? HOUR_MINUTE.format(date) : `${WEEKDAY.format(date).replace('.', '')} ${HOUR_MINUTE.format(date)}`;
}

/** A frase principal: o que o ritmo atual significa para chegar ao reset com tudo usado. */
export function adviceOf(pace, spec, now) {
  switch (pace.state) {
    case 'limit': return `limite atingido · volta ${whenLabel(pace.resetsAt, now)}`;
    case 'reset': return 'já zerou · esperando o próximo dado';
    case 'unknown': return 'sem o dia do reset ainda · abra uma sessão no terminal uma vez para o painel aprender';
    case 'early': return `começo da janela · dá para usar ~${rate(pace.neededPerUnit, spec.unit)}`;
    case 'over': return `nesse ritmo acaba ${whenLabel(pace.exhaustsAt, now)}, ${untilLabel(pace.exhaustsAt, pace.resetsAt)} antes de zerar · segure em ~${rate(pace.neededPerUnit, spec.unit)} (agora ${rate(pace.currentPerUnit, spec.unit)})`;
    case 'on': return `no ritmo para fechar perto de 100% (~${pct(pace.projected)})`;
    default: return `nesse ritmo fecha em ~${pct(pace.projected)} · dá para usar ~${rate(pace.neededPerUnit, spec.unit)} (agora ${rate(pace.currentPerUnit, spec.unit)})`;
  }
}

function renderRow(spec, window, now) {
  const pace = paceOf(window, spec, now);
  const fill = el('span', 'usage-fill');
  fill.style.setProperty('--used', `${pace.used}%`);
  const ideal = el('span', 'usage-ideal');
  ideal.style.setProperty('--ideal', `${Math.min(100, pace.ideal ?? 0)}%`);
  ideal.hidden = pace.ideal === null;
  ideal.title = 'Onde você estaria agora para fechar em 100% no reset';
  const track = el('span', 'usage-track');
  track.append(fill, ideal);
  const reset = pace.state === 'reset' || pace.state === 'unknown' ? '' : `zera ${whenLabel(pace.resetsAt, now)} · em ${untilLabel(now, pace.resetsAt)}`;
  const row = el('li', 'usage-row');
  row.dataset.state = pace.state;
  row.append(
    el('span', 'usage-label', spec.label),
    track,
    el('b', 'usage-pct', pct(pace.used)),
    el('span', 'usage-reset', reset),
    el('span', 'usage-note', adviceOf(pace, spec, now)),
  );
  return row;
}

/** Desenha a faixa; some quando o servidor ainda não recebeu nenhum uso. */
export function renderUsage(container, usage, now) {
  const rows = Object.values(WINDOWS)
    .filter((spec) => usage?.[spec.key])
    .map((spec) => renderRow(spec, usage[spec.key], now));
  container.hidden = rows.length === 0;
  const list = el('ul', 'usage-list');
  list.append(...rows);
  const origin = ORIGIN[usage?.source] ?? ORIGIN.statusline;
  const stale = usage?.updatedAt && now - usage.updatedAt > origin.staleAfter
    ? [el('p', 'usage-stale', `uso atualizado há ${elapsed(usage.updatedAt, now)} (${origin.label})`)]
    : [];
  const scoped = (usage?.scoped ?? []).filter((s) => Number.isFinite(s.usedPercentage));
  const perModel = scoped.length
    ? [el('p', 'usage-scoped', `limite por modelo: ${scoped.map((s) => `${s.label} ${pct(s.usedPercentage)}`).join(' · ')}`)]
    : [];
  container.replaceChildren(list, ...perModel, ...stale, moreButton(container));
}

/**
 * Só no celular (mobile.css): a faixa fica numa linha por janela e um toque nela abre o ritmo e o reset.
 * O estado aberto fica no próprio contêiner, que sobrevive aos redesenhos.
 */
function moreButton(container) {
  const isOpen = container.hasAttribute('data-open');
  const button = el('button', 'usage-more');
  button.type = 'button';
  button.setAttribute('aria-expanded', String(isOpen));
  button.setAttribute('aria-label', isOpen ? 'Recolher os detalhes do uso' : 'Mostrar os detalhes do uso');
  button.addEventListener('click', () => {
    container.toggleAttribute('data-open', !isOpen);
    container.querySelector('.usage-more')?.replaceWith(moreButton(container));
    container.querySelector('.usage-more')?.focus();
  });
  return button;
}
