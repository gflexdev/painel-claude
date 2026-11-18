import { basename } from 'node:path';

const MAX_LABEL = 70;

export function clip(text, max = MAX_LABEL) {
  if (typeof text !== 'string') return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return clip(url, 40);
  }
}

const ACTIVITY_BY_TOOL = Object.freeze({
  Read: 'read', Grep: 'read', Glob: 'read', LS: 'read', NotebookRead: 'read',
  Edit: 'write', Write: 'write', MultiEdit: 'write', NotebookEdit: 'write',
  Bash: 'bash', BashOutput: 'bash', KillShell: 'bash', Monitor: 'bash',
  WebFetch: 'web', WebSearch: 'web',
  Task: 'delegate', Agent: 'delegate', SendMessage: 'delegate', Workflow: 'delegate',
  TodoWrite: 'plan', EnterPlanMode: 'plan', ExitPlanMode: 'plan',
  AskUserQuestion: 'ask',
});
const WEB_MCP = /browser|chrome|navigate|playwright|fetch|search/i;

/**
 * O que o agente está fazendo, numa palavra que vira pose do robozinho:
 * read | write | bash | web | delegate | plan | ask | mcp | think | compact.
 */
export function activityOf(toolName) {
  if (!toolName) return 'think';
  if (ACTIVITY_BY_TOOL[toolName]) return ACTIVITY_BY_TOOL[toolName];
  if (toolName.startsWith('mcp__')) return WEB_MCP.test(toolName) ? 'web' : 'mcp';
  return 'think';
}

/** Rótulo curto de uma chamada de ferramenta, para caber num tile. */
export function describeTool(name, input) {
  const args = input && typeof input === 'object' ? input : {};
  if (!name) return '';
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    return clip(`${parts.at(-1)} (MCP)`);
  }
  switch (name) {
    case 'Bash':
      return clip(`Bash: ${args.description || args.command || ''}`);
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return args.file_path ? `${name} ${basename(args.file_path)}` : name;
    case 'Grep':
    case 'Glob':
      return clip(`${name} ${args.pattern ?? ''}`);
    case 'WebFetch':
      return `WebFetch ${hostOf(args.url)}`;
    case 'WebSearch':
      return clip(`WebSearch ${args.query ?? ''}`);
    case 'Task':
    case 'Agent':
      return clip(`Agente: ${args.description ?? ''}`);
    default:
      return name;
  }
}
