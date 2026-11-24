// Painel: conexão com o Mac, barra do topo, contadores, relógio e os três modos de ver (Quadros, Grade, Mapa).
import { agentSvg } from './agents.js';
import { wireClawd } from './clawd.js';
import { createApi, readToken, saveToken } from './api.js';
import { createDetail } from './detail.js';
import { renderUsage } from './usage-bar.js';
import { createStylePicker } from './style-picker.js';
import { createTiles } from './tiles.js';
import { createGridView } from './grid-view.js';
import { visibleSessions } from './groups.js';
import { createTopbar } from './topbar.js';
import { createSettingsDialog } from './settings-dialog.js';
import { createLauncher } from './session-actions.js';
import { buildTree } from './orbit.js';
import { createOrbit } from './orbit-view.js';
import { elapsed, sessionFromHash } from './format.js';

const TICK_MS = 1000;
const $ = (id) => document.getElementById(id);
const ui = {
  grid: $('grid'),
  ruler: $('grid-ruler'),
  orbit: $('orbit'),
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
let snapshot = { sessions: [], features: {} };
let shown = [];
let clockOffset = 0;
let lastContactAt = null;
let online = false;
let orbit = null;

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

wireClawd();
const api = createApi(() => token);
const picker = createStylePicker({
  button: $('style-button'),
  dialog: $('style-picker'),
  options: $('picker-options'),
  onChange: () => {
    tiles.resetFaces();
    render();
    detail.onSnapshot(snapshot);
  },
});
const launcher = createLauncher({ api });
const settings = createSettingsDialog({ api });
const detail = createDetail({
  api,
  serverNow,
  agentStyle: () => picker.current(),
  sessions: () => snapshot.sessions,
  features: () => snapshot.features ?? {},
  launcher,
  // Marca na grade (e no mapa) a sessão aberta no painel lateral.
  onOpenChange: (id) => {
    tiles.select(id);
    orbit?.select(id);
  },
});
const openSession = (id) => detail.open(id, snapshot.sessions.find((s) => s.id === id));
const tiles = createTiles({
  agentStyle: () => picker.current(),
  serverNow,
  onClick: (tile) => {
    // Quadrado de família fechada: o toque abre a família no lugar; o detalhe abre pelos quadrados de dentro.
    if (tile.closedFamily) gridView.openFamily(tile.id);
    else openSession(tile.id);
  },
});
const gridView = createGridView({ grid: ui.grid, ruler: ui.ruler, tiles, onChange: () => render() });
const topbar = createTopbar({ api, onChange: () => render(), openDetail: (id, session) => detail.open(id, session), onLaunch: () => launcher.open() });
$('settings-button').addEventListener('click', () => settings.open(snapshot.features));

function renderMap() {
  orbit ??= createOrbit({
    stage: ui.orbit,
    avatar: Object.assign((seed) => agentSvg(picker.current(), seed), { key: () => picker.current() }),
    core: (seed) => agentSvg('robo', seed),
    onOpenSession: (session) => openSession(session.id),
    pinned: () => gridView.pinned(),
  });
  orbit.render(buildTree(shown));
  orbit.select(detail.openId());
}

function render() {
  shown = visibleSessions(snapshot.sessions, { showScheduled: topbar.showScheduled() });
  const view = topbar.view();
  const asking = !ui.tokenForm.hidden;
  ui.grid.hidden = view === 'mapa' || asking;
  ui.orbit.hidden = view !== 'mapa' || asking;
  topbar.update(snapshot);
  if (view === 'mapa') renderMap();
  else {
    orbit?.pause();
    gridView.render(shown, { grouped: view === 'quadros' });
    tiles.select(detail.openId());
  }
  ui.empty.hidden = asking || shown.length > 0;
  renderCounters();
}

function renderCounters() {
  const count = (predicate) => shown.filter(predicate).length;
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
  shown.forEach((session) => {
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
    snapshot = { ...incoming, features: incoming.features ?? {} };
    clockOffset = snapshot.now - Date.now();
    lastContactAt = Date.now();
    setOnline(true);
    render();
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
  ui.tokenForm.hidden = false;
  render();
  if (message) ui.tokenForm.querySelector('p').textContent = message;
}

ui.tokenForm.addEventListener('submit', (event) => {
  event.preventDefault();
  token = ui.tokenInput.value.trim();
  saveToken(token);
  ui.tokenForm.hidden = true;
  render();
  connect();
});

/** O service worker só registra em HTTPS (ou localhost); em http:// o app abre normal, sem instalar. */
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* sem service worker: segue como página */ });
}

/** O painel lateral e o mapa começam abaixo da barra do topo, que muda de altura (quebra de linha no celular). */
const topbarEl = document.querySelector('.topbar');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--topbar-h', `${topbarEl.offsetHeight}px`);
}).observe(topbarEl);

/** Cabem mais (ou menos) colunas: os quadros precisam de outra largura. */
new ResizeObserver(() => {
  if (topbar.view() === 'quadros' && gridView.needsResize()) render();
}).observe(ui.ruler);

window.addEventListener('hashchange', openFromHash);
setInterval(tick, TICK_MS);
tick();
if (token) connect(); else askToken();
