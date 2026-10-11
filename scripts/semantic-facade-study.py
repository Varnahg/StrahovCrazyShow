"""Read-only IPR B6 semantic reference study; Blender --background --threads 2.
No original source, main-game model or main material is modified. Rendered
photocolour is explicitly captured lighting, never called PBR albedo.
"""
import bpy, json, hashlib, math, time, sys, os
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/reality-pack/facade-study';OUT.mkdir(parents=True,exist_ok=True)
ASSET=ROOT/'assets/derivative/facade-study';ASSET.mkdir(parents=True,exist_ok=True)
MASTER=ROOT/'assets/blender/photogrammetry/strahov-ipr2023-master.blend'
MANIFEST=ROOT/'shared/data/photogrammetry.json'
CLEAN=ROOT/'public/models/buildings/osm-way-53929071.glb'
PLAN=ROOT/'assets/blender/buildings/source-plan.json'
started=time.perf_counter()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
hashes={str(p.relative_to(ROOT)):sha(p) for p in [MASTER,MANIFEST,CLEAN,PLAN]}
m=json.loads(MANIFEST.read_text(encoding='utf8'))
plan=json.loads(PLAN.read_text(encoding='utf8'))
clean_spec=next(model for model in plan['models'] if model['identity']['sourceId']=='53929071')
origin=clean_spec['origin']
factor=m['metresPerMercatorUnit']
def node_origin(n):
 return np.array([(n['center'][0]-m['mercatorOrigin']['x'])*factor,(n['center'][1]-m['mercatorOrigin']['y'])*factor,n['center'][2]-m['worldHeightReference']])
roi={'minX':-14,'maxX':30,'minZ':-102,'maxZ':-10}
nodes=[]
for n in m['nodes']:
 if n['children']:continue
 p=node_origin(n);r=n['radius']*factor
 if p[0]+r>=roi['minX'] and p[0]-r<=roi['maxX'] and -p[1]+r>=roi['minZ'] and -p[1]-r<=roi['maxZ']:nodes.append(n)
print('SEMANTIC selected original master objects',len(nodes),flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=2;scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED';scene.render.threads=2;scene.cycles.device='CPU'
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
scene.world=bpy.data.worlds.new('neutral study light');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.6,.6,.6,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
with bpy.data.libraries.load(str(MASTER),link=False) as (source,target):
 target.objects=[f'IPR2023_L16_{n["id"]}' for n in nodes]
raw=bpy.data.collections.new('IPR original ROI · reference only');scene.collection.children.link(raw)
filtered=bpy.data.collections.new('IPR semantic facade/roof guide · NOT GAME MESH');scene.collection.children.link(filtered)
filtered_views={}
for name in ['west','east','roof']:
 collection=bpy.data.collections.new('Visible semantic surface '+name);filtered.children.link(collection);filtered_views[name]=collection
objects=[];triangles=[];records=[]
for n,obj in zip(nodes,target.objects):
 if obj is None:raise RuntimeError('Master source tile missing '+n['id'])
 for channel,key in [('geometry','geometrySha256'),('texture','textureSha256')]:
  path=ROOT/'public'/n[channel].lstrip('/')
  if sha(path)!=n[key]:raise RuntimeError('Original source SHA changed '+n['id'])
 raw.objects.link(obj);objects.append(obj)
 for mat in obj.data.materials:
  for node in mat.node_tree.nodes:
   if node.type=='TEX_IMAGE':node.image.filepath=str(ROOT/'public'/n['texture'].lstrip('/'))
 local=np.empty(len(obj.data.vertices)*3,np.float32);obj.data.vertices.foreach_get('co',local)
 world=local.reshape((-1,3)).astype(np.float64)+np.array(obj.location)
 game=world[:,[0,2,1]].copy();game[:,2]*=-1
 t=game.reshape((-1,3,3));c=t.mean(axis=1)
 normals=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);area=np.linalg.norm(normals,axis=1)/2
 normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
 valid=(c[:,0]>=roi['minX'])&(c[:,0]<=roi['maxX'])&(c[:,2]>=roi['minZ'])&(c[:,2]<=roi['maxZ'])
 triangles.append((obj,n,t,c,normals,area,valid))
 records.append({'id':n['id'],'geometrySha256':n['geometrySha256'],'textureSha256':n['textureSha256'],'sourceTriangles':n['triangles']})

centres=np.concatenate([item[3][item[6]] for item in triangles]);normal=np.concatenate([item[4][item[6]] for item in triangles]);areas=np.concatenate([item[5][item[6]] for item in triangles])
def weighted_median(values,weights):
 order=np.argsort(values);v=values[order];w=weights[order];return float(v[np.searchsorted(np.cumsum(w),w.sum()/2)])
planes={}
for name,x in [('west',0),('east',16)]:
 candidate=(np.abs(centres[:,0]-x)<4)&(centres[:,1]>2)&(centres[:,1]<26)&(centres[:,2]>-88)&(centres[:,2]<-22)&(np.abs(normal[:,0])>.85)
 if name=='west':candidate&=~((centres[:,2]>-79)&(centres[:,2]<-68))
 values=centres[candidate];weights=areas[candidate]
 if not len(values):raise RuntimeError('No source facade candidate '+name)
 histogram,edges=np.histogram(values[:,0],bins=np.arange(x-4,x+4.1,.1),weights=weights)
 peak=(edges[histogram.argmax()]+edges[histogram.argmax()+1])/2
 keep=np.abs(values[:,0]-peak)<.8
 for iteration in range(3):
  a=np.column_stack([values[keep,2]+55,np.ones(keep.sum())]);w=np.sqrt(weights[keep]);fit=np.linalg.lstsq(a*w[:,None],values[keep,0]*w,rcond=None)[0]
  residual=np.abs(values[:,0]-(fit[0]*(values[:,2]+55)+fit[1]));keep=residual<.35
 planes[name]={'xPerSouthMetre':float(fit[0]),'xAtZMinus55':float(fit[1]),'supportAreaM2':float(weights[keep].sum()),'weightedResidualM':float(np.average(residual[keep],weights=weights[keep])),'measured':False}
roof_candidates=(centres[:,0]>0)&(centres[:,0]<16)&(centres[:,2]>-90)&(centres[:,2]<-20)&(centres[:,1]>15)&(centres[:,1]<27)&(np.abs(normal[:,1])>.9)
roof=weighted_median(centres[roof_candidates,1],areas[roof_candidates])
planes['roof']={'heightWorld':roof,'heightBpv':roof+m['worldHeightReference'],'measured':False}
selection={'west':{'triangles':0,'areaM2':0},'east':{'triangles':0,'areaM2':0},'roof':{'triangles':0,'areaM2':0}}
for obj,n,t,c,normals,area,valid in triangles:
 masks={}
 for name in ['west','east']:
  p=planes[name];dist=np.abs(t[:,:,0]-(p['xPerSouthMetre']*(t[:,:,2]+55)+p['xAtZMinus55']))
  take=valid&(dist.max(axis=1)<.45)&(np.abs(normals[:,0])>.85)&(c[:,1]>1.7)&(c[:,1]<roof+.4)&(c[:,2]>-90)&(c[:,2]<-20)
  if name=='west':take&=~((c[:,2]>-78)&(c[:,2]<-69))
  selection[name]['triangles']+=int(take.sum());selection[name]['areaM2']+=float(area[take].sum());masks[name]=take
 take=valid&(np.max(np.abs(t[:,:,1]-roof),axis=1)<.4)&(np.abs(normals[:,1])>.9)&(c[:,0]>0)&(c[:,0]<16)&(c[:,2]>-90)&(c[:,2]<-20)
 selection['roof']['triangles']+=int(take.sum());selection['roof']['areaM2']+=float(area[take].sum());masks['roof']=take
 for name,mask in masks.items():
  if not mask.any():continue
  local=np.empty(len(obj.data.vertices)*3,np.float32);obj.data.vertices.foreach_get('co',local);v=local.reshape((-1,3)).reshape((-1,3,3))[mask].reshape((-1,3))
  uv=np.empty(len(obj.data.uv_layers['UVMap'].data)*2,np.float32);obj.data.uv_layers['UVMap'].data.foreach_get('uv',uv);uv=uv.reshape((-1,3,2))[mask].reshape((-1,2))
  mesh=bpy.data.meshes.new('semantic guide '+name+' '+n['id']);mesh.from_pydata(v.tolist(),[],np.arange(len(v)).reshape((-1,3)).tolist());mesh.uv_layers.new(name='UVMap');mesh.uv_layers.active.data.foreach_set('uv',uv.ravel());mesh.materials.append(obj.data.materials[0])
  copy=bpy.data.objects.new('semantic guide '+name+' '+n['id'],mesh);copy.location=obj.location;filtered_views[name].objects.link(copy)

clean=bpy.data.collections.new('Actual clean separate B6 game archive');scene.collection.children.link(clean)
before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(CLEAN));imported=[o for o in scene.objects if o not in before]
for image in bpy.data.images:
 if image.source=='FILE' and not image.name.startswith('IPR2023'):
  candidate=CLEAN.parent/'textures'/Path(image.filepath).name
  if candidate.exists():image.filepath=str(candidate);image.reload()
for obj in imported:
 for collection in list(obj.users_collection):collection.objects.unlink(obj)
 clean.objects.link(obj)
for obj in imported:
 if obj.parent is None:obj.location+=Vector((origin['x'],-origin['z'],origin['y']))
bpy.ops.object.light_add(type='AREA',location=(-30,40,60));light=bpy.context.object;light.name='neutral comparison softbox';light.data.energy=2200;light.data.size=35
light.rotation_euler=(Vector((8,55,10))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.sensor_fit='HORIZONTAL';camera.data.lens=50;camera.data.clip_start=.1;camera.data.clip_end=300
views={'west':{'eye':[-60,55,11],'target':[8,55,11],'scale':80,'resolution':[1600,600]},'east':{'eye':[60,55,11],'target':[8,55,11],'scale':80,'resolution':[1600,600]},'roof':{'eye':[8,55,90],'target':[8,55,10],'scale':28,'resolution':[560,1680]}}
renders=[]
for view,spec in views.items():
 camera.location=Vector(spec['eye']);camera.rotation_euler=(Vector(spec['target'])-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=spec['scale']
 scene.render.resolution_x,scene.render.resolution_y=spec['resolution'];scene.render.resolution_percentage=100
 scene.view_layers[0].update();matrix=camera.matrix_world.copy()
 georef={'view':view,'crs':{'horizontal':m['horizontalCRS'],'vertical':m['verticalCRS'],'heightReferenceBpv':m['worldHeightReference'],'origin':m['origin']},'cameraWorldBlender':list(camera.location),'cameraWorldGame':[camera.location.x,camera.location.z,-camera.location.y],'cameraMatrixBlender':[list(row)for row in matrix],'orthographicWidthM':spec['scale'],'resolutionPx':spec['resolution'],'metresPerPixel':spec['scale']/spec['resolution'][0],'axes':'Blender X east,Y north,Z up; game x=X,y=Z,z=-Y'}
 for variant in ['original','semantic-guide','clean']:
  raw.hide_render=variant!='original';filtered.hide_render=variant!='semantic-guide';clean.hide_render=variant!='clean'
  for name,collection in filtered_views.items():collection.hide_render=name!=view
  scene.render.filepath=str(OUT/f'{view}-{variant}.png');bpy.ops.render.render(write_still=True)
  image=OUT/f'{view}-{variant}.png';renders.append({'view':view,'variant':variant,'file':image.name,'sha256':sha(image),**georef})
  print('SEMANTIC rendered',image.name,flush=True)
 (OUT/f'{view}-georeference.json').write_text(json.dumps(georef,indent=2)+'\n',encoding='utf8')
raw.hide_render=False;filtered.hide_render=True;clean.hide_render=True
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'b6-reference-study.blend'))
after={str(p.relative_to(ROOT)):sha(p) for p in [MASTER,MANIFEST,CLEAN,PLAN]}
assert hashes==after,'Source changed during study; rerun after model export is stable'
report={'recordedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'sourceProvider':m['provider'],'capture':m['capture'],'license':m['license'],'attribution':m['attribution'],'sourceHashesBefore':hashes,'sourceHashesAfter':after,'originalsUnmodified':True,'selectedOriginalMasterObjects':len(nodes),'sourceResources':records,'roiGameMetres':roi,'fittedPlanes':planes,'semanticSelection':selection,'cleanModelSourceId':'53929071','cleanModelOrigin':origin,'cleanRoofHeightWorld':19.8,'sourceRoofMinusCleanM':roof-19.8,'renders':renders,'bakeAppliedToGame':False,'bakedLightingNote':'Original atlas photographs include captured sunlight/shadows; guide renders use original emission material. They are not PBR albedo. Clean comparison uses its actual materials under a neutral softbox.','limits':['Plane/normal filtering is geometry interpretation, not semantic ground truth.','Occluded facade holes must not be filled by copying trees/cars from the raw image.','Photocolour may still contain shadows or vegetation baked onto a facade plane.','Roof and shell alignment are estimates; no room inventory is inferred.','No scan geometry or photocolour has been added to the main game.'],'cpuThreads':2,'elapsedSeconds':time.perf_counter()-started}
(OUT/'study.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print('SEMANTIC COMPLETE',json.dumps({'planes':planes,'selection':selection,'elapsedSeconds':report['elapsedSeconds']}),flush=True)
