/** Cabeçalhos que um proxy (como o `tailscale serve`) acrescenta: com eles, o pedido não veio direto da máquina. */
export const PROXY_HEADERS = Object.freeze(['x-forwarded-for', 'forwarded', 'tailscale-user-login', 'x-forwarded-proto']);
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** Faixas que o Tailscale usa para os aparelhos da tailnet: 100.64.0.0/10 e fd7a:115c:a1e0::/48. */
const TAILNET_V4 = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/;
const TAILNET_V6 = /^fd7a:115c:a1e0:/i;

const viaProxy = (headers) => PROXY_HEADERS.some((name) => headers[name] !== undefined);

/** "::ffff:100.101.102.103" (IPv4 dentro de IPv6) → "100.101.102.103". */
export const plainAddress = (address) => String(address ?? '').replace(/^::ffff:/i, '').toLowerCase();

/** Hooks só valem do próprio Mac, e não por um proxy que também fale de 127.0.0.1. */
export function isLocalHook(remoteAddress, headers) {
  return LOOPBACK.has(remoteAddress) && !viaProxy(headers);
}

/** Conexão direta de um aparelho da tailnet (o `tailscale serve` chega como 127.0.0.1 e fica de fora). */
export function isTailnetDirect(remoteAddress, headers) {
  const address = plainAddress(remoteAddress);
  return (TAILNET_V4.test(address) || TAILNET_V6.test(address)) && !viaProxy(headers);
}
