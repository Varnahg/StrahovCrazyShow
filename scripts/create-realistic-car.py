"""Original CC0 surface geometry -> normalized, material-batched campus car.

The immutable original is kept separately. Mapping is explicit and preserves
round wheel/arch neighbourhoods while fitting the existing game collider.
"""
import bpy, bmesh, json, math, hashlib, sys, struct, runpy, subprocess, shutil
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'assets/blender/vehicles/innerscene-hatchback/original-source.blend'
OUT=SOURCE.parent;PUBLIC=ROOT/'public/models/vehicles';DOCS=ROOT/'docs/vehicles'
PUBLIC.mkdir(parents=True,exist_ok=True);DOCS.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
source_audit=OUT/'source-inspection.json' if (OUT/'source-inspection.json').exists() else DOCS/'source-inspection.json'
source_records={r['name']:r for r in json.loads(source_audit.read_text())['objects']}
repairs=[]
shell=bpy.data.objects['Watertight 14-station body shell'];shell.data.calc_loop_triangles()
skin=BVHTree.FromPolygons([shell.matrix_world@v.co for v in shell.data.vertices],[list(t.vertices) for t in shell.data.loop_triangles],all_triangles=True)
def boundaries(obj):
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);count=sum(e.is_boundary for e in bm.edges);bm.free();return count
assert boundaries(bpy.data.objects['Crowned roof pressing'])==0,'Removing separate trims must not open the actual roof'
for name in ['Flush roof side flange','Flush roof side flange.001','Roof spoiler lip']:
    obj=bpy.data.objects[name];repairs.append({'object':name,'repair':'remove independent projecting cosmetic add-on; closed crowned roof remains intact','removedTriangles':len(obj.data.polygons),'sourceAddonBoundaryEdges':boundaries(obj)});bpy.data.objects.remove(obj,do_unlink=True)
for obj in [o for o in scene.objects if o.type=='MESH' and any(word in o.name for word in ['shut line','Fuel filler seam','Sculpted rocker panel seam'])]:
    name=obj.name;material=obj.data.materials[0]
    points=np.array([list(obj.matrix_world@v.co) for v in obj.data.vertices])
    _,indices=np.unique(np.round(points,6),axis=0,return_index=True)
    ordered=points[np.sort(indices)]
    assert len(ordered)%8==0,(name,len(ordered))
    centre=ordered.reshape(-1,8,3).mean(axis=1)
    spacing=np.median(np.linalg.norm(np.diff(centre,axis=0),axis=1));closed=np.linalg.norm(centre[0]-centre[-1])<spacing*1.5
    path=[];moved=0;maxmove=0
    pairs=list(zip(centre[:-1],centre[1:]))+([(centre[-1],centre[0])] if closed else [])
    for start,end in pairs:
        steps=max(1,math.ceil(np.linalg.norm(end-start)/.025))
        for fraction in np.arange(steps)/steps:
            point=Vector(start+(end-start)*fraction);q,n,index,distance=skin.find_nearest(point)
            if distance<.12:
                fixed=q+n*.0035;maxmove=max(maxmove,(fixed-point).length);moved+=1;point=fixed
            path.append(point)
    if not closed:path.append(Vector(centre[-1]))
    curve=bpy.data.curves.new(name+' continuous source skin seam','CURVE');curve.dimensions='3D';curve.bevel_depth=.0022;curve.bevel_resolution=1;curve.use_fill_caps=True
    spline=curve.splines.new('POLY');spline.points.add(len(path)-1);spline.use_cyclic_u=bool(closed)
    for point,co in zip(spline.points,path):point.co=(*co,1)
    fixed=bpy.data.objects.new(name+' repaired',curve);scene.collection.objects.link(fixed);curve.materials.append(material);fixed['source_original_name']=name
    bpy.data.objects.remove(obj,do_unlink=True);bpy.ops.object.select_all(action='DESELECT');fixed.select_set(True);bpy.context.view_layer.objects.active=fixed;bpy.ops.object.convert(target='MESH')
    repairs.append({'object':name,'repair':'rebuild source ring centreline on actual body skin; preserve upper sections beyond shell','sourceRings':len(centre),'pathSamples':len(path),'projectedSamples':moved,'maximumProjectionMetres':maxmove,'radiusMetres':.0022,'centreOffsetMetres':.0035})
for obj in [o for o in scene.objects if o.type=='MESH']:
    if 'source_original_name' not in obj:obj['source_original_name']=obj.name
    if len(set(p.material_index for p in obj.data.polygons))>1:
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
meshes=[o for o in scene.objects if o.type=='MESH']
radius=.34/.3161422610282898
a,b=-1.23224,1.35040
source_x=np.array([-2.11868,a-.45,a+.45,b-.45,b+.45,2.14618])
target_x=np.array([-1.78,-1.05-.45*radius,-1.05+.45*radius,1.05-.45*radius,1.05+.45*radius,1.78])
source_y=np.array([0,.8875,1.05846]);target_y=np.array([0,.8875*.85/.775,1.02])
source_z=np.array([0,.75,1.5851422548294067]);target_z=np.array([.02,.75*radius+.02,1.56])
def interp(value,source,target):
    segment=np.clip(np.searchsorted(source,value,side='right')-1,0,len(source)-2)
    slope=(target[segment+1]-target[segment])/(source[segment+1]-source[segment])
    return target[segment]+(value-source[segment])*slope,slope
def normalized(points):
    x,sx=interp(points[:,0],source_x,target_x)
    y,sy=interp(np.abs(points[:,1]),source_y,target_y);y*=np.sign(points[:,1])
    z,sz=interp(points[:,2],source_z,target_z)
    return np.column_stack([-y,x,z]),np.column_stack([sx,sy,sz])
def wheel_index(obj):
    name=obj.name
    rotating=name.startswith('107 reused ') or name.startswith('Siped tread blocks') or name.startswith('Ventilated brake rotor') or name.startswith('Brake rotor hat') or name.startswith('Rotor drill recess')
    if not rotating:return None
    p=sum((obj.matrix_world@Vector(v) for v in obj.bound_box),Vector())/8
    assert abs(p.y)>.65 and min(abs(p.x-a),abs(p.x-b))<.4, name
    # Positive Blender Y maps to game -X; negative source X is game front +Z.
    return (0 if p.x<0 else 2)+(0 if p.y>0 else 1)
geometry_audit=[]
groups={}
for obj in meshes:
    mesh=obj.data.copy();obj.data=mesh
    positions=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',positions)
    matrix=np.array(obj.matrix_world,dtype=np.float64)
    world=positions.reshape(-1,3).astype(float)@matrix[:3,:3].T+matrix[:3,3]
    corner=np.empty(len(mesh.loops)*3,dtype=np.float32);mesh.corner_normals.foreach_get('vector',corner)
    vertex_indices=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',vertex_indices)
    original_normals=corner.reshape(-1,3).astype(float)@np.linalg.inv(matrix[:3,:3])
    points,slopes=normalized(world)
    s=slopes[vertex_indices];new_normals=np.column_stack([-original_normals[:,1]/s[:,1],original_normals[:,0]/s[:,0],original_normals[:,2]/s[:,2]])
    lengths=np.linalg.norm(new_normals,axis=1);new_normals/=np.maximum(lengths[:,None],1e-20)
    obj.parent=None;obj.matrix_world.identity()
    mesh.vertices.foreach_set('co',points.astype(np.float32).reshape(-1));mesh.update()
    mesh.normals_split_custom_set(new_normals.tolist())
    mesh.calc_loop_triangles()
    triangles=np.array([list(t.vertices) for t in mesh.loop_triangles],dtype=np.int32)
    area=np.linalg.norm(np.cross(points[triangles[:,1]]-points[triangles[:,0]],points[triangles[:,2]]-points[triangles[:,0]]),axis=1)/2
    assert np.isfinite(points).all() and np.isfinite(new_normals).all()
    geometry_audit.append({'object':obj.name,'triangles':len(triangles),'zeroAreaTriangles':int(np.sum(area<1e-12)),'minimumNonzeroArea':float(np.min(area[area>1e-12])) if np.any(area>1e-12) else None})
    wheel=None
    # Classification uses the original source object centres, retained in the
    # importer audit; transforming mesh vertices must not move its wheel role.
    source_record=source_records[obj['source_original_name']]
    if obj.name.startswith(('107 reused ','Siped tread blocks','Ventilated brake rotor','Brake rotor hat','Rotor drill recess')):
        p=source_record['centre'];wheel=(0 if p[0]<0 else 2)+(0 if p[1]>0 else 1)
    obj['source_object']=obj['source_original_name']
    used=set(p.material_index for p in mesh.polygons);assert len(used)==1,obj.name
    material=mesh.materials[next(iter(used))]
    original_name=obj['source_original_name']
    special_role='frontlamp' if original_name.startswith(('Flush swept transparent headlamp lens','Recessed projector optical glass')) else 'brakelamp' if original_name=='Rear glazing red stop lens' else None
    if special_role:
        special=bpy.data.materials.get(special_role)
        if special is None:special=material.copy();special.name=special_role
        material=special
    mesh.materials.clear();mesh.materials.append(material)
    for polygon in mesh.polygons:polygon.material_index=0
    role=material.name.split('.')[0]
    groups.setdefault((wheel,role),[]).append(obj)

# Keep source texture microstructure. Paint is separated into an unbiased
# neutral variation map plus its colour factor, enabling honest colour variants.
material_audit=[]
for material in bpy.data.materials:
    if not material.use_nodes:continue
    p=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    role=material.name.split('.')[0]
    texture_report=[]
    for texture in [n for n in material.node_tree.nodes if n.type=='TEX_IMAGE']:
        rgba=np.array(texture.image.pixels[:]).reshape(-1,4)
        texture_report.append({'originalName':texture.image.name,'size':list(texture.image.size),'channelRange':np.ptp(rgba,axis=0).tolist(),'modified':role=='paint'})
        if role=='paint':
            luminance=rgba[:,:3]@np.array([.2126,.7152,.0722]);grey=luminance/max(float(luminance.max()),1e-12)
            neutral=np.column_stack([grey,grey,grey,rgba[:,3]])
            colour=rgba[:,:3].mean(axis=0)/max(float(grey.mean()),1e-12)
            p.inputs['Base Color'].default_value=tuple(np.r_[colour,1.])
            image=bpy.data.images.new('CC0 paint neutral microvariation',width=texture.image.size[0],height=texture.image.size[1],alpha=True)
            image.colorspace_settings.name='sRGB';image.pixels.foreach_set(neutral.astype(np.float32).reshape(-1));image.pack();texture.image=image
            multiply=material.node_tree.nodes.new('ShaderNodeMixRGB');multiply.name='Campus paint colour factor';multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1.;multiply.inputs[2].default_value=tuple(np.r_[colour,1.])
            material.node_tree.links.new(texture.outputs['Color'],multiply.inputs[1]);material.node_tree.links.new(multiply.outputs['Color'],p.inputs['Base Color'])
    if role=='paint':material.name='Campus enamel';p.inputs['Coat Weight'].default_value=.55;p.inputs['Coat Roughness'].default_value=.12
    elif role=='glass':material.name='Window glass';p.inputs['Transmission Weight'].default_value=0;p.inputs['Alpha'].default_value=.34;material.surface_render_method='BLENDED';material.use_backface_culling=True
    elif role in ['clearlens','frontlamp']:p.inputs['Transmission Weight'].default_value=0;p.inputs['Alpha'].default_value=.58;material.surface_render_method='BLENDED';material.use_backface_culling=True
    elif role in ['redlens','brakelamp']:p.inputs['Transmission Weight'].default_value=0;p.inputs['Alpha'].default_value=1
    if role=='frontlamp':material.name='Front headlamp lens'
    elif role=='redlens':material.name='Rear position lamp lens'
    elif role=='brakelamp':material.name='Rear brake strip lens'
    material['source_role']=role
    material_audit.append({'name':material.name,'sourceRole':role,'baseColorLinear':list(p.inputs['Base Color'].default_value),'alpha':float(p.inputs['Alpha'].default_value),'textures':texture_report,'sourceColourSeparatedForVariants':role=='paint'})

parts=[]
for (wheel,role),objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    source_names=[obj['source_object'] for obj in objects]
    bpy.ops.object.join();obj=objects[0]
    obj.name=f'Wheel{wheel}:{role}' if wheel is not None else f'Body:{role}'
    obj['kind']='vehicle-wheel-part' if wheel is not None else 'vehicle-body-part'
    obj['source_objects']=json.dumps(source_names)
    obj['source_license']='CC0';obj['asset_id']='campus-hatchback'
    if wheel is not None:
        game_x=-.85 if wheel%2==0 else .85;game_z=1.05 if wheel<2 else -1.05
        pivot=Vector((game_x,-game_z,.36))
        for vertex in obj.data.vertices:vertex.co-=pivot
        obj.location=pivot;obj['wheel_index']=wheel
    parts.append(obj)
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:obj.select_set(True)
scene['derivation']='Source mesh retained; piecewise compact normalization to existing shared vehicle physics; linear swatch factors; no near decimation.'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'campus-hatchback-master.blend'))
bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'campus-hatchback-near.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_animations=False)
# Blender bakes a generic Multiply node into a blue PNG. Runtime paint variants
# need the neutral texture and explicit glTF factor, so repack only this channel.
neutral=bpy.data.images['CC0 paint neutral microvariation'];neutral.filepath_raw=str(OUT/'paint-neutral-microvariation.png');neutral.file_format='PNG';neutral.save()
nearfile=PUBLIC/'campus-hatchback-near.glb';raw=nearfile.read_bytes();jsonlength=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+jsonlength]);binstart=20+jsonlength+8;binary=bytearray(raw[binstart:]);binary.extend(b'\0'*((-len(binary))%4));offset=len(binary);png=(OUT/'paint-neutral-microvariation.png').read_bytes();binary.extend(png)
view=len(gltf['bufferViews']);gltf['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(png)})
paint=next(m for m in gltf['materials'] if m['name']=='Campus enamel');texture=gltf['textures'][paint['pbrMetallicRoughness']['baseColorTexture']['index']];gltf['images'][texture['source']]={'bufferView':view,'mimeType':'image/png','name':'CC0 paint neutral microvariation'}
paint['pbrMetallicRoughness']['baseColorFactor']=next(m['baseColorLinear'] for m in material_audit if m['sourceRole']=='paint');gltf['buffers'][0]['byteLength']=len(binary)
js=json.dumps(gltf,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary.extend(b'\0'*((-len(binary))%4));nearfile.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
# Rotate only the reviewed normalized inner-shell diagonal in the editable
# master. The final GLB retains every original byte except its six indices.
inner_repair=runpy.run_path(str(ROOT/'scripts/car-inner-shell-repair.py'))['repair_inner_shell'](bpy.data.objects['Body:black'].data)
repairs.append({'id':'inner-shell-diagonal-20261011','object':'Watertight 14-station body shell','repair':'local coplanar diagonal rotation; zero vertex movement; original UV and normal channels retained',**inner_repair})
# Keep the packed master portable when generated in an isolated output root.
neutral.filepath_raw='//paint-neutral-microvariation.png'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'campus-hatchback-master.blend'))
node=shutil.which('node');assert node,'Node is required for exact index-only GLB repair'
subprocess.run([node,str(ROOT/'scripts/repair-car-near.mjs'),str(nearfile),str(nearfile),str(DOCS/'near-inner-shell-index-audit.json')],check=True)
report={'sourceGlbSha256':'107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7','nearTriangles':sum(len(o.data.loop_triangles) for o in parts),'parts':len(parts),'wheelPartCounts':[sum(o.get('wheel_index')==i for o in parts) for i in range(4)],'repairs':repairs,'normalization':{'sourceLongitudinalKnots':source_x.tolist(),'targetLongitudinalKnots':target_x.tolist(),'sourceHalfWidthKnots':source_y.tolist(),'targetHalfWidthKnots':target_y.tolist(),'sourceHeightKnots':source_z.tolist(),'targetHeightKnots':target_z.tolist(),'wheelRadiusMetres':.34,'wheelCentresGame':[[-.85,.36,1.05],[.85,.36,1.05],[-.85,.36,-1.05],[.85,.36,-1.05]],'reflectionOrNegativeDeterminant':False,'sharedPhysicsChanged':False},'materials':material_audit,'geometry':geometry_audit,'zeroAreaTriangles':sum(r['zeroAreaTriangles'] for r in geometry_audit),'outputs':{}}
report['editableMasterPortability']={'neutralImageFilepath':neutral.filepath,'neutralImagePacked':bool(neutral.packed_file)}
for file in [OUT/'original-source.glb',OUT/'original-source.blend',OUT/'campus-hatchback-master.blend',PUBLIC/'campus-hatchback-near.glb']:
    report['outputs'][file.relative_to(ROOT).as_posix()]={'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
report['lightGeometry']={}
for role,names in [('front',['Flush swept transparent headlamp lens','Flush swept transparent headlamp lens.001']),('rear',['Flush corner wrapping ruby lamp lens','Flush corner wrapping ruby lamp lens.001'])]:
    centres=np.array([source_records[name]['centre'] for name in names]);mapped,_=normalized(centres)
    report['lightGeometry'][role]={'sourceObjects':names,'sourceCentresBlenderMetres':centres.tolist(),'centresGameMetres':mapped[:,[0,2,1]].tolist(),'provenance':'model-derived from actual CC0 lens meshes, not measured luminaire photometry'}
    for centre in report['lightGeometry'][role]['centresGameMetres']:centre[2]*=-1
(DOCS/'runtime-pack-audit.json').write_text(json.dumps(report,indent=2)+'\n')
(OUT/'runtime-pack-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['geometry','materials']},indent=2),flush=True)
