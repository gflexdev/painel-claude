import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveFeatures, DATA_DIR, STATE_FILE, EVENTS_LOG, USAGE_FILE, PANEL_FILE } from './config.js';
import { createUsage } from './usage.js';
import { createAppLinks } from './app-links.js';
import { createAppUsage } from './app-usage.js';
import { createUsageProbe, findClaude } from './usage-probe.js';
import { createDiscovery, transcriptOf } from './discover.js';
import { createPanelData } from './panel-data.js';
import { createChat } from './chat.js';
import { createControl } from './control.js';
import { createActionRoutes } from './actions.js';
import { createStore } from './store.js';
import { readSummary } from './transcript.js';
import { toView } from './state.js';
import { recentSubagents, subagentView } from './subagents.js';
import { createPermissions } from './permissions.js';
import { assetVersion, VERSION_PLACEHOLDER } from './assets.js';
import { isLocalHook } from './network.js';
import { holdPermission, readBody, readHookEvent, sendJson } from './http.js';
import { createRemoteGate, createRemoteRoutes } from './remote.js';
import { createScreenTokenCheck } from './tokens.js';
import { createWatchRoutes } from './watch.js';
import { avisoLine, createVigia, createVigiaRoutes } from './vigia.js';
import { ensureVapidKeys, DEVICES_FILE } from './config.js';
import { createPush, createPushRoutes } from './push.js';

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
/** Ajustes (grupo 2): começam como estão no config.json e mudam só por POST /api/settings vindo do Mac. */
let features = config.features;
const logError = (context, error) => process.stderr.write(`[painel] ${context}: ${error?.message ?? error}\n`);

/** Sessão aberta por outra (no app do Claude, ou pelo "+ sessão filha" do painel): leva a mãe e a profundidade. */
const withParent = (session) => {
  if (session.machine) return session;
  const link = appLinks.linkOf(session.id);
  if (link && link.parentId !== session.id) return { ...session, parentId: link.parentId, depth: link.depth };
  const parentId = panel.parentOf(session.id);
  return parentId ? { ...session, parentId, depth: panel.depthOf(session.id) } : session;
};

/**
 * Campos que só o painel sabe (todos opcionais, para o widget e o ESP32 seguirem iguais):
 * scheduled (tarefa agendada do app), archived (arquivada no painel), background (em segundo plano: dá para
 * fechar e apagar) e chat ('ready' | 'busy', com o ajuste de mensagens ligado).
 */
const withPanelFlags = (session) => {
  if (session.machine) return session;
  const chatState = chat.stateOf(session.id);
  const flags = {
    ...(appLinks.isScheduled(session.id) && { scheduled: true }),
    ...(panel.isArchived(session.id) && { archived: true }),
    ...(actions.jobOf(session.id) && { background: true }),
    ...(chatState && { chat: chatState }),
  };
  return Object.keys(flags).length ? { ...session, ...flags } : session;
};

/** Na grade vai só o essencial do pedido de permissão; o comando inteiro fica no detalhe. */
const withPermission = (session) => {
  const [first, ...rest] = permissions.forSession(session.id);
  return first
    ? { ...session, permission: { id: first.id, kind: first.kind, tool: first.tool, toolName: first.toolName, count: rest.length + 1, agentType: first.agentType } }
    : session;
};
/** Sessão vigiada leva `watched: true` (só quando verdadeiro), também as de outras máquinas. */
const decorate = (session) => vigia.decorate(withPanelFlags(withPermission(withParent(session))));
/** Vigia: por enquanto cada Aviso só vai ao log (o Web Push chega em outro ticket). */
const vigia = createVigia({
  file: join(DATA_DIR, 'vigia.json'),
  send: (aviso) => log(avisoLine(aviso)),
  onChange: () => store.notify(),
  onError: logError,
});
const ASSET_VERSION = assetVersion(PUBLIC_DIR);
const store = createStore({
  stateFile: STATE_FILE,
  eventsLog: EVENTS_LOG,
  debug: config.debug,
  onError: logError,
  decorate,
  version: ASSET_VERSION,
  extras: () => ({ usage: usage.view(), features }),
  onSessionChange: (before, after, event) => vigia.observe(before, after, event),
});
const usage = createUsage({ file: USAGE_FILE, onChange: () => store.notify(), onError: logError });
const appLinks = createAppLinks({ onChange: () => store.notify(), onError: logError });
const appUsage = createAppUsage({ onSample: (sample) => usage.updateFromApp(sample), onError: logError });
/** Uso do plano pelo /usage do próprio `claude` do Mac: a fonte oficial e mais fiel. */
const usageProbe = createUsageProbe({
  claudeBin: config.claudeBin,
  workDir: join(DATA_DIR, 'sonda-uso'),
  isActive: () => store.view().sessions.some((s) => s.status === 'working' || s.status === 'waiting'),
  onReport: (report) => usage.updateFromProbe(report),
  onError: logError,
});
/** O app do Claude grava os vínculos e o uso em arquivos próprios; relê de tempos em tempos (só o que mudou). */
const APP_REFRESH_MS = 20_000;
const claudeBin = findClaude(config.claudeBin);
const panel = createPanelData({ file: PANEL_FILE, onChange: () => store.notify(), onError: logError });
const chat = createChat({ enabled: features.chat, onChange: () => store.notify() });
const control = createControl({ bin: claudeBin });
/** Sessões já abertas, pelo `claude agents --json` (a sonda do /usage roda numa pasta só dela e fica de fora). */
const discovery = createDiscovery({
  bin: claudeBin,
  ignoreCwd: join(DATA_DIR, 'sonda-uso'),
  onList: (found) => store.adopt(found, { transcriptFor: (cwd, id) => transcriptOf(cwd, id) }),
  onError: logError,
});
const permissions = createPermissions({ timeoutMs: PERMISSION_WAIT_MS, onChange: () => store.notify() });
const remoteGate = createRemoteGate(config.remotes);
const remoteRoutes = createRemoteRoutes({
  gate: remoteGate,
  store,
  permissions,
  log: (line) => process.stderr.write(`[painel] ${new Date().toISOString()} ${line}\n`),
});

const isLoopback = (req) => isLocalHook(req.socket.remoteAddress ?? '', req.headers);
const log = (line) => process.stdout.write(`[painel] ${new Date().toISOString()} ${line}\n`);

/** Token das Telas: GET aceita o token na URL (EventSource não manda cabeçalho); ações só pelo cabeçalho. */
const hasToken = createScreenTokenCheck(config.token);
/** Relógio (ADR 0002): token próprio, que só vale na lista dele. Gerar ou revogar: `node scripts/relogio.js`. */
const watchRoutes = createWatchRoutes({ store, watchToken: () => config.watch?.token ?? null, hasScreenToken: hasToken });
/** Vigiar e parar de vigiar: por enquanto só o token das Telas, no cabeçalho (o do relógio fica barrado). */
const vigiaRoutes = createVigiaRoutes({ vigia, store, allowed: (req, url) => hasToken(req, url, { headerOnly: true }), log });

/** Avisos por Web Push (ADR 0001): chaves VAPID no config.json, inscrições dos aparelhos em aparelhos.json. */
const push = createPush({ file: DEVICES_FILE, vapid: ensureVapidKeys(), subject: config.vapid?.subject, log, onError: logError });
const pushRoutes = createPushRoutes({ push, hasToken });

const actions = createActionRoutes({
  store,
  chat,
  panel,
  control,
  discovery,
  features: {
    get: () => features,
    set(next) {
      features = saveFeatures(next);
      chat.setEnabled(features.chat);
      store.notify();
      return features;
    },
  },
  isLoopback,
  hasToken,
  logError,
  log,
});

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
  if (event.hook_event_name === 'UserPromptSubmit') usageProbe.nudge();
  if (event.hook_event_name === 'SessionEnd') chat.drop(event.session_id);
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
  const [view] = toView({ [id]: session }, Date.now()).map(decorate);
  return sendJson(res, 200, {
    success: true,
    data: {
      ...view,
      cwd: session.cwd,
      lastPrompt: session.lastPrompt,
      lastPromptAt: session.lastPromptAt ?? null,
      lastChat: session.lastChat ?? null,
      chatHistory: session.machine ? [] : chat.historyOf(id),
      startedAt: session.startedAt,
      permissions: permissions.forSession(id),
      subagentsRecent: recentSubagents(session).map(subagentView),
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
  if (watchRoutes.handle(req, res, url)) return undefined;
  if (vigiaRoutes.handle(req, res, url)) return undefined;
  if (await pushRoutes.handle(req, res, url)) return undefined;
  if (await actions.handle(req, res, url)) return undefined;
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
const refreshApp = () => Promise.all([appLinks.refresh(), appUsage.refresh()]);
refreshApp();
setInterval(refreshApp, APP_REFRESH_MS).unref();
usageProbe.start();
// PAINEL_DESCOBRIR=0 desliga a descoberta (só os hooks contam), útil em testes.
if (process.env.PAINEL_DESCOBRIR !== '0') discovery.start();
if (!usageProbe.available) process.stderr.write('[painel] não achei o `claude`: o uso do plano vem só da status line e do app do Claude\n');

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
