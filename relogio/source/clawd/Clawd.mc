import Toybox.Graphics;
import Toybox.Lang;

// Clawd, o bichinho laranja de pixel do Claude Code: porte de firmware/src/app/clawd.cpp (que veio de
// public/clawd.js). As animações são em degraus, como na web. Área em unidades: x de 0 a 20 (bicho + ícone),
// y de -3 a 12 (os efeitos sobem até -3); 1 unidade = `u` pixels na tela.
module Clawd {

    // Jeito de se mexer, pela situação.
    enum {
        RODANDO,
        ESPERANDO,
        ERRO,
        VER,
        DORMINDO,
        ENCERRADA
    }

    const COLUNAS = 21;
    const LINHAS = 15;
    const TOPO = -3;
    const MEIO_X = 8;        // meio dos pés, em unidades (para centrar o bicho, não a área)
    const PULO_MS = 620;     // pulo com coração do toque

    const CORPO = 0xD97757;
    const CORPO_APAGADO = 0x6B6F78;
    const TINTA = 0x16110D;
    const CORACAO = 0xFF6B8B;
    const ZZZ = 0x8D919C;
    const BRILHO_COR = 0x7AA2FF;

    // Olhos.
    enum {
        ABERTOS,
        PISCANDO,
        FECHADOS,
        FELIZES,
        X
    }

    // Índices da pose (um Array, para não criar objeto a cada quadro).
    enum {
        P_X,
        P_Y,
        P_TOPO,
        P_PERNAS_A,
        P_PERNAS_B,
        P_BRACO_E,
        P_BRACO_D,
        P_OLHOS,
        P_BOCA,
        P_CHAO_OPA,
        P_CHAO_MENOR,
        P_Z,
        P_Z1,
        P_Z2,
        P_BRILHO,
        P_CORACAO,
        P_CORACAO_Y,
        P_CORACAO_OPA,
        P_TAMANHO
    }

    const Z1 = [0, 0, 1, 0, 2, 0, 3, 0, 2, 1, 1, 2, 0, 3, 1, 3, 2, 3, 3, 3] as Array<Number>;
    const Z2 = [0, 0, 1, 0, 2, 0, 1, 1, 0, 2, 1, 2, 2, 2] as Array<Number>;
    const FORMA_CORACAO = [0, 0, 1, 0, 3, 0, 4, 0, 0, 1, 1, 1, 2, 1, 3, 1, 4, 1, 1, 2, 2, 2, 3, 2, 2, 3] as Array<Number>;
    const FORMA_BRILHO = [1, 0, 0, 1, 1, 1, 2, 1, 1, 2] as Array<Number>;

    // Humor pela situação que chega do painel.
    function humorDe(status as String) as Number {
        if (status.equals("working")) {
            return RODANDO;
        }
        if (status.equals("waiting")) {
            return ESPERANDO;
        }
        if (status.equals("error")) {
            return ERRO;
        }
        if (status.equals("done")) {
            return VER;
        }
        return DORMINDO;
    }

    // Fase de 0 a 999 dentro de um período, com atraso (negativo = adiantado, como animation-delay).
    function fase(ms as Number, periodo as Number, atraso as Number) as Number {
        var t = (ms - atraso) % periodo;
        if (t < 0) {
            t += periodo;
        }
        return t * 1000 / periodo;
    }

    // Keyframes em degraus: pares (a partir de ‰, valor).
    function degrau(f as Number, chaves as Array<Number>) as Number {
        var valor = 0;
        for (var i = 0; i < chaves.size(); i += 2) {
            if (f >= chaves[i]) {
                valor = chaves[i + 1];
            }
        }
        return valor;
    }

    // A pose em `ms`; `pulo` = há quanto tempo foi o toque (-1 = sem toque).
    function pose(humor as Number, ms as Number, pulo as Number) as Array<Number> {
        var p = new [P_TAMANHO] as Array<Number>;
        for (var i = 0; i < P_TAMANHO; i++) {
            p[i] = 0;
        }
        p[P_CHAO_OPA] = 82;
        p[P_OLHOS] = fase(ms, 3800, 0) >= 950 ? PISCANDO : ABERTOS;

        if (humor == RODANDO) {
            p[P_PERNAS_A] = degrau(fase(ms, 440, 0), [0, 0, 500, -1]);
            p[P_PERNAS_B] = degrau(fase(ms, 440, -220), [0, 0, 500, -1]);
            p[P_BRACO_E] = degrau(fase(ms, 260, 0), [0, 0, 500, -1]);
            p[P_BRACO_D] = degrau(fase(ms, 260, -130), [0, 0, 500, -1]);
            p[P_CHAO_OPA] = fase(ms, 880, 0) < 500 ? 82 : 180;
        } else if (humor == ESPERANDO) {
            var pulinho = fase(ms, 1500, 0);
            p[P_Y] = degrau(pulinho, [0, 0, 620, -2, 680, -3, 760, -2, 820, 0]);
            p[P_CHAO_MENOR] = pulinho >= 620 && pulinho < 820 ? 3 : 0;
            p[P_BRACO_D] = degrau(fase(ms, 360, 0), [0, -1, 500, -3]);
            p[P_BOCA] = 1;
        } else if (humor == ERRO) {
            p[P_OLHOS] = X;
            p[P_X] = degrau(fase(ms, 2400, 0), [0, 0, 830, -1, 860, 1, 890, -1, 920, 1, 950, 0]);
            p[P_BRACO_E] = 1;
            p[P_BRACO_D] = 1;
        } else if (humor == VER) {
            p[P_OLHOS] = FELIZES;
            p[P_Y] = degrau(fase(ms, 2400, 0), [0, 0, 640, -2, 700, 0, 740, -2, 800, 0]);
            p[P_BRACO_E] = -2;
            p[P_BRACO_D] = -2;
            p[P_BRILHO] = fase(ms, 1200, 0) < 500 ? 255 : 64;
        } else {
            p[P_OLHOS] = FECHADOS;
            p[P_TOPO] = degrau(fase(ms, 3200, 0), [0, 0, 500, 1]);
            p[P_Z] = humor == DORMINDO ? 1 : 0;
            p[P_Z1] = fase(ms, 3200, 0) / 250;
            p[P_Z2] = fase(ms, 3200, -1600) / 250;
        }

        if (pulo >= 0 && pulo < PULO_MS) {
            var f = pulo * 1000 / PULO_MS;
            p[P_Y] = degrau(f, [0, 1, 150, -3, 400, -4, 650, -2, 850, 0]);
            p[P_X] = 0;
            p[P_CORACAO] = 1;
            p[P_CORACAO_Y] = degrau(f, [0, 1, 350, -1, 700, -2]);
            p[P_CORACAO_OPA] = f < 700 ? 255 : 150;
            p[P_Z] = 0;
        }
        return p;
    }

    // Desenha o Clawd com o canto de cima da área em (x, y). `chao` = cor da situação; `fundo` = cor embaixo
    // (as transparências são misturadas com ela). `acessorio` = ícone da atividade ("" = sem).
    function desenhar(dc as Graphics.Dc, x as Number, y as Number, u as Number, humor as Number, chao as Number,
            fundo as Number, acessorio as String, corAcessorio as Number, ms as Number, pulo as Number) as Void {
        var p = pose(humor, ms, pulo);
        var apagado = humor == ENCERRADA;
        var corChao = apagado ? Cores.ENCERRADA : chao;
        var corpo = apagado ? CORPO_APAGADO : CORPO;
        var y0 = y - TOPO * u;

        var menor = p[P_CHAO_MENOR];
        ret(dc, x, y0, u, 3 + menor / 2 + menor % 2, 11, 10 - menor, 1, Cores.misturar(corChao, fundo, p[P_CHAO_OPA]));

        var ax = p[P_X];
        var ay = p[P_Y];
        ret(dc, x, y0, u, 3 + ax, 9 + ay + p[P_PERNAS_A], 1, 2, corpo);
        ret(dc, x, y0, u, 10 + ax, 9 + ay + p[P_PERNAS_A], 1, 2, corpo);
        ret(dc, x, y0, u, 5 + ax, 9 + ay + p[P_PERNAS_B], 1, 2, corpo);
        ret(dc, x, y0, u, 12 + ax, 9 + ay + p[P_PERNAS_B], 1, 2, corpo);
        var ty = ay + p[P_TOPO];
        ret(dc, x, y0, u, 0 + ax, 7 + ty + p[P_BRACO_E], 2, 1, corpo);
        ret(dc, x, y0, u, 14 + ax, 7 + ty + p[P_BRACO_D], 2, 1, corpo);
        ret(dc, x, y0, u, 2 + ax, 4 + ty, 12, 5, corpo);

        olhos(dc, x + ax * u, y0 + ty * u, u, p[P_OLHOS]);
        if (p[P_BOCA] == 1) {
            ret(dc, x, y0, u, 7 + ax, 7 + ty, 2, 1, TINTA);
        }

        if (p[P_BRILHO] > 0) {
            forma(dc, x, y0, u, FORMA_BRILHO, 0, 1, Cores.misturar(BRILHO_COR, fundo, p[P_BRILHO]));
        }
        if (p[P_Z] == 1) {
            zzz(dc, x, y0, u, Z1, 12, 0, p[P_Z1], fundo);
            zzz(dc, x, y0, u, Z2, 16, -2, p[P_Z2], fundo);
        }
        if (p[P_CORACAO] == 1) {
            forma(dc, x, y0, u, FORMA_CORACAO, 5, -1 + p[P_CORACAO_Y], Cores.misturar(CORACAO, fundo, p[P_CORACAO_OPA]));
        }
        if (!acessorio.equals("")) {
            forma(dc, x, y0, u, pontosDoAcessorio(acessorio), 16, 1, corAcessorio);
        }
    }

    function olhos(dc as Graphics.Dc, x as Number, y as Number, u as Number, tipo as Number) as Void {
        if (tipo == ABERTOS) {
            ret(dc, x, y, u, 4, 5, 1, 2, TINTA);
            ret(dc, x, y, u, 11, 5, 1, 2, TINTA);
        } else if (tipo == PISCANDO) {
            ret(dc, x, y, u, 4, 6, 1, 1, TINTA);
            ret(dc, x, y, u, 11, 6, 1, 1, TINTA);
        } else if (tipo == FECHADOS) {
            ret(dc, x, y, u, 3, 6, 2, 1, TINTA);
            ret(dc, x, y, u, 11, 6, 2, 1, TINTA);
        } else if (tipo == FELIZES) {
            forma(dc, x, y, u, [3, 6, 4, 5, 5, 6, 10, 6, 11, 5, 12, 6] as Array<Number>, 0, 0, TINTA);
        } else {
            forma(dc, x, y, u, [3, 4, 5, 4, 4, 5, 3, 6, 5, 6, 10, 4, 12, 4, 11, 5, 10, 6, 12, 6] as Array<Number>, 0, 0, TINTA);
        }
    }

    // zzz: some (quarto 0), aparece, sobe na diagonal e apaga pela metade (steps(4) da web).
    function zzz(dc as Graphics.Dc, x as Number, y as Number, u as Number, pontos as Array<Number>, x0 as Number,
            y0 as Number, quarto as Number, fundo as Number) as Void {
        if (quarto <= 0) {
            return;
        }
        var dx = quarto >= 2 ? 1 : 0;
        var dy = quarto == 2 ? -1 : quarto == 3 ? -2 : 0;
        forma(dc, x, y, u, pontos, x0 + dx, y0 + dy, Cores.misturar(ZZZ, fundo, quarto == 3 ? 128 : 255));
    }

    function ret(dc as Graphics.Dc, x as Number, y as Number, u as Number, px as Number, py as Number, w as Number,
            h as Number, cor as Number) as Void {
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(x + px * u, y + py * u, w * u, h * u);
    }

    function forma(dc as Graphics.Dc, x as Number, y as Number, u as Number, pontos as Array<Number>, x0 as Number,
            y0 as Number, cor as Number) as Void {
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < pontos.size(); i += 2) {
            dc.fillRectangle(x + (x0 + pontos[i]) * u, y + (y0 + pontos[i + 1]) * u, u, u);
        }
    }

    // Ícone 4×4 da atividade (firmware/src/app/bot.cpp), em pares x, y.
    function pontosDoAcessorio(nome as String) as Array<Number> {
        if (nome.equals("read")) { return [0, 0, 1, 0, 2, 0, 0, 1, 2, 1, 0, 2, 1, 2, 2, 2, 3, 3] as Array<Number>; }
        if (nome.equals("write")) { return [3, 0, 2, 1, 1, 2, 0, 3] as Array<Number>; }
        if (nome.equals("bash")) { return [0, 0, 1, 1, 0, 2, 2, 3, 3, 3] as Array<Number>; }
        if (nome.equals("web")) { return [1, 0, 2, 0, 0, 1, 1, 1, 2, 1, 3, 1, 0, 2, 1, 2, 2, 2, 3, 2, 1, 3, 2, 3] as Array<Number>; }
        if (nome.equals("delegate")) { return [1, 0, 2, 0, 0, 1, 1, 1, 2, 1, 3, 1, 1, 2, 2, 2, 0, 3, 3, 3] as Array<Number>; }
        if (nome.equals("plan")) { return [0, 0, 2, 0, 3, 0, 0, 2, 2, 2, 3, 2] as Array<Number>; }
        if (nome.equals("ask")) { return [1, 0, 2, 0, 3, 1, 2, 2, 2, 3] as Array<Number>; }
        if (nome.equals("mcp")) { return [0, 0, 3, 0, 0, 1, 1, 1, 2, 1, 3, 1, 1, 2, 2, 2, 1, 3] as Array<Number>; }
        if (nome.equals("think")) { return [0, 2, 2, 2] as Array<Number>; }
        if (nome.equals("compact")) { return [0, 0, 3, 0, 1, 1, 2, 1, 1, 2, 2, 2, 0, 3, 3, 3] as Array<Number>; }
        if (nome.equals("done")) { return [0, 0, 1, 0, 0, 1, 1, 1, 2, 1, 0, 2, 0, 3] as Array<Number>; }
        return [] as Array<Number>;
    }
}
