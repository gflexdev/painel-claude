// Acesso ao servidor do Mac: token guardado no aparelho, GET e POST com o token no cabeçalho.
const TOKEN_KEY = 'painel-claude-token';

export function readToken() {
  const fromUrl = new URLSearchParams(location.search).get('t');
  if (fromUrl) {
    saveToken(fromUrl);
    history.replaceState(null, '', location.pathname + location.hash);
    return fromUrl;
  }
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function saveToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* sem storage: segue só na memória */ }
}

export function createApi(getToken) {
  const request = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', ...options.headers },
    });
    let body = {};
    try { body = await response.json(); } catch { /* corpo vazio */ }
    if (!response.ok || !body.success) {
      throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { status: response.status });
    }
    return body.data;
  };
  return {
    get: (path) => request(path),
    post: (path, payload) => request(path, { method: 'POST', body: JSON.stringify(payload ?? {}) }),
    streamUrl: () => `/api/stream?t=${encodeURIComponent(getToken())}`,
  };
}
