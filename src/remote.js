// Entrada das outras máquinas (ex.: vps-dev): os hooks de lá chegam pela tailnet com um token próprio.
import { createHash, timingSafeEqual } from 'node:crypto';
import { isTailnetDirect, plainAddress } from './network.js';
import { SESSION_ID, holdPermission, readBody, readHookEvent, sendJson } from './http.js';
import { extractMeta, extractSummary, parseLines } from './transcript.js';

export const MACHINE_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MIN_TOKEN_LENGTH = 24;
const MAX_TURNS = 1_000_000;
export const REMOTE_LIMITS = Object.freeze({
  /** Um Write grande vem inteiro no tool_input. */
  hook: 4 * 1024 * 1024,
  /** O fim do transcript (768 KB) mais as linhas de título. */
  transcript: 1024 * 1024,
});

const digest = (text) => createHash('sha256').update(String(text)).digest();

/**
 * Quem pode falar pela entrada remota: `remotes` = { nome: { token, address? } } do config.json.
 * `check` devolve { status: 200, machine } ou { status: 401 | 403, error }.
 */
export function createRemoteGate(remotes = {}) {
  const machines = Object.entries(remotes ?? {})
    .filter(([name, r]) => MACHINE_NAME.test(name) && typeof r?.token === 'string' && r.token.length >= MIN_TOKEN_LENGTH)
    .map(([name, r]) => ({ name, address: r.address ? plainAddress(r.address) : null, hash: digest(r.token) }));

  return {
    names: machines.map((m) => m.name),
    check(remoteAddress, headers) {
      if (!isTailnetDirect(remoteAddress, headers)) return { status: 403, error: 'só aceita conexão direta pela tailnet' };
      const header = typeof headers.authorization === 'string' ? headers.authorization : '';
      const given = digest(header.startsWith('Bearer ') ? header.slice(7) : `\0${header}`);
      // Compara com todas as máquinas, sem parar na primeira, para o tempo não dizer qual quase bateu.
      const found = machines.reduce((hit, m) => (timingSafeEqual(given, m.hash) && !hit ? m : hit), null);
      if (!found) return { status: 401, error: 'token inválido' };
      if (found.address && found.address !== plainAddress(remoteAddress)) {
        return { status: 403, error: 'endereço não confere com o da máquina' };
      }
      return { status: 200, machine: found.name };
    },
  };
}

/** Título, modelo, contexto e resumo a partir do fim do transcript que a máquina mandou. */
export function summarizeTranscript(text, turns) {
  const entries = parseLines(text);
  return {
    meta: { ...extractMeta(entries), turns: Number.isInteger(turns) && turns > 0 ? turns : null },
    summary: extractSummary(entries),
  };
}

function parseTurns(value) {
  if (value === undefined) return null;
  const turns = Number(value);
  return Number.isInteger(turns) && turns >= 0 && turns <= MAX_TURNS ? turns : null;
}

/**
 * Rotas /remote/hook, /remote/permission e /remote/transcript.
 * `handle` devolve false quando o caminho não é dela.
 */
export function createRemoteRoutes({ gate, store, permissions, limits = REMOTE_LIMITS, log = () => {} }) {
  async function hook(req, res, machine, { permission }) {
    const event = await readHookEvent(req, res, limits.hook);
    if (!event) return;
    if (typeof event.session_id !== 'string' || !SESSION_ID.test(event.session_id)) {
      sendJson(res, 400, { success: false, error: 'session_id inválido' });
      return;
    }
    const result = store.ingest(event, { machine });
    if (result?.conflict) {
      sendJson(res, 409, { success: false, error: 'sessão pertence a outra máquina' });
      return;
    }
    if (permission) {
      await holdPermission(res, event, permissions);
      return;
    }
    sendJson(res, 200, { success: true, data: { transcript: result?.wantsTranscript === true } });
  }

  async function transcript(req, res, machine) {
    const id = req.headers['x-painel-session'];
    if (typeof id !== 'string' || !SESSION_ID.test(id)) {
      req.resume();
      sendJson(res, 400, { success: false, error: 'X-Painel-Session inválido' });
      return;
    }
    const text = await readBody(req, limits.transcript);
    const applied = store.applyTranscript(id, machine, summarizeTranscript(text, parseTurns(req.headers['x-painel-turns'])));
    if (!applied) {
      sendJson(res, 404, { success: false, error: 'sessão não encontrada nessa máquina' });
      return;
    }
    sendJson(res, 200, { success: true });
  }

  return {
    async handle(req, res, pathname) {
      if (!pathname.startsWith('/remote/')) return false;
      if (req.method !== 'POST') {
        sendJson(res, 405, { success: false, error: 'método não permitido' });
        return true;
      }
      const access = gate.check(req.socket.remoteAddress ?? '', req.headers);
      if (access.status !== 200) {
        req.resume();
        log(`entrada remota recusada (${access.status}) de ${req.socket.remoteAddress}`);
        sendJson(res, access.status, { success: false, error: access.error });
        return true;
      }
      if (pathname === '/remote/hook') await hook(req, res, access.machine, { permission: false });
      else if (pathname === '/remote/permission') await hook(req, res, access.machine, { permission: true });
      else if (pathname === '/remote/transcript') await transcript(req, res, access.machine);
      else sendJson(res, 404, { success: false, error: 'rota não existe' });
      return true;
    },
  };
}
