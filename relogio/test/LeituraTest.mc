import Toybox.Lang;
import Toybox.Test;

(:test)
module Exemplo {
    function resposta() as Dictionary {
        return {
            "success" => true,
            "data" => {
                "sessions" => [
                    {"id" => "a1", "name" => "Corrigir o login", "project" => "painel-claude", "status" => "waiting", "age" => 75,
                        "activity" => "bash", "ask" => {"kind" => "permission", "tool" => "Bash", "count" => 2}},
                    {"id" => "b2", "name" => "Deploy", "project" => "melibee", "status" => "error", "age" => 7200, "machine" => "vps-dev"},
                    {"id" => "c3", "name" => "Refatorar", "project" => "bancada", "status" => "done", "age" => 5, "context" => 841483,
                        "model" => "opus 5.5", "turns" => 19, "open" => 90000, "watched" => true},
                    {"id" => "d4", "name" => "Testes", "project" => "", "status" => "working", "age" => 200000, "activity" => "write",
                        "watched" => "sim"}
                ],
                "total" => 9,
                "counts" => {"waiting" => 1, "working" => 6, "done" => 1, "error" => 1},
                "usage" => {
                    "fiveHour" => {"percent" => 37, "resetsIn" => 7200},
                    "sevenDay" => {"percent" => 48, "resetsIn" => 259200},
                    "scoped" => [{"label" => "Fable", "percent" => 12}]
                }
            }
        };
    }
}

(:test)
function leAsSessoesComOsCamposDoMostrador(logger as Logger) as Boolean {
    var p = Leitura.ler(Exemplo.resposta());
    Test.assert(p != null);
    Test.assertEqual(p.sessoes.size(), 4);
    var a = p.sessoes[0];
    Test.assertEqual(a.status, "waiting");
    Test.assertEqual(a.askKind, "permission");
    Test.assertEqual(a.askTool, "Bash");
    Test.assertEqual(a.askCount, 2);
    Test.assertEqual(a.context, -1);
    var c = p.sessoes[2];
    Test.assertEqual(c.context, 841483);
    Test.assertEqual(c.model, "opus 5.5");
    Test.assertEqual(c.turns, 19);
    Test.assertEqual(c.open, 90000);
    Test.assertEqual(p.sessoes[1].machine, "vps-dev");
    return true;
}

(:test)
function leContagemEUso(logger as Logger) as Boolean {
    var p = Leitura.ler(Exemplo.resposta());
    Test.assertEqual(p.total, 9);
    Test.assertEqual(p.rodando, 6);
    Test.assertEqual(p.esperando, 1);
    Test.assertEqual(p.uso.cinco.percent, 37);
    Test.assertEqual(p.uso.cinco.resetsIn, 7200);
    Test.assertEqual(p.uso.semana.percent, 48);
    Test.assertEqual(p.uso.escopos.size(), 1);
    Test.assertEqual(p.uso.escopos[0][0], "Fable");
    return true;
}

(:test)
function semListaDevolveNull(logger as Logger) as Boolean {
    Test.assert(Leitura.ler(null) == null);
    Test.assert(Leitura.ler("texto") == null);
    Test.assert(Leitura.ler({"success" => false, "error" => "token inválido"}) == null);
    Test.assert(Leitura.ler({"data" => {"sessions" => "x"}}) == null);
    return true;
}

(:test)
function listaVaziaSemUsoNaoEErro(logger as Logger) as Boolean {
    var p = Leitura.ler({"success" => true, "data" => {"sessions" => []}});
    Test.assert(p != null);
    Test.assertEqual(p.sessoes.size(), 0);
    Test.assertEqual(p.total, 0);
    Test.assert(p.uso == null);
    Test.assert(p.maisUrgente() == null);
    return true;
}

(:test)
function deixaDeForaItensEstranhos(logger as Logger) as Boolean {
    var p = Leitura.ler({"data" => {"sessions" => [
        {"id" => "ok", "status" => "working"},
        {"id" => "", "status" => "working"},
        {"id" => "x", "status" => "ended"},
        "nao-e-sessao",
        {"status" => "waiting"}
    ]}});
    Test.assertEqual(p.sessoes.size(), 1);
    Test.assertEqual(p.sessoes[0].name, "");
    Test.assertEqual(p.sessoes[0].age, 0);
    Test.assertEqual(p.total, 1);
    return true;
}

(:test)
function achaSessaoPeloId(logger as Logger) as Boolean {
    var p = Leitura.ler(Exemplo.resposta());
    Test.assertEqual(p.posicaoDe("c3"), 2);
    Test.assertEqual(p.posicaoDe("sumiu"), -1);
    Test.assertEqual(p.posicaoDe(null), -1);
    Test.assertEqual(p.sessaoDe("b2").name, "Deploy");
    Test.assertEqual(p.maisUrgente().id, "a1");
    return true;
}

(:test)
function marcaDeVigiadaNasLinhas(logger as Logger) as Boolean {
    var p = Leitura.ler(Exemplo.resposta());
    // Só a que vem com watched: true leva a marca; sem o campo, ou com outro valor, não.
    Test.assert(!p.sessoes[0].watched);
    Test.assert(!p.sessoes[1].watched);
    Test.assert(p.sessoes[2].watched);
    Test.assert(!p.sessoes[3].watched);
    // O START no detalhe: a resposta do painel diz como ficou, e a marca muda só naquela linha.
    Test.assertEqual(Leitura.vigiada({"success" => true, "data" => {"id" => "a1", "watched" => true}}), true);
    Test.assertEqual(Leitura.vigiada({"success" => true, "data" => {"id" => "c3", "watched" => false}}), false);
    Test.assert(Leitura.vigiada({"success" => true, "data" => {"id" => "a1"}}) == null);
    Test.assert(Leitura.vigiada("x") == null);
    Test.assert(p.fixarVigia("a1", true));
    Test.assert(p.sessoes[0].watched);
    Test.assert(p.fixarVigia("c3", false));
    Test.assert(!p.sessoes[2].watched);
    Test.assert(!p.sessoes[1].watched);
    Test.assert(!p.fixarVigia("sumiu", true));
    return true;
}
