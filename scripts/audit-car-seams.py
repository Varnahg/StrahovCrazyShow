import bpy,json,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1];DOCS=ROOT/'docs/vehicles'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender/vehicles/innerscene-hatchback/original-source.blend'))
body=bpy.data.objects['Watertight 14-station body shell'];body.data.calc_loop_triangles()
bvh=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[list(t.vertices) for t in body.data.loop_triangles],all_triangles=True)
out=[]
for obj in bpy.context.scene.objects:
 if obj.type!='MESH' or not any(word in obj.name.lower() for word in ['shut line','seam','roof','spoiler']):continue
 points=[obj.matrix_world@v.co for v in obj.data.vertices]
 signed=[]
 for p in points:
  q,n,index,d=bvh.find_nearest(p);signed.append((p-q).dot(n))
 unique=np.unique(np.round(np.array([list(p) for p in points]),7),axis=0)
 out.append({'name':obj.name,'vertices':len(points),'uniqueVertices':len(unique),'triangles':len(obj.data.polygons),'signedDistanceToBody':{'min':min(signed),'max':max(signed),'insideCount':sum(d<-.0001 for d in signed),'nearCoplanarCount':sum(abs(d)<.0005 for d in signed)},'sampleVertices':unique[:12].tolist(),'orderedVertices':[list(p) for p in points[:32]],'uvs':[list(v.uv) for v in obj.data.uv_layers.active.data[:32]] if obj.data.uv_layers.active else []})
(DOCS/'source-seam-audit.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps([{k:v for k,v in r.items() if k!='sampleVertices'} for r in out],indent=2),flush=True)
