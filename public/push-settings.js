// Linha "Avisos neste aparelho" dos Ajustes: pede a licença de notificação com um toque, inscreve o aparelho no
// Web Push do painel e manda um Aviso de teste. Vale por aparelho (o resto dos Ajustes vale para o Mac), por isso
// funciona também no celular. Fica fina: a criptografia e o envio são do servidor (src/push.js).
import { el } from './format.js';

const STATES = Object.freeze({
  unsupported: { label: 'sem suporte', hint: 'Este navegador não recebe Avisos. No Android, instale o painel como app pelo Chrome, pelo link https.' },
  blocked: { label: 'bloqueado', hint: 'As notificações do painel foram bloqueadas. Libere nas informações do site (cadeado) ou nos ajustes do app, e volte aqui.' },
  off: { label: 'desligado', hint: 'Toque em Ligar e permita as notificações. O Aviso chega mesmo com o app fechado, e o relógio repete.' },
  on: { label: 'recebendo', hint: 'Este aparelho recebe os Avisos das sessões vigiadas.' },
  busy: { label: 'um momento…', hint: '' },
});

/** Sem service worker ativo (navegador que não deixa, ou o registro falhou), não há onde o Aviso chegar. */
const SW_WAIT_MS = 5000;
const isSupported = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const keyBytes = (base64url) => {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const sameKey = (buffer, bytes) => {
  if (!buffer) return false;
  const given = new Uint8Array(buffer);
  return given.length === bytes.length && given.every((b, i) => b === bytes[i]);
};

/** @param {{ api: object, root: HTMLElement }} options */
export function createPushSettings({ api, root }) {
  let state = isSupported() ? 'busy' : 'unsupported';
  let note = '';

  const registration = () => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => { setTimeout(() => reject(new Error('o service worker do painel não respondeu')), SW_WAIT_MS); }),
  ]);

  /** Inscrição do navegador com a chave VAPID atual do painel; refaz se o painel trocou de chave. */
  async function subscription({ create }) {
    const { publicKey } = await api.get('/api/push/key');
    const key = keyBytes(publicKey);
    const reg = await registration();
    let current = await reg.pushManager.getSubscription();
    if (current && !sameKey(current.options?.applicationServerKey, key)) {
      await current.unsubscribe();
      current = null;
    }
    if (!current && create) current = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return current;
  }

  async function readState() {
    if (!isSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (!(await registration().then(() => true, () => false))) return 'unsupported';
    if (Notification.permission !== 'granted') return 'off';
    const current = await subscription({ create: false });
    if (!current) return 'off';
    // Reinscreve sempre: o servidor pode ter apagado (410) ou o navegador pode ter trocado a inscrição.
    await api.post('/api/push/subscribe', current.toJSON());
    return 'on';
  }

  function render() {
    const { label, hint } = STATES[state];
    const row = el('div', 'setting push-setting');
    const text = el('span', 'setting-text');
    const title = el('strong', '', 'Avisos neste aparelho ');
    title.append(el('span', `push-state push-${state}`, label));
    text.append(title, el('small', '', hint));
    row.append(text);
    const actions = el('span', 'push-actions');
    if (state === 'off') actions.append(button('Ligar', turnOn));
    if (state === 'on') actions.append(button('Mandar Aviso de teste', sendTest), button('Desligar', turnOff, 'push-quiet'));
    row.append(actions);
    const feedback = el('p', 'act-note', note);
    feedback.setAttribute('role', 'status');
    root.replaceChildren(row, feedback);
  }

  function button(label, action, extra = '') {
    const b = el('button', `push-btn ${extra}`.trim(), label);
    b.type = 'button';
    b.addEventListener('click', () => run(action));
    return b;
  }

  async function run(action) {
    state = 'busy';
    note = '';
    render();
    try {
      await action();
    } catch (error) {
      note = `Não deu: ${error.message}`;
    }
    try {
      state = await readState();
    } catch (error) {
      state = 'off';
      note = note || `Não consegui conferir os Avisos (${error.message}).`;
    }
    render();
  }

  async function turnOn() {
    // O pedido de licença precisa vir direto do toque.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const current = await subscription({ create: true });
    await api.post('/api/push/subscribe', current.toJSON());
    note = '✓ Ligado. Mande um Aviso de teste para conferir.';
  }

  async function turnOff() {
    const current = await (await registration()).pushManager.getSubscription();
    if (current) {
      await api.post('/api/push/unsubscribe', { endpoint: current.endpoint });
      await current.unsubscribe();
    }
    note = 'Desligado neste aparelho.';
  }

  async function sendTest() {
    const { sent, failed, devices } = await api.post('/api/push/test');
    const plural = (n) => (n === 1 ? 'aparelho' : 'aparelhos');
    note = sent
      ? `✓ Mandado a ${sent} ${plural(sent)}${failed ? `; ${failed} não ${failed === 1 ? 'aceitou' : 'aceitaram'} (veja o log do painel)` : ''}.`
      : `Não chegou a nenhum aparelho (${devices} na lista). Veja o log do painel.`;
  }

  return {
    /** Abre os Ajustes: mostra o estado deste aparelho. */
    async refresh() {
      note = '';
      if (state !== 'unsupported') state = 'busy';
      render();
      await run(async () => {});
    },
    /** Ao abrir o painel: reinscreve em silêncio, se este aparelho já deu licença. */
    sync() {
      if (isSupported() && Notification.permission === 'granted') readState().catch(() => {});
    },
  };
}
