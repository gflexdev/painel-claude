import { open, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { clip, describeTool } from './tools.js';

const TAIL_BYTES = 768 * 1024;
const HEAD_BYTES = 96 * 1024;
const RECENT_TOOLS = 6;
/** Respostas longas são cortadas numa quebra de linha, para não partir o markdown no meio. */
const MAX_ANSWER = 4000;
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

/** Só lê transcripts do próprio Claude Code (o caminho vem de um evento de hook). */
export function isAllowedTranscript(path, root = PROJECTS_DIR) {
  if (typeof path !== 'string' || !path.endsWith('.jsonl')) return false;
  return resolve(path).startsWith(`${resolve(root)}/`);
}

async function readSlice(path, fromEnd, bytes) {
  const handle = await open(path, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(bytes, size);
    const position = fromEnd ? size - length : 0;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, position);
    return { text: buffer.toString('utf8'), truncated: length < size };
  } finally {
    await handle.close();
  }
}

/** Converte JSONL em objetos, descartando a linha cortada nas pontas e linhas inválidas. */
export function parseLines(text) {
  return text.split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function lastOf(entries, predicate) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (predicate(entries[i])) return entries[i];
  }
  return undefined;
}

/** "claude-opus-5-5" → "opus 5.5"; "claude-haiku-4-5-20251001" → "haiku 4.5". */
export function modelLabel(model) {
  if (typeof model !== 'string' || !model) return null;
  const match = model.match(/claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$|\[)/);
  return match ? `${match[1]} ${match[2]}${match[3] ? `.${match[3]}` : ''}` : model;
}

/** Tokens que estavam no contexto na última resposta (entrada + cache lido + cache criado + saída). */
function contextOf(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const total = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens']
    .reduce((sum, key) => sum + (Number.isFinite(usage[key]) ? usage[key] : 0), 0);
  return total > 0 ? total : null;
}

export function extractMeta(entries) {
  const title = lastOf(entries, (e) => e.type === 'custom-title' && e.customTitle)?.customTitle
    ?? lastOf(entries, (e) => e.type === 'agent-name' && e.agentName)?.agentName
    ?? null;
  const entrypoint = lastOf(entries, (e) => typeof e.entrypoint === 'string')?.entrypoint ?? null;
  const answer = lastOf(entries, (e) => e.type === 'assistant' && !e.isSidechain && e.message?.usage);
  return {
    title,
    entrypoint: entrypoint === 'claude-desktop' ? 'app' : entrypoint,
    model: modelLabel(answer?.message?.model),
    contextTokens: contextOf(answer?.message?.usage),
  };
}

const HUMAN_TURN_MARK = Buffer.from('"turnOrigin":"human"');

/** Pedidos seus na conversa inteira (conta a marca no arquivo todo, sem interpretar o JSON). */
export function countHumanTurns(buffer) {
  let count = 0;
  for (let at = buffer.indexOf(HUMAN_TURN_MARK); at !== -1; at = buffer.indexOf(HUMAN_TURN_MARK, at + 1)) count += 1;
  return count;
}

function blocksOf(entry) {
  const content = entry?.message?.content;
  return Array.isArray(content) ? content : [];
}

function humanText(entry) {
  if (entry.type !== 'user' || entry.isSidechain) return '';
  const content = entry.message?.content;
  const text = typeof content === 'string'
    ? content
    : blocksOf(entry).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return text && !text.trimStart().startsWith('<') ? text : '';
}

function lastAnswer(entries) {
  const last = lastOf(entries, (e) => e.type === 'assistant' && !e.isSidechain
    && blocksOf(e).some((b) => b.type === 'text' && b.text?.trim()));
  if (!last) return '';
  const messageId = last.message?.id;
  const text = entries
    .filter((e) => e.type === 'assistant' && e.message?.id === messageId)
    .flatMap((e) => blocksOf(e).filter((b) => b.type === 'text').map((b) => b.text))
    .join('\n\n')
    .trim();
  if (text.length <= MAX_ANSWER) return text;
  const cut = text.lastIndexOf('\n', MAX_ANSWER);
  return `${text.slice(0, cut > MAX_ANSWER / 2 ? cut : MAX_ANSWER).trimEnd()}\n\n…`;
}

export function extractSummary(entries) {
  const lastPrompt = lastOf(entries, (e) => e.type === 'last-prompt' && e.lastPrompt)?.lastPrompt
    ?? humanText(lastOf(entries, (e) => humanText(e) !== '') ?? {});
  const recentTools = entries
    .filter((e) => e.type === 'assistant' && !e.isSidechain)
    .flatMap((e) => blocksOf(e).filter((b) => b.type === 'tool_use'))
    .slice(-RECENT_TOOLS)
    .map((b) => describeTool(b.name, b.input));
  return {
    lastPrompt: clip(lastPrompt, 600),
    answer: lastAnswer(entries),
    recentTools,
  };
}

/**
 * Título, origem, modelo e contexto vêm do fim do arquivo (se o título não estiver lá, do começo).
 * Com `withTurns`, lê o arquivo inteiro para contar os pedidos.
 */
export async function readMeta(path, { withTurns = false } = {}) {
  if (!isAllowedTranscript(path)) return {};
  const tail = await readSlice(path, true, TAIL_BYTES);
  const meta = extractMeta(parseLines(tail.text));
  const turns = withTurns ? countHumanTurns(await readFile(path)) || null : undefined;
  if (meta.title || !tail.truncated) return { ...meta, turns };
  const head = await readSlice(path, false, HEAD_BYTES);
  const fromHead = extractMeta(parseLines(head.text));
  return { ...meta, title: fromHead.title, entrypoint: meta.entrypoint ?? fromHead.entrypoint, turns };
}

export async function readSummary(path) {
  if (!isAllowedTranscript(path)) return null;
  await stat(path);
  const tail = await readSlice(path, true, TAIL_BYTES);
  return extractSummary(parseLines(tail.text));
}
