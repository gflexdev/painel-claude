import sys, numpy as np, trimesh
body = trimesh.load(sys.argv[1], force='mesh'); lid = trimesh.load(sys.argv[2], force='mesh'); out = sys.argv[3]
# Mesma placa: o corpo onde o autor pôs, o tampão ao lado (no arquivo do autor ele estava na segunda placa).
lid.apply_translation([185 - lid.bounds[0][0], 110 - lid.bounds[0][1], -lid.bounds[0][2]])
both = np.vstack([body.bounds, lid.bounds])
print('caixa da placa', np.round([both[:, 0].min(), both[:, 1].min(), both[:, 0].max(), both[:, 1].max()], 1).tolist(),
      'altura corpo', round(body.extents[2], 1), 'tampão', round(lid.extents[2], 1))
scene = trimesh.Scene()
scene.add_geometry(body, node_name='Corpo com grade', geom_name='Corpo com grade')
scene.add_geometry(lid, node_name='Tampão (original)', geom_name='Tampão (original)')
scene.export(out)
