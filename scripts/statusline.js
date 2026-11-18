// Liga a status line do Claude Code ao painel (é por ela que chega o uso do plano, `rate_limits`).
// Quem já tem uma status line continua com ela: a do painel repassa o JSON e chama a original.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../src/config.js';
import { ROOT } from './mac.js';

export const STATUSLINE_SCRIPT = join(ROOT, 'hooks', 'statusline.sh');
/** O comando original, em texto puro, para o script em shell ler sem precisar de jq. */
export const ORIGINAL_COMMAND_FILE = join(DATA_DIR, 'statusline-original.cmd');
/** O objeto `statusLine` original inteiro, para devolver igual ao desinstalar. */
export const ORIGINAL_SETTINGS_FILE = join(DATA_DIR, 'statusline-original.json');

const quote = (path) => `'${path.replaceAll("'", "'\\''")}'`;

/** É a status line deste painel (pelo caminho do script, onde quer que a pasta esteja instalada). */
export const isPainelStatusLine = (command, scriptPath = STATUSLINE_SCRIPT) => typeof command === 'string' && command.includes(scriptPath);

/**
 * @returns {{ settings: object, original?: object|null }} `original` só vem quando a status line foi trocada agora
 * (null = não havia nenhuma); sem `original`, já era a do painel.
 */
export function withPainelStatusLine(settings, scriptPath = STATUSLINE_SCRIPT) {
  const current = settings.statusLine;
  if (isPainelStatusLine(current?.command, scriptPath)) return { settings };
  const statusLine = { type: 'command', command: quote(scriptPath), padding: current?.padding ?? 0 };
  return { settings: { ...settings, statusLine }, original: current ?? null };
}

/** Devolve a status line de antes; se a atual não for a do painel, não mexe. */
export function withoutPainelStatusLine(settings, original, scriptPath = STATUSLINE_SCRIPT) {
  if (!isPainelStatusLine(settings.statusLine?.command, scriptPath)) return settings;
  const { statusLine, ...rest } = settings;
  return original ? { ...rest, statusLine: original } : rest;
}

export function saveOriginal(original) {
  writeFileSync(ORIGINAL_SETTINGS_FILE, JSON.stringify(original), { mode: 0o600 });
  const command = original?.type === 'command' && typeof original.command === 'string' ? original.command : '';
  writeFileSync(ORIGINAL_COMMAND_FILE, command, { mode: 0o600 });
}

export function readOriginal() {
  if (!existsSync(ORIGINAL_SETTINGS_FILE)) return null;
  return JSON.parse(readFileSync(ORIGINAL_SETTINGS_FILE, 'utf8'));
}

export function forgetOriginal() {
  rmSync(ORIGINAL_SETTINGS_FILE, { force: true });
  rmSync(ORIGINAL_COMMAND_FILE, { force: true });
}
