"""Flip only the prepared foundation objects; preserve loop UV binding and reopen.
Run Blender --background --threads 2 --python this-file -- --plan PATH.
"""
import bpy,sys,json,pathlib,hashlib,array,struct
plan_path=pathlib.Path(sys.argv[sys.argv.index('--plan')+1]);plan=json.loads(plan_path.read_text())
root=pathlib.Path(plan['root']);cache=pathlib.Path(plan['cache'])
bpy.context.preferences.filepaths.save_version=0
def sha(value):return hashlib.sha256(value).hexdigest()
def packed(collection,prop,width,kind='f'):
    values=array.array(kind,[0])*(len(collection)*width);collection.foreach_get(prop,values);return values.tobytes()
def uv_binding(mesh):
    result=[]
    for layer in mesh.uv_layers:
        faces=[]
        for polygon in mesh.polygons:
            faces.append(sorted((mesh.loops[i].vertex_index,struct.pack('<2f',*layer.data[i].uv).hex())for i in polygon.loop_indices))
        result.append((layer.name,faces))
    return sha(json.dumps(result,separators=(',',':')).encode())
def mesh_snapshot(mesh,foundation=False):
    fields={'vertices':sha(packed(mesh.vertices,'co',3)),
            'materials':[m.name_full if m else None for m in mesh.materials],
            'poly_materials':sha(packed(mesh.polygons,'material_index',1,'i')),
            'poly_smooth':sha(packed(mesh.polygons,'use_smooth',1,'b')),
            'has_custom_normals':mesh.has_custom_normals,
            'uv_binding':uv_binding(mesh)}
    if not foundation:
        fields.update({'loops':sha(packed(mesh.loops,'vertex_index',1,'i')),
                       'normals':sha(packed(mesh.corner_normals,'vector',3)),
                       'uv_bytes':[(l.name,sha(packed(l.data,'uv',2)))for l in mesh.uv_layers],
                       'color_bytes':[(a.name,a.domain,a.data_type,sha(packed(a.data,'color',4)))for a in mesh.color_attributes]})
    return fields
def image_snapshot():
    return [(image.name_full,image.filepath,[(p.filepath,sha(bytes(p.packed_file.data)))for p in image.packed_files])for image in bpy.data.images]
def material_snapshot():
    # File saving may update internal IDs; canonical shader values/links remain.
    rows=[]
    for material in bpy.data.materials:
        nodes=[]
        if material.use_nodes:
            for node in material.node_tree.nodes:
                inputs=[]
                for slot in node.inputs:
                    value=getattr(slot,'default_value',None)
                    if isinstance(value,bpy.types.ID):value=(value.bl_rna.identifier,value.name_full)
                    if value is not None and not isinstance(value,(str,int,float,bool)):
                        try:value=list(value)
                        except TypeError:value=str(value)
                    inputs.append((slot.name,value))
                nodes.append((node.name,node.bl_idname,inputs,getattr(getattr(node,'image',None),'name_full',None)))
        rows.append((material.name_full,list(material.diffuse_color),material.metallic,material.roughness,sorted(nodes),
                     sorted((l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name)for l in material.node_tree.links)if material.use_nodes else []))
    return sorted(rows)
report=[]
for row in plan['models']:
    if not row['affected']:continue
    filename=root/row['blend'];assert sha(filename.read_bytes())==row['beforeBlendSha']
    bpy.ops.wm.open_mainfile(filepath=str(filename))
    foundation=bpy.data.objects.get('building foundation '+row['id']);assert foundation and foundation.type=='MESH',row['id']
    mesh=foundation.data;assert mesh.users==1
    before={o.name_full:mesh_snapshot(o.data,o==foundation)for o in bpy.data.objects if o.type=='MESH'}
    transforms={o.name_full:tuple(v for matrix_row in o.matrix_world for v in matrix_row)for o in bpy.data.objects}
    images=image_snapshot();materials=material_snapshot()
    orphan_materials=[m.name_full for m in bpy.data.materials if m.users==0]
    # Blender drops zero-user authored variants on save. Preserve their entire
    # shader data with an explicit persistence flag; no slot/shader is changed.
    for name in orphan_materials:bpy.data.materials[name].use_fake_user=True
    assert material_snapshot()==materials
    corners=[]
    for polygon in mesh.polygons:
        assert polygon.loop_total==3
        corners.append({mesh.loops[i].vertex_index:{'normal':tuple(mesh.corner_normals[i].vector),
            'uvs':{layer.name:tuple(layer.data[i].uv)for layer in mesh.uv_layers},
            'colors':{attr.name:tuple(attr.data[i].color)for attr in mesh.color_attributes if attr.domain=='CORNER'}}for i in polygon.loop_indices})
    custom=mesh.has_custom_normals
    for polygon in mesh.polygons:polygon.flip()
    mesh.update()
    custom_normals=[None]*len(mesh.loops)
    for face,polygon in zip(corners,mesh.polygons):
        for i in polygon.loop_indices:
            original=face[mesh.loops[i].vertex_index]
            for layer in mesh.uv_layers:layer.data[i].uv=original['uvs'][layer.name]
            for attr in mesh.color_attributes:
                if attr.domain=='CORNER':attr.data[i].color=original['colors'][attr.name]
            custom_normals[i]=tuple(-v for v in original['normal'])
    if custom:mesh.normals_split_custom_set(custom_normals)
    mesh.update()
    after={o.name_full:mesh_snapshot(o.data,o==foundation)for o in bpy.data.objects if o.type=='MESH'}
    assert after==before,'geometry/UV/material changed '+row['id']
    assert material_snapshot()==materials and image_snapshot()==images
    for face,polygon in zip(corners,mesh.polygons):
        old_normal=next(iter(face.values()))['normal'];assert polygon.normal.dot(old_normal)<-.99
    bpy.ops.wm.save_as_mainfile(filepath=str(filename),relative_remap=False)
    bpy.ops.wm.open_mainfile(filepath=str(filename))
    foundation=bpy.data.objects.get('building foundation '+row['id'])
    reopened={o.name_full:mesh_snapshot(o.data,o==foundation)for o in bpy.data.objects if o.type=='MESH'}
    assert reopened==before,'reopen changed mesh/UV '+row['id']
    if material_snapshot()!=materials or image_snapshot()!=images:
        (cache/'shader-reopen-difference.json').write_text(json.dumps({'id':row['id'],'materialBefore':materials,'materialAfter':material_snapshot(),'imagesBefore':images,'imagesAfter':image_snapshot()},indent=2))
        raise AssertionError('reopen changed shader/image '+row['id'])
    assert {o.name_full:tuple(v for matrix_row in o.matrix_world for v in matrix_row)for o in bpy.data.objects}==transforms
    report.append({'id':row['id'],'foundationTriangles':len(foundation.data.polygons),'customSplitNormalsBefore':custom,
                   'customSplitNormalsAfter':foundation.data.has_custom_normals,'vertexUvBindingUnchanged':True,
                   'allOtherMeshAttributesUnchanged':True,'materialsImagesTransformsUnchanged':True,'reopened':True,
                   'serializerDroppedUnusedMaterialDatablocks':[name for name in orphan_materials if bpy.data.materials.get(name) is None],
                   'orphanMaterialPersistenceEnabled':orphan_materials,
                   'afterBlendSha':sha(filename.read_bytes())})
    (cache/'blender-audit.json').write_text(json.dumps({'status':'running','models':report},indent=2))
    print('FOUNDATION_SYNC_OK',row['id'],len(report),flush=True)
(cache/'blender-audit.json').write_text(json.dumps({'status':'passed','models':report},indent=2))
print('FOUNDATION_SYNC_COMPLETE',len(report),flush=True)
