"""Read actual published GLB wheel geometry with CPU BVHs; never rewrite assets."""
import bpy,bmesh,json,struct,hashlib,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/vehicles';DOCS=ROOT/'docs/vehicles'
def parse(path):
 raw=path.read_bytes();j=None;binary=None;o=12
 while o<len(raw):
  length,kind=struct.unpack_from('<II',raw,o);chunk=raw[o+8:o+8+length]
  if kind==0x4e4f534a:j=json.loads(chunk)
  if kind==0x004e4942:binary=chunk
  o+=8+length
 widths={'SCALAR':1,'VEC2':2,'VEC3':3};types={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)}
 def accessor(id):
  a=j['accessors'][id];v=j['bufferViews'][a['bufferView']];fmt,size=types[a['componentType']];width=widths[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size*width)
  return [struct.unpack_from('<'+fmt*width,binary,start+i*stride) for i in range(a['count'])]
 parts={}
 for node in j['nodes']:
  if not node.get('name','').startswith('Wheel') or 'mesh' not in node:continue
  prim=j['meshes'][node['mesh']]['primitives'][0];p=[Vector((v[0],-v[2],v[1])) for v in accessor(prim['attributes']['POSITION'])];n=[Vector((v[0],-v[2],v[1])) for v in accessor(prim['attributes']['NORMAL'])];ids=[i[0] for i in accessor(prim['indices'])];triangles=[tuple(ids[i:i+3]) for i in range(0,len(ids),3)]
  assert all(math.isfinite(v) for point in p+n for v in point)
  assert all(abs(normal.length-1)<1e-4 for normal in n)
  degenerate=0;opposed=0;flagged_area=0
  for a,b,c in triangles:
   geometric=(p[b]-p[a]).cross(p[c]-p[a]);average=n[a]+n[b]+n[c]
   if geometric.length<=1e-12:degenerate+=1
   elif average.length>1e-8 and geometric.dot(average)/(geometric.length*average.length)<-.01:opposed+=1;flagged_area+=geometric.length/2
  # Reconstruct an independent BMesh only for read-only logical closure tests.
  mesh=bpy.data.meshes.new('audit '+node['name']);mesh.from_pydata(p,[],triangles);bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
  topology={'vertices':len(bm.verts),'triangles':len(triangles),'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonManifoldEdges':sum(len(e.link_faces)>2 for e in bm.edges),'inconsistentOrientationEdges':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),'degenerateTriangles':degenerate,'normalOpposedTriangles':opposed,'normalOpposedAreaM2':flagged_area};bm.free();bpy.data.meshes.remove(mesh)
  parts[node['name']]={'p':p,'triangles':triangles,'bvh':BVHTree.FromPolygons(p,triangles,all_triangles=True),'topology':topology,'pivot':node.get('translation',[0,0,0]),'uv':accessor(prim['attributes']['TEXCOORD_0'])}
 return {'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'parts':parts}
def samples(part):
 for p in part['p']:yield p
 for ids in part['triangles']:
  a,b,c=(part['p'][i] for i in ids)
  yield (a+b+c)/3
  yield (a+b)/2;yield (b+c)/2;yield (c+a)/2
def nearest_stats(a,b):
 maximum=0;squared=0;count=0;point=None
 for p in samples(a):
  hit=b['bvh'].find_nearest(p)
  if hit[0] is None:raise RuntimeError('No nearest surface')
  distance=hit[3];squared+=distance*distance;count+=1
  if distance>maximum:maximum=distance;point=list(p)
 return {'samples':count,'maxMetres':maximum,'rmsMetres':math.sqrt(squared/count),'maximumAt':point}
def wheel_bvh(model,index):
 p=[];tri=[]
 for name,part in model['parts'].items():
  if not name.startswith('Wheel'+str(index)+':'):continue
  offset=len(p);p.extend(part['p']);tri.extend(tuple(offset+i for i in t) for t in part['triangles'])
 return BVHTree.FromPolygons(p,tri,all_triangles=True)
def silhouette(reference,derived):
 a,b=wheel_bvh(reference,0),wheel_bvh(derived,0);step=.005;near_hits=0;misses=[];extras=[]
 for yi in range(-72,73):
  for zi in range(-72,73):
   y,z=yi*step,zi*step;p=Vector((-1,y,z));direction=Vector((1,0,0));ha=a.ray_cast(p,direction,2)[0] is not None;hb=b.ray_cast(p,direction,2)[0] is not None
   if ha:near_hits+=1
   if ha and not hb:misses.append([y,z])
   if hb and not ha:extras.append([y,z])
 return {'axis':'Blender local X = game local X, complete four-material wheel0','gridStepMetres':step,'referenceHitRays':near_hits,'newMissRays':len(misses),'newMissFraction':len(misses)/near_hits,'newMissInsideRadius030':sum(math.hypot(*p)<.30 for p in misses),'newHitRays':len(extras),'firstNewMisses':misses[:20]}
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.threads_mode='FIXED';bpy.context.scene.render.threads=2
reference=parse(OUT/'campus-hatchback-near.glb');reports=[]
for level in ['medium','far']:
 model=parse(OUT/('campus-hatchback-'+level+'.glb'));parts=[]
 for name,part in model['parts'].items():
  assert part['topology']['boundaryEdges']==0,(level,name,part['topology'])
  assert part['topology']['nonManifoldEdges']==0 and part['topology']['inconsistentOrientationEdges']==0
  assert part['topology']['degenerateTriangles']==0
  assert part['pivot']==reference['parts'][name]['pivot']
  assert all(math.isfinite(v) for uv in part['uv'] for v in uv)
  parts.append({'node':name,'actualExportTopology':part['topology'],'derivedToNear':nearest_stats(part,reference['parts'][name]),'nearToDerived':nearest_stats(reference['parts'][name],part),'pivotUnchanged':True})
 reports.append({'level':level,'sha256':model['sha256'],'bytes':model['bytes'],'actualTriangles':sum(p['actualExportTopology']['triangles'] for p in parts),'parts':parts,'silhouette':silhouette(reference,model)})
result={'capturedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'scope':'actual published GLB wheel parts; CPU nearest vertex/edge-midpoint/face-centroid sampling in both directions, not exact Hausdorff guarantee and not GPU imagery/FPS; body is separately unchanged from J, not claimed watertight','referenceSha256':reference['sha256'],'levels':reports}
(DOCS/'wheel-export-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps([{k:v for k,v in r.items() if k!='parts'} for r in reports],indent=2),flush=True)
