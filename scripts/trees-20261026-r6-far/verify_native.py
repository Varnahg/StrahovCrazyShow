"""Reopen the actual saved candidate; compare native triangle corners to GLB."""
import sys,json,struct,hashlib
from pathlib import Path
sys.dont_write_bytecode=True
import bpy
import numpy as np
ROOT=Path(__file__).resolve().parents[2];CACHE=ROOT/'.cache/trees-r6-far-20261026';OUT=ROOT/'public/models/vegetation/seasonal-r6-far'
def glb(path):
 raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+size]);binary=raw[28+size:]
 def accessor(index):
  a=j['accessors'][index];v=j['bufferViews'][a['bufferView']];components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]
  return np.frombuffer(binary,dtype=dtype,count=a['count']*components,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],components)
 return j,accessor
def geometry(path,name):
 j,a=glb(path);n=next(n for n in j['nodes']if n['name']==name);p=j['meshes'][n['mesh']]['primitives'][0];indices=a(p['indices']).reshape(-1);return{k:a(i)[indices]for k,i in p['attributes'].items()}
def main():
 report=json.loads((CACHE/'native-report.json').read_text());native=ROOT/report['native']['path'];assert hashlib.sha256(native.read_bytes()).hexdigest()==report['native']['sha256'];bpy.ops.wm.open_mainfile(filepath=str(native));rows=[]
 mapping={'own-broadleaf__lod2__wood':'R6 crown__lod2__wood','own-broadleaf__lod2__foliage':'R6 FAR exact fallback','own-broadleaf__lod2__cards':'R6 FAR cards'}
 allranks=set()
 for exported,name in mapping.items():
  g=geometry(OUT/'own-broadleaf-far-comparison.glb',exported);obj=bpy.data.objects[name];mesh=obj.data;assert obj.parent is None and np.array_equal(np.asarray(obj.matrix_world),np.eye(4));mesh.calc_loop_triangles()
  loops=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',loops);corners=np.empty(len(mesh.loop_triangles)*3,dtype=np.int32);mesh.loop_triangles.foreach_get('loops',corners);indices=loops[corners]
  positions=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',positions);p=positions.reshape(-1,3)[indices][:,[0,2,1]].copy();p[:,2]*=-1
  normal=np.empty(len(mesh.loops)*3,dtype=np.float32);mesh.corner_normals.foreach_get('vector',normal);n=normal.reshape(-1,3)[corners][:,[0,2,1]].copy();n[:,2]*=-1
  uv=np.empty(len(mesh.loops)*2,dtype=np.float32);mesh.uv_layers.active.data.foreach_get('uv',uv);u=uv.reshape(-1,2)[corners].copy();u[:,1]=1-u[:,1]
  errors={key:float(np.max(np.abs(actual-g[key])))for key,actual in [('POSITION',p),('NORMAL',n),('TEXCOORD_0',u)]}
  assert errors['POSITION']<2e-6 and errors['TEXCOORD_0']<2e-7 and errors['NORMAL']<.002,(name,errors)
  count=0
  if 'COLOR_0'in g:
   colors=np.empty(len(mesh.vertices)*4,dtype=np.float32);mesh.color_attributes.active_color.data.foreach_get('color',colors);ranks=np.rint(colors.reshape(-1,4)[indices,3]*65535).astype(np.uint16);assert np.array_equal(ranks,g['COLOR_0'][:,3]);allranks.update(int(r)for r in ranks);count=len(set(ranks.tolist()));assert np.all(g['COLOR_0'][:,:3]==65535)
  rows.append({'native':name,'glb':exported,'triangles':len(indices)//3,'rankGroups':count,'maximumCornerErrors':errors,'identityTransform':True})
 source=geometry(ROOT/'public/models/vegetation/seasonal-r6-streamed/own-broadleaf-lod2.glb','own-broadleaf__lod2__wood');copied=geometry(OUT/'own-broadleaf-lod2-exact.glb','own-broadleaf__lod2__wood');assert all(np.array_equal(v,copied[k])for k,v in source.items())
 manifest=json.loads((OUT/'pilot-manifest.json').read_text());expected=set(p['rank']for p in json.loads((CACHE/'prepared.json').read_text())['placements']);assert allranks==expected and len(allranks)==16019
 # Exact fallback is independently compared against the original full MID
 # expanded corners, grouped by rank; atlas/card generation does not enter it.
 source=geometry(ROOT/'public/models/vegetation/seasonal-r6-streamed/own-broadleaf-lod1.glb','own-broadleaf__lod1__foliage');exact=geometry(OUT/'own-broadleaf-lod2-exact.glb','own-broadleaf__lod2__foliage');mask=np.isin(source['COLOR_0'][:,3],manifest['exactFallbackRanks'])
 for key in source:assert np.array_equal(source[key][mask],exact[key]),'Fallback differs from full MID '+key
 images=[{'name':i.name,'bytes':i.packed_file.size,'sha256':hashlib.sha256(bytes(i.packed_file.data)).hexdigest()}for i in bpy.data.images if i.source=='FILE'and i.users>0 and i.packed_file]
 expectedmaps={d['sha256']for d in report['maps'].values()};assert expectedmaps.issubset({i['sha256']for i in images})
 result={'native':report['native'],'meshes':rows,'rankGroups':len(allranks),'fullMidExactFallbackBitwise':True,'sourceWoodBitwise':True,'packedImages':images,'sameRootAndCollider':True,'limitations':['Card custom normals are encoded by Blender; reported tolerance is not bitwise equality.','Native proof is not full-game WebGPU performance or mip proof.']}
 (CACHE/'native-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
