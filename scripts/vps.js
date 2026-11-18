// Liga (ou desliga) uma máquina remota ao painel: hooks do Claude Code de lá falando com o Mac pela tailnet.
//   node scripts/vps.js install   [alias-ssh] [--nome vps-dev]
//   node scripts/vps.js uninstall [alias-ssh] [--nome vps-dev]
// O token da máquina só passa pela entrada padrão do ssh; nunca é impresso.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureRemote, loadConfig, removeRemote } from '../src/config.js';
import { MACHINE_NAME } from '../src/remote.js';
import { LABEL, ROOT, hookPlan, mergeHooks, stripHooks } from './mac.js';

/** Onde ficam as peças na máquina remota (relativo ao $HOME de lá). */
export const REMOTE_HOOKS_DIR = '.local/share/painel-claude/hooks';
export const REMOTE_CONF_DIR = '.config/painel-claude';
export const REMOTE_SCRIPTS = Object.freeze(['evento.sh', 'permissao.sh', 'transcript.sh']);
const SSH_OPTIONS = ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];

const REMOTE_COMMAND = new RegExp(`/${REMOTE_HOOKS_DIR.replaceAll('.', '\\.')}/(evento|permissao)\\.sh$`);
const isRemoteCommand = (command) => typeof command === 'string' && REMOTE_COMMAND.test(command);

/** Plano de hooks com os caminhos absolutos da máquina remota. */
export const remotePlan = (home) => hookPlan(
  `${home}/${REMOTE_HOOKS_DIR}/evento.sh`,
  `${home}/${REMOTE_HOOKS_DIR}/permissao.sh`,
);
export const withRemoteHooks = (settings, home) => mergeHooks(settings, remotePlan(home), isRemoteCommand);
export const withoutRemoteHooks = (settings) => stripHooks(settings, isRemoteCommand);

const out = (line = '') => process.stdout.write(`${line}\n`);

function ssh(alias, command, input) {
  return execFileSync('ssh', [...SSH_OPTIONS, alias, command], {
    input: input ?? '',
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}

function macTailnetIp() {
  for (const bin of ['tailscale', '/usr/local/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale']) {
    try {
      const ip = execFileSync(bin, ['ip', '-4'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0];
      if (ip) return ip;
    } catch { /* tenta o próximo */ }
  }
  throw new Error('não achei o IP do Mac na tailnet (`tailscale ip -4`)');
}

function parseArgs(argv) {
  const [action = 'install', ...rest] = argv;
  const nameAt = rest.indexOf('--nome');
  const name = nameAt >= 0 ? rest[nameAt + 1] : undefined;
  const alias = rest.filter((arg, i) => !arg.startsWith('--') && i !== nameAt + 1)[0] ?? 'vps-dev';
  return { action, alias, name: name ?? alias };
}

function readRemoteSettings(alias) {
  const raw = ssh(alias, 'cat "$HOME/.claude/settings.json" 2>/dev/null || true').trim();
  return raw ? JSON.parse(raw) : {};
}

/** Backup ao lado (settings.json.bak-painel-*), valida o JSON com jq e troca de uma vez. */
function writeRemoteSettings(alias, settings) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const script = [
    'set -e',
    'F="$HOME/.claude/settings.json"',
    'mkdir -p "$HOME/.claude"',
    `[ -f "$F" ] && cp -p "$F" "$F.bak-painel-${stamp}"`,
    'cat > "$F.tmp-painel"',
    'jq empty "$F.tmp-painel"',
    '[ -f "$F" ] && chmod --reference="$F" "$F.tmp-painel"',
    'mv "$F.tmp-painel" "$F"',
  ].join('\n');
  ssh(alias, script, `${JSON.stringify(settings, null, 2)}\n`);
  return `settings.json.bak-painel-${stamp}`;
}

function restartMacService() {
  execFileSync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${LABEL}`], { stdio: 'pipe' });
}

/** Confere token e caminho sem criar sessão: /remote/transcript de uma sessão que não existe dá 404. */
function checkLink(alias) {
  const command = [
    'C="$HOME/' + REMOTE_CONF_DIR + '"',
    'URL=$(sed -n "s/^PAINEL_URL=//p" "$C/remoto.conf")',
    'curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 -m 5 -X POST -H "@$C/remoto.header"'
      + ' -H "X-Painel-Session: teste-de-conexao" --data-binary "" "$URL/remote/transcript"',
  ].join('; ');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = ssh(alias, command).trim();
    if (code === '404') return 'ok';
    if (code !== '000') return `HTTP ${code}`;
    execFileSync('sleep', ['0.5']);
  }
  return 'sem resposta';
}

function install({ alias, name }) {
  const facts = ssh(alias, 'echo "$HOME"; (tailscale ip -4 2>/dev/null | head -n 1); command -v curl jq >/dev/null && echo tem-ferramentas')
    .trim().split('\n');
  const [home, remoteIp] = facts;
  if (!facts.includes('tem-ferramentas')) throw new Error(`${alias} precisa de curl e jq`);
  if (!/^100\./.test(remoteIp ?? '')) throw new Error(`${alias} não informou o IP dele na tailnet`);
  const macIp = macTailnetIp();
  const { port } = loadConfig();

  const before = JSON.stringify(loadConfig().remotes?.[name] ?? null);
  const { token } = ensureRemote(name, { address: remoteIp });
  const remoteChanged = JSON.stringify(loadConfig().remotes?.[name]) !== before;
  out(`✔ máquina "${name}" registrada no Mac (presa ao IP ${remoteIp} da tailnet)`);

  REMOTE_SCRIPTS.forEach((file) => {
    ssh(alias, `set -e; D="$HOME/${REMOTE_HOOKS_DIR}"; mkdir -p "$D"; cat > "$D/${file}"; chmod 755 "$D/${file}"`,
      readFileSync(join(ROOT, 'hooks', 'remoto', file), 'utf8'));
  });
  out(`✔ hooks copiados para ${alias}:~/${REMOTE_HOOKS_DIR}/`);

  const conf = `set -e; umask 077; C="$HOME/${REMOTE_CONF_DIR}"; mkdir -p "$C"`;
  ssh(alias, `${conf}; cat > "$C/remoto.conf"`, `PAINEL_URL=http://${macIp}:${port}\n`);
  ssh(alias, `${conf}; cat > "$C/remoto.header"`, `Authorization: Bearer ${token}\n`);
  out(`✔ endereço do painel (http://${macIp}:${port}) e token gravados em ${alias}:~/${REMOTE_CONF_DIR}/ (modo 600)`);

  const settings = readRemoteSettings(alias);
  const updated = withRemoteHooks(settings, home);
  if (JSON.stringify(updated) !== JSON.stringify(settings)) {
    const backup = writeRemoteSettings(alias, updated);
    out(`✔ hooks adicionados em ${alias}:~/.claude/settings.json (backup: ${backup})`);
  } else {
    out('✔ hooks já estavam no settings.json de lá');
  }

  if (remoteChanged) {
    restartMacService();
    out(`✔ serviço ${LABEL} reiniciado para reconhecer a máquina`);
  }
  out(`✔ teste de conexão ${alias} → painel: ${checkLink(alias)}`);
  out();
  out('Sessões novas de lá aparecem no painel; as já abertas, a partir do próximo evento (ou ao reabrir).');
}

function uninstall({ alias, name }) {
  const settings = readRemoteSettings(alias);
  const updated = withoutRemoteHooks(settings);
  if (JSON.stringify(updated) !== JSON.stringify(settings)) {
    const backup = writeRemoteSettings(alias, updated);
    out(`✔ hooks removidos de ${alias}:~/.claude/settings.json (backup: ${backup})`);
  }
  ssh(alias, `rm -f "$HOME/${REMOTE_CONF_DIR}/remoto.conf" "$HOME/${REMOTE_CONF_DIR}/remoto.header"; rm -rf "$HOME/${REMOTE_HOOKS_DIR}"`);
  out(`✔ hooks e token apagados de ${alias}`);
  if (removeRemote(name)) {
    restartMacService();
    out(`✔ máquina "${name}" removida do painel (token revogado)`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!MACHINE_NAME.test(args.name)) throw new Error(`nome de máquina inválido: ${args.name}`);
  if (args.action === 'install') return install(args);
  if (args.action === 'uninstall') return uninstall(args);
  throw new Error(`ação desconhecida: ${args.action} (use install ou uninstall)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`✘ ${error.stderr?.toString().trim() || error.message}\n`);
    process.exit(1);
  }
}
