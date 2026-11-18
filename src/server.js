import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, STATE_FILE, EVENTS_LOG, USAGE_FILE } from './config.js';
import { createUsage } from './usage.js';
import { createStore } from './store.js';
import { readSummary } from './transcript.js';
import { toView } from './state.js';
import { createPermissions } from './permissions.js';
import { assetVersion, VERSION_PLACEHOLDER } from './assets.js';
import { isLocalHook } from './network.js';
import { holdPermission, readBody, readHookEvent, sendJson } from './http.js';
import { createRemoteGate, createRemoteRoutes } from './remote.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MAX_HOOK_BODY = 8 * 1024 * 1024;
const PRUNE_EVERY_MS = 60_000;
const SSE_PING_MS = 25_000;
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
});
/** O service worker não pode ficar em cache velho: senão a página não pega as atualizações. */
const NO_STORE = new Set(['sw.js']);

const MAX_API_BODY = 16 * 1024;
/** O JSON da status line é pequeno (sessão, modelo, custo, rate_limits). */
const MAX_USAGE_BODY = 64 * 1024;
/** Um pouco menos que o timeout do hook no settings.json (600 s), para responder antes de ele ser morto. */
const PERMISSION_WAIT_MS = 570_000;

const config = loadConfig();
const logError = (context, error) => process.stderr.write(`[painel] ${context}: ${error?.message ?? error}\n`);

/** Na grade vai só o essencial do pedido de permissão; o comando inteiro fica no detalhe. */
const withPermission = (session) => {
  const [first, ...rest] = permissions.forSession(session.id);
  return first
    ? { ...session, permission: { id: first.id, kind: first.kind, tool: first.tool, count: rest.length + 1 } }
    : session;
};
const ASSET_VERSION = assetVersion(PUBLIC_DIR);
const store = createStore({
  stateFile: STATE_FILE,
  eventsLog: EVENTS_LOG,
  debug: config.debug,
  onError: logError,
  decorate: withPermission,
  version: ASSET_VERSION,
  extras: () => ({ usage: usage.view() }),
});
const usage = createUsage({ file: USAGE_FILE, onChange: () => store.notify(), onError: logError });
const permissions = createPermissions({ timeoutMs: PERMISSION_WAIT_MS, onChange: () => store.notify() });
const expectedToken = Buffer.from(config.token);
const remoteGate = createRemoteGate(config.remotes);
const remoteRoutes = createRemoteRoutes({
  gate: remoteGate,
  store,
  permissions,
  log: (line) => process.stderr.write(`[painel] ${new Date().toISOString()} ${line}\n`),
});

const isLoopback = (req) => isLocalHook(req.socket.remoteAddress ?? '', req.headers);

/** GET aceita o token na URL (EventSource não manda cabeçalho); ações só pelo cabeçalho. */
function hasToken(req, url, { headerOnly = false } = {}) {
  const header = req.headers.authorization ?? '';
  const fromQuery = headerOnly ? '' : url.searchParams.get('t') ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : fromQuery);
  return given.length === expectedToken.length && timingSafeEqual(given, expectedToken);
}

async function readLocalEvent(req, res) {
  if (!isLoopback(req)) {
    req.resume();
    sendJson(res, 403, { success: false, error: 'só aceita eventos do próprio Mac' });
    return null;
  }
  return readHookEvent(req, res, MAX_HOOK_BODY);
}

/** Status line do Claude Code (só do próprio Mac): traz o uso do plano em `rate_limits`. */
async function handleUsage(req, res) {
  if (!isLoopback(req)) {
    req.resume();
    return sendJson(res, 403, { success: false, error: 'só aceita o uso do próprio Mac' });
  }
  let payload;
  try {
    payload = JSON.parse(await readBody(req, MAX_USAGE_BODY));
  } catch (error) {
    if (error.status) throw error;
    return sendJson(res, 400, { success: false, error: 'JSON inválido' });
  }
  return sendJson(res, 200, { success: true, data: { changed: usage.update(payload) } });
}

async function handleHook(req, res) {
  const event = await readLocalEvent(req, res);
  if (!event) return undefined;
  store.ingest(event);
  return sendJson(res, 200, { success: true });
}

/** Hook PermissionRequest do Mac: segura a conexão até alguém decidir no painel (ver holdPermission). */
async function handlePermissionHook(req, res) {
  const event = await readLocalEvent(req, res);
  if (!event) return undefined;
  store.ingest(event);
  return holdPermission(res, event, permissions);
}

async function handleDecision(req, res, id) {
  let body;
  try {
    body = JSON.parse(await readBody(req, MAX_API_BODY));
  } catch {
    return sendJson(res, 400, { success: false, error: 'corpo inválido' });
  }
  const { decision, answers } = body ?? {};
  if (decision !== 'allow' && decision !== 'deny') {
    return sendJson(res, 400, { success: false, error: 'decision deve ser allow ou deny' });
  }
  let settled;
  try {
    settled = permissions.decide(id, decision, answers);
  } catch (error) {
    return sendJson(res, 400, { success: false, error: error.message });
  }
  if (!settled) return sendJson(res, 410, { success: false, error: 'esse pedido já foi respondido ou expirou' });
  process.stdout.write(`[painel] ${new Date().toISOString()} decisão pelo painel: ${decision}${answers ? ' (com respostas)' : ''}\n`);
  return sendJson(res, 200, { success: true, data: { id, decision } });
}

function handleStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (snapshot) => res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
  send(store.view());
  const unsubscribe = store.subscribe(send);
  const ping = setInterval(() => res.write(': ping\n\n'), SSE_PING_MS);
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
}

async function handleDetail(res, id) {
  const session = store.get(id);
  if (!session) return sendJson(res, 404, { success: false, error: 'sessão não encontrada' });
  let summary = session.machine ? store.remoteSummary(id) : null;
  try {
    if (!session.machine) summary = await readSummary(session.transcriptPath);
  } catch (error) {
    if (error.code !== 'ENOENT') logError('resumo', error);
  }
  const [view] = toView({ [id]: session }, Date.now());
  return sendJson(res, 200, {
    success: true,
    data: {
      ...view,
      cwd: session.cwd,
      lastPrompt: session.lastPrompt,
      startedAt: session.startedAt,
      permissions: permissions.forSession(id),
      summary,
    },
  });
}

async function serveStatic(res, pathname) {
  const relative = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { success: false, error: 'caminho inválido' });
  try {
    const raw = await readFile(file);
    const content = extname(file) === '.html' ? raw.toString('utf8').replaceAll(VERSION_PLACEHOLDER, ASSET_VERSION) : raw;
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': NO_STORE.has(relative.replace(/^\//, '')) ? 'no-store' : 'no-cache',
    });
    return res.end(content);
  } catch {
    return sendJson(res, 404, { success: false, error: 'não encontrado' });
  }
}

async function route(req, res) {
  // "//x" seria lido como outro host; junta as barras do começo antes de interpretar.
  const url = new URL((req.url ?? '/').replace(/^\/{2,}/, '/'), 'http://painel.local');
  const { pathname } = url;
  if (req.method === 'POST' && pathname === '/hook') return handleHook(req, res);
  if (req.method === 'POST' && pathname === '/usage') return handleUsage(req, res);
  if (req.method === 'POST' && pathname === '/permission') return handlePermissionHook(req, res);
  if (await remoteRoutes.handle(req, res, pathname)) return undefined;
  const decisionRoute = pathname.match(/^\/api\/permissions\/([\w-]{1,80})$/);
  const seenRoute = pathname.match(/^\/api\/sessions\/([\w-]{1,80})\/seen$/);
  if (req.method === 'POST' && (decisionRoute || seenRoute)) {
    if (!hasToken(req, url, { headerOnly: true })) return sendJson(res, 401, { success: false, error: 'token inválido' });
    if (seenRoute) return sendJson(res, 200, { success: true, data: { changed: store.markSeen(seenRoute[1]) } });
    return handleDecision(req, res, decisionRoute[1]);
  }
  if (req.method !== 'GET') return sendJson(res, 405, { success: false, error: 'método não permitido' });
  if (pathname === '/health') return sendJson(res, 200, { success: true, data: { sessions: store.view().sessions.length } });
  if (pathname.startsWith('/api/')) {
    if (!hasToken(req, url)) return sendJson(res, 401, { success: false, error: 'token inválido' });
    if (pathname === '/api/stream') return handleStream(req, res);
    if (pathname === '/api/sessions') return sendJson(res, 200, { success: true, data: store.view() });
    const match = pathname.match(/^\/api\/sessions\/([\w-]{1,80})$/);
    if (match) return handleDetail(res, match[1]);
    return sendJson(res, 404, { success: false, error: 'rota não existe' });
  }
  return serveStatic(res, pathname);
}

const server = createServer((req, res) => {
  route(req, res).catch((error) => {
    logError(`${req.method} ${req.url?.split('?')[0]}`, error);
    if (!res.headersSent) sendJson(res, error.status ?? 500, { success: false, error: error.status ? error.message : 'erro interno' });
  });
});

setInterval(() => store.tick(), PRUNE_EVERY_MS).unref();

const shutdown = () => {
  store.flush();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(config.port, config.host, () => {
  process.stdout.write(`[painel] ouvindo em http://${config.host}:${config.port}\n`);
  if (remoteGate.names.length) process.stdout.write(`[painel] máquinas remotas: ${remoteGate.names.join(', ')}\n`);
});
