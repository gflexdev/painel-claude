// Peças comuns do instalador e do desinstalador (macOS).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const HOOK_SCRIPT = join(ROOT, 'hooks', 'enviar-evento.sh');
export const PERMISSION_SCRIPT = join(ROOT, 'hooks', 'permissao.sh');
export const SETTINGS_FILE = join(homedir(), '.claude', 'settings.json');
export const LABEL = 'br.com.gflex.painel-claude';
export const PLIST_FILE = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

/**
 * Hooks do painel por evento. O de permissão segura até 10 min esperando o toque na tela
 * (o diálogo do Claude corre junto); os outros têm timeout curto.
 */
export function hookPlan(eventCommand, permissionCommand) {
  const eventHook = Object.freeze({ type: 'command', command: eventCommand, timeout: 3 });
  const permissionHook = Object.freeze({ type: 'command', command: permissionCommand, timeout: 600 });
  return Object.freeze({
    SessionStart: eventHook,
    UserPromptSubmit: eventHook,
    PreToolUse: eventHook,
    PostToolUse: eventHook,
    PermissionRequest: permissionHook,
    Notification: eventHook,
    Stop: eventHook,
    StopFailure: eventHook,
    PreCompact: eventHook,
    SessionEnd: eventHook,
  });
}
export const HOOK_PLAN = hookPlan(HOOK_SCRIPT, PERMISSION_SCRIPT);
export const HOOK_EVENTS = Object.freeze(Object.keys(HOOK_PLAN));
const OUR_COMMANDS = new Set([HOOK_SCRIPT, PERMISSION_SCRIPT]);
const isMacCommand = (command) => OUR_COMMANDS.has(command);

export function readSettings() {
  return existsSync(SETTINGS_FILE) ? JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) : {};
}

export function writeSettings(settings) {
  if (existsSync(SETTINGS_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.bak-painel-${stamp}`);
  }
  writeFileSync(`${SETTINGS_FILE}.tmp`, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(`${SETTINGS_FILE}.tmp`, SETTINGS_FILE);
}

const hasOurs = (group, isOursCommand) => (group.hooks ?? []).some((h) => isOursCommand(h.command));

/** Devolve settings novos sem os hooks em que `isOursCommand(command)` é verdadeiro. */
export function stripHooks(settings, isOursCommand) {
  const entries = Object.entries(settings.hooks ?? {})
    .map(([event, groups]) => [event, groups.filter((g) => !hasOurs(g, isOursCommand))])
    .filter(([, groups]) => groups.length > 0);
  return { ...settings, hooks: Object.fromEntries(entries) };
}

/** Devolve settings novos com os hooks do plano (troca versões antigas, sem duplicar nem apagar os outros). */
export function mergeHooks(settings, plan, isOursCommand) {
  const cleaned = stripHooks(settings, isOursCommand).hooks;
  const hooks = { ...cleaned };
  Object.entries(plan).forEach(([event, hook]) => {
    hooks[event] = [...(cleaned[event] ?? []), { hooks: [{ ...hook }] }];
  });
  return { ...settings, hooks };
}

/** Devolve settings novos com os hooks do painel conforme o plano (troca versões antigas, sem duplicar). */
export const withPainelHooks = (settings) => mergeHooks(settings, HOOK_PLAN, isMacCommand);

/** Devolve settings novos sem o hook do painel. */
export const withoutPainelHooks = (settings) => stripHooks(settings, isMacCommand);

export function plistXml({ nodePath, serverPath, logDir }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${serverPath}</string>
  </array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(logDir, 'servidor.log')}</string>
  <key>StandardErrorPath</key><string>${join(logDir, 'servidor.log')}</string>
</dict>
</plist>
`;
}

const UNLOAD_WAIT_MS = 10_000;
const BOOTSTRAP_TRIES = 5;
const POLL_MS = 250;

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const launchctl = (...args) => execFileSync('launchctl', args, { stdio: 'pipe' });

function isLoaded(target) {
  try {
    launchctl('print', target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Liga ou reinicia o serviço. O `bootout` volta antes de o launchd terminar de descarregar,
 * e um `bootstrap` logo em seguida falha com "5: Input/output error"; por isso espera e tenta de novo.
 */
export function startService({ uid, plistChanged }) {
  const domain = `gui/${uid}`;
  const target = `${domain}/${LABEL}`;
  if (isLoaded(target) && !plistChanged) {
    launchctl('kickstart', '-k', target);
    return 'reiniciado';
  }
  if (isLoaded(target)) {
    try { launchctl('bootout', target); } catch { /* já saindo */ }
    for (let waited = 0; isLoaded(target) && waited < UNLOAD_WAIT_MS; waited += POLL_MS) pause(POLL_MS);
  }
  for (let attempt = 1; ; attempt += 1) {
    try {
      launchctl('bootstrap', domain, PLIST_FILE);
      return 'ligado';
    } catch (error) {
      if (attempt >= BOOTSTRAP_TRIES) {
        throw new Error(`launchctl bootstrap falhou ${attempt}x: ${error.stderr?.toString().trim() || error.message}`);
      }
      pause(POLL_MS * attempt * 2);
    }
  }
}

/** IPs por onde o tablet acha o Mac: rede local e Tailscale (100.64.0.0/10). */
export function reachableAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => ({
      address: a.address,
      kind: /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address) ? 'Tailscale' : 'rede local',
    }));
}
