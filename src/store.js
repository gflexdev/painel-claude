import { readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import { applyEvent, applyMeta, machineOf, markSeen, prune, toView } from './state.js';
import { readMeta } from './transcript.js';

const SAVE_DELAY_MS = 1000;
const BROADCAST_DELAY_MS = 150;
/** Eventos em que vale reler o transcript inteiro (título muda no começo do turno; turnos no fim). */
const META_EVENTS = new Set(['SessionStart', 'UserPromptSubmit', 'Stop']);
/** Durante o trabalho, o contexto é relido no máximo a cada 15 s por sessão. */
const CONTEXT_REFRESH_MS = 15_000;
const REDACTED_FIELDS =['tool_input', 'tool_response', 'prompt', 'message', 'last_assistant_message'];

function loadState(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** Para o log de depuração: só nomes de campos do que pode ter conteúdo sensível. */
function redact(event) {
  return Object.fromEntries(Object.entries(event).map(([k, v]) => (
    REDACTED_FIELDS.includes(k) && v && typeof v === 'object' ? [k, `{${Object.keys(v).join(',')}}`]
      : REDACTED_FIELDS.includes(k) && typeof v === 'string' ? [k, `<${v.length} chars>`]
        : [k, v]
  )));
}

/** Guarda o estado das sessões, salva em disco e avisa quem está ouvindo. */
export function createStore({ stateFile, eventsLog, debug, onError, decorate = (s) => s, version = '', extras = () => ({}) }) {
  let sessions = prune(loadState(stateFile), Date.now());
  const listeners = new Set();
  let saveTimer = null;
  let broadcastTimer = null;

  const save = () => {
    saveTimer = null;
    try {
      writeFileSync(`${stateFile}.tmp`, JSON.stringify(sessions), { mode: 0o600 });
      renameSync(`${stateFile}.tmp`, stateFile);
    } catch (error) {
      onError('falha ao salvar estado', error);
    }
  };

  const notify = () => {
    broadcastTimer ??= setTimeout(() => {
      broadcastTimer = null;
      const snapshot = view();
      listeners.forEach((listener) => listener(snapshot));
    }, BROADCAST_DELAY_MS);
  };

  const changed = () => {
    saveTimer ??= setTimeout(save, SAVE_DELAY_MS);
    notify();
  };

  const view = () => ({ now: Date.now(), version, ...extras(), sessions: toView(sessions, Date.now()).map(decorate) });

  const lastMetaRead = new Map();
  /** Resumo (último pedido, resposta, ferramentas) das sessões de outras máquinas; só em memória. */
  const remoteSummaries = new Map();

  /** Vale reler o transcript? No começo e no fim do turno, sem título, sem resumo ou contexto velho. */
  const wantsMeta = (session, eventName) => META_EVENTS.has(eventName)
    || !session.title
    || (session.machine && !remoteSummaries.has(session.id))
    || Date.now() - (lastMetaRead.get(session.id) ?? 0) > CONTEXT_REFRESH_MS;

  const forget = () => {
    [...remoteSummaries.keys()].filter((id) => !sessions[id]).forEach((id) => remoteSummaries.delete(id));
    [...lastMetaRead.keys()].filter((id) => !sessions[id]).forEach((id) => lastMetaRead.delete(id));
  };

  const refreshMeta = async (id, transcriptPath, withTurns) => {
    lastMetaRead.set(id, Date.now());
    try {
      const meta = await readMeta(transcriptPath, { withTurns });
      const next = applyMeta(sessions, id, meta);
      if (next !== sessions) {
        sessions = next;
        changed();
      }
    } catch (error) {
      if (error.code !== 'ENOENT') onError('falha ao ler transcript', error);
    }
  };

  return {
    /**
     * Aplica um evento. `machine` = nome da máquina remota (null = este Mac).
     * Devolve { conflict } se a sessão é de outra máquina e, para as remotas,
     * { wantsTranscript } quando o painel quer o fim do transcript de lá.
     */
    ingest(event, { machine = null } = {}) {
      if (debug) appendFileSync(eventsLog, `${new Date().toISOString()} ${machine ?? 'mac'} ${JSON.stringify(redact(event))}\n`);
      const previous = sessions[event.session_id];
      if (previous && machineOf(previous) !== machine) return { conflict: true };
      const next = applyEvent(sessions, event, Date.now(), machine);
      if (next === sessions) return { wantsTranscript: false };
      sessions = next;
      changed();
      const session = sessions[event.session_id];
      if (!wantsMeta(session, event.hook_event_name)) return { wantsTranscript: false };
      if (machine) {
        lastMetaRead.set(session.id, Date.now());
        return { wantsTranscript: true };
      }
      if (session.transcriptPath) {
        refreshMeta(session.id, session.transcriptPath, META_EVENTS.has(event.hook_event_name));
      }
      return { wantsTranscript: false };
    },
    /** Fim do transcript que uma máquina remota mandou, já interpretado. false = sessão não é dela. */
    applyTranscript(id, machine, { meta, summary }) {
      const session = sessions[id];
      if (!session || !machine || machineOf(session) !== machine) return false;
      remoteSummaries.set(id, summary);
      const next = applyMeta(sessions, id, meta);
      if (next !== sessions) {
        sessions = next;
        changed();
      }
      return true;
    },
    remoteSummary: (id) => remoteSummaries.get(id) ?? null,
    markSeen(id) {
      const next = markSeen(sessions, id);
      if (next === sessions) return false;
      sessions = next;
      changed();
      return true;
    },
    tick() {
      const next = prune(sessions, Date.now());
      if (next !== sessions) {
        sessions = next;
        forget();
        changed();
      }
    },
    get: (id) => sessions[id],
    view,
    /** Reenvia o snapshot sem mudar o estado (ex.: um pedido de permissão chegou ou saiu). */
    notify,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush: save,
  };
}
