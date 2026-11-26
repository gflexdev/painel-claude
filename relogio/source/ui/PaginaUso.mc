import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.Time.Gregorian;

// Uso do plano (firmware/src/round/pages.cpp, UsagePage): janela de 5 h no arco de fora, semana no de dentro,
// com o tracinho do ritmo (onde o uso estaria se fosse gasto por igual) e quando zera.
module PaginaUso {

    // Medidas do mostrador (466 px). Os arcos abrem embaixo, como um mostrador: de 135° a 405°.
    const FORA = 430;
    const DENTRO = 378;
    const ESPESSURA = 14;
    const INICIO = 135;
    const VARREDURA = 270;

    function desenhar(dc as Graphics.Dc, uso as Uso or Null) as Void {
        var cx = dc.getWidth() / 2;
        var cy = dc.getHeight() / 2;
        var fora = Tela.s(dc, FORA);
        var dentro = Tela.s(dc, DENTRO);
        var esp = Tela.s(dc, ESPESSURA);
        Tela.arco(dc, cx, cy, fora, esp, INICIO, INICIO + VARREDURA, Cores.TRILHA, true);

        var cinco = uso == null ? null : uso.cinco;
        var semana = uso == null ? null : uso.semana;
        var principal = cinco != null ? cinco : semana;
        if (principal == null) {
            Tela.centro(dc, Tela.s(dc, 86), Tela.MONO_PEQ, Cores.TINTA_APAGADA, "USO DO PLANO", Tela.s(dc, 240));
            Tela.centro(dc, Tela.s(dc, 170), Tela.DISP_ENORME, Cores.TINTA_APAGADA, "—", Tela.s(dc, 200));
            Tela.centro(dc, Tela.s(dc, 236), Tela.MONO_PEQ, Cores.TINTA, "sem dado de uso ainda", Tela.s(dc, 320));
            Tela.centro(dc, Tela.s(dc, 260), Tela.MONO_PEQ, Cores.TINTA_APAGADA, "chega pela status line", Tela.s(dc, 320));
            return;
        }

        var ehCinco = cinco != null;
        var janela = ehCinco ? Palavras.CINCO_HORAS : Palavras.SEMANA;
        var fracao = Palavras.fracaoPassada(principal.resetsIn, janela);
        var cor = Cores.doUso(principal.percent, ehCinco ? Cores.RODANDO : Cores.VER);
        valor(dc, cx, cy, fora, esp, principal.percent, cor);
        ritmo(dc, cx, cy, fora, esp, fracao);

        Tela.centro(dc, Tela.s(dc, 86), Tela.MONO_PEQ, Cores.TINTA_APAGADA, ehCinco ? "5 H" : "SEMANA", Tela.s(dc, 220));
        numeroGrande(dc, cx, Tela.s(dc, 160), principal.percent, cor);
        Tela.centro(dc, Tela.s(dc, 234), Tela.MONO_PEQ, Cores.TINTA, Palavras.ritmo(principal.percent, fracao), Tela.s(dc, 360));
        Tela.centro(dc, Tela.s(dc, 258), Tela.MONO_PEQ, Cores.TINTA_APAGADA, zera(principal.resetsIn, !ehCinco), Tela.s(dc, 330));

        // Arco de dentro e linhas: a semana (se a de fora é a de 5 h) e os limites por modelo.
        var linhas = [] as Array<Array>;
        if (ehCinco && semana != null) {
            linhas.add(["SEMANA", semana.percent, Cores.VER, false]);
        }
        if (uso != null) {
            for (var i = 0; i < uso.escopos.size() && linhas.size() < 3; i++) {
                linhas.add([Palavras.maiusculas("só " + uso.escopos[i][0]), uso.escopos[i][1], Cores.TINTA_SUAVE, true]);
            }
        }
        if (linhas.size() > 0) {
            Tela.arco(dc, cx, cy, dentro, esp, INICIO, INICIO + VARREDURA, Cores.TRILHA, true);
            var primeira = linhas[0];
            valor(dc, cx, cy, dentro, esp, primeira[1] as Number, Cores.doUso(primeira[1] as Number, primeira[2] as Number));
            if (ehCinco && semana != null) {
                ritmo(dc, cx, cy, dentro, esp, Palavras.fracaoPassada(semana.resetsIn, Palavras.SEMANA));
            }
        }
        var y = Tela.s(dc, 300);
        for (var i = 0; i < linhas.size(); i++) {
            linha(dc, cx, y, linhas[i]);
            y += Tela.s(dc, 30);
        }
        if (ehCinco && semana != null) {
            var noRitmo = Palavras.semanaNoRitmo(semana.percent, Palavras.fracaoPassada(semana.resetsIn, Palavras.SEMANA));
            Tela.centro(dc, y + Tela.s(dc, 4), Tela.MONO_PEQ, Cores.TINTA_APAGADA,
                noRitmo ? "semana no ritmo" : "semana acima do ritmo", Tela.s(dc, 280));
        }
    }

    function valor(dc as Graphics.Dc, cx as Number, cy as Number, diametro as Number, esp as Number, percent as Number,
            cor as Number) as Void {
        var p = percent < 0 ? 0 : percent > 100 ? 100 : percent;
        if (p > 0) {
            Tela.arco(dc, cx, cy, diametro, esp, INICIO, INICIO + VARREDURA * p / 100.0, cor, true);
        }
    }

    // Tracinho branco do ritmo.
    function ritmo(dc as Graphics.Dc, cx as Number, cy as Number, diametro as Number, esp as Number, fracao as Float) as Void {
        if (fracao < 0.0) {
            return;
        }
        var a = INICIO + fracao * VARREDURA;
        Tela.arco(dc, cx, cy, diametro + 8, esp + 8, a - 1, a + 1, Cores.TINTA, false);
    }

    // "37" grande com o "%" menor ao lado, na cor do uso.
    function numeroGrande(dc as Graphics.Dc, cx as Number, y as Number, percent as Number, cor as Number) as Void {
        var n = percent.toString();
        var wn = Tela.largura(dc, n, Tela.NUMERO);
        var wp = Tela.largura(dc, "%", Tela.DISP_ENORME);
        var x = cx - (wn + 2 + wp) / 2;
        var esquerda = Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER;
        Tela.texto(dc, x, y, Tela.NUMERO, cor, n, esquerda);
        Tela.texto(dc, x + wn + 2, y + Tela.altura(dc, Tela.NUMERO) / 5, Tela.DISP_ENORME, cor, "%", esquerda);
    }

    // Bolinha (cheia para a semana, anel para os limites por modelo), nome e percentual.
    function linha(dc as Graphics.Dc, cx as Number, y as Number, l as Array) as Void {
        var w = Tela.s(dc, 250);
        var x = cx - w / 2;
        var percent = l[1] as Number;
        var cor = Cores.doUso(percent, l[2] as Number);
        var raio = Tela.s(dc, 10) / 2;
        if (l[3] as Boolean) {
            dc.setColor(Cores.TINTA_APAGADA, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(2);
            dc.drawCircle(x + raio, y, raio);
            dc.setPenWidth(1);
        } else {
            dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x + raio, y, raio);
        }
        var meio = Graphics.TEXT_JUSTIFY_VCENTER;
        Tela.texto(dc, x + raio * 2 + Tela.s(dc, 10), y, Tela.MONO_PEQ, Cores.TINTA_SUAVE, l[0] as String,
            Graphics.TEXT_JUSTIFY_LEFT | meio);
        Tela.texto(dc, x + w, y, Tela.DISP_MED, cor, percent.toString() + "%", Graphics.TEXT_JUSTIFY_RIGHT | meio);
    }

    // "zera 21:00 · em 3 h 05" (semana: "zera qui 21:00 · em 3 d"), na hora do relógio.
    function zera(resetsIn as Number, semana as Boolean) as String {
        if (resetsIn < 0) {
            return "";
        }
        if (resetsIn == 0) {
            return "zera logo";
        }
        var quando = Gregorian.info(Time.now().add(new Time.Duration(resetsIn)), Time.FORMAT_SHORT);
        var hora = Palavras.hora(quando.hour as Number, quando.min as Number);
        if (semana) {
            hora = Palavras.dia(quando.day_of_week as Number) + " " + hora;
        }
        return "zera " + hora + " · em " + Palavras.decorrido(resetsIn);
    }
}
