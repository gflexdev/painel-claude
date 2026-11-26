import Toybox.Lang;

// Dá nome aos erros do pedido. Os códigos negativos são do Communications do Connect IQ.
module Erros {

    // -300 em menos que isso é o celular sem achar o painel (Tailscale do celular desligado):
    // no teste de viabilidade voltou em ~0,3 s. Um -300 demorado é o painel que não respondeu.
    const TAILNET_RAPIDO_MS = 2000;

    const SEM_CELULAR = -104;          // BLE_CONNECTION_UNAVAILABLE
    const SEM_RESPOSTA = -300;         // NETWORK_REQUEST_TIMED_OUT
    const RESPOSTA_GRANDE = -402;      // NETWORK_RESPONSE_TOO_LARGE
    const PRECISA_HTTPS = -1001;       // SECURE_CONNECTION_REQUIRED
    const TOKEN_INVALIDO = 401;
    const NAO_ENCONTRADA = 404;        // vigiar uma sessão que o painel já encerrou

    // [título, dica] para mostrar, ou null quando não é erro (200).
    function mensagem(codigo as Number, demoraMs as Number) as Array<String> or Null {
        if (codigo == 200) {
            return null;
        }
        if (codigo == SEM_RESPOSTA) {
            return demoraMs < TAILNET_RAPIDO_MS
                ? ["sem tailnet no celular", "ligue o Tailscale"]
                : ["painel não respondeu", "o Mac está ligado?"];
        }
        if (codigo == SEM_CELULAR) {
            return ["sem celular", "conecte o celular"];
        }
        if (codigo == TOKEN_INVALIDO) {
            return ["token inválido", "instale o app de novo"];
        }
        if (codigo == NAO_ENCONTRADA) {
            return ["sessão encerrada", "volte à lista"];
        }
        if (codigo == RESPOSTA_GRANDE) {
            return ["resposta grande", "atualize o painel"];
        }
        if (codigo == PRECISA_HTTPS) {
            return ["precisa de https", "instale o app de novo"];
        }
        return ["erro " + codigo.toString(), "tentando de novo"];
    }
}
