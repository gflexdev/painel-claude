import { randomUUID } from 'node:crypto';
import { describeTool } from './tools.js';
import { buildAnswers, questionsOf } from './questions.js';

const MAX_PREVIEW = 600;
const MAX_PLAN = 2500;
const DENY_MESSAGE = 'Negado pelo painel de bancada.';

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** O que a tela mostra para você decidir: o comando inteiro, o plano, o arquivo ou o JSON da chamada. */
export function previewInput(toolName, input) {
  const args = input && typeof input === 'object' ? input : {};
  if (toolName === 'Bash') return truncate(String(args.command ?? '').trim(), MAX_PREVIEW);
  if (toolName === 'ExitPlanMode') return truncate(String(args.plan ?? '').trim(), MAX_PLAN);
  if (toolName === 'AskUserQuestion') return '';
  if (typeof args.file_path === 'string') return args.file_path;
  if (typeof args.url === 'string') return args.url;
  try {
    return truncate(JSON.stringify(args), MAX_PREVIEW);
  } catch {
    return '';
  }
}

/** Tipo de cartão na tela: pergunta com opções, plano para aprovar ou permissão comum. */
function kindOf(toolName) {
  if (toolName === 'AskUserQuestion') return 'question';
  if (toolName === 'ExitPlanMode') return 'plan';
  return 'permission';
}

/** Saída que o hook PermissionRequest devolve ao Claude Code. */
export function hookOutput(decision) {
  const body = decision.behavior === 'allow'
    ? { behavior: 'allow', ...(decision.updatedInput && { updatedInput: decision.updatedInput }) }
    : { behavior: 'deny', message: DENY_MESSAGE };
  return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: body } };
}

/** O que vai para a tela (sem o tool_input original, que fica só no servidor). */
const publicView = ({ id, kind, tool, toolName, preview, questions, createdAt }) => (
  { id, kind, tool, toolName, preview, questions, createdAt }
);

/**
 * Pedidos de permissão (e perguntas) segurados à espera de um toque na tela.
 * O Claude Code mostra o diálogo no Mac ao mesmo tempo: quem responder primeiro vale.
 */
export function createPermissions({ timeoutMs, onChange }) {
  const pending = new Map();

  const settle = (id, decision) => {
    const entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(decision);
    onChange();
    return true;
  };

  return {
    /** Resolve com { behavior, updatedInput? } ou null (tempo esgotado ou respondido no Mac). */
    wait(event, signal) {
      const id = randomUUID();
      const toolName = event.tool_name ?? '';
      const kind = kindOf(toolName);
      return new Promise((resolve) => {
        const timer = setTimeout(() => settle(id, null), timeoutMs);
        pending.set(id, {
          id,
          kind,
          sessionId: event.session_id,
          tool: describeTool(toolName, event.tool_input),
          toolName,
          toolInput: event.tool_input ?? {},
          preview: previewInput(toolName, event.tool_input),
          questions: kind === 'question' ? questionsOf(event.tool_input) : undefined,
          createdAt: Date.now(),
          timer,
          resolve,
        });
        signal?.addEventListener('abort', () => settle(id, null), { once: true });
        onChange();
      });
    },
    /**
     * behavior 'allow' | 'deny'. Para pergunta, 'allow' exige `picks` ({ pergunta: opção | [opções] | texto }).
     * Devolve false se o pedido já não existe; lança erro se a resposta for inválida.
     */
    decide(id, behavior, picks) {
      if (behavior !== 'allow' && behavior !== 'deny') throw new Error('decisão inválida');
      const entry = pending.get(id);
      if (!entry) return false;
      if (behavior === 'deny' || entry.kind !== 'question') return settle(id, { behavior });
      const answers = buildAnswers(entry.questions, picks);
      return settle(id, { behavior, updatedInput: { ...entry.toolInput, answers } });
    },
    forSession(sessionId) {
      return [...pending.values()].filter((p) => p.sessionId === sessionId).map(publicView);
    },
    size: () => pending.size,
  };
}
