import Toybox.Lang;

// Lê a resposta de GET /api/watch: { success, data: { sessions, total, counts, usage? } }.
module Leitura {

    // Painel na ordem do servidor (mais urgente primeiro), ou null se a resposta não tem a lista.
    // Itens sem id ou sem situação conhecida ficam de fora; o resto aceita campos faltando.
    function ler(data as Dictionary or String or Null) as Painel or Null {
        if (!(data instanceof Dictionary)) {
            return null;
        }
        var corpo = data.get("data");
        if (!(corpo instanceof Dictionary)) {
            return null;
        }
        var itens = corpo.get("sessions");
        if (!(itens instanceof Array)) {
            return null;
        }
        var sessoes = [] as Array<Sessao>;
        for (var i = 0; i < itens.size(); i++) {
            var sessao = lerSessao(itens[i]);
            if (sessao != null) {
                sessoes.add(sessao);
            }
        }
        var painel = new Painel(sessoes);
        var contagem = corpo.get("counts");
        if (contagem instanceof Dictionary) {
            painel.esperando = numero(contagem.get("waiting"), 0);
            painel.rodando = numero(contagem.get("working"), 0);
            painel.ver = numero(contagem.get("done"), 0);
            painel.erros = numero(contagem.get("error"), 0);
        }
        painel.total = numero(corpo.get("total"), sessoes.size());
        painel.uso = lerUso(corpo.get("usage"));
        return painel;
    }

    function lerSessao(item) as Sessao or Null {
        if (!(item instanceof Dictionary)) {
            return null;
        }
        var id = texto(item.get("id"));
        var status = texto(item.get("status"));
        if (id.equals("") || !Palavras.situacaoConhecida(status)) {
            return null;
        }
        var s = new Sessao(id, texto(item.get("name")), texto(item.get("project")), status, numero(item.get("age"), 0));
        s.machine = texto(item.get("machine"));
        s.activity = texto(item.get("activity"));
        s.context = numero(item.get("context"), -1);
        s.model = texto(item.get("model"));
        s.turns = numero(item.get("turns"), -1);
        s.open = numero(item.get("open"), -1);
        var ask = item.get("ask");
        if (ask instanceof Dictionary) {
            s.askKind = texto(ask.get("kind"));
            s.askTool = texto(ask.get("tool"));
            s.askCount = numero(ask.get("count"), 1);
        }
        return s;
    }

    function lerUso(valor) as Uso or Null {
        if (!(valor instanceof Dictionary)) {
            return null;
        }
        var uso = new Uso();
        uso.cinco = lerJanela(valor.get("fiveHour"));
        uso.semana = lerJanela(valor.get("sevenDay"));
        var escopos = valor.get("scoped");
        if (escopos instanceof Array) {
            for (var i = 0; i < escopos.size(); i++) {
                var e = escopos[i];
                if (e instanceof Dictionary && e.get("label") instanceof String) {
                    uso.escopos.add([e.get("label"), numero(e.get("percent"), 0)]);
                }
            }
        }
        return uso;
    }

    function lerJanela(valor) as JanelaUso or Null {
        if (!(valor instanceof Dictionary) || !(valor.get("percent") instanceof Number)) {
            return null;
        }
        return new JanelaUso(valor.get("percent") as Number, numero(valor.get("resetsIn"), -1));
    }

    function texto(valor) as String {
        return valor instanceof String ? valor : "";
    }

    function numero(valor, padrao as Number) as Number {
        if (valor instanceof Number) {
            return valor;
        }
        if (valor instanceof Long || valor instanceof Float || valor instanceof Double) {
            return valor.toNumber();
        }
        return padrao;
    }
}
