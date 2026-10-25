"""Source inspection/extraction in one headless Blender CPU process.

Blender --background --factory-startup --disable-autoexec --threads 2
  --python-exit-code 1 --python scripts/derive-ground-flowers.py
No render, dependency installation, source save, or GPU context is requested.
"""
from pathlib import Path
import hashlib
import json
import os
import time

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/sources/vegetation/dandelion_01'
CACHE = ROOT / '.cache/terrain-flowers-20261025'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def extract():
    import bpy
    from mathutils import Vector
    manifest = json.loads((SOURCE / 'source-manifest.json').read_text(encoding='utf8'))
    inputs = {record['path']: record['sha256'] for record in manifest['files'] if record['purpose'] == 'preserved-highest'}
    for path, digest in inputs.items():
        if sha(ROOT / path) != digest:
            raise ValueError('Source hash changed before extraction: ' + path)
    master = next(ROOT / p for p in inputs if p.endswith('.blend'))
    started = time.time()
    bpy.ops.wm.open_mainfile(filepath=str(master), use_scripts=False)
    meshes = []
    for obj in sorted(bpy.data.objects, key=lambda o: o.name):
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        layer = mesh.uv_layers.active
        if layer is None:
            raise ValueError('Source mesh has no UV: ' + obj.name)
        # De-index at the native corner boundary: preserve UV seams and actual
        # split normals rather than guessing normals from vertex positions.
        positions, normals, uvs, indices = [], [], [], []
        for triangle in mesh.loop_triangles:
            for loop_index in triangle.loops:
                loop = mesh.loops[loop_index]
                positions.extend(float(v) for v in mesh.vertices[loop.vertex_index].co)
                normals.extend(float(v) for v in mesh.corner_normals[loop_index].vector)
                uvs.extend(float(v) for v in layer.data[loop_index].uv)
                indices.append(len(indices))
        entry = {'name': obj.name, 'data': mesh.name, 'parent': obj.parent.name if obj.parent else None,
                 'location': list(obj.location), 'scale': list(obj.scale), 'dimensions': list(obj.dimensions),
                 'matrixWorld': [list(row) for row in obj.matrix_world],
                 'materials': [slot.material.name if slot.material else None for slot in obj.material_slots],
                 'modifiers': [{'name': m.name, 'type': m.type} for m in obj.modifiers],
                 'positions': positions, 'normals': normals, 'uvs': uvs, 'indices': indices,
                 'triangles': len(mesh.loop_triangles)}
        meshes.append(entry)
    materials = []
    for material in bpy.data.materials:
        nodes = material.node_tree.nodes if material.use_nodes else []
        materials.append({'name': material.name, 'images': [{'node': n.name, 'image': n.image.name,
            'path': n.image.filepath, 'size': list(n.image.size), 'colorSpace': n.image.colorspace_settings.name}
            for n in nodes if n.type == 'TEX_IMAGE' and n.image]})
    for path, digest in inputs.items():
        if sha(ROOT / path) != digest:
            raise ValueError('Original source changed during extraction: ' + path)
    result = {'schemaVersion': 1, 'source': manifest['source'], 'license': manifest['license'],
              'sourceMasterSha256': sha(master), 'sourceFilesUnchanged': inputs,
              'blender': bpy.app.version_string, 'pid': os.getpid(), 'seconds': time.time() - started,
              'rendered': False, 'meshes': meshes, 'materials': materials}
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / 'source-extract.json').write_text(json.dumps(result, separators=(',', ':')) + '\n', encoding='utf8')
    summary = {**result, 'meshes': [{k: v for k, v in m.items() if k not in ('positions', 'normals', 'uvs', 'indices')} for m in meshes]}
    (CACHE / 'source-inspection.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf8')
    print(json.dumps(summary, indent=2), flush=True)

if __name__ == '__main__':
    extract()
