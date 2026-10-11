"""Adapt the downloaded CC0 Innerscene bus, preserving source geometry.
Run with Blender --background --python scripts/create-bus.py.
"""
import bpy, pathlib, math, json, hashlib, sys, struct
from mathutils import Vector, Matrix
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'scripts'))
from model_geometry_repair import remove_glb_degenerates, remove_blender_degenerate_faces
skip_preview='--skip-preview' in sys.argv
low_path=root/'public/models/transit/strahov-city-bus-low.glb'
existing_low=low_path.read_bytes() if '--keep-existing-low' in sys.argv else None
if existing_low is not None:
    previous=json.loads((root/'public/models/transit/manifest.json').read_text(encoding='utf-8'))
    assert previous['sourceSha256']==hashlib.sha256((root/'public/models/transit/city-bus-source.glb').read_bytes()).hexdigest()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/transit/city-bus-source.glb'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
# Bake imported hierarchy into mesh data before batching; glTF +Y up is exported
# again, with the bus nose facing +Z and ground at y=0.
for obj in objects:
    matrix=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=matrix
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);obj.select_set(False)
    # The source's curbside is reversed relative to its stated +Z nose after
    # import. Mirror X so doors are on the right in this right-handed world.
    obj.data.transform(Matrix.Diagonal((-1,1,1,1)));obj.data.flip_normals()
red=bpy.data.materials.new('Demo Prague red');red.diffuse_color=(.53,.035,.035,1);red.use_nodes=True
red.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=red.diffuse_color
red.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.4
white=bpy.data.materials.new('Demo cream');white.diffuse_color=(.77,.79,.76,1);white.use_nodes=True
white.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=white.diffuse_color
for obj in objects:
    if obj.name=='Bus body':obj.data.materials.clear();obj.data.materials.append(red)
    elif obj.name=='Lower livery stripe':obj.data.materials.clear();obj.data.materials.append(white)
# Door leaves are separate nodes; the renderer translates the glazed leaves at
# a stop. Underlying solid shell is deliberately left intact: no simulated cabin.
groups={};wheel_centres={}
for obj in objects:
    if obj.name.startswith('Bus wheel_'):
        centre=sum((obj.matrix_world@Vector(v) for v in obj.bound_box),Vector())/8
        group=('WheelFront' if centre.y<0 else 'WheelRear')+('Left' if centre.x>0 else 'Right')
        if obj.name.startswith('Bus wheel_tire'):wheel_centres[group]=[centre.x,centre.z,-centre.y]
    elif obj.name.startswith('Passenger door') or obj.name.startswith('Door glazing'):
        # Source has front and centre door groups at Blender y=-4.55 and -.65.
        centre=sum((obj.matrix_world@Vector(v) for v in obj.bound_box),Vector())/8
        group='DoorFront' if centre.y < -2 else 'DoorMiddle'
    else:group='Body'
    material=obj.data.materials[0].name if obj.data.materials else 'unpainted'
    groups.setdefault((group,material),[]).append(obj)
for (group,material),meshes in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
    obj=meshes[0];obj.name=group+'_'+material
    obj.data.validate();obj.data.update()
scene=bpy.context.scene;scene.unit_settings.system='METRIC'
(root/'assets/blender/transit').mkdir(parents=True,exist_ok=True)
# Keep the editable derived source free of collapsed faces, without altering
# the old modifier input used to reproduce the existing distant LOD. Runtime
# GLBs receive an index-only repair below so all valid vertex/UV/image bytes stay.
original_data=[];editable_removed=0
for obj in [o for o in scene.objects if o.type=='MESH']:
    original=obj.data;clean=original.copy();obj.data=clean
    editable_removed+=remove_blender_degenerate_faces(clean)
    original_data.append((obj,original,clean))
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/blender/transit/strahov-city-bus.blend'))
for obj,original,clean in original_data:
    obj.data=original;bpy.data.meshes.remove(clean)
bpy.ops.export_scene.gltf(filepath=str(root/'public/models/transit/strahov-city-bus.glb'),export_format='GLB',export_yup=True,export_animations=False)
high_repair=remove_glb_degenerates(root/'public/models/transit/strahov-city-bus.glb')
triangles=high_repair['afterTriangles']
audit={'source':'https://www.innerscene.com/tools/library/3d-parts/low-floor-city-bus-9e7ce899',
 'downloadUrl':'https://www.innerscene.com/api/library/low-floor-city-bus-9e7ce899/download',
 'author':'Innerscene','license':'CC0-1.0','downloadedAt':'2026-10-10',
 'sourceSha256':hashlib.sha256((root/'public/models/transit/city-bus-source.glb').read_bytes()).hexdigest(),
 'model':'/models/transit/strahov-city-bus.glb','sourceBlend':'assets/blender/transit/strahov-city-bus.blend',
 'triangles':triangles,'meshCount':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'wheelCentres':wheel_centres,
 'dimensions':[3.2,3.11,12.0],'bodyDimensions':[2.5,2.9,11.8],
 'axes':'glTF metres, Y up, nose +Z, doors -X (physical right in a right-handed scene)',
 'modifications':'Baked transforms, material batching, separate door groups, generic red and cream livery, dynamic 143/149 destination screens added by game. Derived GLBs remove only zero-area index triples; original positions/normals/UV/images remain byte-identical.',
 'limitations':'Generic nominal-scale city bus, not SOR/DPP manufacturer geometry or a verified vehicle allocation. Both game lines share it as requested. No operator logo copied; no seating simulation.'}
(root/'public/models/transit/manifest.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
# Render an actual imported asset proof, not a concept image.
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1200;scene.render.resolution_y=650;scene.render.resolution_percentage=100
scene.world.color=(.4,.4,.4)
bpy.ops.object.light_add(type='AREA',location=(3,-6,10));bpy.context.object.data.energy=1800;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=8
bpy.ops.object.camera_add(location=(14,-17,8));cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,1.4))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=16
scene.camera=cam;scene.render.filepath=str(root/'docs/transit/bus-preview.png')
if not skip_preview:bpy.ops.render.render(write_still=True)
if existing_low is None:
    for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Distant bus LOD','DECIMATE');mod.ratio=.35
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for group in wheel_centres:
        meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(group+'_')]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:obj.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();obj=meshes[0];obj.name=group+'_LOD'
        obj.data.materials.clear();obj.data.materials.append(bpy.data.materials.get('rubber'))
        for p in obj.data.polygons:p.material_index=0
    bpy.ops.export_scene.gltf(filepath=str(low_path),export_format='GLB',export_yup=True,export_animations=False)
else:
    # A topology repair need not rerun the approximation. This preserves every
    # already-reviewed valid low-LOD triangle, UV and material byte exactly.
    low_path.write_bytes(existing_low)
low_repair=remove_glb_degenerates(low_path)
audit['lowModel']='/models/transit/strahov-city-bus-low.glb'
audit['lowTriangles']=low_repair['afterTriangles']
audit['geometryRepair']={'high':high_repair,'low':low_repair,'editableRemovedFaces':editable_removed,'sourceFileUnchanged':True}
low_blob=low_path.read_bytes();low_json_length=struct.unpack_from('<I',low_blob,12)[0]
audit['lowMeshCount']=len(json.loads(low_blob[20:20+low_json_length])['meshes'])
(root/'public/models/transit/manifest.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
# Mirror only the FINAL audit, including wheelCentres and the completed low LOD.
source_manifest=root/'shared/data/assets/transit-manifest.json'
source_manifest.parent.mkdir(parents=True,exist_ok=True)
source_manifest.write_bytes((root/'public/models/transit/manifest.json').read_bytes())
print(json.dumps(audit))
