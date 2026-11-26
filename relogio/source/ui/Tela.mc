import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.WatchUi;

// Peças comuns das telas: fontes do mostrador, escala, arcos, pílulas e as bolinhas das páginas.
// As medidas vêm do mostrador redondo (466 px) e são levadas à tela do relógio por `s`.
module Tela {

    const BASE = 466;
    const ELLIPSIS = "…";
    const JUSTO_CENTRO = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;

    // Fontes: as mesmas do mostrador (JetBrains Mono e Space Grotesk), carregadas uma vez.
    enum {
        MONO_PEQ,
        MONO_MED,
        MONO_FORTE,
        DISP_PEQ,
        DISP_MED,
        DISP_GRANDE,
        DISP_ENORME,
        NUMERO,
        FONTES
    }

    var _fontes as Array<WatchUi.FontResource or Null> or Null = null;

    function fonte(qual as Number) as WatchUi.FontResource {
        if (_fontes == null) {
            _fontes = new [FONTES] as Array<WatchUi.FontResource or Null>;
        }
        var cache = _fontes as Array<WatchUi.FontResource or Null>;
        var f = cache[qual];
        if (f == null) {
            f = WatchUi.loadResource(recurso(qual)) as WatchUi.FontResource;
            cache[qual] = f;
        }
        return f;
    }

    function recurso(qual as Number) as ResourceId {
        if (qual == MONO_PEQ) { return Rez.Fonts.MonoPeq; }
        if (qual == MONO_MED) { return Rez.Fonts.MonoMed; }
        if (qual == MONO_FORTE) { return Rez.Fonts.MonoForte; }
        if (qual == DISP_PEQ) { return Rez.Fonts.DispPeq; }
        if (qual == DISP_MED) { return Rez.Fonts.DispMed; }
        if (qual == DISP_GRANDE) { return Rez.Fonts.DispGrande; }
        if (qual == DISP_ENORME) { return Rez.Fonts.DispEnorme; }
        return Rez.Fonts.Numero;
    }

    // Medida do mostrador (466 px) na tela do relógio.
    function s(dc as Graphics.Dc, v as Number or Float) as Number {
        return (v * dc.getWidth() / BASE).toNumber();
    }

    function texto(dc as Graphics.Dc, x as Number, y as Number, qual as Number, cor as Number, t as String,
            justificar as Number) as Void {
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, fonte(qual), t, justificar);
    }

    // Texto centrado na horizontal, com o meio da linha em y; corta com "…" se passar da largura.
    function centro(dc as Graphics.Dc, y as Number, qual as Number, cor as Number, t as String, largura as Number) as Void {
        texto(dc, dc.getWidth() / 2, y, qual, cor, cortar(dc, t, qual, largura), JUSTO_CENTRO);
    }

    function largura(dc as Graphics.Dc, t as String, qual as Number) as Number {
        return dc.getTextWidthInPixels(t, fonte(qual));
    }

    function altura(dc as Graphics.Dc, qual as Number) as Number {
        return dc.getFontHeight(fonte(qual));
    }

    function cortar(dc as Graphics.Dc, t as String, qual as Number, maximo as Number) as String {
        var f = fonte(qual);
        if (dc.getTextWidthInPixels(t, f) <= maximo) {
            return t;
        }
        var corte = t;
        while (corte.length() > 1 && dc.getTextWidthInPixels(corte + ELLIPSIS, f) > maximo) {
            corte = corte.substring(0, corte.length() - 1) as String;
        }
        return corte + ELLIPSIS;
    }

    // Quebra em até `linhas` linhas na largura dada; a última corta com "…".
    function quebrar(dc as Graphics.Dc, t as String, qual as Number, maximo as Number, linhas as Number) as String {
        var f = fonte(qual);
        // Folga de alguns px por linha: sem ela o fitTextToArea às vezes desiste da última linha.
        var cabe = Graphics.fitTextToArea(t, f, maximo, (dc.getFontHeight(f) + 6) * linhas, true);
        return cabe == null ? cortar(dc, t, qual, maximo) : cabe;
    }

    // Arco de `de` a `ate` graus, contados como no LVGL do mostrador: 0° às 3 h, sentido horário.
    // `diametro` é a borda de fora; `redondo` põe as pontas arredondadas.
    function arco(dc as Graphics.Dc, cx as Number, cy as Number, diametro as Number, espessura as Number,
            de as Number or Float, ate as Number or Float, cor as Number, redondo as Boolean) as Void {
        if (ate - de < 0.5) {
            return;
        }
        var r = diametro / 2 - espessura / 2;
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(espessura);
        if (ate - de >= 359.5) {
            dc.drawCircle(cx, cy, r);
        } else {
            dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, garmin(de), garmin(ate));
            if (redondo) {
                ponta(dc, cx, cy, r, de, espessura);
                ponta(dc, cx, cy, r, ate, espessura);
            }
        }
        dc.setPenWidth(1);
    }

    // O Connect IQ conta os graus no sentido anti-horário.
    function garmin(graus as Number or Float) as Number {
        var g = (360 - graus.toNumber()) % 360;
        return g < 0 ? g + 360 : g;
    }

    function ponta(dc as Graphics.Dc, cx as Number, cy as Number, r as Number, graus as Number or Float,
            espessura as Number) as Void {
        var a = Math.toRadians(graus);
        dc.fillCircle((cx + r * Math.cos(a)).toNumber(), (cy + r * Math.sin(a)).toNumber(), espessura / 2);
    }

    // Ponto da circunferência de raio r no ângulo do LVGL.
    function px(cx as Number, r as Number or Float, graus as Number or Float) as Number {
        return (cx + r * Math.cos(Math.toRadians(graus))).toNumber();
    }

    function py(cy as Number, r as Number or Float, graus as Number or Float) as Number {
        return (cy + r * Math.sin(Math.toRadians(graus))).toNumber();
    }

    // Pílula centrada em (cx, cy): fundo, bolinha da cor e texto.
    function pilula(dc as Graphics.Dc, cx as Number, cy as Number, fundo as Number, corPonto as Number,
            corTexto as Number, t as String, qual as Number, maximo as Number) as Void {
        var cortado = cortar(dc, t, qual, maximo);
        var ponto = s(dc, 8);
        var folga = s(dc, 12);
        var vao = s(dc, 8);
        var w = folga * 2 + ponto + vao + largura(dc, cortado, qual);
        var h = altura(dc, qual) + s(dc, 8);
        dc.setColor(fundo, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(cx - w / 2, cy - h / 2, w, h, h / 2);
        dc.setColor(corPonto, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx - w / 2 + folga + ponto / 2, cy, ponto / 2);
        texto(dc, cx - w / 2 + folga + ponto + vao, cy, qual, corTexto, cortado,
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    // Marca de Sessão vigiada, o "◉" da web (que as fontes não têm): anel e miolo na cor da pergunta.
    // (x, y) é o meio; r o raio de fora; fundo a cor por trás, que faz o vão entre o anel e o miolo.
    function marcaVigia(dc as Graphics.Dc, x as Number, y as Number, r as Number, fundo as Number) as Void {
        var anel = r / 3 > 1 ? r / 3 : 1;
        dc.setColor(Cores.PERGUNTA, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x, y, r);
        dc.setColor(fundo, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x, y, r - anel);
        dc.setColor(Cores.PERGUNTA, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(x, y, r - anel * 2 > 1 ? r - anel * 2 : 1);
    }

    // Bolinhas embaixo: onde você está no carrossel.
    function bolinhas(dc as Graphics.Dc, total as Number, atual as Number) as Void {
        var y = dc.getHeight() - s(dc, 22);
        var d = s(dc, 7);
        var longa = s(dc, 18);
        var vao = s(dc, 8);
        var w = longa + (total - 1) * (d + vao);
        var x = dc.getWidth() / 2 - w / 2;
        for (var i = 0; i < total; i++) {
            var largo = i == atual ? longa : d;
            dc.setColor(i == atual ? Cores.TINTA : Cores.PONTO, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x, y - d / 2, largo, d, d / 2);
            x += largo + vao;
        }
    }

    // Contorno que pulsa (quem espera você): opacidade entre `de` e 255, ida e volta em 1,4 s.
    function pulso(ms as Number, de as Number) as Number {
        var f = Clawd.fase(ms, 1400, 0);
        var ida = f < 500 ? f * 2 : (1000 - f) * 2;
        // Suaviza as pontas, como o ease-in-out do LVGL.
        var suave = (1.0 - Math.cos(Math.PI * ida / 1000.0)) / 2.0;
        return de + ((255 - de) * suave).toNumber();
    }

    // Seta para cima (voltar) no topo.
    function setaVoltar(dc as Graphics.Dc, cor as Number) as Void {
        var cx = dc.getWidth() / 2;
        var y = s(dc, 34);
        var a = s(dc, 9);
        dc.setColor(cor, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(s(dc, 3));
        dc.drawLine(cx - a, y + a / 2, cx, y - a / 2);
        dc.drawLine(cx, y - a / 2, cx + a, y + a / 2);
        dc.setPenWidth(1);
    }
}
