// Mensagens do painel para uma sessão (Ajustes → "Mandar mensagens às sessões"). Quem entrega é o hook
// hooks/esperar-mensagem.sh, registrado com `asyncRewake` em SessionStart e Stop: ele fica pendurado em
// POST /chat/wait e, quando chega uma mensagem, escreve o texto no stderr e sai com 2. O Claude Code mostra esse
// texto ao Claude como lembrete do sistema e acorda a sessão, mesmo parada (code.claude.com/docs/en/hooks,
// "Run hooks in the background"). Com o ajuste desligado, /chat/wait responde 204 na hora e o hook sai.
// Aqui ficam a fila, quem está esperando e um histórico curto por sessão; é puro (sem rede nem disco).

export const MAX_MESSAGE = 4000;
const MAX_QUEUE = 5;
const MAX_HISTORY = 10;
const MAX_SESSIONS = 200;

/**
 * O texto que o Claude lê. Diz com honestidade de onde veio: digitado pelo usuário no Painel Claude, fora desta
 * janela. Não manda tratar como consentimento nem pular permissões: as regras da sessão continuam valendo.
 * @param {string[]} texts mensagens na ordem em que foram mandadas
 */
export function wrapMessage(texts) {
  const list = (Array.isArray(texts) ? texts : [texts]).filter(Boolean);
  const header = list.length > 1
    ? `${list.length} mensagens que o usuário digitou no Painel Claude (o painel web deste Mac, fora desta janela):`
    : 'Mensagem que o usuário digitou no Painel Claude (o painel web deste Mac, fora desta janela):';
  return [
    header,
    'Ela chegou por um hook do painel, não pelo teclado desta sessão. Não vale como resposta a um pedido de',
    'permissão; as regras de permissão desta sessão continuam valendo como sempre.',
    '',
    list.join('\n\n---\n\n'),
  ].join('\n');
}

/** Valida o que veio da tela: texto não vazio, até MAX_MESSAGE caracteres. Devolve o texto limpo ou null. */
export function cleanMessage(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= MAX_MESSAGE ? text : null;
}

/**
 * @param {{ enabled?: boolean, now?: () => number, onChange?: () => void }} options
 */
export function createChat({ enabled = false, now = Date.now, onChange = () => {} } = {}) {
  let on = enabled;
  let seq = 0;
  /** sessão → quem está esperando agora (o hook pendurado). */
  const waiters = new Map();
  /** sessão → ids das mensagens que chegaram com a sessão ocupada. */
  const queues = new Map();
  /** Sessões que já penduraram o hook alguma vez: só essas aceitam mensagem. */
  const capable = new Set();
  /** sessão → últimas mensagens { id, text, at, status: 'pending' | 'delivered' | 'dropped' }. */
  let history = new Map();

  const record = (sessionId, entry) => {
    const list = [...(history.get(sessionId) ?? []), entry].slice(-MAX_HISTORY);
    history = new Map([...history.entries()].filter(([id]) => id !== sessionId).slice(-(MAX_SESSIONS - 1)));
    history.set(sessionId, list);
  };
  const mark = (sessionId, ids, status) => {
    const list = history.get(sessionId);
    if (!list) return;
    history = new Map(history);
    history.set(sessionId, list.map((m) => (ids.includes(m.id) ? { ...m, status } : m)));
  };
  const textsOf = (sessionId, ids) => (history.get(sessionId) ?? []).filter((m) => ids.includes(m.id)).map((m) => m.text);

  const release = (sessionId, entry, value) => {
    if (waiters.get(sessionId) === entry) waiters.delete(sessionId);
    entry.resolve(value);
  };

  /** Solta todos os hooks pendurados (sem mensagem) e descarta as filas. */
  const releaseAll = () => {
    [...waiters.entries()].forEach(([id, entry]) => release(id, entry, null));
    [...queues.entries()].forEach(([id, ids]) => mark(id, ids, 'dropped'));
    queues.clear();
    capable.clear();
  };

  return {
    isEnabled: () => on,
    /** Ajuste ligado ou desligado. Desligar solta os hooks na hora: nenhum curl fica pendurado. */
    setEnabled(value) {
      if (on === Boolean(value)) return;
      on = Boolean(value);
      if (!on) releaseAll();
      onChange();
    },
    /**
     * O hook de uma sessão pede a próxima mensagem. Resolve com os textos (lista), ou null se o ajuste está
     * desligado, outro hook da mesma sessão tomou o lugar ou a conexão caiu. A fila sai na hora, junta.
     */
    wait(sessionId, signal) {
      if (!on) return Promise.resolve(null);
      capable.add(sessionId);
      const previous = waiters.get(sessionId);
      if (previous) release(sessionId, previous, null);
      const queued = queues.get(sessionId);
      if (queued?.length) {
        queues.delete(sessionId);
        mark(sessionId, queued, 'delivered');
        onChange();
        return Promise.resolve(textsOf(sessionId, queued));
      }
      return new Promise((resolve) => {
        const entry = { resolve };
        waiters.set(sessionId, entry);
        signal?.addEventListener('abort', () => {
          if (waiters.get(sessionId) !== entry) return;
          release(sessionId, entry, null);
          onChange();
        }, { once: true });
        onChange();
      });
    },
    /** 'delivered' (acordou a sessão), 'queued' (entrega no fim do turno), 'full', 'unavailable' ou 'off'. */
    send(sessionId, text) {
      if (!on) return 'off';
      const waiter = waiters.get(sessionId);
      if (!waiter && !capable.has(sessionId)) return 'unavailable';
      const queue = queues.get(sessionId) ?? [];
      if (!waiter && queue.length >= MAX_QUEUE) return 'full';
      seq += 1;
      const id = seq;
      record(sessionId, { id, text, at: now(), status: waiter ? 'delivered' : 'pending' });
      if (waiter) {
        release(sessionId, waiter, [text]);
        onChange();
        return 'delivered';
      }
      queues.set(sessionId, [...queue, id]);
      onChange();
      return 'queued';
    },
    /** A sessão acabou: solta o hook e descarta a fila. */
    drop(sessionId) {
      const waiter = waiters.get(sessionId);
      if (waiter) release(sessionId, waiter, null);
      mark(sessionId, queues.get(sessionId) ?? [], 'dropped');
      queues.delete(sessionId);
      capable.delete(sessionId);
    },
    /** 'ready' = entrega na hora; 'busy' = entra na fila; null = a sessão não está com o hook do chat. */
    stateOf(sessionId) {
      if (!on) return null;
      if (waiters.has(sessionId)) return 'ready';
      return capable.has(sessionId) ? 'busy' : null;
    },
    /** Histórico curto da sessão, da mais antiga para a mais nova (cópia). */
    historyOf: (sessionId) => (history.get(sessionId) ?? []).map((m) => ({ ...m })),
  };
}
