// Service worker do painel: sem cache (o estado tem que ser sempre o do Mac agora).
// Só cuida de uma coisa: se o Mac não responder ao abrir o app, mostra uma tela de "sem conexão"
// em vez do erro do navegador.
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
