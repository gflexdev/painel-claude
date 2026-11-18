// Remove os hooks do painel e desliga o serviço. Mantém ~/.config/painel-claude (token e estado).
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { LABEL, PLIST_FILE, readSettings, withoutPainelHooks, writeSettings } from './mac.js';
import { forgetOriginal, readOriginal, withoutPainelStatusLine } from './statusline.js';

const out = (line) => process.stdout.write(`${line}\n`);

const settings = readSettings();
const updated = withoutPainelStatusLine(withoutPainelHooks(settings), readOriginal());
if (JSON.stringify(updated) !== JSON.stringify(settings)) {
  writeSettings(updated);
  out('✔ hooks e status line do painel removidos do settings.json (backup ao lado)');
}
forgetOriginal();
// Só desliga o serviço se ele foi instalado por este usuário (o plist dele existe): o nome do serviço é o
// mesmo em toda instalação, e um teste com outro HOME não pode derrubar o painel de verdade.
if (existsSync(PLIST_FILE)) {
  try {
    execFileSync('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' });
    out('✔ serviço desligado');
  } catch { /* já estava desligado */ }
  rmSync(PLIST_FILE);
}
