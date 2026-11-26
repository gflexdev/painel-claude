import { readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import { applyEvent, applyMeta, machineOf, markSeen, noteChat, prune, toView } from './state.js';
import { adoptSessions } from './discover.js';
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

/** Ids que mudaram (entraram, saíram ou viraram outro objeto) entre dois mapas de sessões. */
function changedIds(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((id) => before[id] !== after[id]);
}

/**
 * Guarda o estado das sessões, salva em disco e avisa quem está ouvindo.
 * `onSessionChange(antes, depois, evento)` é chamado para cada sessão que mudou por um evento de hook (local ou
 * remoto), pela adoção, pelo encerramento pelo painel ou por ser esquecida (depois = undefined, evento = null).
 */
export function createStore({
  stateFile, eventsLog, debug, onError, decorate = (s) => s, version = '', extras = () => ({}), onSessionChange = () => {},
}) {
  const report = (before, after, event) => changedIds(before, after).forEach((id) => {
    try {
      onSessionChange(before[id], after[id], event);
    } catch (error) {
      onError('falha ao observar a mudança da sessão', error);
    }
  });
  const loaded = loadState(stateFile);
  let sessions = prune(loaded, Date.now());
  // Sessões esquecidas enquanto o painel estava desligado também contam como mudança (depois de montar tudo,
  // para quem observa já poder usar o store).
  const pruned = sessions;
  queueMicrotask(() => report(loaded, pruned, null));
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

  /** O único ponto em que o estado das sessões muda por evento, adoção, encerramento ou esquecimento. */
  const commit = (next, event = null) => {
    const before = sessions;
    sessions = next;
    changed();
    report(before, next, event);
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
      commit(next, event);
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
    /** Sessões vivas vistas pelo `claude agents`: entram as novas e seguem as que ainda não mandaram hook. */
    adopt(found, options) {
      const before = sessions;
      const next = adoptSessions(sessions, found, Date.now(), options);
      if (next === before) return 0;
      commit(next);
      const touched = Object.values(next).filter((s) => s !== before[s.id]);
      touched.filter((s) => s.transcriptPath && s.status !== 'ended')
        .forEach((s) => refreshMeta(s.id, s.transcriptPath, true));
      return touched.length;
    },
    /** Mensagem mandada pelo painel: vira o "último pedido" do detalhe se for mais nova que o digitado no Mac. */
    noteChat(id, text) {
      const next = noteChat(sessions, id, text, Date.now());
      if (next === sessions) return;
      sessions = next;
      changed();
    },
    /** A sessão saiu por ordem do painel (fechada ou apagada): encerra sem esperar o hook dela. */
    end(id) {
      if (!sessions[id] || sessions[id].status === 'ended') return;
      const event = { hook_event_name: 'SessionEnd', session_id: id };
      commit(applyEvent(sessions, event, Date.now(), machineOf(sessions[id])), event);
    },
    tick() {
      const next = prune(sessions, Date.now());
      if (next !== sessions) {
        commit(next);
        forget();
      }
    },
    get: (id) => sessions[id],
    /** Todas as sessões em memória, sem enfeite (para listar as pastas de projeto). */
    all: () => Object.values(sessions),
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
