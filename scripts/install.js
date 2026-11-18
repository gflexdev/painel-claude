// Instala o painel no Mac: hooks do Claude Code + serviço launchd sempre ligado.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, DATA_DIR, rememberClaudeBin } from '../src/config.js';
import { findClaude } from '../src/usage-probe.js';
import {
  HOOK_SCRIPT, PERMISSION_SCRIPT, LABEL, PLIST_FILE, ROOT, SETTINGS_FILE,
  plistXml, reachableAddresses, readSettings, startService, withPainelHooks, writeSettings,
} from './mac.js';
import { STATUSLINE_SCRIPT, saveOriginal, withPainelStatusLine } from './statusline.js';

const out = (line = '') => process.stdout.write(`${line}\n`);
const uid = process.getuid();

const config = loadConfig();

/** O `claude` do PATH de quem está instalando; o serviço usa esse caminho para ler o /usage. */
function claudeOnPath() {
  try {
    const path = execFileSync('/usr/bin/which', ['claude'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return path || null;
  } catch {
    return null;
  }
}
const claudeBin = findClaude(claudeOnPath());
rememberClaudeBin(claudeBin);
out(claudeBin
  ? `✔ uso do plano pelo /usage do claude (${claudeBin})`
  : '• não achei o comando claude: o uso do plano vem só da status line e do app do Claude. Instale o Claude Code no terminal e rode este instalador de novo.');
chmodSync(HOOK_SCRIPT, 0o755);
chmodSync(PERMISSION_SCRIPT, 0o755);

chmodSync(STATUSLINE_SCRIPT, 0o755);
chmodSync(join(ROOT, 'hooks', 'enviar-uso.sh'), 0o755);

const withStatusLine = !process.argv.includes('--sem-statusline');
const settings = readSettings();
const hooked = withPainelHooks(settings);
const wrapped = withStatusLine ? withPainelStatusLine(hooked) : { settings: hooked };
if (wrapped.original !== undefined) saveOriginal(wrapped.original);
if (JSON.stringify(wrapped.settings) !== JSON.stringify(settings)) {
  writeSettings(wrapped.settings);
  out(`✔ hooks adicionados em ${SETTINGS_FILE} (backup ao lado: settings.json.bak-painel-*)`);
} else {
  out('✔ hooks já estavam instalados');
}
if (wrapped.original !== undefined) {
  out(wrapped.original
    ? '✔ status line: a sua continua igual; o painel só lê dela o uso do plano'
    : '✔ status line ligada (mostra o modelo e manda o uso do plano ao painel)');
}

if (process.argv.includes('--sem-servico')) {
  out('• serviço não instalado (--sem-servico); para subir na mão: npm start');
} else {
  const plist = plistXml({ nodePath: process.execPath, serverPath: join(ROOT, 'src', 'server.js'), logDir: DATA_DIR });
  const plistChanged = !existsSync(PLIST_FILE) || readFileSync(PLIST_FILE, 'utf8') !== plist;
  if (plistChanged) {
    mkdirSync(dirname(PLIST_FILE), { recursive: true });
    writeFileSync(PLIST_FILE, plist);
  }
  const action = startService({ uid, plistChanged });
  out(`✔ serviço ${LABEL} ${action} (log em ${join(DATA_DIR, 'servidor.log')})`);
}

out();
out('Abra no tablet (uma vez; depois ele lembra o token):');
reachableAddresses().forEach(({ address, kind }) => {
  out(`  ${kind.padEnd(10)} http://${address}:${config.port}/?t=${config.token}`);
});
out();
out('Sessões já abertas passam a aparecer no próximo evento; se alguma não aparecer, reabra-a.');
