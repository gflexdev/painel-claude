// Largura do painel lateral do detalhe (tela larga): arrasta a borda esquerda, ou usa as setas com ela em foco;
// dois cliques voltam ao padrão. O aparelho lembra a largura.
import { readPref, writePref } from './prefs.js';

const KEY = 'painel-claude-largura-painel';
export const DEFAULT_WIDTH = 460;
export const MIN_WIDTH = 360;
/** Sempre sobra pelo menos isto de grade ao lado do painel. */
export const KEEP_FOR_GRID = 320;
const STEP = 40;

const maxWidth = (viewport) => Math.max(MIN_WIDTH, viewport - KEEP_FOR_GRID);

/** Largura pedida → largura que cabe na tela agora. */
export const clampWidth = (width, viewport) => Math.round(Math.min(Math.max(width, MIN_WIDTH), maxWidth(viewport)));

export function setupSheetResize(handle) {
  const saved = Number(readPref(KEY, DEFAULT_WIDTH));
  let width = Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_WIDTH;
  const apply = () => {
    const shown = clampWidth(width, window.innerWidth);
    document.documentElement.style.setProperty('--sheet-w', `${shown}px`);
    handle.setAttribute('aria-valuenow', String(shown));
    handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
    handle.setAttribute('aria-valuemax', String(maxWidth(window.innerWidth)));
  };
  const set = (next) => { width = clampWidth(next, window.innerWidth); apply(); };
  const save = () => writePref(KEY, width);

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    document.body.setAttribute('data-resizing', '');
  });
  handle.addEventListener('pointermove', (event) => {
    if (handle.hasPointerCapture(event.pointerId)) set(window.innerWidth - event.clientX);
  });
  const finish = (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    handle.releasePointerCapture(event.pointerId);
    document.body.removeAttribute('data-resizing');
    save();
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('dblclick', () => { set(DEFAULT_WIDTH); save(); });
  handle.addEventListener('keydown', (event) => {
    const delta = { ArrowLeft: STEP, ArrowRight: -STEP }[event.key];
    if (!delta) return;
    event.preventDefault();
    set(clampWidth(width, window.innerWidth) + delta);
    save();
  });
  window.addEventListener('resize', apply);
  apply();
}
