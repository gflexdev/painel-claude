import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;

// Sessões (firmware/src/round/pages.cpp, ListPage): uma linha por sessão em movimento, com o Clawd, o ícone da
// atividade, a palavra do tile e o tempo na situação. UP/DOWN anda pela lista; START ou tocar abre a sessão.
module PaginaSessoes {

    // Medidas do mostrador (466 px).
    const LARGURA = 354;
    const TOPO_LISTA = 88;
    const ALTURA_LINHA = 62;
    const VAO = 7;
    const VISIVEIS = 4;

    // [x, y, largura, altura, índice] de cada linha visível no último desenho.
    var _alvos as Array<Array<Number>> = [] as Array<Array<Number>>;

    // Primeira linha mostrada, para o cursor ficar sempre à vista.
    function primeira(cursor as Number, total as Number) as Number {
        if (total <= VISIVEIS) {
            return 0;
        }
        var inicio = cursor - VISIVEIS + 2;
        if (inicio < 0) {
            inicio = 0;
        }
        return inicio > total - VISIVEIS ? total - VISIVEIS : inicio;
    }

    function desenhar(dc as Graphics.Dc, painel as Painel, cursor as Number, ms as Number) as Void {
        var cx = dc.getWidth() / 2;
        var agora = System.getClockTime();
        Tela.centro(dc, Tela.s(dc, 40), Tela.MONO_PEQ, Cores.TINTA_APAGADA, "SESSÕES", Tela.s(dc, 200));
        Tela.centro(dc, Tela.s(dc, 64), Tela.MONO_PEQ, Cores.TINTA_SUAVE,
            painel.total.toString() + " em movimento · " + Palavras.hora(agora.hour, agora.min), Tela.s(dc, 300));

        _alvos = [] as Array<Array<Number>>;
        var sessoes = painel.sessoes;
        if (sessoes.size() == 0) {
            Tela.centro(dc, dc.getHeight() / 2, Tela.DISP_PEQ, Cores.TINTA_APAGADA, "nada em movimento", Tela.s(dc, 300));
            return;
        }
        var w = Tela.s(dc, LARGURA);
        var h = Tela.s(dc, ALTURA_LINHA);
        var x = cx - w / 2;
        var y = Tela.s(dc, TOPO_LISTA);
        var inicio = primeira(cursor, sessoes.size());
        var fim = inicio + VISIVEIS < sessoes.size() ? inicio + VISIVEIS : sessoes.size();
        for (var i = inicio; i < fim; i++) {
            desenharLinha(dc, sessoes[i], x, y, w, h, i == cursor, ms);
            _alvos.add([x, y, w, h, i]);
            y += h + Tela.s(dc, VAO);
        }
        var depois = sessoes.size() - fim;
        if (depois > 0) {
            Tela.centro(dc, y + Tela.s(dc, 12), Tela.MONO_PEQ, Cores.TINTA_APAGADA, "+" + depois.toString(), Tela.s(dc, 120));
        }
    }

    function desenharLinha(dc as Graphics.Dc, s as Sessao, x as Number, y as Number, w as Number, h as Number,
            escolhida as Boolean, ms as Number) as Void {
        var cor = Cores.daSituacao(s.status);
        var esperando = s.status.equals("waiting");
        var raio = Tela.s(dc, 12);
        var fundo = escolhida ? Cores.TILE_ALTO : esperando ? Cores.tingida(cor) : Cores.LINHA;
        if (esperando) {
            dc.setColor(Cores.misturar(Cores.ESPERANDO, Cores.PRETO, Tela.pulso(ms, 60)), Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x - 1, y - 1, w + 2, h + 2, raio + 1);
        } else if (escolhida) {
            dc.setColor(Cores.TINTA_FRACA, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x - 1, y - 1, w + 2, h + 2, raio + 1);
        }
        // Barra da cor na esquerda: o retângulo colorido por baixo, o fundo por cima, 3 px para a direita.
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y, w, h, raio);
        dc.setColor(fundo, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x + 3, y, w - 3, h, raio);

        var meio = y + h / 2;
        Clawd.desenhar(dc, x + Tela.s(dc, 10), meio - 22, 2, Clawd.humorDe(s.status), cor, fundo,
            Palavras.acessorio(s), cor, ms, -1);

        // Nome com a linha inteira; embaixo, a palavra do tile e, à direita, o tempo na situação.
        var texto = x + Tela.s(dc, 10) + 44 + Tela.s(dc, 8);
        var direita = x + w - Tela.s(dc, 18);
        var esquerda = Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER;
        var nome = s.name.equals("") ? s.id.substring(0, 8) as String : s.name;
        Tela.texto(dc, texto, meio - Tela.s(dc, 12), Tela.DISP_PEQ, Cores.TINTA,
            Tela.cortar(dc, nome, Tela.DISP_PEQ, direita - texto), esquerda);
        var tempo = Palavras.decorrido(s.age);
        var linhaDeBaixo = meio + Tela.s(dc, 14);
        Tela.texto(dc, direita, linhaDeBaixo, Tela.MONO_PEQ, Cores.TINTA_APAGADA, tempo,
            Graphics.TEXT_JUSTIFY_RIGHT | Graphics.TEXT_JUSTIFY_VCENTER);
        var largura = direita - Tela.largura(dc, tempo, Tela.MONO_PEQ) - Tela.s(dc, 10) - texto;
        Tela.texto(dc, texto, linhaDeBaixo, Tela.MONO_PEQ, Cores.suave(cor),
            Tela.cortar(dc, Palavras.tileMaiusculo(s), Tela.MONO_PEQ, largura), esquerda);
    }

    // Índice da sessão tocada, ou -1.
    function tocado(x as Number, y as Number) as Number {
        for (var i = 0; i < _alvos.size(); i++) {
            var a = _alvos[i];
            if (x >= a[0] && x <= a[0] + a[2] && y >= a[1] && y <= a[1] + a[3]) {
                return a[4];
            }
        }
        return -1;
    }
}
