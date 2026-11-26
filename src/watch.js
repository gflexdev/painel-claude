// Lista do relógio (Forerunner 165): só as sessões em movimento, poucas e enxutas, com um token só dele.
// O relógio pede pelo celular (Garmin Connect → Tailscale → tailscale serve) e a resposta tem de ficar bem abaixo
// dos ~27 kB que o 165 aceita (docs/relogio-viabilidade.md). Leva o que o mostrador redondo mostra (Clawd,
// palavra do tile, contexto, uso do plano), nunca o comando, o pedido nem trecho de resposta.
import { STATUS } from './state.js';
import { bearerOf, tokenMatches } from './tokens.js';
import { sendJson } from './http.js';

export const WATCH_LIMIT = 8;
export const WATCH_ROUTE = '/api/watch';
const NAME_MAX = 48;
const TOOL_MAX = 24;
const SCOPED_MAX = 2;
const ASK_KINDS = new Set(['permission', 'plan', 'question']);

/** Em movimento: rodando, esperando você, com erro ou com terminou ainda não visto; não arquivada nem sem sinal. */
export function isInMotion(session) {
  if (session.archived || session.stale) return false;
  if (session.status === STATUS.IDLE) return session.unseen === true;
  return [STATUS.WORKING, STATUS.WAITING, STATUS.ERROR].includes(session.status);
}

const clip = (text, max) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};
const seconds = (ms) => Math.max(0, Math.round(ms / 1000));
const statusOf = (s) => (s.status === STATUS.IDLE ? 'done' : s.status);

/**
 * Pedido que segura a sessão: só o tipo, o nome da ferramenta e quantos há.
 * `permission.tool` é a descrição pronta da grade ("Bash: npm test"), que leva o comando: nunca vai ao relógio.
 */
function askOf(permission) {
  if (!permission || !ASK_KINDS.has(permission.kind)) return null;
  const toolName = typeof permission.toolName === 'string' ? permission.toolName : '';
  return {
    kind: permission.kind,
    ...(toolName && { tool: clip(toolName, TOOL_MAX) }),
    count: Number.isInteger(permission.count) && permission.count > 0 ? permission.count : 1,
  };
}

/**
 * Uma sessão da grade → item do relógio. Campos opcionais só aparecem quando há dado.
 * @param {object} s item de store.view().sessions
 * @param {number} now ms
 * @param {number | null} startedAt ms, quando a sessão foi aberta (para o "aberta há")
 */
function watchItem(s, now, startedAt) {
  const ask = s.status === STATUS.WAITING ? askOf(s.permission) : null;
  return {
    id: s.id,
    name: clip(s.name, NAME_MAX),
    project: String(s.project ?? ''),
    status: statusOf(s),
    age: seconds(now - (s.since ?? now)),
    ...(s.machine && { machine: s.machine }),
    ...(s.activity && { activity: s.activity }),
    ...(ask && { ask }),
    ...(Number.isFinite(s.contextTokens) && s.contextTokens > 0 && { context: s.contextTokens }),
    ...(s.model && { model: clip(s.model, TOOL_MAX) }),
    ...(Number.isInteger(s.turns) && s.turns > 0 && { turns: s.turns }),
    ...(Number.isFinite(startedAt) && startedAt > 0 && { open: seconds(now - startedAt) }),
  };
}

/**
 * Sessões da grade (já na ordem de urgência) → lista do relógio, até 8.
 * `status` vai como 'waiting' | 'error' | 'done' | 'working' (done = terminou ainda não visto); `age` e `open` em
 * segundos.
 * @param {Array<object>} sessions visão das sessões, como em store.view().sessions
 * @param {number} now ms
 * @param {(id: string) => (number | null)} [startedAtOf]
 */
export function watchList(sessions, now, startedAtOf = () => null) {
  return sessions
    .filter(isInMotion)
    .slice(0, WATCH_LIMIT)
    .map((s) => watchItem(s, now, startedAtOf(s.id)));
}

/** Quantas há em movimento por situação, contando todas (não só as 8 da lista). */
export function watchCounts(sessions) {
  const counts = { waiting: 0, working: 0, done: 0, error: 0 };
  sessions.filter(isInMotion).forEach((s) => { counts[statusOf(s)] += 1; });
  return counts;
}

const windowOf = (w, now) => (Number.isFinite(w?.usedPercentage)
  ? { percent: Math.round(w.usedPercentage), ...(Number.isFinite(w.resetsAt) && { resetsIn: seconds(w.resetsAt - now) }) }
  : null);

/** Uso do plano como o mostrador mostra: janela de 5 h, semana e até 2 limites por modelo. */
export function watchUsage(usage, now) {
  if (!usage) return null;
  const fiveHour = windowOf(usage.fiveHour, now);
  const sevenDay = windowOf(usage.sevenDay, now);
  const scoped = (Array.isArray(usage.scoped) ? usage.scoped : [])
    .filter((s) => typeof s?.label === 'string' && Number.isFinite(s.usedPercentage))
    .slice(0, SCOPED_MAX)
    .map((s) => ({ label: clip(s.label, TOOL_MAX), percent: Math.round(s.usedPercentage) }));
  if (!fiveHour && !sevenDay && !scoped.length) return null;
  return { ...(fiveHour && { fiveHour }), ...(sevenDay && { sevenDay }), ...(scoped.length && { scoped }) };
}

/** Resposta inteira do relógio a partir do snapshot da grade. */
export function watchSnapshot(view, startedAtOf) {
  const { now, sessions } = view;
  const counts = watchCounts(sessions);
  const usage = watchUsage(view.usage, now);
  return {
    sessions: watchList(sessions, now, startedAtOf),
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    ...(usage && { usage }),
  };
}

/**
 * Rota do relógio. Aceita o token do relógio e o das Telas, só no cabeçalho.
 * O token do relógio não vale em nenhuma outra rota: o resto do servidor só confere o das Telas.
 * @param {{ store: { view: () => object, get?: (id: string) => (object | undefined) },
 *   watchToken: () => (string | null),
 *   hasScreenToken: (req: object, url: URL, opts: { headerOnly: boolean }) => boolean }} deps
 */
export function createWatchRoutes({ store, watchToken, hasScreenToken }) {
  const allowed = (req, url) => tokenMatches(bearerOf(req), watchToken()) || hasScreenToken(req, url, { headerOnly: true });
  const startedAtOf = (id) => store.get?.(id)?.startedAt ?? null;

  return {
    /** true = a rota era daqui (já respondida). */
    handle(req, res, url) {
      if (url.pathname !== WATCH_ROUTE) return false;
      if (req.method !== 'GET') {
        req.resume();
        sendJson(res, 405, { success: false, error: 'método não permitido' });
        return true;
      }
      if (!allowed(req, url)) {
        sendJson(res, 401, { success: false, error: 'token inválido' });
        return true;
      }
      sendJson(res, 200, { success: true, data: watchSnapshot(store.view(), startedAtOf) });
      return true;
    },
  };
}
