// Rotas que agem nas sessões: arquivar no painel (sempre), Ajustes e as ações do grupo 2 (mensagem, abrir,
// fechar e apagar), cada uma atrás do seu ajuste, desligado por padrão. Todas pedem o token no cabeçalho;
// mudar os Ajustes pede também que o pedido venha do próprio Mac. /chat/wait é a entrada do hook do chat:
// só do próprio Mac e sem token, como /hook e /permission.
import { projectOf, projectRoot } from './state.js';
import { cleanMessage, wrapMessage } from './chat.js';
import { FEATURE_KEYS } from './config.js';
import { readBody, readHookEvent, sendJson, SESSION_ID } from './http.js';

const MAX_API_BODY = 16 * 1024;
const MAX_WAIT_BODY = 1024 * 1024;
const OFF = 'desligado nos Ajustes';
const LINK_TRIES = 12;
const LINK_EVERY_MS = 2500;
const CHAT_ERRORS = Object.freeze({
  off: OFF,
  unavailable: 'esta sessão ainda não está ouvindo o painel; ela passa a ouvir no fim do próximo turno (ou ao abrir de novo)',
  full: 'já há mensagens demais na fila desta sessão; espere ela terminar o turno',
});

const SESSION_ACTION = /^\/api\/sessions\/([\w-]{1,80})\/(archive|unarchive|message|close|remove)$/;

/** Pastas de projeto das sessões deste Mac: só nelas o painel abre uma sessão nova. */
export function knownProjects(sessions) {
  const roots = new Map();
  sessions.filter((s) => !s.machine && s.cwd).forEach((s) => {
    const path = projectRoot(s.cwd);
    if (path && !roots.has(path)) roots.set(path, { path, name: projectOf(s.cwd) || path });
  });
  return [...roots.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function readJson(req, res) {
  try {
    const body = JSON.parse((await readBody(req, MAX_API_BODY)) || '{}');
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch (error) {
    if (error.status) throw error;
  }
  sendJson(res, 400, { success: false, error: 'corpo inválido' });
  return null;
}

/**
 * @param {object} deps store, chat, panel, control, discovery, features ({ get, set }), isLoopback(req),
 *   hasToken(req, url, opts), logError(context, error), log(line)
 */
export function createActionRoutes(deps) {
  const { store, chat, panel, control, discovery, features, isLoopback, hasToken, logError, log } = deps;
  const isOn = (key) => features.get()[key] === true;
  const forbidden = (res) => sendJson(res, 403, { success: false, error: OFF });

  /** Id curto de uma sessão de segundo plano: aberta pelo painel ou listada como "background" pelo `claude agents`. */
  const jobOf = (id) => panel.jobOf(id)
    ?? discovery.latest().find((a) => a.sessionId === id && a.kind === 'background')?.jobId
    ?? null;

  /** Hook do chat: segura a conexão até chegar mensagem. 200 = texto; 204 = nada (ou ajuste desligado). */
  async function handleChatWait(req, res) {
    if (!isLoopback(req)) {
      req.resume();
      return sendJson(res, 403, { success: false, error: 'só aceita pedidos do próprio Mac' });
    }
    const event = await readHookEvent(req, res, MAX_WAIT_BODY);
    if (!event) return undefined;
    const id = event.session_id;
    const session = store.get(id);
    // O hook de SessionStart pode chegar antes do evento que cria a sessão no painel: id válido basta.
    if (!isOn('chat') || typeof id !== 'string' || !SESSION_ID.test(id) || session?.machine || session?.status === 'ended') {
      res.writeHead(204);
      return res.end();
    }
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    const texts = await chat.wait(id, controller.signal);
    if (res.destroyed) return undefined;
    if (!texts?.length) {
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(wrapMessage(texts));
  }

  /** Ajustes: só pelo próprio Mac (loopback sem proxy) e com o token. Do celular, só leitura. */
  async function handleSettings(req, res) {
    if (!isLoopback(req)) {
      req.resume();
      return sendJson(res, 403, { success: false, error: 'para mudar os Ajustes, abra o painel no Mac' });
    }
    const body = await readJson(req, res);
    if (!body) return undefined;
    const patch = Object.fromEntries(FEATURE_KEYS.filter((key) => typeof body[key] === 'boolean').map((key) => [key, body[key]]));
    if (!Object.keys(patch).length) return sendJson(res, 400, { success: false, error: 'nada para mudar' });
    const next = features.set({ ...features.get(), ...patch });
    log(`ajustes mudados pelo Mac: ${FEATURE_KEYS.map((key) => `${key}=${next[key] ? 'on' : 'off'}`).join(' ')}`);
    return sendJson(res, 200, { success: true, data: { features: next } });
  }

  async function handleMessage(req, res, id) {
    if (!isOn('chat')) return forbidden(res);
    const body = await readJson(req, res);
    if (!body) return undefined;
    const text = cleanMessage(body.text);
    if (!text) return sendJson(res, 400, { success: false, error: 'mensagem vazia ou grande demais (até 4000 caracteres)' });
    const session = store.get(id);
    if (!session || session.status === 'ended') return sendJson(res, 404, { success: false, error: 'sessão não encontrada' });
    if (session.machine) return sendJson(res, 409, { success: false, error: 'sessões de outra máquina não recebem mensagens' });
    const status = chat.send(id, text);
    if (CHAT_ERRORS[status]) return sendJson(res, status === 'off' ? 403 : 409, { success: false, error: CHAT_ERRORS[status] });
    store.noteChat(id, text);
    log(`mensagem pelo painel (${text.length} caracteres): ${status}`);
    return sendJson(res, 200, { success: true, data: { status } });
  }

  /** A sessão nova leva uns segundos para aparecer no `claude agents`; aí o painel liga o id dela ao id curto. */
  async function linkLaunched(jobId, parentId) {
    for (let attempt = 0; attempt < LINK_TRIES; attempt += 1) {
      await new Promise((resolve) => { setTimeout(resolve, LINK_EVERY_MS); });
      const entry = ((await discovery.refresh()) ?? discovery.latest()).find((a) => a.jobId === jobId);
      if (entry) return panel.adopt(entry.sessionId, { jobId, parentId });
    }
    return logError('sessão nova', `não achei a sessão ${jobId} no claude agents`);
  }

  async function handleLaunch(req, res) {
    if (!isOn('launch')) return forbidden(res);
    const body = await readJson(req, res);
    if (!body) return undefined;
    const parentId = typeof body.parentId === 'string' && SESSION_ID.test(body.parentId) ? body.parentId : null;
    const parent = parentId ? store.get(parentId) : null;
    if (body.parentId && (!parent || parent.machine)) return sendJson(res, 404, { success: false, error: 'sessão mãe não encontrada' });
    const cwd = parent ? projectRoot(parent.cwd) : body.cwd;
    if (!knownProjects(store.all()).some((project) => project.path === cwd)) {
      return sendJson(res, 400, { success: false, error: 'escolha uma pasta de projeto da lista' });
    }
    try {
      const { jobId } = await control.launch({ cwd, prompt: body.prompt, name: body.name });
      linkLaunched(jobId, parentId).catch((error) => logError('sessão nova', error));
      log(`sessão aberta pelo painel: ${jobId}`);
      return sendJson(res, 200, { success: true, data: { jobId } });
    } catch (error) {
      return sendJson(res, error.message.startsWith('o claude') || error.message.startsWith('não achei') ? 502 : 400, { success: false, error: error.message });
    }
  }

  async function handleArchive(req, res, id, archived) {
    req.resume();
    if (!store.get(id)) return sendJson(res, 404, { success: false, error: 'sessão não encontrada' });
    return sendJson(res, 200, { success: true, data: { changed: panel.setArchived(id, archived), archived } });
  }

  /** Fechar (claude stop) e apagar (claude rm, leva o worktree junto): só sessões de segundo plano. */
  async function handleStop(req, res, id, action) {
    req.resume();
    if (!isOn('closeRemove')) return forbidden(res);
    const session = store.get(id);
    if (!session) return sendJson(res, 404, { success: false, error: 'sessão não encontrada' });
    if (session.machine) return sendJson(res, 409, { success: false, error: 'sessões de outra máquina não são controladas daqui' });
    const jobId = jobOf(id);
    if (!jobId) return sendJson(res, 409, { success: false, error: 'só dá para fechar ou apagar sessões em segundo plano (abertas pelo painel ou com claude --bg)' });
    try {
      if (action === 'remove') await control.removeJob(jobId);
      else await control.stopJob(jobId);
    } catch (error) {
      return sendJson(res, 502, { success: false, error: error.message });
    }
    store.end(id);
    chat.drop(id);
    if (action === 'remove') panel.forget(id);
    log(`sessão ${action === 'remove' ? 'apagada' : 'fechada'} pelo painel (${jobId})`);
    return sendJson(res, 200, { success: true, data: { id, action } });
  }

  return {
    jobOf,
    /** true = a rota era daqui (já respondida). */
    async handle(req, res, url) {
      const { pathname } = url;
      if (req.method === 'POST' && pathname === '/chat/wait') {
        await handleChatWait(req, res);
        return true;
      }
      const sessionRoute = pathname.match(SESSION_ACTION);
      const isPost = req.method === 'POST' && (sessionRoute || pathname === '/api/sessions' || pathname === '/api/settings');
      const isProjects = req.method === 'GET' && pathname === '/api/projects';
      if (!isPost && !isProjects) return false;
      if (!hasToken(req, url, { headerOnly: true })) {
        req.resume();
        sendJson(res, 401, { success: false, error: 'token inválido' });
        return true;
      }
      if (isProjects) {
        if (!isOn('launch')) forbidden(res);
        else sendJson(res, 200, { success: true, data: { projects: knownProjects(store.all()), canLaunch: control.available() } });
        return true;
      }
      if (pathname === '/api/settings') await handleSettings(req, res);
      else if (pathname === '/api/sessions') await handleLaunch(req, res);
      else {
        const [, id, action] = sessionRoute;
        if (action === 'message') await handleMessage(req, res, id);
        else if (action === 'archive' || action === 'unarchive') await handleArchive(req, res, id, action === 'archive');
        else await handleStop(req, res, id, action);
      }
      return true;
    },
  };
}
