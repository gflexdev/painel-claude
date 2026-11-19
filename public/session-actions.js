// Abrir sessão nova (janela "Nova sessão") e a linha de ações do detalhe: + sessão filha, arquivar no painel,
// fechar e apagar. Cada botão aparece só com o ajuste dele ligado; arquivar vale sempre.
import { el } from './format.js';

const $ = (id) => document.getElementById(id);
const CONFIRM_MS = 4000;

/**
 * Botão que pede um segundo toque em até 4 s antes de agir (fechar e apagar não têm volta).
 * @returns {() => void} desarma o botão (volta ao texto normal)
 */
function confirmable(button, label, confirmLabel, action) {
  let timer = null;
  const disarm = () => {
    clearTimeout(timer);
    timer = null;
    button.textContent = label;
    button.removeAttribute('data-armed');
  };
  button.textContent = label;
  button.addEventListener('click', () => {
    if (timer) {
      disarm();
      action();
      return;
    }
    button.textContent = confirmLabel;
    button.setAttribute('data-armed', '');
    timer = setTimeout(disarm, CONFIRM_MS);
  });
  return disarm;
}

/** Janela "Nova sessão": projeto, nome e pedido. Com `parent`, abre como filha na pasta da mãe. */
export function createLauncher({ api }) {
  const dialog = $('launch');
  const form = $('launch-form');
  const project = $('launch-project');
  const projectRow = $('launch-project-row');
  const name = $('launch-name');
  const prompt = $('launch-prompt');
  const submit = $('launch-submit');
  const feedback = $('launch-feedback');
  let parent = null;
  let busy = false;

  const sync = () => { submit.disabled = busy || !prompt.value.trim() || (!parent && !project.value); };

  async function open(options = {}) {
    parent = options.parent ?? null;
    $('launch-title').textContent = parent ? 'Nova sessão filha' : 'Nova sessão';
    $('launch-sub').textContent = parent
      ? `Abre em segundo plano na pasta de "${parent.name}" e fica ligada a ela no painel.`
      : 'Abre em segundo plano no Mac. Você acompanha e conversa por aqui.';
    projectRow.hidden = Boolean(parent);
    feedback.textContent = '';
    if (!dialog.open) dialog.showModal();
    sync();
    if (parent) {
      prompt.focus();
      return;
    }
    try {
      const { projects, canLaunch } = await api.get('/api/projects');
      project.replaceChildren(...projects.map((p) => {
        const option = el('option', '', p.name);
        option.value = p.path;
        option.title = p.path;
        return option;
      }));
      if (!canLaunch) feedback.textContent = 'O painel não achou o comando claude no Mac. Rode o instalador de novo.';
      else if (!projects.length) feedback.textContent = 'Ainda não conheço nenhuma pasta de projeto: abra uma sessão no Mac primeiro.';
    } catch (error) {
      feedback.textContent = `Não consegui ler os projetos (${error.message}).`;
    }
    sync();
    prompt.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    feedback.textContent = 'abrindo a sessão…';
    sync();
    try {
      await api.post('/api/sessions', {
        prompt: prompt.value,
        name: name.value,
        ...(parent ? { parentId: parent.id } : { cwd: project.value }),
      });
      prompt.value = '';
      name.value = '';
      feedback.textContent = '';
      dialog.close();
    } catch (error) {
      feedback.textContent = `Não abriu: ${error.message}`;
    }
    busy = false;
    sync();
  });
  [prompt, project].forEach((node) => node.addEventListener('input', sync));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  return { open };
}

/** Linha de ações do detalhe. `features()` são os Ajustes do último snapshot. */
export function createDetailActions({ api, sessionId, launcher, features, onDone }) {
  const child = $('act-child');
  const archive = $('act-archive');
  const close = $('act-close');
  const remove = $('act-remove');
  const note = $('act-note');
  let current = null;

  const run = async (path, done) => {
    const id = sessionId();
    if (!id) return;
    note.textContent = 'enviando…';
    try {
      await api.post(`/api/sessions/${encodeURIComponent(id)}/${path}`);
      note.textContent = done;
      onDone(path);
    } catch (error) {
      note.textContent = `Não deu: ${error.message}`;
    }
  };

  child.addEventListener('click', () => { if (current) launcher.open({ parent: current }); });
  archive.addEventListener('click', () => {
    if (!current) return;
    if (current.archived) run('unarchive', '✓ Desarquivada: volta aos quadros e ao mapa.');
    else run('archive', '✓ Arquivada no painel (o app do Claude não muda). Some dos quadros e do mapa; volta se pedir algo a você.');
  });
  const disarmClose = confirmable(close, 'fechar sessão', 'toque de novo para fechar', () => run('close', '✓ Sessão fechada (claude stop).'));
  const disarmRemove = confirmable(remove, 'apagar sessão', 'toque de novo para apagar (e o worktree)', () => run('remove', '✓ Sessão e worktree apagados (claude rm).'));

  return {
    /** `data` é o item do snapshot ou o detalhe da sessão. */
    fill(data) {
      if (current?.id !== data.id) {
        note.textContent = '';
        disarmClose();
        disarmRemove();
      }
      current = { ...current, ...data };
      const flags = features() ?? {};
      const local = !current.machine;
      const alive = current.status !== 'ended';
      child.hidden = !(flags.launch && local && alive);
      close.hidden = !(flags.closeRemove && current.background && alive);
      remove.hidden = !(flags.closeRemove && current.background);
      remove.title = 'Apaga a sessão e o worktree dela (claude rm)';
      archive.textContent = current.archived ? 'desarquivar' : 'arquivar no painel';
    },
    reset() {
      current = null;
      note.textContent = '';
    },
  };
}
