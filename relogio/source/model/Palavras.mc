import Toybox.Lang;
import Toybox.Math;

// Textos do mostrador redondo (firmware/src/app/format.cpp e round/look.cpp), com as palavras do glossário.
module Palavras {

    const CONTEXTO = 200000;
    const CONTEXTO_LONGO = 1000000;
    const CINCO_HORAS = 18000;
    const SEMANA = 604800;
    const DIAS = ["", "dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as Array<String>;

    function situacaoConhecida(status as String) as Boolean {
        return status.equals("waiting") || status.equals("error") || status.equals("done") || status.equals("working");
    }

    // "esperando você", "erro", "terminou", "rodando".
    function situacao(status as String) as String {
        if (status.equals("waiting")) {
            return "esperando você";
        }
        if (status.equals("error")) {
            return "erro";
        }
        if (status.equals("done")) {
            return "terminou";
        }
        return "rodando";
    }

    // "lendo", "editando"… ("" se não conhecer).
    function atividade(nome as String) as String {
        if (nome.equals("read")) { return "lendo"; }
        if (nome.equals("write")) { return "editando"; }
        if (nome.equals("bash")) { return "rodando comando"; }
        if (nome.equals("web")) { return "na web"; }
        if (nome.equals("delegate")) { return "delegando"; }
        if (nome.equals("plan")) { return "planejando"; }
        if (nome.equals("ask")) { return "perguntando"; }
        if (nome.equals("mcp")) { return "usando conector"; }
        if (nome.equals("think")) { return "pensando"; }
        if (nome.equals("compact")) { return "compactando"; }
        return "";
    }

    // Palavra do tile: "aprovar?", "responder", "terminou · ver", "editando"…
    function tile(s as Sessao) as String {
        if (!s.askKind.equals("")) {
            var verbo = s.askKind.equals("question") ? "responder" : s.askKind.equals("plan") ? "aprovar plano" : "aprovar?";
            return s.askCount > 1 ? verbo + " (" + s.askCount.toString() + ")" : verbo;
        }
        if (s.status.equals("done")) {
            return "terminou · ver";
        }
        if (s.status.equals("working")) {
            var palavra = atividade(s.activity);
            return palavra.equals("") ? "rodando" : palavra;
        }
        return situacao(s.status);
    }

    // Em maiúsculas, como nos tiles da web ("APROVAR?", "TERMINOU · VER").
    function tileMaiusculo(s as Sessao) as String {
        return maiusculas(tile(s));
    }

    // Maiúsculas também para á, ê, ç… (o toUpper do relógio só cuida do ASCII).
    function maiusculas(texto as String) as String {
        var letras = texto.toCharArray();
        var saida = "";
        for (var i = 0; i < letras.size(); i++) {
            var c = letras[i].toNumber();
            if ((c >= 0x61 && c <= 0x7A) || (c >= 0xE0 && c <= 0xFE && c != 0xF7)) {
                c -= 0x20;
            }
            saida += c.toChar().toString();
        }
        return saida;
    }

    // "agora", "42s", "3 min", "2 h 05", "3 d".
    function decorrido(segundos as Number) as String {
        if (segundos < 10) {
            return "agora";
        }
        if (segundos < 60) {
            return segundos.toString() + "s";
        }
        var minutos = segundos / 60;
        if (minutos < 60) {
            return minutos.toString() + " min";
        }
        var horas = minutos / 60;
        if (horas < 48) {
            return horas.toString() + " h " + (minutos % 60).format("%02d");
        }
        return (horas / 24).toString() + " d";
    }

    // 84213 → "84k"; 1250000 → "1,3M".
    function tokens(quantos as Number) as String {
        if (quantos < 0) {
            return "—";
        }
        if (quantos >= 1000000) {
            var decimos = (quantos + 50000) / 100000;
            return (decimos / 10).toString() + "," + (decimos % 10).toString() + "M";
        }
        return ((quantos + 500) / 1000).toString() + "k";
    }

    // Ícone ao lado do Clawd: a atividade enquanto trabalha ou espera, "done" se terminou sem você ver.
    function acessorio(s as Sessao) as String {
        if (s.status.equals("done")) {
            return "done";
        }
        if (s.status.equals("working") || s.status.equals("waiting")) {
            return s.activity.equals("") ? "think" : s.activity;
        }
        return "";
    }

    // Quanto do contexto já foi usado (0–100); modelos de 1M passam a contar sobre 1M.
    function contextoPct(tokens as Number) as Number {
        if (tokens <= 0) {
            return 0;
        }
        var janela = tokens > CONTEXTO ? CONTEXTO_LONGO : CONTEXTO;
        var pct = (tokens.toLong() * 100 / janela).toNumber();
        return pct > 100 ? 100 : pct;
    }

    // Quanto da janela já passou (0–1), ou -1 se não dá para saber.
    function fracaoPassada(resetsIn as Number, janela as Number) as Float {
        if (resetsIn <= 0) {
            return -1.0;
        }
        var passou = 1.0 - resetsIn.toFloat() / janela;
        return passou < 0.0 ? 0.0 : passou > 1.0 ? 1.0 : passou;
    }

    // "nesse ritmo fecha em ~84%", como a barra de uso da web.
    function ritmo(percent as Number, fracao as Float) as String {
        if (fracao < 0.0) {
            return "";
        }
        if (fracao < 0.08) {
            return "começou agora";
        }
        var projetado = Math.round(percent / fracao).toNumber();
        if (projetado > 100) {
            return "acaba antes de zerar";
        }
        return "no ritmo fecha em ~" + projetado.toString() + "%";
    }

    // Semana no ritmo: o uso não passou do quanto a semana já andou (com folga de 5 pontos).
    function semanaNoRitmo(percent as Number, fracao as Float) as Boolean {
        return fracao < 0.0 || percent <= (fracao * 100).toNumber() + 5;
    }

    // "21:05".
    function hora(horas as Number, minutos as Number) as String {
        return horas.format("%02d") + ":" + minutos.format("%02d");
    }

    // Dia da semana curto a partir do day_of_week do Gregorian (1 = domingo).
    function dia(diaDaSemana as Number) as String {
        return diaDaSemana >= 1 && diaDaSemana <= 7 ? DIAS[diaDaSemana] : "";
    }

    // Linha de baixo do detalhe: projeto · modelo (· máquina, se remota).
    function subtitulo(s as Sessao) as String {
        var linha = s.project;
        if (!s.model.equals("")) {
            linha = linha.equals("") ? s.model : linha + " · " + s.model;
        }
        if (!s.machine.equals("")) {
            linha = linha.equals("") ? s.machine : linha + " · " + s.machine;
        }
        return linha;
    }

    // Título do cartão de quem espera você: "PEDE PERMISSÃO · BASH", "PLANO PARA APROVAR"…
    function tituloPedido(s as Sessao) as String {
        if (s.askKind.equals("plan")) {
            return "PLANO PARA APROVAR";
        }
        if (s.askKind.equals("question")) {
            return "PERGUNTA PARA VOCÊ";
        }
        return s.askTool.equals("") ? "PEDE PERMISSÃO" : "PEDE PERMISSÃO · " + maiusculas(s.askTool);
    }
}
