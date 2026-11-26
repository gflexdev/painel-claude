// Avisos por Web Push (ADR 0001): as inscrições dos aparelhos que deram licença, o envio do mesmo Aviso a todas e
// as rotas que o painel usa para se inscrever. As inscrições ficam em aparelhos.json (0600), sem duplicar.
// O Aviso passa pelo serviço de push do navegador (no Android, o do Google) criptografado para o aparelho.
// Nada aqui escreve no log o conteúdo do Aviso nem o endpoint da inscrição (o endpoint é um segredo do aparelho).
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { encryptPayload, fromB64url, isPublicKey, vapidAuthorization } from './webpush.js';
import { readBody, sendJson } from './http.js';

export const MAX_DEVICES = 20;
/** Urgência alta e vida curta: Aviso que chega muito depois já não serve. */
export const AVISO_TTL_S = 600;
const SEND_TIMEOUT_MS = 15_000;
const MAX_ENDPOINT = 2048;
const MAX_BODY = 8 * 1024;
const GONE = new Set([404, 410]);
/** Só os serviços de push dos navegadores: o painel não faz POST para qualquer endereço que lhe mandarem. */
const PUSH_HOSTS = Object.freeze(['fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com']);
/** Contato que vai no JWT VAPID (`sub`); `vapid.subject` no config.json troca. */
export const DEFAULT_SUBJECT = 'https://github.com/gflexdev/painel-claude';

const hostOf = (endpoint) => {
  try { return new URL(endpoint).hostname; } catch { return '?'; }
};
const isPushHost = (host) => PUSH_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));

/**
 * Inscrição do navegador (PushSubscription.toJSON()) → { endpoint, keys: { p256dh, auth } }, ou null se não vale.
 * @param {unknown} raw
 */
export function cleanSubscription(raw) {
  const endpoint = raw?.endpoint;
  const p256dh = raw?.keys?.p256dh;
  const auth = raw?.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT) return null;
  let url;
  try { url = new URL(endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !isPushHost(url.hostname)) return null;
  if (typeof p256dh !== 'string' || !isPublicKey(p256dh)) return null;
  if (typeof auth !== 'string' || fromB64url(auth).length !== 16) return null;
  return { endpoint: url.href, keys: { p256dh, auth } };
}

function loadDevices(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return (Array.isArray(raw.devices) ? raw.devices : [])
      .map((d) => ({ ...cleanSubscription(d), addedAt: Number(d?.addedAt) || 0 }))
      .filter((d) => d.endpoint)
      .slice(-MAX_DEVICES);
  } catch {
    return [];
  }
}

/** Transporte de verdade: POST com fetch, sem seguir redirecionamento. */
export async function fetchTransport(endpoint, { headers, body }) {
  const response = await fetch(endpoint, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
  await response.arrayBuffer().catch(() => {});
  return { status: response.status };
}

/**
 * @param {{ file: string, vapid: { publicKey: string, privateKey: string }, subject?: string,
 *   transport?: (endpoint: string, req: { headers: object, body: Buffer }) => Promise<{ status: number }>,
 *   log?: (line: string) => void, onError?: (context: string, error: unknown) => void, now?: () => number }} deps
 */
export function createPush({ file, vapid, subject = DEFAULT_SUBJECT, transport = fetchTransport, log = () => {}, onError = () => {}, now = Date.now }) {
  let devices = loadDevices(file);

  const commit = (next) => {
    devices = next.slice(-MAX_DEVICES);
    try {
      writeFileSync(`${file}.tmp`, `${JSON.stringify({ devices }, null, 2)}\n`, { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    } catch (error) {
      onError('falha ao salvar aparelhos.json', error);
    }
  };

  /** Um aparelho: 'sent' | 'gone' (404/410: a inscrição morreu) | 'failed'. Só o host e o motivo vão ao log. */
  async function deliver(device, payload) {
    const host = hostOf(device.endpoint);
    try {
      const body = encryptPayload(payload, device.keys);
      const headers = {
        Authorization: vapidAuthorization({ endpoint: device.endpoint, subject, keys: vapid, now: now() }),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(AVISO_TTL_S),
        Urgency: 'high',
      };
      const { status } = await transport(device.endpoint, { headers, body });
      if (status >= 200 && status < 300) return 'sent';
      if (GONE.has(status)) {
        log(`aparelho saiu da lista de Avisos (${host} respondeu ${status})`);
        return 'gone';
      }
      log(`Aviso não entregue em ${host}: HTTP ${status}`);
    } catch (error) {
      log(`Aviso não entregue em ${host}: ${error?.message ?? error}`);
    }
    return 'failed';
  }

  /**
   * Manda o mesmo Aviso a todos os aparelhos. 404/410 apagam a inscrição; outro erro mantém.
   * @param {object} aviso só o que pode aparecer na tela bloqueada (ver docs/tecnico.md)
   * @returns {Promise<{ sent: number, removed: number, failed: number, devices: number }>}
   */
  async function send(aviso) {
    const payload = JSON.stringify(aviso);
    const targets = devices;
    const results = await Promise.all(targets.map((device) => deliver(device, payload)));
    const gone = new Set(targets.filter((_, i) => results[i] === 'gone').map((d) => d.endpoint));
    if (gone.size) commit(devices.filter((d) => !gone.has(d.endpoint)));
    const count = (kind) => results.filter((r) => r === kind).length;
    return { sent: count('sent'), removed: gone.size, failed: count('failed'), devices: devices.length };
  }

  return {
    publicKey: () => vapid.publicKey,
    count: () => devices.length,
    /** Registra (ou atualiza as chaves de) um aparelho. false = inscrição inválida. */
    subscribe(raw) {
      const device = cleanSubscription(raw);
      if (!device) return false;
      const current = devices.find((d) => d.endpoint === device.endpoint);
      if (current && current.keys.p256dh === device.keys.p256dh && current.keys.auth === device.keys.auth) return true;
      commit([...devices.filter((d) => d.endpoint !== device.endpoint), { ...device, addedAt: current?.addedAt ?? now() }]);
      return true;
    },
    /** Tira o aparelho da lista. false = não estava. */
    unsubscribe(endpoint) {
      const next = devices.filter((d) => d.endpoint !== endpoint);
      if (next.length === devices.length) return false;
      commit(next);
      return true;
    },
    send,
    /** Manda sem esperar: quem chama (a ingestão de eventos) segue na hora. */
    notify(aviso) {
      send(aviso).catch((error) => onError('envio de Aviso', error));
    },
  };
}

export const PUSH_ROUTES = Object.freeze({ key: '/api/push/key', subscribe: '/api/push/subscribe', unsubscribe: '/api/push/unsubscribe', test: '/api/push/test' });
/** O Aviso de teste: sem sessão, só para conferir que o caminho até o aparelho (e o relógio) funciona. */
export const TEST_AVISO = Object.freeze({ status: 'test' });

async function readJson(req) {
  try {
    const body = JSON.parse((await readBody(req, MAX_BODY)) || '{}');
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch (error) {
    if (error.status) throw error;
    return null;
  }
}

/**
 * Rotas dos Avisos, todas com o token das Telas no cabeçalho.
 * @param {{ push: ReturnType<typeof createPush>, hasToken: (req: object, url: URL, opts: { headerOnly: boolean }) => boolean }} deps
 */
export function createPushRoutes({ push, hasToken }) {
  const routes = new Map([
    [`GET ${PUSH_ROUTES.key}`, async () => [200, { publicKey: push.publicKey(), devices: push.count() }]],
    [`POST ${PUSH_ROUTES.subscribe}`, async (body) => (push.subscribe(body)
      ? [200, { devices: push.count() }]
      : [400, 'inscrição inválida'])],
    [`POST ${PUSH_ROUTES.unsubscribe}`, async (body) => (typeof body.endpoint === 'string'
      ? [200, { removed: push.unsubscribe(body.endpoint), devices: push.count() }]
      : [400, 'falta o endpoint'])],
    [`POST ${PUSH_ROUTES.test}`, async () => [200, await push.send(TEST_AVISO)]],
  ]);
  const paths = new Set(Object.values(PUSH_ROUTES));

  return {
    /** true = a rota era daqui (já respondida). */
    async handle(req, res, url) {
      if (!paths.has(url.pathname)) return false;
      const handler = routes.get(`${req.method} ${url.pathname}`);
      if (!handler) {
        req.resume();
        sendJson(res, 405, { success: false, error: 'método não permitido' });
        return true;
      }
      if (!hasToken(req, url, { headerOnly: true })) {
        req.resume();
        sendJson(res, 401, { success: false, error: 'token inválido' });
        return true;
      }
      const body = req.method === 'POST' ? await readJson(req) : {};
      if (!body) {
        sendJson(res, 400, { success: false, error: 'corpo inválido' });
        return true;
      }
      const [status, data] = await handler(body);
      sendJson(res, status, status === 200 ? { success: true, data } : { success: false, error: data });
      return true;
    },
  };
}
