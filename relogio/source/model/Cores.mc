import Toybox.Lang;

// Cores do mostrador redondo (firmware/src/ui/theme.h e round/look.h), as mesmas da versão web.
// Fundo preto puro: no AMOLED o pixel preto fica apagado e a borda some.
module Cores {
    const PRETO = 0x000000;
    const TRILHA = 0x14161B;
    const CHIP = 0x121318;
    const LINHA = 0x111216;
    const CAIXA = 0x0F1014;
    const CAIXA_BORDA = 0x23262E;
    const PONTO = 0x3A3E48;
    const ORBITA = 0x262A33;
    const NUCLEO = 0x12141A;
    const TILE_ALTO = 0x20232B;

    const TINTA = 0xECEAE4;
    const TINTA_SUAVE = 0xB9BCC4;
    const TINTA_APAGADA = 0x8D919C;
    const TINTA_FRACA = 0x5B606C;
    const TINTA_AGORA = 0xD6D4CE;

    const RODANDO = 0xFFB238;
    const ESPERANDO = 0xFF4F6A;
    const PARADA = 0x4FD18B;
    const ERRO = 0xD36CFF;
    const VER = 0x7AA2FF;
    const ENCERRADA = 0x5B606C;
    const PERGUNTA = 0x5FE0D0;
    const SELO_TINTA = 0x1A0508;

    const PERTO_DO_LIMITE = 90;

    // Cor da Situação: terminou sem ver é azul, como no mostrador e na web.
    function daSituacao(status as String) as Number {
        if (status.equals("waiting")) {
            return ESPERANDO;
        }
        if (status.equals("error")) {
            return ERRO;
        }
        if (status.equals("done")) {
            return VER;
        }
        if (status.equals("working")) {
            return RODANDO;
        }
        return PARADA;
    }

    // Mais clara, para texto pequeno sobre preto.
    function suave(cor as Number) as Number {
        if (cor == ESPERANDO) {
            return 0xFF8A9B;
        }
        if (cor == RODANDO) {
            return 0xFFC86E;
        }
        if (cor == VER) {
            return 0xA3BFFF;
        }
        if (cor == ERRO) {
            return 0xE0A3FF;
        }
        return cor;
    }

    // Fundo escuro tingido da Situação (chip, linha de quem espera você).
    function tingida(cor as Number) as Number {
        if (cor == ESPERANDO) {
            return 0x2A0C13;
        }
        if (cor == RODANDO) {
            return 0x241A08;
        }
        if (cor == VER) {
            return 0x0F1630;
        }
        if (cor == ERRO) {
            return 0x210D2A;
        }
        return CHIP;
    }

    // Uso do plano: perto do limite fica vermelho.
    function doUso(percent as Number, base as Number) as Number {
        return percent >= PERTO_DO_LIMITE ? ESPERANDO : base;
    }

    // `cor` com opacidade `opa` (0–255) sobre `fundo`. Os fundos são quase pretos, então dá o mesmo que o alfa.
    function misturar(cor as Number, fundo as Number, opa as Number) as Number {
        if (opa >= 255) {
            return cor;
        }
        if (opa <= 0) {
            return fundo;
        }
        var r = mistura((cor >> 16) & 0xFF, (fundo >> 16) & 0xFF, opa);
        var g = mistura((cor >> 8) & 0xFF, (fundo >> 8) & 0xFF, opa);
        var b = mistura(cor & 0xFF, fundo & 0xFF, opa);
        return (r << 16) | (g << 8) | b;
    }

    function mistura(a as Number, b as Number, opa as Number) as Number {
        return (a * opa + b * (255 - opa)) / 255;
    }
}
