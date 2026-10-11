"""Render review views of the independent garment master with unchanged head.
CPU only, two threads, no production-FPS claim. Saves the editable scene too.
"""
import bpy,json,pathlib,math,hashlib,sys
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[1]
MASTER=ROOT/'assets/blender/characters/student-garments.blend'
OUT=ROOT/'docs/characters/student-garments/evidence'
OUT.mkdir(parents=True,exist_ok=True)
ANATOMY_PATH=ROOT/'client/data/skinned-character-geometry.json'
UNCHANGED=hashlib.sha256(ANATOMY_PATH.read_bytes()).hexdigest()
a=json.loads(ANATOMY_PATH.read_text(encoding='utf8'))
bpy.ops.wm.open_mainfile(filepath=str(MASTER))
rig=bpy.data.objects['Existing 13 game bones'];rig.scale.z=1.03
bones=a['bones'];origins=[]
for b in bones:origins.append(Vector(b['translation'])+(origins[b['parent']] if b['parent'] is not None else Vector()))
def to_blender(p):return Vector((p[0],-p[2],p[1]))
def linear(hex):
 values=[int(hex[i:i+2],16)/255 for i in [1,3,5]]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values)+(1,)
def plain(name,color,roughness=.88):
 mat=bpy.data.materials.new(name);mat.use_nodes=True
 bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=linear(color);bsdf.inputs['Roughness'].default_value=roughness
 return mat
skin=plain('Unchanged generic skin palette','#d7a77f',.53)
hair=plain('Unchanged generic hair palette','#352823',.54)
shoe=plain('Unchanged shoes','#343a36',.56)
def mesh_from_data(name,g,material,head=False):
 ps=[]
 for i in range(len(g['positions'])//3):
  p=Vector(g['positions'][i*3:i*3+3])
  if head:p=Vector((p.x*.1802,p.y*.235,p.z*.195))+origins[2]
  ps.append(to_blender(p))
 data=bpy.data.meshes.new(name);data.from_pydata(ps,[],[g['indices'][i:i+3] for i in range(0,len(g['indices']),3)]);data.update()
 obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.data.materials.append(material)
 for b in bones:obj.vertex_groups.new(name=b['name'])
 for i in range(len(ps)):
  if head:obj.vertex_groups[2].add([i],1,'REPLACE')
  else:
   for j in range(4):
    w=g['matricesWeights'][i*4+j]
    if w:obj.vertex_groups[g['matricesIndices'][i*4+j]].add([i],w,'REPLACE')
 for poly in data.polygons:poly.use_smooth=True
 normals=[]
 for i in range(len(ps)):
  n=Vector(g['normals'][i*3:i*3+3])
  if head:n=Vector((n.x/.1802,n.y/.235,n.z/.195)).normalized()
  normals.append(to_blender(n))
 data.normals_split_custom_set_from_vertices(normals)
 obj.parent=rig;mod=obj.modifiers.new('Same 13 game bones','ARMATURE');mod.object=rig
 return obj
mesh_from_data('Unchanged head reference',a['head'],skin,True)
mesh_from_data('Unchanged crop hair reference',a['hair']['crop'],hair,True)
mesh_from_data('Unchanged hands reference',a['bodies']['male']['near']['skin'],skin)
bare=mesh_from_data('Unchanged bare forearms reference',a['bodies']['male']['near']['sleeves'],skin)
previous=[mesh_from_data('Previous anatomical clothing '+part,a['bodies']['male']['near'][part],plain('Previous clothing '+part,'#273b40' if part=='trousers' else '#657b67',.94 if part=='trousers' else .88)) for part in ['shirt','sleeves','trousers']]
for obj in previous:obj.hide_render=True;obj.hide_viewport=True
for side,bi in [(-1,5),(1,8)]:
 p=origins[bi]+Vector((0,-.025,.052))
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,location=to_blender(p))
 obj=bpy.context.object;obj.name='Unchanged shoe reference '+str(side);obj.scale=(.064,.1365,.055);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 obj.data.materials.append(shoe);obj.parent=rig
 for b in bones:obj.vertex_groups.new(name=b['name'])
 obj.vertex_groups[bi].add(list(range(len(obj.data.vertices))),1,'REPLACE');mod=obj.modifiers.new('Same ankle','ARMATURE');mod.object=rig
 for p in obj.data.polygons:p.use_smooth=True
# Small actual ocular references support a readable face; no new face geometry.
def eye_surface(x,y):
 g=a['head'];positions=g['positions'];px=x/.1802;py=y/.235;maximum=-1e9
 for i in range(0,len(g['indices']),3):
  ai,bi,ci=(j*3 for j in g['indices'][i:i+3]);ax,ay=positions[ai:ai+2];bx,by=positions[bi:bi+2];cx,cy=positions[ci:ci+2]
  den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
  if abs(den)<1e-12:continue
  aa=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/den;bb=((cy-ay)*(px-cx)+(ax-cx)*(py-cy))/den
  if aa>=0 and bb>=0 and aa+bb<=1:maximum=max(maximum,aa*positions[ai+2]+bb*positions[bi+2]+(1-aa-bb)*positions[ci+2])
 return maximum*.195
for side in [-1,1]:
 surface=eye_surface(side*.034,.009)
 for label,color,scale,z in [('eye','#c8c4b5',(.0125,.0045,.00525),surface-.001),('iris','#6b4c36',(.00425,.001,.00425),surface+.0036),('pupil','#121817',(.0018,.0005,.0021),surface+.0046)]:
  mat=plain('Unchanged '+label,color,.18)
  p=origins[2]+Vector((side*.034,.009,z));bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=to_blender(p))
  obj=bpy.context.object;obj.name=label+' reference '+str(side);obj.scale=scale;obj.data.materials.append(mat);obj.parent=rig
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  for b in bones:obj.vertex_groups.new(name=b['name'])
  obj.vertex_groups[2].add(list(range(len(obj.data.vertices))),1,'REPLACE');mod=obj.modifiers.new('Same head','ARMATURE');mod.object=rig
  for p in obj.data.polygons:p.use_smooth=True

families={'sweatshirt':'male_casualsuit02','tee':'male_casualsuit06','jacket':'male_casualsuit05'}
colors={'sweatshirt':'#657b67','tee':'#8c5555','jacket':'#626e88'}
for family,asset in families.items():
 for part in ['upper','trousers']:
  obj=bpy.data.objects[asset+' '+part];mat=plain(family+' original CC0 normal/AO '+part,colors[family] if part=='upper' else '#273b40',.88 if part=='upper' else .94)
  nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
  normal=nodes.new('ShaderNodeTexImage');normal.image=bpy.data.images.load(str(ROOT/'public/models/characters/student-garments'/family/'normal.png'),check_existing=True);normal.image.colorspace_settings.name='Non-Color'
  n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.65;links.new(normal.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],bsdf.inputs['Normal'])
  ao=nodes.new('ShaderNodeTexImage');ao.image=bpy.data.images.load(str(ROOT/'public/models/characters/student-garments'/family/'ao.png'),check_existing=True);ao.image.colorspace_settings.name='Non-Color'
  mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.45;mix.inputs[1].default_value=linear(colors[family] if part=='upper' else '#273b40');links.new(ao.outputs['Color'],mix.inputs[2]);
  rib=nodes.new('ShaderNodeAttribute');rib.attribute_name='Authored rib edge tint';rib_mix=nodes.new('ShaderNodeMixRGB');rib_mix.blend_type='MULTIPLY';rib_mix.inputs[0].default_value=1;links.new(mix.outputs[0],rib_mix.inputs[1]);links.new(rib.outputs['Color'],rib_mix.inputs[2]);links.new(rib_mix.outputs[0],bsdf.inputs['Base Color'])
  obj.data.materials.clear();obj.data.materials.append(mat)
  female=bpy.data.objects.get(asset+' female fit '+part)
  if female:female.data.materials.clear();female.data.materials.append(mat)

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.cycles.denoising_use_gpu=False
scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=960;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.20,.25,.29,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.24
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));floor=bpy.context.object;floor.name='Review ground';floor.data.materials.append(plain('Review ground','#38464c',.94))
def area(name,pos,energy,size,color):
 data=bpy.data.lights.new(name,'AREA');obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=pos;data.energy=energy;data.shape='DISK';data.size=size;data.color=color;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Soft key',(-3,-4,5),650,4,(1,.88,.74));area('Soft fill',(4,-1,3),280,3,(.66,.79,1));area('Back outline',(1,4,4),500,3,(.85,.92,1))
camera_data=bpy.data.cameras.new('Garment review camera');camera=bpy.data.objects.new('Garment review camera',camera_data);bpy.context.collection.objects.link(camera);scene.camera=camera;camera_data.lens=58
def pose(wave=False):
 for p in rig.pose.bones:p.rotation_mode='XYZ';p.rotation_euler=(0,0,0)
 rest=math.acos(.835/.84)
 for side in ['left','right']:
  rig.pose.bones[side].rotation_euler.x=-rest;rig.pose.bones[side+'Knee'].rotation_euler.x=rest*2;rig.pose.bones[side+'Foot'].rotation_euler.x=-rest
 rig.pose.bones['arm'].rotation_euler.z=-.04;rig.pose.bones['rightArm'].rotation_euler.z=.04
 rig.pose.bones['leftElbow'].rotation_euler.x=rig.pose.bones['rightElbow'].rotation_euler.x=-.1
 if wave:rig.pose.bones['arm'].rotation_euler.x=-1.8;rig.pose.bones['arm'].rotation_euler.z=-.25;rig.pose.bones['leftElbow'].rotation_euler.x=-.85
def show(family):
 for obj in previous:obj.hide_render=family!='previous';obj.hide_viewport=family!='previous'
 for f,asset in families.items():
  for part in ['upper','trousers']:bpy.data.objects[asset+' '+part].hide_render=f!=family;bpy.data.objects[asset+' '+part].hide_viewport=f!=family
 bare.hide_render=family!='tee';bare.hide_viewport=family!='tee'
views={'front':((0,-3.5,1.1),(0,0,.9)),'three-quarter':((2.2,-3.1,1.35),(0,0,.9)),'profile':((3.6,0,1.25),(0,0,.9)),'wave':((2.6,-4.0,1.7),(0,0,1.05))}
for family,view in [('previous','three-quarter'),('previous','wave'),('sweatshirt','front'),('sweatshirt','three-quarter'),('sweatshirt','profile'),('sweatshirt','wave'),('tee','three-quarter'),('tee','wave'),('jacket','three-quarter'),('jacket','wave')]:
 if '--save-only' in sys.argv:continue
 if '--remaining' in sys.argv and (family,view) in [('previous','three-quarter'),('previous','wave'),('sweatshirt','front'),('sweatshirt','three-quarter'),('sweatshirt','profile')]:continue
 show(family);pose(view=='wave');location,target=views[view];camera.location=location;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(family+'-'+view+'.png'));bpy.ops.render.render(write_still=True);print('GARMENT_REVIEW_RENDER',family,view,flush=True)
show('sweatshirt');pose();location,target=views['three-quarter'];camera.location=location;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(MASTER))
assert hashlib.sha256(ANATOMY_PATH.read_bytes()).hexdigest()==UNCHANGED
print('ANATOMY_UNCHANGED',UNCHANGED,flush=True)
