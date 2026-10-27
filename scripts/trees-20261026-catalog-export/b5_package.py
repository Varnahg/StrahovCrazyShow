"""Append the accepted R6 near/MID and full FAR into one final native package.
No geometry generation, rebake, source rewrite or runtime asset regeneration.
"""
import sys,json
from pathlib import Path
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
import numpy as np
from native_io import ROOT,read,digest,write_json,extras
from native_package_utils import mesh_signatures,material_signatures,used_ranks,native_inventory
from north_conifer import original_lod

NEAR_MID='assets/blender/vegetation/seasonal-r6-crown/r6-b5-crown-three-lods.blend'
FAR='assets/blender/vegetation/seasonal-r6-far/r6-b5-far-candidate.blend'

def package_b5(run,prepared):
    ident='ipr-crown-014';pid='own-broadleaf'
    if prepared['source']['sourceTreeId']!=ident or prepared['prototypeId']!=pid:raise ValueError('Wrong B5 package identity')
    cache=ROOT/run['cache']/ident;cache.mkdir(parents=True,exist_ok=True)
    sources=[digest(ROOT/p)for p in[NEAR_MID,FAR]];bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
    mappings=[(NEAR_MID,[(f'R6 crown__lod{lod}__{role}',lod,role)for lod in[0,1]for role in['wood','foliage']]),
      (FAR,[('R6 crown__lod2__wood',2,'wood'),('R6 FAR exact fallback',2,'foliage'),('R6 FAR cards',2,'far-cards')])]
    objects=[]
    for source,rows in mappings:
        with bpy.data.libraries.load(str(ROOT/source),link=False)as(a,b):b.objects=[name for name,_,_ in rows]
        if any(obj is None for obj in b.objects):raise ValueError('Accepted package object missing')
        for obj,(old,lod,role)in zip(b.objects,rows):
            if obj.parent is not None or not np.array_equal(np.asarray(obj.matrix_world),np.eye(4)):raise ValueError('Accepted object is not root-local identity')
            name=f'{pid}__lod{lod}__'+('cards'if role=='far-cards'else role);obj.name=name
            for key,v in extras(prepared,lod,'wood'if role=='wood'else'foliage').items():obj[key]=v
            obj['role']=role
            if role=='far-cards':obj['materialKey']='LeafSet024-r6-far'
            collection=bpy.data.collections.get(f'LOD{lod}')
            if collection is None:collection=bpy.data.collections.new(f'LOD{lod}');bpy.context.scene.collection.children.link(collection)
            collection.objects.link(obj);obj.hide_render=lod!=0;obj.hide_set(lod!=0);objects.append(obj)
    before=mesh_signatures(objects);materials_before=material_signatures(objects)
    mid=used_ranks(bpy.data.objects[f'{pid}__lod1__foliage']);exact=used_ranks(bpy.data.objects[f'{pid}__lod2__foliage']);cards=used_ranks(bpy.data.objects[f'{pid}__lod2__cards'])
    if len(mid)!=16019 or exact&cards or exact|cards!=mid:raise ValueError('Packaged full FAR does not cover original MID ranks')
    if len([o for o in bpy.context.scene.objects if o.type=='MESH'])!=7:raise ValueError('Package contains unexpected/sparse source meshes')
    bpy.context.scene['catalog_run']=run['id'];bpy.context.scene['source_tree_id']=ident;bpy.context.scene['native_lod_policy']='Accepted near/MID plus full FAR cards, exact fallback and wood. Original sparse FAR is not present.'
    text=bpy.data.texts.new('README');text.write('Final B5 catalogue package. LOD0/1 are the unchanged accepted R6 crown. LOD2 contains the unchanged accepted full FAR wood, exact source foliage and cards. All source textures are packed. Geometry and material graphs are verified before/after save. Runtime GLB, placement records and bank remain their original accepted bytes.')
    directory=ROOT/run['native']/ident;directory.mkdir(parents=True,exist_ok=True);native=directory/'model.blend'
    if native.exists():raise ValueError('Preserve unreceipted B5 package for inspection')
    bpy.ops.wm.save_as_mainfile(filepath=str(native),compress=True);bpy.ops.wm.open_mainfile(filepath=str(native));reopened=[bpy.data.objects[name]for name in before]
    if mesh_signatures(reopened)!=before or material_signatures(reopened)!=materials_before:raise ValueError('Native geometry/material package changed on reopen')
    inventory=native_inventory(pid)
    if [len(inventory[str(lod)])for lod in range(3)]!=[2,2,3]:raise ValueError('Native package is not complete near/MID/full FAR')
    for pin in sources:
        if digest(ROOT/pin['path'])!=pin:raise ValueError('Original accepted native input changed')
    contract=read('public/models/vegetation/seasonal-r6-streamed/runtime-contract.json')['prototypes'][pid];far=read('public/models/vegetation/seasonal-r6-far/pilot-manifest.json')
    lods=[original_lod(contract['lods'][0]),original_lod(contract['lods'][1]),original_lod(far['exactGeometry'])]
    placement=digest(ROOT/('public'+far['placements']['url']))
    if placement['bytes']!=far['placements']['bytes']or placement['sha256']!=far['placements']['sha256']:raise ValueError('Accepted runtime placements changed')
    proof={'nearMidSourceUnchanged':True,'farSourceUnchanged':True,'materialGraphsUnchanged':True,'fullFarRankGroups':len(mid),'exactRankGroups':len(exact),'cardRankGroups':len(cards),'sparseFarExcluded':True,'sources':sources,'meshSignatures':before,'materialSignatures':materials_before,'runtimeAssetsUnchanged':True}
    result={'runId':run['id'],'sourceTreeId':ident,'native':digest(native),'lods':lods,'reopened':True,'packedMaterialsLocal':True,'nativeContents':inventory,'b5Package':proof,
      'farClusterEvidence':{'runId':run['id'],'sourceTreeId':ident,'groupCount':far['placements']['count'],'file':placement,'bankSha256':far['bank']['sha256']},'intermediates':[digest(cache/'prepared.json')]}
    write_json(cache/'complete.json',result);print('B5_ACCEPTED_NATIVE_PACKAGE_COMPLETE',flush=True)
