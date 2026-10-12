"""Repair wheel LOD topology, preserving reviewed near/master and frozen J body.
No render, no cap, no normals flip. UV remains per loop through source weld.
"""
import bpy,bmesh,json,hashlib,math,subprocess,shutil,runpy
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/blender/vehicles/innerscene-hatchback';SOURCE=OUT/'campus-hatchback-master.blend';DOCS=ROOT/'docs/vehicles'
before_sha=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
near_sha=hashlib.sha256((ROOT/'public/models/vehicles/campus-hatchback-near.glb').read_bytes()).hexdigest()
assert before_sha=='903eaf0fcfaa7a4ef1ce15a89435e3e4186db8190907e0099b5be7f52e44e83f'
assert near_sha=='7491240d9c5acc10375a394bc9b56a02f314da749dfb63e397506d90ae33c853'
reports=[]
far_repair=runpy.run_path(str(ROOT/'scripts/car-far-fold-repair.py'))
far_recipe=far_repair['load_source_recipe'](ROOT)
def topology(mesh):
 bm=bmesh.new();bm.from_mesh(mesh)
 result={'vertices':len(bm.verts),'edges':len(bm.edges),'faces':len(bm.faces),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'looseEdges':sum(len(e.link_faces)==0 for e in bm.edges),'nonManifoldEdges':sum(len(e.link_faces)>2 for e in bm.edges),'inconsistentOrientationEdges':sum(e.is_manifold and not e.is_contiguous for e in bm.edges)}
 bm.free();return result
def uv_values(mesh):return [[float(v) for v in loop.uv] for loop in mesh.uv_layers.active.data]
def digest(value):return hashlib.sha256(json.dumps(value,separators=(',',':')).encode()).hexdigest()
def extent(mesh):return [[min(v.co[i] for v in mesh.vertices) for i in range(3)],[max(v.co[i] for v in mesh.vertices) for i in range(3)]]
def decimate(obj,ratio):
 modifier=obj.modifiers.new('Isolated welded LOD','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
 bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
def component_far(obj,role,ratio):
 original_name=obj.name;original_props={k:obj[k] for k in obj.keys()}
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
 parts=list(bpy.context.selected_objects)
 for part in parts:part.data.calc_loop_triangles()
 policy={'sourceClosedComponents':len(parts),'removedComponents':0}
 if role=='rubber':
  main=max(parts,key=lambda p:len(p.data.loop_triangles));trim=[p for p in parts if p!=main];support=set()
  # Retain a complete, source-identical tread block at each radial extremum.
  for axis in [1,2]:
   for high in [False,True]:
    value=(max if high else min)((extent(p.data)[int(high)][axis] for p in trim))
    candidates=[p for p in trim if abs(extent(p.data)[int(high)][axis]-value)<1e-7]
    support.add(min(candidates,key=lambda p:abs(sum(v.co.x for v in p.data.vertices)/len(p.data.vertices))))
  keep=[main]+sorted(support,key=lambda p:p.name)
  for part in trim:
   if part not in support:bpy.data.objects.remove(part,do_unlink=True);policy['removedComponents']+=1
  decimate(main,ratio)
  policy.update({'mode':'main tyre shell decimated at original ratio; whole source blocks retained at four radial extrema; other entire tread blocks omitted','retainedWholeTreadBlocks':len(support)})
 else:
  keep=parts
  for part in keep:
   decimate(part,max(ratio,4.1/len(part.data.loop_triangles)))
  policy.update({'mode':'all black cap/lug components retained; minimum four triangles per closed component prevents duplicate two-face collapse'})
 bpy.ops.object.select_all(action='DESELECT')
 for part in keep:part.select_set(True)
 bpy.context.view_layer.objects.active=keep[0];bpy.ops.object.join();result=keep[0];result.name=original_name
 for k,v in original_props.items():result[k]=v
 return result,policy

for level in ['medium','far']:
 bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.preferences.filepaths.save_version=0
 bpy.context.scene.render.threads_mode='FIXED';bpy.context.scene.render.threads=2
 # Editable body retains J ratios except one source-restored far fender lip.
 # The final GLB retains all other archived J body/PBR/image bytes.
 far_fold_audit=None
 for body in [o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('wheel_index') is None]:
  role=body.data.materials[0].get('source_role','')
  ratios={'paint':.6,'black':.22,'interior':.35,'glass':.4,'chrome':.35,'clearlens':.25,'redlens':.4,'white':.4,'steel':.16,'rubber':.3} if level=='medium' else {'paint':.085,'black':.05,'interior':.12,'glass':.12,'chrome':.085,'clearlens':.12,'redlens':.2,'white':.2,'steel':.06,'rubber':.065}
  role='clearlens' if role=='frontlamp' else 'redlens' if role=='brakelamp' else role
  source_lip=far_repair['capture_source_lip'](body.data,far_recipe) if level=='far' and role=='paint' else None
  decimate(body,ratios.get(role,.3 if level=='medium' else .1));body.data.calc_loop_triangles();body['derived_lod']=level;body['near_master_retained']=True
  if source_lip is not None:far_fold_audit=far_repair['repair_far_fold'](body,source_lip)
 if level=='far' and far_fold_audit is None:raise RuntimeError('Far source lip was not reproduced')
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('wheel_index') is not None]
 assert len(objects)==16
 level_report={'level':level,'parts':[],'farFenderRepair':far_fold_audit};processed=[]
 for obj in sorted(objects,key=lambda o:o.name):
  mesh=obj.data;mesh.calc_loop_triangles();before=topology(mesh)
  uv_before=uv_values(mesh);normals_before=[tuple(n.vector) for n in mesh.corner_normals]
  positions=[v.co.copy() for v in mesh.vertices];bounds_before=extent(mesh);matrix_before=[list(row) for row in obj.matrix_world]
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(mesh);bm.free();mesh.update()
  uv_after=uv_values(mesh)
  assert uv_after==uv_before,(obj.name,'loop UV ordering or content changed during weld')
  assert len(mesh.loops)==len(normals_before),(obj.name,'unexpected lost loops in source weld')
  mesh.normals_split_custom_set(normals_before)
  welded=topology(mesh)
  assert welded['boundaryEdges']==0 and welded['nonManifoldEdges']==0 and welded['inconsistentOrientationEdges']==0,(obj.name,welded)
  tree=KDTree(len(positions))
  for i,p in enumerate(positions):tree.insert(p,i)
  tree.balance();weld_max_distance=max(tree.find(v.co)[2] for v in mesh.vertices)
  role=mesh.materials[0].get('source_role','')
  ratios={'black':.22,'chrome':.35,'rubber':.3,'steel':.08} if level=='medium' else {'black':.05,'chrome':.085,'rubber':.065,'steel':.025}
  ratio=ratios[role]
  component_policy=None
  if level=='far' and role in ['rubber','black']:obj,component_policy=component_far(obj,role,ratio);mesh=obj.data
  else:decimate(obj,ratio)
  obj['derived_lod']=level;obj['near_master_retained']=True
  processed.append(obj)
  mesh.calc_loop_triangles();after=topology(mesh)
  assert after['boundaryEdges']==0 and after['nonManifoldEdges']==0 and after['inconsistentOrientationEdges']==0,(obj.name,after)
  assert all(math.isfinite(v) for loop in uv_values(mesh) for v in loop)
  assert mesh.validate(verbose=True)==False,(obj.name,'post-decimation mesh required exporter repairs')
  assert [list(row) for row in obj.matrix_world]==matrix_before
  level_report['parts'].append({'node':obj.name,'role':role,'ratio':ratio,'before':before,'welded':welded,'after':after,'beforeLoopUVSha256':digest(uv_before),'afterWeldLoopUVSha256':digest(uv_after),'loopUVCount':len(uv_before),'weldMaximumNearestSourceMetres':weld_max_distance,'boundsBefore':bounds_before,'boundsAfter':extent(mesh),'trianglesAfter':len(mesh.loop_triangles),'matrixUnchanged':True,'componentPolicy':component_policy,'validateChanged':False})
 bpy.ops.object.select_all(action='DESELECT')
 for obj in processed:obj.select_set(True)
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/('campus-hatchback-'+level+'.blend')))
 output=OUT/('campus-hatchback-'+level+'-wheels.glb')
 bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_normals=True,export_animations=False)
 level_report['bytes']=output.stat().st_size;level_report['sha256']=hashlib.sha256(output.read_bytes()).hexdigest();level_report['triangles']=sum(p['trianglesAfter'] for p in level_report['parts'])
 reports.append(level_report)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==before_sha
assert hashlib.sha256((ROOT/'public/models/vehicles/campus-hatchback-near.glb').read_bytes()).hexdigest()==near_sha
result={'capturedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'blenderVersion':bpy.app.version_string,'threads':2,'sourceMasterSha256':before_sha,'nearMasterSha256':near_sha,'sourceUnchanged':True,'method':'weld source position duplicates within 1um before wheel-only DECIMATE; preserve original per-loop UV/custom normal through weld; whole cardinal tread blocks retained, prevent two-face collapse; no caps/winding flip; frozen J body retained except one closed source fender lip; no wheel/PBR/image change','levels':reports}
audit_text=json.dumps(result,indent=2)+'\n'
(OUT/'wheel-weld-audit.json').write_text(audit_text)
(DOCS/'wheel-weld-audit.json').write_text(audit_text)
node=shutil.which('node');assert node,'Node is required for exact frozen-body packing'
subprocess.run([node,str(ROOT/'scripts/build-car-wheel-pack.mjs')],cwd=str(ROOT),check=True)
print(json.dumps({'levels':[{k:v for k,v in r.items() if k!='parts'} for r in reports],'sourceUnchanged':True},indent=2),flush=True)
