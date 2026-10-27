"""Add full-source LOD1 foliage, preserving the frozen first R5 LOD0 and LOD2."""
import copy
import json
import os
import sys
from pathlib import Path
os.environ['OMP_NUM_THREADS'] = '2'
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import bpy
import numpy as np
from full_pilots import ROOT, file_info

FROZEN = ROOT / '.cache/trees-r5-bake-20261025/full-pilots/checkpoint/files'
OUTPUT = ROOT / 'public/models/vegetation/seasonal-r5'
CACHE = ROOT / '.cache/trees-r5-bake-20261025/full-coverage-mid'
NATIVE = ROOT / 'assets/blender/vegetation/seasonal-r5/r5-full-coverage-pilots.blend'


def vertices(mesh):
    positions = np.empty(len(mesh.vertices) * 3, dtype=np.float32); mesh.vertices.foreach_get('co', positions)
    colors = np.empty(len(mesh.vertices) * 4, dtype=np.float32); mesh.color_attributes.active_color.data.foreach_get('color', colors)
    loop_indices = np.empty(len(mesh.loops), dtype=np.int32); mesh.loops.foreach_get('vertex_index', loop_indices)
    loop_uv = np.empty(len(mesh.loops) * 2, dtype=np.float32); mesh.uv_layers.active.data.foreach_get('uv', loop_uv)
    uv = np.empty((len(mesh.vertices), 2), dtype=np.float32); uv[loop_indices] = loop_uv.reshape(-1, 2)
    return positions.reshape(-1, 3), colors.reshape(-1, 4), uv


def broadleaf_mid(source):
    positions, colors, uv = vertices(source.data)
    assert len(positions) % 6 == 0
    count = len(positions) // 6
    rank_rows = np.rint(colors[:, 3].reshape(-1, 6) * 65535).astype(np.int32)
    assert np.all(rank_rows == rank_rows[:, :1]), 'every source leaf must have one rank'
    corners = (np.arange(count)[:, None] * 6 + np.array([0, 1, 5, 4])).reshape(-1)
    positions = positions[corners]; colors = colors[corners]; uv = uv[corners]
    base = np.arange(count)[:, None] * 4
    faces = np.concatenate((base + np.array([0, 1, 2]), base + np.array([0, 2, 3])), axis=1).reshape(-1, 3)
    mesh = bpy.data.meshes.new('own-broadleaf__lod1__foliage-full-coverage')
    mesh.from_pydata(positions.tolist(), [], faces.tolist()); mesh.update()
    layer = mesh.uv_layers.new(name='sourceUV')
    loops = np.empty(len(mesh.loops), dtype=np.int32); mesh.loops.foreach_get('vertex_index', loops)
    layer.data.foreach_set('uv', uv[loops].reshape(-1))
    attribute = mesh.color_attributes.new(name='seasonDropRank', type='FLOAT_COLOR', domain='POINT')
    attribute.data.foreach_set('color', colors.reshape(-1)); mesh.color_attributes.active_color = attribute; mesh.color_attributes.render_color_index = 0
    for polygon in mesh.polygons: polygon.use_smooth = True
    for material in source.data.materials: mesh.materials.append(material)
    return mesh, count


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    original = json.loads((FROZEN / 'public/models/vegetation/seasonal-r5/pilot-manifest.json').read_text())
    contract = json.loads((FROZEN / 'public/models/vegetation/seasonal-r5/runtime-contract.json').read_text())
    source_native = FROZEN / original['nativeMaster']['path']
    assert file_info(source_native)['sha256'] == original['nativeMaster']['sha256']
    bpy.ops.wm.open_mainfile(filepath=str(source_native))
    for collection in bpy.data.collections: collection.hide_viewport = False
    bpy.context.view_layer.update()
    for obj in bpy.context.scene.objects: obj.hide_set(False)
    report = copy.deepcopy(original); report['generation'] = 'R5 full-coverage MID revision'
    report['sourceFullPilotManifest'] = file_info(FROZEN / 'public/models/vegetation/seasonal-r5/pilot-manifest.json')
    report['generator'] = file_info(Path(__file__))
    for variant in report['variants']:
        key = variant['id']; near = bpy.data.objects[key + '__lod0__foliage']; mid = bpy.data.objects[key + '__lod1__foliage']
        if variant['kind'] == 'broadleaf':
            mesh, physical_parts = broadleaf_mid(near); mid.data = mesh
        else:
            mid.data = near.data.copy(); mid.data.name = key + '__lod1__foliage-full-coverage'
            physical_parts = variant['foliage'][0]['components']
        _, near_colors, _ = vertices(near.data); _, mid_colors, _ = vertices(mid.data)
        near_ranks = np.unique(np.rint(near_colors[:, 3] * 65535).astype(np.int32))
        mid_ranks = np.unique(np.rint(mid_colors[:, 3] * 65535).astype(np.int32))
        assert np.array_equal(near_ranks, mid_ranks) and len(mid_ranks) == variant['foliage'][0]['components']
        triangles = sum(len(p.vertices) - 2 for p in mid.data.polygons)
        assert triangles == physical_parts * (2 if variant['kind'] == 'broadleaf' else 6)
        mid['componentCount'] = len(mid_ranks); mid['photographicPartCount'] = physical_parts
        mid['r5FoliagePolicy'] = 'all LOD0 source components; original positions UV and ranks; no density subset'
        variant['foliage'][1] = {'lod': 1, 'components': len(mid_ranks), 'photographicParts': physical_parts,
            'triangles': triangles, 'ranks': mid_ranks.tolist(), 'policy': mid['r5FoliagePolicy'],
            'sourceNearCorners': [0, 1, 5, 4] if variant['kind'] == 'broadleaf' else 'all original FirA vertices'}
        variant['lodProfile'] = 'full-coverage'
        objects = [bpy.data.objects[f'{key}__lod{lod}__{role}'] for lod in range(3) for role in ('wood', 'foliage')]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        file = OUTPUT / (key + '.glb')
        bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', use_selection=True, export_yup=True,
            export_extras=True, export_materials='NONE', export_vertex_color='ACTIVE', export_all_vertex_colors=True)
        variant['export'] = file_info(file)
        prototype = contract['prototypes'][key]; prototype['lodProfile'] = 'full-coverage'
        for lod in prototype['lods']:
            lod['bytes'] = variant['export']['bytes']; lod['sha256'] = variant['export']['sha256']
    for obj in bpy.context.scene.objects:
        obj.hide_render = obj.get('lod') != 0; obj.hide_set(obj.get('lod') != 0)
    bpy.data.collections['R5 own-conifer'].hide_viewport = True
    bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE), compress=True)
    report['nativeMaster'] = file_info(NATIVE)
    report['limitations'] = ['Only two existing source trees, no 110-tree catalogue.',
        'full-coverage marks LOD1 parity with LOD0 source components; LOD2 intentionally remains the frozen R5 subset.',
        'LOD1 wood remains the R4 22m projection budget; the new runtime hero threshold requires in-game validation.',
        'No multi-plane sample or new material key is used by these full pilots; no GPU performance acceptance.']
    (OUTPUT / 'pilot-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    (OUTPUT / 'runtime-contract.json').write_text(json.dumps(contract, indent=2) + '\n')
    (CACHE / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('R5_FULL_COVERAGE_MID_COMPLETE', flush=True)


if __name__ == '__main__': main()
