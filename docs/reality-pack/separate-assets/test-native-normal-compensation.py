import bpy,json,pathlib,math,sys,numpy as np
root=pathlib.Path(__file__).resolve().parents[3]
source=json.loads((root/'assets/blender/buildings/source-plan.json').read_text(encoding='utf8'))
model=next(m for m in source['models'] if m['identity']['sourceId']=='7645350')
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/blender/buildings/osm-way-7645350.blend'))
rows=[]
for part in model['parts']:
    if part['name'] not in ['reality 7645350 near reality pale aluminum sill','reality 7645350 near reality entrance galvanized frame']:continue
    obj=next(o for o in bpy.context.scene.objects if o.get('sourcePartName')==part['name']);mesh=obj.data
    loop_indices=np.array([loop.vertex_index for loop in mesh.loops])
    normal=np.asarray(part['normals']).reshape((-1,3));target=normal[loop_indices][:,[0,2,1]];target[:,1]*=-1
    target/=np.linalg.norm(target,axis=1)[:,None]; encoded=target.copy(); iterations=[]
    if '--sharp' in sys.argv:
        sharp=mesh.attributes.get('sharp_edge') or mesh.attributes.new('sharp_edge','BOOLEAN','EDGE')
        sharp.data.foreach_set('value',np.ones(len(mesh.edges),dtype=np.bool_))
        mesh.normals_split_custom_set(target.tolist())
    for iteration in range(1 if '--sharp' in sys.argv else 7):
        actual=np.array([tuple(n.vector) for n in mesh.corner_normals]);actual/=np.linalg.norm(actual,axis=1)[:,None]
        errors=np.max(np.abs(actual-target),axis=1)
        angles=np.degrees(np.arccos(np.clip(np.sum(actual*target,axis=1),-1,1)))
        iterations.append({'iteration':iteration,'maxComponent':float(errors.max()),'maxDegrees':float(angles.max()),'overLimit':int((errors>0.0002).sum())})
        encoded+=target-actual; encoded/=np.linalg.norm(encoded,axis=1)[:,None]
        mesh.normals_split_custom_set(encoded.tolist())
    rows.append({'part':part['name'],'iterations':iterations})
result={'method':'all triangle edges sharp, explicit source corner normals; in-memory only' if '--sharp' in sys.argv else 'in-memory compensation only, no archive overwritten','rows':rows}
(root/('docs/reality-pack/separate-assets/native-normal-sharp-fans.json' if '--sharp' in sys.argv else 'docs/reality-pack/separate-assets/native-normal-compensation.json')).write_text(json.dumps(result,indent=2))
print('NORMAL_COMPENSATION',json.dumps(result))
