"""Full-population north Fir FAR derivative; original R5 near/MID unchanged.
Code prepared for the next explicit heavy window, not run during GPU review.
"""
import sys,os,json,struct,hashlib
from pathlib import Path
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
import numpy as np
from native_io import ROOT,read,digest,write_json,make_mesh,extras,mesh_records,export_glb,verify_glb
from native_geometry import fir_quad_from_source,sample
from finalize_native import preview
from native_package_utils import native_inventory,material_signatures

def signatures(objects):
    result={}
    for obj in objects:
        records,corners=mesh_records(obj);result[obj.name]={k:hashlib.sha256(records[k][corners].tobytes()).hexdigest()for k in records.dtype.names}
    return result
def original_lod(file):
    path=ROOT/('public'+file['url']);actual=digest(path)
    if actual['bytes']!=file['bytes']or actual['sha256']!=file['sha256']:raise ValueError('Original conifer LOD changed')
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);meshes=[]
    for node in g['nodes']:
        p=g['meshes'][node['mesh']]['primitives'][0];meshes.append({'name':node['name'],'vertices':g['accessors'][p['attributes']['POSITION']]['count'],'triangles':g['accessors'][p['indices']]['count']//3})
    return {**actual,'meshes':meshes}

def build_north(run,prepared,render_preview=False):
    ident='ipr-b6-north-conifer';pid='own-conifer'
    if prepared['source']['sourceTreeId']!=ident or prepared['prototypeId']!=pid:raise ValueError('Wrong north source')
    cache=ROOT/run['cache']/ident;cache.mkdir(parents=True,exist_ok=True)
    original=read('public/models/vegetation/seasonal-r6-streamed/runtime-contract.json')['prototypes'][pid]
    near_mid=[original_lod(original['lods'][lod])for lod in [0,1]]
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
    source=ROOT/'assets/blender/vegetation/seasonal-r5/r5-full-coverage-pilots.blend';source_before=digest(source)
    names=[f'{pid}__lod{lod}__{role}'for lod in range(3)for role in ['wood','foliage']]
    with bpy.data.libraries.load(str(source),link=False)as(a,b):b.objects=names[:]
    if any(o is None for o in b.objects):raise ValueError('Original north native objects missing')
    for obj in b.objects:
        bpy.context.collection.objects.link(obj)
        if obj.parent is not None or not np.array_equal(np.asarray(obj.matrix_world),np.eye(4)):raise ValueError('Original north transform changed')
    detailed=[bpy.data.objects[n]for n in names[:4]];before=signatures(detailed);materials_before=material_signatures(detailed);mid=bpy.data.objects[f'{pid}__lod1__foliage'];mesh=mid.data
    positions=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',positions);positions=positions.reshape(-1,3)
    color=np.empty(len(mesh.vertices)*4,dtype=np.float32);mesh.color_attributes.active_color.data.foreach_get('color',color);ranks=np.rint(color.reshape(-1,4)[:,3]*65535).astype(np.int32)
    uv=np.empty((len(mesh.vertices),2),dtype=np.float32)
    for loop in mesh.loops:uv[loop.vertex_index]=mesh.uv_layers.active.data[loop.index].uv
    unique,starts,counts=np.unique(ranks,return_index=True,return_counts=True)
    if len(unique)!=18138 or not np.all(counts==8)or np.any(np.diff(ranks)<0):raise ValueError('Full R5 Fir population changed')
    source_metadata=read('.cache/trees-pilot-20261025/r4-optimized/models/pilot-manifest.json');variant=next(v for v in source_metadata['variants']if v['id']==pid);by_rank={p['rank']:p for p in variant['foliage']['componentMetadata']}
    axes={a['id']:a for a in read('.cache/trees-pilot-20261025/own-conifer-axes.json')['axes']};atlas=next(a for a in read('shared/data/tree-leaf-components.json')['atlases']if a['id']=='fir_tree_01');parts={p['id']:p for p in atlas['parts']};components={c['id']:c for c in atlas['components']}
    g={'positions':[],'uvs':[],'faces':[],'ranks':[]};maximum_fit=0.;maximum_anchor=0.;lengths=[]
    for rank,start in zip(unique,starts):
        metadata=by_rank[int(rank)];part=parts[metadata['partId']];anchor=np.asarray(metadata['anchor'])
        if np.linalg.norm(sample(axes[metadata['branchId']],metadata['branchT'])[0]-anchor)>1e-8:raise ValueError('Original source anchor/axis mismatch')
        result=fir_quad_from_source(positions[start:start+8],uv[start:start+8],part,components[part['componentId']],anchor);offset=len(g['positions']);g['positions'].extend(result['positions']);g['uvs'].extend(result['uvs']);g['faces'].extend([tuple(offset+i for i in f)for f in result['faces']]);g['ranks'].extend([int(rank)]*4)
        maximum_fit=max(maximum_fit,result['sourceFitErrorMetres']);maximum_anchor=max(maximum_anchor,result['anchorErrorMetres']);lengths.append(result['physicalLengthMetres'])
    original_fir_material=mid.data.materials[0]
    old=bpy.data.objects[f'{pid}__lod2__foliage'];bpy.data.objects.remove(old,do_unlink=True)
    far=make_mesh(f'{pid}__lod2__foliage',g,original_fir_material,extras(prepared,2,'foliage'))
    if signatures(detailed)!=before or material_signatures(detailed)!=materials_before:raise ValueError('North near/MID native geometry/materials changed')
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.hide_render=obj.get('lod')!=0;obj.hide_set(obj.get('lod')!=0)
    for material in list(bpy.data.materials):
        if material.users==0 and material.library is None:bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        if image.users==0 and image.library is None:bpy.data.images.remove(image)
    bpy.context.scene['catalog_run']=run['id'];bpy.context.scene['source_tree_id']=ident
    directory=ROOT/run['native']/ident;directory.mkdir(parents=True,exist_ok=True);native=directory/'model.blend'
    if native.exists():raise ValueError('Preserve unreceipted north native for inspection')
    bpy.ops.wm.save_as_mainfile(filepath=str(native),compress=True,relative_remap=False);bpy.ops.wm.open_mainfile(filepath=str(native))
    reopened_detail=[bpy.data.objects[n]for n in names[:4]]
    if signatures(reopened_detail)!=before or material_signatures(reopened_detail)!=materials_before:raise ValueError('North native reopen changed source detail/materials')
    objects=[bpy.data.objects[f'{pid}__lod2__wood'],bpy.data.objects[f'{pid}__lod2__foliage']];far_file=export_glb(objects,ROOT/run['public']/ident/'lod2.glb');checks=verify_glb(objects,ROOT/far_file['path'])
    for lod in [0,1]:
        if original_lod(original['lods'][lod])!=near_mid[lod]:raise ValueError('Original near/MID bytes changed')
    if digest(source)!=source_before:raise ValueError('Original R5 native changed')
    audit={'sourceParts':18138,'farParts':len(unique),'nearMidBytesUnchanged':True,'nearMidNativeCornersUnchanged':True,'nearMidNativeMaterialsUnchanged':True,'priorSparseFarParts':3631,'sourceMappingMaximumResidualMetres':maximum_fit,'sourceAnchorMaximumErrorMetres':maximum_anchor,'physicalTwigLengthRangeMetres':[min(lengths),max(lengths)],'sourceGeometryPolicy':'Full original R5 photographic twig population, same UV/base/sine-bend mapping, one conservative metric rectangle per source rank','newAtlas':False,'blender':bpy.app.version_string}
    write_json(cache/'north-far-audit.json',audit)
    inventory=native_inventory(pid)
    if [len(inventory[str(lod)])for lod in range(3)]!=[2,2,2]:raise ValueError('North package lacks unchanged near/MID or complete FAR')
    result={'runId':run['id'],'sourceTreeId':ident,'native':digest(native),'packedMaterialsLocal':True,'lods':[*near_mid,far_file],'reopened':True,'cornerChecks':checks,'nativeContents':inventory,'fullSourceFar':audit,'intermediates':[digest(cache/'prepared.json')]}
    if render_preview:preview(objects,cache/'native-far-preview.png');result['preview']=digest(cache/'native-far-preview.png')
    write_json(cache/'complete.json',result);print('NORTH_CONIFER_FULL_FAR_COMPLETE',flush=True)
