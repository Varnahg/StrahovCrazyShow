"""Shared CPU authoring preview; deliberately not the game renderer."""
import hashlib
import json
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache/trees-r6-shape-20261026'
SOURCE = ROOT / 'assets/blender/vegetation/seasonal-r5/r5-full-coverage-pilots.blend'
NATIVE = ROOT / 'assets/blender/vegetation/seasonal-r6/r6-b5-branch3-comparison.blend'
SOURCE_SHA = '9ac77f6b319de92d7dcb32e165e9ce59ad4e172507fcfa90bbec3c772e39d152'


def info(path):
    return {'path': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def positions(mesh):
    data = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get('co', data)
    return data.reshape(-1, 3)


def array_hash(collection, attribute, components, dtype=np.float32):
    data = np.empty(len(collection) * components, dtype=dtype)
    collection.foreach_get(attribute, data)
    return hashlib.sha256(data.tobytes()).hexdigest()


def mesh_audit(obj):
    mesh = obj.data
    p = positions(mesh)
    return {'name': obj.name, 'vertices': len(p), 'polygons': len(mesh.polygons),
            'triangles': sum(len(poly.vertices) - 2 for poly in mesh.polygons),
            'bounds': [p.min(0).tolist(), p.max(0).tolist()],
            'positions': hashlib.sha256(p.tobytes()).hexdigest(),
            'topology': array_hash(mesh.loops, 'vertex_index', 1, np.int32),
            'uv': {u.name: array_hash(u.data, 'uv', 2) for u in mesh.uv_layers},
            'colors': {c.name: array_hash(c.data, 'color', 4) for c in mesh.color_attributes},
            'materials': [m.name for m in mesh.materials], 'origin': list(obj.location),
            'properties': {k: list(v) if hasattr(v, 'to_list') else v for k, v in obj.items()}}


def studio():
    scene = bpy.context.scene
    for obj in scene.objects:
        obj.hide_render = True
    for collection in bpy.data.collections:
        collection.hide_viewport = False
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'; scene.render.threads = 2
    scene.cycles.samples = 12; scene.cycles.seed = 62
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1100; scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
    if scene.world is None: scene.world = bpy.data.worlds.new('R6 authoring world')
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (.22, .25, .28, 1)
    background.inputs['Strength'].default_value = .6
    light = bpy.data.objects.new('R6 fixed softbox', bpy.data.lights.new('R6 fixed softbox', 'AREA'))
    scene.collection.objects.link(light); light.hide_render = False
    light.location = (-6, -8, 17)
    light.rotation_euler = (Vector((0, 0, 7)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    light.data.energy = 2400; light.data.shape = 'DISK'; light.data.size = 8
    camera = bpy.data.objects.new('R6 comparison camera', bpy.data.cameras.new('R6 comparison camera'))
    scene.collection.objects.link(camera); scene.camera = camera
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = 20.5
    return scene


def set_view(scene, degrees):
    # Source root-local Blender XY = game X,-Z. User camera root[-85,-61]
    # relative to tree[-67.59,-60.96] gives horizontal vector[-17.41,+.04].
    centre = Vector((.9, -.8, 7.1))
    angle = math.atan2(.04, -17.41) + math.radians(degrees)
    scene.camera.location = centre + Vector((40 * math.cos(angle), 40 * math.sin(angle), 1.8))
    scene.camera.rotation_euler = (centre - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
    return {'viewDegrees': degrees, 'camera': list(scene.camera.location), 'target': list(centre),
            'projection': 'orthographic whole-crown authoring comparison', 'orthoScale': 20.5}


def render(scene, objects, variant, degrees, bare):
    view = set_view(scene, degrees)
    for obj in objects:
        obj.hide_render = bare and obj.get('role') == 'foliage'
    path = CACHE / f'{variant}-{degrees:02d}-{"bare" if bare else "summer"}.png'
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    for obj in objects: obj.hide_render = True
    return {**info(path), **view, 'variant': variant, 'bare': bare,
            'provenance': 'Native Blender authoring preview, not an in-game screenshot'}


def control():
    CACHE.mkdir(parents=True, exist_ok=True)
    assert info(SOURCE)['sha256'] == SOURCE_SHA
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    source_objects = [mesh_audit(obj) for obj in bpy.context.scene.objects if obj.type == 'MESH']
    scene = studio()
    objects = [bpy.data.objects['own-broadleaf__lod0__' + role] for role in ('wood', 'foliage')]
    renders = [render(scene, objects, 'control', degrees, bare)
               for degrees in (0, 45) for bare in (True, False)]
    (CACHE / 'control.json').write_text(json.dumps({'source': info(SOURCE), 'objects': source_objects,
        'renders': renders, 'engine': 'Cycles CPU', 'threads': 2, 'samples': 12}, indent=2) + '\n')


if __name__ == '__main__': control()
