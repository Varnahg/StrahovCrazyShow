"""Read back the saved native master without rendering or changing its bytes."""
import json
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[2]
master = ROOT / 'assets/blender/vegetation/seasonal-r5/r5-comparisons.blend'
bpy.ops.wm.open_mainfile(filepath=str(master))
scene = bpy.context.scene
rows = []
for name in ('leafy-shoot-source__rank32722', 'leafy-shoot-card__rank32722'):
    obj = scene.objects[name]
    assert obj.type == 'MESH' and all(abs(x) < 1e-12 for x in obj.location)
    rows.append({'name': name, 'vertices': len(obj.data.vertices), 'triangles': sum(len(p.vertices) - 2 for p in obj.data.polygons),
        'uvLayers': len(obj.data.uv_layers), 'rank': obj['sourceRank'], 'materialKey': obj['materialKey']})
scene.render.resolution_x = 768; scene.render.resolution_y = 755
camera = scene.objects['leafy-camera']
obj = scene.objects['leafy-shoot-source__rank32722']
projected = [world_to_camera_view(scene, camera, obj.matrix_world @ v.co) for v in obj.data.vertices]
bounds = [[min(p[i] for p in projected) for i in range(2)], [max(p[i] for p in projected) for i in range(2)]]
assert all(value > .02 for value in bounds[0]) and all(value < .98 for value in bounds[1]), 'comparison crop clips source geometry'
images = [{'name': i.name, 'width': i.size[0], 'height': i.size[1], 'packed': bool(i.packed_file)}
          for i in bpy.data.images if i.source == 'FILE' and i.users > 0]
assert len(images) >= 12 and all(i['packed'] for i in images)
output = {'nativeOpened': True, 'sourceOriginsUnchanged': True, 'objects': rows,
          'leafy60ProjectedVertexBounds': bounds, 'packedImages': images}
wood_report = json.loads((ROOT / '.cache/trees-r5-bake-20261025/wood-report.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(ROOT / wood_report['nativeMaster']['path']))
wood_rows = []
for candidate in wood_report['candidates']:
    obj = bpy.context.scene.objects[candidate['name']]
    triangles = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    assert triangles == candidate['triangles']
    assert all(abs(x) < 1e-12 for x in obj.location)
    assert len(obj.data.uv_layers) == 1 and obj.data.materials[0].name == 'source Bark012'
    wood_rows.append({'name': obj.name, 'triangles': triangles, 'vertices': len(obj.data.vertices), 'origin': list(obj.location)})
wood_images = [i for i in bpy.data.images if i.source == 'FILE' and i.users > 0]
assert len(wood_images) >= 3 and all(i.packed_file for i in wood_images)
output['wood'] = {'nativeOpened': True, 'candidates': wood_rows, 'usedImagesPacked': len(wood_images)}
(ROOT / '.cache/trees-r5-bake-20261025/native-readback.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps(output, indent=2))
