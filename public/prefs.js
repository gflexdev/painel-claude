// Preferências deste aparelho (localStorage). Sem armazenamento (aba privada, bloqueio), valem só até recarregar.

/** Lê um valor JSON guardado; `fallback` quando não há ou não dá para ler. */
export function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* vale só até recarregar */ }
}

/** Lista de textos guardada (ex.: quadros fixados); qualquer outra coisa vira lista vazia. */
export function readList(key) {
  const value = readPref(key, []);
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}
