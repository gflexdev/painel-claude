import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// O carrossel do mostrador: Visão geral, Sessões e Uso do plano, com as bolinhas embaixo.
// Deslizar para o lado (ou UP/DOWN) troca de página. Sem dado ainda, mostra a tela de estado.
class PainelView extends WatchUi.View {

    const PAGINAS = 3;

    private var _controle as Controle;

    function initialize(controle as Controle) {
        View.initialize();
        _controle = controle;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Cores.PRETO, Cores.PRETO);
        dc.clear();
        var painel = _controle.painel;
        var erro = _controle.erro;
        var ms = _controle.agora();
        if (painel == null) {
            desenharEstado(dc, erro, ms);
            return;
        }
        var pagina = _controle.pagina;
        if (pagina == 0) {
            PaginaGeral.desenhar(dc, painel, ms, _controle.pulo());
        } else if (pagina == 1) {
            PaginaSessoes.desenhar(dc, painel, _controle.cursor, ms);
        } else {
            PaginaUso.desenhar(dc, painel.uso);
        }
        Tela.bolinhas(dc, PAGINAS, pagina);
        if (erro != null) {
            // A lista velha fica; o erro vai numa pílula vermelha no topo.
            Tela.pilula(dc, dc.getWidth() / 2, Tela.s(dc, 36), Cores.tingida(Cores.ESPERANDO), Cores.ESPERANDO,
                Cores.suave(Cores.ESPERANDO), erro[0], Tela.MONO_PEQ, Tela.s(dc, 240));
        }
    }

    // "Mac sem resposta", token recusado, sem tailnet…: o Clawd apagado, o motivo e o que fazer.
    private function desenharEstado(dc as Graphics.Dc, erro as Array<String> or Null, ms as Number) as Void {
        var cx = dc.getWidth() / 2;
        var buscando = erro == null;
        Clawd.desenhar(dc, cx - Clawd.MEIO_X * 4, Tela.s(dc, 96), 4, buscando ? Clawd.DORMINDO : Clawd.ENCERRADA,
            Cores.TINTA_FRACA, Cores.PRETO, "", 0, ms, -1);
        var titulo = buscando ? "conectando…" : erro[0];
        var dica = buscando ? "buscando as sessões no Mac" : erro[1];
        Tela.texto(dc, cx, Tela.s(dc, 252), Tela.DISP_MED, buscando ? Cores.TINTA : Cores.suave(Cores.ESPERANDO),
            Tela.quebrar(dc, titulo, Tela.DISP_MED, Tela.s(dc, 330), 2), Tela.JUSTO_CENTRO);
        Tela.centro(dc, Tela.s(dc, 312), Tela.MONO_PEQ, Cores.TINTA_APAGADA, dica, Tela.s(dc, 320));
        if (!buscando) {
            Tela.centro(dc, Tela.s(dc, 344), Tela.MONO_PEQ, Cores.TINTA_FRACA, "tenta de novo a cada 10 s", Tela.s(dc, 300));
        }
    }
}

class PainelDelegate extends WatchUi.BehaviorDelegate {

    private var _controle as Controle;

    function initialize(controle as Controle) {
        BehaviorDelegate.initialize();
        _controle = controle;
    }

    // DOWN: na lista, desce o cursor; no fim dela (e nas outras páginas), vai para a próxima página.
    function onNextPage() as Boolean {
        if (_controle.pagina == 1 && _controle.moverCursor(1)) {
            return true;
        }
        _controle.mudarPagina(1);
        return true;
    }

    function onPreviousPage() as Boolean {
        if (_controle.pagina == 1 && _controle.moverCursor(-1)) {
            return true;
        }
        _controle.mudarPagina(-1);
        return true;
    }

    // O comportamento vem antes do evento bruto: devolvendo false aqui, o START chega em onKey e o toque em
    // onTap, com as coordenadas (para saber qual Clawd ou linha foi tocada).
    function onSelect() as Boolean {
        return false;
    }

    // START: na Visão geral o Clawd pula; na lista abre a sessão do cursor; no uso busca de novo.
    function onKey(evento as WatchUi.KeyEvent) as Boolean {
        if (evento.getKey() != WatchUi.KEY_ENTER) {
            return false;
        }
        if (_controle.pagina == 0) {
            _controle.cutucar();
        } else if (_controle.pagina == 1) {
            _controle.abrirCursor();
        } else {
            _controle.buscar();
        }
        return true;
    }

    function onSwipe(evento as WatchUi.SwipeEvent) as Boolean {
        var direcao = evento.getDirection();
        if (direcao == WatchUi.SWIPE_LEFT) {
            _controle.mudarPagina(1);
        } else if (direcao == WatchUi.SWIPE_RIGHT) {
            _controle.mudarPagina(-1);
        } else if (_controle.pagina == 1) {
            _controle.moverCursor(direcao == WatchUi.SWIPE_UP ? 1 : -1);
        } else {
            _controle.mudarPagina(direcao == WatchUi.SWIPE_UP ? 1 : -1);
        }
        return true;
    }

    function onTap(evento as WatchUi.ClickEvent) as Boolean {
        var xy = evento.getCoordinates();
        var painel = _controle.painel;
        if (painel == null) {
            _controle.buscar();
            return true;
        }
        if (_controle.pagina == 0) {
            var alvo = PaginaGeral.tocado(xy[0], xy[1]);
            if (alvo >= 0) {
                _controle.abrirDetalhe(painel.sessoes[alvo].id);
            } else if (alvo == -2) {
                _controle.cutucar();
            }
        } else if (_controle.pagina == 1) {
            var linha = PaginaSessoes.tocado(xy[0], xy[1]);
            if (linha >= 0) {
                _controle.cursor = linha;
                _controle.abrirDetalhe(painel.sessoes[linha].id);
            }
        }
        return true;
    }
}
