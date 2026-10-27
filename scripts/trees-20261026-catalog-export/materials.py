"""One packed photographic material library for every native catalogue tree."""
import bpy
from pathlib import Path
from native_io import ROOT,read,digest,write_json

def ensure_material_library(run):
    directory=ROOT/run['native'];directory.mkdir(parents=True,exist_ok=True);target=directory/'materials.blend';receipt=directory/'materials.json'
    if target.exists():
        if not receipt.exists()or read(receipt.relative_to(ROOT).as_posix())['file']!=digest(target):raise ValueError('Material library receipt mismatch')
        return target
    source=read('shared/data/assets/tree-materials-manifest.json');bark=read('shared/data/assets/tree-bark-material.json');bank=read('public/models/vegetation/seasonal-r6-far/bank.json')
    definitions={'Bark012':{'color':bark['channels']['color'],'normalGL':bark['channels']['normalgl'],'roughness':bark['channels']['roughness']},**{a['id']:a['maps']for a in source['assets']},'LeafSet024-r6-far':bank['textures']};materials=[];images={}
    for key,maps in definitions.items():
        material=bpy.data.materials.new('catalog '+key);material.use_nodes=True;material['catalogRun']=run['id'];material['materialKey']=key;bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=1.;bsdf.inputs['Metallic'].default_value=0
        for semantic,pin in maps.items():
            path=ROOT/('public'+pin['url']);actual=digest(path)
            if actual['bytes']!=pin['bytes']or actual['sha256']!=pin['sha256']:raise ValueError('Photograph changed')
            if str(path)not in images:
                image=bpy.data.images.load(str(path),check_existing=True);image.pack();images[str(path)]=image
            image=images[str(path)];image.colorspace_settings.name='sRGB'if semantic=='color'else'Non-Color';node=material.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
            if semantic=='normalGL':
                normal=material.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=bank.get('normalMapStrength',1)if key.endswith('far')else .45
                material.node_tree.links.new(node.outputs['Color'],normal.inputs['Color']);material.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
            elif semantic=='opacity':
                threshold=material.node_tree.nodes.new('ShaderNodeMath');threshold.operation='GREATER_THAN';threshold.inputs[1].default_value=bank.get('alphaCutoff',.5)if key.endswith('far')else .5
                material.node_tree.links.new(node.outputs['Color'],threshold.inputs[0]);material.node_tree.links.new(threshold.outputs[0],bsdf.inputs['Alpha'])
            else:material.node_tree.links.new(node.outputs['Color'],bsdf.inputs[{'color':'Base Color','roughness':'Roughness'}[semantic]])
        material.surface_render_method='DITHERED';material.use_backface_culling=False;materials.append(material)
    temporary=directory/'materials.staging.blend';bpy.data.libraries.write(str(temporary),set(materials),path_remap='RELATIVE',fake_user=True,compress=True);temporary.rename(target)
    write_json(receipt,{'runId':run['id'],'file':digest(target),'maps':[{'path':p,'packedSha256':__import__('hashlib').sha256(bytes(i.packed_file.data)).hexdigest()}for p,i in images.items()]})
    return target

def load_materials(path):
    with bpy.data.libraries.load(str(path),link=True,relative=False)as(source,target):target.materials=[n for n in source.materials if n.startswith('catalog ')]
    return {m['materialKey']:m for m in target.materials}
