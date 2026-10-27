"""Whole B5 source-derived FAR candidate. Blender CPU2; never saves an input."""
import os,sys,json,hashlib,math
from pathlib import Path
os.environ['OMP_NUM_THREADS']='2';sys.dont_write_bytecode=True
import bpy
import numpy as np
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'.cache/trees-r6-far-20261026';TEXTURES=ROOT/'public/textures/trees/20261026-r6-far'
NATIVE=ROOT/'assets/blender/vegetation/seasonal-r6-far/r6-b5-far-candidate.blend'
DATA=json.loads((CACHE/'prepared.json').read_text())
CELL=32;PAD=4;GRID=32;SIZE=CELL*GRID
def info(path):
 b=Path(path).read_bytes();return{'path':Path(path).relative_to(ROOT).as_posix(),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
def check_pins():
 for p in DATA['inputPins'].values():assert info(ROOT/p['path'])['sha256']==p['sha256'],p['path']
def make_mesh(name,positions,indices,uvs,normals=None,ranks=None):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(positions,[],[indices[i:i+3]for i in range(0,len(indices),3)]);mesh.update()
 layer=mesh.uv_layers.new(name='UVMap');values=np.asarray(uvs,dtype=np.float32)
 loops=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',loops);layer.data.foreach_set('uv',values[loops].reshape(-1))
 if normals is not None:mesh.normals_split_custom_set(np.asarray(normals,dtype=np.float64)[loops].tolist())
 if ranks is not None:
  attr=mesh.color_attributes.new(name='seasonDropRank',type='FLOAT_COLOR',domain='POINT');colors=np.ones((len(positions),4),dtype=np.float32);colors[:,3]=np.asarray(ranks)/65535;attr.data.foreach_set('color',colors.reshape(-1));mesh.color_attributes.active_color=attr;mesh.color_attributes.render_color_index=0
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);return obj
def image_nodes(material):
 manifest=json.loads((ROOT/'shared/data/assets/tree-materials-manifest.json').read_text());source=next(a for a in manifest['assets']if a['id']=='LeafSet024')
 nodes=material.node_tree.nodes
 for semantic in ('color','opacity','normalGL','roughness'):
  p=source['maps'][semantic];assert info(ROOT/p['runtimePath'])['sha256']==p['sha256']
  n=nodes.new('ShaderNodeTexImage');n.name=semantic;n.image=bpy.data.images.load(str(ROOT/p['runtimePath']),check_existing=True)
  if semantic!='color':n.image.colorspace_settings.name='Non-Color'
 return source
def emission_material(semantic):
 m=bpy.data.materials.new('Atlas unlit '+semantic);m.use_nodes=True;nodes=m.node_tree.nodes;links=m.node_tree.links;image_nodes(m)
 output=nodes.get('Material Output');em=nodes.new('ShaderNodeEmission');em.inputs['Strength'].default_value=1
 if semantic in ('color','roughness'):links.new(nodes[semantic].outputs['Color'],em.inputs['Color'])
 elif semantic=='opacity':em.inputs['Color'].default_value=(1,1,1,1)
 else:
  normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45;links.new(nodes['normalGL'].outputs['Color'],normal.inputs['Color'])
  separate=nodes.new('ShaderNodeSeparateXYZ');links.new(normal.outputs['Normal'],separate.inputs[0]);sign=nodes.new('ShaderNodeMath');sign.operation='LESS_THAN';links.new(separate.outputs['Z'],sign.inputs[0]);sign.inputs[1].default_value=0
  twice=nodes.new('ShaderNodeMath');twice.operation='MULTIPLY_ADD';links.new(sign.outputs[0],twice.inputs[0]);twice.inputs[1].default_value=-2;twice.inputs[2].default_value=1
  oriented=nodes.new('ShaderNodeVectorMath');oriented.operation='SCALE';links.new(normal.outputs['Normal'],oriented.inputs[0]);links.new(twice.outputs[0],oriented.inputs['Scale'])
  encode=nodes.new('ShaderNodeVectorMath');encode.operation='MULTIPLY_ADD';links.new(oriented.outputs[0],encode.inputs[0]);encode.inputs[1].default_value=(.5,.5,.5);encode.inputs[2].default_value=(.5,.5,.5);links.new(encode.outputs[0],em.inputs['Color'])
 alpha=nodes.new('ShaderNodeMath');alpha.operation='GREATER_THAN';links.new(nodes['opacity'].outputs['Color'],alpha.inputs[0]);alpha.inputs[1].default_value=.5
 transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');links.new(alpha.outputs[0],mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1]);links.new(em.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface']);return m
def camera(scene,name,position,target,scale,size=256):
 obj=bpy.data.objects.new(name,bpy.data.cameras.new(name));bpy.context.collection.objects.link(obj);obj.location=position;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler();obj.data.type='ORTHO';obj.data.ortho_scale=scale;obj.data.clip_end=5000;scene.camera=obj;scene.render.resolution_x=size;scene.render.resolution_y=size;return obj
def setup():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0;scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.render.threads_mode='FIXED';scene.render.threads=2;scene.cycles.samples=8;scene.cycles.use_denoising=False;scene.cycles.max_bounces=1;scene.cycles.transparent_max_bounces=64;scene.cycles.seed=62
 scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='8';scene.render.film_transparent=True
 scene.world=bpy.data.worlds.new('Unlit black');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=0
 scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;return scene
def atlas_geometry():
 positions=[];normals=[];uvs=[];indices=[];prototypes=[];tile=0
 for medoid in DATA['medoids']:
  cards=[]
  for frame in medoid['planes']:
   a=np.array(frame['anchor']);r=np.array(frame['right']);u=np.array(frame['up']);n=np.array(frame['normal']);lo,hi=np.array(frame['bounds']);span=hi-lo;scale=(CELL-2*PAD)/max(span);centre=(lo+hi)/2
   col,row=tile%GRID,tile//GRID;tile_centre=np.array([(col+.5)*CELL,(row+.5)*CELL]);g=frame['geometry'];p=np.asarray(g['positions'])-a
   transformed=np.column_stack([(p@r-centre[0])*scale+tile_centre[0],(p@u-centre[1])*scale+tile_centre[1],(p@n)*scale]);nn=np.asarray(g['normals']);normal=np.column_stack([nn@r,nn@u,nn@n])
   start=len(positions);positions.extend(transformed.tolist());normals.extend(normal.tolist());uvs.extend(g['uvs']);indices.extend(start+i for i in g['indices'])
   corners=np.array([[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]]);card=np.array([a+r*q[0]+u*q[1]-medoid['anchor']for q in corners]);atlas_uv=(tile_centre+(corners-centre)*scale)/SIZE
   cards.append({'positions':card.tolist(),'normals':[n.tolist()]*4,'uvs':atlas_uv.tolist(),'tile':tile,'sourcePartIndices':frame['sourcePartIndices'],'depthRange':frame['depthRange']});tile+=1
  prototypes.append({'id':medoid['id'],'sourceRank':medoid['sourceRank'],'cards':cards})
 assert tile<=GRID*GRID
 return make_mesh('Source medoids in orthographic atlas',positions,indices,uvs,normals),prototypes
def atlas_bake(scene,obj):
 maps={};camera(scene,'Atlas camera',[SIZE/2,SIZE/2,1000],[SIZE/2,SIZE/2,0],SIZE,SIZE)
 for semantic in ('color','opacity','normalGL','roughness'):
  material=emission_material(semantic);obj.data.materials.clear();obj.data.materials.append(material);scene.view_settings.view_transform='Standard'if semantic=='color'else'Raw';scene.render.film_transparent=semantic!='opacity';scene.render.image_settings.color_mode='RGB'if semantic=='opacity'else'RGBA';path=TEXTURES/(semantic+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);maps[semantic]=info(path)
 return maps
def card_material(maps):
 m=bpy.data.materials.new('R6 source-derived FAR atlas');m.use_nodes=True;nodes=m.node_tree.nodes;links=m.node_tree.links;shader=nodes.get('Principled BSDF')
 for semantic,descriptor in maps.items():
  texture=nodes.new('ShaderNodeTexImage');texture.name=semantic;texture.image=bpy.data.images.load(str(ROOT/descriptor['path']),check_existing=True);texture.interpolation='Linear';texture.extension='CLIP'
  if semantic!='color':texture.image.colorspace_settings.name='Non-Color'
  if semantic=='normalGL':
   normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=1;links.new(texture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
  elif semantic=='opacity':
   cutoff=nodes.new('ShaderNodeMath');cutoff.operation='GREATER_THAN';links.new(texture.outputs['Color'],cutoff.inputs[0]);cutoff.inputs[1].default_value=.2;links.new(cutoff.outputs[0],shader.inputs['Alpha'])
  else:links.new(texture.outputs['Color'],shader.inputs['Base Color'if semantic=='color'else'Roughness'])
 return m
def assemble(prototypes):
 positions=[];normals=[];uvs=[];indices=[];ranks=[]
 for p in DATA['placements']:
  if p['exact']:continue
  matrix=np.array(p['matrix']).reshape(3,3);anchor=np.array(p['anchor'])
  for card in prototypes[p['prototype']]['cards']:
   start=len(positions);positions.extend((np.array(card['positions'])@matrix.T+anchor).tolist());normals.extend((np.array(card['normals'])@matrix.T).tolist());uvs.extend(card['uvs']);indices.extend(start+i for i in [0,1,2,0,2,3]);ranks.extend([p['rank']]*4)
 cards=make_mesh('R6 FAR cards',positions,indices,uvs,normals,ranks)
 positions=[];normals=[];uvs=[];indices=[];ranks=[]
 for p in DATA['exact']:
  g=p['geometry'];start=len(positions);positions.extend(g['positions']);normals.extend(g['normals']);uvs.extend(g['uvs']);indices.extend(start+i for i in g['indices']);ranks.extend([p['rank']]*len(g['positions']))
 exact=make_mesh('R6 FAR exact fallback',positions,indices,uvs,normals,ranks)if positions else None
 return cards,exact
def mask_material(original,name):
 m=original.copy();m.name=name;nodes=m.node_tree.nodes;links=m.node_tree.links;shader=nodes.get('Principled BSDF');output=nodes.get('Material Output');em=nodes.new('ShaderNodeEmission');em.inputs['Color'].default_value=(1,1,1,1);em.inputs['Strength'].default_value=1
 alpha_link=next((l for l in shader.inputs['Alpha'].links),None)
 if alpha_link:
  mix=nodes.new('ShaderNodeMixShader');transparent=nodes.new('ShaderNodeBsdfTransparent');links.new(alpha_link.from_socket,mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1]);links.new(em.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface'])
 else:links.new(em.outputs[0],output.inputs['Surface'])
 return m
def season_copy(obj,amount,name):
 clone=obj.copy();clone.data=obj.data.copy();clone.name=name;bpy.context.collection.objects.link(clone)
 ranks=np.empty(len(clone.data.vertices)*4,dtype=np.float32);clone.data.color_attributes.active_color.data.foreach_get('color',ranks);ranks=np.rint(ranks.reshape(-1,4)[:,3]*65535).astype(np.int32)
 import bmesh
 bm=bmesh.new();bm.from_mesh(clone.data);bm.verts.ensure_lookup_table();remove=[v for v in bm.verts if ranks[v.index]>int(amount*65535)];bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(clone.data);bm.free();return clone
def compare(scene,reference,cards,exact,wood):
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH':obj.hide_render=True
 old_materials={obj.name:list(obj.data.materials)for obj in [reference,cards,exact,wood]if obj}
 for obj in [reference,cards,exact,wood]:
  if obj:
   original=obj.data.materials[0];obj.data.materials.clear();obj.data.materials.append(mask_material(original,obj.name+' mask'))
 scene.view_settings.view_transform='Raw';scene.render.film_transparent=False;scene.render.image_settings.color_mode='RGB';scene.cycles.samples=8
 allpoints=np.array([v.co[:]for v in reference.data.vertices]);centre=(allpoints.min(0)+allpoints.max(0))/2;focal=720/(2*math.tan(.85/2));rows=[]
 for amount in (1,.5):
  copies=[season_copy(o,amount,o.name+' season')for o in [reference,cards,exact]if o]
  for distance,degrees in [(75,0),(75,45),(75,90),(135,0),(175,0)]:
   angle=math.radians(degrees);direction=np.array([math.cos(angle),math.sin(angle),.16]);direction/=np.linalg.norm(direction);camera(scene,'FAR mask camera',centre+direction*200,centre,256*distance/focal)
   for variant,objects in [('reference',[copies[0]]),('candidate',copies[1:])]:
    for obj in objects:obj.hide_render=False
    file=CACHE/f'mask-{variant}-{distance}-{degrees}-{amount}.png';scene.render.filepath=str(file);bpy.ops.render.render(write_still=True);rows.append({**info(file),'variant':variant,'distance':distance,'angle':degrees,'amount':amount,'projection':'256px crop of720px reference focal/FOV0.85; orthographic far approximation'})
    for obj in objects:obj.hide_render=True
  for obj in copies:bpy.data.objects.remove(obj,do_unlink=True)
 for obj in [reference,cards,exact,wood]:
  if obj:
   obj.data.materials.clear()
   for m in old_materials[obj.name]:obj.data.materials.append(m)
 return rows
def main():
 check_pins();CACHE.mkdir(parents=True,exist_ok=True);TEXTURES.mkdir(parents=True,exist_ok=True);NATIVE.parent.mkdir(parents=True,exist_ok=True)
 scene=setup();atlas,prototypes=atlas_geometry();maps=atlas_bake(scene,atlas);atlas.hide_render=True;atlas.hide_set(True)
 (CACHE/'bank-blender.json').write_text(json.dumps({'version':1,'coordinateSpace':'root-local-blender-z-up','prototypes':prototypes,'maps':maps})+'\n')
 cards,exact=assemble(prototypes);cards.data.materials.append(card_material(maps))
 source=ROOT/DATA['inputPins']['native']['path']
 with bpy.data.libraries.load(str(source),link=False)as(a,b):b.objects=['R6 crown__lod1__foliage','R6 crown__lod2__wood']
 reference,wood=b.objects
 for obj in [reference,wood]:bpy.context.collection.objects.link(obj);obj.hide_set(False);obj.hide_render=True
 if exact:exact.data.materials.append(reference.data.materials[0])
 rows=compare(scene,reference,cards,exact,wood)
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH':obj.hide_render=True;obj.hide_set(True)
 for obj in [cards,exact,wood]:
  if obj:obj.hide_render=False;obj.hide_set(False)
 scene.render.film_transparent=True;scene.view_settings.view_transform='Standard'
 world=scene.world.node_tree.nodes['Background'];world.inputs['Color'].default_value=(.55,.64,.75,1);world.inputs['Strength'].default_value=.4
 light=bpy.data.objects.new('Review area',bpy.data.lights.new('Review area','AREA'));bpy.context.collection.objects.link(light);light.location=(10,-12,22);light.rotation_euler=(Vector((0,0,7))-light.location).to_track_quat('-Z','Y').to_euler();light.data.energy=2500;light.data.size=12
 camera(scene,'Whole FAR review',(26,-32,15),(0,0,7),25,768);scene.render.filepath=str(CACHE/'whole-far-beauty.png');bpy.ops.render.render(write_still=True)
 for img in bpy.data.images:
  if img.source=='FILE'and img.size[0]>0:img.pack()
 text=bpy.data.texts.new('R6 FAR provenance.json');text.write(json.dumps({'source':DATA['source'],'inputPins':DATA['inputPins'],'configuration':DATA['configuration'],'summary':DATA['summary']},indent=2))
 note=bpy.data.texts.new('README');note.write('Source-derived FAR approximation, not botanical identification. Cards and exact fallback preserve all source group ranks; photographic metric leaf size is never scaled. Shared medoids approximate local leaf arrangements within recorded residual. Original MID reference and atlas-source geometry remain editable. Native previews are not full-game GPU evidence.')
 bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE),compress=True);check_pins()
 (CACHE/'native-report.json').write_text(json.dumps({'native':info(NATIVE),'prepared':info(CACHE/'prepared.json'),'maps':maps,'bank':info(CACHE/'bank-blender.json'),'renders':rows,'beauty':info(CACHE/'whole-far-beauty.png'),'blender':bpy.app.version_string,'render':'Cycles CPU2,8samples, no baked lighting in material maps'},indent=2)+'\n');print('R6_FAR_NATIVE_COMPLETE',flush=True)
if __name__=='__main__':main()
