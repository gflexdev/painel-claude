import { clip } from './tools.js';

const MAX_ANSWER = 500;

/**
 * Perguntas do AskUserQuestion no formato que a tela precisa.
 * kind: "choice" (opções) ou "text"/"number" (você digita).
 */
export function questionsOf(input) {
  const list = Array.isArray(input?.questions) ? input.questions : [];
  return list
    .filter((q) => q && typeof q.question === 'string')
    .map((q) => ({
      question: q.question,
      header: clip(q.header ?? '', 40),
      kind: q.kind === 'text' || q.kind === 'number' ? q.kind : 'choice',
      multiSelect: q.multiSelect === true,
      options: (Array.isArray(q.options) ? q.options : [])
        .filter((o) => o && typeof o.label === 'string')
        .map((o) => ({ label: o.label, description: clip(o.description ?? '', 160) })),
    }));
}

/**
 * Converte o que você escolheu na tela em `answers` para o Claude Code.
 * Lança erro com mensagem legível se faltar resposta ou vier opção que não existe.
 */
export function buildAnswers(questions, picks) {
  if (!picks || typeof picks !== 'object' || Array.isArray(picks)) throw new Error('respostas ausentes');
  return Object.fromEntries(questions.map((q) => {
    const pick = picks[q.question];
    if (q.kind !== 'choice') {
      if (typeof pick !== 'string' || !pick.trim()) throw new Error(`falta responder: ${q.question}`);
      return [q.question, pick.trim().slice(0, MAX_ANSWER)];
    }
    const labels = q.options.map((o) => o.label);
    const chosen = Array.isArray(pick) ? pick : [pick];
    if (!chosen.length || chosen.some((c) => typeof c !== 'string' || !labels.includes(c))) {
      throw new Error(`escolha inválida em: ${q.question}`);
    }
    if (!q.multiSelect && chosen.length !== 1) throw new Error(`escolha uma opção em: ${q.question}`);
    return [q.question, q.multiSelect ? chosen : chosen[0]];
  }));
}
