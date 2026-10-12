import bpy, json, pathlib, math
root=pathlib.Path(__file__).resolve().parents[3]
source=json.loads((root/'assets/blender/buildings/source-plan.json').read_text(encoding='utf8'))
model=next(m for m in source['models'] if m['identity']['sourceId']=='7645350')
bpy.ops.wm.open_mainfile(filepath=str(root/'assets/blender/buildings/osm-way-7645350.blend'))
rows=[]
for part in model['parts']:
    obj=next(o for o in bpy.context.scene.objects if o.get('sourcePartName')==part['name'])
    maximum=0; angle_max=0; worst=None
    for loop in obj.data.loops:
        k=loop.vertex_index*3; expected=[part['normals'][k],-part['normals'][k+2],part['normals'][k+1]]
        length=math.sqrt(sum(x*x for x in expected));expected=[x/length for x in expected]
        actual=list(obj.data.corner_normals[loop.index].vector);length=math.sqrt(sum(x*x for x in actual));actual=[x/length for x in actual]
        error=max(abs(a-b)for a,b in zip(actual,expected))
        angle=math.degrees(math.acos(max(-1,min(1,sum(a*b for a,b in zip(actual,expected))))))
        if error>maximum:maximum=error;worst={'vertex':loop.vertex_index,'loop':loop.index,'source':expected,'actual':actual}
        angle_max=max(angle_max,angle)
    rows.append({'part':part['name'],'maxComponentError':maximum,'maxAngleDegrees':angle_max,'worst':worst})
result={'blender':bpy.app.version_string,'method':'actual saved mesh corner_normals vs full source normal','rows':rows}
(root/'docs/reality-pack/separate-assets/native-normal-transfer-inspection.json').write_text(json.dumps(result,indent=2))
print('NATIVE_NORMAL_TRANSFER',json.dumps(sorted(rows,key=lambda r:r['maxAngleDegrees'],reverse=True)[:3]))
