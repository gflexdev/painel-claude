// Vigia: o conjunto das Sessões vigiadas e as regras do glossário que fazem nascer um Aviso. O store chama
// `observe(antes, depois, evento)` a cada mudança aplicada; o Aviso que nasce vai para `send`, que hoje só escreve
// no log e depois vira o Web Push. A vigia fica em vigia.json (0600), ao lado do estado, e volta ao reiniciar.
// O Aviso leva só Situação, nome, projeto, máquina e id: nunca o detalhe do tile, o comando, o pedido nem trecho da
// resposta, porque aparece na tela bloqueada e no relógio.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { STATUS, projectOf } from './state.js';
import { onlyShellsInBackground } from './background.js';
import { sendJson, SESSION_ID } from './http.js';

export const MAX_WATCHED = 500;
const NAME_MAX = 60;

/** Situação que o Aviso anuncia. */
export const AVISO = Object.freeze({ DONE: 'done', ERROR: 'error', WAITING: 'waiting', BACKGROUND: 'background' });
/** Avisos que encerram a vigia; os outros a mantêm. */
const ENDS_WATCH = new Set([AVISO.DONE, AVISO.ERROR]);

const isId = (value) => typeof value === 'string' && SESSION_ID.test(value);

/** Situação do glossário (rodando, esperando você, terminou, erro, parada, encerrada) de uma sessão crua. */
function situationOf(session) {
  if (!session || session.status === STATUS.ENDED) return 'ended';
  if (session.status === STATUS.IDLE) return session.unseen === true ? AVISO.DONE : 'stopped';
  return session.status;
}

/**
 * Que Aviso uma mudança de sessão faria nascer, se a sessão fosse vigiada. null = nenhum.
 * Nasce quando a Situação **muda** para terminou, esperando você ou erro, ou quando o turno acaba deixando só
 * comandos em segundo plano.
 * @param {object | undefined} before
 * @param {object | undefined} after
 * @param {object | null} event
 * @returns {string | null} um dos valores de AVISO
 */
export function avisoKind(before, after, event) {
  const next = situationOf(after);
  if ([AVISO.DONE, AVISO.ERROR, AVISO.WAITING].includes(next) && situationOf(before) !== next) return next;
  if (onlyShellsInBackground(event, after)) return AVISO.BACKGROUND;
  return null;
}

/**
 * Nome no Aviso: o título do Claude ou o nome do `claude agents`. Nunca o primeiro pedido (que o tile usa quando
 * não há título): sem nome, vai "sessão" e o começo do id.
 */
function avisoName(session) {
  const name = [session.title, session.agentName].find((n) => typeof n === 'string' && n.trim())?.trim();
  if (!name) return `sessão ${session.id.slice(0, 8)}`;
  return name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name;
}

/** O Aviso inteiro: só os campos permitidos, montados um a um. */
export function avisoOf(kind, session) {
  return {
    id: session.id,
    situation: kind,
    name: avisoName(session),
    project: projectOf(session.cwd) || String(session.project ?? ''),
    ...(session.machine && { machine: String(session.machine) }),
  };
}

/** Lê o arquivo da vigia; o que não for id válido fica de fora. */
export function loadWatched(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return new Set((Array.isArray(raw.watched) ? raw.watched : []).filter(isId).slice(-MAX_WATCHED));
  } catch {
    return new Set();
  }
}

/**
 * @param {{ file: string, send?: (aviso: object) => (void | Promise<void>), onChange?: () => void,
 *   onError?: (context: string, error: unknown) => void }} deps
 *   send: recebe cada Aviso (sem bloquear a ingestão); onChange: a vigia mudou (para reenviar a lista às Telas).
 */
export function createVigia({ file, send = () => {}, onChange = () => {}, onError = () => {} }) {
  let watched = loadWatched(file);

  const save = () => {
    try {
      writeFileSync(`${file}.tmp`, `${JSON.stringify({ watched: [...watched] })}\n`, { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    } catch (error) {
      onError('falha ao salvar a vigia', error);
    }
  };

  const update = (next) => {
    watched = next;
    save();
    onChange();
  };

  const deliver = (aviso) => {
    try {
      Promise.resolve(send(aviso)).catch((error) => onError('falha ao mandar o Aviso', error));
    } catch (error) {
      onError('falha ao mandar o Aviso', error);
    }
  };

  const unwatch = (id) => {
    if (!watched.has(id)) return false;
    update(new Set([...watched].filter((w) => w !== id)));
    return true;
  };

  return {
    /** Passa a vigiar. false = já era vigiada (ou id inválido). */
    watch(id) {
      if (!isId(id) || watched.has(id)) return false;
      update(new Set([...watched, id].slice(-MAX_WATCHED)));
      return true;
    },
    /** Para de vigiar. false = não era vigiada. */
    unwatch,
    isWatched: (id) => watched.has(id),
    /** Item da lista das Telas com `watched: true` quando vigiado (o campo só aparece quando verdadeiro). */
    decorate: (session) => (watched.has(session.id) ? { ...session, watched: true } : session),
    /**
     * Uma mudança de sessão (after = undefined: o painel esqueceu a sessão). Devolve o Aviso que nasceu, ou null.
     * @param {object | undefined} before
     * @param {object | undefined} after
     * @param {object | null} event o evento de hook, ou null (adoção, esquecimento)
     */
    observe(before, after, event = null) {
      const id = after?.id ?? before?.id;
      if (!watched.has(id)) return null;
      if (situationOf(after) === 'ended') {
        unwatch(id);
        return null;
      }
      const kind = avisoKind(before, after, event);
      if (!kind) return null;
      const aviso = avisoOf(kind, after);
      if (ENDS_WATCH.has(kind)) unwatch(id);
      deliver(aviso);
      return aviso;
    },
  };
}

const WATCH_ROUTE = /^\/api\/sessions\/([\w-]{1,80})\/(watch|unwatch)$/;

/**
 * Rotas de vigiar e parar de vigiar: POST /api/sessions/:id/watch e /unwatch.
 * @param {{ vigia: ReturnType<typeof createVigia>, store: { get: (id: string) => (object | undefined) },
 *   allowed: (req: object, url: URL) => boolean, log?: (line: string) => void }} deps
 *   allowed: confere o token (o das Telas ou o do relógio, só no cabeçalho: watchOrScreenToken em watch.js).
 */
export function createVigiaRoutes({ vigia, store, allowed, log = () => {} }) {
  return {
    /** true = a rota era daqui (já respondida). */
    handle(req, res, url) {
      const match = url.pathname.match(WATCH_ROUTE);
      if (!match) return false;
      req.resume();
      if (req.method !== 'POST') {
        sendJson(res, 405, { success: false, error: 'método não permitido' });
        return true;
      }
      if (!allowed(req, url)) {
        sendJson(res, 401, { success: false, error: 'token inválido' });
        return true;
      }
      const [, id, action] = match;
      const session = store.get(id);
      if (action === 'watch') {
        if (!session || session.status === STATUS.ENDED) {
          sendJson(res, 404, { success: false, error: 'sessão não encontrada' });
          return true;
        }
        if (vigia.watch(id)) log(`vigia ligada pelo painel: ${id.slice(0, 8)}`);
      } else if (vigia.unwatch(id)) {
        log(`vigia desligada pelo painel: ${id.slice(0, 8)}`);
      }
      sendJson(res, 200, { success: true, data: { id, watched: vigia.isWatched(id) } });
      return true;
    },
  };
}

/** Linha do log para um Aviso (o envio de verdade chega com o Web Push). */
export const avisoLine = (aviso) => `Aviso: ${aviso.situation} · ${aviso.name} · ${aviso.project || 'sem projeto'}`
  + `${aviso.machine ? ` · ${aviso.machine}` : ''}`;
