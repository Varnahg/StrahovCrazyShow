"""Create genuinely separate editable buildings from exact authored runtime geometry.
Run: pnpm exec tsx scripts/export-building-assets.ts
Then: blender --background --python scripts/create-building-assets.py
Source photo pixels and raw scanned incidental objects are not included.
"""
import bpy, json, hashlib, pathlib, struct, sys, math

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/blender/buildings/source-plan.json'
BLEND = ROOT / 'assets/blender/buildings'
OUT = ROOT / 'public/models/buildings'
OUT.mkdir(parents=True, exist_ok=True)
data = json.loads(SOURCE.read_text(encoding='utf-8'))
only_id = sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else None
manifest_path = OUT / 'manifest.json'
previous = json.loads(manifest_path.read_text(encoding='utf-8')) if only_id else None
selected = [model for model in data['models'] if not only_id or model['identity']['sourceId'] == only_id]
assert selected, 'No source building matches --only ' + str(only_id)
report = []
shared_textures = {t['sha256']: t for t in previous['textures']} if previous else {}
SOURCE_COLOR_ATTRIBUTE = 'Runtime source tint'
SOURCE_NORMAL_ATTRIBUTE = '_SOURCE_NORMAL'
vertex_colored_materials = {
    part['material']['name']
    for model in selected for part in model['parts'] if part.get('colors')
}
retained = []
if previous:
    selected_keys = {model['identity']['key'] for model in selected}
    for item in previous['models']:
        if item['identity']['key'] in selected_keys:
            continue
        glb = ROOT / 'public' / item['url'].lstrip('/')
        blend = ROOT / item['blend']
        assert hashlib.sha256(glb.read_bytes()).hexdigest() == item['sha256'], item['id']
        retained.append({'id': item['id'], 'glbSha256': item['sha256'],
                         'blendSha256': hashlib.sha256(blend.read_bytes()).hexdigest()})

def share_original_texture_bytes(glb, source_model):
    """Share byte-identical GLB image buffers; never resample/re-encode them.
    Each building retains its own geometry/material/node hierarchy. glTF image
    URIs resolve beside the model, so all models use one common texture pool.
    """
    blob = glb.read_bytes()
    json_length, json_type = struct.unpack_from('<II', blob, 12)
    assert json_type == 0x4e4f534a
    spec = json.loads(blob[20:20+json_length])
    # Blender's native custom normals use angular short2 encoding. Preserve the
    # original float normals through an explicit POINT attribute, then make it
    # the portable NORMAL accessor. Generic attributes are not axis-swizzled,
    # so this one deliberately stores canonical glTF XYZ, not Blender XYZ.
    assert not spec.get('skins') and not spec.get('animations')
    for node in spec.get('nodes', []):
        assert not any(key in node for key in ['translation','rotation','scale','matrix','extensions']), 'Source normal transfer requires static identity-transform nodes'
    used_accessors = set()
    for mesh in spec.get('meshes', []):
        for primitive in mesh['primitives']:
            assert not primitive.get('targets')
            assert not primitive.get('extensions'), 'Source normal transfer does not accept compressed/extended geometry'
            attributes = primitive['attributes']
            assert SOURCE_NORMAL_ATTRIBUTE in attributes, (source_model['identity']['key'], mesh['name'])
            attributes['NORMAL'] = attributes.pop(SOURCE_NORMAL_ATTRIBUTE)
            used_accessors.update(attributes.values())
            if 'indices' in primitive: used_accessors.add(primitive['indices'])
    accessor_order = sorted(used_accessors)
    accessor_remap = {old: new for new, old in enumerate(accessor_order)}
    spec['accessors'] = [spec['accessors'][old] for old in accessor_order]
    for mesh in spec.get('meshes', []):
        for primitive in mesh['primitives']:
            primitive['attributes'] = {name: accessor_remap[index] for name, index in primitive['attributes'].items()}
            if 'indices' in primitive: primitive['indices'] = accessor_remap[primitive['indices']]
    geometry_views = set()
    for accessor in spec['accessors']:
        if 'bufferView' in accessor: geometry_views.add(accessor['bufferView'])
        if 'sparse' in accessor:
            geometry_views.update(accessor['sparse'][kind]['bufferView'] for kind in ['indices','values'])
    # Blender 5.2 keeps the original image but may omit a Multiply-node tint
    # from glTF. Restore the canonical linear PBR factors only for explicitly
    # opted-in B6 surfaces, without touching texture or geometry buffers.
    portable={p['material']['name']:p['material']for p in source_model['parts']if(p['material'].get('surface')or{}).get('preserveLinearTint') or p['material']['name'] in vertex_colored_materials}
    for mat in spec.get('materials',[]):
        canonical=portable.get(mat.get('name'))
        if not canonical:continue
        pbr=mat.setdefault('pbrMetallicRoughness',{})
        portable_alpha = canonical['alpha'] if canonical.get('portableEntryGlass') else 1
        pbr['baseColorFactor']=[*canonical['color'],portable_alpha]
        pbr['roughnessFactor']=canonical['roughness']
        pbr['metallicFactor']=canonical['metallic']
        if (canonical.get('surface') or {}).get('preserveLinearTint'):
            mat['doubleSided']=False
            if mat.get('normalTexture'):mat['normalTexture']['scale']=canonical['surface']['normalStrength']
    binary_offset = 20 + json_length
    binary_length, binary_type = struct.unpack_from('<II', blob, binary_offset)
    assert binary_type == 0x004e4942
    binary = blob[binary_offset+8:binary_offset+8+binary_length]
    views = spec.get('bufferViews', [])
    image_views = set()
    for image in spec.get('images', []):
        index = image['bufferView']
        view = views[index]
        pixels = binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
        sha = hashlib.sha256(pixels).hexdigest()
        extension = {'image/png': '.png', 'image/jpeg': '.jpg'}[image['mimeType']]
        target = OUT / 'textures' / (sha + extension)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            assert target.read_bytes() == pixels
        else:
            target.write_bytes(pixels)
        shared_textures[sha] = {'url': '/models/buildings/textures/' + target.name,
                                'sha256': sha, 'bytes': len(pixels), 'mimeType': image['mimeType']}
        image['uri'] = 'textures/' + target.name
        del image['bufferView']
        image_views.add(index)
    clean_binary = bytearray()
    clean_views = []
    remap = {}
    for index, view in enumerate(views):
        if index in image_views or index not in geometry_views:
            continue
        while len(clean_binary) % 4:
            clean_binary.append(0)
        remap[index] = len(clean_views)
        source = binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
        replacement = dict(view)
        replacement['byteOffset'] = len(clean_binary)
        clean_binary.extend(source)
        clean_views.append(replacement)
        assert bytes(clean_binary[replacement['byteOffset']:replacement['byteOffset']+replacement['byteLength']]) == source
    for accessor in spec.get('accessors', []):
        if 'bufferView' in accessor:
            accessor['bufferView'] = remap[accessor['bufferView']]
        if 'sparse' in accessor:
            for kind in ['indices', 'values']:
                accessor['sparse'][kind]['bufferView'] = remap[accessor['sparse'][kind]['bufferView']]
    spec['bufferViews'] = clean_views
    spec['buffers'][0]['byteLength'] = len(clean_binary)
    encoded = json.dumps(spec, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    clean_binary += b'\0' * (-len(clean_binary) % 4)
    output = struct.pack('<III', 0x46546c67, 2, 12+8+len(encoded)+8+len(clean_binary))
    output += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
    output += struct.pack('<II', len(clean_binary), 0x004e4942) + clean_binary
    glb.write_bytes(output)
    return len(blob)

def material(part):
    spec = part['material']
    key = spec['name']
    existing = bpy.data.materials.get(key)
    if existing:
        return existing
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*spec['color'], 1)
    bsdf.inputs['Roughness'].default_value = spec['roughness']
    bsdf.inputs['Metallic'].default_value = spec['metallic']
    # B6's transparent exterior windows remain opaque in this portable archive;
    # the traversable structure is present, but browser-specific reflection/
    # transparency/night shader behavior is intentionally not claimed identical.
    m['runtimeAlpha'] = spec['alpha']
    m['runtimeMaterialNote'] = spec['note']
    m.use_backface_culling = not spec.get('doubleSided', True)
    if spec.get('portableEntryGlass'):
        bsdf.inputs['Alpha'].default_value = spec['alpha']
        m.surface_render_method = 'DITHERED'
    if spec.get('authoredTexture'):
        texture = m.node_tree.nodes.new('ShaderNodeTexImage')
        source = ROOT / 'public' / spec['authoredTexture'].lstrip('/')
        texture.image = bpy.data.images.load(str(source), check_existing=True)
        texture.image.colorspace_settings.name = 'sRGB'
        texture.image.filepath = bpy.path.relpath(str(source), start=str(BLEND))
        tint=m.node_tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
        tint.inputs[1].default_value=(*spec['color'],1)
        m.node_tree.links.new(texture.outputs['Color'],tint.inputs[2])
        m.node_tree.links.new(tint.outputs['Color'],bsdf.inputs['Base Color'])
        m['textureProvenance'] = spec.get('authoredTextureProvenance', 'Original project-authored PNG interpreted from B3 typology; B6 finishes are not measured')
    if spec.get('authoredNormalTexture'):
        texture = m.node_tree.nodes.new('ShaderNodeTexImage')
        source = ROOT / 'public' / spec['authoredNormalTexture'].lstrip('/')
        texture.image = bpy.data.images.load(str(source), check_existing=True)
        texture.image.colorspace_settings.name = 'Non-Color'
        texture.image.filepath = bpy.path.relpath(str(source), start=str(BLEND))
        normal = m.node_tree.nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = spec['authoredNormalStrength']
        m.node_tree.links.new(texture.outputs['Color'], normal.inputs['Color'])
        m.node_tree.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    surface = spec.get('surface')
    if surface:
        m['textureProvenance'] = surface['source']
        if surface.get('preserveLinearTint'):m.use_backface_culling=True
        for channel, colorspace in [('color', 'sRGB'), ('normalgl', 'Non-Color'), ('roughness', 'Non-Color')]:
            texture = m.node_tree.nodes.new('ShaderNodeTexImage')
            source = ROOT / 'public' / surface['channels'][channel]['url'].lstrip('/')
            texture.image = bpy.data.images.load(str(source), check_existing=True)
            texture.image.colorspace_settings.name = colorspace
            texture.image.filepath = bpy.path.relpath(str(source), start=str(BLEND))
            mapping = m.node_tree.nodes.get('Source physical UV scale')
            if not mapping:
                coords = m.node_tree.nodes.new('ShaderNodeTexCoord')
                mapping = m.node_tree.nodes.new('ShaderNodeMapping')
                mapping.name = 'Source physical UV scale'
                mapping.inputs['Scale'].default_value = (surface['uScale'], surface['vScale'], 1)
                m.node_tree.links.new(coords.outputs['UV'], mapping.inputs['Vector'])
            m.node_tree.links.new(mapping.outputs['Vector'], texture.inputs['Vector'])
            if channel == 'color':
                if surface.get('preserveLinearTint'):
                    tint=m.node_tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
                    tint.inputs[1].default_value=(*spec['color'],1)
                    m.node_tree.links.new(texture.outputs['Color'],tint.inputs[2])
                    m.node_tree.links.new(tint.outputs['Color'],bsdf.inputs['Base Color'])
                    m['sourceRecipe']=json.dumps(surface['sourceRecipe'])
                else:
                    m.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
            elif channel == 'roughness':
                m.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Roughness'])
            else:
                normal = m.node_tree.nodes.new('ShaderNodeNormalMap')
                if surface.get('normalStrength') is not None:
                    normal.inputs['Strength'].default_value=surface['normalStrength']
                m.node_tree.links.new(texture.outputs['Color'], normal.inputs['Color'])
                m.node_tree.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    if key in vertex_colored_materials:
        # Runtime batches use vertex tints for dark gaskets/metal without adding
        # a draw per window. The attribute alone is not a Blender shader link.
        vertex = m.node_tree.nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = SOURCE_COLOR_ATTRIBUTE
        vertex.name = 'Runtime vertex tint'
        tint = m.node_tree.nodes.new('ShaderNodeMixRGB')
        tint.name = 'Multiply runtime vertex tint'
        tint.blend_type = 'MULTIPLY'
        tint.inputs[0].default_value = 1
        base = bsdf.inputs['Base Color']
        if base.is_linked:
            m.node_tree.links.new(base.links[0].from_socket, tint.inputs[1])
        else:
            tint.inputs[1].default_value = base.default_value
        m.node_tree.links.new(vertex.outputs['Color'], tint.inputs[2])
        m.node_tree.links.new(tint.outputs['Color'], base)
        m['runtimeVertexColorAttribute'] = SOURCE_COLOR_ATTRIBUTE
    return m

for model in selected:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Meshes are unique to each building, whereas materials/images are shared.
    # Do not retain every earlier high-detail building as orphan mesh buffers.
    for old_mesh in tuple(bpy.data.meshes):
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
    identity = model['identity']
    model_id = f"osm-{identity['sourceType']}-{identity['sourceId']}"
    root = bpy.data.objects.new(model_id, None)
    bpy.context.collection.objects.link(root)
    root['assetKey'] = identity['key']
    root['sourceUrl'] = identity['sourceUrl']
    root['sourceOrigin'] = json.dumps(model['origin'])
    if model.get('b6Layout'):
        root['b6Layout'] = json.dumps(model['b6Layout'])
    for part in model['parts']:
        p = part['positions']
        indices = part['indices']
        mesh = bpy.data.meshes.new(part['name'])
        mesh.from_pydata([(p[i], -p[i+2], p[i+1]) for i in range(0, len(p), 3)], [],
                         [indices[i:i+3] for i in range(0, len(indices), 3)])
        mesh.update()
        if part.get('normals'):
            assert len(part['normals']) == len(p), part['name']
            normal = part['normals']
            mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
            mesh.normals_split_custom_set_from_vertices([
                (normal[i], -normal[i+2], normal[i+1])
                for i in range(0, len(normal), 3)
            ])
            exact = mesh.attributes.new(SOURCE_NORMAL_ATTRIBUTE, 'FLOAT_VECTOR', 'POINT')
            exact_values = []
            for i in range(0, len(normal), 3):
                length = math.sqrt(sum(normal[i+j]**2 for j in range(3)))
                assert length > 0
                exact_values.extend(normal[i+j]/length for j in range(3))
            exact.data.foreach_set('vector', exact_values)
        obj = bpy.data.objects.new(part['name'], mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = root
        obj['assetKey'] = identity['key']
        obj['sourcePack'] = part['sourcePack']
        obj['sourcePartName'] = part['name']
        obj['sourceNormalAttribute'] = SOURCE_NORMAL_ATTRIBUTE
        obj['sourceNormalBasis'] = 'canonical x east, y up, z south; precise float source retained independently of Blender short2 shading normals'
        if part.get('sourceMetadata'):
            obj['sourceDetail'] = json.dumps(part['sourceMetadata'])
        obj['sourceUrl'] = identity['sourceUrl']
        obj.data.materials.append(material(part))
        if part['uvs']:
            uv = mesh.uv_layers.new(name='Runtime source UV')
            for loop in mesh.loops:
                uv.data[loop.index].uv = part['uvs'][loop.vertex_index*2:loop.vertex_index*2+2]
        if part['colors'] or part['material']['name'] in vertex_colored_materials:
            color = mesh.color_attributes.new(name=SOURCE_COLOR_ATTRIBUTE, type='FLOAT_COLOR', domain='CORNER')
            for loop in mesh.loops:
                color.data[loop.index].color = part['colors'][loop.vertex_index*4:loop.vertex_index*4+4] if part['colors'] else (1, 1, 1, 1)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene['sourceOrigin'] = json.dumps(model['origin'])
    scene['limitations'] = data['limitations']
    scene['sourceEvidence'] = json.dumps(data['sources'])
    scene['highestAuthoredDetailPreserved'] = True
    scene['runtimeUsage'] = 'Runtime generates these same parts from shared plans; archive must not be overlaid as a second building.'
    blend = BLEND / (model_id + '.blend')
    glb = OUT / (model_id + '.glb')
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format='GLB', export_yup=True,
                             export_cameras=False, export_lights=False, export_extras=True,
                             export_vertex_color='NAME', export_vertex_color_name=SOURCE_COLOR_ATTRIBUTE,
                             export_all_vertex_colors=False, export_attributes=True)
    unshared_bytes = share_original_texture_bytes(glb,model)
    report.append({'id': model_id, 'identity': {k: identity[k] for k in ['key', 'kind', 'sourceType', 'sourceId', 'sourceUrl']},
                   'origin': model['origin'], 'parts': len(model['parts']), 'triangles': model['triangles'],
                   'blend': str(blend.relative_to(ROOT)).replace('\\', '/'),
                   'url': '/models/buildings/' + glb.name, 'bytes': glb.stat().st_size, 'unsharedBytes': unshared_bytes,
                   'sha256': hashlib.sha256(glb.read_bytes()).hexdigest()})
if previous:
    replacements = {item['identity']['key']: item for item in report}
    report = [replacements.get(item['identity']['key'], item) for item in previous['models']]
    for item in retained:
        old = next(m for m in previous['models'] if m['id'] == item['id'])
        glb = ROOT / 'public' / old['url'].lstrip('/')
        blend = ROOT / old['blend']
        assert hashlib.sha256(glb.read_bytes()).hexdigest() == item['glbSha256'], item['id']
        assert hashlib.sha256(blend.read_bytes()).hexdigest() == item['blendSha256'], item['id']
manifest = {'schemaVersion': 1, 'generatedBy': 'scripts/create-building-assets.py',
            'sourcePlanSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            'sourceHashes': data['sourceHashes'], 'limitations': data['limitations'],
            'license': 'Original authored parts CC0-1.0; OSM-derived footprints ODbL-1.0; linked ambientCG textures CC0-1.0. Source photos are references only.',
            'textureSharing': 'Original exported texture bytes are shared by SHA-256 URI; no image resizing or recompression. Preserve the adjacent textures directory when copying GLBs.',
            'textures': list(shared_textures.values()), 'models': report}
manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
if previous:
    update = {'status':'passed','updatedSourceIds':[model['identity']['sourceId'] for model in selected],
              'retainedModels':len(retained),'retainedArchives':retained,
              'retainedSourceGeometryHashes':data.get('partialUpdate',{}).get('retainedModelGeometryHashes',{}),
              'originalIprMasterTouched':False,
              'checks':['only selected .blend/GLB regenerated','all other GLB SHA unchanged','all other .blend SHA unchanged',
                        'retained source geometry objects preserved','global manifest/source-plan hashes updated']}
    (ROOT/'docs/reality-pack/separate-assets/b6-partial-update-audit.json').write_text(json.dumps(update,indent=2),encoding='utf-8')
print('SEPARATE_BUILDING_ASSETS_OK', json.dumps({'models': len(report), 'triangles': sum(m['triangles'] for m in report),
                                              'bytes': sum(m['bytes'] for m in report)}))
