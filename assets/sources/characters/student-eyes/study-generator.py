"""CC0 anatomical globe fit to original CG socket sphere measurements.
Preserves original eye UV/bitmaps and head/body bytes. Production copy of the
reviewed 2026-10-11 study generator; only source/output paths were adapted.
"""
import bpy,json,pathlib,hashlib,collections
import numpy as np
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[4];STUDY=pathlib.Path(__file__).resolve().parent;SRC=STUDY/'eyes';DOC=ROOT/'docs/characters/student-avatar-study'
head_sha=hashlib.sha256((ROOT/'client/data/skinned-character-geometry.json').read_bytes()).hexdigest();assert head_sha=='8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc'
meta=json.loads((STUDY/'source.json').read_text(encoding='utf8'));sockets=json.loads((DOC/'source-head-components.json').read_text(encoding='utf8'))['orbitalFaceSets']
for record in meta['files']:assert hashlib.sha256((STUDY/record['path']).read_bytes()).hexdigest()==record['sha256']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
image=bpy.data.images.load(str(SRC/'materials/brown_eye.png'),check_existing=True)
rgba=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(rgba);rgba=rgba.reshape((image.size[1],image.size[0],4))
def sample_alpha(uv):
 return float(rgba[min(image.size[1]-1,max(0,int(uv[1]*image.size[1]))),min(image.size[0]-1,max(0,int(uv[0]*image.size[0]))),3])
# The licensed iris atlas is not centred at quarter/three-quarter UVs. Read
# its actual black pupil masks; do not guess texture landmarks or edit pixels.
pupil_uv=[]
for high in [False,True]:
 yy,xx=np.indices(rgba.shape[:2]);mask=(np.max(rgba[:,:,:3],axis=2)<.003)&(rgba[:,:,3]>.5)&((xx>image.size[0]/2)==high)&((yy>image.size[1]/2)==high)
 py,px=np.nonzero(mask);assert len(px)>100
 pupil_uv.append(((float(px.mean())+.5)/image.size[0],(float(py.mean())+.5)/image.size[1]))
def obj_data(path):
 p=[];uv=[];faces=[]
 for line in path.read_text(encoding='utf8').splitlines():
  a=line.split()
  if not a:continue
  if a[0]=='v':p.append(Vector((float(a[1])*.1,float(a[2])*.1-1.565,float(a[3])*.1)))
  elif a[0]=='vt':uv.append(tuple(map(float,a[1:3])))
  elif a[0]=='f':faces.append([(int(v.split('/')[0])-1,int(v.split('/')[1])-1) for v in a[1:]])
 return p,uv,faces
def fit_sphere(points):
 p=np.asarray([list(v) for v in points]);solution=np.linalg.lstsq(np.column_stack([2*p,np.ones(len(p))]),np.sum(p*p,axis=1),rcond=None)[0];centre=Vector(solution[:3]);radius=float(np.sqrt(solution[3]+np.dot(solution[:3],solution[:3])));return centre,radius,float(np.sqrt(np.mean((np.linalg.norm(p-solution[:3],axis=1)-radius)**2)))
def mesh_from(name,points,uv,faces):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata([(p.x,-p.z,p.y) for p in points],[],[[v for v,_ in f] for f in faces]);mesh.update();layer=mesh.uv_layers.new(name='Original licensed MakeHuman eye UV')
 for p,f in zip(mesh.polygons,faces):
  p.use_smooth=True
  for li,(_,ti) in zip(p.loop_indices,f):layer.data[li].uv=uv[ti]
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);return obj
def export(obj):
 m=obj.data;m.calc_loop_triangles();out={'positions':[],'normals':[],'uvs':[],'indices':[]};seen={}
 for t in m.loop_triangles:
  for li in t.loops:
   loop=m.loops[li];p=m.vertices[loop.vertex_index].co;n=m.corner_normals[li].vector;uv=m.uv_layers.active.data[li].uv;key=(loop.vertex_index,round(uv.x,7),round(uv.y,7))
   if key not in seen:
    seen[key]=len(out['positions'])//3;out['positions'].extend([round(p.x/.184,8),round(p.z/.235,8),round(-p.y/.195,8)]);normal=Vector((n.x*.184,n.z*.235,-n.y*.195)).normalized();out['normals'].extend(round(v,8) for v in normal);out['uvs'].extend(round(v,8) for v in uv)
   out['indices'].append(seen[key])
 return out
data={'source':meta,'unchangedHeadBodySha256':head_sha,'socketSphereEvidence':'docs/characters/student-avatar-study/source-head-components.json','fitting':{},'levels':{},'landmarks':{},'sourceSurfaces':{}}
for level,asset in [('near','high-poly'),('medium','low-poly')]:
 points,uv,source_faces=obj_data(SRC/asset/(asset+'.obj'))
 # The high-poly source contains a separate transparent corneal shell with
 # UVs in the clear blue atlas island. Keep its editable original, but do not
 # turn that invisible shell into blue opaque geometry. Clear-coat supplies
 # a depth-safe corneal reflection in this derived single ocular surface.
 faces=[f for f in source_faces if sample_alpha(np.mean([uv[i] for _,i in f],axis=0))>.5]
 opaque_ids={i for f in faces for i,_ in f};fitted=[None]*len(points);fits=[]
 data['sourceSurfaces'][level]={'allFaces':len(source_faces),'opaqueFaces':len(faces),'excludedTransparentCornealFaces':len(source_faces)-len(faces),'method':'Original unchanged texture alpha sampled at face UV centre; no bitmap edits. Transparent source shell retained in original OBJ; derived opaque eye uses physical clear-coat.'}
 for side,group in [(-1,'3'),(1,'2')]:
  ids=[i for i,p in enumerate(points) if p.x*side>0 and i in opaque_ids]
  # Source high-poly models the iris recess as well as a globe. Fit the sclera
  # from its posterior spherical portion, excluding that front iris recess;
  # low-poly is already spherical to ~2 micrometres and uses every vertex.
  preliminary_centre,preliminary_radius,_=fit_sphere([points[i] for i in ids])
  cutoff=preliminary_centre.z+.65*preliminary_radius if level=='near' else float('inf')
  sample=[points[i] for i in ids if points[i].z<=cutoff];centre,radius,rms=fit_sphere(sample);target=Vector(sockets[group]['sphereFit']['centreGameHeadLocal']);target_radius=sockets[group]['sphereFit']['radiusMetres']-.00015
  if not .005<radius<.03:raise ValueError('Source low-poly is not an anatomical globe: '+str(radius))
  # Source vertex order/UV topology are untouched; similarity transport places
  # each globe in its measured socket instead of on the bottom skin surface.
  for i in ids:fitted[i]=target+(points[i]-centre)*(target_radius/radius)
  fits.append({'side':side,'sourceCentreHeadLocal':list(centre),'sourceRadiusMetres':radius,'sourceRmsMetres':rms,'sourceSphereSamples':len(sample),'sourcePosteriorCutoffZ':cutoff if np.isfinite(cutoff) else None,'targetCentreHeadLocal':list(target),'socketRadiusMetres':target_radius+.00015,'fittedGlobeRadiusMetres':target_radius,'sourceToSocketScale':target_radius/radius,'socketFitRmsMetres':sockets[group]['sphereFit']['rmsRadialResidualMetres']})
 # Unused transparent-shell vertices are not exported; keep placeholders valid
 # for Blender from_pydata without altering the untouched licensed OBJ master.
 for i,p in enumerate(fitted):
  if p is None:fitted[i]=points[i]
 obj=mesh_from('Fitted original CC0 '+asset+' eyes',fitted,uv,faces);obj['license']='CC0-1.0';obj['source']=str(SRC/asset/(asset+'.obj'));obj['fit']='Original CG concave spherical sockets, 0.15mm radial underlap; sclera posterior sphere fit';data['levels'][level]=export(obj);data['fitting'][level]=fits
 # Exact UV iris centres, barycentrically transferred to the fitted geometry.
 landmarks=[]
 for target_uv in pupil_uv:
  found=[]
  for f in faces:
   for j in range(1,len(f)-1):
    tri=[f[0],f[j],f[j+1]];u=np.array([uv[t] for _,t in tri]);mat=np.column_stack([u[1]-u[0],u[2]-u[0]])
    if abs(np.linalg.det(mat))<1e-12:continue
    a,b=np.linalg.solve(mat,np.array(target_uv)-u[0]);weights=[1-a-b,a,b]
    if min(weights)>=-1e-7:
     p=sum((fitted[v]*float(w) for (v,_),w in zip(tri,weights)),Vector());found.append(list(p))
  if not found:raise ValueError('Source UV iris landmark not represented: '+str(target_uv))
  p=np.mean(found,axis=0);landmarks.append({'uv':target_uv,'physicalHeadLocal':p.tolist(),'normalizedHeadLocal':(p/np.array([.184,.235,.195])).tolist(),'side':int(np.sign(p[0]))})
 data['landmarks'][level]=landmarks
 material=bpy.data.materials.new(asset+' CC0 original eye');material.use_nodes=True;nodes=material.node_tree.nodes;bsdf=nodes.get('Principled BSDF');tex=nodes.new('ShaderNodeTexImage');tex.image=image;material.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);bsdf.inputs['Roughness'].default_value=.3;bsdf.inputs['IOR'].default_value=1.376;bsdf.inputs['Coat Weight'].default_value=1;bsdf.inputs['Coat Roughness'].default_value=.08;obj.data.materials.append(material);obj.hide_render=level=='medium';obj.hide_viewport=level=='medium'
out=ROOT/'client/data/student-eyes.json';out.write_text(json.dumps(data,separators=(',',':')),encoding='utf8');bpy.ops.wm.save_as_mainfile(filepath=str(STUDY/'anatomical-eyes.blend'));assert hashlib.sha256((ROOT/'client/data/skinned-character-geometry.json').read_bytes()).hexdigest()==head_sha
(DOC/'eye-fit-audit.json').write_text(json.dumps({'dataSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'source':meta,'fitting':data['fitting'],'levels':{k:{'vertices':len(g['positions'])//3,'triangles':len(g['indices'])//3} for k,g in data['levels'].items()},'originalHeadBodyUnchangedSha256':head_sha,'sourceHeadNotCorrupt':'Male original has one neck boundary only. Original spherical orbital surfaces are concave, normal dot radial ~-0.9992, radial fit RMS0.207mm. Old front surface anchoring placed eyes on the socket floor.'},indent=2),encoding='utf8');print('EYE_FIT',json.dumps(data['fitting']),flush=True)
