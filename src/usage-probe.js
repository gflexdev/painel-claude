// Uso do plano pela fonte oficial: o próprio `claude` do Mac respondendo ao comando /usage em modo não
// interativo (`claude -p "/usage" --output-format stream-json`). A resposta traz `usage_report.rate_limits`,
// os mesmos dados da tela de Usage. Não gasta plano (0 tokens) e o painel nunca toca no login: quem pergunta
// à Anthropic é o Claude Code instalado. Docs: code.claude.com/docs/en/agent-sdk/typescript (usage_report).
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROBE_TIMEOUT_MS = 45_000;
/** Com sessão rodando, de 5 em 5 min; parado, de 30 em 30. A Anthropic limita a frequência desta consulta. */
export const ACTIVE_EVERY_MS = 5 * 60_000;
export const IDLE_EVERY_MS = 30 * 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

export const PROBE_ARGS = Object.freeze([
  '-p', '/usage',
  '--output-format', 'stream-json', '--verbose',
  '--no-session-persistence', '--strict-mcp-config',
  // Sem hooks: a consulta não pode aparecer no painel como uma sessão.
  '--settings', '{"disableAllHooks":true}',
]);

/** Onde costuma estar o `claude` (o serviço do launchd não tem o PATH do terminal). */
export function claudeCandidates(home = homedir()) {
  return [
    join(home, '.local', 'bin', 'claude'),
    join(home, '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    join(home, '.npm-global', 'bin', 'claude'),
  ];
}

export function findClaude(configured, exists = existsSync) {
  if (configured && exists(configured)) return configured;
  return claudeCandidates().find((path) => exists(path)) ?? null;
}

function toMs(value) {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
}

const clampPercent = (value) => Math.min(100, Math.max(0, value));

/** Saída do `claude -p "/usage" --output-format stream-json` → { fiveHour?, sevenDay?, scoped[] } ou null. */
export function parseUsageReport(output) {
  const report = String(output ?? '').split('\n').reduce((found, line) => {
    if (found || !line.includes('usage_report')) return found;
    try {
      return JSON.parse(line)?.usage_report ?? null;
    } catch {
      return null;
    }
  }, null);
  const limits = report?.rate_limits?.limits;
  if (!Array.isArray(limits)) return null;

  const windows = {};
  const scoped = [];
  for (const limit of limits) {
    if (!Number.isFinite(limit?.percent)) continue;
    const entry = { usedPercentage: clampPercent(limit.percent), resetsAt: toMs(limit.resets_at) };
    if (limit.kind === 'weekly_all') windows.sevenDay = entry;
    else if (limit.group === 'session' || limit.kind === 'session' || limit.kind === 'five_hour') windows.fiveHour = entry;
    else if (limit.scope?.model?.display_name) scoped.push({ label: String(limit.scope.model.display_name), ...entry });
  }
  if (!windows.sevenDay && !windows.fiveHour) return null;
  return { ...windows, scoped };
}

function runClaude(bin, cwd) {
  return new Promise((resolve, reject) => {
    execFile(bin, PROBE_ARGS, { cwd, timeout: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/**
 * Consulta o /usage de tempos em tempos. `isActive()` diz se há sessão rodando (consulta mais vezes).
 * `run(bin, cwd)` existe para os testes.
 */
export function createUsageProbe({
  claudeBin, workDir, isActive = () => false, onReport, onError = () => {},
  run = runClaude, now = Date.now, setTimer = setTimeout,
}) {
  const bin = findClaude(claudeBin);
  let failures = 0;
  let lastRunAt = 0;
  let running = false;
  let timer = null;

  async function probe() {
    if (!bin || running) return false;
    running = true;
    lastRunAt = now();
    try {
      mkdirSync(workDir, { recursive: true, mode: 0o700 });
      const report = parseUsageReport(await run(bin, workDir));
      if (!report) throw new Error('resposta do /usage sem rate_limits (plano sem limites ou login de API)');
      failures = 0;
      onReport(report);
      return true;
    } catch (error) {
      failures += 1;
      onError('uso pelo /usage', error);
      return false;
    } finally {
      running = false;
    }
  }

  /** Quanto esperar até a próxima consulta, contando falhas seguidas. */
  function nextDelay() {
    const base = isActive() ? ACTIVE_EVERY_MS : IDLE_EVERY_MS;
    return failures ? Math.min(MAX_BACKOFF_MS, base * 2 ** failures) : base;
  }

  function schedule(delay) {
    timer = setTimer(async () => {
      await probe();
      schedule(nextDelay());
    }, delay);
    timer?.unref?.();
  }

  return {
    available: Boolean(bin),
    bin,
    probe,
    nextDelay,
    start(firstDelay = 5_000) {
      if (bin) schedule(firstDelay);
    },
    /** Uma sessão começou a rodar e a última consulta está velha: consulta logo. */
    nudge() {
      if (bin && !running && now() - lastRunAt >= ACTIVE_EVERY_MS && !failures) probe();
    },
  };
}
