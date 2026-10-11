"""CC0 Blender Studio anatomy -> clothed, weighted game derivatives.

Run with Blender 5.2 --background --threads 2 --python this_file.
Source bundle is kept intact. Coordinates exported in metres, feet=0, face=+Z.
The existing distance-driven IK animates the same 13 translation bind pivots.
"""
import bpy, bmesh, math, json, hashlib, pathlib, datetime
from mathutils import Vector, Matrix

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT/'assets/sources/characters/blender-human-base/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend'
SOURCE_META = json.loads((ROOT/'assets/sources/characters/blender-human-base/source.json').read_text(encoding='utf8'))
LICENSE_PATH = SOURCE.parent.parent/SOURCE_META['licenseFile']
LICENSE_BYTES = LICENSE_PATH.read_bytes()
assert hashlib.sha256(LICENSE_BYTES).hexdigest()==SOURCE_META['licenseTextSha256'], 'Authoritative anatomy licence bytes changed'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SOURCE_META['blendSha256'], 'Source anatomy hash changed'
OUT = ROOT/'client/data/skinned-character-geometry.json'
MASTER = ROOT/'assets/blender/characters/skinned-anatomy.blend'
DOC = ROOT/'docs/characters/skinned-anatomy'
for p in [OUT.parent, MASTER.parent, DOC]: p.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

BONES = [
 ('hips',None,[0,.915,0]), ('torso',0,[0,.14,0]), ('head',1,[0,.51,.005]),
 ('left',0,[-.105,0,0]), ('leftKnee',3,[0,-.42,0]), ('leftFoot',4,[0,-.42,0]),
 ('right',0,[.105,0,0]), ('rightKnee',6,[0,-.42,0]), ('rightFoot',7,[0,-.42,0]),
 ('arm',1,[-.19,.31,0]), ('leftElbow',9,[0,-.255,0]),
 ('rightArm',1,[.19,.31,0]), ('rightElbow',11,[0,-.255,0]),
]
ABS=[]
for _,parent,p in BONES: ABS.append(Vector(p)+(ABS[parent] if parent is not None else Vector()))
def xyz_blender(v): return Vector((v[0],-v[2],v[1]))
NECK_RING=[]
NECK_CENTRE=Vector((0,0))
def neck_point(theta):
 direction=Vector((math.cos(theta),math.sin(theta)))
 cross=lambda a,b:a.x*b.y-a.y*b.x
 for a,b in zip(NECK_RING,NECK_RING[1:]+NECK_RING[:1]):
  edge=b-a;den=cross(direction,edge)
  if abs(den)<1e-8:continue
  radial=cross(a-NECK_CENTRE,edge)/den;t=cross(a-NECK_CENTRE,direction)/den
  if radial>0 and -.00001<=t<=1.00001:return NECK_CENTRE+direction*radial
 return NECK_CENTRE+direction*.055
def lerp_knots(y,knots):
 for (a,b),(c,d) in zip(knots,knots[1:]):
  if y<=c: return b+(d-b)*max(0,(y-a)/(c-a))
 return knots[-1][1]+y-knots[-1][0]
def smooth(a,b,t):
 t=max(0,min(1,(t-a)/(b-a))); return t*t*(3-2*t)
def project(p,a,b):
 d=b-a;t=(p-a).dot(d)/d.length_squared
 return t,(p-(a+d*max(0,min(1,t)))).length_squared
def bone_weights(p,region,sex):
 x,y,z=p;side=-1 if x<0 else 1
 if region=='arm':
  upper,lower=(9,10) if side<0 else (11,12)
  elbow=1.11;w=smooth(elbow-.065,elbow+.065,y)
  # Inner axilla/chest vertices share source arm face-sets. They must follow
  # the spine, rather than being pulled through the chest by the upper arm.
  shoulder=smooth(1.05,1.16,y)*(1-smooth(.135,.205,abs(x)))
  return {upper:w*(1-shoulder),lower:(1-w)*(1-shoulder),1:shoulder}
 if region=='leg':
  upper,lower,foot=(3,4,5) if side<0 else (6,7,8)
  # Real trousers remain a single welded surface across the knee.
  knee=smooth(.425,.565,y);hip=smooth(.77,.945,y)
  ankle=1-smooth(.085,.15,y)
  return {upper:knee*(1-hip),lower:(1-knee)*(1-ankle),foot:(1-knee)*ankle,0:knee*hip}
 neck=smooth(1.37,1.48,y)
 spine=smooth(.96,1.12,y)
 return {0:(1-spine)*(1-neck),1:spine*(1-neck),2:neck}

def create_anatomy(sex,obj):
 mesh=obj.data; fs=mesh.attributes['.sculpt_face_set']
 # Face sets belong to the licensed source, not a classifier guessed from colour.
 arm_sets={9,10,11,12,20,21,*range(64,104)}
 head_sets={2,3,4,5,7,8,17,22}
 vertex_sets=[set() for _ in mesh.vertices]
 for f in mesh.polygons:
  for v in f.vertices: vertex_sets[v].add(fs.data[f.index].value)
 sy=1 if sex=='male' else 1.0262
 heights=[(0,0),(.08,.075),(.45,.495),(.82,.915),(1.34,1.365),(1.46,1.46),(1.6844,1.6825)]
 source_abs=[Matrix.Translation(v) for v in ABS]
 for side,upper,lower,foot in [(-1,3,4,5),(1,6,7,8)]:
  hip=Vector((side*.105,.915,0));knee=Vector((side*(.135 if sex=='male' else .115),.495,0));ankle=Vector((side*(.18 if sex=='male' else .126),.075,0))
  for bi,origin,end in [(upper,hip,knee),(lower,knee,ankle)]:
   d=end-origin;source_abs[bi]=Matrix.Translation(origin)@Matrix.Rotation(math.atan2(d.x,-d.y),4,'Z')
  source_abs[foot]=Matrix.Translation(ankle)
 for side,upper,lower in [(-1,9,10),(1,11,12)]:
  shoulder=Vector((side*(.175 if sex=='male' else .153),lerp_knots(1.335,heights),0))
  elbow=Vector((side*(.304 if sex=='male' else .247),lerp_knots(1.075,heights),.008))
  wrist=Vector((side*(.384 if sex=='male' else .346),lerp_knots(.88,heights),.018))
  for bi,origin,end in [(upper,shoulder,elbow),(lower,elbow,wrist)]:
   d=end-origin;source_abs[bi]=Matrix.Translation(origin)@Matrix.Rotation(math.atan2(d.x,-d.y),4,'Z')
 repose=[Matrix.Translation(ABS[bi])@source_abs[bi].inverted() for bi in range(len(BONES))]
 positions=[];regions=[];skin_weights=[]
 for v in mesh.vertices:
  src=v.co.copy();x,depth,h=src.x,-src.y,src.z*sy
  side=-1 if x<0 else 1;sets=vertex_sets[v.index]
  is_arm=bool(sets&arm_sets)
  is_leg=h<.83 and not is_arm
  region='arm' if is_arm else 'leg' if is_leg else 'body'
  source_p=Vector((x,lerp_knots(h,heights),depth-.012))
  weights=bone_weights(source_p,region,sex)
  if is_arm:
   upper,lower=(9,10) if side<0 else (11,12)
   w=smooth(lerp_knots(1.075,heights)-.065,lerp_knots(1.075,heights)+.065,source_p.y)
   spine=(1-smooth(.13,.24,abs(source_p.x)))*smooth(1.15,1.25,source_p.y)
   weights={upper:w*(1-spine),lower:(1-w)*(1-spine),1:spine}
  # Standard bind-matrix skinning reposes the complete welded source. The
  # former per-segment projection produced detached-looking deltoid caps.
  p=sum(((repose[bi]@source_p)*w for bi,w in weights.items()),Vector())
  if is_arm and sets & set(range(64,104)):
   # The sculpting base holds widely spread straight fingers. Relax the
   # distal fingers into a small curl before binding; no rigid claw pose.
   distance=max(0,.82-p.y);progress=smooth(0,.115,distance)
   angle=-side*.45*progress
   dx=p.x-side*.19;dy=p.y-.82
   p.x=side*.19+dx*math.cos(angle)-dy*math.sin(angle)
   p.y=.82+dx*math.sin(angle)+dy*math.cos(angle)
   p.z=.095+(p.z-.095)*(1-.25*progress)
  positions.append(p);regions.append(region);skin_weights.append(weights)
 # Use source quad neighbours to ease anatomical bulges under normal loose clothing.
 neighbours=[set() for _ in positions]
 for e in mesh.edges:
  a,b=e.vertices;neighbours[a].add(b);neighbours[b].add(a)
 adjusted=[p.copy() for p in positions]
 cloth=[]
 for i,p in enumerate(positions):
  sets=vertex_sets[i];region=regions[i]
  covered=not ((p.y>1.405 and abs(p.x)<.068) or (region=='arm' and p.y<.91))
  cloth.append(covered)
 for iteration in range(24):
  result=[p.copy() for p in adjusted]
  for i,p in enumerate(adjusted):
   if not cloth[i] or not neighbours[i]:continue
   avg=sum((adjusted[j] for j in neighbours[i]),Vector())/len(neighbours[i])
   result[i]=p.lerp(avg,.4)
  adjusted=result
 for i,p in enumerate(adjusted):
  if not cloth[i]:continue
  region=regions[i];cx=0 if region=='body' else (-.105 if p.x<0 else .105) if region=='leg' else (-.19 if p.x<0 else .19)
  radial=Vector((p.x-cx,0,p.z));r=radial.length
  if r>1e-5:
   # 14 mm tailoring ease, broad deterministic creases (not skin-tight anatomy).
   ease=.014+.003*math.sin(p.y*48+p.x*19)*math.sin(p.z*22+p.y*13)
   p+=radial*(ease/r)
  if region=='body' and .99<p.y<1.28:
   p.z=max(p.z, .093) if p.z>.07 else p.z
 # Compute the smooth surface once, before material-region splitting. Skinning
 # positions alone cannot prevent the hard deltoid caps produced by separately
 # recomputed shirt/sleeve vertex normals.
 normal_mesh=bpy.data.meshes.new(sex+' shared garment normals')
 normal_mesh.from_pydata([xyz_blender(p) for p in adjusted],[],[list(f.vertices) for f in mesh.polygons]);normal_mesh.update()
 normal_key=lambda p:tuple(round(v,6) for v in p)
 normal_map={normal_key(v.co):v.normal.copy() for v in normal_mesh.vertices}
 # Triangulate derivatives, with material regions sharing the exact same seam positions/weights.
 part_faces={'shirt':[],'sleeves':[],'skin':[],'trousers':[]}
 for f in mesh.polygons:
  face_set=fs.data[f.index].value
  avg=sum((positions[v] for v in f.vertices),Vector())/len(f.vertices)
  # The source head face-set also contains the back of the neck. Removing the
  # whole face-set opens triangular gaps beside the collar; cut by height only.
  if avg.y>1.445 or avg.y<.09:continue
  arm=face_set in arm_sets
  if arm:part='skin' if avg.y<.91 else 'sleeves' if avg.y<1.255 else 'shirt'
  else:part='trousers' if avg.y<1.018 else 'shirt'
  part_faces[part].append(f)
 objects=[]
 for part,faces in part_faces.items():
  ids=sorted(set(v for f in faces for v in f.vertices));remap={v:i for i,v in enumerate(ids)}
  data=bpy.data.meshes.new(f'{sex}-{part}');data.from_pydata([xyz_blender(adjusted[i]) for i in ids],[],[[remap[v] for v in f.vertices] for f in faces]);data.update()
  result=bpy.data.objects.new(f'{sex}-{part}',data);bpy.context.scene.collection.objects.link(result)
  for bi,(name,_,_) in enumerate(BONES):result.vertex_groups.new(name=name)
  for target,index in enumerate(ids):
   weights=skin_weights[index];total=sum(weights.values())
   for bi,w in weights.items():
    if w>1e-6:result.vertex_groups[bi].add([target],w/total,'REPLACE')
  uv=data.uv_layers.new(name='SourceUV')
  for fi,f in enumerate(faces):
   for li,source_loop in zip(data.polygons[fi].loop_indices,f.loop_indices): uv.data[li].uv=mesh.uv_layers.active.data[source_loop].uv
  for poly in data.polygons:poly.use_smooth=True
  if part=='shirt':
   # A tailored level collar, not a material assignment made from whole
   # stair-stepped source quads. The actual head supplies the skin below it.
   bm=bmesh.new();bm.from_mesh(data)
   bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=Vector((0,0,1.425)),plane_no=Vector((0,0,1)),clear_inner=False,clear_outer=False)
   bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_center_median().z>1.425001 and abs(f.calc_center_median().x)<.11],context='FACES')
   # Bridge the clean outer cut to the actual source neck cross-section.
   # A concealed inner underlap accommodates all custom face/body widths.
   plane_edges=[e for e in bm.edges if e.is_boundary and all(v.co.z>1.37 for v in e.verts)]
   unseen=set(plane_edges);loops=[]
   while unseen:
    pending=[unseen.pop()];component=[]
    while pending:
     edge=pending.pop();component.append(edge)
     for v in edge.verts:
      for other in v.link_edges:
       if other in unseen:unseen.remove(other);pending.append(other)
    loops.append(component)
   deform=bm.verts.layers.deform.verify()
   for loop in loops:
    outer=set(v for e in loop for v in e.verts)
    if not (min(v.co.x for v in outer)<0<max(v.co.x for v in outer)):
     bmesh.ops.holes_fill(bm,edges=loop,sides=0);continue
    inner={}
    for v in outer:
     p=Vector((v.co.x,-v.co.y));theta=math.atan2(p.y-NECK_CENTRE.y,p.x-NECK_CENTRE.x)
     target=NECK_CENTRE+(neck_point(theta)-NECK_CENTRE)*.60
     n=bm.verts.new((target.x,-target.y,1.425));inner[v]=n
     for bi,w in bone_weights(Vector((target.x,1.425,target.y)),'body',sex).items():n[deform][bi]=w
    for e in loop:
     a,b=e.verts
     try:bm.faces.new((a,b,inner[b],inner[a]))
     except ValueError:pass
   bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
   bm.to_mesh(data);bm.free();data.update()
  for poly in data.polygons:poly.use_smooth=True
  custom_normals=[normal_map.get(normal_key(v.co),v.normal.copy()) for v in data.vertices]
  data.normals_split_custom_set_from_vertices(custom_normals)
  result['source']='Blender Studio Human Base Meshes 1.4.1 / '+obj.name
  result['license']='CC0-1.0';result['derivative']='Reposed anatomy, loose clothing ease, 13 IK weights; no scanned identity'
  objects.append(result)
 bpy.data.meshes.remove(normal_mesh)
 return objects,normal_map

def export_geometry(obj,ratio=1,shared_normals=None):
 obj=obj.copy();obj.data=obj.data.copy();bpy.context.scene.collection.objects.link(obj)
 for mod in list(obj.modifiers): obj.modifiers.remove(mod)
 if ratio<1:
  # Protect every material/sleeve/cuff boundary. Independent LOD reduction
  # must not pull neighbouring pieces apart at their originally welded seam.
  edge_faces={}
  for poly in obj.data.polygons:
   for key in poly.edge_keys:edge_faces[key]=edge_faces.get(key,0)+1
  boundary=set(v for edge,count in edge_faces.items() if count==1 for v in edge)
  protection=obj.vertex_groups.new(name='LOD-interior')
  protection.add([v.index for v in obj.data.vertices if v.index not in boundary],1,'REPLACE')
  mod=obj.modifiers.new('Derived medium LOD','DECIMATE');mod.ratio=ratio
  mod.vertex_group=protection.name;mod.vertex_group_factor=1000
  bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
 mesh=obj.data;mesh.calc_loop_triangles();positions=[];normals=[];uvs=[];indices=[];weights=[];bone_indices=[];vertices={}
 # Split UV seams only. Every split retains identical position and skin weights.
 for tri in mesh.loop_triangles:
  for li in tri.loops:
   loop=mesh.loops[li];v=mesh.vertices[loop.vertex_index];uv=mesh.uv_layers.active.data[li].uv
   normal=(shared_normals or {}).get(tuple(round(c,6) for c in v.co),mesh.corner_normals[li].vector)
   key=(v.index,round(uv.x,6),round(uv.y,6),*(round(n,6) for n in normal))
   if key not in vertices:
    vertices[key]=len(positions)//3;p=v.co;n=normal
    positions.extend([round(p.x,7),round(p.z,7),round(-p.y,7)]);normals.extend([round(n.x,7),round(n.z,7),round(-n.y,7)]);uvs.extend([round(uv.x,7),round(uv.y,7)])
    vw=sorted([(g.group,g.weight) for g in v.groups if g.group<len(BONES) and g.weight>1e-6],key=lambda g:-g[1])[:4];total=sum(w for _,w in vw)
    for gi in range(4):
     bone_indices.append(vw[gi][0] if gi<len(vw) else 0);weights.append(round(vw[gi][1]/total,7) if gi<len(vw) else 0)
   indices.append(vertices[key])
 result={'positions':positions,'normals':normals,'uvs':uvs,'indices':indices,'matricesIndices':bone_indices,'matricesWeights':weights}
 bpy.data.objects.remove(obj,do_unlink=True)
 return result

with bpy.data.libraries.load(str(SOURCE),link=False) as (src,dst):
 dst.objects=['GEO-body_male_realistic','GEO-body_female_realistic'];dst.texts=['README']
assert LICENSE_BYTES.decode('utf8').splitlines()==dst.texts[0].as_string().splitlines(), 'Licence differs from the immutable source README'
(DOC/'source-license.txt').write_bytes(LICENSE_BYTES)
for e in dst.objects[0].data.edges:
 a,b=(dst.objects[0].data.vertices[i].co for i in e.vertices)
 if (a.z-1.445)*(b.z-1.445)<0:
  p=a.lerp(b,(1.445-a.z)/(b.z-a.z));NECK_RING.append(Vector((p.x,-p.y-.012)))
NECK_CENTRE=sum(NECK_RING,Vector((0,0)))/len(NECK_RING)
NECK_RING.sort(key=lambda p:math.atan2(p.y-NECK_CENTRE.y,p.x-NECK_CENTRE.x))
data={'schema':1,'units':'metres, RH +Z front, feet 0','source':SOURCE_META,'bones':[{'name':n,'parent':p,'translation':t} for n,p,t in BONES],'bodies':{}}
# Preserve the source's human orbital rims, eyelids, nose, lips, chin and ears.
# This replaces the previous analytically shaped face, without a real identity.
source_head=dst.objects[0].data
head_faces=list(source_head.polygons)
head_ids=sorted(set(v for f in head_faces for v in f.vertices));head_map={v:i for i,v in enumerate(head_ids)}
head_mesh=bpy.data.meshes.new('CC0 realistic head normalized')
head_mesh.from_pydata([(source_head.vertices[v].co.x/.184, (source_head.vertices[v].co.y+.012)/.195, (source_head.vertices[v].co.z-1.565)/.235) for v in head_ids],[],[[head_map[v] for v in f.vertices] for f in head_faces]);head_mesh.update()
head_obj=bpy.data.objects.new('CC0 realistic head normalized',head_mesh);bpy.context.scene.collection.objects.link(head_obj)
for n,_,_ in BONES:head_obj.vertex_groups.new(name=n)
head_obj.vertex_groups[2].add(list(range(len(head_ids))),1,'REPLACE')
head_uv=head_mesh.uv_layers.new(name='SourceUV')
for fi,f in enumerate(head_faces):
 for li,source_loop in zip(head_mesh.polygons[fi].loop_indices,f.loop_indices):head_uv.data[li].uv=source_head.uv_layers.active.data[source_loop].uv
for p in head_mesh.polygons:p.use_smooth=True
bm=bmesh.new();bm.from_mesh(head_mesh)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=Vector((0,0,(1.445-1.565)/.235)),plane_no=Vector((0,0,1)),clear_inner=True,clear_outer=False)
boundary=[edge for edge in bm.edges if edge.is_boundary]
extruded=bmesh.ops.extrude_edge_only(bm,edges=boundary)
new_verts=[v for v in extruded['geom'] if isinstance(v,bmesh.types.BMVert)]
bmesh.ops.translate(bm,verts=new_verts,vec=Vector((0,0,-.020/.235)))
for v in new_verts:
 p=Vector((v.co.x*.184,-v.co.y*.195));p=NECK_CENTRE+(p-NECK_CENTRE)*.82
 v.co.x=p.x/.184;v.co.y=-p.y/.195
extruded=bmesh.ops.extrude_edge_only(bm,edges=[edge for edge in bm.edges if edge.is_boundary])
new_verts=[v for v in extruded['geom'] if isinstance(v,bmesh.types.BMVert)]
bmesh.ops.translate(bm,verts=new_verts,vec=Vector((0,0,-.012/.235)))
for v in new_verts:
 p=Vector((v.co.x*.184,-v.co.y*.195));p=NECK_CENTRE+(p-NECK_CENTRE)*(.35/.82)
 v.co.x=p.x/.184;v.co.y=-p.y/.195
bmesh.ops.holes_fill(bm,edges=[edge for edge in bm.edges if edge.is_boundary],sides=0)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(head_mesh);bm.free();head_mesh.update()
for p in head_mesh.polygons:p.use_smooth=True
data['head']=export_geometry(head_obj)
data['headMedium']=export_geometry(head_obj,.45)
for head_data in [data['head'],data['headMedium']]:
 colors=[]
 for i in range(len(head_data['positions'])//3):
  x,y,z=head_data['positions'][i*3:i*3+3];wx=x*.184;wy=y*.235+1.565;wz=z*.195
  lip=math.exp(-((wx/.032)**4)-(((wy-1.496)/.011)**4)) * smooth(.080,.115,wz)
  cheek=math.exp(-(((abs(wx)-.052)/.027)**2)-(((wy-1.542)/.035)**2))*smooth(.055,.10,wz)
  nose=math.exp(-((wx/.024)**2)-(((wy-1.543)/.032)**2))*smooth(.10,.13,wz)
  # Authored pigment tint, multiplied by the player's chosen skin colour.
  # These are not biometric photographs or a claimed measured skin texture.
  colors.extend([round(1-.04*lip,5),round(1-.22*lip-.055*cheek-.035*nose,5),round(1-.2*lip-.065*cheek-.045*nose,5),1])
 head_data['colors']=colors
data['hair']={}
for style,length in [('close',.005),('crop',.012),('wave',.022),('curls',.026),('bob',.018),('long',.019)]:
 selected=[]
 for face in head_mesh.polygons:
  p=sum((head_mesh.vertices[v].co for v in face.vertices),Vector())/len(face.vertices)
  wx,wy,wz=p.x*.184,p.z*.235+1.565,-p.y*.195
  hairline=1.535+.083*smooth(-.065,.075,wz)
  if abs(wx)>.075:hairline=max(hairline,1.591)
  if wy>hairline:selected.append(face)
 ids=sorted(set(v for f in selected for v in f.vertices));mapping={v:i for i,v in enumerate(ids)};verts=[]
 for i in ids:
  src=head_mesh.vertices[i];p=src.co.copy();world=Vector((p.x*.184,p.z*.235+1.565,-p.y*.195))
  normal=Vector((src.normal.x/.184,src.normal.z/.235,-src.normal.y/.195)).normalized()
  wave=.002*math.sin(world.x*140+world.y*65)*math.sin(world.z*95+world.y*23) if style in ['wave','curls'] else .0008*math.sin(world.x*220+world.z*130)
  if style=='curls':wave+=.003*math.sin(world.x*180)*math.sin(world.z*180)
  world+=normal*(length+wave)
  verts.append((world.x/.184,-world.z/.195,(world.y-1.565)/.235))
 faces=[[mapping[v] for v in f.vertices] for f in selected]
 if style in ['bob','long']:
  edges={}
  for face in faces:
   for a,b in zip(face,face[1:]+face[:1]):
    key=tuple(sorted([a,b]));edges[key]=edges.get(key,0)+1
  extended={}
  for (a,b),count in edges.items():
   if count!=1:continue
   if any(-verts[v][1]*.195>.035 and abs(verts[v][0]*.184)<.07 for v in [a,b]):continue
   for v in [a,b]:
    if v in extended:continue
    x,y,z=verts[v];wx=x*.184;wz=-y*.195
    end=1.43 if style=='bob' else 1.235
    side_flare=(.008 if style=='bob' else .016)*(1 if wx>0 else -1)
    back_offset=.008 if style=='bob' else .035
    extended[v]=len(verts);verts.append(((wx+side_flare)/.184,-(wz-back_offset)/.195,(end-1.565)/.235))
   faces.append([a,b,extended[b],extended[a]])
 hair_mesh=bpy.data.meshes.new('Scalp fitted '+style);hair_mesh.from_pydata(verts,[],faces);hair_mesh.update()
 bm=bmesh.new();bm.from_mesh(hair_mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(hair_mesh);bm.free();hair_mesh.update()
 hair_obj=bpy.data.objects.new('CC0 scalp fitted '+style,hair_mesh);bpy.context.scene.collection.objects.link(hair_obj)
 for n,_,_ in BONES:hair_obj.vertex_groups.new(name=n)
 hair_obj.vertex_groups[2].add(list(range(len(verts))),1,'REPLACE')
 hair_uv=hair_mesh.uv_layers.new(name='HairFlow')
 for f in hair_mesh.polygons:
  f.use_smooth=True
  for li in f.loop_indices:
   p=hair_mesh.vertices[hair_mesh.loops[li].vertex_index].co
   hair_uv.data[li].uv=(math.atan2(p.x,-p.y)/(2*math.pi)+.5,p.z)
 solidify=hair_obj.modifiers.new('Closed hair shell','SOLIDIFY');solidify.thickness=.018
 bpy.context.view_layer.objects.active=hair_obj;hair_obj.select_set(True);bpy.ops.object.modifier_apply(modifier=solidify.name);hair_obj.select_set(False)
 data['hair'][style]=export_geometry(hair_obj)
 hair_obj.hide_render=True;hair_obj.hide_viewport=True
data['accessories']={}
# Opaque lightweight spectacles are one shared authored mesh, fitted in the
# same normalized head coordinates as the CC0 face. No transparent lens pass.
curve=bpy.data.curves.new('Fitted spectacle frame paths','CURVE');curve.dimensions='3D';curve.resolution_u=1;curve.bevel_depth=.00165;curve.bevel_resolution=1;curve.use_fill_caps=True
paths=[]
for side in [-1,1]:
 cx=side*.034;cy=.009;rx=.025;ry=.016;r=.005;path=[]
 for ox,oy,start in [(rx-r,ry-r,0),(-rx+r,ry-r,90),(-rx+r,-ry+r,180),(rx-r,-ry+r,270)]:
  for j in range(6):
   angle=math.radians(start+j*90/5);path.append((cx+ox+r*math.cos(angle),cy+oy+r*math.sin(angle),.142))
 paths.append((path,True))
 paths.append(([(side*.059,.009,.142),(side*.079,.009,.104),(side*.087,.007,.038),(side*.087,-.006,-.008)],False))
paths.append(([(-.009,.016,.144),(-.005,.019,.149),(0,.020,.151),(.005,.019,.149),(.009,.016,.144)],False))
for path,closed in paths:
 spline=curve.splines.new('POLY');spline.points.add(len(path)-1);spline.use_cyclic_u=closed
 for point,co in zip(spline.points,path):point.co=(*xyz_blender(co),1)
glasses=bpy.data.objects.new('Authored fitted glasses',curve);bpy.context.collection.objects.link(glasses);bpy.context.view_layer.objects.active=glasses;glasses.select_set(True);bpy.ops.object.convert(target='MESH');glasses=bpy.context.object;glasses.select_set(False)
for v in glasses.data.vertices:v.co.x/=.184;v.co.y/=.195;v.co.z/=.235
for n,_,_ in BONES:glasses.vertex_groups.new(name=n)
glasses.vertex_groups[2].add(list(range(len(glasses.data.vertices))),1,'REPLACE')
uv=glasses.data.uv_layers.new(name='Authored')
for f in glasses.data.polygons:
 f.use_smooth=True
 for li in f.loop_indices:
  p=glasses.data.vertices[glasses.data.loops[li].vertex_index].co;uv.data[li].uv=(p.x,p.z)
data['accessories']['glasses']=export_geometry(glasses);glasses.hide_render=True;glasses.hide_viewport=True
# A trimmed stubble shell follows the new jaw, rather than the former egg head.
selected=[]
for f in head_mesh.polygons:
 p=sum((head_mesh.vertices[v].co for v in f.vertices),Vector())/len(f.vertices)
 x,y,z=p.x*.184,p.z*.235+1.565,-p.y*.195
 if 1.455<y<1.517 and z>.02 and (y<1.486 or abs(x)>.036 or y>1.505):selected.append(f)
ids=sorted(set(v for f in selected for v in f.vertices));mapping={v:i for i,v in enumerate(ids)};verts=[]
for i in ids:
 v=head_mesh.vertices[i];p=v.co.copy();n=Vector((v.normal.x/.184,v.normal.y/.195,v.normal.z/.235)).normalized()
 p+=Vector((n.x/.184,n.y/.195,n.z/.235))*.0028;verts.append(p)
beard_mesh=bpy.data.meshes.new('Fitted stubble shell');beard_mesh.from_pydata(verts,[],[[mapping[v] for v in f.vertices] for f in selected]);beard_mesh.update()
beard=bpy.data.objects.new('CC0 jaw fitted beard',beard_mesh);bpy.context.collection.objects.link(beard)
for n,_,_ in BONES:beard.vertex_groups.new(name=n)
beard.vertex_groups[2].add(list(range(len(verts))),1,'REPLACE')
uv=beard_mesh.uv_layers.new(name='HairFlow')
for f in beard_mesh.polygons:
 f.use_smooth=True
 for li in f.loop_indices:
  p=beard_mesh.vertices[beard_mesh.loops[li].vertex_index].co;uv.data[li].uv=(p.x,p.z)
solidify=beard.modifiers.new('Closed stubble thickness','SOLIDIFY');solidify.thickness=.006
bpy.context.view_layer.objects.active=beard;beard.select_set(True);bpy.ops.object.modifier_apply(modifier=solidify.name);beard.select_set(False)
data['accessories']['beard']=export_geometry(beard)
beard_data=data['accessories']['beard'];colors=[]
for i in range(len(beard_data['positions'])//3):
 x,y,z=beard_data['positions'][i*3:i*3+3];x*=.184;y=y*.235+1.565;z*=.195
 feather=smooth(1.455,1.467,y)*(1-smooth(1.496,1.519,y))*smooth(.02,.045,z)
 moustache=smooth(1.505,1.508,y)*(1-smooth(1.512,1.519,y))*(1-smooth(.025,.041,abs(x)))
 colors.extend([1,1,1,round(max(feather,moustache),5)])
beard_data['colors']=colors
beard.hide_render=True;beard.hide_viewport=True
head_obj.hide_render=True;head_obj.hide_viewport=True
for sex,source in zip(['male','female'],dst.objects):
 objects,shared_normals=create_anatomy(sex,source)
 data['bodies'][sex]={level:{obj.name.split('-',1)[1]:export_geometry(obj,ratio,shared_normals) for obj in objects} for level,ratio in [('near',1),('medium',.42)]}
 # Keep a real editable weighted armature in the master; runtime uses translation bind pivots.
 arm=bpy.data.armatures.new(sex+' IK bind');rig=bpy.data.objects.new(sex+' IK bind',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for bi,(name,parent,_) in enumerate(BONES):
  bone=arm.edit_bones.new(name);bone.head=xyz_blender(ABS[bi]);bone.tail=bone.head+Vector((0,0,.07));bone.parent=arm.edit_bones[BONES[parent][0]] if parent is not None else None
 bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
 for obj in objects:
  mod=obj.modifiers.new('13 joint anatomy weights','ARMATURE');mod.object=rig
  obj.parent=rig
 for obj in [*objects,rig]:obj.location.x=0 if sex=='male' else .85
 # Parent transforms should not double the layout offset.
 for obj in objects:obj.location.x=0
 source.name=sex+' untouched CC0 source anatomy';source.hide_render=True;source.hide_viewport=True;bpy.context.scene.collection.objects.link(source)
OUT.write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
stats={sex:{level:{part:{'vertices':len(g['positions'])//3,'triangles':len(g['indices'])//3} for part,g in parts.items()} for level,parts in levels.items()} for sex,levels in data['bodies'].items()}
(DOC/'geometry-audit.json').write_text(json.dumps({'source':data['source'],'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'bytes':OUT.stat().st_size,'stats':stats},indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(MASTER))
print('SKINNED_CHARACTER_AUDIT',json.dumps(stats))
