"""Reopen every exported building .blend and check its actual editable contents."""
import bpy, json, pathlib, math, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
source=json.loads((ROOT/'assets/blender/buildings/source-plan.json').read_text(encoding='utf-8'))
only_id=sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else None
report=[]
max_error=0
max_normal_error=0
max_source_normal_error=0
max_native_normal_degrees=0
worst_native_normal=None
max_color_error=0
max_uv_error=0
normal_corners=0
color_corners=0
surface_recipes=[]
for model in source['models']:
    if only_id and model['identity']['sourceId']!=only_id: continue
    identity=model['identity']
    model_id=f"osm-{identity['sourceType']}-{identity['sourceId']}"
    filename=ROOT/'assets/blender/buildings'/(model_id+'.blend')
    bpy.ops.wm.open_mainfile(filepath=str(filename))
    roots=[o for o in bpy.context.scene.objects if o.type=='EMPTY']
    assert len(roots)==1 and roots[0]['assetKey']==identity['key'],model_id
    if model.get('b6Layout'):
        assert json.loads(roots[0]['b6Layout'])==model['b6Layout'], 'B6 floor/room/provenance metadata changed'
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    assert len(meshes)==len(model['parts']),model_id
    triangles=0
    # Blender truncates long mesh names, so compare deterministic construction
    # order via object names prefixed by the exact source name where necessary.
    unmatched=list(meshes)
    for part in model['parts']:
        candidates=[o for o in unmatched if o.get('sourcePartName')==part['name']]
        if not candidates:
            candidates=[o for o in unmatched if o.name==part['name'] or o.name==part['name'][:63]]
        assert len(candidates)==1,(model_id,part['name'],[o.name for o in unmatched])
        obj=candidates[0];unmatched.remove(obj)
        assert obj.parent==roots[0] and obj['assetKey']==identity['key']
        assert len(obj.data.vertices)*3==len(part['positions'])
        assert all(len(p.vertices)==3 for p in obj.data.polygons)
        assert len(obj.data.polygons)*3==len(part['indices'])
        for face in obj.data.polygons:
            assert list(face.vertices)==part['indices'][face.index*3:face.index*3+3], (model_id,part['name'],'changed topology')
        for i,vertex in enumerate(obj.data.vertices):
            p=part['positions'][i*3:i*3+3]
            expected=(p[0],-p[2],p[1])
            error=max(abs(vertex.co[j]-expected[j]) for j in range(3))
            max_error=max(max_error,error)
            assert error<.00004,(model_id,error)
        assert obj.data.uv_layers.active or not part['uvs']
        if part['uvs']:
            for loop in obj.data.loops:
                expected=part['uvs'][loop.vertex_index*2:loop.vertex_index*2+2]
                actual=obj.data.uv_layers.active.data[loop.index].uv
                error=max(abs(actual[j]-expected[j])for j in range(2))
                max_uv_error=max(max_uv_error,error)
                assert error<.00004,(model_id,part['name'],'UV transfer',error)
        if source.get('schemaVersion',1)>=2:
            exact=obj.data.attributes.get('_SOURCE_NORMAL')
            assert exact and exact.domain=='POINT' and exact.data_type=='FLOAT_VECTOR'
            for i, value in enumerate(exact.data):
                expected=part['normals'][i*3:i*3+3]
                length=math.sqrt(sum(v*v for v in expected))
                error=max(abs(value.vector[j]-expected[j]/length)for j in range(3))
                max_source_normal_error=max(max_source_normal_error,error)
                assert error<1e-6,(model_id,part['name'],'precise source normal attribute',error)
            for loop in obj.data.loops:
                i=loop.vertex_index*3
                expected=(part['normals'][i],-part['normals'][i+2],part['normals'][i+1])
                length=math.sqrt(sum(v*v for v in expected))
                actual=obj.data.corner_normals[loop.index].vector
                error=max(abs(actual[j]-expected[j]/length)for j in range(3))
                max_normal_error=max(max_normal_error,error);normal_corners+=1
                actual_length=math.sqrt(sum(v*v for v in actual))
                unit_actual=[v/actual_length for v in actual]
                unit_expected=[v/length for v in expected]
                cross=[unit_actual[1]*unit_expected[2]-unit_actual[2]*unit_expected[1],unit_actual[2]*unit_expected[0]-unit_actual[0]*unit_expected[2],unit_actual[0]*unit_expected[1]-unit_actual[1]*unit_expected[0]]
                angle=math.degrees(math.atan2(math.sqrt(sum(v*v for v in cross)),sum(a*b for a,b in zip(unit_actual,unit_expected))))
                if angle>max_native_normal_degrees:
                    max_native_normal_degrees=angle
                    worst_native_normal={'model':model_id,'part':part['name'],'vertex':loop.vertex_index,'loop':loop.index,'source':unit_expected,'native':unit_actual}
                # Separate native viewport shading from the full-precision data
                # above. Blender's short2/trig representation is lossy; GLB is
                # restored from the exact attribute and keeps the strict audit.
                assert angle<.25,(model_id,part['name'],'native shading normal angle',angle)
            if part.get('colors'):
                attribute=obj.data.color_attributes.get('Runtime source tint')
                assert attribute,(model_id,part['name'],'missing vertex tint')
                for loop in obj.data.loops:
                    expected=part['colors'][loop.vertex_index*4:loop.vertex_index*4+4]
                    actual=attribute.data[loop.index].color
                    error=max(abs(actual[j]-expected[j])for j in range(4))
                    max_color_error=max(max_color_error,error);color_corners+=1
                    assert error<1e-6,(model_id,part['name'],'colour transfer',error)
        for mat in obj.data.materials:
            spec=part['material'];surface=spec.get('surface')
            for source_key, colorspace in [('authoredTexture','sRGB'),('authoredNormalTexture','Non-Color')]:
                if not spec.get(source_key):continue
                expected_file=(ROOT/'public'/spec[source_key].lstrip('/')).resolve()
                textures=[n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and pathlib.Path(bpy.path.abspath(n.image.filepath)).resolve()==expected_file]
                assert len(textures)==1,(model_id,part['name'],'missing authored texture',source_key)
                assert textures[0].image.colorspace_settings.name==colorspace
            if spec.get('authoredNormalTexture'):
                normal=next(n for n in mat.node_tree.nodes if n.type=='NORMAL_MAP')
                assert abs(normal.inputs['Strength'].default_value-spec['authoredNormalStrength'])<1e-6
            if source.get('schemaVersion',1)>=2 and part.get('colors'):
                vertex=mat.node_tree.nodes.get('Runtime vertex tint')
                tint=mat.node_tree.nodes.get('Multiply runtime vertex tint')
                assert vertex and vertex.layer_name=='Runtime source tint' and tint and tint.blend_type=='MULTIPLY'
                assert any(link.from_node==vertex and link.to_node==tint for link in mat.node_tree.links)
                bsdf=mat.node_tree.nodes.get('Principled BSDF')
                assert bsdf.inputs['Base Color'].links[0].from_node==tint
            if surface and surface.get('preserveLinearTint'):
                mapping=mat.node_tree.nodes.get('Source physical UV scale')
                assert mapping and max(abs(mapping.inputs['Scale'].default_value[i]-v)for i,v in enumerate([surface['uScale'],surface['vScale'],1]))<1e-6
                tint=next(n for n in mat.node_tree.nodes if n.type=='MIX_RGB' and n.blend_type=='MULTIPLY')
                assert max(abs(tint.inputs[1].default_value[i]-v)for i,v in enumerate(spec['color']))<1e-6
                normal=next(n for n in mat.node_tree.nodes if n.type=='NORMAL_MAP')
                assert abs(normal.inputs['Strength'].default_value-surface['normalStrength'])<1e-6
                surface_recipes.append({'material':mat.name,'tintLinear':spec['color'],'uvScale':[surface['uScale'],surface['vScale']],'normalStrength':surface['normalStrength'],'roughnessFactor':spec['roughness'],'metallic':spec['metallic'],'source':surface['source']})
            for node in mat.node_tree.nodes:
                if node.type=='TEX_IMAGE':
                    assert pathlib.Path(bpy.path.abspath(node.image.filepath)).is_file(),node.image.filepath
        triangles+=len(obj.data.polygons)
    assert triangles==model['triangles']
    report.append({'id':model_id,'objects':len(meshes),'triangles':triangles,'valid':True})
result={'status':'passed','scope':'selected-building-reopen' if only_id else 'all-building-reopen','selectedSourceId':only_id,'models':len(report),'triangles':sum(r['triangles'] for r in report),
        'maxEditableVertexErrorMetres':max_error,
        'maxEditableNormalComponentError':max_normal_error,'normalCornersChecked':normal_corners,
        'maxExactSourceNormalComponentError':max_source_normal_error,
        'maxNativeShadingNormalAngleDegrees':max_native_normal_degrees,
        'nativeShadingNormalAngleLimitDegrees':.25,
        'worstNativeShadingNormal':worst_native_normal,
        'maxEditableColorComponentError':max_color_error,'colorCornersChecked':color_corners,
        'maxEditableUvComponentError':max_uv_error,
        'surfaceRecipesChecked':surface_recipes,
        'checks':['actual .blend reopen','one source object root per building','all mesh parts parented to own root',
                  'original vertex/face counts and triangle topology','source positions within 40 micrometres',
                  'source UV coordinates retained','linked texture files resolve']+
                 (['full-precision source normal attribute retained','native shading normal angular difference separately bounded','vertex tint data and shader links retained']if source.get('schemaVersion',1)>=2 else []), 'modelsDetail':report}
(ROOT/('docs/reality-pack/separate-assets/b6-blender-reopen-audit.json' if only_id else 'docs/reality-pack/separate-assets/blender-reopen-audit.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
print('BUILDING_BLENDER_REOPEN_AUDIT_OK',json.dumps({k:v for k,v in result.items() if k!='modelsDetail'}))
