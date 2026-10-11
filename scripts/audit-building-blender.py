"""Reopen every exported building .blend and check its actual editable contents."""
import bpy, json, pathlib, math, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
source=json.loads((ROOT/'assets/blender/buildings/source-plan.json').read_text(encoding='utf-8'))
only_id=sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else None
report=[]
max_error=0
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
        candidates=[o for o in unmatched if o.name==part['name'] or o.name==part['name'][:63]]
        assert len(candidates)==1,(model_id,part['name'],[o.name for o in unmatched])
        obj=candidates[0];unmatched.remove(obj)
        assert obj.parent==roots[0] and obj['assetKey']==identity['key']
        assert len(obj.data.vertices)*3==len(part['positions'])
        assert all(len(p.vertices)==3 for p in obj.data.polygons)
        assert len(obj.data.polygons)*3==len(part['indices'])
        for i,vertex in enumerate(obj.data.vertices):
            p=part['positions'][i*3:i*3+3]
            expected=(p[0],-p[2],p[1])
            error=max(abs(vertex.co[j]-expected[j]) for j in range(3))
            max_error=max(max_error,error)
            assert error<.00004,(model_id,error)
        assert obj.data.uv_layers.active or not part['uvs']
        for mat in obj.data.materials:
            spec=part['material'];surface=spec.get('surface')
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
        'surfaceRecipesChecked':surface_recipes,
        'checks':['actual .blend reopen','one source object root per building','all mesh parts parented to own root',
                  'original vertex/face counts and triangle topology','source positions within 40 micrometres',
                  'UV layers present','linked texture files resolve'], 'modelsDetail':report}
(ROOT/('docs/reality-pack/separate-assets/b6-blender-reopen-audit.json' if only_id else 'docs/reality-pack/separate-assets/blender-reopen-audit.json')).write_text(json.dumps(result,indent=2),encoding='utf-8')
print('BUILDING_BLENDER_REOPEN_AUDIT_OK',json.dumps({k:v for k,v in result.items() if k!='modelsDetail'}))
