"""Single clean editable north court from exact runtime source, two CPU threads."""
import bpy,json,hashlib,math,sys,struct
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'assets/blender/north-court/source-plan.json';data=json.loads(source.read_text(encoding='utf8'))
OUT=ROOT/'public/models/courts';OUT.mkdir(parents=True,exist_ok=True)
DOC=ROOT/'docs/reality-pack/terrain/court-repair';DOC.mkdir(parents=True,exist_ok=True)
blend=ROOT/'assets/blender/north-court/north-b6-293949920.blend'
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
objects=[]
for part in data['parts']:
 p=part['positions'];vertices=[(p[i],-p[i+2],p[i+1])for i in range(0,len(p),3)];faces=[part['indices'][i:i+3]for i in range(0,len(part['indices']),3)]
 mesh=bpy.data.meshes.new(part['name']);mesh.from_pydata(vertices,[],faces);mesh.update()
 normals=part['normals'];mesh.normals_split_custom_set_from_vertices([(normals[i],-normals[i+2],normals[i+1])for i in range(0,len(normals),3)])
 uv=mesh.uv_layers.new(name='UVMap')
 for poly in mesh.polygons:
  for loop in poly.loop_indices:
   index=mesh.loops[loop].vertex_index;uv.data[loop].uv=part['uvs'][index*2:index*2+2]
 obj=bpy.data.objects.new(part['name'],mesh);bpy.context.collection.objects.link(obj);objects.append(obj)
 obj['assetKey']=data['identity']['key'];obj['sourceId']='293949920';obj['modelOriginGameMetres']=json.dumps(data['origin']);obj['dimensionsMeasured']=False;obj['lod']=part['lod']
 material=bpy.data.materials.new(part['material']['name']);material.use_nodes=True;bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*part['material']['color'],1);bsdf.inputs['Roughness'].default_value=part['material']['roughness'];bsdf.inputs['Metallic'].default_value=part['material']['metallic'];obj.data.materials.append(material)
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
scene['sourcePlanSha256']=hashlib.sha256(source.read_bytes()).hexdigest();scene['sourceInterpretation']='OSM outline + IPR2024 red/green visual family + source-supported local terrain TIN. No photographic lighting baked.'
scene['attribution']='© OpenStreetMap contributors · ODbL; datový podklad © IPR Praha · CC BY; © ČÚZK, upraveno · CC BY4.0'
scene['axes']='Blender X east,Y north,Z up; model local to game origin in extras'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
glb=OUT/'north-b6-293949920.glb';bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True)
blob=glb.read_bytes();json_length=struct.unpack_from('<I',blob,12)[0];spec=json.loads(blob[20:20+json_length]);binary=blob[28+json_length:]
def accessor(index):
 a=spec['accessors'][index];view=spec['bufferViews'][a['bufferView']];dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]);size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
 return np.ndarray((a['count'],size),dtype=dtype,buffer=binary,offset=view.get('byteOffset',0)+a.get('byteOffset',0),strides=(view.get('byteStride',dtype.itemsize*size),dtype.itemsize))
serialized_triangles=0;degenerate=0
for mesh in spec['meshes']:
 for primitive in mesh['primitives']:
  p=accessor(primitive['attributes']['POSITION']).astype(float);indices=accessor(primitive['indices']).reshape((-1,3));assert np.isfinite(p).all();t=p[indices];cross=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);degenerate+=int((np.einsum('ij,ij->i',cross,cross)<1e-16).sum());serialized_triangles+=len(t)
assert degenerate==0,('Serialized GLB degenerate triangles',degenerate)
assert serialized_triangles==data['triangles']
bpy.ops.wm.open_mainfile(filepath=str(blend));actual=[obj for obj in bpy.context.scene.objects if obj.type=='MESH'];assert len(actual)==len(data['parts'])
for part in data['parts']:
 obj=next(o for o in actual if o.name==part['name']);assert len(obj.data.polygons)==len(part['indices'])//3
 for i,vertex in enumerate(obj.data.vertices):
  expected=Vector((part['positions'][i*3],-part['positions'][i*3+2],part['positions'][i*3+1]));assert (vertex.co-expected).length<1e-5
report={'sourceId':'293949920','sourcePlanSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'blendSha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'glbSha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'triangles':data['triangles'],'serializedGLBTriangles':serialized_triangles,'serializedDegenerateTriangles':degenerate,'parts':len(actual),'exactDuplicatedOpaqueTriangles':data['exactDuplicateTriangles'],'reopenedBlendVertexParity':True,'photosEmbedded':False,'sourceOrigin':data['origin'],'dimensionsMeasured':False,'attribution':'© OpenStreetMap contributors · ODbL; datový podklad © IPR Praha · CC BY; © ČÚZK, upraveno · CC BY4.0'}
(DOC/'model-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
if '--skip-preview' in sys.argv:
 print('NORTH COURT MODEL',json.dumps(report));sys.exit(0)
# A CPU inspection image, never a browser FPS claim.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=1000;scene.render.resolution_y=650;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('neutral outdoor inspection');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.55,.6,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
bpy.ops.object.light_add(type='AREA',location=(-12,-8,25));light=bpy.context.object;light.data.energy=1800;light.data.size=18
light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(28,-32,34));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=44;camera.rotation_euler=(Vector((0,0,.2))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
scene.render.film_transparent=True;scene.render.filepath=str(DOC/'north-court-model-preview.png');bpy.ops.render.render(write_still=True)
print('NORTH COURT MODEL',json.dumps(report))
