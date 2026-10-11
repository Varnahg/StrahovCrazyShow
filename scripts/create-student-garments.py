"""Independent CC0 garment authoring phase. Does not regenerate anatomy/head/hair.

MakeHuman's MHCLO fitting and original painted weights are retained, then the
source skeleton is reduced to the game's existing thirteen translation pivots.
Run with Blender --background --threads 2 --python scripts/create-student-garments.py.
"""
import bpy,bmesh,json,pathlib,math,hashlib,collections,shutil,heapq
from mathutils import Vector,Matrix

ROOT=pathlib.Path(__file__).resolve().parents[1]
SRC=ROOT/'assets/sources/characters/makehuman-clothes'
OUT=ROOT/'client/data/student-garments.json'
MASTER=ROOT/'assets/blender/characters/student-garments.blend'
DOC=ROOT/'docs/characters/student-garments'
PUBLIC=ROOT/'public/models/characters/student-garments'
for p in [OUT.parent,MASTER.parent,DOC,PUBLIC]:p.mkdir(parents=True,exist_ok=True)
ANATOMY_PATH=ROOT/'client/data/skinned-character-geometry.json'
ANATOMY_SHA=hashlib.sha256(ANATOMY_PATH.read_bytes()).hexdigest()
ANATOMY=json.loads(ANATOMY_PATH.read_text(encoding='utf8'))
SOURCE_META=json.loads((SRC/'source.json').read_text(encoding='utf8'))
for name,info in SOURCE_META['files'].items():assert hashlib.sha256((SRC/name).read_bytes()).hexdigest()==info['sha256'],name
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)

def read_obj(path):
 vs=[];uvs=[];faces=[];groups={};group=None
 for line in path.read_text(encoding='utf8').splitlines():
  a=line.split()
  if not a:continue
  if a[0]=='v':vs.append(Vector(tuple(map(float,a[1:4]))))
  elif a[0]=='vt':uvs.append(tuple(map(float,a[1:3])))
  elif a[0]=='g':group=' '.join(a[1:]);groups.setdefault(group,set())
  elif a[0]=='f':
   face=[(int(p.split('/')[0])-1,int(p.split('/')[1])-1 if len(p.split('/'))>1 and p.split('/')[1] else None) for p in a[1:]]
   faces.append(face)
   if group is not None:groups[group].update(v for v,_ in face)
 return vs,uvs,faces,groups

BASE,_,BASE_FACES,GROUPS=read_obj(SRC/'base.obj')
JOINTS={name:sum((BASE[i] for i in ids),Vector())/len(ids) for name,ids in GROUPS.items() if name.startswith('joint-')}
WEIGHTS=json.loads((SRC/'default_weights.mhw').read_text(encoding='utf8'))
assert WEIGHTS['license']=='CC0'

def smooth(a,b,t):
 t=max(0,min(1,(t-a)/(b-a)));return t*t*(3-2*t)
KNOTS=[(-8.34,0),(-7.44785,.075),(-3.694825,.495),(.48615,.915),(1.86665,1.055),(5.2458,1.365),(5.89025,1.425),(6.97495,1.565),(8.40435,1.68)]
def mapped_y(y):
 for (a,b),(c,d) in zip(KNOTS,KNOTS[1:]):
  if y<=c:return b+(d-b)*(y-a)/(c-a)
 return KNOTS[-1][1]+(y-KNOTS[-1][0])*.1
def world(p):return Vector((p.x*.1,mapped_y(p.y),p.z*.1))
def blender(p):return Vector((p.x,-p.z,p.y))

BONES=ANATOMY['bones'];ABS=[]
for b in BONES:ABS.append(Vector(b['translation'])+(ABS[b['parent']] if b['parent'] is not None else Vector()))
SOURCE_ORIGINS=[p.copy() for p in ABS]
SOURCE_ORIGINS[0]=world(JOINTS['joint-pelvis'])
SOURCE_ORIGINS[1]=world(JOINTS['joint-spine-3'])
SOURCE_ORIGINS[2]=world(JOINTS['joint-head'])
SOURCE_BIND=[Matrix.Translation(p) for p in SOURCE_ORIGINS]
for side,upper,knee,foot,arm,elbow in [('r',3,4,5,9,10),('l',6,7,8,11,12)]:
 for bi,name in [(upper,'upper-leg'),(knee,'knee'),(foot,'ankle'),(arm,'shoulder'),(elbow,'elbow')]:SOURCE_ORIGINS[bi]=world(JOINTS[f'joint-{side}-{name}'])
 hand=world(JOINTS[f'joint-{side}-hand'])
 for bi,end in [(upper,SOURCE_ORIGINS[knee]),(knee,SOURCE_ORIGINS[foot]),(arm,SOURCE_ORIGINS[elbow]),(elbow,hand)]:
  direction=(end-SOURCE_ORIGINS[bi]).normalized()
  rotation=Vector((0,-1,0)).rotation_difference(direction).to_matrix().to_4x4()
  SOURCE_BIND[bi]=Matrix.Translation(SOURCE_ORIGINS[bi])@rotation
 SOURCE_BIND[foot]=Matrix.Translation(SOURCE_ORIGINS[foot])
for bi in [0,1,2]:SOURCE_BIND[bi]=Matrix.Translation(SOURCE_ORIGINS[bi])
REPOSE=[Matrix.Translation(ABS[i])@SOURCE_BIND[i].inverted() for i in range(13)]

def collapse_bone(name):
 # MakeHuman anatomical L is +X; game pivot names are kept compatible.
 positive=name.endswith('.L');upper,knee,foot,arm,elbow=(6,7,8,11,12) if positive else (3,4,5,9,10)
 if name.startswith('upperleg'):return {upper:1}
 if name.startswith('lowerleg'):return {knee:1}
 if name.startswith(('foot','toe')):return {foot:1}
 if name.startswith('upperarm'):return {arm:1}
 if name.startswith(('lowerarm','wrist','finger','metacarpal')):return {elbow:1}
 if name.startswith(('clavicle','shoulder')):return {1:.65,arm:.35}
 if name.startswith(('root','pelvis','spine04','spine05')):return {0:1}
 if name.startswith(('spine','breast','levator')):return {1:1}
 return {2:1}

BASE_WEIGHTS=[collections.defaultdict(float) for _ in BASE]
for name,items in WEIGHTS['weights'].items():
 for vertex,w in items:
  for bi,factor in collapse_bone(name).items():BASE_WEIGHTS[vertex][bi]+=w*factor
for w in BASE_WEIGHTS:
 total=sum(w.values())
 if not total:w[0]=1;total=1
 for bi in list(w):w[bi]/=total

def reference_boundary(form,side):
 positions=[Vector(form['positions'][i:i+3]) for i in range(0,len(form['positions']),3)]
 keys=[tuple(round(v,6) for v in p) for p in positions];points={key:p for key,p in zip(keys,positions)}
 edges=collections.Counter()
 for i in range(0,len(form['indices']),3):
  ids=form['indices'][i:i+3]
  for a,b in zip(ids,ids[1:]+ids[:1]):edges[tuple(sorted((keys[a],keys[b])))]+=1
 boundary={p for edge,n in edges.items() if n==1 for p in edge if p[0]*side>0}
 adjacency={p:set() for p in boundary}
 for (a,b),n in edges.items():
  if n==1 and a in adjacency and b in adjacency:adjacency[a].add(b);adjacency[b].add(a)
 unseen=set(boundary);loops=[]
 while unseen:
  pending=[unseen.pop()];loop=[]
  while pending:
   p=pending.pop();loop.append(p)
   for q in adjacency[p]:
    if q in unseen:unseen.remove(q);pending.append(q)
  if len(loop)>5:loops.append(loop)
 chosen=max(loops,key=lambda loop:sum(p[1] for p in loop)/len(loop))
 index_by_key={k:i for i,k in enumerate(keys)}
 return {'centre':sum((points[p] for p in chosen),Vector())/len(chosen),'points':[{'position':points[p].copy(),'weights':{form['matricesIndices'][index_by_key[p]*4+j]:form['matricesWeights'][index_by_key[p]*4+j] for j in range(4) if form['matricesWeights'][index_by_key[p]*4+j]>0}} for p in chosen]}

REFERENCE={sex:{side:{'wrist':reference_boundary(ANATOMY['bodies'][sex]['near']['skin'],side),'upper-arm':reference_boundary(ANATOMY['bodies'][sex]['near']['sleeves'],side)} for side in [-1,1]} for sex in ['male','female']}

def fitted_clothing(asset,sex='male'):
 label=asset if sex=='male' else asset+' female fit'
 path=SRC/'clothes'/asset
 original,uvs,faces,_=read_obj(path/(asset+'.obj'))
 lines=(path/(asset+'.mhclo')).read_text(encoding='utf8').splitlines()
 scales=[1,1,1]
 for l in lines:
  a=l.split()
  if a and a[0] in ['x_scale','y_scale','z_scale']:
   axis=['x_scale','y_scale','z_scale'].index(a[0]);scales[axis]=abs(BASE[int(a[1])][axis]-BASE[int(a[2])][axis])/float(a[3])
 start=next(i for i,l in enumerate(lines) if l.startswith('verts '))+1
 fitted=[];weights=[];raw_fitted=[]
 for line in lines[start:start+len(original)]:
  a=line.split();ids=list(map(int,a[:3]));bary=list(map(float,a[3:6]));offset=list(map(float,a[6:9]))
  p=sum((BASE[i]*w for i,w in zip(ids,bary)),Vector())+Vector(tuple(offset[i]*scales[i] for i in range(3)))
  raw_fitted.append(p)
  w=collections.defaultdict(float)
  for i,factor in zip(ids,bary):
   for bi,bw in BASE_WEIGHTS[i].items():w[bi]+=bw*factor
  total=sum(w.values());w={bi:v/total for bi,v in w.items() if v>1e-7}
  source=world(p);target=sum(((REPOSE[bi]@source)*weight for bi,weight in w.items()),Vector())
  fitted.append(target);weights.append(w)
 # Source connected components separate the sewn top, trousers and attachments.
 neighbours=[set() for _ in original]
 for f in faces:
  ids=[v for v,_ in f]
  for a,b in zip(ids,ids[1:]+ids[:1]):neighbours[a].add(b);neighbours[b].add(a)
 unseen=set(range(len(original)));components=[]
 while unseen:
  pending=[unseen.pop()];component=[]
  while pending:
   v=pending.pop();component.append(v)
   for other in neighbours[v]:
    if other in unseen:unseen.remove(other);pending.append(other)
  components.append(component)
 large=[c for c in components if len(c)>100]
 large_roles={id(c):'upper' if max(fitted[i].y for i in c)>1.2 else 'trousers' for c in large}
 role={}
 for c in components:
  if len(c)>100:r=large_roles[id(c)]
  else:
   centre=sum((fitted[i] for i in c),Vector())/len(c)
   closest=min(large,key=lambda large:min((fitted[i]-centre).length_squared for i in large))
   r=large_roles[id(closest)]
  for i in c:role[i]=r
 # Fit only the existing collar opening to the unchanged Blender head's neck.
 # Keep the source sewn panels and sleeve ease; do not project onto bare anatomy.
 edge_count=collections.Counter(tuple(sorted((a,b))) for f in faces for a,b in zip([v for v,_ in f],[v for v,_ in f][1:]+[f[0][0]]))
 collar=set(v for e,count in edge_count.items() if count==1 for v in e if role[v]=='upper' and fitted[v].y>1.30 and abs(fitted[v].x)<.12)
 if collar:
  centre=sum((fitted[i] for i in collar),Vector())/len(collar)
  delta=Vector((0,1.432,.020))-centre
  for i,p in enumerate(fitted):
   if role[i]!='upper':continue
   influence=smooth(1.28,centre.y,p.y)*(1-smooth(.10,.18,abs(p.x)))
   p+=delta*influence
 # Register cuffs onto the unchanged hand/arm openings. Both datasets use the
 # same thirteen bones, so the fit stays attached during a moving gesture.
 boundary={v for edge,n in edge_count.items() if n==1 for v in edge}
 cuff_audit=[];cuff_sides={}
 for side,arm,elbow in [(-1,9,10),(1,11,12)]:
  tee=asset=='male_casualsuit06';bone=arm if tee else elbow
  cuff={i for i in boundary if role[i]=='upper' and fitted[i].x*side>.13 and weights[i].get(bone,0)>.65 and (fitted[i].y>1.08 if tee else fitted[i].y<1.18)}
  if not cuff:continue
  centre=sum((fitted[i] for i in cuff),Vector())/len(cuff)
  reference=REFERENCE[sex][side]['upper-arm' if tee else 'wrist']
  target=reference['centre']+Vector((0,-.025 if tee else -.012,0))
  delta=target-centre;start=1.365 if tee else 1.14
  source_rx=max(abs(fitted[i].x-centre.x) for i in cuff);source_rz=max(abs(fitted[i].z-centre.z) for i in cuff)
  target_rx=max(abs(point['position'].x-reference['centre'].x) for point in reference['points'])+.006
  target_rz=max(abs(point['position'].z-reference['centre'].z) for point in reference['points'])+.006
  scale_x=max(1,target_rx/max(1e-6,source_rx));scale_z=max(1,target_rz/max(1e-6,source_rz))
  for i,p in enumerate(fitted):
   if role[i]!='upper' or p.x*side<=0:continue
   influence=smooth(start,centre.y,p.y)*min(1,weights[i].get(bone,0)/.65)
   if i in cuff:influence=1
   # Widen only the terminal opening, not the entire forearm around the cuff's
   # distant centre. The latter amplifies source sleeve taper into a bell.
   opening_influence=1 if i in cuff else smooth(centre.y+.045,centre.y,p.y)
   desired=Vector((p.x+delta.x+(p.x-centre.x)*(scale_x-1)*opening_influence,p.y+delta.y,p.z+delta.z+(p.z-centre.z)*(scale_z-1)*opening_influence))
   p=p.lerp(desired,influence);fitted[i]=p
   if influence>0:
    nearest=sorted(reference['points'],key=lambda point:(point['position']-p).length_squared)[:3]
    blend=collections.defaultdict(float);factors=[1/max(.00001,(point['position']-p).length_squared) for point in nearest];total=sum(factors)
    for point,factor in zip(nearest,factors):
     for bi,w in point['weights'].items():blend[bi]+=w*factor/total
    combined=collections.defaultdict(float)
    for bi,w in weights[i].items():combined[bi]+=w*(1-influence)
    for bi,w in blend.items():combined[bi]+=w*influence
    total=sum(combined.values());weights[i]={bi:w/total for bi,w in combined.items() if w>1e-7}
  for i in cuff:cuff_sides[i]=side
  cuff_audit.append({'side':side,'vertices':len(cuff),'source':list(centre),'target':list(target),'deltaMetres':list(delta),'openingScaleXZ':[scale_x,scale_z],'openingScaleTransitionMetres':.045,'referenceWeightsShared':True})
 # Authored rib/placket tint follows the true sewn-edge distance. Original
 # normal/AO textures remain bit-identical; player-selected hues stay intact.
 distances={i:0 for i in boundary};pending=[(0,i) for i in boundary];heapq.heapify(pending)
 while pending:
  distance,i=heapq.heappop(pending)
  if distance>distances[i] or distance>.04:continue
  for j in neighbours[i]:
   d=distance+(fitted[i]-fitted[j]).length
   if d<distances.get(j,1e9) and d<.04:distances[j]=d;heapq.heappush(pending,(d,j))
 source_objects=[];result={}
 for part in ['upper','trousers']:
  selected=[f for f in faces if role[f[0][0]]==part]
  ids=sorted(set(v for f in selected for v,_ in f));mapping={v:i for i,v in enumerate(ids)}
  mesh=bpy.data.meshes.new(label+' '+part);mesh.from_pydata([blender(fitted[v]) for v in ids],[],[[mapping[v] for v,_ in f] for f in selected]);mesh.update()
  obj=bpy.data.objects.new(label+' '+part,mesh);bpy.context.collection.objects.link(obj)
  for b in BONES:obj.vertex_groups.new(name=b['name'])
  for vi,source in enumerate(ids):
   for bi,w in weights[source].items():obj.vertex_groups[bi].add([vi],w,'REPLACE')
  uv=mesh.uv_layers.new(name='Original MakeHuman UV')
  for target,original_face in zip(mesh.polygons,selected):
   target.use_smooth=True
   for loop,(_,ti) in zip(target.loop_indices,original_face):uv.data[loop].uv=uvs[ti] if ti is not None else (0,0)
  rib=mesh.color_attributes.new(name='Authored rib edge tint',type='FLOAT_COLOR',domain='POINT')
  cuff_tag=mesh.attributes.new(name='Cuff side',type='FLOAT',domain='POINT')
  for target,source in enumerate(ids):
   darkness=.24 if part=='upper' else .10
   value=1-darkness*(1-smooth(0,.028,distances.get(source,1)))
   rib.data[target].color=(value,value,value,1)
   cuff_tag.data[target].value=cuff_sides.get(source,0)
  obj['source']=asset;obj['license']='CC0-1.0';obj['derivative']='MHCLO fitted + original painted weights collapsed to 13 game bones'
  if sex=='female':obj.hide_render=True;obj.hide_viewport=True
  result[part]=obj
 # Preserve the highest unmodified source mesh beside the fitted editable one.
 mesh=bpy.data.meshes.new(asset+' unmodified original');mesh.from_pydata([blender(v*.1) for v in original],[],[[v for v,_ in f] for f in faces]);mesh.update()
 raw=bpy.data.objects.new(asset+' unmodified CC0 source',mesh);bpy.context.collection.objects.link(raw);raw.hide_render=True;raw.hide_viewport=True
 return result,{'sourceVertices':len(original),'sourceFaces':len(faces),'components':[{'vertices':len(c),'minY':min(fitted[i].y for i in c),'maxY':max(fitted[i].y for i in c)} for c in components],'collarVertices':len(collar),'cuffRegistrations':cuff_audit,'scales':scales}

def export(obj,subdiv=0,ratio=1):
 obj=obj.copy();obj.data=obj.data.copy();obj.hide_viewport=False;obj.hide_render=False;bpy.context.collection.objects.link(obj)
 if subdiv:
  mod=obj.modifiers.new('Highest garment smoothing','SUBSURF');mod.levels=subdiv;mod.render_levels=subdiv
  bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
 if ratio<1:
  edge_count=collections.Counter(tuple(sorted(e.vertices)) for e in obj.data.edges)
  boundary_edges=collections.Counter(tuple(sorted((a,b))) for f in obj.data.polygons for a,b in zip(list(f.vertices),list(f.vertices)[1:]+[f.vertices[0]]))
  protected={v for edge,n in boundary_edges.items() if n==1 for v in edge}
  interior=obj.vertex_groups.new(name='LOD interior, sewn boundaries protected')
  interior.add([v.index for v in obj.data.vertices if v.index not in protected],1,'REPLACE')
  mod=obj.modifiers.new('Medium tee, preserve sewn openings','DECIMATE');mod.ratio=ratio;mod.vertex_group=interior.name;mod.vertex_group_factor=1000
  bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
 mesh=obj.data;mesh.calc_loop_triangles();positions=[];normals=[];uvs=[];colors=[];cuff_sides=[];indices=[];bone_indices=[];weights=[];seen={}
 rib=mesh.color_attributes.get('Authored rib edge tint')
 cuff_tag=mesh.attributes.get('Cuff side')
 for tri in mesh.loop_triangles:
  for li in tri.loops:
   loop=mesh.loops[li];v=mesh.vertices[loop.vertex_index];uv=mesh.uv_layers.active.data[li].uv;n=mesh.corner_normals[li].vector
   key=(v.index,round(uv.x,6),round(uv.y,6),*(round(x,6) for x in n))
   if key not in seen:
    seen[key]=len(positions)//3;p=v.co
    positions.extend([round(p.x,7),round(p.z,7),round(-p.y,7)]);normals.extend([round(n.x,7),round(n.z,7),round(-n.y,7)]);uvs.extend([round(uv.x,7),round(uv.y,7)])
    colors.extend([round(c,6) for c in rib.data[v.index].color] if rib else [1,1,1,1])
    cuff_sides.append(1 if cuff_tag and cuff_tag.data[v.index].value>.999 else -1 if cuff_tag and cuff_tag.data[v.index].value<-.999 else 0)
    vw=sorted([(g.group,g.weight) for g in v.groups if g.group<len(BONES) and g.weight>1e-7],key=lambda x:-x[1])[:4];total=sum(w for _,w in vw)
    for j in range(4):bone_indices.append(vw[j][0] if j<len(vw) else 0);weights.append(round(vw[j][1]/total,7) if j<len(vw) else 0)
   indices.append(seen[key])
 bpy.data.objects.remove(obj,do_unlink=True)
 return {'positions':positions,'normals':normals,'uvs':uvs,'colors':colors,'cuffSides':cuff_sides,'indices':indices,'matricesIndices':bone_indices,'matricesWeights':weights}

FAMILIES={'sweatshirt':'male_casualsuit02','tee':'male_casualsuit06','jacket':'male_casualsuit05'}
data={'schema':1,'source':SOURCE_META,'unchangedAnatomySha256':ANATOMY_SHA,'bones':BONES,'families':{},'femaleFamilies':{}}
all_objects=[];audits={}
for family,asset in FAMILIES.items():
 objs,audit=fitted_clothing(asset);audits[family]=audit;all_objects.extend(objs.values())
 data['families'][family]={level:{part:export(obj,1 if level=='near' and part=='upper' and family!='tee' else 0,.55 if level=='medium' and part=='upper' and family=='tee' else 1) for part,obj in objs.items()} for level in ['near','medium']}
 source=SRC/'clothes'/asset;target=PUBLIC/family;target.mkdir(parents=True,exist_ok=True)
 for role in ['normal','ao']:shutil.copyfile(source/(asset+'_'+role+'.png'),target/(role+'.png'))
 # A complete editable highest subdivision remains in the master.
 for obj in objs.values():
  mod=obj.modifiers.new('Editable highest smoothing','SUBSURF');mod.levels=1;mod.render_levels=2
 female,female_audit=fitted_clothing(asset,'female');audits[family+'-female']=female_audit;all_objects.extend(female.values())
 data['femaleFamilies'][family]={level:{part:export(obj,1 if level=='near' and part=='upper' and family!='tee' else 0,.55 if level=='medium' and part=='upper' and family=='tee' else 1) for part,obj in female.items()} for level in ['near','medium']}
 for obj in female.values():
  mod=obj.modifiers.new('Editable highest smoothing','SUBSURF');mod.levels=1;mod.render_levels=2

# Editable armature uses the same local axes as runtime after RH Y-up conversion.
arm=bpy.data.armatures.new('Existing 13 game bones');rig=bpy.data.objects.new('Existing 13 game bones',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for i,b in enumerate(BONES):
 bone=arm.edit_bones.new(b['name']);bone.head=blender(ABS[i]);bone.tail=bone.head+Vector((0,0,.07));bone.parent=arm.edit_bones[BONES[b['parent']]['name']] if b['parent'] is not None else None
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
for obj in all_objects:
 mod=obj.modifiers.new('Game skin weights','ARMATURE');mod.object=rig;obj.parent=rig
OUT.write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
assert hashlib.sha256(ANATOMY_PATH.read_bytes()).hexdigest()==ANATOMY_SHA,'Stable anatomy was modified'
stats={f:{level:{part:{'vertices':len(g['positions'])//3,'triangles':len(g['indices'])//3} for part,g in parts.items()} for level,parts in levels.items()} for f,levels in data['families'].items()}
(DOC/'garment-source-audit.json').write_text(json.dumps({'anatomyUnchangedSha256':ANATOMY_SHA,'dataSha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'bytes':OUT.stat().st_size,'source':SOURCE_META,'fit':audits,'stats':stats},indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(MASTER))
print('STUDENT_GARMENTS',json.dumps(stats))
