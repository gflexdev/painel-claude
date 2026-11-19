// Descobre as sessões do Claude Code já abertas, sem esperar um hook delas, pelo comando documentado
// `claude agents --json` ("Print active sessions (interactive and background) as a JSON array and exit").
// Cada item traz pid, cwd, kind, startedAt, sessionId, name e status (idle | busy); as de segundo plano trazem
// também o id curto que `claude stop` e `claude rm` aceitam. Só leitura: o painel nunca lê ~/.claude/sessions.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { STATUS, projectOf } from './state.js';

export const DISCOVER_EVERY_MS = 60_000;
const LIST_TIMEOUT_MS = 20_000;
const SESSION_ID = /^[\w-]{1,80}$/;
const JOB_ID = /^[0-9a-z]{4,40}$/i;
const MAX_NAME = 80;
const MAX_ENTRIES = 200;

const timeOf = (value) => (Number.isFinite(value) && value > 0 ? value : null);

/**
 * Saída de `claude agents --json` → lista enxuta e validada; [] se não for o que se espera.
 * `ignoreCwd` tira as consultas do próprio painel (a sonda do /usage roda numa pasta só dela).
 */
export function parseAgents(output, { ignoreCwd = null } = {}) {
  let list;
  try {
    list = JSON.parse(output);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_ENTRIES)
    .filter((a) => a && typeof a === 'object' && typeof a.sessionId === 'string' && SESSION_ID.test(a.sessionId))
    .filter((a) => typeof a.cwd === 'string' && a.cwd.startsWith('/') && a.cwd !== ignoreCwd)
    .map((a) => ({
      sessionId: a.sessionId,
      cwd: a.cwd,
      kind: a.kind === 'background' ? 'background' : 'interactive',
      jobId: a.kind === 'background' && typeof a.id === 'string' && JOB_ID.test(a.id) ? a.id : null,
      name: typeof a.name === 'string' ? a.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '',
      busy: a.status === 'busy',
      startedAt: timeOf(a.startedAt),
    }));
}

/** Pasta de trabalho → pasta do transcript em ~/.claude/projects (tudo que não é letra ou número vira "-"). */
export const projectDirOf = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, '-');

/** Transcript da sessão, se existir; é de onde vêm título, modelo e resumo (o mesmo arquivo que os hooks apontam). */
export function transcriptOf(cwd, id, { claudeDir = join(homedir(), '.claude'), exists = existsSync } = {}) {
  const path = join(claudeDir, 'projects', projectDirOf(cwd), `${id}.jsonl`);
  return exists(path) ? path : null;
}

/**
 * Junta as sessões vistas pelo `claude agents` ao mapa de sessões e devolve um mapa novo.
 * - desconhecida: entra como `adopted`, com nome e pasta (busy = rodando; senão parada);
 * - já adotada e ainda sem hook: acompanha o status da lista;
 * - adotada que sumiu da lista: encerrada. Sessão que já fala por hook não é tocada.
 */
export function adoptSessions(sessions, found, now, { transcriptFor = () => null } = {}) {
  const alive = new Set(found.map((f) => f.sessionId));
  let next = sessions;
  const put = (id, session) => { next = { ...next, [id]: session }; };
  found.forEach((info) => {
    const current = next[info.sessionId];
    const status = info.busy ? STATUS.WORKING : STATUS.IDLE;
    if (!current) {
      put(info.sessionId, {
        id: info.sessionId,
        title: null,
        agentName: info.name || null,
        entrypoint: null,
        status,
        detail: info.busy ? 'rodando' : 'sessão aberta',
        lastPrompt: '',
        startedAt: info.startedAt ?? now,
        statusSince: now,
        lastEventAt: now,
        cwd: info.cwd,
        project: projectOf(info.cwd),
        transcriptPath: transcriptFor(info.cwd, info.sessionId),
        adopted: true,
      });
      return;
    }
    if (!current.adopted || current.machine || current.status === status) return;
    put(info.sessionId, {
      ...current,
      status,
      detail: info.busy ? 'rodando' : 'terminou',
      activity: null,
      // Só marca "terminou · ver" se o painel viu a sessão rodando.
      unseen: !info.busy && current.status === STATUS.WORKING,
      statusSince: now,
      lastEventAt: now,
    });
  });
  Object.values(next).forEach((s) => {
    if (s.adopted && !s.machine && s.status !== STATUS.ENDED && !alive.has(s.id)) {
      put(s.id, { ...s, status: STATUS.ENDED, detail: 'encerrada', statusSince: now, lastEventAt: now });
    }
  });
  return next;
}

/** Roda `claude agents --json` sem shell, com o stdin fechado e timeout. */
export function runAgents(bin) {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, ['agents', '--json'], { timeout: LIST_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(new Error(error.killed ? '`claude agents` demorou demais' : String(error.message).slice(0, 200)));
      else resolve(stdout);
    });
    // Sem entrada: com o stdin aberto, o claude pode ficar esperando dados.
    child.stdin?.end();
  });
}

/**
 * Lista as sessões vivas de tempos em tempos e entrega a lista a `onList`.
 * `run(bin)` existe para os testes. Sem `bin` (claude não achado), não faz nada.
 */
export function createDiscovery({ bin, ignoreCwd = null, onList, onError = () => {}, run = runAgents, every = DISCOVER_EVERY_MS }) {
  let running = false;
  let last = [];

  async function refresh() {
    if (!bin || running) return null;
    running = true;
    try {
      last = parseAgents(await run(bin), { ignoreCwd });
      onList(last);
      return last;
    } catch (error) {
      onError('sessões abertas (claude agents)', error);
      return null;
    } finally {
      running = false;
    }
  }

  return {
    available: Boolean(bin),
    refresh,
    /** Última lista lida (para achar o id curto de uma sessão de segundo plano). */
    latest: () => last,
    start() {
      if (!bin) return;
      refresh();
      setInterval(refresh, every).unref();
    },
  };
}
