"""Reproducible editable Blender/glTF archive of the runtime's exact geometry.
First: pnpm exec tsx docs/reality-pack/landmarks/export.ts
Then: blender --background --python scripts/create-landmark-reality.py
No reference photographs are embedded; they remain provenance links only.
Runtime uses the same shared numeric geometry batched by material for fewer draws.
"""
import json, math, hashlib, argparse, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'docs/reality-pack/landmarks/geometry-source.json'
OUT=ROOT/'public/models/landmarks'
BLEND=ROOT/'assets/blender/landmarks'
data=json.loads(SOURCE.read_text(encoding='utf-8'))
parser=argparse.ArgumentParser(description='Export the shared authored landmark geometry; --only preserves other archives.')
parser.add_argument('--only',help='Comma-separated source module IDs')
parser.add_argument('--dry-run',action='store_true',help='Read/validate selection without Blender or file writes')
arguments=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else (sys.argv[1:] if Path(sys.argv[0]).resolve()==Path(__file__).resolve() else [])
args=parser.parse_args(arguments)
known={module['id'] for module in data['modules']}
selected=set(args.only.split(',')) if args.only else known
if not selected or selected-known:parser.error('Unknown or empty module selection: '+','.join(sorted(selected-known)))
manifest_path=OUT/'manifest.json'
previous=json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
old_modules={module['id']:module for module in previous.get('modules',[])}
if args.only and any(module_id not in old_modules for module_id in known-selected):parser.error('Selective export requires manifest entries for preserved modules')
if args.dry_run:
    print(json.dumps({'selected':sorted(selected),'preserved':sorted(known-selected),'writes':[str(folder/(module_id+suffix)) for module_id in sorted(selected) for folder,suffix in [(OUT,'.glb'),(BLEND,'.blend')]],'manifest':str(manifest_path),'blenderStarted':False},indent=2))
    raise SystemExit(0)
import bpy
OUT.mkdir(parents=True,exist_ok=True);BLEND.mkdir(parents=True,exist_ok=True)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.render.threads_mode='FIXED';bpy.context.scene.render.threads=2
COLORS={
 'concrete':'92978e','pale':'b5b8a7','trim':'e0e0d3','blind':'b9b5a3',
 'base':'767783','metal':'a2afac','glass':'384542','infill':'8bafa6',
 'brick':'926c55','seat':'999b8b','roof':'6d756e',
 'stadium-glass':'4b6a80','stadium-frame':'636c70','stadium-cladding':'aab3b5',
 'stadium-soffit':'434a48','stadium-rail':'242a2a',
}
def linear(v):
    return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def material(kind):
    m=bpy.data.materials.get(kind)
    if m:return m
    color=tuple(linear(int(COLORS[kind][i:i+2],16)/255) for i in (0,2,4))
    m=bpy.data.materials.new(kind);m.use_nodes=True;m.diffuse_color=(*color,1)
    shader=m.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Metallic'].default_value=.78 if kind=='metal' else .12 if kind=='glass' else 0
    shader.inputs['Roughness'].default_value=.2 if kind=='glass' else .35 if kind=='metal' else .8
    if kind.startswith('stadium-'):
        shader.inputs['Metallic'].default_value={'stadium-glass':.10,'stadium-frame':.65,'stadium-cladding':.52,'stadium-soffit':.12,'stadium-rail':.12}[kind]
        shader.inputs['Roughness'].default_value={'stadium-glass':.23,'stadium-frame':.53,'stadium-cladding':.48,'stadium-soffit':.78,'stadium-rail':.78}[kind]
    if kind=='stadium-glass':
        vertex=m.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='Authored pane variation'
        # Blender5.2's glTF exporter recognizes the modern RGBA Mix node;
        # deprecated MixRGB otherwise loses the factor and emits a white COLOR_0.
        multiply=m.node_tree.nodes.new('ShaderNodeMix');multiply.data_type='RGBA';multiply.blend_type='MULTIPLY'
        socket=lambda name:next(s for s in multiply.inputs if s.identifier==name)
        socket('Factor_Float').default_value=1;socket('A_Color').default_value=(*color,1)
        m.node_tree.links.new(vertex.outputs['Color'],socket('B_Color'))
        m.node_tree.links.new(next(s for s in multiply.outputs if s.identifier=='Result_Color'),shader.inputs['Base Color'])
    m['sourcePack']='landmark-reality';m['sourceMeasured']=False
    return m
report=[]
for module in data['modules']:
    if module['id'] not in selected:continue
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    origin=module['origin'];cos=math.cos(origin['yaw']);sin=math.sin(origin['yaw'])
    root=bpy.data.objects.new(module['id'],None);bpy.context.collection.objects.link(root)
    if 'modelScope' in module:
        root['modelScope']=module['modelScope'];root['interiorPubliclyAccessible']=module['interiorPubliclyAccessible']
    if module['parts']:
        root['assetKey']=module['parts'][0]['asset']['key']
        root['sourceId']=module['parts'][0]['asset']['sourceId']
        root['sourceUrl']=module['parts'][0]['asset']['sourceUrl']
    for part in module['parts']:
        positions=part['positions'];vertices=[]
        for i in range(0,len(positions),3):
            dx=positions[i]-origin['x'];dy=positions[i+1]-origin['y'];dz=positions[i+2]-origin['z']
            x=cos*dx-sin*dz;z=sin*dx+cos*dz
            vertices.append((x,-z,dy))
        faces=[part['indices'][i:i+3] for i in range(0,len(part['indices']),3)]
        mesh=bpy.data.meshes.new(part['group']+' '+part['material']);mesh.from_pydata(vertices,[],faces);mesh.update()
        obj=bpy.data.objects.new(part['material']+' '+part['lod'],mesh);bpy.context.collection.objects.link(obj)
        obj.parent=root;obj['assetKey']=part['asset']['key'];obj['sourceId']=part['asset']['sourceId']
        obj.data.materials.append(material(part['material']))
        obj['sourcePack']='landmark-reality';obj['sourceMeasured']=False
        uv=mesh.uv_layers.new(name='UVMap')
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                vi=mesh.loops[li].vertex_index;uv.data[li].uv=part['uvs'][vi*2:vi*2+2]
        if part.get('colors'):
            color=mesh.color_attributes.new(name='Authored pane variation',type='FLOAT_COLOR',domain='CORNER')
            for loop in mesh.loops:
                vi=loop.vertex_index;color.data[loop.index].color=part['colors'][vi*4:vi*4+4]
    scene=bpy.context.scene;scene.unit_settings.system='METRIC'
    scene['sourceEvidence']=json.dumps(data['source'],ensure_ascii=False)
    scene['sourceWorldOrigin']=json.dumps(origin)
    scene['runtimeNote']='Same shared geometry is batched directly in Babylon; do not overlay this archive on the runtime component.'
    blend=BLEND/(module['id']+'.blend');glb=OUT/(module['id']+'.glb')
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_apply=True,export_yup=True,export_extras=True,export_all_vertex_colors=False)
    report.append({'id':module['id'],'triangles':sum(len(p['indices'])//3 for p in module['parts']),'bytes':glb.stat().st_size,'sha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'worldOrigin':origin})
updates={module['id']:{**old_modules.get(module['id'],{}),**module} for module in report}
modules=[updates.get(module['id'],module) for module in previous.get('modules',[])] if args.only else report
if args.only:modules.extend(module for module in report if module['id'] not in old_modules)
license=previous.get('license','Original authored meshes/materials CC0-1.0; OSM-derived placement/footprint data ODbL-1.0 with attribution. Reference photographs not redistributed.')
if 'IPR' not in license:license+=' IPR-derived elevation profile CC BY; datový podklad © IPR Praha.'
manifest={**previous,'schemaVersion':1,'license':license,'sourceGeometrySha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'modules':modules}
manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8',newline='\n')
print(json.dumps(manifest,indent=2))
