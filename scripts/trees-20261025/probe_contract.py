"""Tiny native exporter probe, not a tree asset or runtime publication."""
import bpy, json, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.cache/trees-pilot-20261025/contract-probe.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
mesh=bpy.data.meshes.new('rank-probe')
mesh.from_pydata([(0,0,0),(1,0,0),(1,0,1),(0,0,1),(2,0,0),(3,0,0),(3,0,1),(2,0,1)],[],[(0,1,2,3),(4,5,6,7)])
colors=mesh.color_attributes.new(name='seasonDropRank',type='FLOAT_COLOR',domain='POINT')
for i,c in enumerate(colors.data): c.color=(1,1,1,.125 if i<4 else .875)
mesh.color_attributes.active_color=colors
mesh.color_attributes.render_color_index=0
uv=mesh.uv_layers.new()
for loop in mesh.loops: uv.data[loop.index].uv=(loop.vertex_index%2,loop.vertex_index//2%2)
obj=bpy.data.objects.new('foliage-probe',mesh);bpy.context.collection.objects.link(obj)
obj['role']='foliage';obj['rankEncoding']='COLOR_0.a; normalized uint16; one constant rank per whole component'
obj.select_set(True);bpy.context.view_layer.objects.active=obj
props=bpy.ops.export_scene.gltf.get_rna_type().properties
print('EXPORT_COLOR_ENUM',[(i.identifier,i.name)for i in props['export_vertex_color'].enum_items])
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_extras=True,
    export_yup=True,export_vertex_color='ACTIVE',export_all_vertex_colors=True,export_materials='NONE')
raw=OUT.read_bytes();size=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+size]);binary=raw[28+size:]
p=j['meshes'][0]['primitives'][0];a=j['accessors'][p['attributes']['COLOR_0']];v=j['bufferViews'][a['bufferView']]
assert a['componentType']==5123 and a['type']=='VEC4' and a['normalized'],a
values=struct.unpack_from('<'+'H'*(a['count']*4),binary,v.get('byteOffset',0)+a.get('byteOffset',0))
assert sorted(set(values[3::4]))==[8192,57343]
assert set(values[0::4])=={65535}
print('RANK_CONTRACT_PASS',json.dumps({'attributes':p['attributes'],'rankValues':sorted(set(values[3::4])),'extras':j['nodes'][0].get('extras')}))
