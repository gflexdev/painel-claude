// Uso do plano que o app do Claude guarda em ~/Library/Application Support/Claude/plan-usage-history.json:
// amostras { t, u: { sd, fh } } com o % da semana (sd) e das 5 h (fh). Não é documentado; se sumir, o painel
// continua só com a status line.
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP_USAGE_FILE = process.env.PAINEL_CLAUDE_APP_USAGE
  ?? join(homedir(), 'Library', 'Application Support', 'Claude', 'plan-usage-history.json');

/** Conteúdo do arquivo → a amostra mais nova { t, sd?, fh? }, ou null. */
export function latestSample(json) {
  const samples = Array.isArray(json?.samples) ? json.samples : [];
  const valid = samples
    .filter((s) => Number.isFinite(s?.t) && s.u && (Number.isFinite(s.u.sd) || Number.isFinite(s.u.fh)))
    .sort((a, b) => b.t - a.t);
  if (!valid.length) return null;
  const { t, u } = valid[0];
  return { t, ...(Number.isFinite(u.sd) && { sd: u.sd }), ...(Number.isFinite(u.fh) && { fh: u.fh }) };
}

/** Relê o arquivo quando ele muda e entrega a amostra nova. */
export function createAppUsage({ file = APP_USAGE_FILE, onSample, onError = () => {} }) {
  let lastMtime = 0;
  return {
    async refresh() {
      try {
        const info = await stat(file);
        if (info.mtimeMs === lastMtime) return;
        lastMtime = info.mtimeMs;
        const sample = latestSample(JSON.parse(await readFile(file, 'utf8')));
        if (sample) onSample(sample);
      } catch (error) {
        if (error.code !== 'ENOENT') onError('uso do app do Claude', error);
      }
    },
  };
}
