"""Create an original, lightweight, editable demo car. Blender 5.x background script."""
import bpy, math, os
from mathutils import Vector
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = {}
for name, color, metallic, roughness in [
    ('Lime enamel', (0.64,0.76,0.33,1),0.25,0.32), ('Window glass', (0.07,0.18,0.20,1),0,0.16),
    ('Rubber', (0.035,0.045,0.04,1),0,0.85), ('Wheel alloy', (0.45,0.49,0.45,1),0.7,0.3),
    ('Headlight', (1,0.94,0.7,1),0.1,0.2), ('Rear light',(0.65,0.06,0.025,1),0.1,0.25),
    ('Dark trim',(0.08,0.12,0.10,1),0.1,0.65)]:
    m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=color
    bsdf.inputs['Metallic'].default_value=metallic;bsdf.inputs['Roughness'].default_value=roughness
    if name=='Window glass':
        # Opaque tinted glazing for a compact without a modelled interior.
        bsdf.inputs['IOR'].default_value=1.52
    elif name=='Lime enamel':
        bsdf.inputs['Coat Weight'].default_value=.65
        bsdf.inputs['Coat Roughness'].default_value=.12
    materials[name]=m
def cube(name, location, scale, material, bevel=0.05):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj=bpy.context.object;obj.name=name;obj.dimensions=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(materials[material])
    if bevel:
        mod=obj.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj
cube('Car_body',(0,0,0.65),(1.7,3.45,0.64),'Lime enamel',0.13)
cube('Cabin',(0,0.13,1.13),(1.42,1.9,0.72),'Window glass',0.12)
cube('Roof',(0,0.13,1.49),(1.43,1.86,0.14),'Lime enamel',0.06)
cube('Bonnet',(0,-1.18,0.97),(1.58,0.9,0.12),'Lime enamel',0.06)
cube('Rear_hatch',(0,1.33,1.02),(1.56,0.55,0.12),'Lime enamel',0.06)
for side in [-1,1]:
    cube('Door_pillar',(side*0.724,0.15,1.17),(0.045,0.075,0.53),'Lime enamel',0.01)
    cube('Door_handle',(side*0.86,0.4,0.9),(0.025,0.2,0.055),'Dark trim',0.01)
    cube('Mirror',(side*0.91,-0.53,1.17),(0.22,0.25,0.13),'Lime enamel',0.03)
    cube('Headlight',(side*0.56,-1.73,0.78),(0.4,0.035,0.19),'Headlight',0.035)
    cube('Rear_light',(side*0.61,1.73,0.82),(0.25,0.035,0.20),'Rear light',0.025)
    for axle in [-1.05,1.05]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=0.34,depth=0.18,location=(side*0.85,axle,0.36),rotation=(0,math.pi/2,0))
        wheel=bpy.context.object;wheel.name='Wheel_'+str(side)+'_'+str(axle);wheel.data.materials.append(materials['Rubber'])
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=0.20,depth=0.185,location=(side*0.86,axle,0.36),rotation=(0,math.pi/2,0))
        bpy.context.object.name='Wheel_hub';bpy.context.object.data.materials.append(materials['Wheel alloy'])
cube('Front_bumper',(0,-1.74,0.48),(1.52,0.08,0.13),'Dark trim',0.025)
cube('Rear_bumper',(0,1.74,0.48),(1.52,0.08,0.13),'Dark trim',0.025)
cube('Front_grille',(0,-1.75,0.71),(0.57,0.035,0.16),'Dark trim',0.02)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
# One editable vehicle asset, with deterministic parts; no campus or terrain mesh.
car_root=bpy.data.objects.new('StrahovCompactAsset',None);scene.collection.objects.link(car_root)
car_root['assetId']='strahov-compact';car_root['objectClass']='vehicle';car_root['units']='metres'
for obj in [o for o in scene.objects if o.type=='MESH']:
    matrix=obj.matrix_world.copy();obj.parent=car_root;obj.matrix_world=matrix
    obj['partId']='compact:'+obj.name
os.makedirs(os.path.join(root,'assets','blender'),exist_ok=True)
os.makedirs(os.path.join(root,'public','models'),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'assets','blender','strahov-compact.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'public','models','strahov-compact.glb'),export_format='GLB',export_yup=True,export_extras=True,export_animations=False)
print('Created original editable car and game GLB.')
