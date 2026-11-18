// Peças HTTP comuns às rotas locais (hooks do Mac, API das telas) e às remotas (hooks da VPS).
import { hookOutput } from './permissions.js';

export const SESSION_ID = /^[\w-]{1,80}$/;

export function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const tooLarge = () => Object.assign(new Error('corpo grande demais'), { status: 413 });

/** Lê o corpo até `limit` bytes; passou disso, para de ler e falha com status 413. */
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > limit) {
      req.resume();
      reject(tooLarge());
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      if (size > limit) return;
      size += chunk.length;
      if (size > limit) {
        reject(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Evento de hook (JSON com hook_event_name). Responde 400 e devolve null se não for. */
export async function readHookEvent(req, res, limit) {
  let event;
  try {
    event = JSON.parse(await readBody(req, limit));
  } catch (error) {
    if (error.status) throw error;
    sendJson(res, 400, { success: false, error: 'JSON inválido' });
    return null;
  }
  if (!event || typeof event !== 'object' || typeof event.hook_event_name !== 'string') {
    sendJson(res, 400, { success: false, error: 'evento sem hook_event_name' });
    return null;
  }
  return event;
}

/**
 * Hook PermissionRequest: segura a conexão até alguém decidir no painel.
 * 200 + JSON = decisão para o Claude; 204 = sem decisão (fica o diálogo de lá).
 * Se a conexão cair (respondido no diálogo), o pedido sai da tela.
 */
export async function holdPermission(res, event, permissions) {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  const decision = await permissions.wait(event, controller.signal);
  if (res.destroyed) return;
  if (!decision) {
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(hookOutput(decision)));
}
