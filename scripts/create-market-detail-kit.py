"""Author the source-backed market flue in Blender, then export evaluated LODs.

Run: blender --background --threads 2 --python scripts/create-market-detail-kit.py
No downloaded photograph is used as a texture. Model dimensions are interpretation.
The editable highest source is saved BEFORE evaluating lower-detail variants.
"""
import bpy
import json
import math
import pathlib
import hashlib
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/blender/market-detail-kit'
PUBLIC = ROOT / 'public/models/architecture/market-detail-kit'
DATA = ROOT / 'shared/data/market-detail-kit.json'
DOC = ROOT / 'docs/building-modeling-20261012/references'
SOURCE_ID = 'mapy-east-market-20230601'
SOURCE_URL = 'https://mapy.com/cs/zakladni?q=Recharging%20bar&source=firm&id=13296995&pid=101883310&newest=1&yaw=4.343&x=14.3938139&y=50.0812633&ds=2&z=17&ovl=8'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for store in [bpy.data.meshes, bpy.data.materials, bpy.data.curves]:
        for block in list(store):
            if block.users == 0:
                store.remove(block)


def author(quality):
    reset()
    radial = {'highest': 64, 'near': 24, 'far': 12}[quality]
    rod_segments = {'highest': 16, 'near': 8, 'far': 4}[quality]
    bevel_segments = {'highest': 3, 'near': 1, 'far': 0}[quality]
    root = bpy.data.objects.new('Potraviny_Rko_east_flue', None)
    bpy.context.collection.objects.link(root)
    root['osmWay'] = '7645350'
    root['sourceId'] = SOURCE_ID
    root['sourceUrl'] = SOURCE_URL
    root['captureDate'] = '2023-06-01'
    root['reviewedAt'] = '2026-10-12'
    root['dimensionalConfidence'] = 'photographic-proportion-interpretation-not-survey'
    root['placement'] = 'existing east edge: a + tangent*(length*.18) - outward*.3; baseY unchanged'
    root['coordinateContract'] = 'Blender X=tangent Y=-outward Z=up; exported X=tangent Y=up Z=outward'
    root['quality'] = quality
    mats = {
        'galvanized': material('galvanized', (.42, .46, .45), .78, .34),
        'darkMetal': material('darkMetal', (.17, .18, .17), .7, .5),
    }
    authored = []

    def finish(obj, role, label, bevel=0):
        obj.name = label
        obj.parent = root
        obj.data.materials.append(mats[role])
        obj['sourceId'] = SOURCE_ID
        obj['materialRole'] = role
        obj['dimensions'] = 'interpretation; not surveyed'
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if bevel and bevel_segments:
            modifier = obj.modifiers.new('Manufactured edge radius', 'BEVEL')
            modifier.width = bevel
            modifier.segments = bevel_segments
            modifier.affect = 'EDGES'
            modifier.limit_method = 'ANGLE'
            modifier.angle_limit = math.radians(25)
            modifier.harden_normals = True
            weighted = obj.modifiers.new('Area weighted manufactured normals', 'WEIGHTED_NORMAL')
            weighted.keep_sharp = True
            weighted.weight = 40
        authored.append(obj)
        return obj

    def cylinder(label, bottom, top, radius, role='galvanized', vertices=None, bevel=0):
        # Source construction is Z-up; no runtime transform is baked into this kit.
        delta = Vector(top) - Vector(bottom)
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices or radial, radius=radius,
                                            depth=delta.length, end_fill_type='NGON',
                                            location=(Vector(top) + Vector(bottom)) * .5)
        obj = bpy.context.object
        obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
        for poly in obj.data.polygons:
            poly.use_smooth = len(poly.vertices) == 4
        return finish(obj, role, label, bevel)

    def box(label, centre, size, role='darkMetal', bevel=0):
        bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
        obj = bpy.context.object
        obj.dimensions = size
        return finish(obj, role, label, bevel)

    # The existing model envelope is retained: radius .17, total height 5.4 m.
    # A real open-ended shaft, vent gap and rain cap replace the old solid cylinder.
    rings = []
    for z, radius in [(0, .17), (5.15, .17), (5.15, .155), (0, .155)]:
        rings.extend([(math.cos(i * math.tau / radial) * radius,
                       math.sin(i * math.tau / radial) * radius, z) for i in range(radial)])
    faces = []
    for layer in range(4):
        for i in range(radial):
            j = (i + 1) % radial
            a, b, c, d = layer * radial + i, layer * radial + j, ((layer + 1) % 4) * radial + j, ((layer + 1) % 4) * radial + i
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new('Open flue shell mesh')
    mesh.from_pydata(rings, [], faces)
    mesh.update()
    shaft = bpy.data.objects.new('Open round flue shell', mesh)
    bpy.context.collection.objects.link(shaft)
    for p in mesh.polygons:
        p.use_smooth = p.index // radial in (0, 2)
    finish(shaft, 'galvanized', 'Open round flue shell')

    # Visible seams/straps are source-backed; their exact spacing is interpretation.
    for i, z in enumerate([1.4, 2.7, 4.0]):
        cylinder('Joint collar %d' % (i + 1), (0, 0, z - .027), (0, 0, z + .027), .184, bevel=.002)
    for i, z in enumerate([.65, 2.65, 4.55]):
        # Rear brackets face the existing solid facade, never create a new obstacle.
        box('Wall stand-off %d' % (i + 1), (0, .235, z), (.16, .08, .055), bevel=.002)
    for i in range(3):
        angle = i * math.tau / 3
        p = (math.cos(angle) * .135, math.sin(angle) * .135)
        cylinder('Rain cap support %d' % (i + 1), (*p, 5.1), (*p, 5.285), .014, 'darkMetal', rod_segments)
    bpy.ops.mesh.primitive_cone_add(vertices=radial, radius1=.26, radius2=.105,
                                    depth=.105, location=(0, 0, 5.3275))
    finish(bpy.context.object, 'darkMetal', 'Rain shedding conical cap', .003)
    cylinder('Rain cap crown', (0, 0, 5.38), (0, 0, 5.4), .105, 'darkMetal', bevel=.002)
    cylinder('Rain cap folded outer rim', (0, 0, 5.26), (0, 0, 5.28), .26, 'darkMetal', bevel=.002)

    # Source photo has a low protective barred enclosure around the flue.
    # Two side returns and a front grille remain within +/- .28 m locally.
    # A -.3 m facade inset therefore contains all details inside the solid footprint.
    for i, (x, y) in enumerate([(-.25, .08), (-.25, -.25), (.25, -.25), (.25, .08)]):
        cylinder('Protective grille corner %d' % (i + 1), (x, y, .05), (x, y, 1.38), .021, 'darkMetal', rod_segments)
    for level, z in enumerate([.16, 1.32]):
        for side, (a, b) in enumerate([((-.25, .08, z), (-.25, -.25, z)), ((-.25, -.25, z), (.25, -.25, z)), ((.25, -.25, z), (.25, .08, z))]):
            cylinder('Protective grille rail %d_%d' % (level, side), a, b, .017, 'darkMetal', rod_segments)
    for i, x in enumerate([-.15, -.05, .05, .15]):
        cylinder('Protective grille front bar %d' % (i + 1), (x, -.25, .16), (x, -.25, 1.32), .012, 'darkMetal', rod_segments)
    if quality != 'far':
        for side in [-1, 1]:
            cylinder('Protective grille side bar %d' % side, (side * .25, -.085, .16), (side * .25, -.085, 1.32), .012, 'darkMetal', rod_segments)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    bpy.context.scene['sourceUrl'] = SOURCE_URL
    bpy.context.scene['interpretation'] = 'Identified flue + visible cap/collars/cage. Exact dimensions, count and spacing are authored estimates; original facade placement retained.'
    return root, authored


def extract(authored):
    """Read evaluated Blender mesh split normals and triangulation, grouped for batching."""
    deps = bpy.context.evaluated_depsgraph_get()
    parts = {}
    for obj in authored:
        evaluated = obj.evaluated_get(deps)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            role = obj['materialRole']
            geometry = parts.setdefault(role, {'positions': [], 'normals': [], 'uvs': [], 'indices': []})
            matrix = obj.matrix_world
            normal_matrix = matrix.to_3x3().inverted().transposed()
            for tri in mesh.loop_triangles:
                for loop_index in tri.loops:
                    loop = mesh.loops[loop_index]
                    p = matrix @ mesh.vertices[loop.vertex_index].co
                    n = normal_matrix @ mesh.corner_normals[loop_index].vector
                    n.normalize()
                    index = len(geometry['positions']) // 3
                    geometry['positions'].extend(round(float(v), 7) for v in [p.x, p.z, -p.y])
                    geometry['normals'].extend(round(float(v), 7) for v in [n.x, n.z, -n.y])
                    geometry['uvs'].extend([round(float(p.x), 7), round(float(p.z), 7)])
                    geometry['indices'].append(index)
        finally:
            evaluated.to_mesh_clear()
    result = [{'name': role, 'materialRole': role, 'geometry': geometry} for role, geometry in parts.items()]
    return {'parts': result, 'triangles': sum(len(p['geometry']['indices']) // 3 for p in result), 'materialCount': len(result)}


def validate(lod):
    minp = [math.inf] * 3
    maxp = [-math.inf] * 3
    degenerate = 0
    normal_opposed = 0
    for part in lod['parts']:
        g = part['geometry']
        assert len(g['normals']) == len(g['positions'])
        assert len(g['uvs']) * 3 == len(g['positions']) * 2
        assert all(math.isfinite(v) for key in ['positions', 'normals', 'uvs'] for v in g[key])
        for i in range(0, len(g['positions']), 3):
            for axis in range(3):
                minp[axis] = min(minp[axis], g['positions'][i + axis])
                maxp[axis] = max(maxp[axis], g['positions'][i + axis])
        for i in range(0, len(g['indices']), 3):
            ids = g['indices'][i:i + 3]
            points = [Vector(g['positions'][j * 3:j * 3 + 3]) for j in ids]
            cross = (points[1] - points[0]).cross(points[2] - points[0])
            if cross.length_squared < 1e-16:
                degenerate += 1
            normals = [Vector(g['normals'][j * 3:j * 3 + 3]) for j in ids]
            if cross.dot(sum(normals, Vector())) < -1e-9:
                normal_opposed += 1
    assert degenerate == 0, degenerate
    assert normal_opposed == 0, normal_opposed
    assert abs(minp[1]) < 1e-6 and abs(maxp[1] - 5.4) < 1e-6, (minp, maxp)
    assert max(abs(minp[0]), abs(maxp[0]), abs(minp[2]), abs(maxp[2])) <= .28, (minp, maxp)
    return {'bounds': {'min': minp, 'max': maxp}, 'degenerateTriangles': degenerate, 'normalOpposedTriangles': normal_opposed}


def main():
    for path in [OUT, PUBLIC, DOC]:
        path.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    root, authored = author('highest')
    highest = extract(authored)
    highest['audit'] = validate(highest)
    (OUT / 'highest-geometry.json').write_text(json.dumps(highest, separators=(',', ':')), encoding='utf-8')
    source = OUT / 'market-flue-highest.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    highest_objects = len(authored)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    reopened = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert len(reopened) == highest_objects
    assert all(o.parent and o.parent.get('osmWay') == '7645350' for o in reopened)
    reopened_data = extract(sorted(reopened, key=lambda o: o.name))
    reopened_audit = validate(reopened_data)
    assert reopened_data['triangles'] == highest['triangles']
    assert reopened_audit['bounds'] == highest['audit']['bounds']
    assert any(o.modifiers for o in reopened), 'Highest source must retain editable edge modifiers'
    variants = {}
    for quality in ['near', 'far']:
        root, authored = author(quality)
        lod = extract(authored)
        lod['audit'] = validate(lod)
        path = PUBLIC / ('market-flue-' + quality + '.glb')
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                                  export_apply=True, export_yup=True, export_extras=True)
        lod['glb'] = {'url': '/models/architecture/market-detail-kit/' + path.name, 'sha256': sha(path), 'bytes': path.stat().st_size}
        variants[quality] = lod
    manifest = {
        'schemaVersion': 1,
        'coordinateSystem': 'local x=tangent, y=up, z=facade outward; metres; origin=original flue bottom centre',
        'source': {'id': SOURCE_ID, 'url': SOURCE_URL, 'captureDate': '2023-06-01', 'visuallyReviewedAt': '2026-10-12', 'osmWay': '7645350', 'photoArchived': False, 'usage': 'Reference only; no source pixels or mural artwork copied', 'visible': ['round metal shaft', 'joint collars', 'raised rain cap', 'low protective barred enclosure'], 'interpretation': 'All metric dimensions, collar count/spacing, exact bracket shape and grille subdivision are unmeasured authored proportions.'},
        'placement': {'buildingId': '7645350', 'face': 'existing edge nx>0.8 and length>12', 'alongFraction': .18, 'outwardOffset': -.3, 'baseY': 'existing building baseY', 'totalHeight': 5.4, 'shaftRadius': .17, 'collision': 'all geometry stays inside the original footprint; no added traversable surface'},
        'materials': {'galvanized': {'colorLinear': [.42, .46, .45], 'metallic': .78, 'roughness': .34}, 'darkMetal': {'colorLinear': [.17, .18, .17], 'metallic': .7, 'roughness': .5}},
        'highest': {'blend': 'assets/blender/market-detail-kit/' + source.name, 'sha256': sha(source), 'objects': highest_objects, 'triangles': highest['triangles'], 'audit': highest['audit']},
        'kits': {'flue': variants},
    }
    DATA.write_text(json.dumps(manifest, separators=(',', ':')), encoding='utf-8')
    audit = {'status': 'passed', 'blenderVersion': bpy.app.version_string, 'cpuThreads': 2, 'gpuRender': False, 'source': manifest['source'], 'highest': manifest['highest'], 'reopenedHighestObjects': len(reopened), 'reopenedHighestTriangles': reopened_data['triangles'], 'reopenedHighestBounds': reopened_audit['bounds'], 'retainedEditableModifiers': True, 'highestGeometrySha256': sha(OUT / 'highest-geometry.json'), 'variants': {key: {k:v for k,v in val.items() if k != 'parts'} for key,val in variants.items()}, 'dataSha256': sha(DATA), 'checks': ['highest source saved before LOD authorship', 'actual native .blend reopened', 'evaluated triangle counts and bounds match after reopen', 'split normals and triangle winding', 'no degenerate triangles', 'entire envelope remains inside original facade footprint', 'near and far share exact origin and highest point', 'no image textures or external media dependencies']}
    (DOC / 'market-kit-blender-audit.json').write_text(json.dumps(audit, indent=2), encoding='utf-8')
    print('MARKET_DETAIL_KIT_OK', json.dumps({k: v for k,v in audit.items() if k not in ['source', 'checks']}))


main()
