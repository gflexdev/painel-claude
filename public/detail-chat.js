// "Mensagem para esta sessão" no pé do detalhe (Ajustes → "Mandar mensagens às sessões") e a conversa pelo
// painel: as últimas mensagens mandadas daqui, com a situação de cada uma (entregue, na fila, descartada). A caixa
// "vigiar" liga a vigia junto com a mensagem; some quando a sessão já é vigiada.
import { el } from './format.js';

const $ = (id) => document.getElementById(id);
const NOTES = Object.freeze({
  ready: 'Chega na hora, mesmo com ela parada, como mensagem vinda do painel.',
  busy: 'A sessão está no meio de um turno: a mensagem entra na fila e é entregue quando o turno acabar.',
  none: 'Esta sessão ainda não está ouvindo o painel. Ela passa a ouvir no fim do próximo turno (ou ao ser aberta de novo).',
  remote: 'Sessões de outra máquina não recebem mensagens do painel.',
});
const SENT = Object.freeze({
  delivered: '✓ Entregue. A sessão foi acordada com a sua mensagem.',
  queued: '✓ Na fila. Entrega quando a sessão terminar o turno.',
});
const STATE_WORD = Object.freeze({ delivered: 'entregue', pending: 'na fila', dropped: 'não entregue' });

const timeOf = (at) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** @returns {{ fill: (data: object, enabled: boolean) => void, reset: () => void }} */
export function createChatBox({ api, sessionId, onSent = () => {} }) {
  const section = $('detail-chat');
  const form = $('chat-form');
  const input = $('chat-text');
  const button = $('chat-send');
  const note = $('chat-note');
  const historyBox = $('chat-history');
  const historyList = $('chat-list');
  const watchRow = $('chat-watch-row');
  const watch = $('chat-watch');
  let sending = false;
  let state = 'none';
  let feedback = '';

  const sync = () => {
    const usable = state === 'ready' || state === 'busy';
    input.disabled = !usable || sending;
    watch.disabled = !usable || sending;
    button.disabled = !usable || sending || !input.value.trim();
    note.textContent = feedback || NOTES[state];
  };

  function fillHistory(history) {
    historyBox.hidden = !history?.length;
    historyList.replaceChildren(...(history ?? []).map((message) => {
      const item = el('li', 'chat-item');
      item.dataset.state = message.status;
      item.append(
        el('p', 'chat-bubble', message.text),
        el('span', 'chat-meta', `enviada pelo painel · ${timeOf(message.at)} · ${STATE_WORD[message.status] ?? message.status}`),
      );
      return item;
    }));
  }

  /** `data`: item do snapshot (sem histórico) ou detalhe (com `chatHistory`). */
  function fill(data, enabled) {
    section.hidden = !enabled;
    if (!enabled) {
      historyBox.hidden = true;
      return;
    }
    state = data.machine ? 'remote' : data.chat ?? 'none';
    // `watched` só vem quando verdadeiro.
    watchRow.hidden = data.watched === true;
    if (Array.isArray(data.chatHistory)) fillHistory(data.chatHistory);
    sync();
  }

  function reset() {
    input.value = '';
    watch.checked = false;
    feedback = '';
    state = 'none';
    fillHistory([]);
    sync();
  }

  async function send() {
    const id = sessionId();
    const text = input.value.trim();
    if (!id || !text || sending) return;
    sending = true;
    feedback = 'enviando…';
    sync();
    try {
      const vigiar = watch.checked;
      const { status, watched } = await api.post(`/api/sessions/${encodeURIComponent(id)}/message`, { text, ...(vigiar && { vigiar }) });
      if (sessionId() === id) {
        input.value = '';
        watch.checked = false;
        feedback = `${SENT[status] ?? '✓ Enviada.'}${vigiar && watched ? ' Vigiada: chega um Aviso quando ela terminar.' : ''}`;
        onSent();
      }
    } catch (error) {
      feedback = `Não consegui enviar: ${error.message}.`;
    }
    sending = false;
    sync();
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); send(); });
  input.addEventListener('input', () => { feedback = ''; sync(); });
  // Enter manda; Shift+Enter quebra a linha.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  });

  return { fill, reset };
}
