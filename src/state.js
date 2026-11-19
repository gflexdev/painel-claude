import { basename } from 'node:path';
import { activityOf, clip, describeTool } from './tools.js';
import { activeSubagents, awaitingPatch, parentPatchFromAgent, subagentPatch, subagentView } from './subagents.js';
import { backgroundPatch, nextShells, shellsPatch } from './background.js';

const MAX_SUBAGENTS_IN_VIEW = 4;

export const STATUS = Object.freeze({
  WORKING: 'working',
  WAITING: 'waiting',
  IDLE: 'idle',
  ERROR: 'error',
  ENDED: 'ended',
});

const ENDED_TTL_MS = 10 * 60_000;
const FORGET_AFTER_MS = 12 * 60 * 60_000;
const STALE_WORKING_MS = 15 * 60_000;

/** Ferramentas que, ao serem chamadas, significam "o Claude está esperando você". */
const WAITING_TOOLS = Object.freeze({
  AskUserQuestion: 'pergunta para você',
  ExitPlanMode: 'plano para aprovar',
});

/** Ordem na grade: quem precisa de você primeiro; "terminou e você não viu" vem antes de quem está rodando. */
function rankOf(session) {
  if (session.status === STATUS.WAITING) return 0;
  if (session.status === STATUS.ERROR) return 1;
  if (session.status === STATUS.IDLE && session.unseen) return 2;
  if (session.status === STATUS.WORKING) return 3;
  if (session.status === STATUS.IDLE) return 4;
  return 5;
}

/** "Claude needs your permission to use Bash" → "permissão: Bash"; o resto passa como veio. */
function translateNotice(message) {
  const match = message.match(/needs your permission to use (.+)$/i);
  if (!match) return message;
  const tool = match[1].trim();
  return WAITING_TOOLS[tool] ?? `permissão: ${tool}`;
}

function notificationPatch(previous, event) {
  const type = event.notification_type;
  const message = clip(event.message ?? '', 90);
  const asksYou = type === 'permission_prompt' || type === 'elicitation_dialog'
    || (!type && /permission|permiss/i.test(message));
  if (asksYou) {
    // O hook de pedido já descreveu melhor (ex.: "pergunta para você"); o aviso não sobrescreve.
    if (previous?.status === STATUS.WAITING) return {};
    return { status: STATUS.WAITING, detail: translateNotice(message) || 'esperando você' };
  }
  if (type === 'idle_prompt') return { status: STATUS.IDLE, detail: 'esperando novo pedido' };
  return {};
}

/** Pasta do repositório de uma sessão: a própria pasta, ou a de fora quando é um worktree do Claude. */
export function projectRoot(cwd) {
  if (typeof cwd !== 'string' || !cwd) return '';
  return cwd.replace(/\/+$/, '').replace(/\/\.claude(?:\/|-)worktrees\/[^/]+$/, '');
}

/** Pasta de trabalho → projeto. Worktree do Claude (`repo/.claude/worktrees/x`) conta como o repositório. */
export function projectOf(cwd) {
  const repo = projectRoot(cwd);
  return repo ? basename(repo) : '';
}

const NAME_MAX = 60;

/** Nome no tile: o título do Claude; sem título, a primeira linha do primeiro pedido; senão o projeto. */
export function sessionName(session) {
  if (session.title) return session.title;
  // Sessões gravadas antes de existir firstPrompt usam o último pedido até chegar um novo.
  const line = String(session.firstPrompt ?? session.lastPrompt ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const prompt = line.startsWith('<') ? '' : line.replace(/^\//, '');
  if (prompt) return prompt.length > NAME_MAX ? `${prompt.slice(0, NAME_MAX - 1)}…` : prompt;
  // Nome que o Claude Code mostra em `claude agents` (sessões descobertas antes do primeiro hook).
  if (session.agentName) return session.agentName;
  return projectOf(session.cwd) || session.project || session.id.slice(0, 8);
}

/** Traduz um evento de hook na mudança de estado da sessão. null = evento ignorado. */
export function transition(previous, event) {
  const tool = () => describeTool(event.tool_name, event.tool_input);
  switch (event.hook_event_name) {
    case 'SessionStart':
      return previous && previous.status !== STATUS.ENDED
        ? {}
        : { status: STATUS.IDLE, detail: 'sessão aberta' };
    case 'UserPromptSubmit':
      return {
        status: STATUS.WORKING, detail: 'pensando', activity: 'think', unseen: false, lastPrompt: clip(event.prompt, 280),
        ...(!previous?.firstPrompt && typeof event.prompt === 'string' && { firstPrompt: event.prompt.slice(0, 400) }),
      };
    case 'PreToolUse': {
      const waiting = WAITING_TOOLS[event.tool_name];
      const activity = activityOf(event.tool_name);
      return waiting
        ? { status: STATUS.WAITING, detail: waiting, activity }
        : { status: STATUS.WORKING, detail: tool(), activity };
    }
    case 'PostToolUse':
      return { status: STATUS.WORKING, detail: 'pensando', activity: 'think' };
    case 'PreCompact':
      return { status: STATUS.WORKING, detail: 'compactando a conversa', activity: 'compact' };
    case 'PermissionRequest':
      return {
        status: STATUS.WAITING,
        detail: WAITING_TOOLS[event.tool_name] ?? `permissão: ${tool()}`,
        activity: activityOf(event.tool_name),
      };
    case 'Notification':
      return notificationPatch(previous, event);
    case 'Stop':
      return { status: STATUS.IDLE, detail: 'terminou', activity: null, unseen: true };
    case 'StopFailure':
      return {
        status: STATUS.ERROR, detail: clip(event.error ?? event.message ?? 'parou com erro', 90), activity: null, unseen: true,
      };
    case 'SessionEnd':
      return { status: STATUS.ENDED, detail: 'encerrada' };
    default:
      return null;
  }
}

/** Máquina dona da sessão: null = este Mac; senão o nome da máquina remota (ex.: "vps-dev"). */
export const machineOf = (session) => session?.machine ?? null;

/**
 * Aplica um evento de hook ao mapa de sessões e devolve um mapa novo (não altera o anterior).
 * `machine` diz de onde veio; uma máquina não altera sessão de outra.
 */
export function applyEvent(sessions, event, now, machine = null) {
  const id = event?.session_id;
  if (typeof id !== 'string' || !id) return sessions;
  const previous = sessions[id];
  if (previous && machineOf(previous) !== machine) return sessions;
  // Stop com trabalho em segundo plano: a lista do próprio Claude Code vale mais que a conta de subagentes;
  // sem a lista (`background_tasks` ausente), valem os subagentes ainda ativos e os comandos lançados no turno.
  const background = backgroundPatch(event);
  const waiting = background === undefined ? awaitingPatch(previous, event, now) ?? shellsPatch(previous, event) : background;
  const patch = parentPatchFromAgent(previous, event) ?? waiting ?? transition(previous, event);
  if (patch === null) return sessions;

  const base = previous ?? {
    id,
    title: null,
    entrypoint: null,
    status: STATUS.IDLE,
    detail: '',
    lastPrompt: '',
    startedAt: now,
    statusSince: now,
  };
  const status = patch.status ?? base.status;
  const cwd = typeof event.cwd === 'string' ? event.cwd : base.cwd;
  const next = {
    ...base,
    ...patch,
    ...subagentPatch(base, event, now),
    cwd,
    project: cwd ? projectOf(cwd) : base.project,
    // O transcript de outra máquina fica lá; o resumo chega por /remote/transcript.
    transcriptPath: machine ? null : event.transcript_path ?? base.transcriptPath,
    ...(machine && { machine }),
    // Chegou um hook: a sessão descoberta pelo `claude agents` passa a ser guiada só pelos eventos.
    ...(previous?.adopted && { adopted: false }),
    // "Esperando trabalho em segundo plano" vale só até o próximo evento.
    awaiting: patch.awaiting === true,
    ...(event.hook_event_name === 'UserPromptSubmit' && !event.agent_id && { lastPromptAt: now }),
    bgShells: nextShells(previous, event),
    status,
    statusSince: status === base.status && previous ? base.statusSince : now,
    lastEventAt: now,
  };
  return { ...sessions, [id]: next };
}

const META_FIELDS = Object.freeze(['title', 'entrypoint', 'model', 'contextTokens', 'turns']);

/** Junta o que foi lido do transcript (título, origem, modelo, contexto, turnos) sem mexer no estado. */
export function applyMeta(sessions, id, meta) {
  const current = sessions[id];
  if (!current) return sessions;
  const changes = Object.fromEntries(META_FIELDS
    .filter((key) => meta[key] !== undefined && meta[key] !== null && meta[key] !== current[key])
    .map((key) => [key, meta[key]]));
  return Object.keys(changes).length ? { ...sessions, [id]: { ...current, ...changes } } : sessions;
}

/** Guarda a última mensagem mandada pelo painel, para o detalhe mostrar o pedido mais recente. */
export function noteChat(sessions, id, text, now) {
  const current = sessions[id];
  if (!current) return sessions;
  return { ...sessions, [id]: { ...current, lastChat: { text: clip(text, 280), at: now } } };
}

/** Você abriu a sessão no painel: deixa de pedir revisão. */
export function markSeen(sessions, id) {
  const current = sessions[id];
  if (!current?.unseen) return sessions;
  return { ...sessions, [id]: { ...current, unseen: false } };
}

/** Remove sessões encerradas há um tempo e as esquecidas. */
export function prune(sessions, now) {
  const kept = Object.entries(sessions).filter(([, s]) => {
    if (s.status === STATUS.ENDED) return now - s.statusSince < ENDED_TTL_MS;
    return now - s.lastEventAt < FORGET_AFTER_MS;
  });
  return kept.length === Object.keys(sessions).length ? sessions : Object.fromEntries(kept);
}

/** Lista enxuta e ordenada para as telas (o mesmo JSON serve tablet e ESP32). */
export function toView(sessions, now) {
  return Object.values(sessions)
    .map((s) => ({
      id: s.id,
      name: sessionName(s),
      project: projectOf(s.cwd) || s.project || '',
      origin: s.entrypoint === 'cli' ? 'cli' : s.entrypoint ? 'app' : '',
      machine: s.machine ?? '',
      status: s.status,
      detail: s.detail,
      activity: s.activity ?? null,
      unseen: s.unseen === true,
      model: s.model ?? null,
      contextTokens: s.contextTokens ?? null,
      turns: s.turns ?? null,
      since: s.statusSince,
      lastEventAt: s.lastEventAt,
      // Quem espera um comando longo em segundo plano fica calado por muito tempo, e isso não é "sem sinal".
      stale: s.status === STATUS.WORKING && !s.adopted && !s.awaiting && now - s.lastEventAt > STALE_WORKING_MS,
      subagentCount: activeSubagents(s).length,
      subagents: activeSubagents(s).slice(0, MAX_SUBAGENTS_IN_VIEW).map(subagentView),
    }))
    .sort((a, b) => rankOf(a) - rankOf(b) || b.lastEventAt - a.lastEventAt);
}
