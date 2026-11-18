// Grade de sessões, contadores, relógio e conexão com o Mac.
import { agentSvg } from './agents.js';
import { createApi, readToken, saveToken } from './api.js';
import { createDetail } from './detail.js';
import { renderUsage } from './usage-bar.js';
import { createStylePicker } from './style-picker.js';
import { ACTIVITY_WORD, STATUS_WORD, accessoryOf, el, elapsed, sessionFromHash, tokens } from './format.js';

const TICK_MS = 1000;
const $ = (id) => document.getElementById(id);
const ui = {
  grid: $('grid'),
  empty: $('empty'),
  link: $('link'),
  clock: $('clock'),
  offline: $('offline'),
  usage: $('usage'),
  offlineText: $('offline-text'),
  tokenForm: $('token-form'),
  tokenInput: $('token-input'),
};

let token = readToken();
let snapshot = { sessions: [] };
let clockOffset = 0;
let lastContactAt = null;
let online = false;
const tiles = new Map();

const serverNow = () => Date.now() + clockOffset;
const PAGE_VERSION = document.querySelector('meta[name="painel-version"]')?.content ?? '';
const RELOAD_KEY = 'painel-claude-reloaded-for';

/** O Mac foi atualizado depois que esta página abriu: recarrega (uma vez por versão, para não entrar em laço). */
function reloadIfOutdated(serverVersion) {
  if (!serverVersion || serverVersion === PAGE_VERSION) return false;
  let already = null;
  try { already = sessionStorage.getItem(RELOAD_KEY); } catch { /* sem storage */ }
  if (already === serverVersion) return false;
  try { sessionStorage.setItem(RELOAD_KEY, serverVersion); } catch { /* segue */ }
  location.reload();
  return true;
}
const api = createApi(() => token);
const picker = createStylePicker({
  button: $('style-button'),
  dialog: $('style-picker'),
  options: $('picker-options'),
  onChange: () => {
    tiles.forEach((tile) => { tile.botKey = ''; });
    renderGrid();
    detail.onSnapshot(snapshot);
  },
});
const detail = createDetail({ api, serverNow, agentStyle: () => picker.current() });

function createTile(session) {
  const button = el('button', 'tile');
  button.type = 'button';
  const bot = el('div', 'bot');
  const name = el('h2', 'name');
  const project = el('div', 'project');
  const detailLine = el('div', 'detail-line');
  const statusLine = el('div', 'status-line');
  const word = el('span', 'status-word');
  const time = el('span', 'elapsed');
  statusLine.append(word, time);
  button.append(bot, name, project, detailLine, statusLine);
  button.addEventListener('click', () => {
    const current = snapshot.sessions.find((s) => s.id === session.id);
    detail.open(session.id, current);
  });
  return { button, bot, name, project, detail: detailLine, word, time, botKey: '' };
}

function statusWord(session) {
  if (session.permission) {
    const verb = session.permission.kind === 'question' ? 'responder' : session.permission.kind === 'plan' ? 'aprovar plano' : 'aprovar?';
    return session.permission.count > 1 ? `${verb} (${session.permission.count})` : verb;
  }
  if (session.status === 'idle' && session.unseen) return 'terminou · ver';
  if (session.status === 'working' && session.activity) return ACTIVITY_WORD[session.activity] ?? 'rodando';
  return STATUS_WORD[session.status] ?? session.status;
}

function updateTile(tile, session) {
  const accessory = accessoryOf(session);
  const style = picker.current();
  const botKey = `${style}|${session.name}|${session.project}|${accessory}`;
  if (tile.botKey !== botKey) {
    tile.bot.replaceChildren(agentSvg(style, { id: session.id, name: session.name, project: session.project, accessory }));
    tile.botKey = botKey;
  }
  tile.button.dataset.status = session.status;
  tile.button.toggleAttribute('data-stale', session.stale);
  tile.button.toggleAttribute('data-unseen', session.status === 'idle' && session.unseen);
  tile.name.textContent = session.name;
  const projectText = [session.project, session.origin, session.contextTokens ? `${tokens(session.contextTokens)} ctx` : '']
    .filter(Boolean).join(' · ');
  // Sessão de outra máquina (ex.: vps-dev) leva a marca na frente.
  tile.project.replaceChildren(...(session.machine ? [el('span', 'machine', session.machine), ' '] : []), projectText);
  tile.button.toggleAttribute('data-remote', Boolean(session.machine));
  tile.detail.textContent = session.stale ? `sem sinal há ${elapsed(session.lastEventAt, serverNow())}` : session.detail;
  tile.word.textContent = statusWord(session);
  tile.time.textContent = elapsed(session.since, serverNow());
  tile.button.setAttribute('aria-label', `${session.name}: ${tile.word.textContent}, ${session.detail}`);
}

function renderGrid() {
  const seen = new Set();
  snapshot.sessions.forEach((session, index) => {
    seen.add(session.id);
    const tile = tiles.get(session.id) ?? createTile(session);
    tiles.set(session.id, tile);
    updateTile(tile, session);
    if (ui.grid.children[index] !== tile.button) ui.grid.insertBefore(tile.button, ui.grid.children[index] ?? null);
  });
  [...tiles.keys()].filter((id) => !seen.has(id)).forEach((id) => {
    tiles.get(id).button.remove();
    tiles.delete(id);
  });
  ui.empty.hidden = snapshot.sessions.length > 0;
  renderCounters();
}

function renderCounters() {
  const count = (predicate) => snapshot.sessions.filter(predicate).length;
  const counts = {
    waiting: count((s) => s.status === 'waiting'),
    working: count((s) => s.status === 'working'),
    unseen: count((s) => s.status === 'idle' && s.unseen),
    idle: count((s) => s.status === 'idle' && !s.unseen),
  };
  Object.entries(counts).forEach(([status, value]) => {
    const node = $(`count-${status}`);
    node.textContent = String(value);
    node.parentElement.toggleAttribute('data-zero', value === 0);
  });
  document.title = counts.waiting ? `(${counts.waiting}) Painel Claude` : 'Painel Claude';
}

function renderOffline() {
  ui.offline.hidden = online || lastContactAt === null;
  if (!ui.offline.hidden) {
    ui.offlineText.textContent = `Mac sem resposta · último contato há ${elapsed(lastContactAt, Date.now())} · tentando de novo`;
  }
}

function tick() {
  ui.clock.textContent = new Date(serverNow()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  renderUsage(ui.usage, snapshot.usage, serverNow());
  snapshot.sessions.forEach((session) => {
    const tile = tiles.get(session.id);
    if (!tile) return;
    tile.time.textContent = elapsed(session.since, serverNow());
    if (session.stale) tile.detail.textContent = `sem sinal há ${elapsed(session.lastEventAt, serverNow())}`;
  });
  renderOffline();
}

function setOnline(value) {
  online = value;
  ui.link.dataset.state = value ? 'online' : 'offline';
  renderOffline();
}

/** Link do widget do Mac (#sessao=<id>): abre o detalhe da sessão assim que ela estiver no snapshot. */
function openFromHash() {
  const id = sessionFromHash(location.hash);
  if (!id) return;
  const session = snapshot.sessions.find((s) => s.id === id);
  if (!session) return;
  history.replaceState(null, '', location.pathname + location.search);
  detail.open(id, session);
}

function connect() {
  ui.link.dataset.state = 'connecting';
  const stream = new EventSource(api.streamUrl());
  stream.addEventListener('snapshot', (event) => {
    const incoming = JSON.parse(event.data);
    if (reloadIfOutdated(incoming.version)) return;
    snapshot = incoming;
    clockOffset = snapshot.now - Date.now();
    lastContactAt = Date.now();
    setOnline(true);
    renderGrid();
    tick();
    detail.onSnapshot(snapshot);
    openFromHash();
  });
  stream.addEventListener('error', async () => {
    setOnline(false);
    try {
      await api.get('/api/sessions');
    } catch (error) {
      if (error.status === 401) {
        stream.close();
        askToken('Token recusado pelo Mac. Confira e cole de novo.');
      }
    }
  });
}

function askToken(message) {
  ui.grid.hidden = true;
  ui.empty.hidden = true;
  ui.tokenForm.hidden = false;
  if (message) ui.tokenForm.querySelector('p').textContent = message;
}

ui.tokenForm.addEventListener('submit', (event) => {
  event.preventDefault();
  token = ui.tokenInput.value.trim();
  saveToken(token);
  ui.tokenForm.hidden = true;
  ui.grid.hidden = false;
  connect();
});

/** O service worker só registra em HTTPS (ou localhost); em http:// o app abre normal, sem instalar. */
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* sem service worker: segue como página */ });
}

window.addEventListener('hashchange', openFromHash);
setInterval(tick, TICK_MS);
tick();
if (token) connect(); else askToken();
