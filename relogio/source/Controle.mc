import Toybox.Attention;
import Toybox.Lang;
import Toybox.PersistedContent;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;

// Estado do app: o último painel, o erro da última busca, a página, o cursor da lista e a sessão em detalhe.
// Busca a cada 10 s e anima a 8 quadros por segundo, só com o app aberto.
// Quando uma sessão passa a esperar você, o relógio vibra (o "plim-plim" do mostrador) e abre o detalhe dela.
class Controle {

    const BUSCA_MS = 10000;
    const QUADRO_MS = 125;
    const PAGINAS = 3;

    var painel as Painel or Null = null;
    var erro as Array<String> or Null = null;
    var pagina as Number = 0;
    var cursor as Number = 0;
    var detalheId as String or Null = null;

    private var _client as PainelClient;
    private var _busca as Timer.Timer;
    private var _quadro as Timer.Timer;
    private var _buscando as Boolean = false;
    private var _inicioMs as Number = 0;
    private var _cutucouEm as Number = -1;
    private var _ultimoSegundo as Number = 0;
    private var _esperando as Dictionary<String, Boolean> = {} as Dictionary<String, Boolean>;
    private var _primeiraResposta as Boolean = true;

    function initialize() {
        _client = new PainelClient();
        _busca = new Timer.Timer();
        _quadro = new Timer.Timer();
    }

    function iniciar() as Void {
        _ultimoSegundo = agora();
        buscar();
        _busca.start(method(:buscar), BUSCA_MS, true);
        _quadro.start(method(:aoQuadro), QUADRO_MS, true);
    }

    function parar() as Void {
        _busca.stop();
        _quadro.stop();
    }

    function agora() as Number {
        return System.getTimer();
    }

    // Uma busca por vez: se a anterior ainda não voltou, espera a próxima rodada.
    function buscar() as Void {
        if (_buscando) {
            return;
        }
        _buscando = true;
        _inicioMs = agora();
        _client.buscarLista(method(:aoResponder));
    }

    // A cada quadro: redesenha e, a cada segundo, avança os tempos das sessões (o servidor manda a cada 10 s).
    function aoQuadro() as Void {
        var p = painel;
        var passou = (agora() - _ultimoSegundo) / 1000;
        if (p != null && passou > 0) {
            for (var i = 0; i < p.sessoes.size(); i++) {
                p.sessoes[i].age += passou;
            }
            _ultimoSegundo += passou * 1000;
        }
        WatchUi.requestUpdate();
    }

    function aoResponder(codigo as Number, data as Dictionary or String or PersistedContent.Iterator or Null) as Void {
        _buscando = false;
        var demora = agora() - _inicioMs;
        var lido = codigo == 200 ? Leitura.ler(data instanceof Dictionary ? data : null) : null;
        if (lido == null) {
            // 200 sem a lista conta como resposta estranha; o painel antigo fica na tela com o erro em cima.
            erro = codigo == 200 ? ["resposta estranha", "atualize o painel"] : Erros.mensagem(codigo, demora);
            WatchUi.requestUpdate();
            return;
        }
        var focada = sessaoNoCursor();
        painel = lido;
        erro = null;
        _ultimoSegundo = agora();
        var novoCursor = lido.posicaoDe(focada == null ? null : focada.id);
        cursor = novoCursor >= 0 ? novoCursor : (cursor < lido.sessoes.size() ? cursor : 0);
        if (detalheId != null && lido.posicaoDe(detalheId) < 0) {
            fecharDetalhe();
        }
        verPedidosNovos(lido);
        WatchUi.requestUpdate();
    }

    // Pedido novo: vibra e abre a sessão, sem atropelar outro pedido que você está lendo.
    // Ao abrir o app, quem já esperava não vibra de novo.
    function verPedidosNovos(p as Painel) as Void {
        var agoraEsperando = {} as Dictionary<String, Boolean>;
        var novo = null;
        for (var i = 0; i < p.sessoes.size(); i++) {
            var s = p.sessoes[i];
            if (!s.status.equals("waiting")) {
                continue;
            }
            agoraEsperando.put(s.id, true);
            if (novo == null && !_esperando.hasKey(s.id)) {
                novo = s.id;
            }
        }
        _esperando = agoraEsperando;
        var primeira = _primeiraResposta;
        _primeiraResposta = false;
        if (novo == null || primeira) {
            return;
        }
        avisar();
        var aberta = sessaoEmDetalhe();
        if (aberta == null || !aberta.status.equals("waiting")) {
            abrirDetalhe(novo);
        }
    }

    // "Plim-plim" no pulso: duas vibrações curtas e, se o relógio tiver, um bip.
    function avisar() as Void {
        if (Attention has :vibrate) {
            Attention.vibrate([
                new Attention.VibeProfile(80, 160),
                new Attention.VibeProfile(0, 110),
                new Attention.VibeProfile(80, 160)
            ] as Array<Attention.VibeProfile>);
        }
        if (Attention has :playTone) {
            Attention.playTone(Attention.TONE_ALERT_HI);
        }
    }

    // O pulo com coração do Clawd do meio.
    function cutucar() as Void {
        _cutucouEm = agora();
    }

    function pulo() as Number {
        return _cutucouEm < 0 ? -1 : agora() - _cutucouEm;
    }

    function mudarPagina(passo as Number) as Void {
        pagina = (pagina + passo + PAGINAS) % PAGINAS;
        WatchUi.requestUpdate();
    }

    // Anda o cursor da lista; false se já estava na ponta (aí quem chamou troca de página).
    function moverCursor(passo as Number) as Boolean {
        var p = painel;
        if (p == null) {
            return false;
        }
        var proximo = cursor + passo;
        if (proximo < 0 || proximo >= p.sessoes.size()) {
            return false;
        }
        cursor = proximo;
        WatchUi.requestUpdate();
        return true;
    }

    function sessaoNoCursor() as Sessao or Null {
        var p = painel;
        if (p == null || cursor >= p.sessoes.size()) {
            return null;
        }
        return p.sessoes[cursor];
    }

    function abrirCursor() as Void {
        var s = sessaoNoCursor();
        if (s != null) {
            abrirDetalhe(s.id);
        }
    }

    function abrirDetalhe(id as String) as Void {
        var jaAberto = detalheId != null;
        detalheId = id;
        if (!jaAberto) {
            WatchUi.pushView(new DetalheView(self), new DetalheDelegate(self), WatchUi.SLIDE_UP);
        }
        WatchUi.requestUpdate();
    }

    function fecharDetalhe() as Void {
        if (detalheId == null) {
            return;
        }
        detalheId = null;
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function sessaoEmDetalhe() as Sessao or Null {
        var p = painel;
        return p == null ? null : p.sessaoDe(detalheId);
    }

    // Passa o detalhe para a sessão vizinha, dando a volta na lista.
    function moverDetalhe(passo as Number) as Boolean {
        var p = painel;
        if (p == null || p.sessoes.size() < 2) {
            return true;
        }
        var i = p.posicaoDe(detalheId);
        var total = p.sessoes.size();
        detalheId = p.sessoes[((i < 0 ? 0 : i) + passo + total) % total].id;
        WatchUi.requestUpdate();
        return true;
    }

    // [posição desta sessão entre as que esperam você (1, 2…), quantas esperam].
    function filaEsperando(id as String) as Array<Number> {
        var p = painel;
        var posicao = 0;
        var total = 0;
        if (p != null) {
            for (var i = 0; i < p.sessoes.size(); i++) {
                if (p.sessoes[i].status.equals("waiting")) {
                    total += 1;
                    if (p.sessoes[i].id.equals(id)) {
                        posicao = total;
                    }
                }
            }
        }
        return [posicao, total] as Array<Number>;
    }
}
