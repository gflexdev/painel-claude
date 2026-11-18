// Escolha do estilo do personagem: botão na barra de cima + janela com as 5 opções. Vale por aparelho.
import { AGENT_STYLES, agentSvg, normalizeStyle } from './agents.js';
import { el } from './format.js';

const STORAGE_KEY = 'painel-claude-agente';
const SAMPLES = Object.freeze([
  { id: 'exemplo-deploy', name: 'Deploy do site', project: 'site', accessory: 'bash', status: 'working' },
  { id: 'exemplo-painel-7', name: 'Painel Claude', project: 'painel-claude', accessory: 'ask', status: 'waiting' },
]);

function readStyle() {
  try {
    return normalizeStyle(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'robo';
  }
}

function saveStyle(style) {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch { /* sem armazenamento: vale só até recarregar */ }
}

/**
 * @param {{ button: HTMLButtonElement, dialog: HTMLDialogElement, options: HTMLElement, onChange: (style: string) => void }} ui
 */
export function createStylePicker({ button, dialog, options, onChange }) {
  let current = readStyle();

  const sample = (style, session) => {
    const box = el('span', 'picker-sample');
    box.dataset.status = session.status;
    box.appendChild(agentSvg(style, session));
    return box;
  };

  const renderButton = () => {
    button.replaceChildren(agentSvg(current, { ...SAMPLES[0], accessory: null }));
    button.title = `Estilo do agente: ${AGENT_STYLES.find((s) => s.id === current).name}`;
  };

  const renderOptions = () => {
    options.replaceChildren(...AGENT_STYLES.map((style) => {
      const option = el('button', 'picker-option');
      option.type = 'button';
      option.setAttribute('role', 'radio');
      option.setAttribute('aria-checked', String(style.id === current));
      const samples = el('span', 'picker-samples');
      samples.append(...SAMPLES.map((session) => sample(style.id, session)));
      const text = el('span', 'picker-text');
      text.append(el('strong', '', style.name), el('small', '', style.hint));
      option.append(samples, text);
      option.addEventListener('click', () => {
        current = style.id;
        saveStyle(current);
        renderButton();
        onChange(current);
        dialog.close();
      });
      return option;
    }));
  };

  button.addEventListener('click', () => {
    renderOptions();
    dialog.showModal();
    options.querySelector('[aria-checked="true"]')?.focus();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  renderButton();

  return { current: () => current };
}
