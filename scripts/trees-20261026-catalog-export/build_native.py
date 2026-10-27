"""Stage one: actual editable near/MID geometry and source-local FAR wood.
Run only in the coordinator's allocated Blender CPU validation window.
"""
import os,sys,json,math
from pathlib import Path
sys.dont_write_bytecode=True;os.environ['OMP_NUM_THREADS']='2'
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from native_io import ROOT,read,arguments,write_json,digest,make_mesh,extras,export_glb
from native_geometry import tube_geometry,foliage_geometry
from materials import ensure_material_library,load_materials

def support_audit(geometry,parts):
    # A per-branch BVH prevents a neighbouring tube from masking a detached leaf.
    trees={};tested=0;maximum=0.
    for bid,span in geometry['ranges'].items():
        start,end=span['vertices'];a,b=span['faces'];faces=[tuple(i-start for i in face)for face in geometry['faces'][a:b]]
        trees[bid]=BVHTree.FromPolygons([Vector(p)for p in geometry['positions'][start:end]],faces,all_triangles=False)
    for p in parts:
        if p['branchId']not in trees:raise ValueError('Missing own supporting wood branch')
        found=trees[p['branchId']].find_nearest(Vector(p['anchor']));distance=float(found[3])if found[0]is not None else math.inf;limit=max(.008,p['supportRadius']+.005)
        if distance>limit:raise ValueError('Detached metric leaf '+str((p['branchId'],distance,limit)))
        maximum=max(maximum,distance/limit);tested+=1
    return {'testedOwnBranchAnchors':tested,'maximumSupportThresholdRatio':maximum,'failed':0}

def build_one(run,source_id,materials_path):
    directory=ROOT/run['cache']/source_id;prepared=read((directory/'prepared.json').relative_to(ROOT).as_posix());receipt=directory/'native-base.json'
    if prepared['reuseAcceptedPilot']:return
    if receipt.exists():
        result=read(receipt.relative_to(ROOT).as_posix())
        for p in [result['native'],*result['lods']]:
            actual=digest(ROOT/p['path'])
            if actual['bytes']!=p['bytes']or actual['sha256']!=p['sha256']:raise ValueError('Native base receipt mismatch')
        return
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0;materials=load_materials(materials_path);objects={};audits=[];mid_components=[]
    source=prepared['source'];pid=prepared['prototypeId'];broad=source['family']=='deciduous-broadleaf';parts=[p for g in prepared['groups']for p in g['parts']]
    if source['family']=='reference-bare':
        old=ROOT/'assets/blender/vegetation/strahov-individual-trees.blend'
        with bpy.data.libraries.load(str(old),link=False)as(a,b):b.objects=[f'tree__{source_id}__lod{lod}__bark'for lod in range(3)]
        if any(o is None for o in b.objects):raise ValueError('Missing source bare wood')
        for lod,obj in enumerate(b.objects):
            bpy.context.collection.objects.link(obj);obj.parent=None;obj.location=(0,0,0);obj.rotation_mode='XYZ';obj.rotation_quaternion=(1,0,0,0);obj.rotation_euler=(0,0,0);obj.scale=(1,1,1);obj.name=f'{pid}__lod{lod}__wood';obj.data.materials.clear();obj.data.materials.append(materials['Bark012'])
            for k,v in extras(prepared,lod,'wood').items():obj[k]=v
            objects[lod]=[obj];audits.append({'lod':lod,'sourceBareWoodReused':True})
    else:
        atlas=next(a for a in read('shared/data/tree-leaf-components.json')['atlases']if a['id']==('LeafSet024'if broad else'fir_tree_01'))
        supports={p['branchId']for p in parts}
        for lod in range(3):
            wood=tube_geometry(prepared['axes'],lod,supports if lod<2 else());obj=make_mesh(f'{pid}__lod{lod}__wood',wood,materials['Bark012'],extras(prepared,lod,'wood'));objects[lod]=[obj]
            audit={'lod':lod,'wood':wood['audit']}
            if lod<2 or not broad:
                foliage=foliage_geometry(prepared['groups'],atlas,lod);leaf=make_mesh(f'{pid}__lod{lod}__foliage',foliage,materials[atlas['id']],extras(prepared,lod,'foliage'));objects[lod].append(leaf)
                if lod<2:audit['support']=support_audit(wood,parts)
                if lod==1:
                    mid_components=foliage['components']
                    if broad:
                        coordinates=np.empty(len(leaf.data.vertices)*3,dtype=np.float32);leaf.data.vertices.foreach_get('co',coordinates);coordinates=coordinates.reshape(-1,3).tolist()
                        groups=[];by_rank={}
                        for p in mid_components:by_rank.setdefault(p['rank'],[]).append(p)
                        for g in prepared['groups']:
                            ordered=by_rank[g['rank']];points=[]
                            for p in ordered:
                                start=p['vertexStart'];ids=sorted(range(start,start+4),key=lambda i:(foliage['uvs'][i][0],foliage['uvs'][i][1]));points.extend(coordinates[i]for i in ids)
                            groups.append({'rank':g['rank'],'anchor':g['anchor'],'parts':[{'partId':p['partId'],'sourcePartIndex':p['sourcePartIndex']}for p in ordered],'points':points})
                        write_json(directory/'far-groups.json',groups)
            audits.append(audit)
    lods=[]
    for material in list(bpy.data.materials):
        if material.users==0 and material.library is None:bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        if image.users==0 and image.library is None:bpy.data.images.remove(image)
    for lod,items in objects.items():
        for obj in items:obj.hide_render=lod!=0;obj.hide_set(lod!=0)
        lods.append(export_glb(items,directory/f'lod{lod}-base.glb'))
    if mid_components:write_json(directory/'components.json',mid_components)
    bpy.context.scene['catalog_run']=run['id'];bpy.context.scene['source_tree_id']=source_id;bpy.context.scene['source_root_xz']=source['sourceRootXZ'];bpy.context.scene['catalog_provenance']='Original authored model fitted to historical source estimates; no botanical identification.'
    bpy.ops.wm.save_as_mainfile(filepath=str(directory/'base.blend'),compress=True)
    write_json(receipt,{'runId':run['id'],'sourceTreeId':source_id,'native':digest(directory/'base.blend'),'lods':lods,'audit':audits,'blender':bpy.app.version_string})
    print('CATALOG_NATIVE_BASE',source_id,flush=True)

if __name__=='__main__':
    run,args=arguments();bpy.ops.wm.read_factory_settings(use_empty=True);library=ensure_material_library(run)
    ids=[p['sourceTreeId']for p in run['catalog']['placements']]if args['id']=='all'else[args['id']]
    known={p['sourceTreeId']for p in run['catalog']['placements']}
    for ident in ids:
        if ident not in known:raise ValueError('Unknown source ID')
        build_one(run,ident,library)
