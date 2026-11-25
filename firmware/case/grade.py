"""Fendas de som na parede de trás da coluna do HOMEsmthng (STL do autor, sem STEP).

Medido no STL, corte em y = 128: a parede de trás tem 2,0 mm (2,13 mm na horizontal) e inclina 20° para a
frente; o canal da bateria atrás dela tem 12 mm de fundo e vai de y 109,5 a 146,5. O tampão do autor fecha o canal
até z ≈ 5,2. O alto-falante (~30 × 20 × 7 mm) fica colado por dentro da parede, de z ≈ 6 a 25.
"""
import sys, math, numpy as np, trimesh
from shapely.geometry import LineString

housing_path, out_path = sys.argv[1], sys.argv[2]

# Parede de trás em y = 128 (x, z): face de dentro e de fora, medidas em z = 8 e z = 32.
INNER = [(163.61, 8.0), (154.88, 32.0)]
OUTER = [(165.69, 8.0), (157.01, 32.0)]
SLOTS = 5
SLOT_W = 1.6      # largura de cada fenda (em y)
SLOT_L = 13.0     # comprimento ao longo da parede
PITCH = 4.0
CENTER_Y = 128.0
CENTER_Z = 18.5   # meio do alto-falante (de z 9,5 a 28,3 na parede)
DEPTH = 8.0       # o corte atravessa a parede com folga para os dois lados (o canal tem 12 mm)

(x0, z0), (x1, z1) = INNER
u = np.array([x1 - x0, 0.0, z1 - z0]); u /= np.linalg.norm(u)          # sobe ao longo da parede
n = np.array([u[2], 0.0, -u[0]])                                          # para fora (+x)
assert n[0] > 0
x_in = x0 + (CENTER_Z - z0) * (x1 - x0) / (z1 - z0)
x_out = OUTER[0][0] + (CENTER_Z - OUTER[0][1]) * (OUTER[1][0] - OUTER[0][0]) / (OUTER[1][1] - OUTER[0][1])
mid = np.array([(x_in + x_out) / 2, CENTER_Y, CENTER_Z])
thickness = (x_out - x_in) * abs(n[0])
print(f'parede: inclinação {math.degrees(math.atan2(-u[0], u[2])):.1f}°, espessura {thickness:.2f} mm, meio {mid.round(2)}')

tools = []
for i in range(SLOTS):
    dy = (i - (SLOTS - 1) / 2) * PITCH
    # fenda com pontas redondas no plano (a = ao longo da parede, b = y), extrudada ao longo de n
    a_half = (SLOT_L - SLOT_W) / 2
    poly = LineString([(-a_half, dy), (a_half, dy)]).buffer(SLOT_W / 2, quad_segs=8)
    prism = trimesh.creation.extrude_polygon(poly, DEPTH)   # x = a, y = b, z = profundidade 0..DEPTH
    m = np.eye(4)
    m[:3, 0] = u
    m[:3, 1] = [0, 1, 0]
    m[:3, 2] = n
    m[:3, 3] = mid - n * DEPTH / 2 + np.array([0, 0, 0])
    m[1, 3] = CENTER_Y - 0  # o y da fenda vem do polígono (b = y relativo ao centro)
    prism.apply_transform(m)
    tools.append(prism)
tool = trimesh.util.concatenate(tools)

housing = trimesh.load(housing_path, force='mesh')
cut_away = trimesh.boolean.intersection([housing, tool], engine='manifold')
print(f'material tirado: {cut_away.volume:.1f} mm³ (esperado ≈ {SLOTS * (SLOT_W * (SLOT_L - SLOT_W) + math.pi * SLOT_W**2 / 4) * thickness:.1f})')
print(f'caixa do que saiu: {np.round(cut_away.bounds, 2).tolist()}')
result = trimesh.boolean.difference([housing, tool], engine='manifold')
print(f'volume antes {housing.volume:.1f} depois {result.volume:.1f}, estanque {result.is_watertight}, '
      f'corpos {len(result.split(only_watertight=False))}, caixa {np.round(result.bounds, 2).tolist()}')
result.export(out_path)
tool.export(out_path.replace('.stl', '-fendas.stl'))

# Alto-falante (~30 × 20 × 7 mm) colado por dentro da parede, borda de baixo em z = 9,5 na face interna.
SPK = (30.0, 20.0, 7.0)   # y, ao longo da parede, espessura
SPK_BOTTOM_Z = 9.5
x_at = lambda z: x0 + (z - z0) * (x1 - x0) / (z1 - z0)
base = np.array([x_at(SPK_BOTTOM_Z), CENTER_Y, SPK_BOTTOM_Z])
def speaker(push):
    box = trimesh.creation.box(extents=[SPK[1], SPK[0], SPK[2]])   # a, y, profundidade
    m = np.eye(4); m[:3, 0] = u; m[:3, 1] = [0, 1, 0]; m[:3, 2] = n
    m[:3, 3] = base + u * SPK[1] / 2 - n * (SPK[2] / 2 + 0.3) + n * push
    box.apply_transform(m)
    return box
spk = speaker(0)
print(f'alto-falante: z {spk.bounds[0][2]:.2f}..{spk.bounds[1][2]:.2f} (tampão chega a ~5,2)')
for push, label in [(0, 'na posição (0,3 mm da parede)'), (1.5, 'controle: empurrado 1,5 mm na parede')]:
    inter = trimesh.boolean.intersection([result, speaker(push)], engine='manifold')
    print(f'  {label}: interseção {inter.volume:.2f} mm³')
front_gap = []
for z in [8, 12, 16, 20, 24]:
    xf = {8: 150.84, 12: 149.39, 16: 147.93, 20: 146.48, 24: 145.02}[z]
    front_gap.append(round((x_at(z) - xf) * abs(n[0]) - SPK[2] - 0.3, 2))
print(f'folga entre a frente do alto-falante e a frente do canal (mm): {front_gap}')
spk.export(out_path.replace('.stl', '-altofalante.stl'))
