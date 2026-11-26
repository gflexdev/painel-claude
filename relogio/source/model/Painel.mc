import Toybox.Lang;

// Uma janela de limite do plano (5 h ou semana). resetsIn em segundos; -1 = sem dado.
class JanelaUso {
    var percent as Number;
    var resetsIn as Number;

    function initialize(percent as Number, resetsIn as Number) {
        self.percent = percent;
        self.resetsIn = resetsIn;
    }
}

// Uso do plano como o mostrador mostra: 5 h por fora, semana por dentro e limites por modelo.
class Uso {
    var cinco as JanelaUso or Null = null;
    var semana as JanelaUso or Null = null;
    // [rótulo, percentual] de cada limite só de um modelo (ex.: "Fable").
    var escopos as Array<Array> = [] as Array<Array>;

    function initialize() {
    }
}

// Tudo o que uma resposta de GET /api/watch traz.
class Painel {
    var sessoes as Array<Sessao>;
    var total as Number = 0;
    var esperando as Number = 0;
    var rodando as Number = 0;
    var ver as Number = 0;
    var erros as Number = 0;
    var uso as Uso or Null = null;

    function initialize(sessoes as Array<Sessao>) {
        self.sessoes = sessoes;
    }

    function posicaoDe(id as String or Null) as Number {
        if (id != null) {
            for (var i = 0; i < sessoes.size(); i++) {
                if (sessoes[i].id.equals(id)) {
                    return i;
                }
            }
        }
        return -1;
    }

    function sessaoDe(id as String or Null) as Sessao or Null {
        var i = posicaoDe(id);
        return i < 0 ? null : sessoes[i];
    }

    // A mais urgente (a primeira: o servidor manda na ordem da grade), ou null se não há nenhuma.
    function maisUrgente() as Sessao or Null {
        return sessoes.size() > 0 ? sessoes[0] : null;
    }
}
