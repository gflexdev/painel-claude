// Barra do topo (proposta 4): troca de modo (Quadros | Grade | Mapa), "⏱ N" para mostrar ou esconder as
// sessões de tarefas agendadas, "arquivadas N" com a lista para desarquivar e o "+" de nova sessão (só com o
// ajuste ligado). Modo e agendadas valem por aparelho.
import { STATUS_WORD, el } from './format.js';
import { readPref, writePref } from './prefs.js';

const VIEW_KEY = 'painel-claude-modo';
const SCHEDULED_KEY = 'painel-claude-mostrar-agendadas';
export const VIEWS = Object.freeze(['quadros', 'grade', 'mapa']);

const $ = (id) => document.getElementById(id);

/**
 * @param {{ api: object, onChange: () => void, openDetail: (id: string, session: object) => void, onLaunch: () => void }} options
 */
export function createTopbar({ api, onChange, openDetail, onLaunch }) {
  const switcher = $('view-switch');
  const scheduledButton = $('scheduled-button');
  const archivedButton = $('archived-button');
  const launchButton = $('launch-button');
  const archivedDialog = $('archived');
  const archivedList = $('archived-list');
  const stored = readPref(VIEW_KEY, 'quadros');
  let view = VIEWS.includes(stored) ? stored : 'quadros';
  let showScheduled = readPref(SCHEDULED_KEY, true) !== false;
  let latest = { sessions: [] };

  function syncSwitch() {
    switcher.querySelectorAll('button[data-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    document.body.dataset.view = view;
  }

  function renderArchived() {
    const archived = latest.sessions.filter((s) => s.archived);
    archivedList.replaceChildren(...archived.map((session) => {
      const item = el('li', 'archived-item');
      const open = el('button', 'archived-open');
      open.type = 'button';
      open.append(
        el('span', 'archived-name', session.name),
        el('span', 'archived-meta', [session.project, STATUS_WORD[session.status] ?? session.status].filter(Boolean).join(' · ')),
      );
      open.addEventListener('click', () => { archivedDialog.close(); openDetail(session.id, session); });
      const back = el('button', 'archived-back', 'desarquivar');
      back.type = 'button';
      back.addEventListener('click', async () => {
        back.disabled = true;
        try {
          await api.post(`/api/sessions/${encodeURIComponent(session.id)}/unarchive`);
        } catch (error) {
          back.disabled = false;
          back.textContent = `não deu (${error.message})`;
        }
      });
      item.append(open, back);
      return item;
    }));
    if (!archived.length) archivedList.append(el('li', 'muted', 'nenhuma sessão arquivada'));
  }

  switcher.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-view]');
    if (!button || button.dataset.view === view) return;
    view = button.dataset.view;
    writePref(VIEW_KEY, view);
    syncSwitch();
    onChange();
  });
  scheduledButton.addEventListener('click', () => {
    showScheduled = !showScheduled;
    writePref(SCHEDULED_KEY, showScheduled);
    onChange();
  });
  archivedButton.addEventListener('click', () => {
    renderArchived();
    if (!archivedDialog.open) archivedDialog.showModal();
  });
  archivedDialog.addEventListener('click', (event) => { if (event.target === archivedDialog) archivedDialog.close(); });
  launchButton.addEventListener('click', onLaunch);
  syncSwitch();

  return {
    view: () => view,
    showScheduled: () => showScheduled,
    /** Novo snapshot: contadores dos botões e o "+" conforme o ajuste. */
    update(snapshot) {
      latest = snapshot;
      const scheduled = snapshot.sessions.filter((s) => s.scheduled).length;
      scheduledButton.hidden = scheduled === 0;
      scheduledButton.textContent = `⏱ ${scheduled}`;
      scheduledButton.setAttribute('aria-pressed', String(showScheduled));
      scheduledButton.setAttribute('aria-label', `${scheduled} ${scheduled === 1 ? 'sessão' : 'sessões'} de tarefa agendada: ${showScheduled ? 'mostrando (toque para esconder)' : 'escondidas (toque para mostrar)'}`);
      scheduledButton.title = showScheduled ? 'Esconder as sessões de tarefas agendadas' : 'Mostrar as sessões de tarefas agendadas';
      const archived = snapshot.sessions.filter((s) => s.archived).length;
      archivedButton.hidden = archived === 0;
      // No celular a palavra encurta para "arq." (mobile.css esconde a longa).
      archivedButton.replaceChildren(el('span', 'long', 'arquivadas '), el('span', 'short', 'arq. '), String(archived));
      archivedButton.setAttribute('aria-label', `${archived} ${archived === 1 ? 'sessão arquivada' : 'sessões arquivadas'} no painel`);
      launchButton.hidden = snapshot.features?.launch !== true;
      if (archivedDialog.open) renderArchived();
    },
  };
}
