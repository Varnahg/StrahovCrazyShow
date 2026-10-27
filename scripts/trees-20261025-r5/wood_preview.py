"""CPU-only native R4/A/B bare-wood comparison; no runtime model export."""
import hashlib
import json
import math
import os
from pathlib import Path
os.environ['OMP_NUM_THREADS'] = '2'
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/trees-r5-bake-20261025'
DATA = json.loads((ROOT / '.cache/trees-r5-authoring-20261025/prepared.json').read_text())


def info(file):
    return {'path': file.relative_to(ROOT).as_posix(), 'bytes': file.stat().st_size,
            'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}


def unit(vector):
    return vector / np.linalg.norm(vector)


def tube(branches, name, material):
    positions, faces, uv, loop_uv = [], [], [], []
    for branch in branches:
        points = np.array(branch['points']); radii = branch['radii']; sides = branch['sides']
        base = len(positions); travel = 0.; prior = 0.; circumference = math.tau * radii[0]
        for i, point in enumerate(points):
            direction = unit(points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)])
            side = unit(np.cross(direction, [0, 1, 0] if abs(direction[1]) < .95 else [1, 0, 0]))
            up = np.cross(direction, side)
            if i: travel += float(np.linalg.norm(point - points[i - 1]))
            for j in range(sides):
                angle = j * math.tau / sides
                positions.append((point + radii[i] * (side * math.cos(angle) + up * math.sin(angle))).tolist())
                uv.append((j / sides * circumference, travel))
                if i:
                    a, b = base + (i - 1) * sides + j, base + (i - 1) * sides + (j + 1) % sides
                    c, d = base + i * sides + (j + 1) % sides, base + i * sides + j
                    faces.extend([(a, b, c), (a, c, d)])
                    u, u2 = j / sides * circumference, (j + 1) / sides * circumference
                    loop_uv.extend([(u, prior), (u2, prior), (u2, travel), (u, prior), (u2, travel), (u, travel)])
            prior = travel
        for j in range(1, sides - 1):
            first = (base, base + j + 1, base + j)
            end = base + (len(points) - 1) * sides
            last = (end, end + j, end + j + 1)
            faces.extend([first, last]); loop_uv.extend([uv[v] for v in first]); loop_uv.extend([uv[v] for v in last])
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(positions, [], faces); mesh.update()
    layer = mesh.uv_layers.new(name='sourceBarkUV')
    for loop in mesh.loops: layer.data[loop.index].uv = loop_uv[loop.index]
    for polygon in mesh.polygons: polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material); obj['comparisonOnly'] = True
    return obj, len(faces)


def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    source = ROOT / DATA['sourceMaster']['path']; assert info(source)['sha256'] == DATA['sourceMaster']['sha256']
    names = ['own-broadleaf__lod0__wood', 'own-conifer__lod0__wood']
    with bpy.data.libraries.load(str(source), link=False) as (available, target):
        assert all(name in available.objects for name in names)
        target.objects = names
    baseline = {}
    for obj in target.objects:
        bpy.context.collection.objects.link(obj); obj.location = (0, 0, 0); obj.hide_set(False); obj.hide_render = True
        baseline[obj.name.split('__')[0]] = obj
    objects = {key: [obj] for key, obj in baseline.items()}; audits = []
    for candidate in DATA['nearWood']:
        source_object = baseline[candidate['id']]
        obj, triangles = tube(candidate['branches'], candidate['id'] + '__' + candidate['candidateId'], source_object.data.materials[0])
        assert triangles == candidate['audit']['triangleCount']
        obj['sourceRootXZ'] = candidate['sourceRootXZ']; obj['trunkRadius'] = candidate['trunkRadius']; obj.hide_render = True
        objects[candidate['id']].append(obj)
        audits.append({'name': obj.name, 'triangles': triangles, 'audit': candidate['audit']})
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'; scene.render.threads = 2; scene.cycles.samples = 12; scene.cycles.use_denoising = False
    scene.render.resolution_x = 1280; scene.render.resolution_y = 900; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = False; scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'; scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
    scene.world.use_nodes = True; background = scene.world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (.22, .25, .28, 1); background.inputs['Strength'].default_value = .6
    light = bpy.data.objects.new('wood-softbox', bpy.data.lights.new('wood-softbox', 'AREA')); scene.collection.objects.link(light)
    light.location = (-6, -8, 17); light.rotation_euler = (Vector((0, 0, 7)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    light.data.energy = 2400; light.data.shape = 'DISK'; light.data.size = 8
    camera = bpy.data.objects.new('wood-camera', bpy.data.cameras.new('wood-camera')); scene.collection.objects.link(camera)
    camera.data.type = 'ORTHO'; scene.camera = camera
    renders = []; close_views = []
    for kind, candidates in objects.items():
        centre = Vector((0, 0, 6.7 if kind == 'own-broadleaf' else 6.0))
        camera.location = centre + Vector((0, -40, 1.8))
        camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = 21 if kind == 'own-broadleaf' else 18.5
        for obj in candidates:
            obj.hide_render = False
            file = CACHE / ('wood-' + obj.name + '.png'); scene.render.filepath = str(file)
            bpy.ops.render.render(write_still=True); renders.append({**info(file), 'object': obj.name, 'size': [1280, 900], 'view': 'whole'})
            obj.hide_render = True
    # A close perspective view exposes the actual higher-order polygon error,
    # not just the similar silhouette of a tree hundreds of pixels across.
    scene.render.resolution_x = 1280; scene.render.resolution_y = 720
    camera.data.type = 'PERSP'; camera.data.sensor_fit = 'VERTICAL'; camera.data.sensor_height = 32
    camera.data.lens = 32 / (2 * math.tan(.85 / 2)); camera.data.clip_start = .01
    for kind, candidates in objects.items():
        profile = next(c for c in DATA['nearWood'] if c['id'] == kind and c['candidateId'] == 'projection075')
        branch = max((b for b in profile['branches'] if b['depth'] >= 3),
            key=lambda b: max(b['radii']) * (1 - math.cos(math.pi / b['sides'])))
        centre = Vector(branch['points'][0]).lerp(Vector(branch['points'][1]), .1)
        outward = Vector((centre.x, centre.y, .3)).normalized()
        camera.location = centre + outward * 2
        camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
        radial_error = max(branch['radii']) * (1 - math.cos(math.pi / branch['sides']))
        close_views.append({'id': kind, 'branchId': branch['id'], 'depth': branch['depth'], 'sides': branch['sides'],
            'centre': list(centre), 'camera': list(camera.location), 'distanceMetres': 2, 'verticalFov': .85,
            'radialErrorMetres': radial_error, 'radialErrorPixels': radial_error * 720 / (4 * math.tan(.85 / 2))})
        for obj in candidates:
            obj.hide_render = False
            file = CACHE / ('wood-close-' + obj.name + '.png'); scene.render.filepath = str(file)
            bpy.ops.render.render(write_still=True); renders.append({**info(file), 'object': obj.name, 'size': [1280, 720], 'view': 'close-2m'})
            obj.hide_render = True
    for image in bpy.data.images:
        if image.source == 'FILE' and image.size[0] > 0 and image.users > 0: image.pack()
    master = ROOT / 'assets/blender/vegetation/seasonal-r5/r5-wood-comparisons.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(master), compress=True)
    report = {'version': 1, 'comparisonOnly': True, 'runtimeExports': False, 'generator': info(Path(__file__)),
        'sourceMaster': DATA['sourceMaster'], 'nativeMaster': info(master), 'candidates': audits, 'renders': renders, 'closeViews': close_views,
        'render': {'engine': 'Cycles CPU', 'threads': 2, 'samples': 12, 'wholeSize': [1280, 900], 'closeSize': [1280, 720], 'viewTransform': 'Standard'}}
    (CACHE / 'wood-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('R5_WOOD_PREVIEW_COMPLETE', flush=True)


if __name__ == '__main__': main()
