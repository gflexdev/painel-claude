// Abre, fecha e apaga sessões pelo comando oficial do Claude Code (sessões em segundo plano):
//   claude --bg [--name <nome>] "<pedido>"   cria na pasta dada e imprime "backgrounded · <id curto> · <nome>"
//   claude stop <id>                          para (a conversa fica guardada)
//   claude rm <id>                            apaga a sessão e o worktree dela
// Sempre por execFile, sem shell. Nunca manda sinal a processo nenhum: sessões interativas (app, terminal) não
// são fechadas pelo painel, só as de segundo plano, pelo `claude stop`.
import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute } from 'node:path';

export const MAX_PROMPT = 4000;
export const MAX_NAME = 60;
const RUN_TIMEOUT_MS = 45_000;
const JOB_ID = /^[0-9a-z]{4,40}$/i;

/** "backgrounded · 7c5dcf5d · nome" → "7c5dcf5d". null se a saída não trouxer o id. */
export function parseBackgrounded(output) {
  return /backgrounded\s+·\s+([0-9a-z]{4,40})\b/i.exec(String(output ?? ''))?.[1] ?? null;
}

/** Pedido inicial e nome vindos da tela, já validados; lança erro com a mensagem para a pessoa. */
export function cleanLaunch({ prompt, name }) {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text) throw new Error('escreva o que a sessão deve fazer');
  if (text.length > MAX_PROMPT) throw new Error(`o pedido passa de ${MAX_PROMPT} caracteres`);
  // Um pedido que começa com "-" seria lido pelo claude como opção de linha de comando.
  const safePrompt = text.startsWith('-') ? ` ${text}` : text;
  const label = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  return { prompt: safePrompt, name: label.replace(/^-+/, '').trim() };
}

/** Argumentos de `claude --bg`: o nome vai depois de --name e o pedido por último, já protegido. */
export function launchArgs({ prompt, name }) {
  const clean = cleanLaunch({ prompt, name });
  return ['--bg', ...(clean.name ? ['--name', clean.name] : []), clean.prompt];
}

const isDir = (path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** Roda o claude sem shell e com o stdin fechado. O PATH ganha a pasta do node e a do claude (o launchd não as tem). */
function runClaude(bin, args, { cwd, timeout }) {
  const path = [dirname(process.execPath), dirname(bin), process.env.PATH ?? '/usr/bin:/bin'].join(delimiter);
  return new Promise((resolve, reject) => {
    const child = execFile(bin, args, { cwd, timeout, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PATH: path } }, (error, stdout, stderr) => {
      if (!error) return resolve({ stdout, stderr });
      const detail = String(stderr || stdout || error.message).trim().split('\n').slice(-3).join(' ').slice(0, 300);
      return reject(new Error(error.killed ? 'o claude demorou demais para responder' : detail));
    });
    child.stdin?.end();
  });
}

/**
 * @param {{ bin: string|null, run?: Function }} options
 * `run(bin, args, { cwd, timeout })` devolve { stdout, stderr } ou rejeita; trocado nos testes.
 */
export function createControl({ bin, run = runClaude }) {
  const needBin = () => {
    if (!bin) throw new Error('não achei o comando claude neste Mac; rode o instalador de novo num terminal em que `claude` funcione');
    return bin;
  };
  const needJob = (jobId) => {
    if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) throw new Error('id de sessão em segundo plano inválido');
    return jobId;
  };

  return {
    available: () => Boolean(bin),
    /** Abre uma sessão em segundo plano na pasta dada. Devolve { jobId }. */
    async launch({ cwd, prompt, name }) {
      if (typeof cwd !== 'string' || !isAbsolute(cwd) || !isDir(cwd)) throw new Error('a pasta do projeto não existe mais');
      const args = launchArgs({ prompt, name });
      const { stdout, stderr } = await run(needBin(), args, { cwd, timeout: RUN_TIMEOUT_MS });
      const jobId = parseBackgrounded(stdout) ?? parseBackgrounded(stderr);
      if (!jobId) throw new Error(`o claude não confirmou a sessão: ${String(stderr || stdout).trim().slice(0, 300) || 'sem saída'}`);
      return { jobId };
    },
    /** Para uma sessão de segundo plano pelo comando oficial. */
    stopJob: (jobId) => run(needBin(), ['stop', needJob(jobId)], { timeout: RUN_TIMEOUT_MS }),
    /** Apaga uma sessão de segundo plano e o worktree dela. */
    removeJob: (jobId) => run(needBin(), ['rm', needJob(jobId)], { timeout: RUN_TIMEOUT_MS }),
  };
}
