"""Native three-view atlas and two/three orthogonal planes for one full shoot.

This is an isolated comparison, never a replacement in the two R5 pilot trees.
Every tile renders all six source leaves; source photos are read-only.
"""
import hashlib
import json
import math
import os
import sys
from pathlib import Path
os.environ['OMP_NUM_THREADS'] = '2'
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import bpy
import numpy as np
from mathutils import Matrix, Vector
import bake as common

ROOT = common.ROOT
CACHE = ROOT / '.cache/trees-r5-bake-20261025/multiplane-v2'
TEXTURES = ROOT / 'public/textures/trees/20261025-r5/multiplane-v2'
MODELS = ROOT / 'public/models/vegetation/seasonal-r5/multiplane-v2'
MASTER = ROOT / 'assets/blender/vegetation/seasonal-r5/r5-multiplane-v2.blend'
SHOOT = common.DATA['shoot']
KEY = 'LeafSet024-shoot-r5-orthogonal-v2'


def opacity_statistics(file, tiles=1):
    image = bpy.data.images.load(str(file), check_existing=False)
    image.colorspace_settings.name = 'Non-Color'
    pixels = np.asarray(image.pixels[:], dtype=np.float32).reshape(image.size[1], image.size[0], 4)
    assert np.max(np.ptp(pixels[:, :, :3], axis=2)) < 1e-6
    assert pixels[:, :, 3].min() == 1 and pixels[:, :, :3].min() == 0 and pixels[:, :, :3].max() == 1
    width = image.size[0] // tiles
    result = {'maskChannel': 'RGB-luminance', 'fileChannels': 'RGB', 'decodedAlpha': 1,
        'tiles': [{'tile': i, 'pixelsAtCutoff': int(np.count_nonzero(pixels[:, i * width:(i + 1) * width, 0] >= .5)),
                   'totalPixels': image.size[1] * width} for i in range(tiles)]}
    bpy.data.images.remove(image)
    return result


def alpha_mask(file):
    image = bpy.data.images.load(str(file), check_existing=False)
    alpha = np.asarray(image.pixels[:], dtype=np.float32).reshape(image.size[1], image.size[0], 4)[:, :, 3].copy()
    bpy.data.images.remove(image)
    return alpha >= .5


def basis(yaw, elevation=0):
    frame = SHOOT['frame']; angle = math.radians(yaw); pitch = math.radians(elevation)
    normal = (Vector(frame['normal']) * math.cos(angle) + Vector(frame['right']) * math.sin(angle)) * math.cos(pitch) + Vector(frame['up']) * math.sin(pitch)
    right = Vector(frame['up']).cross(normal).normalized(); up = normal.cross(right).normalized()
    return right, up, normal.normalized()


def measure(reference, candidate):
    source = int(np.count_nonzero(reference)); visible = int(np.count_nonzero(candidate))
    intersection = int(np.count_nonzero(reference & candidate)); union = int(np.count_nonzero(reference | candidate))
    assert source > 0 and visible > 0
    height, width = reference.shape; padded = np.pad(reference, 1, constant_values=False)
    neighbours = [padded[y:y + height, x:x + width] for y in range(3) for x in range(3)]
    dilated = np.logical_or.reduce(neighbours); eroded = np.logical_and.reduce(neighbours)
    distant_extra = int(np.count_nonzero(candidate & ~dilated)); distant_missing = int(np.count_nonzero(eroded & ~candidate))
    return {'sourcePixels': source, 'candidatePixels': visible, 'intersectionPixels': intersection, 'unionPixels': union,
        'falsePositivePixels': visible - intersection, 'falseNegativePixels': source - intersection,
        'intersectionOverUnion': intersection / union, 'recall': intersection / source,
        'precision': intersection / visible, 'areaRatio': visible / source,
        'overshootRelativeToSource': (visible - intersection) / source, 'missingRelativeToSource': (source - intersection) / source,
        'falsePositiveBeyondOnePixel': distant_extra, 'falseNegativeBeyondOnePixel': distant_missing,
        'overshootBeyondOnePixelRelativeToSource': distant_extra / source, 'missingBeyondOnePixelRelativeToSource': distant_missing / source,
        'toleranceDefinition': '8-neighbour 3x3 source dilation/erosion; both normalized by raw source area; raw metrics retained'}


def main():
    for directory in (CACHE, TEXTURES, MODELS): directory.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'; scene.render.threads = 2; scene.cycles.samples = 32
    scene.cycles.seed = 0; scene.cycles.use_animated_seed = False; scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 4; scene.cycles.transparent_max_bounces = 32
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_depth = '16'
    scene.view_settings.look = 'None'; scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
    scene.world.use_nodes = True; background = scene.world.node_tree.nodes['Background']; background.inputs['Strength'].default_value = 0
    source_asset = next(a for a in json.loads((ROOT / 'shared/data/assets/tree-materials-manifest.json').read_text())['assets'] if a['id'] == 'LeafSet024')
    original = common.original_material(source_asset)
    original_frame = SHOOT['frame']; r, u, n = [np.asarray(original_frame[name]) for name in ('right', 'up', 'normal')]
    anchor = np.asarray(original_frame['anchor']); source_positions = np.asarray(SHOOT['positions'])
    frames = []
    for index, (right, up, normal) in enumerate(((r, u, n), (-n, u, r), (r, -n, u))):
        assert np.linalg.norm(np.cross(right, up) - normal) < 1e-8
        coordinates = (source_positions - anchor) @ np.column_stack([right, up, normal])
        lo = coordinates.min(axis=0); hi = coordinates.max(axis=0)
        frames.append({'tile': index, 'right': right.tolist(), 'up': up.tolist(), 'normal': normal.tolist(),
            'projectedBounds': [lo.tolist(), hi.tolist()], 'centre': ((lo[:2] + hi[:2]) / 2).tolist(), 'sourceCoordinates': coordinates})
    side = max(max(f['projectedBounds'][1][axis] - f['projectedBounds'][0][axis] for axis in (0, 1)) for f in frames) * 1.08
    atlas_objects = []
    for frame in frames:
        points = frame['sourceCoordinates'].copy()
        points[:, 0] += (frame['tile'] + .5) * side - frame['centre'][0]
        points[:, 1] += .5 * side - frame['centre'][1]
        obj = common.make_mesh('atlas-source-projection-' + str(frame['tile']), points.tolist(), SHOOT['faces'], SHOOT['uvs'], SHOOT['rank'], 'LeafSet024')
        obj['projectionOnly'] = True; obj.data.materials.append(original); atlas_objects.append(obj)
    camera = bpy.data.objects.new('atlas-camera', bpy.data.cameras.new('atlas-camera')); scene.collection.objects.link(camera)
    camera.location = (1.5 * side, .5 * side, 2); camera.data.type = 'ORTHO'; camera.data.ortho_scale = 3 * side; scene.camera = camera
    scene.render.resolution_x = 3072; scene.render.resolution_y = 1024
    maps = {}; identity_frame = {'right': [1, 0, 0], 'up': [0, 1, 0], 'normal': [0, 0, 1]}
    for semantic in ('color', 'opacity', 'normalGL', 'roughness'):
        material = common.data_material(original, semantic, identity_frame)
        for obj in atlas_objects: obj.data.materials[0] = material
        scene.render.film_transparent = semantic != 'opacity'; scene.render.image_settings.color_mode = 'RGB' if semantic == 'opacity' else 'RGBA'
        scene.view_settings.view_transform = 'Standard' if semantic == 'color' else 'Raw'
        file = TEXTURES / ('orthogonal-shoot-' + semantic + '.png'); scene.render.filepath = str(file)
        bpy.ops.render.render(write_still=True)
        maps[semantic] = {**common.file_info(file), 'colorSpace': 'sRGB' if semantic == 'color' else 'linear', 'size': [3072, 1024]}
        if semantic == 'opacity': maps[semantic].update(opacity_statistics(file, 3))
    for obj in atlas_objects: obj.hide_render = True
    source = common.make_mesh('source-six-leaf-shoot', SHOOT['positions'], SHOOT['faces'], SHOOT['uvs'], SHOOT['rank'], 'LeafSet024')
    source.data.materials.append(original)
    derived = common.original_material({'id': KEY, 'maps': {key: {'runtimePath': value['path'], 'sha256': value['sha256']} for key, value in maps.items()}})
    derived.node_tree.nodes['sourceNormal'].inputs['Strength'].default_value = 1
    objects = [source]; exports = []
    for count in (2, 3):
        positions, faces, uv = [], [], []
        for frame in frames[:count]:
            right, up = np.asarray(frame['right']), np.asarray(frame['up']); cx, cy = frame['centre']
            for x, y in ((-.5, -.5), (.5, -.5), (.5, .5), (-.5, .5)):
                positions.append((anchor + right * (cx + x * side) + up * (cy + y * side)).tolist())
                uv.append(((frame['tile'] + x + .5) / 3, y + .5))
            start = len(positions) - 4; faces.extend([(start, start + 1, start + 2), (start, start + 2, start + 3)])
        obj = common.make_mesh(str(count) + '-orthogonal-planes', positions, faces, uv, SHOOT['rank'], KEY)
        obj.data.materials.append(derived); objects.append(obj)
        for item in (source, obj):
            item['sourceTreeId'] = SHOOT['sourceTreeId']; item['sourceBranchId'] = SHOOT['branchId']; item['sourceRootXZ'] = SHOOT['sourceRootXZ']; item['trunkRadius'] = SHOOT['trunkRadius']
        exports.append({'planes': count, 'triangles': len(faces), 'materialCount': 1, 'photographicSourceParts': 6,
            'geometry': common.export([obj], MODELS / (str(count) + '-planes.glb'))})
    source_export = common.export([source], MODELS / 'source.glb')
    views = [(0, 0), (45, 0), (60, 0), (90, 0), (45, 30)]
    centre = Vector(source_positions.mean(axis=0)); points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    width = max(2.1 * max(max(abs((point - centre).dot(axis)) for point in points) for axis in basis(yaw, elevation)[:2]) for yaw, elevation in views)
    scene.render.resolution_x = 768; scene.render.resolution_y = 768; camera.data.ortho_scale = width
    scene.render.film_transparent = True; scene.render.image_settings.color_mode = 'RGBA'; scene.view_settings.view_transform = 'Standard'
    background.inputs['Color'].default_value = (.16, .18, .2, 1); background.inputs['Strength'].default_value = .5
    light = bpy.data.objects.new('comparison-softbox', bpy.data.lights.new('comparison-softbox', 'AREA')); scene.collection.objects.link(light)
    light.location = centre + Vector(n) * 1.5 - Vector(r) * .7 + Vector(u) * .8
    light.rotation_euler = (centre - light.location).to_track_quat('-Z', 'Y').to_euler(); light.data.energy = 60; light.data.shape = 'DISK'; light.data.size = 1
    comparisons = []
    for obj in objects: obj.hide_render = True
    for yaw, elevation in views:
        right, up, normal = basis(yaw, elevation)
        camera.location = centre + normal * 2; camera.rotation_euler = Matrix((right, up, normal)).transposed().to_euler()
        reference_mask = None
        for obj in objects:
            obj.hide_render = False; file = CACHE / f'{obj.name}-yaw{yaw}-elevation{elevation}.png'; scene.render.filepath = str(file)
            bpy.ops.render.render(write_still=True); mask = alpha_mask(file); obj.hide_render = True
            if obj == source: reference_mask = mask
            comparisons.append({**common.file_info(file), 'object': obj.name, 'yawDegrees': yaw, 'elevationDegrees': elevation,
                'coverageChannel': 'rendered RGBA alpha at cutoff0.5; runtime atlas separately uses RGB', 'coverage': measure(reference_mask, mask)})
    for image in bpy.data.images:
        if image.source == 'FILE' and image.size[0] > 0 and image.users > 0: image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(MASTER), compress=True)
    worst_views = []
    for obj in objects[1:]:
        rows = [row for row in comparisons if row['object'] == obj.name]
        worst = min(rows, key=lambda row: row['coverage']['intersectionOverUnion'])
        worst_views.append({'object': obj.name, 'lowestIou': worst['coverage']['intersectionOverUnion'],
            'lowestIouView': [worst['yawDegrees'], worst['elevationDegrees']],
            'maximumOvershootBeyondOnePixel': max(row['coverage']['overshootBeyondOnePixelRelativeToSource'] for row in rows),
            'maximumMissingBeyondOnePixel': max(row['coverage']['missingBeyondOnePixelRelativeToSource'] for row in rows)})
    report = {'version': 2, 'comparisonOnly': True, 'accepted': False, 'generator': common.file_info(Path(__file__)),
        'helpers': [common.file_info(Path(common.__file__))], 'nativeMaster': common.file_info(MASTER),
        'source': {key: SHOOT[key] for key in ('sourceTreeId', 'sourceRootXZ', 'trunkRadius', 'branchId', 'parentId', 'rank', 'parts')},
        'sourceGeometry': source_export, 'sourcePhotographicParts': 6, 'sourceTriangles': 24,
        'projectionFrames': [{key: value for key, value in frame.items() if key != 'sourceCoordinates'} for frame in frames],
        'tileSideMetres': side, 'atlas': {'columns': 3, 'rows': 1, 'tilePixels': 1024, 'materialKey': KEY, 'maps': maps},
        'candidates': exports, 'comparisons': comparisons, 'worstViews': worst_views,
        'render': {'engine': 'Cycles CPU', 'threads': 2, 'samples': 32, 'seed': 0, 'denoise': False, 'orthographicWidthMetres': width, 'viewport': [768, 768]},
        'limitations': ['Coverage/overshoot are image-space native studio measurements, not GPU timing or acceptance.',
            'Every plane repeats a full projection of the same six source leaves; overlapping projections can create false silhouette and self-shadow.',
            'The third plane is edge-on in the horizontal yaw sweep; elevated45/30 additionally exposes its behavior.',
            'Original full R5 pilot trees remain unchanged; no whole-tree multi-plane export.']}
    (MODELS / 'comparison-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    (CACHE / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('R5_MULTIPLANE_COMPLETE', flush=True)


if __name__ == '__main__': main()
