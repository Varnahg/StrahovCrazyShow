"""Original text-directed asset pilot. No downloads, external assets or services."""
import bpy
import math
import json
import hashlib
import pathlib
import struct
import sys
import time
import traceback
from mathutils import Vector

OUT = pathlib.Path(sys.argv[sys.argv.index('--') + 1]).resolve()
PARAMS = json.loads((OUT / 'parameters.json').read_text(encoding='utf-8-sig'))
STARTED = time.time()
RECEIPT = {'status': 'started', 'checks': {}, 'limits': [
    'CPU authoring pilot, not a game FPS benchmark.',
    'One original procedural rigid-part object, not evidence for arbitrary organic generation.',
    'No target-engine runtime visual acceptance; Blender GLB reimport tested.',
]}


def write_json(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(name, condition, detail):
    RECEIPT['checks'][name] = {'passed': bool(condition), 'detail': detail}
    if not condition:
        raise AssertionError(name + ': ' + str(detail))


def material(name, color, metallic=0, roughness=.35, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat


def attach(obj, name, mat, parent=None):
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    obj.parent = parent
    for poly in getattr(obj.data, 'polygons', []):
        poly.use_smooth = True
    return obj


def sphere(name, loc, radius, mat, parent=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=radius)
    obj = attach(bpy.context.object, name, mat, parent)
    obj.location, obj.scale = loc, scale
    return obj


def torus(name, loc, major, minor, mat, parent=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=64, minor_segments=10,
                                   major_radius=major, minor_radius=minor)
    obj = attach(bpy.context.object, name, mat, parent)
    obj.location = loc
    return obj


def tube(name, points, radius, mat, parent=None, cyclic=False):
    curve = bpy.data.curves.new(name + '_geometry', 'CURVE')
    curve.dimensions, curve.bevel_depth, curve.bevel_resolution = '3D', radius, 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj = attach(bpy.context.object, name, mat, parent)
    obj.select_set(False)
    return obj


def panel_point(u, v, shell=0):
    width = .035 + .345 * math.sin(math.pi * u) ** .78
    return (.045 + .38 * math.sin(math.pi * u) - .25 * u + .055 * v * v + shell,
            width * v, 1.49 * u)


def make_panel(index, root, ceramic, copper):
    theta = 2 * math.pi * index / PARAMS['panel_count']
    hinge = bpy.data.objects.new(f'Hinge_{index + 1:02d}', None)
    bpy.context.collection.objects.link(hinge)
    hinge.parent, hinge.location = root, (.37 * math.cos(theta), .37 * math.sin(theta), -.63)
    hinge.rotation_euler = (0, 0, theta)
    hinge.empty_display_type, hinge.empty_display_size = 'ARROWS', .15
    rows, cols = 24, 10
    vertices = [panel_point(i / rows, 2 * j / cols - 1, shell)
                for shell in (0, -.045) for i in range(rows + 1) for j in range(cols + 1)]
    layer = (rows + 1) * (cols + 1)
    faces = []
    for side in range(2):
        for i in range(rows):
            for j in range(cols):
                a = side * layer + i * (cols + 1) + j
                quad = (a, a + 1, a + cols + 2, a + cols + 1)
                faces.append(quad if side == 0 else tuple(reversed(quad)))
    boundary = list(range(cols + 1))
    boundary += [i * (cols + 1) + cols for i in range(1, rows + 1)]
    boundary += [rows * (cols + 1) + j for j in range(cols - 1, -1, -1)]
    boundary += [i * (cols + 1) for i in range(rows - 1, 0, -1)]
    for a, b in zip(boundary, boundary[1:] + boundary[:1]):
        faces.append((a, b, b + layer, a + layer))
    mesh = bpy.data.meshes.new(f'Panel_{index + 1:02d}_geometry')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f'Panel_{index + 1:02d}', mesh)
    bpy.context.collection.objects.link(obj)
    attach(obj, obj.name, ceramic, hinge)
    mesh.materials.append(copper)
    for face in list(mesh.polygons)[2 * rows * cols:]:
        face.material_index = 1
    for edge_side in (-1, 1):
        tube(f'Panel_{index + 1:02d}_CopperEdge_{edge_side}',
             [panel_point(i / rows, edge_side, .012) for i in range(rows + 1)], .017, copper, hinge)
    tube(f'Panel_{index + 1:02d}_Spine',
         [panel_point(i / rows, 0, .02) for i in range(3, rows - 2)], .009, copper, hinge)
    sphere(f'Hinge_{index + 1:02d}_Pin', (0, 0, .025), .075, copper, hinge, (.8, 1.25, .8))
    for u in (.28, .5, .72):
        sphere(f'Panel_{index + 1:02d}_Inlay_{u}', panel_point(u, 0, .045), .035, copper, hinge, (.35, 1, 1.9))
    return hinge


def animation(root, hinges):
    for frame in range(1, 122):
        phase = (frame - 1) / 120
        pulse = .5 - .5 * math.cos(2 * math.pi * phase)
        root.location = (0, 0, 1.72 + PARAMS['root_bob_meters'] * math.sin(2 * math.pi * phase))
        root.rotation_euler = (.025 * math.sin(2 * math.pi * phase), 0,
                               PARAMS['root_turn_radians'] * math.sin(2 * math.pi * phase))
        root.keyframe_insert(data_path='location', frame=frame)
        root.keyframe_insert(data_path='rotation_euler', frame=frame)
        for hinge in hinges:
            hinge.rotation_euler.y = PARAMS['opening_radians'] * pulse
            hinge.keyframe_insert(data_path='rotation_euler', frame=frame)
    for obj in [root] + hinges:
        obj.animation_data.action.name = 'Lantern_Base::' + obj.name
        obj.animation_data.action.use_fake_user = True


def action_data(action):
    return [{'slot': bag.slot_handle, 'curves': [
        {'path': fc.data_path, 'index': fc.array_index,
         'keys': [[float(k.co.x), float(k.co.y), k.interpolation] for k in fc.keyframe_points]}
        for fc in bag.fcurves]}
        for layer in action.layers for strip in layer.strips for bag in strip.channelbags]


def digest_json(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def mesh_digest(objects):
    return digest_json({obj.name: {'vertices': [list(v.co) for v in obj.data.vertices],
                                  'polygons': [list(p.vertices) for p in obj.data.polygons],
                                  'materials': [m.name for m in obj.data.materials]}
                        for obj in objects if obj.type == 'MESH'})


def matrices(names, frames):
    values = {}
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        values[str(frame)] = {name: [float(x) for row in bpy.data.objects[name].matrix_world for x in row]
                              for name in names}
    return values


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def stage():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = PARAMS['render']['samples']
    scene.cycles.use_denoising = True
    scene.render.threads_mode, scene.render.threads = 'FIXED', 4
    scene.render.resolution_x = PARAMS['render']['width']
    scene.render.resolution_y = PARAMS['render']['height']
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('Stage_World')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.035, .045, .065, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
    floor = material('Stage_Charcoal', (.018, .025, .04), roughness=.44)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.22, depth=.18, location=(0, 0, .09))
    attach(bpy.context.object, 'Stage_Plinth', floor)
    bevel = bpy.context.object.modifiers.new('Soft plinth edge', 'BEVEL')
    bevel.width, bevel.segments = .055, 3
    bpy.ops.mesh.primitive_plane_add(size=200)
    attach(bpy.context.object, 'Stage_Floor', floor)
    for name, loc, power, color, size in [
        ('Stage_Key', (3, -4, 6), 650, (.7, .83, 1), 4),
        ('Stage_Rim', (-3, 1.5, 4), 850, (1, .53, .24), 3),
        ('Stage_Fill', (0, 4, 3), 500, (.25, .55, 1), 3)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.color, data.shape, data.size = power, color, 'DISK', size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        aim(obj, (0, 0, 1.5))
    data = bpy.data.cameras.new('Stage_Camera')
    camera = bpy.data.objects.new('Stage_Camera', data)
    scene.collection.objects.link(camera)
    camera.location = (4.3, -6.2, 4.2)
    aim(camera, (0, 0, 1.6))
    data.type, data.ortho_scale = 'ORTHO', 4.6
    scene.camera = camera


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    check('glb_header', magic == 0x46546C67 and version == 2 and length == len(data), [magic, version, length])
    size, kind = struct.unpack_from('<II', data, 12)
    check('glb_json_chunk', kind == 0x4E4F534A, kind)
    return json.loads(data[20:20 + size].decode())


def run():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps, scene.frame_start, scene.frame_end = 30, 1, 121
    scene.unit_settings.system = 'METRIC'
    RECEIPT['runtime'] = {'version': bpy.app.version_string, 'build_hash': bpy.app.build_hash.decode(),
                          'binary': bpy.app.binary_path, 'background': bpy.app.background}
    asset = bpy.data.collections.new('Star_Lantern_Asset')
    scene.collection.children.link(asset)
    root = bpy.data.objects.new('Lantern_Root', None)
    scene.collection.objects.link(root)
    ceramic = material('Midnight_Blue_Ceramic', (.018, .055, .12), .28, .25)
    copper = material('Brushed_Copper', (.72, .285, .115), .83, .26)
    coremat = material('Amber_Core_Emission', (1, .48, .10), .05, .22, 4)
    hinges = [make_panel(i, root, ceramic, copper) for i in range(6)]
    sphere('Lantern_Amber_Core', (0, 0, .09), .28, coremat, root, (1, 1, 1.27))
    torus('Lantern_Equatorial_Ring', (0, 0, -.39), .53, .035, copper, root)
    torus('Lantern_Lower_Halo', (0, 0, -.64), .43, .055, copper, root)
    sphere('Lantern_Bottom_Drop', (0, 0, -.78), .12, copper, root, (.8, .8, 1.5))
    torus('Lantern_Core_Crown', (0, 0, .46), .23, .022, copper, root)
    for i in range(6):
        angle = i * math.pi / 3
        sphere(f'Lantern_Core_Star_{i:02d}', (.23 * math.cos(angle), .23 * math.sin(angle), .46), .045, copper, root)
    animation(root, hinges)
    asset_objects = [root] + list(root.children_recursive)
    for obj in asset_objects:
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        asset.objects.link(obj)
    names = [root.name] + [obj.name for obj in hinges]
    RECEIPT['asset_stats'] = {'objects': len(asset_objects), 'meshes': sum(o.type == 'MESH' for o in asset_objects),
                             'vertices': sum(len(o.data.vertices) for o in asset_objects if o.type == 'MESH'),
                             'triangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in asset_objects if o.type == 'MESH'),
                             'materials': sorted({m.name for o in asset_objects if o.type == 'MESH' for m in o.data.materials}),
                             'animated_nodes': names}
    geometry_hash = mesh_digest(asset_objects)
    baseline_actions = {o.name: action_data(o.animation_data.action) for o in [root] + hinges}
    RECEIPT['baseline_action_hashes'] = {k: digest_json(v) for k, v in baseline_actions.items()}
    expected = matrices(names, PARAMS['sample_frames'])
    write_json('source-pose-samples.json', expected)
    stage()
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'star-lantern-source.blend'))
    native_hash = sha(OUT / 'star-lantern-source.blend')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in asset_objects:
        obj.select_set(True)
    preset = dict(filepath=str(OUT / 'star-lantern.glb'), export_format='GLB', use_selection=True,
                  export_animations=True, export_animation_mode='SCENE', export_anim_scene_split_object=False,
                  export_frame_range=True, export_force_sampling=True, export_frame_step=1,
                  export_anim_slide_to_zero=True, export_yup=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    check('export_preset_properties_exist', all(k in props for k in preset), list(preset))
    check('scene_enum_present', 'SCENE' in [item.identifier for item in props['export_animation_mode'].enum_items], 'SCENE')
    write_json('export-preset.json', preset)
    result = bpy.ops.export_scene.gltf(**preset)
    check('export_finished', 'FINISHED' in result, list(result))
    glb = read_glb(OUT / 'star-lantern.glb')
    animations = glb.get('animations', [])
    check('one_glb_clip', len(animations) == 1, [a.get('name') for a in animations])
    accessors = glb['accessors']
    times = [accessors[s['input']] for s in animations[0]['samplers']]
    duration = max(a['max'][0] for a in times) - min(a['min'][0] for a in times)
    check('duration_4_seconds', abs(duration - 4) < 1e-6, duration)
    target_names = {glb['nodes'][c['target']['node']]['name'] for c in animations[0]['channels']}
    check('animated_nodes_exported', set(names).issubset(target_names), sorted(target_names))
    RECEIPT['glb_stats'] = {'bytes': (OUT / 'star-lantern.glb').stat().st_size,
                            'clips': [a.get('name') for a in animations], 'duration_seconds': duration,
                            'nodes': len(glb['nodes']), 'meshes': len(glb['meshes']),
                            'channels': len(animations[0]['channels']), 'target_names': sorted(target_names)}
    for frame, filename in ((1, 'closed.png'), (61, 'open.png')):
        scene.frame_set(frame)
        scene.render.filepath = str(OUT / filename)
        bpy.ops.render.render(write_still=True)
    # Reopen the actual authoring file and inspect native curves before revising it.
    bpy.ops.wm.open_mainfile(filepath=str(OUT / 'star-lantern-source.blend'), load_ui=False, use_scripts=False)
    root = bpy.data.objects['Lantern_Root']
    hinges = [bpy.data.objects[f'Hinge_{i+1:02d}'] for i in range(6)]
    reopened_actions = {o.name: action_data(o.animation_data.action) for o in [root] + hinges}
    check('native_reopen_keys_unchanged', baseline_actions == reopened_actions,
          {'actions': len(reopened_actions), 'keys': sum(len(fc['keys']) for v in reopened_actions.values() for bag in v for fc in bag['curves'])})
    asset_objects = [root] + list(root.children_recursive)
    check('native_reopen_mesh_unchanged', mesh_digest(asset_objects) == geometry_hash, geometry_hash)
    first = hinges[0]
    original = first.animation_data.action
    old_hash = digest_json(action_data(original))
    revised = original.copy()
    revised.name = 'Lantern_Revision::Hinge_01_12percent'
    revised.use_fake_user = True
    first.animation_data.action = revised
    for frame in range(1, 122):
        pulse = .5 - .5 * math.cos(2 * math.pi * (frame - 1) / 120)
        first.rotation_euler.y = PARAMS['opening_radians'] * PARAMS['revision_panel_01_opening_multiplier'] * pulse
        first.keyframe_insert(data_path='rotation_euler', frame=frame)
    check('revision_original_action_preserved', digest_json(action_data(original)) == old_hash, old_hash)
    check('revision_geometry_preserved', mesh_digest(asset_objects) == geometry_hash, geometry_hash)
    check('revision_action_changed', digest_json(action_data(revised)) != old_hash, revised.name)
    bpy.context.scene.frame_set(61)
    check('revision_peak_matches_prompt', abs(first.rotation_euler.y - 1.02 * 1.12) < 1e-6, first.rotation_euler.y)
    RECEIPT['revision'] = {'original_action': original.name, 'revised_action': revised.name,
                           'original_action_sha256': old_hash, 'revised_action_sha256': digest_json(action_data(revised)),
                           'mesh_sha256': geometry_hash, 'peak_radians': first.rotation_euler.y}
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'star-lantern-revised.blend'))
    check('source_blend_file_unchanged', sha(OUT / 'star-lantern-source.blend') == native_hash, native_hash)
    # Standard glTF Y-up export, converted back to Blender Z-up by the importer.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    result = bpy.ops.import_scene.gltf(filepath=str(OUT / 'star-lantern.glb'))
    check('import_finished', 'FINISHED' in result, list(result))
    check('imported_named_nodes_exist', all(n in bpy.data.objects for n in names), names)
    imported_actions = {a.name: action_data(a) for a in bpy.data.actions}
    first_key = min(k[0] for bags in imported_actions.values() for bag in bags
                    for fc in bag['curves'] for k in fc['keys'])
    check('import_origin_is_integral_frame', abs(first_key - round(first_key)) < 1e-6, first_key)
    origin = int(round(first_key))
    RECEIPT['import_first_key_frame'] = origin
    imported = matrices(names, [f - 1 + origin for f in PARAMS['sample_frames']])
    errors = []
    for frame in PARAMS['sample_frames']:
        for name in names:
            error = max(abs(a - b) for a, b in zip(expected[str(frame)][name], imported[str(frame - 1 + origin)][name]))
            errors.append({'source_frame': frame, 'import_frame': frame - 1 + origin, 'node': name, 'max_matrix_component_error': error})
    maximum = max(row['max_matrix_component_error'] for row in errors)
    write_json('roundtrip-pose-errors.json', {'maximum_error': maximum, 'samples': errors, 'imported_matrices': imported})
    check('roundtrip_pose_tolerance', maximum < PARAMS['matrix_component_tolerance'], maximum)
    loop_error = max(abs(a-b) for n in names for a,b in zip(imported[str(origin)][n], imported[str(120 + origin)][n]))
    check('roundtrip_loop_endpoint', loop_error < PARAMS['matrix_component_tolerance'], loop_error)
    RECEIPT['imported_actions'] = {name: {'channelbags': len(data), 'keys': sum(len(fc['keys']) for bag in data for fc in bag['curves'])}
                                   for name, data in imported_actions.items()}
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'star-lantern-roundtrip.blend'))
    RECEIPT['source_geometry_sha256'] = geometry_hash
    RECEIPT['status'], RECEIPT['elapsed_seconds'] = 'passed', time.time() - STARTED
    RECEIPT['output_sha256'] = {p.name: sha(p) for p in OUT.iterdir()
                               if p.is_file() and p.suffix in {'.blend', '.glb', '.png', '.py', '.json', '.md'} and p.name != 'receipt.json'}
    write_json('receipt.json', RECEIPT)
    print('PILOT_OK', json.dumps({'elapsed_seconds': RECEIPT['elapsed_seconds'], 'pose_error': maximum, 'loop_error': loop_error}))


try:
    run()
except Exception:
    RECEIPT['status'] = 'failed'
    RECEIPT['exception'] = traceback.format_exc()
    RECEIPT['elapsed_seconds'] = time.time() - STARTED
    write_json('receipt.json', RECEIPT)
    traceback.print_exc()
    raise
