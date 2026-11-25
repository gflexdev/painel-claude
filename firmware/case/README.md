# Case do mostrador redondo

O case é o **HOMEsmthng – Waveshare 1.75** de "42" no MakerWorld
(<https://makerworld.com/en/models/3018407-homesmthng-apple-home-dashboard-waveshare-1-75>): uma coluna de mesa
com a tela no alto. Os STL do autor não ficam aqui (Standard Digital File License). Aqui fica só o remix:
**5 fendas de som na parede de trás da coluna**, para o alto-falante do kit tocar o aviso de "esperando você".

## Por que nas costas, e não na tampa

A tampa do autor é um tampão em cunha que fecha o canal da bateria por baixo, encostado na mesa: furada, ela jogaria
o som contra o tampo. O canal sobe inclinado (20°) colado na parede de trás, que tem 2 mm. O alto-falante
(~30 × 20 × 7 mm) fica colado por dentro dessa parede, logo acima do tampão, com a membrana virada para as fendas.

## Medidas (do STL do autor, corte em y = 128)

| Medida | Valor | Fonte |
|---|---|---|
| Parede de trás | 2,0 mm, inclinada 20° para a frente | STL do autor |
| Canal da bateria | 12 mm de fundo × 37 mm de largura (y 109,5 a 146,5), até z ≈ 71 | STL do autor |
| Tampão | até z ≈ 5,2 | STL do autor |
| Alto-falante | ~30 × 20 × 7 mm | fotos da Bancada e página do case do rzvn (Waveshare 8 Ω 2 W); não medido com paquímetro |
| Fendas | 5 × (1,6 × 13 mm), passo 4 mm, de z 12 a 25 | este remix |

Conferido: saem 202 mm³ (esperado 200), a peça continua um corpo só e fechado; o alto-falante na posição não
encosta em nada (interseção 0) e, empurrado 1,5 mm contra a parede, acusa 598 mm³ (controle positivo); sobra
4,7 mm na frente dele e 1,8 mm acima do tampão. As fendas só acrescentam 5 tetos estreitos (topo de cada fenda);
os outros avisos do `faces_para_baixo.py` são iguais aos do original.

## Gerar de novo

Baixe "Baixar arquivos STL/CAD" na página do modelo e descompacte numa pasta. Depois:

```bash
uv run --with numpy,scipy,trimesh,shapely,rtree,networkx,manifold3d python -I grade.py "<pasta>/obj_2_Waveshare 1.75 AMOLED - smthng display housing 4 .stl" corpo-com-grade.stl
```

```bash
uv run --with numpy,scipy,trimesh,networkx,lxml python -I projeto.py corpo-com-grade.stl "<pasta>/obj_1_lid.stl" homesmthng-com-grade-bambu-studio.3mf
```

## Imprimir e montar

- PETG, perfil do autor: camada 0,16 mm, 2 paredes, 15% de preenchimento. As duas peças cabem numa placa só; o corpo
  fica em pé como o autor desenhou (118 mm de altura, base larga, sem brim).
- 3 parafusos M2 × 4 mm prendem a placa; 3 parafusos pequenos de ~1,2 × 5 mm prendem o tampão.
- O alto-falante vai com fita dupla face fina na borda, por dentro, centrado nas fendas, entrando pelo canal de
  baixo antes do tampão. O fio sobe pelo canal até o conector **SPK** da placa. A antena de GPS fica de fora.
