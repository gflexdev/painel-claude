import Toybox.Lang;
import Toybox.Test;

// As poses têm de bater com as do mostrador (firmware/src/app/clawd.cpp), quadro a quadro.

(:test)
function piscaNoFimDoCiclo(logger as Logger) as Boolean {
    Test.assertEqual(Clawd.pose(Clawd.RODANDO, 0, -1)[Clawd.P_OLHOS], Clawd.ABERTOS);
    Test.assertEqual(Clawd.pose(Clawd.RODANDO, 3700, -1)[Clawd.P_OLHOS], Clawd.PISCANDO);
    return true;
}

(:test)
function rodandoMexeAsPernasEmTempos(logger as Logger) as Boolean {
    Test.assertEqual(Clawd.pose(Clawd.RODANDO, 0, -1)[Clawd.P_PERNAS_A], 0);
    Test.assertEqual(Clawd.pose(Clawd.RODANDO, 0, -1)[Clawd.P_PERNAS_B], -1);
    Test.assertEqual(Clawd.pose(Clawd.RODANDO, 230, -1)[Clawd.P_PERNAS_A], -1);
    Test.assertEqual(Clawd.pose(Clawd.RODANDO, 230, -1)[Clawd.P_PERNAS_B], 0);
    return true;
}

(:test)
function esperandoPulaEAcena(logger as Logger) as Boolean {
    var parado = Clawd.pose(Clawd.ESPERANDO, 0, -1);
    Test.assertEqual(parado[Clawd.P_Y], 0);
    Test.assertEqual(parado[Clawd.P_BOCA], 1);
    var noAr = Clawd.pose(Clawd.ESPERANDO, 1050, -1);
    Test.assertEqual(noAr[Clawd.P_Y], -3);
    Test.assertEqual(noAr[Clawd.P_CHAO_MENOR], 3);
    return true;
}

(:test)
function erroTemOlhosDeX(logger as Logger) as Boolean {
    Test.assertEqual(Clawd.pose(Clawd.ERRO, 0, -1)[Clawd.P_OLHOS], Clawd.X);
    Test.assertEqual(Clawd.pose(Clawd.ERRO, 2010, -1)[Clawd.P_X], -1);
    return true;
}

(:test)
function dormindoTemZzzEEncerradaNao(logger as Logger) as Boolean {
    Test.assertEqual(Clawd.pose(Clawd.DORMINDO, 1000, -1)[Clawd.P_Z], 1);
    Test.assertEqual(Clawd.pose(Clawd.DORMINDO, 1000, -1)[Clawd.P_OLHOS], Clawd.FECHADOS);
    Test.assertEqual(Clawd.pose(Clawd.ENCERRADA, 1000, -1)[Clawd.P_Z], 0);
    return true;
}

(:test)
function toquePulaComCoracao(logger as Logger) as Boolean {
    var pulo = Clawd.pose(Clawd.DORMINDO, 1000, 300);
    Test.assertEqual(pulo[Clawd.P_CORACAO], 1);
    Test.assertEqual(pulo[Clawd.P_Y], -4);
    Test.assertEqual(pulo[Clawd.P_Z], 0);
    Test.assertEqual(Clawd.pose(Clawd.DORMINDO, 1000, 700)[Clawd.P_CORACAO], 0);
    return true;
}

(:test)
function humorPelaSituacao(logger as Logger) as Boolean {
    Test.assertEqual(Clawd.humorDe("done"), Clawd.VER);
    Test.assertEqual(Clawd.humorDe("waiting"), Clawd.ESPERANDO);
    Test.assertEqual(Clawd.humorDe("qualquer"), Clawd.DORMINDO);
    Test.assertEqual(Clawd.pontosDoAcessorio("write").size(), 8);
    Test.assertEqual(Clawd.pontosDoAcessorio("nada").size(), 0);
    return true;
}
