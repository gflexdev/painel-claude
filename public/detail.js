// Detalhe de uma sessão: resumo, números e o cartão de pedido (permissão, plano ou pergunta).
import { agentSvg } from './agents.js';
import { ACTIVITY_WORD, STATUS_WORD, accessoryOf, el, elapsed, tokens } from './format.js';
import { renderMarkdown } from './markdown.js';

const REFRESH_AFTER_DECISION_MS = 1500;
const REQUEST_COPY = Object.freeze({
  permission: { title: 'Pedido de permissão', allow: 'Permitir', deny: 'Negar', done: '✓ Permitido. O Claude segue.' },
  plan: { title: 'Plano para aprovar', allow: 'Aprovar plano', deny: 'Recusar', done: '✓ Plano aprovado.' },
  question: { title: 'Pergunta do Claude', allow: 'Enviar resposta', deny: 'Dispensar', done: '✓ Resposta enviada.' },
});

const $ = (id) => document.getElementById(id);

export function createDetail({ api, serverNow, agentStyle = () => 'robo' }) {
  const dialog = $('detail');
  let openId = null;
  let shown = null;
  let deciding = false;
  let picks = {};

  const statusLine = (data) => {
    const word = STATUS_WORD[data.status] ?? data.status;
    const doing = data.status === 'working' && data.activity ? ` · ${ACTIVITY_WORD[data.activity] ?? ''}` : '';
    const since = elapsed(data.since, serverNow());
    return `${word}${doing} ${since === 'agora' ? 'agora' : `há ${since}`} — ${data.detail}`;
  };

  function fillHeader(data) {
    dialog.dataset.status = data.status;
    $('detail-bot').replaceChildren(agentSvg(agentStyle(), { id: data.id, name: data.name, project: data.project, accessory: accessoryOf(data) }));
    $('detail-name').textContent = data.name;
    $('detail-meta').textContent = [data.machine, data.origin, data.cwd ?? data.project].filter(Boolean).join(' · ');
    $('detail-status').textContent = statusLine(data);
  }

  function fillStats(data) {
    const rows = [
      ['modelo', data.model],
      ['contexto', data.contextTokens ? `${tokens(data.contextTokens)} tokens` : null],
      ['pedidos seus', data.turns],
      ['aberta há', data.startedAt ? elapsed(data.startedAt, serverNow()) : null],
    ].filter(([, value]) => value !== null && value !== undefined);
    $('detail-stats').replaceChildren(...rows.flatMap(([label, value]) => [el('dt', '', label), el('dd', '', String(value))]));
  }

  function fillSummary(data, { loading = false } = {}) {
    const summary = data.summary ?? {};
    const promptText = summary.lastPrompt || data.lastPrompt;
    const prompt = $('detail-prompt');
    prompt.textContent = promptText || 'sem pedido registrado';
    prompt.classList.toggle('muted', !promptText);
    const answer = $('detail-answer');
    if (summary.answer) answer.replaceChildren(renderMarkdown(summary.answer));
    else answer.textContent = loading ? 'carregando…' : 'ainda sem resposta em texto';
    answer.classList.toggle('muted', !summary.answer);
    answer.classList.toggle('md', Boolean(summary.answer));
    const tools = $('detail-tools');
    tools.replaceChildren(...(summary.recentTools ?? []).map((t) => el('li', '', t)));
    if (!tools.children.length) tools.append(el('li', 'muted', 'nenhuma'));
  }

  const allAnswered = () => (shown?.questions ?? []).every((q) => {
    const pick = picks[q.question];
    return Array.isArray(pick) ? pick.length > 0 : typeof pick === 'string' && pick.trim() !== '';
  });

  const syncAllowButton = () => {
    $('req-allow').disabled = deciding || (shown?.kind === 'question' && !allAnswered());
  };

  function renderQuestion(q) {
    const box = el('fieldset', 'question');
    const legend = el('legend');
    if (q.header) legend.append(el('span', 'q-header', q.header));
    legend.append(el('span', 'q-text', q.question));
    box.append(legend);
    if (q.kind !== 'choice') {
      const input = el('input', 'q-input');
      input.type = q.kind === 'number' ? 'number' : 'text';
      input.placeholder = 'sua resposta';
      input.addEventListener('input', () => { picks = { ...picks, [q.question]: input.value }; syncAllowButton(); });
      box.append(input);
      return box;
    }
    const options = el('div', 'q-options');
    q.options.forEach((option) => {
      const button = el('button', 'q-option');
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.append(el('span', 'q-label', option.label));
      if (option.description) button.append(el('span', 'q-desc', option.description));
      button.addEventListener('click', () => {
        const current = picks[q.question];
        const next = q.multiSelect
          ? ((current ?? []).includes(option.label) ? current.filter((l) => l !== option.label) : [...(current ?? []), option.label])
          : option.label;
        picks = { ...picks, [q.question]: next };
        options.querySelectorAll('.q-option').forEach((b) => {
          const label = b.querySelector('.q-label').textContent;
          b.setAttribute('aria-pressed', String(Array.isArray(next) ? next.includes(label) : next === label));
        });
        syncAllowButton();
      });
      options.append(button);
    });
    if (q.multiSelect) box.append(el('p', 'q-hint', 'pode marcar mais de uma'));
    box.append(options);
    return box;
  }

  function fillRequest(request) {
    const section = $('detail-request');
    const sameRequest = shown?.id === request?.id;
    shown = request ?? null;
    section.hidden = !request;
    if (!request || sameRequest) return;
    picks = {};
    const copy = REQUEST_COPY[request.kind] ?? REQUEST_COPY.permission;
    section.dataset.kind = request.kind;
    $('req-title').textContent = copy.title;
    $('req-tool').textContent = request.kind === 'question' ? '' : request.tool;
    const preview = $('req-preview');
    preview.hidden = !request.preview;
    preview.textContent = request.preview;
    $('req-questions').replaceChildren(...(request.questions ?? []).map(renderQuestion));
    $('req-allow').textContent = copy.allow;
    $('req-deny').textContent = copy.deny;
    $('req-feedback').textContent = 'O diálogo também está aberto no Mac; vale quem responder primeiro.';
    $('req-deny').disabled = false;
    syncAllowButton();
  }

  async function open(id, session) {
    openId = id;
    if (session) {
      fillHeader(session);
      fillStats(session);
      fillSummary({ ...session, summary: null }, { loading: true });
    }
    if (!dialog.open) dialog.showModal();
    if (session?.unseen) api.post(`/api/sessions/${encodeURIComponent(id)}/seen`).catch(() => {});
    try {
      const data = await api.get(`/api/sessions/${encodeURIComponent(id)}`);
      if (openId !== id) return;
      fillHeader(data);
      fillStats(data);
      fillSummary(data);
      fillRequest(data.permissions?.[0] ?? null);
    } catch (error) {
      $('detail-answer').textContent = `não consegui ler o resumo (${error.message})`;
      $('detail-answer').classList.remove('md');
    }
  }

  async function decide(behavior) {
    const request = shown;
    if (!request || deciding) return;
    deciding = true;
    $('req-deny').disabled = true;
    syncAllowButton();
    const feedback = $('req-feedback');
    feedback.textContent = 'enviando…';
    try {
      const answers = behavior === 'allow' && request.kind === 'question' ? picks : undefined;
      await api.post(`/api/permissions/${encodeURIComponent(request.id)}`, { decision: behavior, answers });
      feedback.textContent = behavior === 'allow'
        ? (REQUEST_COPY[request.kind] ?? REQUEST_COPY.permission).done
        : '✕ Recusado. O Claude foi avisado.';
      setTimeout(() => {
        deciding = false;
        if (openId) open(openId);
      }, REFRESH_AFTER_DECISION_MS);
    } catch (error) {
      deciding = false;
      feedback.textContent = error.status === 410
        ? 'Esse pedido já foi respondido no Mac.'
        : `Não consegui enviar (${error.message}). Tente de novo.`;
      $('req-deny').disabled = error.status === 410;
      syncAllowButton();
    }
  }

  /** Pedido novo chegou (ou foi respondido no Mac) para a sessão aberta: recarrega o detalhe. */
  function onSnapshot(snapshot) {
    if (!openId || deciding) return;
    const session = snapshot.sessions.find((s) => s.id === openId);
    if (!session) return;
    const current = session.permission?.id ?? null;
    if (current !== (shown?.id ?? null)) open(openId, session);
    else $('detail-status').textContent = statusLine(session);
  }

  function close() {
    openId = null;
    if (dialog.open) dialog.close();
  }

  $('detail-close').addEventListener('click', close);
  $('req-allow').addEventListener('click', () => decide('allow'));
  $('req-deny').addEventListener('click', () => decide('deny'));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => { openId = null; });

  return { open, onSnapshot, close };
}
