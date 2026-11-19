// Subagentes de uma sessão (ferramenta Agent). Os hooks mandam SubagentStart e SubagentStop com agent_id e
// agent_type, e cada ferramenta usada lá dentro vem com o mesmo agent_id. Tudo aqui é puro.
import { activityOf, clip, describeTool } from './tools.js';

const MAX_KEPT = 8;
const MAX_PENDING = 8;
const AGENT_TOOLS = new Set(['Agent', 'Task']);
/** Subagente sem nenhum evento há esse tempo provavelmente morreu sem avisar; a sessão não espera mais por ele. */
const AWAIT_MS = 15 * 60_000;

/**
 * Subagentes pelos quais a sessão ainda espera quando o turno dela acaba (rodando em segundo plano):
 * os que não terminaram e deram sinal há pouco.
 */
export const awaitedSubagents = (session, now) => activeSubagents(session)
  .filter((a) => now - (a.lastEventAt ?? a.startedAt) < AWAIT_MS);

/** Ainda rodando ou esperando, do mais recente para o mais antigo. */
export const activeSubagents = (session) => recentSubagents(session).filter((a) => a.status !== 'done');

/** Todos os guardados (ativos e terminados), do mais recente para o mais antigo. */
export const recentSubagents = (session) => [...(session?.subagents ?? [])].sort((a, b) => b.startedAt - a.startedAt);

/** A ferramenta Agent foi chamada: guarda a descrição para dar ao subagente quando ele começar. */
function rememberRequest(session, event) {
  const input = event.tool_input ?? {};
  const request = { type: String(input.subagent_type || 'general-purpose'), description: clip(input.description ?? '', 80) };
  return { pendingAgents: [...(session.pendingAgents ?? []), request].slice(-MAX_PENDING) };
}

function startAgent(session, event, now) {
  const type = String(event.agent_type || 'general-purpose');
  const pending = session.pendingAgents ?? [];
  const index = pending.findIndex((p) => p.type === type);
  const request = index >= 0 ? pending[index] : null;
  const agent = {
    id: event.agent_id, type, description: request?.description ?? '',
    status: 'working', detail: 'começando', activity: 'think', startedAt: now, lastEventAt: now, endedAt: null,
  };
  const others = (session.subagents ?? []).filter((a) => a.id !== agent.id);
  const kept = [agent, ...recentSubagents({ subagents: others })].slice(0, MAX_KEPT);
  return {
    subagents: kept,
    pendingAgents: index >= 0 ? pending.filter((_, i) => i !== index) : pending,
  };
}

function updateAgent(session, agentId, change, now) {
  const list = session.subagents ?? [];
  if (!list.some((a) => a.id === agentId)) return {};
  return { subagents: list.map((a) => (a.id === agentId ? { ...a, ...change, lastEventAt: now } : a)) };
}

/** Fecha os subagentes ainda abertos, menos os de `keep` (ids). */
const closeAll = (session, now, keep = new Set()) => ({
  subagents: (session.subagents ?? [])
    .map((a) => (a.status === 'done' || keep.has(a.id) ? a : { ...a, status: 'done', endedAt: now })),
  pendingAgents: [],
});

/** Mudança nos campos `subagents`/`pendingAgents` da sessão por causa de um evento; {} = nada muda. */
export function subagentPatch(session, event, now) {
  const current = session ?? {};
  const agentId = event.agent_id;
  switch (event.hook_event_name) {
    case 'SubagentStart':
      return agentId ? startAgent(current, event, now) : {};
    case 'SubagentStop':
      return agentId ? updateAgent(current, agentId, { status: 'done', activity: null, detail: 'terminou', endedAt: now }, now) : {};
    case 'PreToolUse':
      if (agentId) {
        return updateAgent(current, agentId, {
          status: 'working', detail: describeTool(event.tool_name, event.tool_input), activity: activityOf(event.tool_name),
        }, now);
      }
      return AGENT_TOOLS.has(event.tool_name) ? rememberRequest(current, event) : {};
    case 'PostToolUse':
      return agentId ? updateAgent(current, agentId, { status: 'working', detail: 'pensando', activity: 'think' }, now) : {};
    case 'PermissionRequest':
      return agentId
        ? updateAgent(current, agentId, { status: 'waiting', detail: `permissão: ${describeTool(event.tool_name, event.tool_input)}` }, now)
        : {};
    case 'Stop':
      // O turno acabou, mas subagentes em segundo plano continuam: esses ficam abertos.
      if (agentId) return {};
      return closeAll(current, now, new Set(awaitedSubagents(current, now).map((a) => a.id)));
    case 'StopFailure':
    case 'SessionEnd':
      return agentId ? {} : closeAll(current, now);
    default:
      return {};
  }
}

/** O que a sessão mostra quando o evento veio de dentro de um subagente. null = não é de subagente. */
export function parentPatchFromAgent(session, event) {
  if (!event.agent_id) return null;
  const type = event.agent_type || session?.subagents?.find((a) => a.id === event.agent_id)?.type || 'subagente';
  switch (event.hook_event_name) {
    case 'PreToolUse':
      return { status: 'working', activity: 'delegate', detail: `${type}: ${describeTool(event.tool_name, event.tool_input)}` };
    case 'PostToolUse':
      return { status: 'working', activity: 'delegate', detail: `${type}: pensando` };
    case 'PermissionRequest':
      return { status: 'waiting', activity: 'delegate', detail: `${type} pede permissão: ${describeTool(event.tool_name, event.tool_input)}` };
    case 'SubagentStart':
      return { status: 'working', activity: 'delegate', detail: `delegando para ${type}` };
    case 'SubagentStop': {
      // Se ainda há outro subagente trabalhando, a sessão continua delegando para ele.
      const others = activeSubagents(session).filter((a) => a.id !== event.agent_id);
      return others.length
        ? { activity: 'delegate', detail: `delegando para ${others[0].type}` }
        : { status: 'working', activity: 'think', detail: 'pensando' };
    }
    default:
      return {};
  }
}

/**
 * O turno da sessão acabou com subagentes ainda rodando em segundo plano: ela não terminou, está esperando
 * por eles (o Claude Code a acorda quando voltam). null = não espera ninguém.
 */
export function awaitingPatch(session, event, now) {
  if (event.hook_event_name !== 'Stop' || event.agent_id) return null;
  const awaited = awaitedSubagents(session, now);
  if (!awaited.length) return null;
  const who = awaited.length === 1 ? `o subagente ${awaited[0].type}` : `${awaited.length} subagentes`;
  return { status: 'working', activity: 'delegate', detail: `aguardando ${who}`, awaiting: true };
}

/** Versão enxuta para as telas. */
export const subagentView = ({ id, type, description, status, detail, activity }) => ({
  id, type, description, status, detail, activity: activity ?? null,
});
