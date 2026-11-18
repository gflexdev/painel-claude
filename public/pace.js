// Ritmo de uso do plano: quanto da janela (5 h ou 7 dias) já passou, quanto já foi usado e aonde isso leva
// até o reset. Puro (sem DOM), para o painel, o widget e os testes usarem a mesma conta.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const WINDOWS = Object.freeze({
  fiveHour: Object.freeze({ key: 'fiveHour', label: '5 h', ms: 5 * HOUR, unitMs: HOUR, unit: 'h' }),
  sevenDay: Object.freeze({ key: 'sevenDay', label: 'semana', ms: 7 * DAY, unitMs: DAY, unit: 'dia' }),
});

/** Antes disso a projeção é ruído (um pedido grande no começo dispara o "acima do ritmo"). */
const EARLY_FRACTION = 0.08;
/** Fechar entre 90% e 105% conta como "no ritmo". */
const ON_PACE_MIN = 90;
const ON_PACE_MAX = 105;

/**
 * @param {{ usedPercentage: number, resetsAt: number }} window uso atual (0–100) e reset em ms
 * @param {{ ms: number, unitMs: number }} spec tamanho da janela e unidade das taxas
 * @param {number} now agora, em ms
 */
export function paceOf({ usedPercentage: used, resetsAt }, spec, now) {
  if (!Number.isFinite(resetsAt)) {
    return { used, resetsAt: null, remaining: null, ideal: null, projected: null, exhaustsAt: null, neededPerUnit: null, currentPerUnit: null, state: 'unknown' };
  }
  const remaining = resetsAt - now;
  const elapsed = Math.min(spec.ms, Math.max(0, spec.ms - remaining));
  const fraction = elapsed / spec.ms;
  const base = { used, resetsAt, remaining, ideal: fraction * 100, projected: null, exhaustsAt: null };
  if (remaining <= 0) return { ...base, state: 'reset', neededPerUnit: null, currentPerUnit: null };
  const neededPerUnit = ((100 - used) / remaining) * spec.unitMs;
  const currentPerUnit = elapsed > 0 ? (used / elapsed) * spec.unitMs : 0;
  const rates = { ...base, neededPerUnit, currentPerUnit };
  if (used >= 100) return { ...rates, state: 'limit' };
  if (fraction < EARLY_FRACTION) return { ...rates, state: 'early' };
  const ratePerMs = used / elapsed;
  const projected = used + ratePerMs * remaining;
  const exhaustsAt = projected > 100 && ratePerMs > 0 ? now + (100 - used) / ratePerMs : null;
  const state = projected > ON_PACE_MAX ? 'over' : projected >= ON_PACE_MIN ? 'on' : 'under';
  return { ...rates, projected, exhaustsAt, state };
}
