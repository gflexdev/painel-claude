// Janela de Ajustes (botão ⚙): três chaves, todas desligadas por padrão. Só o próprio Mac muda; nos outros
// aparelhos a janela mostra como está, sem deixar mexer ("Para mudar, abra o painel no Mac.").
import { el } from './format.js';

const $ = (id) => document.getElementById(id);

export const SETTINGS = Object.freeze([
  { key: 'chat', title: 'Mandar mensagens às sessões', hint: 'Campo de mensagem no detalhe. Chega marcado como vindo do painel.' },
  { key: 'launch', title: 'Abrir sessões pelo painel', hint: 'Botão + no topo e "+ sessão filha" no detalhe.' },
  {
    key: 'closeRemove',
    title: 'Fechar e apagar sessões',
    hint: 'Só sessões em segundo plano (abertas pelo painel ou com claude --bg). Apagar remove também o worktree e pede um segundo toque.',
  },
]);

/** @param {{ api: object }} options */
export function createSettingsDialog({ api }) {
  const dialog = $('settings');
  const list = $('settings-list');
  const readonly = $('settings-readonly');
  const feedback = $('settings-feedback');
  let features = {};
  let canChange = false;
  let busy = false;

  function render() {
    list.replaceChildren(...SETTINGS.map(({ key, title, hint }) => {
      const row = el('label', 'setting');
      const text = el('span', 'setting-text');
      text.append(el('strong', '', title), el('small', '', hint));
      const input = el('input', 'setting-switch');
      input.type = 'checkbox';
      input.setAttribute('role', 'switch');
      input.checked = features[key] === true;
      input.disabled = !canChange || busy;
      input.addEventListener('change', () => change(key, input.checked));
      row.append(text, input);
      return row;
    }));
    readonly.hidden = canChange;
  }

  async function change(key, value) {
    busy = true;
    feedback.textContent = 'salvando…';
    render();
    try {
      ({ features } = await api.post('/api/settings', { [key]: value }));
      feedback.textContent = '✓ Salvo neste Mac.';
    } catch (error) {
      feedback.textContent = `Não salvou: ${error.message}`;
    }
    busy = false;
    render();
  }

  async function open(snapshotFeatures = {}) {
    features = snapshotFeatures;
    canChange = false;
    feedback.textContent = '';
    render();
    if (!dialog.open) dialog.showModal();
    try {
      ({ features, canChange } = await api.get('/api/settings'));
    } catch (error) {
      feedback.textContent = `Não consegui ler os Ajustes (${error.message}).`;
    }
    render();
  }

  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  return { open };
}
