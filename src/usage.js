// Uso do plano (limites de 5 h e de 7 dias), como o Claude Code manda à status line em `rate_limits`.
// A status line repassa o JSON para POST /usage; aqui só o `rate_limits` é lido e guardado.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const WINDOW_KEYS = Object.freeze({ five_hour: 'fiveHour', seven_day: 'sevenDay' });
/** resets_at vem em segundos desde 1970; abaixo disso é lixo. */
const MIN_EPOCH_SECONDS = 1_000_000_000;

function parseWindow(raw) {
  const used = raw?.used_percentage;
  const resets = raw?.resets_at;
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  if (typeof resets !== 'number' || !Number.isFinite(resets) || resets < MIN_EPOCH_SECONDS) return null;
  return { usedPercentage: Math.min(100, Math.max(0, used)), resetsAt: Math.round(resets * 1000) };
}

/** JSON da status line → `{ fiveHour?, sevenDay? }`, ou null se não houver nenhuma janela válida. */
export function parseRateLimits(payload) {
  const limits = payload?.rate_limits;
  if (!limits || typeof limits !== 'object') return null;
  const windows = Object.entries(WINDOW_KEYS)
    .map(([source, key]) => [key, parseWindow(limits[source])])
    .filter(([, value]) => value);
  return windows.length ? Object.fromEntries(windows) : null;
}

const sameWindow = (a, b) => a?.usedPercentage === b?.usedPercentage && a?.resetsAt === b?.resetsAt;

function readSaved(file, onError) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') onError?.('uso salvo', error);
    return null;
  }
}

/** Guarda o último uso visto; janela que não vier num envio continua com o último valor. */
export function createUsage({ file, onChange, onError, now = Date.now }) {
  let current = readSaved(file, onError);

  const save = () => {
    try {
      writeFileSync(`${file}.tmp`, JSON.stringify(current), { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    } catch (error) {
      onError?.('salvar uso', error);
    }
  };

  return {
    /** @returns {boolean} se algo mudou */
    update(payload) {
      const parsed = parseRateLimits(payload);
      if (!parsed) return false;
      const changed = Object.entries(parsed).some(([key, value]) => !sameWindow(current?.[key], value));
      if (!changed) return false;
      current = { ...current, ...parsed, updatedAt: now() };
      save();
      onChange?.();
      return true;
    },
    view: () => current,
  };
}
