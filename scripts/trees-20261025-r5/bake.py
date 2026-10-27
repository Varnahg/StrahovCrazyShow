"""Native Cycles CPU R5 samples. Requires both authoring + bake task claims.

Run prepare.mjs first. Source photographs and R4 remain read-only. This creates
comparison assets, not a new runtime catalogue or a material-key substitution.
"""
import hashlib
import json
import math
import os
from pathlib import Path

os.environ['OMP_NUM_THREADS'] = '2'
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
PREPARED = ROOT / '.cache/trees-r5-authoring-20261025/prepared.json'
CACHE = ROOT / '.cache/trees-r5-bake-20261025'
MASTER = ROOT / 'assets/blender/vegetation/seasonal-r5'
TEXTURES = ROOT / 'public/textures/trees/20261025-r5'
MODELS = ROOT / 'public/models/vegetation/seasonal-r5'
DATA = json.loads(PREPARED.read_text())


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def file_info(file):
    return {'path': file.relative_to(ROOT).as_posix(), 'bytes': file.stat().st_size, 'sha256': sha(file)}


def make_mesh(name, positions, faces, uvs, rank, material_key):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(positions, [], faces)
    mesh.update()
    layer = mesh.uv_layers.new(name='sourceUV')
    for loop in mesh.loops:
        layer.data[loop.index].uv = uvs[loop.vertex_index]
    colors = mesh.color_attributes.new(name='seasonDropRank', type='FLOAT_COLOR', domain='POINT')
    for value in colors.data:
        value.color = (1, 1, 1, rank / 65535)
    mesh.color_attributes.active_color = colors
    mesh.color_attributes.render_color_index = 0
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj['sourceRank'] = rank
    obj['materialKey'] = material_key
    obj['comparisonOnly'] = True
    return obj


def original_material(asset):
    material = bpy.data.materials.new('original ' + asset['id'])
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get('Principled BSDF')
    for semantic, map_info in asset['maps'].items():
        file = ROOT / map_info['runtimePath']
        assert sha(file) == map_info['sha256'], f'Changed original {file}'
        texture = nodes.new('ShaderNodeTexImage')
        texture.name = semantic
        texture.image = bpy.data.images.load(str(file), check_existing=True)
        if semantic != 'color':
            texture.image.colorspace_settings.name = 'Non-Color'
        if semantic == 'normalGL':
            normal = nodes.new('ShaderNodeNormalMap')
            normal.name = 'sourceNormal'
            normal.inputs['Strength'].default_value = .45
            links.new(texture.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], shader.inputs['Normal'])
        elif semantic == 'opacity':
            cutoff = nodes.new('ShaderNodeMath'); cutoff.operation = 'GREATER_THAN'
            links.new(texture.outputs['Color'], cutoff.inputs[0]); cutoff.inputs[1].default_value = .5
            links.new(cutoff.outputs[0], shader.inputs['Alpha'])
        else:
            links.new(texture.outputs['Color'], shader.inputs[{'color': 'Base Color', 'roughness': 'Roughness', 'opacity': 'Alpha'}[semantic]])
    return material


def data_material(source, semantic, frame):
    material = source.copy()
    material.name = 'native unlit projection ' + semantic
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = nodes.get('Material Output')
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 1
    if semantic in ('color', 'roughness'):
        links.new(nodes.get(semantic).outputs['Color'], emission.inputs['Color'])
    elif semantic == 'opacity':
        emission.inputs['Color'].default_value = (1, 1, 1, 1)
    elif semantic == 'normalGL':
        source_normal = nodes.get('sourceNormal').outputs['Normal']
        # Orient both sides toward the receiver plane, then encode in its
        # right/up/normal tangent basis. This is not world-space RGB.
        facing = nodes.new('ShaderNodeVectorMath'); facing.operation = 'DOT_PRODUCT'
        links.new(source_normal, facing.inputs[0]); facing.inputs[1].default_value = frame['normal']
        sign = nodes.new('ShaderNodeMath'); sign.operation = 'LESS_THAN'
        links.new(facing.outputs['Value'], sign.inputs[0]); sign.inputs[1].default_value = 0
        twice = nodes.new('ShaderNodeMath'); twice.operation = 'MULTIPLY_ADD'
        links.new(sign.outputs[0], twice.inputs[0]); twice.inputs[1].default_value = -2; twice.inputs[2].default_value = 1
        oriented = nodes.new('ShaderNodeVectorMath'); oriented.operation = 'SCALE'
        links.new(source_normal, oriented.inputs[0]); links.new(twice.outputs[0], oriented.inputs['Scale'])
        combine = nodes.new('ShaderNodeCombineXYZ')
        for axis, name in enumerate(('right', 'up', 'normal')):
            project = nodes.new('ShaderNodeVectorMath'); project.operation = 'DOT_PRODUCT'
            links.new(oriented.outputs['Vector'], project.inputs[0]); project.inputs[1].default_value = frame[name]
            encode = nodes.new('ShaderNodeMath'); encode.operation = 'MULTIPLY_ADD'
            links.new(project.outputs['Value'], encode.inputs[0]); encode.inputs[1].default_value = .5; encode.inputs[2].default_value = .5
            links.new(encode.outputs[0], combine.inputs[axis])
        links.new(combine.outputs[0], emission.inputs['Color'])
    alpha = nodes.new('ShaderNodeMath'); alpha.operation = 'GREATER_THAN'
    links.new(nodes.get('opacity').outputs['Color'], alpha.inputs[0]); alpha.inputs[1].default_value = .5
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mixed = nodes.new('ShaderNodeMixShader')
    links.new(alpha.outputs[0], mixed.inputs[0])
    links.new(transparent.outputs[0], mixed.inputs[1])
    links.new(emission.outputs[0], mixed.inputs[2])
    links.new(mixed.outputs[0], output.inputs['Surface'])
    return material


def camera_for(frame, name):
    lo, hi = frame['bounds']
    width, height = hi[0] - lo[0], hi[1] - lo[1]
    right, up, normal = (Vector(frame[name]) for name in ('right', 'up', 'normal'))
    centre = Vector(frame['anchor']) + right * ((lo[0] + hi[0]) / 2) + up * ((lo[1] + hi[1]) / 2)
    obj = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    bpy.context.collection.objects.link(obj)
    obj.location = centre + normal * 2
    obj.rotation_euler = Matrix((right, up, normal)).transposed().to_euler()
    obj.data.type = 'ORTHO'; obj.data.ortho_scale = width
    scene = bpy.context.scene
    scene.camera = obj
    scene.render.resolution_x = 1024
    scene.render.resolution_y = round(1024 * height / width)
    return obj


def export(objects, file):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', use_selection=True,
        export_yup=True, export_extras=True, export_materials='NONE',
        export_vertex_color='ACTIVE', export_all_vertex_colors=True)
    return file_info(file)


def fir_samples(material):
    rows = []
    for part in DATA['fir']:
        geometry = part['sourceGeometry']
        uv = np.array(geometry['uvs']); positions = np.array(geometry['positions'])
        base = np.array(part['attachmentUvBlender']); tip = np.array(part['axisTipUvBlender'])
        axis = (tip - base) / np.linalg.norm(tip - base)
        def features(coords):
            coords = np.array(coords)
            phase = np.clip((coords - base) @ axis / np.linalg.norm(tip - base), 0, 1)
            return np.column_stack([coords, np.ones(len(coords)), np.sin(math.pi * phase)])
        coefficients, _, _, _ = np.linalg.lstsq(features(uv), positions, rcond=None)
        fit_error = float(np.max(np.linalg.norm(features(uv) @ coefficients - positions, axis=1)))
        assert fit_error < 2e-5, fit_error
        objects = []
        baseline = make_mesh(part['id'] + '__r4', geometry['positions'], geometry['faces'], geometry['uvs'], part['sourcePart']['rank'], 'fir_tree_01')
        objects.append(baseline)
        for variant, coords in [('polygon8', part['polygonUv']), ('quad-rejected', part['quadUv'])]:
            # Same physical UV mapping, anchor, orientation, and shallow bend
            # at boundary vertices. Six vs two triangles change interpolation.
            points = (features(coords) @ coefficients).tolist()
            faces = [(0, i + 1, i + 2) for i in range(len(coords) - 2)]
            objects.append(make_mesh(part['id'] + '__' + variant, points, faces, coords, part['sourcePart']['rank'], 'fir_tree_01'))
        for obj in objects:
            obj.data.materials.append(material)
            obj['sourceTreeId'] = part['sourceTreeId']
            obj['sourceRootXZ'] = part['sourceRootXZ']
            obj['trunkRadius'] = part['trunkRadius']
            obj['sourceBranchId'] = part['sourcePart']['branchId']
            obj.hide_render = True
        rows.append({'partId': part['id'], 'fitMaximumErrorMetres': fit_error, 'source': part['sourcePart'],
            'sourceTreeId': part['sourceTreeId'], 'sourceRootXZ': part['sourceRootXZ'], 'trunkRadius': part['trunkRadius'],
            'geometry': export(objects, MODELS / (part['id'] + '-comparison.glb')),
            'triangles': [len(geometry['faces']), 6, 2], 'quadAccepted': False})
    return rows


def fitted_frame(positions, anchor, right, up):
    right = Vector(right).normalized()
    up = Vector(up); up = (up - right * up.dot(right)).normalized()
    normal = right.cross(up).normalized()
    projected = [[(Vector(p) - Vector(anchor)).dot(axis) for axis in (right, up, normal)] for p in positions]
    lo = np.min(projected, axis=0); hi = np.max(projected, axis=0)
    pad = max(hi[0] - lo[0], hi[1] - lo[1]) * .05
    return {'anchor': list(anchor), 'right': list(right), 'up': list(up), 'normal': list(normal),
        'bounds': [[float(lo[0] - pad), float(lo[1] - pad)], [float(hi[0] + pad), float(hi[1] + pad)]]}


def preview(objects, frame, prefix):
    scene = bpy.context.scene
    camera = camera_for(frame, prefix + '-camera')
    lo, hi = frame['bounds']; width = hi[0] - lo[0]; height = hi[1] - lo[1]
    centre = Vector(frame['anchor']) + Vector(frame['right']) * ((lo[0] + hi[0]) / 2) + Vector(frame['up']) * ((lo[1] + hi[1]) / 2)
    # Both angles and every compared candidate share one crop large enough for
    # the entire 3D source; a deep shoot must not be clipped at 60 degrees.
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    crop_width = width
    for degrees in (0, 60):
        radians = math.radians(degrees)
        normal = Vector(frame['normal']) * math.cos(radians) + Vector(frame['right']) * math.sin(radians)
        right = Vector(frame['up']).cross(normal).normalized()
        crop_width = max(crop_width, 2.1 * max(abs((point - centre).dot(right)) for point in points))
    camera.data.ortho_scale = crop_width
    scene.render.resolution_x = 768; scene.render.resolution_y = round(768 * height / width)
    scene.cycles.samples = 12; scene.render.film_transparent = False
    scene.render.image_settings.color_mode = 'RGBA'; scene.view_settings.view_transform = 'Standard'
    background = scene.world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (.16, .18, .20, 1)
    background.inputs['Strength'].default_value = .5
    light = bpy.data.objects.new(prefix + '-softbox', bpy.data.lights.new(prefix + '-softbox', 'AREA'))
    bpy.context.collection.objects.link(light)
    light.location = centre + Vector(frame['normal']) * 1.5 - Vector(frame['right']) * .7 + Vector(frame['up']) * .8
    light.rotation_euler = (centre - light.location).to_track_quat('-Z', 'Y').to_euler()
    light.data.energy = 60; light.data.shape = 'DISK'; light.data.size = 1
    rendered = []
    for obj in scene.objects:
        if obj.type == 'MESH': obj.hide_render = True
    for degrees in (0, 60):
        radians = math.radians(degrees)
        normal = Vector(frame['normal']) * math.cos(radians) + Vector(frame['right']) * math.sin(radians)
        camera.location = centre + normal * 2
        camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
        # Keep receiver up vertical; tracking world Y would roll arbitrary tree axes.
        right = Vector(frame['up']).cross(normal).normalized()
        camera.rotation_euler = Matrix((right, Vector(frame['up']), normal)).transposed().to_euler()
        for obj in objects:
            obj.hide_render = False
            file = CACHE / (prefix + '-' + obj.name + f'-view{degrees}.png')
            scene.render.filepath = str(file); bpy.ops.render.render(write_still=True)
            rendered.append({**file_info(file), 'object': obj.name, 'viewDegrees': degrees})
            obj.hide_render = True
    bpy.data.objects.remove(light, do_unlink=True)
    return rendered


def main():
    # Explicit authoring output guard; the source is never used as a save path.
    for directory in (CACHE, MASTER, TEXTURES, MODELS):
        directory.mkdir(parents=True, exist_ok=True)
    for info in (DATA['sourceMaster'], DATA['sourceGeometry'], DATA['sourceManifest'], DATA['components'], DATA['sourceAxes']):
        assert sha(ROOT / info['path']) == info['sha256'], info['path']
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'; scene.render.threads = 2
    scene.cycles.samples = 16; scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 2; scene.cycles.transparent_max_bounces = 32
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '16'; scene.render.film_transparent = True
    scene.world.use_nodes = True; scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
    scene.view_settings.look = 'None'; scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
    manifest = json.loads((ROOT / 'shared/data/assets/tree-materials-manifest.json').read_text())
    originals = {a['id']: original_material(a) for a in manifest['assets']}
    fir = fir_samples(originals['fir_tree_01'])
    shoot = DATA['shoot']; frame = shoot['frame']
    source = make_mesh('leafy-shoot-source__rank32722', shoot['positions'], shoot['faces'], shoot['uvs'], shoot['rank'], 'LeafSet024')
    source['sourceTreeId'] = shoot['sourceTreeId']; source['sourceBranchId'] = shoot['branchId']
    source['sourceRootXZ'] = shoot['sourceRootXZ']; source['trunkRadius'] = shoot['trunkRadius']
    source.data.materials.append(originals['LeafSet024'])
    source_export = export([source], MODELS / 'leafy-shoot-source.glb')
    camera_for(frame, 'leafy-shoot-projection')
    maps = {}
    for semantic in ('color', 'opacity', 'normalGL', 'roughness'):
        source.data.materials[0] = data_material(originals['LeafSet024'], semantic, frame)
        scene.view_settings.view_transform = 'Standard' if semantic == 'color' else 'Raw'
        # White emission over a zero-strength black world produces an opacity
        # value in RGB, independent of the PNG alpha channel, as runtime expects.
        scene.render.film_transparent = semantic != 'opacity'
        scene.render.image_settings.color_mode = 'RGB' if semantic == 'opacity' else 'RGBA'
        file = TEXTURES / ('leafy-shoot-rank32722-' + semantic + '.png')
        scene.render.filepath = str(file)
        bpy.ops.render.render(write_still=True)
        maps[semantic] = {**file_info(file), 'colorSpace': 'sRGB' if semantic == 'color' else 'linear',
            'method': 'native Cycles orthographic emission render; no lights, exposure0, no AgX',
            'resolution': [scene.render.resolution_x, scene.render.resolution_y]}
        if semantic == 'opacity':
            decoded = bpy.data.images.load(str(file), check_existing=False)
            decoded.colorspace_settings.name = 'Non-Color'
            pixels = np.array(decoded.pixels[:], dtype=np.float32).reshape(-1, 4)
            check = {'maskChannel': 'RGB-luminance', 'fileChannels': 'RGB',
                'minimumRGB': float(pixels[:, :3].min()), 'maximumRGB': float(pixels[:, :3].max()),
                'maximumRGBChannelDifference': float(np.max(np.ptp(pixels[:, :3], axis=1))),
                'minimumDecodedAlpha': float(pixels[:, 3].min()), 'maximumDecodedAlpha': float(pixels[:, 3].max()),
                'pixelsAtOrAboveCutoff': int(np.count_nonzero(pixels[:, 0] >= .5)),
                'pixelsBelowCutoff': int(np.count_nonzero(pixels[:, 0] < .5))}
            assert check['minimumRGB'] == 0 and check['maximumRGB'] > .99
            assert check['maximumRGBChannelDifference'] < 1e-6 and check['minimumDecodedAlpha'] == 1
            assert check['pixelsAtOrAboveCutoff'] > 0 and check['pixelsBelowCutoff'] > 0
            maps[semantic].update(check)
            bpy.data.images.remove(decoded)
    source.data.materials[0] = originals['LeafSet024']
    lo, hi = frame['bounds']
    coords = [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]
    positions = [(Vector(frame['anchor']) + Vector(frame['right']) * p[0] + Vector(frame['up']) * p[1]).to_tuple() for p in coords]
    card = make_mesh('leafy-shoot-card__rank32722', positions, [(0, 1, 2), (0, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)], shoot['rank'], shoot['materialKey'])
    card['sourceBranchId'] = shoot['branchId']; card['sourceTreeId'] = shoot['sourceTreeId']; card.hide_render = True
    card['sourceRootXZ'] = shoot['sourceRootXZ']; card['trunkRadius'] = shoot['trunkRadius']
    card_export = export([card], MODELS / 'leafy-shoot-card.glb')
    derived = {'id': shoot['materialKey'], 'maps': {k: {'runtimePath': v['path'], 'sha256': v['sha256']} for k, v in maps.items()}}
    card_material = original_material(derived)
    card_material.node_tree.nodes['sourceNormal'].inputs['Strength'].default_value = 1
    card.data.materials.append(card_material)
    previews = preview([source, card], frame, 'leafy')
    part = next(p for p in DATA['fir'] if p['id'] == 'lower-right-spray')
    uv = np.array(part['sourceGeometry']['uvs']); pos = np.array(part['sourceGeometry']['positions'])
    affine = np.linalg.lstsq(np.column_stack([uv, np.ones(len(uv))]), pos, rcond=None)[0]
    axis = np.array(part['axisTipUvBlender']) - part['attachmentUvBlender']; axis /= np.linalg.norm(axis)
    side = np.array([axis[1], -axis[0]])
    fir_objects = [bpy.data.objects[part['id'] + '__' + suffix] for suffix in ('r4', 'polygon8', 'quad-rejected')]
    fir_points = [vertex.co.to_tuple() for obj in fir_objects for vertex in obj.data.vertices]
    fir_frame = fitted_frame(fir_points, part['sourcePart']['anchor'], affine[:2].T @ side, affine[:2].T @ axis)
    previews += preview(fir_objects, fir_frame, 'fir')
    for image in bpy.data.images:
        if image.source == 'FILE' and image.size[0] > 0:
            image.pack()
    scene.use_nodes = False; scene.view_settings.view_transform = 'Standard'
    master = MASTER / 'r5-comparisons.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(master), compress=True)
    report = {'version': 1, 'comparisonOnly': True, 'prepared': file_info(PREPARED), 'generator': file_info(Path(__file__)),
        'sourceCheckpoint': DATA['sourceCheckpoint'], 'sourceMaster': DATA['sourceMaster'], 'sourceManifest': DATA['sourceManifest'],
        'nativeMaster': file_info(master), 'fir': fir, 'shoot': {k: v for k, v in shoot.items() if k not in ('positions', 'uvs', 'faces')},
        'sourceGeometry': source_export, 'cardGeometry': card_export, 'maps': maps,
        'previews': previews,
        'normalConvention': 'OpenGL tangent frame: R right, G up, B camera-facing receiver normal; both source sides face receiver',
        'render': {'engine': 'Cycles CPU', 'threads': 2, 'samples': 16, 'denoise': False, 'lights': 0, 'alphaCutoff': .5},
        'limitations': ['Single orthographic source view; oblique/back views require comparison.',
            'No runtime v2 material-key substitution; no whole-tree export or GPU performance claim.',
            'Near wood is still a mathematical candidate; no new wood model exported.']}
    (ROOT / 'shared/data/assets/tree-r5-materials-manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    (CACHE / 'bake-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('R5_BAKE_COMPLETE', flush=True)


if __name__ == '__main__':
    main()
