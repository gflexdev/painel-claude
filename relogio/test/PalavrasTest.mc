import Toybox.Lang;
import Toybox.Test;

(:test)
function palavraDoTileComoNoMostrador(logger as Logger) as Boolean {
    var p = Leitura.ler(Exemplo.resposta());
    Test.assertEqual(Palavras.tileMaiusculo(p.sessoes[0]), "APROVAR? (2)");
    Test.assertEqual(Palavras.tileMaiusculo(p.sessoes[1]), "ERRO");
    Test.assertEqual(Palavras.tileMaiusculo(p.sessoes[2]), "TERMINOU · VER");
    Test.assertEqual(Palavras.tileMaiusculo(p.sessoes[3]), "EDITANDO");
    var s = new Sessao("x", "", "", "waiting", 0);
    s.askKind = "plan";
    s.askCount = 1;
    Test.assertEqual(Palavras.tile(s), "aprovar plano");
    s.askKind = "question";
    Test.assertEqual(Palavras.tile(s), "responder");
    s.askKind = "";
    Test.assertEqual(Palavras.tile(s), "esperando você");
    var rodando = new Sessao("y", "", "", "working", 0);
    Test.assertEqual(Palavras.tile(rodando), "rodando");
    return true;
}

(:test)
function maiusculasComAcento(logger as Logger) as Boolean {
    Test.assertEqual(Palavras.maiusculas("esperando você"), "ESPERANDO VOCÊ");
    Test.assertEqual(Palavras.maiusculas("só fable · ação"), "SÓ FABLE · AÇÃO");
    return true;
}

(:test)
function decorridoComoNoMostrador(logger as Logger) as Boolean {
    Test.assertEqual(Palavras.decorrido(0), "agora");
    Test.assertEqual(Palavras.decorrido(9), "agora");
    Test.assertEqual(Palavras.decorrido(42), "42s");
    Test.assertEqual(Palavras.decorrido(180), "3 min");
    Test.assertEqual(Palavras.decorrido(7500), "2 h 05");
    Test.assertEqual(Palavras.decorrido(200000), "2 d");
    return true;
}

(:test)
function tokensCurtos(logger as Logger) as Boolean {
    Test.assertEqual(Palavras.tokens(84213), "84k");
    Test.assertEqual(Palavras.tokens(1250000), "1,3M");
    Test.assertEqual(Palavras.tokens(-1), "—");
    return true;
}

(:test)
function acessorioDaAtividade(logger as Logger) as Boolean {
    var p = Leitura.ler(Exemplo.resposta());
    Test.assertEqual(Palavras.acessorio(p.sessoes[0]), "bash");
    Test.assertEqual(Palavras.acessorio(p.sessoes[1]), "");
    Test.assertEqual(Palavras.acessorio(p.sessoes[2]), "done");
    Test.assertEqual(Palavras.acessorio(new Sessao("z", "", "", "working", 0)), "think");
    return true;
}

(:test)
function contextoNaJanelaCertaDoModelo(logger as Logger) as Boolean {
    Test.assertEqual(Palavras.contextoPct(-1), 0);
    Test.assertEqual(Palavras.contextoPct(100000), 50);
    Test.assertEqual(Palavras.contextoPct(841483), 84);
    Test.assertEqual(Palavras.contextoPct(5000000), 100);
    return true;
}

(:test)
function ritmoDoUso(logger as Logger) as Boolean {
    Test.assertEqual(Palavras.fracaoPassada(-1, Palavras.CINCO_HORAS), -1.0);
    Test.assertEqual(Palavras.fracaoPassada(9000, Palavras.CINCO_HORAS), 0.5);
    Test.assertEqual(Palavras.ritmo(37, 0.5), "no ritmo fecha em ~74%");
    Test.assertEqual(Palavras.ritmo(80, 0.5), "acaba antes de zerar");
    Test.assertEqual(Palavras.ritmo(5, 0.05), "começou agora");
    Test.assertEqual(Palavras.ritmo(5, -1.0), "");
    Test.assert(Palavras.semanaNoRitmo(48, 0.5));
    Test.assert(!Palavras.semanaNoRitmo(60, 0.5));
    return true;
}

(:test)
function textosDoDetalhe(logger as Logger) as Boolean {
    var p = Leitura.ler(Exemplo.resposta());
    Test.assertEqual(Palavras.subtitulo(p.sessoes[2]), "bancada · opus 5.5");
    Test.assertEqual(Palavras.subtitulo(p.sessoes[1]), "melibee · vps-dev");
    Test.assertEqual(Palavras.tituloPedido(p.sessoes[0]), "PEDE PERMISSÃO · BASH");
    Test.assertEqual(Palavras.hora(9, 5), "09:05");
    Test.assertEqual(Palavras.dia(5), "qui");
    return true;
}

(:test)
function coresDasSituacoes(logger as Logger) as Boolean {
    Test.assertEqual(Cores.daSituacao("done"), Cores.VER);
    Test.assertEqual(Cores.daSituacao("waiting"), Cores.ESPERANDO);
    Test.assertEqual(Cores.misturar(0xFFFFFF, 0x000000, 255), 0xFFFFFF);
    Test.assertEqual(Cores.misturar(0xFFFFFF, 0x000000, 0), 0x000000);
    Test.assertEqual(Cores.misturar(0xFF0000, 0x000000, 51), 0x330000);
    Test.assertEqual(Cores.doUso(91, Cores.RODANDO), Cores.ESPERANDO);
    return true;
}

(:test)
function linhaDaVigiaNoDetalhe(logger as Logger) as Boolean {
    var s = new Sessao("x", "", "", "working", 0);
    Test.assertEqual(Palavras.rotuloVigia(s, false), "START vigia");
    Test.assertEqual(Palavras.rotuloVigia(s, true), "vigiando…");
    s.watched = true;
    Test.assertEqual(Palavras.rotuloVigia(s, false), "vigiada · START para");
    Test.assertEqual(Palavras.rotuloVigia(s, true), "parando de vigiar…");
    return true;
}
