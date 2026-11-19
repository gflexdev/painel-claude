// Formatação compartilhada pela grade e pelo detalhe.
export const STATUS_WORD = Object.freeze({
  working: 'rodando',
  waiting: 'esperando você',
  idle: 'parada',
  error: 'erro',
  ended: 'encerrada',
});

export const ACTIVITY_WORD = Object.freeze({
  read: 'lendo',
  write: 'editando',
  bash: 'rodando comando',
  web: 'na web',
  delegate: 'delegando',
  plan: 'planejando',
  ask: 'perguntando',
  mcp: 'usando conector',
  think: 'pensando',
  compact: 'compactando',
});

export function elapsed(since, now) {
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  if (seconds < 10) return 'agora';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} d`;
}

/** 84213 → "84k"; 1250000 → "1,3M". */
export function tokens(count) {
  if (!Number.isFinite(count)) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace('.', ',')}M`;
  return `${Math.round(count / 1000)}k`;
}

/** Ícone do robozinho: atividade enquanto trabalha/espera; bandeira quando terminou e você não viu. */
export function accessoryOf(session) {
  if (session.status === 'idle' && session.unseen) return 'done';
  if (session.status === 'working' || session.status === 'waiting') return session.activity ?? 'think';
  return null;
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SESSION_HASH = /^#sessao=([\w-]{1,80})(?:&|$)/;

/** "#sessao=<id>" (link do widget do Mac) → id; qualquer outra coisa → null. */
export function sessionFromHash(hash) {
  return SESSION_HASH.exec(hash ?? '')?.[1] ?? null;
}

/**
 * Onde a sessão roda, curto: o projeto e, se a pasta for outra (ex.: worktree), o nome dela.
 * "/Users/x/painel/.claude/worktrees/nifty-3866bb" no projeto "painel" → "painel · nifty-3866bb".
 */
export function placeOf({ cwd, project } = {}) {
  const folder = (cwd ?? '').replace(/\/+$/, '').split('/').pop() ?? '';
  if (!folder || folder === project) return project || folder;
  return project ? `${project} · ${folder}` : folder;
}
