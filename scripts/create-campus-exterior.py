"""Import the unchanged highest-detail shared plan as an editable .blend.
Run create-campus-exterior-plan.ts first. Runtime uses the shared source plan so
DEM/collision equality is preserved; this GLB is a portable reference export.
No source photo pixels or third-party meshes are copied into the asset.
"""
import bpy, json, pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets/blender/campus-exterior/source-plan.json'
data=json.loads(SOURCE.read_text(encoding='utf-8'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
COLORS={'turf':'4c6750','ochre':'a2a168','blue':'397c9d','red':'aa5b55','sand':'d2c7a1','paint':'d8d8c6','fence':'4a5851','roof':'aaa9a1','roofSeam':'787c77','concrete':'8f9288'}
def linear(v):
    return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
materials={}
roots={}
for name,color in COLORS.items():
    material=bpy.data.materials.new(name)
    material.use_nodes=True
    bsdf=material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=tuple(linear(int(color[i:i+2],16)/255) for i in [0,2,4])+(1,)
    bsdf.inputs['Roughness'].default_value=.63 if name=='fence' else .94
    bsdf.inputs['Metallic'].default_value=.58 if name in ['fence','roofSeam'] else 0
    materials[name]=material
for p in data['plan']['parts']:
    positions=p['positions'];indices=p['indices']
    identity=p['asset'];key=identity['key']
    if key not in roots:
        own=[part for part in data['plan']['parts'] if part['asset']['key']==key]
        xs=[part['positions'][i] for part in own for i in range(0,len(part['positions']),3)]
        zs=[part['positions'][i+2] for part in own for i in range(0,len(part['positions']),3)]
        cx=(min(xs)+max(xs))/2;cz=(min(zs)+max(zs))/2
        root=bpy.data.objects.new(key,None);bpy.context.collection.objects.link(root)
        root.location=(cx,-cz,0)
        root['assetKey']=key;root['sourceId']=identity['sourceId'];root['sourceUrl']=identity['sourceUrl']
        roots[key]=(root,cx,cz)
    root,cx,cz=roots[key]
    mesh=bpy.data.meshes.new(f"source {p['group']} {p['material']} {p['lod']}")
    mesh.from_pydata([(positions[i]-cx,-positions[i+2]+cz,positions[i+1]) for i in range(0,len(positions),3)],[],[indices[i:i+3] for i in range(0,len(indices),3)])
    mesh.update()
    obj=bpy.data.objects.new(mesh.name,mesh);bpy.context.collection.objects.link(obj)
    obj.parent=root;obj['assetKey']=key;obj['sourceId']=identity['sourceId']
    obj.data.materials.append(materials[p['material']])
    obj['lod']=p['lod'];obj['source']=data['source']['footprint'];obj['interpretation']=data['source']['interpretation']
    uv=mesh.uv_layers.new(name='metres')
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex=mesh.loops[loop_index].vertex_index;uv.data[loop_index].uv=p['uvs'][vertex*2:vertex*2+2]
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene['source_provenance']=json.dumps(data['source'])
blend=ROOT/'assets/blender/campus-exterior/campus-exterior-source.blend'
glb=ROOT/'public/models/campus-exterior/campus-exterior-source.glb'
glb.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False,export_extras=True)
print(json.dumps({'blend':str(blend),'glb':str(glb),'triangles':sum(len(p['indices'])//3 for p in data['plan']['parts']),'highestDetailPreserved':True}))
