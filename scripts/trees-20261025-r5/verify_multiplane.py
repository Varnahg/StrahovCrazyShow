"""Readback of the independent orthogonal-projection study."""
import json
from pathlib import Path
import bpy
ROOT = Path(__file__).resolve().parents[2]
report = json.loads((ROOT / 'public/models/vegetation/seasonal-r5/multiplane-v2/comparison-manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(ROOT / report['nativeMaster']['path']))
rows = []
for name, triangles in [('source-six-leaf-shoot', 24), ('2-orthogonal-planes', 4), ('3-orthogonal-planes', 6)]:
    obj = bpy.context.scene.objects[name]
    assert all(abs(value) < 1e-12 for value in obj.location)
    assert sum(len(p.vertices) - 2 for p in obj.data.polygons) == triangles
    assert obj['sourceRank'] == 32722 and obj['sourceTreeId'] == 'ipr-crown-014'
    assert len(obj.data.materials) == 1
    rows.append({'name': name, 'triangles': triangles, 'vertices': len(obj.data.vertices), 'materialCount': 1})
images = [image for image in bpy.data.images if image.source == 'FILE' and image.users > 0]
assert len(images) == 8 and all(image.packed_file for image in images)
result = {'nativeOpened': True, 'sourceOriginsPreserved': True, 'usedPackedImages': len(images), 'meshes': rows}
(ROOT / '.cache/trees-r5-bake-20261025/multiplane-v2/native-readback.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
