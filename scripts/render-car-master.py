import bpy,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];DOCS=ROOT/'docs/vehicles'
name=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'near'
filename='campus-hatchback-master.blend' if name=='near' else 'campus-hatchback-'+name+'.blend'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender/vehicles/innerscene-hatchback'/filename))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=1000;scene.render.resolution_y=650;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('Neutral car validation studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.19,.23,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
for lightname,location,power,size in [('key',(1,-3,6),1000,5),('rim',(-3,3,4),900,4),('front',(5,-1,2),300,3)]:
    light=bpy.data.lights.new(lightname,'AREA');light.energy=power;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new(lightname,light);scene.collection.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((0,0,.6))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('real model inspection');camera=bpy.data.objects.new('real model inspection',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=5.2
for view,position in [('front-quarter',(5,-6,3.2)),('rear-quarter',(-5,6,3)),('profile',(8,0,1.8))]:
    camera.location=position;camera.rotation_euler=(Vector((0,0,.65))-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(DOCS/(name+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
print('Rendered actual',name,'mesh; CPU2 threads; no GPU or FPS claim.',flush=True)
