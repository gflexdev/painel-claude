import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Detalhe de uma sessão (firmware/src/round/session_view.cpp): o Clawd dela, o contexto no anel e os números.
// Quem espera você ganha a borda vermelha pulsando e o cartão do pedido, sem botões: o relógio só acompanha.
// UP/DOWN passa para a sessão vizinha; BACK (ou deslizar para baixo) volta.
class DetalheView extends WatchUi.View {

    private var _controle as Controle;

    function initialize(controle as Controle) {
        View.initialize();
        _controle = controle;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Cores.PRETO, Cores.PRETO);
        dc.clear();
        var s = _controle.sessaoEmDetalhe();
        if (s == null) {
            Tela.centro(dc, dc.getHeight() / 2, Tela.DISP_PEQ, Cores.TINTA_APAGADA, "a sessão saiu da lista", Tela.s(dc, 320));
            return;
        }
        var ms = _controle.agora();
        var cx = dc.getWidth() / 2;
        var cy = dc.getHeight() / 2;
        var cor = Cores.daSituacao(s.status);
        var esperando = s.status.equals("waiting");
        var pct = Palavras.contextoPct(s.context);

        if (esperando) {
            // Borda vermelha que pulsa, no lugar do anel.
            Tela.arco(dc, cx, cy, dc.getWidth(), Tela.s(dc, 7), 0, 360,
                Cores.misturar(Cores.ESPERANDO, Cores.PRETO, Tela.pulso(ms, 120)), false);
        } else {
            var diametro = Tela.s(dc, 456);
            var esp = Tela.s(dc, 6);
            Tela.arco(dc, cx, cy, diametro, esp, 0, 360, Cores.TRILHA, false);
            Tela.arco(dc, cx, cy, diametro, esp, -90, -90 + pct * 3.6, cor, true);
        }
        Tela.setaVoltar(dc, Cores.TINTA_APAGADA);

        Tela.pilula(dc, cx, Tela.s(dc, 70), Cores.tingida(cor), cor, Cores.suave(cor),
            Palavras.tileMaiusculo(s) + " · " + Palavras.maiusculas(Palavras.decorrido(s.age)), Tela.MONO_PEQ, Tela.s(dc, 300));

        Clawd.desenhar(dc, cx - Clawd.MEIO_X * 4, Tela.s(dc, 82), 4, Clawd.humorDe(s.status), cor, Cores.PRETO,
            Palavras.acessorio(s), cor, ms, -1);

        var nome = s.name.equals("") ? s.id.substring(0, 8) as String : s.name;
        Tela.texto(dc, cx, Tela.s(dc, 196), Tela.DISP_MED, Cores.TINTA, Tela.quebrar(dc, nome, Tela.DISP_MED, Tela.s(dc, 330), 2),
            Tela.JUSTO_CENTRO);
        Tela.centro(dc, Tela.s(dc, 255), Tela.MONO_PEQ, Cores.TINTA_APAGADA, Palavras.subtitulo(s), Tela.s(dc, 320));

        if (esperando) {
            desenharPedido(dc, s, cor);
        } else {
            desenharNumeros(dc, s, cor, pct);
        }
    }

    // Contexto, pedidos e há quanto tempo está aberta; embaixo, o que está fazendo.
    private function desenharNumeros(dc as Graphics.Dc, s as Sessao, cor as Number, pct as Number) as Void {
        var cx = dc.getWidth() / 2;
        var valores = [Palavras.tokens(s.context), s.turns >= 0 ? s.turns.toString() : "—",
            s.open >= 0 ? Palavras.decorrido(s.open) : "—"] as Array<String>;
        var rotulos = ["contexto", "pedidos", "aberta"] as Array<String>;
        var celula = Tela.s(dc, 104);
        for (var i = 0; i < 3; i++) {
            var x = cx + (i - 1) * celula;
            Tela.texto(dc, x, Tela.s(dc, 290), Tela.MONO_FORTE, i == 0 ? cor : Cores.TINTA, valores[i], Tela.JUSTO_CENTRO);
            Tela.texto(dc, x, Tela.s(dc, 316), Tela.MONO_PEQ, Cores.TINTA_APAGADA, rotulos[i], Tela.JUSTO_CENTRO);
        }
        Tela.centro(dc, Tela.s(dc, 352), Tela.MONO_PEQ, Cores.TINTA_APAGADA, "AGORA", Tela.s(dc, 200));
        Tela.centro(dc, Tela.s(dc, 378), Tela.MONO_MED, Cores.TINTA_AGORA, Palavras.tile(s), Tela.s(dc, 290));
        if (pct > 0) {
            Tela.centro(dc, Tela.s(dc, 410), Tela.MONO_PEQ, Cores.TINTA_APAGADA, pct.toString() + "% do contexto", Tela.s(dc, 240));
        }
    }

    // O cartão do pedido, sem Permitir/Negar: a decisão fica para o Mac ou o celular.
    private function desenharPedido(dc as Graphics.Dc, s as Sessao, cor as Number) as Void {
        var cx = dc.getWidth() / 2;
        var w = Tela.s(dc, 340);
        var h = Tela.s(dc, 112);
        var y = Tela.s(dc, 276);
        dc.setColor(Cores.CAIXA_BORDA, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - w / 2 - 1, y - 1, w + 2, h + 2, Tela.s(dc, 14) + 1);
        dc.setColor(Cores.CAIXA, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - w / 2, y, w, h, Tela.s(dc, 14));
        var corTitulo = s.askKind.equals("question") ? Cores.PERGUNTA : Cores.suave(cor);
        Tela.centro(dc, y + Tela.s(dc, 24), Tela.MONO_PEQ, corTitulo, Palavras.tituloPedido(s), w - Tela.s(dc, 28));
        Tela.texto(dc, cx, y + Tela.s(dc, 72), Tela.DISP_PEQ, Cores.TINTA_SUAVE,
            Tela.quebrar(dc, "responda no Mac ou no celular", Tela.DISP_PEQ, w - Tela.s(dc, 40), 2), Tela.JUSTO_CENTRO);

        var fila = _controle.filaEsperando(s.id);
        var rodape = fila[1] > 1 ? fila[0].toString() + " de " + fila[1].toString() + " esperando você" : "BACK volta";
        Tela.centro(dc, Tela.s(dc, 412), Tela.MONO_PEQ, Cores.TINTA_APAGADA, rodape, Tela.s(dc, 240));
    }
}

class DetalheDelegate extends WatchUi.BehaviorDelegate {

    private var _controle as Controle;

    function initialize(controle as Controle) {
        BehaviorDelegate.initialize();
        _controle = controle;
    }

    function onBack() as Boolean {
        _controle.fecharDetalhe();
        return true;
    }

    function onNextPage() as Boolean {
        return _controle.moverDetalhe(1);
    }

    function onPreviousPage() as Boolean {
        return _controle.moverDetalhe(-1);
    }

    function onSelect() as Boolean {
        return true;
    }

    function onSwipe(evento as WatchUi.SwipeEvent) as Boolean {
        var direcao = evento.getDirection();
        if (direcao == WatchUi.SWIPE_DOWN) {
            _controle.fecharDetalhe();
            return true;
        }
        if (direcao == WatchUi.SWIPE_UP || direcao == WatchUi.SWIPE_LEFT) {
            return _controle.moverDetalhe(1);
        }
        return _controle.moverDetalhe(-1);
    }
}
