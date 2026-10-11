import bpy,json
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/derivative/facade-study/b6-reference-study.blend'))
for image in bpy.data.images:
 if 'IPR2023' not in image.name:
  print('CLEAN IMAGE',image.name,image.size[:],image.filepath,Path(bpy.path.abspath(image.filepath)).exists(),flush=True)
for mat in bpy.data.materials:
 if mat.name.startswith('IPR2023'):continue
 if not mat.use_nodes:continue
 p=next((node for node in mat.node_tree.nodes if node.type=='BSDF_PRINCIPLED'),None)
 if p:print('CLEAN MATERIAL',mat.name,'color',list(p.inputs['Base Color'].default_value),'alpha',p.inputs['Alpha'].default_value,'links',[(link.from_node.name,link.to_socket.name) for link in mat.node_tree.links if link.to_node==p],flush=True)
scene=bpy.context.scene
for collection in bpy.data.collections:
 if collection.name.startswith('IPR'):collection.hide_render=True
 if collection.name.startswith('Actual clean'):collection.hide_render=False
hidden=[]
for obj in scene.objects:
 if obj.type=='MESH' and any(slot.material and slot.material.name=='B6 structural wall' for slot in obj.material_slots):obj.hide_render=True;hidden.append(obj.name)
camera=scene.camera;camera.location=(-60,55,11);camera.rotation_euler=(Vector((8,55,11))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=80;camera.data.sensor_fit='HORIZONTAL'
scene.render.resolution_x=1600;scene.render.resolution_y=600;scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.filepath=str(ROOT/'docs/reality-pack/facade-study/west-clean-facade-only-diagnostic.png')
bpy.ops.render.render(write_still=True)
print('HIDDEN POTENTIAL DUPLICATE SHELL',hidden,flush=True)
