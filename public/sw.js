// Service worker do painel: sem cache (o estado tem que ser sempre o do Mac agora).
// Cuida de duas coisas: se o Mac não responder ao abrir o app, mostra uma tela de "sem conexão" em vez do erro do
// navegador; e recebe os Avisos (Web Push), mesmo com o app fechado, e os mostra como notificação.
const OFFLINE_PAGE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0e0f12">
<title>Painel Claude</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0f12;color:#eceae4;
    font:16px/1.5 ui-monospace,monospace;text-align:center;padding:24px;box-sizing:border-box}
  b{display:block;font:700 22px system-ui,sans-serif;margin:16px 0 6px}
  small{color:#8d919c} button{margin-top:20px;padding:14px 22px;border:0;border-radius:12px;
    background:#ffb238;color:#1a1205;font:700 16px system-ui,sans-serif}
</style></head><body><div>
  <img src="/icon-192.png" width="96" height="96" alt="">
  <b>Sem conexão com o Mac</b>
  <small>Confira o Wi-Fi ou o Tailscale e se o Mac está ligado.</small><br>
  <button onclick="location.reload()">Tentar de novo</button>
</div></body></html>`;

const OFFLINE_CACHE = 'painel-offline-v1';
const OFFLINE_ICON = '/icon-192.png';

self.addEventListener('install', (event) => {
  // Só o ícone da tela de "sem conexão" fica guardado; nada de estado ou interface em cache.
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_ICON)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === OFFLINE_ICON) {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_ICON)));
    return;
  }
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_PAGE, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })));
});

// Avisos (Web Push). O payload chega já aberto pelo navegador: { status, name?, project?, machine?, sessionId? }.
// Nunca leva comando nem trecho de resposta, porque aparece na tela bloqueada e no relógio.
const AVISO_TITLES = Object.freeze({
  done: 'Terminou',
  error: 'Erro',
  waiting: 'Esperando você',
  background: 'Só comandos em segundo plano',
});
const SESSION_ID = /^[\w-]{1,80}$/;

function avisoNotification(aviso) {
  if (aviso.status === 'test') {
    return { title: 'Aviso de teste', body: 'Os Avisos do painel chegam neste aparelho.', tag: 'painel-teste', url: '/' };
  }
  const id = SESSION_ID.test(aviso.sessionId ?? '') ? aviso.sessionId : null;
  const situation = AVISO_TITLES[aviso.status] ?? 'Aviso';
  const name = String(aviso.name ?? '').slice(0, 80);
  const where = [aviso.project, aviso.machine].filter((part) => typeof part === 'string' && part).join(' · ');
  return {
    title: name ? `${situation} · ${name}` : situation,
    body: where,
    tag: id ? `sessao-${id}` : 'painel-aviso',
    url: id ? `/#sessao=${id}` : '/',
  };
}

self.addEventListener('push', (event) => {
  let aviso = {};
  try { aviso = event.data?.json() ?? {}; } catch { /* payload estranho: mostra um Aviso genérico */ }
  const { title, body, tag, url } = avisoNotification(aviso);
  // Uma etiqueta por sessão: o Aviso novo da mesma sessão substitui o anterior na bandeja e vibra de novo.
  event.waitUntil(self.registration.showNotification(title, {
    body, tag, renotify: true, icon: '/icon-192.png', badge: '/icon-192.png', data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === url.origin);
    if (!open) return self.clients.openWindow(url.href);
    await open.focus();
    // A página já aberta abre o detalhe pelo #sessao= (hashchange), sem recarregar.
    if (url.hash) open.postMessage({ type: 'open-hash', hash: url.hash });
    return undefined;
  })());
});
