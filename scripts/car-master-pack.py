"""Retain and inspect the original CC0 hatchback before authoring runtime LODs."""
import bpy, json, math, hashlib, shutil, sys, time
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'.cache/reference-vehicles/innerscene-hatchback-source.glb'
OUT=ROOT/'assets/blender/vehicles/innerscene-hatchback'
DOCS=ROOT/'docs/vehicles'
EXPECTED='107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7'
OUT.mkdir(parents=True,exist_ok=True);DOCS.mkdir(parents=True,exist_ok=True)
if not SOURCE.exists():SOURCE=OUT/'original-source.glb'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
if SOURCE.resolve()!=(OUT/'original-source.glb').resolve():shutil.copyfile(SOURCE,OUT/'original-source.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
def coords(obj):return [obj.matrix_world@Vector(v) for v in obj.bound_box]
def info(obj):
    p=coords(obj);lo=[min(v[i] for v in p) for i in range(3)];hi=[max(v[i] for v in p) for i in range(3)]
    obj.data.calc_loop_triangles()
    return {'name':obj.name,'bounds':[lo,hi],'centre':[(a+b)/2 for a,b in zip(lo,hi)],'size':[b-a for a,b in zip(lo,hi)],'triangles':len(obj.data.loop_triangles),'materials':[m.name for m in obj.data.materials]}
objects=[info(o) for o in meshes]
allp=[v for o in meshes for v in coords(o)]
report={'sourceSha256':EXPECTED,'sourceLicense':'CC0','sourceUrl':'https://www.innerscene.com/tools/library/3d-parts/blue-five-door-compact-hatchback-5b95b2a0','blenderVersion':bpy.app.version_string,'coordinateSystem':'Blender Z up, original length along X','triangles':sum(o['triangles'] for o in objects),'meshObjects':len(meshes),'bounds':[[min(v[i] for v in allp) for i in range(3)],[max(v[i] for v in allp) for i in range(3)]],'objects':objects,'materials':[]}
for material in bpy.data.materials:
    p=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if material.use_nodes else None
    report['materials'].append({'name':material.name,'baseColor':list(p.inputs['Base Color'].default_value) if p else list(material.diffuse_color),'metallic':float(p.inputs['Metallic'].default_value) if p else None,'roughness':float(p.inputs['Roughness'].default_value) if p else None,'alpha':float(p.inputs['Alpha'].default_value) if p else None,'transmission':float(p.inputs['Transmission Weight'].default_value) if p else None,'textures':[n.image.name for n in material.node_tree.nodes if n.type=='TEX_IMAGE'] if material.use_nodes else []})
(DOCS/'source-inspection.json').write_text(json.dumps(report,indent=2)+'\n')
(OUT/'source-inspection.json').write_text(json.dumps(report,indent=2)+'\n')
bpy.context.scene['source_license']='CC0; Innerscene original model'
bpy.context.scene['source_sha256']=EXPECTED
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'original-source.blend'))

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=1000;scene.render.resolution_y=650;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world=bpy.data.worlds.new('Neutral studio for real source inspection');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.19,.23,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
scene.view_settings.view_transform='AgX'
for name,location,power,size in [('key',(1,3,6),1000,5),('rim',(-3,-3,4),900,4),('front',(5,-1,2),300,3)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,.6))-obj.location).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('source inspection camera');camera=bpy.data.objects.new('source inspection camera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
camera_data.type='ORTHO';camera_data.ortho_scale=6.2
for name,position in [('front-quarter',(5,-6,3.4)),('rear-quarter',(-5,6,3)),('profile',(0,-8,2.1))]:
    camera.location=position;camera.rotation_euler=(Vector((0,0,.65))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(DOCS/('original-'+name+'.png'))
    bpy.ops.render.render(write_still=True)
print(json.dumps({'triangles':report['triangles'],'meshObjects':len(meshes),'bounds':report['bounds'],'materials':report['materials']},indent=2),flush=True)
