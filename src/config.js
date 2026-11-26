import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { generateVapidKeys, isVapidPair } from './webpush.js';

export const DATA_DIR = process.env.PAINEL_DIR ?? join(homedir(), '.config', 'painel-claude');
export const CONFIG_FILE = join(DATA_DIR, 'config.json');
export const STATE_FILE = join(DATA_DIR, 'state.json');
export const EVENTS_LOG = join(DATA_DIR, 'eventos.log');
export const USAGE_FILE = join(DATA_DIR, 'uso.json');
export const PANEL_FILE = join(DATA_DIR, 'painel.json');
/** Inscrições Web Push dos aparelhos que deram licença para receber Avisos. */
export const DEVICES_FILE = join(DATA_DIR, 'aparelhos.json');

/**
 * Ajustes que deixam o painel agir nas sessões (grupo 2). Todos começam desligados e só mudam pelo próprio Mac.
 * chat: mandar mensagens às sessões; launch: abrir sessões; closeRemove: fechar e apagar sessões abertas em
 * segundo plano.
 */
export const FEATURE_KEYS = Object.freeze(['chat', 'launch', 'closeRemove']);

/** Qualquer coisa → { chat, launch, closeRemove } só com true/false; o que não for `true` vale desligado. */
export function normalizeFeatures(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.freeze(Object.fromEntries(FEATURE_KEYS.map((key) => [key, source[key] === true])));
}

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
    features: normalizeFeatures(config.features),
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

/**
 * Token do relógio (ADR 0002), separado do token das Telas: só lê a lista do relógio.
 * Gera um na primeira vez. Devolve { token, created }. Vale a partir do próximo início do servidor.
 */
export function ensureWatchToken() {
  const stored = readStored();
  const current = stored.watch?.token;
  if (typeof current === 'string' && current.length >= 32) return { token: current, created: false };
  const token = randomBytes(32).toString('base64url');
  writeStored({ ...stored, watch: { ...stored.watch, token } });
  return { token, created: true };
}

/**
 * Chaves VAPID do Web Push (ADR 0001): geradas na primeira vez e guardadas em `config.json` (0600), como o token
 * das Telas. Trocar as chaves invalida as inscrições dos aparelhos (cada um pede a licença de novo).
 * @returns {{ publicKey: string, privateKey: string }}
 */
export function ensureVapidKeys() {
  const stored = readStored();
  if (isVapidPair(stored.vapid)) return { publicKey: stored.vapid.publicKey, privateKey: stored.vapid.privateKey };
  const keys = generateVapidKeys();
  writeStored({ ...stored, vapid: { ...stored.vapid, ...keys } });
  return keys;
}

/** Apaga o token do relógio: ele deixa de valer no próximo início do servidor. false = não havia. */
export function revokeWatchToken() {
  const stored = readStored();
  if (!stored.watch?.token) return false;
  const { watch: _removed, ...rest } = stored;
  writeStored(rest);
  return true;
}

/** Guarda onde está o `claude` (o serviço do launchd não tem o PATH do terminal). null apaga. */
export function rememberClaudeBin(path) {
  const stored = readStored();
  if ((stored.claudeBin ?? null) === (path ?? null)) return false;
  const { claudeBin: _old, ...rest } = stored;
  writeStored(path ? { ...rest, claudeBin: path } : rest);
  return true;
}

/** Grava os Ajustes no config.json (sem mexer no resto) e devolve o que ficou valendo. */
export function saveFeatures(features) {
  const next = normalizeFeatures(features);
  const stored = readStored();
  writeStored({ ...stored, features: { ...next } });
  return next;
}

/** Tira a máquina da lista: o token dela deixa de valer no próximo início do servidor. */
export function removeRemote(name) {
  const stored = readStored();
  if (!stored.remotes?.[name]) return false;
  const { [name]: _removed, ...remotes } = stored.remotes;
  writeStored({ ...stored, remotes });
  return true;
}
