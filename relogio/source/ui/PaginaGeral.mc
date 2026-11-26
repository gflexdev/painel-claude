import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;

// Visão geral (firmware/src/round/pages.cpp, OverviewPage): o Mapa em órbita, com um Clawd por sessão em
// movimento (até 8) e o Clawd grande no meio, na situação mais urgente. A Sessão vigiada leva o ◉ embaixo, à
// direita do Clawd. Tocar num Clawd da órbita abre a sessão; tocar no do meio faz ele pular com um coração.
module PaginaGeral {

    // Medidas do mostrador (466 px).
    const ORBITA = 129;
    const PONTOS_ORBITA = 40;
    const ORBE = 52;
    const NUCLEO = 138;
    const LINHA_DE = 70;
    const LINHA_ATE = 101;
    const MAX_ORBES = 8;

    // Onde ficou cada Clawd da órbita no último desenho: [x, y, raio, índice da sessão].
    var _alvos as Array<Array<Number>> = [] as Array<Array<Number>>;
    var _nucleo as Array<Number> = [0, 0, 0] as Array<Number>;

    function desenhar(dc as Graphics.Dc, painel as Painel, ms as Number, pulo as Number) as Void {
        var cx = dc.getWidth() / 2;
        var cy = dc.getHeight() / 2;
        var orbita = Tela.s(dc, ORBITA);

        dc.setColor(Cores.ORBITA, Graphics.COLOR_TRANSPARENT);
        for (var i = 0; i < PONTOS_ORBITA; i++) {
            var a = 360.0 * i / PONTOS_ORBITA;
            dc.fillRectangle(Tela.px(cx, orbita, a) - 1, Tela.py(cy, orbita, a) - 1, 2, 2);
        }

        var sessoes = painel.sessoes;
        var n = sessoes.size() < MAX_ORBES ? sessoes.size() : MAX_ORBES;
        _alvos = [] as Array<Array<Number>>;
        // Linhas primeiro, para os círculos ficarem por cima.
        for (var i = 0; i < n; i++) {
            var a = -90.0 + 360.0 * i / n;
            var esperando = sessoes[i].status.equals("waiting");
            dc.setColor(Cores.misturar(Cores.daSituacao(sessoes[i].status), Cores.PRETO, esperando ? 190 : 115),
                Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(2);
            dc.drawLine(Tela.px(cx, Tela.s(dc, LINHA_DE), a), Tela.py(cy, Tela.s(dc, LINHA_DE), a),
                Tela.px(cx, Tela.s(dc, LINHA_ATE), a), Tela.py(cy, Tela.s(dc, LINHA_ATE), a));
            dc.setPenWidth(1);
        }
        for (var i = 0; i < n; i++) {
            var a = -90.0 + 360.0 * i / n;
            desenharOrbe(dc, sessoes[i], Tela.px(cx, orbita, a), Tela.py(cy, orbita, a), ms);
            _alvos.add([Tela.px(cx, orbita, a), Tela.py(cy, orbita, a), Tela.s(dc, ORBE) / 2 + 4, i]);
        }

        desenharNucleo(dc, painel, cx, cy, ms, pulo);
        desenharRelogio(dc, cx);
        desenharContadores(dc, painel, cx);
    }

    function desenharOrbe(dc as Graphics.Dc, sessao as Sessao, x as Number, y as Number, ms as Number) as Void {
        var cor = Cores.daSituacao(sessao.status);
        var r = Tela.s(dc, ORBE) / 2;
        var esperando = sessao.status.equals("waiting");
        if (esperando) {
            // Contorno que pulsa, por fora da borda.
            dc.setColor(Cores.misturar(Cores.ESPERANDO, Cores.PRETO, Tela.pulso(ms, 60)), Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x, y, r + 4);
        }
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x, y, r);
        dc.setColor(Cores.CAIXA, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x, y, r - 2);
        // Clawd de 2 px por pixel: o meio do corpo cai no meio do círculo.
        Clawd.desenhar(dc, x - 2 - Clawd.MEIO_X * 2, y - 22, 2, Clawd.humorDe(sessao.status), cor, Cores.CAIXA, "", 0,
            ms, -1);
        if (esperando) {
            var selo = Tela.s(dc, 18) / 2;
            var sx = x + r - Tela.s(dc, 5);
            var sy = y - r + Tela.s(dc, 1);
            dc.setColor(Cores.ESPERANDO, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(sx, sy, selo);
            Tela.texto(dc, sx, sy, Tela.MONO_PEQ, Cores.SELO_TINTA, "!", Tela.JUSTO_CENTRO);
        }
        if (sessao.watched) {
            // Embaixo, à direita (o "!" de quem espera fica em cima), com uma borda preta para soltar do círculo.
            var marca = Tela.s(dc, 8);
            var mx = x + r - Tela.s(dc, 5);
            var my = y + r - Tela.s(dc, 5);
            dc.setColor(Cores.PRETO, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(mx, my, marca + 2);
            Tela.marcaVigia(dc, mx, my, marca, Cores.PRETO);
        }
    }

    function desenharNucleo(dc as Graphics.Dc, painel as Painel, cx as Number, cy as Number, ms as Number, pulo as Number) as Void {
        var r = Tela.s(dc, NUCLEO) / 2;
        var urgente = painel.maisUrgente();
        var brilho = urgente == null ? Cores.PARADA : Cores.daSituacao(urgente.status);
        // Brilho em volta, na cor da situação mais urgente (a sombra do mostrador).
        var halo = [[14, 12], [10, 20], [6, 32], [3, 48]] as Array<Array<Number>>;
        for (var i = 0; i < halo.size(); i++) {
            dc.setColor(Cores.misturar(brilho, Cores.PRETO, halo[i][1]), Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(cx, cy, r + halo[i][0]);
        }
        dc.setColor(Cores.ORBITA, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, r + 1);
        dc.setColor(Cores.NUCLEO, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, r);
        _nucleo = [cx, cy, r] as Array<Number>;

        var topo = cy - r;
        var humor = urgente == null ? Clawd.DORMINDO : Clawd.humorDe(urgente.status);
        Clawd.desenhar(dc, cx - Clawd.MEIO_X * 3, topo + Tela.s(dc, 6), 3, humor, brilho, Cores.NUCLEO, "", 0, ms, pulo);

        Tela.texto(dc, cx, topo + Tela.s(dc, 76), Tela.DISP_GRANDE, Cores.TINTA, painel.total.toString(), Tela.JUSTO_CENTRO);
        Tela.texto(dc, cx, topo + Tela.s(dc, 104), Tela.MONO_PEQ, Cores.TINTA_APAGADA,
            painel.total == 0 ? "tudo parado" : "em movimento", Tela.JUSTO_CENTRO);
    }

    // Hora do relógio no topo (o mostrador mostra a hora do Mac; aqui é a mesma).
    function desenharRelogio(dc as Graphics.Dc, cx as Number) as Void {
        var agora = System.getClockTime();
        Tela.texto(dc, cx, Tela.s(dc, 34), Tela.MONO_FORTE, Cores.TINTA_SUAVE, Palavras.hora(agora.hour, agora.min),
            Tela.JUSTO_CENTRO);
    }

    // "2 esperando  3 rodando  1 ver": só as que têm alguém. Se não couber, ficam só os números.
    function desenharContadores(dc as Graphics.Dc, painel as Painel, cx as Number) as Void {
        var numeros = [painel.esperando, painel.rodando, painel.ver, painel.erros] as Array<Number>;
        var palavras = ["esperando", "rodando", "ver", "erro"] as Array<String>;
        var cores = [Cores.ESPERANDO, Cores.RODANDO, Cores.VER, Cores.ERRO] as Array<Number>;
        var y = Tela.s(dc, 398);
        var vao = Tela.s(dc, 14);
        var colado = Tela.s(dc, 5);
        var comPalavras = largura(dc, numeros, palavras, true, vao, colado) <= Tela.s(dc, 300);
        var x = cx - largura(dc, numeros, palavras, comPalavras, vao, colado) / 2;
        var esquerda = Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER;
        for (var i = 0; i < numeros.size(); i++) {
            if (numeros[i] == 0) {
                continue;
            }
            var n = numeros[i].toString();
            Tela.texto(dc, x, y, Tela.DISP_MED, cores[i], n, esquerda);
            x += Tela.largura(dc, n, Tela.DISP_MED);
            if (comPalavras) {
                Tela.texto(dc, x + colado, y + 2, Tela.MONO_PEQ, Cores.TINTA_APAGADA, palavras[i], esquerda);
                x += colado + Tela.largura(dc, palavras[i], Tela.MONO_PEQ);
            }
            x += vao;
        }
    }

    function largura(dc as Graphics.Dc, numeros as Array<Number>, palavras as Array<String>, comPalavras as Boolean,
            vao as Number, colado as Number) as Number {
        var total = 0;
        for (var i = 0; i < numeros.size(); i++) {
            if (numeros[i] == 0) {
                continue;
            }
            total += Tela.largura(dc, numeros[i].toString(), Tela.DISP_MED) + vao;
            if (comPalavras) {
                total += colado + Tela.largura(dc, palavras[i], Tela.MONO_PEQ);
            }
        }
        return total > 0 ? total - vao : 0;
    }

    // Índice da sessão tocada, -2 se foi no Clawd do meio, -1 se em nada.
    function tocado(x as Number, y as Number) as Number {
        for (var i = 0; i < _alvos.size(); i++) {
            var alvo = _alvos[i];
            if (perto(x, y, alvo[0], alvo[1], alvo[2])) {
                return alvo[3];
            }
        }
        return perto(x, y, _nucleo[0], _nucleo[1], _nucleo[2]) ? -2 : -1;
    }

    function perto(x as Number, y as Number, ax as Number, ay as Number, r as Number) as Boolean {
        var dx = x - ax;
        var dy = y - ay;
        return dx * dx + dy * dy <= r * r;
    }
}
