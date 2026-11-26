// Token e constantes do app do relógio (ADR 0002). O token nunca é impresso.
//   node scripts/relogio.js token                      gera o token do relógio (se não houver) e reinicia o painel
//   node scripts/relogio.js revogar                    apaga o token: o relógio passa a receber 401
//   node scripts/relogio.js segredos <arquivo.mc> [--url https://…]
//                                                      grava o endereço e o token como constantes para a build
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureWatchToken, revokeWatchToken } from '../src/config.js';
import { LABEL } from './mac.js';

const TAILSCALE_BINS = ['tailscale', '/usr/local/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
const out = (line = '') => process.stdout.write(`${line}\n`);

/** Endereço do painel na tailnet, o mesmo que o instalador mostra: https://<mac>.<rede>.ts.net */
export function tailnetUrl() {
  for (const bin of TAILSCALE_BINS) {
    try {
      const status = JSON.parse(execFileSync(bin, ['status', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      const name = String(status.Self?.DNSName ?? '').replace(/\.$/, '');
      if (name) return `https://${name}`;
    } catch { /* tenta o próximo */ }
  }
  throw new Error('não achei o endereço do Mac na tailnet (`tailscale status --json`); passe --url https://…');
}

/** Só https: o Connect IQ recusa http (erro -1001), também no simulador. */
export function checkUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('o endereço do painel precisa ser https:// (o relógio recusa http)');
  if (url.search || url.hash || url.username) throw new Error('passe só o endereço, sem ?t=, # ou usuário');
  return url.href.replace(/\/$/, '');
}

const monkeyString = (text) => `"${String(text).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** Fonte Monkey C com as constantes. Fica fora do git (relogio/gerado/). */
export function secretsSource({ url, token }) {
  return [
    '// Gerado por scripts/relogio.js. Fora do git: leva o token do relógio.',
    'import Toybox.Lang;',
    '',
    'module Segredos {',
    `    const URL as String = ${monkeyString(url)};`,
    `    const TOKEN as String = ${monkeyString(token)};`,
    '}',
    '',
  ].join('\n');
}

/** Reinicia o serviço do painel (se estiver instalado) para ele ler o token novo. */
function restartPanel() {
  if (process.env.PAINEL_DIR) {
    out('Com PAINEL_DIR, o serviço do Mac não é dessa pasta: reinicie à mão o painel que usa esses dados.');
    return;
  }
  try {
    execFileSync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/${LABEL}`], { stdio: 'pipe' });
    out('Painel reiniciado para ler o token do relógio.');
  } catch {
    out('O serviço do painel não está instalado: o token vale quando o painel subir.');
  }
}

function argAfter(args, flag) {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
}

function main([command, ...args]) {
  if (command === 'token') {
    const { created } = ensureWatchToken();
    out(created ? 'Token do relógio gerado.' : 'O relógio já tem token; nada mudou.');
    if (created) restartPanel();
    return;
  }
  if (command === 'revogar') {
    if (!revokeWatchToken()) {
      out('O relógio não tinha token.');
      return;
    }
    out('Token do relógio revogado. Para voltar a usar o relógio, gere outro e instale o app de novo.');
    restartPanel();
    return;
  }
  if (command === 'segredos' && args[0] && !args[0].startsWith('--')) {
    const url = checkUrl(argAfter(args, '--url') ?? process.env.PAINEL_URL ?? tailnetUrl());
    const { token, created } = ensureWatchToken();
    if (created) restartPanel();
    mkdirSync(dirname(args[0]), { recursive: true });
    writeFileSync(args[0], secretsSource({ url, token }), { mode: 0o600 });
    out(`Constantes do relógio gravadas (painel em ${url}).`);
    return;
  }
  out('uso: node scripts/relogio.js token | revogar | segredos <arquivo.mc> [--url https://…]');
  process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`relogio: ${error.message}\n`);
    process.exitCode = 1;
  }
}
