"""Gera as fontes do relógio (BMFont: .fnt + .png) a partir das mesmas fontes do mostrador e da web:
Space Grotesk Bold (títulos e números) e JetBrains Mono (texto). As duas são OFL 1.1 (resources/fonts/LICENCAS.md).

Uso:  uv run --with pillow python relogio/tools/gerar-fontes.py <pasta-com-os-ttf>
A pasta precisa ter SpaceGrotesk-Bold.ttf, JetBrainsMono-Regular.ttf e JetBrainsMono-SemiBold.ttf
(relogio/tools/gerar-fontes.sh baixa e chama este script). Só precisa rodar de novo se mudar tamanho ou faixa.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "resources" / "fonts"
ATLAS_WIDTH = 512
GAP = 1

# ASCII + Latin-1 (acentos do português) + pontuação tipográfica comum, como no firmware.
TEXT_RANGE = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x100))
    + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2039, 0x203A]
)
DIGITS = [0x20, 0x25, 0x2C, 0x2D, 0x2E] + list(range(0x30, 0x3B)) + [0x2014]

# id, arquivo, tamanho em px (pensado para a tela de 390 px e 1,2" do 165), faixa.
FONTS = [
    ("MonoPeq", "JetBrainsMono-Regular.ttf", 15, TEXT_RANGE),
    ("MonoMed", "JetBrainsMono-Regular.ttf", 17, TEXT_RANGE),
    ("MonoForte", "JetBrainsMono-SemiBold.ttf", 19, TEXT_RANGE),
    ("DispPeq", "SpaceGrotesk-Bold.ttf", 19, TEXT_RANGE),
    ("DispMed", "SpaceGrotesk-Bold.ttf", 23, TEXT_RANGE),
    ("DispGrande", "SpaceGrotesk-Bold.ttf", 29, TEXT_RANGE),
    ("DispEnorme", "SpaceGrotesk-Bold.ttf", 34, TEXT_RANGE),
    ("Numero", "SpaceGrotesk-Bold.ttf", 82, DIGITS),
]


def glyphs_of(font, codes):
    out = []
    for code in codes:
        ch = chr(code)
        x0, y0, x1, y1 = font.getbbox(ch, anchor="ls")
        advance = round(font.getlength(ch))
        out.append((code, ch, x0, y0, x1 - x0, y1 - y0, advance))
    return out


def build(name, ttf_dir, filename, size, codes):
    font = ImageFont.truetype(str(ttf_dir / filename), size)
    ascent, descent = font.getmetrics()
    glyphs = glyphs_of(font, codes)

    # Empacota em linhas de ATLAS_WIDTH.
    x = y = row_h = 0
    places = []
    for code, ch, gx, gy, w, h, adv in glyphs:
        if x + w + GAP > ATLAS_WIDTH:
            x, y, row_h = 0, y + row_h + GAP, 0
        places.append((x, y))
        x += w + GAP
        row_h = max(row_h, h)
    height = y + row_h + GAP

    # Intensidade do glifo nos três canais e no alfa: o compilador do Connect IQ lê a cobertura daí e suaviza
    # as bordas (com antialias="true"); só no alfa, as letras saem serrilhadas.
    atlas = Image.new("RGBA", (ATLAS_WIDTH, max(height, 1)), (0, 0, 0, 0))
    lines = []
    for (code, ch, gx, gy, w, h, adv), (px, py) in zip(glyphs, places):
        if w > 0 and h > 0:
            mask = Image.new("L", (w, h), 0)
            ImageDraw.Draw(mask).text((-gx, -gy), ch, font=font, fill=255, anchor="ls")
            atlas.paste(Image.merge("RGBA", (mask, mask, mask, mask)), (px, py))
        # yoffset é a partir do topo da linha: base (ascent) + gy (negativo acima da linha de base).
        lines.append(
            f"char id={code} x={px} y={py} width={w} height={h} xoffset={gx} "
            f"yoffset={ascent + gy} xadvance={adv} page=0 chnl=15"
        )

    png = f"{name}.png"
    atlas.save(OUT / png)
    header = [
        f'info face="{name}" size={size} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 '
        f"padding=0,0,0,0 spacing={GAP},{GAP}",
        f"common lineHeight={ascent + descent} base={ascent} scaleW={ATLAS_WIDTH} scaleH={atlas.height} "
        f"pages=1 packed=0",
        f'page id=0 file="{png}"',
        f"chars count={len(lines)}",
    ]
    (OUT / f"{name}.fnt").write_text("\n".join(header + lines) + "\n", encoding="utf-8")
    return ascent + descent


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    ttf_dir = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for name, filename, size, codes in FONTS:
        line = build(name, ttf_dir, filename, size, codes)
        entries.append(f'    <font id="{name}" filename="{name}.fnt" antialias="true"/>')
        print(f"{name}: {size}px, linha de {line}px")
    (OUT / "fonts.xml").write_text("<fonts>\n" + "\n".join(entries) + "\n</fonts>\n", encoding="utf-8")


if __name__ == "__main__":
    main()
