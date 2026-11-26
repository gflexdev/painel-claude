// Trabalho em segundo plano: o turno acabou (Stop), mas a sessão ainda espera um comando longo, um subagente ou
// um workflow que vai acordá-la de novo. Ela não terminou: continua "rodando". Tudo aqui é puro.
import { clip } from './tools.js';

const FINISHED_TASK = /complet|done|fail|stop|kill|cancel|error/i;
const TASK_ACTIVITY = Object.freeze({ shell: 'bash', subagent: 'delegate', workflow: 'delegate', teammate: 'delegate' });
const MAX_BG_SHELLS = 5;

/**
 * Stop com `background_tasks` (documentado em code.claude.com/docs/en/hooks, "Stop input"): a lista do próprio
 * Claude Code do que ainda está em andamento. Devolve o que o tile mostra; null = nada em andamento;
 * undefined = o evento não traz a lista (versão antiga ou registro de tarefas fora do ar).
 */
export function backgroundPatch(event) {
  if (event.hook_event_name !== 'Stop' || event.agent_id || !Array.isArray(event.background_tasks)) return undefined;
  const running = runningTasks(event);
  if (!running.length) return null;
  const [first] = running;
  const what = first.type === 'subagent'
    ? `o subagente ${first.agent_type || ''}`.trim()
    : clip(String(first.description || first.command || first.name || first.type || 'uma tarefa'), 60);
  return {
    status: 'working',
    activity: running.length === 1 ? TASK_ACTIVITY[first.type] ?? 'think' : 'think',
    detail: running.length === 1 ? `em segundo plano: ${what}` : `aguardando ${running.length} tarefas em segundo plano`,
    awaiting: true,
  };
}

/** Comando lançado em segundo plano neste turno (Bash com run_in_background): a lista nova, ou null se não for. */
export function launchedInBackground(previous, event) {
  const input = event.tool_input;
  if (event.hook_event_name !== 'PreToolUse' || event.agent_id || event.tool_name !== 'Bash' || input?.run_in_background !== true) {
    return null;
  }
  const label = clip(String(input.description || input.command || 'um comando'), 60);
  return [...(previous?.bgShells ?? []), label].slice(-MAX_BG_SHELLS);
}

/**
 * Reserva para quando o Stop não traz `background_tasks`: se o turno lançou um comando em segundo plano,
 * a sessão fica esperando por ele até o próximo evento.
 */
export function shellsPatch(previous, event) {
  const shells = previous?.bgShells ?? [];
  if (event.hook_event_name !== 'Stop' || event.agent_id || !shells.length) return null;
  return {
    status: 'working',
    activity: 'bash',
    detail: shells.length === 1 ? `em segundo plano: ${shells[0]}` : `aguardando ${shells.length} comandos em segundo plano`,
    awaiting: true,
  };
}

/** Tarefas do `background_tasks` de um Stop que ainda não acabaram. */
const runningTasks = (event) => event.background_tasks
  .filter((task) => task && typeof task === 'object' && !FINISHED_TASK.test(String(task.status ?? '')));

/**
 * O turno acabou e a sessão ficou rodando só por comandos em segundo plano (um servidor de dev, um build)?
 * Subagente, workflow ou colega entre as tarefas = não: a sessão vai acordar sozinha.
 * @param {object} event o evento de hook
 * @param {object | undefined} session a sessão já com o evento aplicado
 */
export function onlyShellsInBackground(event, session) {
  if (event?.hook_event_name !== 'Stop' || event.agent_id || session?.awaiting !== true) return false;
  if (Array.isArray(event.background_tasks)) {
    const running = runningTasks(event);
    return running.length > 0 && running.every((task) => task.type === 'shell');
  }
  // Sem a lista: shellsPatch (comandos do turno) põe 'bash'; awaitingPatch (subagentes ativos) põe 'delegate'.
  return session.activity === 'bash';
}

/** Comandos em segundo plano lançados desde o último Stop; a lista zera a cada Stop da sessão. */
export function nextShells(previous, event) {
  if (event.hook_event_name === 'Stop' && !event.agent_id) return [];
  return launchedInBackground(previous, event) ?? previous?.bgShells ?? [];
}
