"""Cache-only per-leaf projection. Original photographs and highest stay intact."""
import bpy,json,math,hashlib,time
from pathlib import Path
from mathutils import Vector
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/".cache/photographic-leaf-export";OUT.mkdir(parents=True,exist_ok=True)
BASE=ROOT/'assets/sources/vegetation/grass_medium_01'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
master=BASE/'derived/grass-authored-v2-study.blend';before=sha(master)
pack_path=BASE/'derived/grass-uv-aware-render-pack.json';pack=json.loads(pack_path.read_text(encoding='utf8'));g=pack['levels']['highest']
assert before==pack['sourceBlendSha256']=='8e77733387a9b991ea779f8c0b6f658cb0fe04cb2bffe2fbe8f1fc9613c8bf61'
source_files=[p for p in BASE.rglob('*') if p.is_file()];source_hashes={str(p.relative_to(ROOT)):sha(p) for p in source_files}
bpy.ops.wm.open_mainfile(filepath=str(master))
for obj in bpy.context.scene.objects:obj.hide_render=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=False;scene.cycles.use_adaptive_sampling=False;scene.cycles.max_bounces=1;scene.cycles.transparent_max_bounces=32
scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=1024;scene.render.resolution_y=512;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8'
scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1
if not scene.world:scene.world=bpy.data.worlds.new('unlit source projection')
scene.world.color=(0,0,0)
material=bpy.data.materials.new('original photographic leaf data transfer only');material.use_nodes=True;nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
output=nodes.new('ShaderNodeOutputMaterial');mix=nodes.new('ShaderNodeMixShader');transparent=nodes.new('ShaderNodeBsdfTransparent');emission=nodes.new('ShaderNodeEmission');links.new(mix.outputs[0],output.inputs['Surface']);links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);emission.inputs['Strength'].default_value=1
def image_node(name,space):
 node=nodes.new('ShaderNodeTexImage');node.image=bpy.data.images.load(str(BASE/'source-highest/textures'/name),check_existing=True);node.image.colorspace_settings.name=space;node.interpolation='Linear';return node
color=image_node('grass_medium_01_diff_8k.jpg','sRGB');alpha=image_node('grass_medium_01_alpha_8k.png','Non-Color');normal=image_node('grass_medium_01_nor_gl_8k.exr','Non-Color');rough=image_node('grass_medium_01_rough_8k.exr','Non-Color')
cut=nodes.new('ShaderNodeMath');cut.operation='GREATER_THAN';cut.inputs[1].default_value=.45;links.new(alpha.outputs['Color'],cut.inputs[0]);links.new(cut.outputs[0],mix.inputs[0])
normal_map=nodes.new('ShaderNodeNormalMap');normal_map.space='TANGENT';normal_map.uv_map='Original photographed UV';normal_map.inputs['Strength'].default_value=1;links.new(normal.outputs['Color'],normal_map.inputs['Color'])
sep=nodes.new('ShaderNodeSeparateXYZ');links.new(normal_map.outputs['Normal'],sep.inputs[0]);positive=nodes.new('ShaderNodeMath');positive.operation='GREATER_THAN';positive.inputs[1].default_value=0;links.new(sep.outputs['Z'],positive.inputs[0]);sign=nodes.new('ShaderNodeMath');sign.operation='MULTIPLY_ADD';sign.inputs[1].default_value=2;sign.inputs[2].default_value=-1;links.new(positive.outputs[0],sign.inputs[0]);faced=nodes.new('ShaderNodeVectorMath');faced.operation='SCALE';links.new(normal_map.outputs['Normal'],faced.inputs[0]);links.new(sign.outputs[0],faced.inputs['Scale']);encoded=nodes.new('ShaderNodeVectorMath');encoded.operation='SCALE';encoded.inputs['Scale'].default_value=.5;links.new(faced.outputs[0],encoded.inputs[0]);bias=nodes.new('ShaderNodeVectorMath');bias.operation='ADD';bias.inputs[1].default_value=(.5,.5,.5);links.new(encoded.outputs[0],bias.inputs[0])
allp=np.array(g['positions']).reshape(-1,3);alln=np.array(g['normals']).reshape(-1,3);alluv=np.array(g['uvs']).reshape(-1,2);leaves=[]
for number,leaf in enumerate(g['leaves']):
 start=leaf['vertexStart'];count=leaf['vertexCount'];p=allp[start:start+count];normals=alln[start:start+count];uvs=alluv[start:start+count]
 assert count==85
 root=p[2].copy();tip=p[82].copy();v=tip-root;tip_length=np.linalg.norm(v);v/=tip_length
 width_directions=np.array([p[row*5+4]-p[row*5] for row in range(17)]);u=width_directions.sum(axis=0);u-=v*np.dot(u,v);u/=np.linalg.norm(u);n=np.cross(u,v);relative=p-root
 if np.dot(n,normals.mean(axis=0))<0:u=-u;n=-n
 projected=np.stack((relative@u,relative@v,relative@n),axis=1);umin,vmin=projected[:,:2].min(axis=0);umax,vmax=projected[:,:2].max(axis=0)
 scale=.84/max((umax-umin)/.5,vmax-vmin);width=.5/scale;height=1/scale;uc=(umin+umax)/2;vc=(vmin+vmax)/2
 centre_indices=np.array([row*5+2 for row in range(1,16)]);mid_index=int(centre_indices[np.argmax(np.abs(projected[centre_indices,2]))]);mid=p[mid_index];mid_v=float(np.dot(mid-root,v));mid_h=float(np.dot(mid-root,n));mid_v=max(.05*tip_length,min(.95*tip_length,mid_v))
 def curve(y):return mid_h*y/mid_v if y<=mid_v else mid_h*(tip_length-y)/(tip_length-mid_v)
 flat_error=np.abs(projected[:,2]);bent_error=np.abs(projected[:,2]-np.array([curve(y) for y in projected[:,1]]))
 column=number%16;row=number//16;cx=-4+(column+.5)*.5;cy=2-(row+.5)
 vertices=np.stack(((projected[:,0]-uc)*scale+cx,(projected[:,1]-vc)*scale+cy,projected[:,2]*scale),axis=1)
 transformed_normals=np.stack((normals@u,normals@v,normals@n),axis=1)
 faces=[]
 for ri in range(16):
  for ci in range(4):a=ri*5+ci;b=a+1;c=a+5;d=c+1;faces.extend([(a,c,b),(b,c,d)])
 mesh=bpy.data.meshes.new('leaf source '+str(number));mesh.from_pydata(vertices.tolist(),[],faces);mesh.update();layer=mesh.uv_layers.new(name='Original photographed UV')
 for loop in mesh.loops:uv=uvs[loop.vertex_index];layer.data[loop.index].uv=(float(uv[0]),float(1-uv[1]))
 mesh.normals_split_custom_set_from_vertices(transformed_normals.tolist());mesh.materials.append(material);obj=bpy.data.objects.new('isolated original leaf '+str(number),mesh);scene.collection.objects.link(obj)
 leaves.append({'sourceLeafId':number,'sourceTuft':leaf['sourceTuft'],'sourceBlade':leaf['sourceBlade'],'root':root.tolist(),'tip':tip.tolist(),'right':u.tolist(),'up':v.tolist(),'normal':n.tolist(),'width':width,'height':height,'centreUVMetres':[uc,vc],'midV':mid_v,'midHeight':mid_h,'tipV':float(tip_length),'atlasCell':[column,row],'atlasUV':[column/16,row/4,(column+1)/16,(row+1)/4],'sourceTriangles':128,'flatMaximumDistanceMetres':float(flat_error.max()),'flatRMSDistanceMetres':float(np.sqrt(np.mean(flat_error**2))),'bentMaximumDistanceMetres':float(bent_error.max()),'bentRMSDistanceMetres':float(np.sqrt(np.mean(bent_error**2))),'transverseMethod':'Actual summed cross-section width vectors, orthogonalized against the fixed root-tip chord; NOT centreline-PCA','hingeSourceRow':mid_index//5,'planeNormalAlignmentWithMeanSourceNormal':float(np.dot(n,normals.mean(axis=0)/np.linalg.norm(normals.mean(axis=0)))),'rootCentreErrorMetres':0,'tipCentreErrorMetres':0})
camera_data=bpy.data.cameras.new('uniform-scale per-leaf orthographic atlas');camera_data.type='ORTHO';camera_data.ortho_scale=8;camera_data.clip_start=.1;camera_data.clip_end=20;camera=bpy.data.objects.new(camera_data.name,camera_data);scene.collection.objects.link(camera);camera.location=(0,0,5);camera.rotation_euler=(0,0,0);scene.camera=camera
frame=camera_data.view_frame(scene=scene);assert abs(max(p.x for p in frame)-4)<1e-6 and abs(max(p.y for p in frame)-2)<1e-6,'Unexpected Blender ortho frame/aspect'
passes={};started=time.time()
for channel,socket,transform in [('albedo',color.outputs['Color'],'Standard'),('normal',bias.outputs['Vector'],'Raw'),('roughness',rough.outputs['Color'],'Raw')]:
 links.new(socket,emission.inputs['Color']);scene.view_settings.view_transform=transform;filename='leaves-'+channel+'-raw.png';scene.render.filepath=str(OUT/filename);print('LEAF_BAKE_START',channel,'CPU 4 threads',flush=True);bpy.ops.render.render(write_still=True);passes[channel]={'file':filename,'sha256':sha(OUT/filename),'colorTransform':transform};print('LEAF_BAKE_DONE',channel,time.time()-started,flush=True)
assert source_hashes=={str(p.relative_to(ROOT)):sha(p) for p in source_files}
report={'status':'cache-prototype-awaiting-visual-review','timestampUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'masterSha256':before,'sourceGeometrySha256':sha(pack_path),'sourceFilesBeforeAndAfter':source_hashes,'sourceFilesUnchanged':True,'sourceURL':'https://polyhaven.com/a/grass_medium_01','license':'CC0-1.0','cpuThreads':4,'device':'CPU','samples':8,'seconds':time.time()-started,'atlasResolution':[1024,512],'passes':passes,'leaves':leaves,'triangles':{'flat':84,'bent':168,'highest':5376},'method':'Each exact original85vertex leaf is orthographically projected alone into a uniformly scaled atlas cell. The plane contains actual root/tip centres; transverse orientation follows actual summed cross-section width vectors; root-tip chord stays fixed. The bent hinge uses the original centreline row with maximum signed depth magnitude. No neighbouring leaves or lighting are baked. Original photographic UV/material channels preserved; data-transfer emission is offline only.','limits':['2tri flattens within each individual leaf plane. 4tri adds one source-derived bend; source fold/twist require normal transfer.','Root/tip centres exact, other vertices have explicitly measured deviations.','No runtime integration, FPS or final appearance acceptance.']}
(OUT/'leaf-bake-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print('LEAF_BAKE_COMPLETE',json.dumps({'seconds':report['seconds'],'flatMax':max(l['flatMaximumDistanceMetres'] for l in leaves),'bentMax':max(l['bentMaximumDistanceMetres'] for l in leaves)}),flush=True)


