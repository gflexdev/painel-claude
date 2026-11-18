// Quem abriu cada sessão, segundo o app do Claude (macOS). O app guarda um arquivo por sessão em
// ~/Library/Application Support/Claude/claude-code-sessions/<conta>/<org>/local_<id>.json com o id que os hooks
// mandam (cliSessionId) e, nas sessões abertas por outra, `spawnedFrom.sessionId` e `startChain.depth`.
// Não é um formato documentado: se mudar ou sumir, o painel só deixa de agrupar as famílias.
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP_SESSIONS_DIR = process.env.PAINEL_CLAUDE_APP_DIR
  ?? join(homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions');
/** Só olha arquivos mexidos neste período: o painel esquece sessões paradas há 12 h. */
const RECENT_MS = 24 * 60 * 60_000;
const LOCAL_FILE = /^local_[\w-]{1,80}\.json$/;
const ID = /^[\w-]{1,80}$/;

const isId = (value) => typeof value === 'string' && ID.test(value);

/** Arquivo do app → o que importa para o painel; null se não for uma sessão reconhecível. */
export function parseAppSession(json) {
  if (!json || typeof json !== 'object' || !isId(json.sessionId) || !isId(json.cliSessionId)) return null;
  const prior = Array.isArray(json.priorCliSessionIds) ? json.priorCliSessionIds.filter(isId) : [];
  const parent = json.spawnedFrom?.sessionId;
  const depth = Number.isInteger(json.startChain?.depth) && json.startChain.depth > 0 ? json.startChain.depth : 0;
  return {
    localId: json.sessionId,
    cliIds: [json.cliSessionId, ...prior],
    cliSessionId: json.cliSessionId,
    parentLocalId: isId(parent) && parent !== json.sessionId ? parent : null,
    depth: isId(parent) ? Math.max(depth, 1) : 0,
  };
}

/**
 * Registros do app → mapa id de sessão (o dos hooks) → { parentId, depth }.
 * Só entra quem tem pai conhecido; o pai é apontado pelo id atual dele.
 */
export function buildLinks(records) {
  const byLocal = new Map(records.filter(Boolean).map((r) => [r.localId, r]));
  const links = new Map();
  for (const record of byLocal.values()) {
    const parent = record.parentLocalId && byLocal.get(record.parentLocalId);
    if (!parent) continue;
    const link = { parentId: parent.cliSessionId, depth: record.depth };
    record.cliIds.forEach((id) => links.set(id, link));
  }
  return links;
}

async function readRecord(path) {
  try {
    return parseAppSession(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return null;
  }
}

async function listFolders(dir) {
  try {
    const accounts = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory());
    const folders = await Promise.all(accounts.map(async (account) => {
      const orgs = (await readdir(join(dir, account.name), { withFileTypes: true })).filter((e) => e.isDirectory());
      return orgs.map((org) => join(dir, account.name, org.name));
    }));
    return folders.flat();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/** Lê os arquivos do app de tempos em tempos (só os que mudaram) e avisa quando os vínculos mudam. */
export function createAppLinks({ dir = APP_SESSIONS_DIR, onChange = () => {}, onError = () => {}, now = Date.now } = {}) {
  const cache = new Map(); // caminho → { mtimeMs, record }
  let links = new Map();
  let signature = '';

  async function load(path, mtimeMs) {
    const cached = cache.get(path);
    if (cached && cached.mtimeMs === mtimeMs) return cached.record;
    const record = await readRecord(path);
    cache.set(path, { mtimeMs, record });
    return record;
  }

  async function refresh() {
    try {
      const records = [];
      for (const folder of await listFolders(dir)) {
        const names = (await readdir(folder)).filter((name) => LOCAL_FILE.test(name));
        const recent = [];
        for (const name of names) {
          const path = join(folder, name);
          const info = await stat(path).catch(() => null);
          if (info && now() - info.mtimeMs < RECENT_MS) recent.push(await load(path, info.mtimeMs));
        }
        // Pai antigo (sessão aberta há dias e parada): lê só o arquivo dele.
        const known = new Set(recent.filter(Boolean).map((r) => r.localId));
        const missing = [...new Set(recent.map((r) => r?.parentLocalId).filter((id) => id && !known.has(id)))];
        for (const id of missing) {
          const path = join(folder, `${id}.json`);
          const info = await stat(path).catch(() => null);
          if (info) recent.push(await load(path, info.mtimeMs));
        }
        records.push(...recent);
      }
      const next = buildLinks(records);
      const nextSignature = JSON.stringify([...next].sort());
      links = next;
      if (nextSignature !== signature) {
        signature = nextSignature;
        onChange();
      }
    } catch (error) {
      onError('vínculos do app do Claude', error);
    }
  }

  return { refresh, linkOf: (id) => links.get(id) ?? null, size: () => links.size };
}
