"""Original B6 common-area asset library. Blender 5.2, metres, no source photo pixels."""
import bpy, math, json, random, struct, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/b6';SRC=ROOT/'assets/blender/b6';DOC=ROOT/'docs/reality-pack/b6'
for p in [OUT,SRC,DOC]:p.mkdir(parents=True,exist_ok=True)
rng=random.Random(62026)
only_sink='--only-sink' in sys.argv
skip_preview='--skip-preview' in sys.argv

def image(name,kind):
 im=bpy.data.images.new(name,width=128,height=128,alpha=True);pixels=[]
 for y in range(128):
  for x in range(128):
   noise=rng.random()*.07
   if kind=='wood': v=.54+.06*math.sin(x*.41+math.sin(y*.03))+.025*math.sin(x*1.4)+noise;c=(v+.12,v+.02,v-.10,1)
   elif kind=='vinyl':v=.43+.11*math.sin(x*.19)*math.sin(y*.23)+noise;c=(v+.15,v+.10,v-.02,1)
   elif kind=='tile':v=.78+noise if x%32>1 and y%32>1 else .56;c=(v+.01,v,v-.025,1)
   else:v=(.47 if (y//32)%2 else .29)+noise;c=(v,v+.015,v+.01,1)
   pixels.extend(c)
 im.pixels=pixels;im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
textures={k:image(k+'-authored',k) for k in ['wood','vinyl','tile','terrazzo']}
def mat(name,color,rough=.8,metal=0,texture=None,alpha=1):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*color,alpha);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 m.diffuse_color=(*color,alpha)
 if texture:
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=textures[texture];m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
 if alpha<1:p.inputs['Alpha'].default_value=alpha;m.surface_render_method='DITHERED'
 return m
white=mat('warm ceramic',(.77,.78,.73),.24);paint=mat('ivory painted timber',(.66,.64,.55),.82)
metal=mat('brushed grey metal',(.25,.28,.26),.46,.55);dark=mat('dark rubber or drain',(.08,.09,.08),.84)
wood=mat('aged timber laminate',(.55,.44,.28),.83,texture='wood');glass=mat('window glass',(.34,.46,.43),.12,alpha=.26)
tile=mat('older cream tiled surface',(.8,.79,.75),.85,texture='tile');paper=mat('notice paper',(.83,.82,.72),1)
light=mat('frosted fluorescent diffuser',(.94,.94,.85),.5)
light.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(.75,.78,.68,1)
light.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.7

def box(name,center,size,material,bevel=.006):
 bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 if bevel:
  mod=o.modifiers.new('small manufactured edge','BEVEL');mod.width=min(bevel,min(size)*.2);mod.segments=1
  bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def tube(name,a,b,r,material,segments=10):
 d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=d.length,location=(Vector(a)+Vector(b))/2)
 o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(material)
 for face in o.data.polygons:face.use_smooth=True
 return o
def oval(name,center,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=center)
 o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
 for face in o.data.polygons:face.use_smooth=True
 return o
def collision(center,size):return {'center':[center[0],center[2],-center[1]],'dimensions':[size[0],size[2],size[1]],'rotation':[0,0,0]}
def door():
 for x in [-.625,.625]:box('painted jamb',(x,0,1.09),(.08,.15,2.18),paint)
 box('door lintel',(0,0,2.18),(1.33,.15,.08),paint)
 box('open timber leaf',(-.575,.55,1.035),(.045,1.1,2.07),paint)
 box('leaf inset panel',(-.548,.55,1.14),(.012,.90,1.45),wood)
 tube('lever',(-.52,1.015,1.0),(-.52,.91,1.0),.012,metal)
 return [collision((-.575,.55,1.035),(.045,1.1,2.07))]
def fixture():
 box('fluorescent backing',(0,0,.045),(1.25,.22,.09),paint)
 box('frosted broad lens',(0,0,.012),(1.15,.18,.025),light)
 for x in [-.52,.52]:box('lens clamp',(x,0,.015),(.025,.19,.04),metal)
 return []
def reception():
 box('counter body',(0,0,.48),(2.5,.75,.96),wood,.015)
 box('recessed toe kick',(0,.05,.08),(2.30,.60,.16),dark)
 box('window transaction shelf',(0,-.08,1.0),(2.65,.96,.07),wood,.012)
 for x in [-1.24,1.24]:tube('window upright',(x,.29,1.02),(x,.29,2.45),.025,metal)
 tube('window top',(-1.24,.29,2.45),(1.24,.29,2.45),.025,metal)
 box('glazed counter screen',(0,.29,1.94),(2.4,.018,1.0),glass,0)
 box('service hatch clear gap marker',(0,.30,1.29),(.80,.023,.04),metal)
 return [collision((0,0,.52),(2.65,.96,1.04)),collision((0,.29,1.94),(2.4,.035,1.0))]
def board():
 box('pinboard frame',(0,0,.60),(1.35,.06,.90),wood)
 box('quiet cork',(0,-.035,.60),(1.26,.012,.81),paint,0)
 for x,y,z,w,h in [(-.39,-.046,.68,.28,.37),(-.02,-.048,.67,.29,.40),(.36,-.047,.64,.27,.32)]:
  box('fictional demo notice',(x,y,z),(w,.008,h),paper,0)
  for i in range(3):box('authored notice text stripe',(x,y-.006,z+.08-i*.045),(w*.72,.004,.008),dark,0)
 return []
def sink():
 # Continuous concave ceramic surface instead of a solid box basin.
 verts=[(0,0,.735)];faces=[]
 for r,z in [(.22,.738),(.65,.78),(1,.855),(1.06,.87)]:
  for i in range(24):a=i*math.tau/24;verts.append((math.sin(a)*r*.29,math.cos(a)*r*.215,z))
 for i in range(24):faces.append((0,1+i,1+(i+1)%24))
 for ring in range(3):
  for i in range(24):a=1+ring*24+i;b=1+ring*24+(i+1)%24;faces.append((a,b,b+24,a+24))
 mesh=bpy.data.meshes.new('concave basin');mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new('ceramic wash basin',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(white)
 sol=o.modifiers.new('ceramic thickness','SOLIDIFY');sol.thickness=.018;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sol.name)
 for f in o.data.polygons:f.use_smooth=True
 box('rear ledge',(0,.22,.846),(.62,.12,.07),white,.018)
 tube('tap upright',(0,.20,.88),(0,.20,1.02),.018,metal)
 tube('tap spout',(0,.20,1.02),(0,.035,1.02),.016,metal)
 tube('drain tail',(0,0,.72),(0,0,.45),.025,white)
 tube('drain bend',(0,0,.45),(0,.25,.45),.025,white)
 box('mirror',(0,.295,1.47),(.62,.025,.55),glass)
 return [collision((0,0,.79),(.66,.55,.24)),collision((0,.29,1.47),(.65,.035,.58))]
def toilet():
 box('pedestal',(0,.025,.18),(.25,.33,.36),white,.035)
 oval('bowl underside',(0,-.05,.30),(.21,.26,.16),white)
 bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=8,location=(0,-.055,.45),major_radius=.165,minor_radius=.040)
 o=bpy.context.object;o.name='hollow ceramic bowl rim';o.scale.y=1.32;o.data.materials.append(white)
 oval('deep bowl water',(0,-.055,.417),(.145,.185,.014),dark)
 box('cistern',(0,.215,.64),(.36,.18,.39),white,.025)
 box('tank lid',(0,.215,.845),(.38,.195,.026),white,.015)
 tube('flush button',(0,.215,.86),(0,.215,.875),.025,metal)
 return [collision((0,.025,.44),(.43,.68,.88))]
def shower():
 box('non-slip tray',(0,0,.035),(.94,.94,.07),tile,.018)
 for x in [-.47,.47]:box('tray curb',(x,0,.075),(.055,.94,.08),white)
 box('back tiled screen',(0,.47,1.05),(.97,.035,2.1),tile)
 box('left tiled screen',(-.47,0,1.05),(.035,.94,2.1),tile)
 tube('curtain rail',(-.46,-.44,2.12),(.46,-.44,2.12),.015,metal)
 # Partially gathered curtain leaves an actual walk-in gap.
 for i in range(7):box('folded shower curtain',(-.43+i*.027,-.43+math.sin(i)*.02,1.18),(.035,.025,1.73),paper,.003)
 tube('shower riser',(.05,.43,.85),(.05,.43,1.9),.014,metal)
 tube('shower arm',(.05,.43,1.9),(.05,.22,1.96),.014,metal)
 oval('shower head',(.05,.20,1.96),(.055,.065,.016),metal)
 tube('drain',(0,0,.074),(0,0,.078),.045,metal)
 return [collision((0,0,.035),(.94,.94,.07)),collision((0,.47,1.05),(.97,.045,2.1)),collision((-.47,0,1.05),(.045,.94,2.1))]
def radiator():
 box('radiator body',(0,0,.36),(1.05,.11,.60),paint)
 for i in range(18):box('pressed rib',(-.49+i*.057,-.066,.36),(.018,.02,.53),white,.002)
 tube('water pipe',(.55,.04,.12),(.55,.04,.72),.012,paint)
 return [collision((0,0,.36),(1.12,.18,.72))]
def rail():
 tube('sloping handrail',(0,0,1.05),(0,-8,4.05),.028,metal)
 tube('midrail',(0,0,.55),(0,-8,3.55),.017,metal)
 for i in range(9):tube('vertical baluster',(0,-i,i*.375+.12),(0,-i,i*.375+1.05),.018,metal)
 return []
def tray():
 for x in [-.10,.10]:box('cable tray side',(x,0,.04),(.018,1.5,.08),metal)
 for i in range(9):box('tray crossbar',(0,-.68+i*.17,.015),(.2,.018,.025),metal)
 for x in [-.055,0,.055]:tube('bundled low voltage cable',(x,-.75,.045),(x,.75,.045),.007,dark,6)
 return []

builders=[('door-open',door),('fluorescent-light',fixture),('reception-counter',reception),('noticeboard',board),('sink',sink),('toilet',toilet),('shower',shower),('radiator',radiator),('stair-rail',rail),('cable-tray',tray)]
manifest={'schemaVersion':1,'units':'metres','coordinateSystem':'glTF Y-up/front+Z','photosEmbedded':False,'license':'Original project-authored geometry and textures','assets':[]}
if only_sink:manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
for id,fn in builders:
 if only_sink and id!='sink':continue
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 boxes=fn();objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(id+'.blend')))
 bpy.ops.object.join();o=bpy.context.object;o.name=id
 bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 path=OUT/(id+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=False)
 data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length])
 tris=sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
 entry={'id':id,'url':'/models/b6/'+id+'.glb','sourceBlend':'assets/blender/b6/'+id+'.blend','triangleCount':tris,'byteLength':path.stat().st_size,'collisionBoxes':boxes,'confidence':'low-typology-inferred','dimensionsMeasured':False,'currentB6Confirmed':False}
 if id=='sink':entry['geometryRepair']='Single centre vertex + fan replaces 24 collapsed centre vertices; no zero-area solidify faces. Collision boxes unchanged.'
 previous=next((i for i,a in enumerate(manifest['assets']) if a['id']==id),None)
 if previous is None:manifest['assets'].append(entry)
 else:manifest['assets'][previous]=entry
 print('B6_ASSET',id,tris)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
# Keep imported metadata byte-identical to the final public manifest.
source_manifest=ROOT/'shared/data/assets/b6-manifest.json'
source_manifest.parent.mkdir(parents=True,exist_ok=True)
source_manifest.write_bytes((OUT/'manifest.json').read_bytes())
print('B6_REALITY_ASSETS_COMPLETE',len(manifest['assets']))
if skip_preview:sys.exit(0)

# Reproducible studio verification: original models only, never reference photos.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=1440;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('neutral preview world');scene.world.color=(.26,.28,.27)
floor=mat('preview floor',(.42,.44,.41),.96)
box('preview floor',(0,0,-.03),(16,10,.05),floor)
preview_ids=['reception-counter','door-open','noticeboard','fluorescent-light','sink','toilet','shower','radiator']
for i,id in enumerate(preview_ids):
 x=(i%4-1.5)*3.4;y=(i//4-.5)*3.7
 bpy.ops.import_scene.gltf(filepath=str(OUT/(id+'.glb')))
 for o in bpy.context.selected_objects:
  if o.parent is None:o.location+=Vector((x,y,0))
 bpy.ops.object.text_add(location=(x-1.2,y-1.1,.012));label=bpy.context.object;label.data.body=id;label.data.size=.18;label.data.materials.append(mat('label '+id,(.06,.09,.08),1))
for position,power,size in [((-5,-6,9),1700,6),((5,4,7),1300,5)]:
 bpy.ops.object.light_add(type='AREA',location=position);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size
 o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(12,-17,14));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=15.8;scene.camera=camera
scene.render.filepath=str(DOC/'b6-assets-preview.png');bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'b6-assets-preview.blend'))
bpy.ops.render.render(write_still=True)
print('B6_PREVIEW_COMPLETE')
