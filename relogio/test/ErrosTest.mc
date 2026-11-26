import Toybox.Lang;
import Toybox.Test;

(:test)
function duzentosNaoEErro(logger as Logger) as Boolean {
    Test.assert(Erros.mensagem(200, 500) == null);
    return true;
}

(:test)
function tempoEsgotadoRapidoESemTailnet(logger as Logger) as Boolean {
    // No teste de viabilidade, com o Tailscale do celular desligado, o -300 voltou em ~0,3 s.
    Test.assertEqual(Erros.mensagem(-300, 299)[0], "sem tailnet no celular");
    Test.assertEqual(Erros.mensagem(-300, 1999)[0], "sem tailnet no celular");
    Test.assertEqual(Erros.mensagem(-300, 30000)[0], "painel não respondeu");
    return true;
}

(:test)
function errosComNome(logger as Logger) as Boolean {
    Test.assertEqual(Erros.mensagem(-104, 10)[0], "sem celular");
    Test.assertEqual(Erros.mensagem(401, 400)[0], "token inválido");
    Test.assertEqual(Erros.mensagem(-402, 400)[0], "resposta grande");
    Test.assertEqual(Erros.mensagem(-1001, 10)[0], "precisa de https");
    Test.assertEqual(Erros.mensagem(500, 400)[0], "erro 500");
    Test.assertEqual(Erros.mensagem(-2, 400)[0], "erro -2");
    return true;
}

(:test)
function todoErroTemDica(logger as Logger) as Boolean {
    var codigos = [-300, -104, 401, -402, -1001, 500] as Array<Number>;
    for (var i = 0; i < codigos.size(); i++) {
        var mensagem = Erros.mensagem(codigos[i], 100);
        Test.assertEqual(mensagem.size(), 2);
        Test.assert(mensagem[1].length() > 0);
        Test.assert(mensagem[0].length() <= 24);
    }
    return true;
}
