import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const DATA_DIR = process.env.PAINEL_DIR ?? join(homedir(), '.config', 'painel-claude');
export const CONFIG_FILE = join(DATA_DIR, 'config.json');
export const STATE_FILE = join(DATA_DIR, 'state.json');
export const EVENTS_LOG = join(DATA_DIR, 'eventos.log');
export const USAGE_FILE = join(DATA_DIR, 'uso.json');

const DEFAULTS = Object.freeze({ port: 7777, host: '0.0.0.0', debug: false });

/** Lê a configuração; na primeira vez gera o token de acesso das telas. */
export function loadConfig() {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  let stored = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      stored = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    } catch (error) {
      throw new Error(`config inválida em ${CONFIG_FILE}: ${error.message}`);
    }
  }
  const config = { ...DEFAULTS, ...stored, token: stored.token ?? randomBytes(18).toString('base64url') };
  if (!stored.token) writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return {
    ...config,
    port: Number(process.env.PAINEL_PORT ?? config.port),
    debug: process.env.PAINEL_DEBUG === '1' || config.debug === true,
  };
}

function readStored() {
  return existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {};
}

function writeStored(stored) {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(`${CONFIG_FILE}.tmp`, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${CONFIG_FILE}.tmp`, CONFIG_FILE);
}

/**
 * Token da máquina remota (ex.: "vps-dev"), separado do token das telas.
 * Gera um na primeira vez; `address` prende a máquina ao IP dela na tailnet.
 */
export function ensureRemote(name, { address } = {}) {
  const stored = readStored();
  const current = stored.remotes?.[name] ?? {};
  const entry = { ...current, token: current.token ?? randomBytes(32).toString('base64url'), ...(address && { address }) };
  if (JSON.stringify(entry) !== JSON.stringify(current)) {
    writeStored({ ...stored, remotes: { ...stored.remotes, [name]: entry } });
  }
  return entry;
}

/** Tira a máquina da lista: o token dela deixa de valer no próximo início do servidor. */
export function removeRemote(name) {
  const stored = readStored();
  if (!stored.remotes?.[name]) return false;
  const { [name]: _removed, ...remotes } = stored.remotes;
  writeStored({ ...stored, remotes });
  return true;
}
