// Conferência dos tokens das Telas e do relógio, em tempo constante.
import { createHash, timingSafeEqual } from 'node:crypto';

/** Abaixo disso o token não vale (protege contra um token vazio ou truncado no config.json). */
export const MIN_TOKEN_LENGTH = 16;

const digest = (text) => createHash('sha256').update(String(text)).digest();

/** Token do cabeçalho `Authorization: Bearer …`; '' se não houver. */
export function bearerOf(req) {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/**
 * Compara o token dado com o esperado sem deixar o tempo dizer quanto bateu.
 * @param {string} given
 * @param {string | null | undefined} expected
 * @returns {boolean}
 */
export function tokenMatches(given, expected) {
  if (typeof expected !== 'string' || expected.length < MIN_TOKEN_LENGTH) return false;
  return timingSafeEqual(digest(given), digest(expected)) && given.length > 0;
}

/**
 * Token das Telas: GET aceita também `?t=` (EventSource não manda cabeçalho); ações só pelo cabeçalho.
 * @param {string} token
 * @returns {(req: import('node:http').IncomingMessage, url: URL, opts?: { headerOnly?: boolean }) => boolean}
 */
export function createScreenTokenCheck(token) {
  return (req, url, { headerOnly = false } = {}) => {
    const fromHeader = bearerOf(req);
    const given = fromHeader || (headerOnly ? '' : url.searchParams.get('t') ?? '');
    return tokenMatches(given, token);
  };
}
