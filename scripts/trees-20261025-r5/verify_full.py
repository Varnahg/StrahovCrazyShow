"""Read back the full R5 native pilot without altering saved geometry."""
import json
import sys
from pathlib import Path
import bpy
ROOT = Path(__file__).resolve().parents[2]
report = json.loads((ROOT / 'public/models/vegetation/seasonal-r5/pilot-manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(ROOT / report['nativeMaster']['path']))
rows = []
for variant in report['variants']:
    for lod in range(3):
        for role in ('wood', 'foliage'):
            obj = bpy.context.scene.objects[f'{variant["id"]}__lod{lod}__{role}']
            assert all(abs(x) < 1e-12 for x in obj.location)
            assert obj['sourceTreeId'] == variant['sourceTreeId'] and obj['archetypeId'] == variant['id']
            triangles = sum(len(p.vertices) - 2 for p in obj.data.polygons)
            if role == 'wood' and lod == 0: assert triangles == variant['woodProfile']['triangleCount']
            if role == 'foliage': assert triangles == variant['foliage'][lod]['triangles']
            rows.append({'name': obj.name, 'triangles': triangles, 'vertices': len(obj.data.vertices)})
images = [i for i in bpy.data.images if i.source == 'FILE' and i.users > 0]
assert all(i.packed_file for i in images)
result = {'nativeOpened': True, 'sourceOriginsPreserved': True, 'sceneObjects': len(bpy.context.scene.objects),
    'dataObjects': len(bpy.data.objects), 'usedPackedImages': len(images), 'meshes': rows}
directory = 'full-coverage-mid' if '--full-coverage' in sys.argv else 'full-pilots'
(ROOT / '.cache/trees-r5-bake-20261025' / directory / 'native-readback.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
