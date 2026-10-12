"""Three editable highest-v2 lawn variants; immutable photographic sources."""
import bpy, json, sys, hashlib, math, random
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.cache/street-python'))
import numpy as np
BASE=ROOT/'assets/sources/vegetation/grass_medium_01'; SRC=BASE/'source-highest'; OUT=BASE/'derived'
plan=json.loads((BASE/'highest-v2-plan.json').read_text(encoding='utf8'))
regions_path=BASE/'green-blade-regions.json'; regions=json.loads(regions_path.read_text(encoding='utf8'))
audit=json.loads((BASE/'highest-master-download-audit.json').read_text(encoding='utf8'))
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
before={f['name']:sha(SRC/f['name']) for f in audit['files']}
assert all(before[f['name']]==f['sha256'] for f in audit['files'])
v1={p.name:sha(p) for p in [OUT/'grass-authored-study.blend',OUT/'grass-authored-study.json']}
assert v1['grass-authored-study.json']==plan['preservedAB']['geometrySha256']
assert v1['grass-authored-study.blend']==plan['preservedAB']['blendSha256']
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(SRC/'grass_medium_01_8k.blend'),link=False) as (library,destination):
 destination.materials=['grass_medium_01']
material=destination.materials[0]; material.name='Original photographic grass — authored highest v2'
material.surface_render_method='DITHERED'; material.use_backface_culling=False
group=next(n for n in material.node_tree.nodes if n.type=='GROUP')
alpha=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and '_alpha_' in n.image.filepath)
cutoff=material.node_tree.nodes.new('ShaderNodeMath');cutoff.name='Original alpha >=0.45';cutoff.operation='GREATER_THAN';cutoff.inputs[1].default_value=.45
material.node_tree.links.new(alpha.outputs['Color'],cutoff.inputs[0]);material.node_tree.links.new(cutoff.outputs[0],group.inputs['Alpha'])
for node in material.node_tree.nodes:
 if node.type=='TEX_IMAGE' and node.image:
  path=SRC/'textures'/node.image.filepath.replace('\\','/').split('/')[-1];assert path.is_file()
  node.image.filepath=bpy.path.relpath(str(path),start=str(OUT))
smooth=lambda x: x*x*(3-2*x)
clamp=lambda x:max(0,min(1,x))
segments=16; cross=5; tufts=[]
for variant, spec in enumerate(plan['variants']):
 rng=random.Random(0x20261011+variant*101);positions=[];uvs=[];indices=[];refs=[]
 cut_count=round(spec['blades']*spec['cutTipFraction'])
 types=['cut']*cut_count+['intact']*(spec['blades']-cut_count);rng.shuffle(types)
 for blade,tip_type in enumerate(types):
  sample=lambda key:rng.uniform(*spec[key])/1000
  length=sample('lengthMillimetres');width=sample('widthMillimetres');lean=sample('leanMillimetres');lateral=sample('lateralCurveMillimetres')*rng.choice([-1,1])
  fold=sample('foldHeightMillimetres');twist=math.radians(rng.uniform(*spec['twistDegrees']))
  angle=rng.uniform(0,2*math.pi);direction=np.array([math.cos(angle),0.,math.sin(angle)]);side=np.array([-math.sin(angle),0.,math.cos(angle)])
  root_angle=rng.uniform(0,2*math.pi);radius=rng.uniform(.0015,.008)
  root=np.array([math.cos(root_angle)*radius,-.002,math.sin(root_angle)*radius])
  raw=[]
  for row in range(segments+1):
   t=row/segments
   raw.append(direction*(lean*t*t)+side*(lateral*math.sin(math.pi*t)*t)+np.array([0,length*(t-.045*t**4),0]))
  raw=np.array(raw);raw*=length/np.linalg.norm(np.diff(raw,axis=0),axis=1).sum()
  track_id=(blade+variant)%len(regions['tracks']);track=regions['tracks'][track_id]
  tip_ratio=rng.uniform(*(plan['commonGeometry']['tipWidthFractionCut'] if tip_type=='cut' else plan['commonGeometry']['tipWidthFractionIntact']))
  oblique=rng.uniform(-.35,.35) if tip_type=='cut' else rng.uniform(-.12,.12)
  start=len(positions);actual_widths=[]
  for row in range(segments+1):
   t=row/segments;uv=track['rows'][segments-row]
   tangent=raw[min(segments,row+1)]-raw[max(0,row-1)];tangent/=np.linalg.norm(tangent)
   lateral_axis=side-tangent*np.dot(side,tangent);lateral_axis/=np.linalg.norm(lateral_axis)
   normal_axis=np.cross(tangent,lateral_axis);normal_axis/=np.linalg.norm(normal_axis)
   theta=twist*math.sin(math.pi*t)*t
   lateral_axis=lateral_axis*math.cos(theta)+normal_axis*math.sin(theta)
   normal_axis=np.cross(tangent,lateral_axis)
   base=.32+.68*smooth(clamp(t/.2))
   taper=1-(1-tip_ratio)*smooth(clamp((t-(.78 if tip_type=='cut' else .55))/(.22 if tip_type=='cut' else .45)))
   physical_width=width*base*taper;actual_widths.append(physical_width)
   for column in range(cross):
    across=column/(cross-1)-.5
    point=root+raw[row]+lateral_axis*across*physical_width+normal_axis*fold*(1-4*across*across)*math.sin(math.pi*t)
    if row==segments:point+=tangent*across*physical_width*oblique
    positions.append(point.tolist());uvs.append([uv['uLeft']+(across+.5)*(uv['uRight']-uv['uLeft']),uv['v']])
  for row in range(segments):
   for column in range(cross-1):
    a=start+row*cross+column;b=a+1;c=a+cross;d=c+1;indices.extend([a,c,b,b,c,d])
  refs.append({'blade':blade,'vertexStart':start,'vertices':(segments+1)*cross,'track':track_id,'tipType':tip_type,'centrelineLengthMetres':float(np.linalg.norm(np.diff(raw,axis=0),axis=1).sum()),'maximumWidthMetres':max(actual_widths),'tipWidthFraction':tip_ratio,'foldMetres':fold,'tipObliqueness':oblique,'photographicUVSource':'green-blade-regions.json; original pixel channels unchanged'})
 p=np.array(positions)
 # A tilted basal cross-section has a lower edge than its centreline. Align
 # the actual lowest surface, not the nominal centreline, to the ground.
 root_alignment=-.002-float(p[:,1].min());p[:,1]+=root_alignment
 ix=np.array(indices).reshape(-1,3);face=np.cross(p[ix[:,1]]-p[ix[:,0]],p[ix[:,2]]-p[ix[:,0]])
 areas=np.linalg.norm(face,axis=1)/2;assert areas.min()>1e-12
 normals=np.zeros_like(p)
 for corner in range(3):np.add.at(normals,ix[:,corner],face)
 normals/=np.linalg.norm(normals,axis=1)[:,None]
 assert np.isfinite(normals).all() and np.all(np.einsum('ij,ij->i',face,normals[ix].mean(axis=1))>0)
 assert abs(p[:,1].min()+.002)<1e-12
 name='authored_v2_'+spec['id'];mesh=bpy.data.meshes.new(name);mesh.from_pydata([(float(v[0]),-float(v[2]),float(v[1])) for v in p],[],ix.tolist());mesh.update()
 obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj.location.x=(variant-1)*.14;mesh.materials.append(material)
 uv_layer=mesh.uv_layers.new(name='Original photographed leaf tracks — unchanged pixels')
 for loop in mesh.loops:
  uv=uvs[loop.vertex_index];uv_layer.data[loop.index].uv=(uv[0],1-uv[1])
 mesh.normals_split_custom_set_from_vertices([(float(n[0]),-float(n[2]),float(n[1])) for n in normals])
 for ref in refs:obj.vertex_groups.new(name='Editable '+ref['tipType']+' leaf '+str(ref['blade'])).add(list(range(ref['vertexStart'],ref['vertexStart']+ref['vertices'])),1,'REPLACE')
 obj['geometrySource']='Authored short lawn interpretation, not a Strahov survey';obj['photographicSource']='https://polyhaven.com/a/grass_medium_01';obj['distanceLOD']=False
 assert len(ix)==spec['highestTriangles']
 tufts.append({'id':name,'positions':p.reshape(-1).tolist(),'normals':normals.reshape(-1).tolist(),'uvs':np.array(uvs).reshape(-1).tolist(),'indices':indices,'triangles':len(ix),'targetExtentMetres':float(p[:,1].max()-p[:,1].min()),'uniformScale':1,'minimumYMetres':float(p[:,1].min()),'maximumYMetres':float(p[:,1].max()),'bladeCount':spec['blades'],'longitudinalSegmentsPerBlade':segments,'crossSectionVertices':cross,'bladeReferences':refs,'sourceGeometry':'Authored highest v2; smooth crossfold, distinct narrow cut/intact tips, unchanged photographic channels'})
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.render.threads_mode='FIXED';scene.render.threads=2
scene['productionIntegrated']=False;scene['sourcePixelsModified']=False;scene['sourceMasterPreserved']=True;scene['distanceLOD']=False
output=OUT/'grass-authored-v2-study.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output))
data={'schemaVersion':1,'asset':'grass_medium_01','profile':'authored-v2','source':'https://polyhaven.com/a/grass_medium_01','license':'CC0-1.0','sourceHeightUnscaled':False,'geometryAuthored':True,'sourceTextureResolution':8192,'providerHighestTextureResolution':8192,'normalStrength':1,'highestTriangles':sum(t['triangles'] for t in tufts),'allAuthorLOD0Triangles':24730,'tufts':tufts,'UVRegionAuditSha256':sha(regions_path),'sourceMasterPreserved':True,'sourcePixelsModified':False,'measured':False,'productionIntegrated':False,'distanceLOD':'None; separate highest-v2 visual review before derivation'}
geometry=OUT/'grass-authored-v2-study.json';geometry.write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf8')
blend_sha=sha(output);bpy.ops.wm.open_mainfile(filepath=str(output));max_vertex=0;max_uv=0;rows=[]
for tuft in tufts:
 obj=bpy.data.objects[tuft['id']];mesh=obj.data
 assert len(mesh.polygons)==tuft['triangles'] and len(obj.vertex_groups)==tuft['bladeCount']
 for i,vertex in enumerate(mesh.vertices):
  p=tuft['positions'][i*3:i*3+3];max_vertex=max(max_vertex,max(abs(vertex.co[j]-[p[0],-p[2],p[1]][j]) for j in range(3)))
 for loop in mesh.loops:
  uv=tuft['uvs'][loop.vertex_index*2:loop.vertex_index*2+2];actual=mesh.uv_layers.active.data[loop.index].uv;max_uv=max(max_uv,abs(actual[0]-uv[0]),abs(actual[1]-(1-uv[1])))
 refs=tuft['bladeReferences'];rows.append({'id':tuft['id'],'triangles':tuft['triangles'],'blades':tuft['bladeCount'],'lengthRangeMetres':[min(r['centrelineLengthMetres'] for r in refs),max(r['centrelineLengthMetres'] for r in refs)],'widthRangeMetres':[min(r['maximumWidthMetres'] for r in refs),max(r['maximumWidthMetres'] for r in refs)],'cutTips':sum(r['tipType']=='cut' for r in refs),'rootY':tuft['minimumYMetres'],'maximumY':tuft['maximumYMetres']})
assert max_vertex<1e-7 and max_uv<1e-7 and sha(output)==blend_sha
for mat in bpy.data.materials:
 for node in mat.node_tree.nodes if mat.use_nodes else []:
  if node.type=='TEX_IMAGE' and node.image:assert Path(bpy.path.abspath(node.image.filepath)).is_file()
assert all(sha(SRC/f['name'])==before[f['name']] for f in audit['files'])
assert all(sha(OUT/name)==value for name,value in v1.items())
report={'status':'passed','actualBlendReopen':True,'rendered':False,'cpuThreads':2,'sourcePixelsAndOriginalMasterUnchanged':True,'authoredV1Unchanged':True,'maxVertexErrorMetres':max_vertex,'maxUVError':max_uv,'highestTriangles':data['highestTriangles'],'blendSha256':blend_sha,'geometryJsonSha256':sha(geometry),'rows':rows,'productionIntegrated':False}
(BASE/'authored-v2-reopen-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps(report))
