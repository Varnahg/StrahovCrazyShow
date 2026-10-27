"""Export the two root-approved R5 pilots; immutable R4 inputs remain untouched."""
import hashlib
import json
import math
import os
from pathlib import Path
os.environ['OMP_NUM_THREADS'] = '2'
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/trees-r5-bake-20261025/full-pilots'
OUTPUT = ROOT / 'public/models/vegetation/seasonal-r5'
NATIVE = ROOT / 'assets/blender/vegetation/seasonal-r5/r5-runtime-pilots.blend'
PREPARED = json.loads((ROOT / '.cache/trees-r5-authoring-20261025/prepared.json').read_text())
R4 = ROOT / '.cache/trees-pilot-20261025/r4-optimized'


def file_info(file):
    return {'path': file.relative_to(ROOT).as_posix(), 'bytes': file.stat().st_size,
            'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}


def load_objects(file, names):
    with bpy.data.libraries.load(str(file), link=False) as (available, target):
        assert all(name in available.objects for name in names)
        target.objects = names
    for obj in target.objects:
        bpy.context.collection.objects.link(obj)
        obj.location = (0, 0, 0); obj.rotation_euler = (0, 0, 0); obj.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    for obj in target.objects: obj.hide_set(False)
    return target.objects


def fir_polygon(source, part_by_rank, parts):
    mesh = source.data
    position = np.empty(len(mesh.vertices) * 3, dtype=np.float32); mesh.vertices.foreach_get('co', position); position = position.reshape(-1, 3)
    color = np.empty(len(mesh.vertices) * 4, dtype=np.float32); mesh.color_attributes.active_color.data.foreach_get('color', color)
    source_ranks = np.rint(color.reshape(-1, 4)[:, 3] * 65535).astype(np.int32)
    loops = np.empty(len(mesh.loops), dtype=np.int32); mesh.loops.foreach_get('vertex_index', loops)
    loop_uv = np.empty(len(mesh.loops) * 2, dtype=np.float32); mesh.uv_layers.active.data.foreach_get('uv', loop_uv)
    source_uv = np.empty((len(mesh.vertices), 2), dtype=np.float32); source_uv[loops] = loop_uv.reshape(-1, 2)
    unique, starts, counts = np.unique(source_ranks, return_index=True, return_counts=True)
    assert np.all(counts == 13), 'R4 Fir is exactly one 13-vertex twig per rank'
    assert np.all(np.diff(source_ranks) >= 0), 'R4 rank-contiguous input required'
    positions, uvs, faces, ranks = [], [], [], []
    maximum_fit_error = 0.
    for rank, start in zip(unique, starts):
        part = parts[part_by_rank[int(rank)]['partId']]
        base = np.array(part['attachmentUvBlender']); tip = np.array(part['axisTipUvBlender'])
        axis = (tip - base) / np.linalg.norm(tip - base)
        def features(coords):
            coords = np.asarray(coords)
            phase = np.clip((coords - base) @ axis / np.linalg.norm(tip - base), 0, 1)
            return np.column_stack([coords, np.ones(len(coords)), np.sin(math.pi * phase)])
        old_uv = source_uv[start:start + 13]; old_position = position[start:start + 13]
        coefficients = np.linalg.lstsq(features(old_uv), old_position, rcond=None)[0]
        maximum_fit_error = max(maximum_fit_error, float(np.max(np.linalg.norm(features(old_uv) @ coefficients - old_position, axis=1))))
        coordinates = part['polygonUv']; offset = len(positions)
        positions.extend((features(coordinates) @ coefficients).tolist()); uvs.extend(coordinates); ranks.extend([int(rank)] * 8)
        faces.extend((offset, offset + i + 1, offset + i + 2) for i in range(6))
    assert maximum_fit_error < 2e-5
    result = bpy.data.meshes.new(source.name + '-polygon8')
    result.from_pydata(positions, [], faces); result.update()
    layer = result.uv_layers.new(name='sourceUV')
    loop_indices = np.empty(len(result.loops), dtype=np.int32); result.loops.foreach_get('vertex_index', loop_indices)
    layer.data.foreach_set('uv', np.asarray(uvs, dtype=np.float32)[loop_indices].reshape(-1))
    colors = result.color_attributes.new(name='seasonDropRank', type='FLOAT_COLOR', domain='POINT')
    values = np.ones((len(positions), 4), dtype=np.float32); values[:, 3] = np.asarray(ranks) / 65535
    colors.data.foreach_set('color', values.reshape(-1)); result.color_attributes.active_color = colors; result.color_attributes.render_color_index = 0
    for polygon in result.polygons: polygon.use_smooth = True
    for material in mesh.materials: result.materials.append(material)
    source.data = result
    return {'components': len(unique), 'triangles': len(faces), 'maximumSourceFitErrorMetres': maximum_fit_error,
            'ranks': unique.tolist(), 'physicalMapping': 'same UV/base/anchor/orientation and boundary bend; only 8facet triangulation changes'}


def main():
    CACHE.mkdir(parents=True, exist_ok=True); OUTPUT.mkdir(parents=True, exist_ok=True)
    old_manifest = json.loads((R4 / 'models/pilot-manifest.json').read_text())
    wood_report = json.loads((ROOT / '.cache/trees-r5-bake-20261025/wood-report.json').read_text())
    assert file_info(R4 / 'tree-pilots.blend')['sha256'] == PREPARED['sourceMaster']['sha256']
    wood_file = ROOT / wood_report['nativeMaster']['path']; assert file_info(wood_file)['sha256'] == wood_report['nativeMaster']['sha256']
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    ids = ('own-broadleaf', 'own-conifer')
    names = [f'{key}__lod{lod}__{role}' for key in ids for lod in range(3) for role in ('wood', 'foliage')]
    originals = {obj.name: obj for obj in load_objects(R4 / 'tree-pilots.blend', names)}
    woods = load_objects(wood_file, [key + '__projection075' for key in ids])
    for key, wood in zip(ids, woods):
        old = originals.pop(key + '__lod0__wood')
        props = dict(old.items()); bpy.data.objects.remove(old, do_unlink=True)
        wood.name = key + '__lod0__wood'
        for prop, value in props.items(): wood[prop] = value
        wood['r5WoodProfile'] = 'projection075; higher-order max6; original branches/junctions retained'
    variants = []
    for key in ids:
        old = next(v for v in old_manifest['variants'] if v['id'] == key)
        candidate = next(v for v in PREPARED['nearWood'] if v['id'] == key and v['candidateId'] == 'projection075')
        variant = {k: old[k] for k in ('id', 'kind', 'sourceTreeId', 'sourceRootXZ', 'nominalHeight', 'nominalCrownDiameter', 'trunkRadius', 'sourcePositionUncertaintyMetres')}
        variant['woodProfile'] = candidate['audit']; variant['foliage'] = []
        if key == 'own-conifer':
            parts = {part['id']: part for part in PREPARED['fir']}
            by_rank = {int(part['rank']): part for part in old['foliage']['componentMetadata']}
            for lod in range(3):
                source = bpy.data.objects[f'{key}__lod{lod}__foliage']
                variant['foliage'].append({'lod': lod, **fir_polygon(source, by_rank, parts)})
        else:
            variant['foliage'] = [{'lod': lod['lod'], 'components': lod['components'], 'triangles': lod['triangles'],
                'photographicParts': lod['photographicParts'], 'ranks': lod['ranks'], 'policy': 'unchanged R4 foliage; LOD1/2 subset remains explicitly open'} for lod in old['foliage']['lods']]
        objects = [bpy.data.objects[f'{key}__lod{lod}__{role}'] for lod in range(3) for role in ('wood', 'foliage')]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.location = (0, 0, 0); obj['archetypeId'] = key; obj['sourceTreeId'] = old['sourceTreeId']
            obj['sourceRootXZ'] = old['sourceRootXZ']; obj['trunkRadius'] = old['trunkRadius']
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        file = OUTPUT / (key + '.glb')
        bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', use_selection=True, export_yup=True,
            export_extras=True, export_materials='NONE', export_vertex_color='ACTIVE', export_all_vertex_colors=True)
        variant['export'] = file_info(file); variants.append(variant)
    # Editable layers keep tree origins at zero; collection visibility selects
    # the tree without moving the root or the authored metric geometry.
    for key in ids:
        collection = bpy.data.collections.new('R5 ' + key); bpy.context.scene.collection.children.link(collection)
        for obj in list(bpy.context.scene.objects):
            if obj.get('archetypeId') == key:
                for existing in list(obj.users_collection): existing.objects.unlink(obj)
                collection.objects.link(obj); obj.hide_render = obj['lod'] != 0; obj.hide_set(obj['lod'] != 0)
        collection.hide_viewport = key == 'own-conifer'
    for image in bpy.data.images:
        if image.source == 'FILE' and image.size[0] > 0 and image.users > 0: image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE), compress=True)
    report = {'version': 1, 'generation': 'R5 full two-own pilots', 'generator': file_info(Path(__file__)),
        'sourceR4Master': PREPARED['sourceMaster'], 'sourceWoodMaster': wood_report['nativeMaster'], 'nativeMaster': file_info(NATIVE),
        'variants': variants, 'limitations': ['Only two existing placements; not the 110-tree catalogue.',
            'Broadleaf LOD1/2 still use the original R4 subset; multi-plane shoot is a separate unaccepted sample.',
            'No new full-game GPU proof; image acceptance applies to prior isolated Fir/wood comparisons.']}
    (OUTPUT / 'pilot-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    contract = {'version': 2, 'units': 'metres', 'rankEncoding': 'uint16-normalized',
        'coordinateSpace': 'root-local glTF Y-up; placement is separate', 'usage': 'two root-approved R5 pilot candidates; explicit QA selection', 'prototypes': {}, 'placements': []}
    for variant in variants:
        key = variant['id']; file = variant['export']
        contract['prototypes'][key] = {'sourceTreeId': variant['sourceTreeId'],
            'family': 'deciduous-broadleaf' if variant['kind'] == 'broadleaf' else 'evergreen-conifer',
            **{k: variant[k] for k in ('nominalHeight', 'nominalCrownDiameter', 'trunkRadius')},
            'dimensionBasis': 'same R4 source catalogue estimates; metric source leaf size preserved',
            'lods': [{'url': '/' + file['path'].removeprefix('public/'), 'bytes': file['bytes'], 'sha256': file['sha256'],
                'meshNames': [f'{key}__lod{lod}__wood', f'{key}__lod{lod}__foliage']} for lod in range(3)]}
        contract['placements'].append({'sourceTreeId': variant['sourceTreeId'], 'sourceRootXZ': variant['sourceRootXZ'],
            'positionUncertaintyMetres': variant['sourcePositionUncertaintyMetres'], 'prototypeCandidates': [key], 'selectedPrototypeId': None})
    (OUTPUT / 'runtime-contract.json').write_text(json.dumps(contract, indent=2) + '\n')
    (CACHE / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('R5_FULL_PILOTS_COMPLETE', flush=True)


if __name__ == '__main__': main()
