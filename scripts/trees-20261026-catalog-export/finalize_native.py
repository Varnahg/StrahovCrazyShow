"""Stage two: actual FAR geometry, native reopen and exact-corner export.
Only after fit_far; do not run outside the agreed Blender CPU window.
"""
import os,sys,math,hashlib
from pathlib import Path
sys.dont_write_bytecode=True;os.environ['OMP_NUM_THREADS']='2'
sys.path.insert(0,str(Path(__file__).resolve().parent))
import bpy
import numpy as np
from mathutils import Vector
from native_io import ROOT,read,arguments,write_json,digest,make_mesh,extras,export_glb,verify_glb,mesh_records
from materials import load_materials

def exact_geometry(mid,components,ranks):
    mesh=mid.data;positions=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',positions);positions=positions.reshape(-1,3)
    uv=np.empty((len(mesh.vertices),2),dtype=np.float32)
    for loop in mesh.loops:uv[loop.vertex_index]=mesh.uv_layers.active.data[loop.index].uv
    out={'positions':[],'uvs':[],'faces':[],'ranks':[]}
    for part in components:
        if part['rank']not in ranks:continue
        if part['vertexCount']!=4:raise ValueError('Expected exact source MID quad')
        start=part['vertexStart'];base=len(out['positions']);out['positions'].extend(positions[start:start+4].tolist());out['uvs'].extend(uv[start:start+4].tolist());out['faces'].extend([(base,base+1,base+2),(base,base+2,base+3)]);out['ranks'].extend([part['rank']]*4)
    return out

def card_geometry(bank,placements):
    result={'positions':[],'uvs':[],'faces':[],'ranks':[]}
    for p in placements:
        if p['exact']:continue
        prototype=bank['prototypes'][p['prototype']]
        if prototype['id']!=p['prototype']:raise ValueError('Bank identity mismatch')
        rotation=np.asarray(p['matrix']).reshape(3,3)
        for card in prototype['cards']:
            points=np.asarray(card['positions']).reshape(4,3);points=points[:,[0,2,1]].copy();points[:,1]*=-1;points=points@rotation.T+np.asarray(p['anchor'])
            uv=np.asarray(card['uvs']).reshape(4,2).copy();uv[:,1]=1-uv[:,1];base=len(result['positions'])
            result['positions'].extend(points.tolist());result['uvs'].extend(uv.tolist());result['faces'].extend([(base,base+1,base+2),(base,base+2,base+3)]);result['ranks'].extend([p['rank']]*4)
    return result

def preview(objects,path):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.render.threads_mode='FIXED';scene.render.threads=2;scene.cycles.samples=8;scene.cycles.use_denoising=False;scene.cycles.transparent_max_bounces=64;scene.cycles.max_bounces=4
    scene.view_settings.view_transform='Standard';scene.view_settings.exposure=0;scene.view_settings.gamma=1
    scene.render.resolution_x=720;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.world=bpy.data.worlds.new('catalog preview world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.25,.28,.32,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    points=[v.co for obj in objects for v in obj.data.vertices];minimum=np.min(np.asarray(points),axis=0);maximum=np.max(np.asarray(points),axis=0);centre=Vector((minimum+maximum)/2);size=max(maximum-minimum)*1.3
    data=bpy.data.cameras.new('catalog source preview');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera);data.type='ORTHO';data.ortho_scale=size;camera.location=centre+Vector((size*.7,-size*1.6,size*.4));camera.rotation_euler=(centre-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
    light_data=bpy.data.lights.new('catalog softbox','AREA');light_data.energy=1800;light_data.shape='DISK';light_data.size=size*.6;light=bpy.data.objects.new(light_data.name,light_data);scene.collection.objects.link(light);light.location=centre+Vector((-size,size*-1.3,size));light.rotation_euler=(centre-light.location).to_track_quat('-Z','Y').to_euler()
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.hide_render=obj not in objects
    scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)

def finalize_one(run,source_id,render_preview=False):
    cache=ROOT/run['cache']/source_id;receipt=cache/'complete.json'
    if receipt.exists():
        result=read(receipt.relative_to(ROOT).as_posix())
        if result['runId']!=run['id']or result['sourceTreeId']!=source_id or result.get('reopened')is not True:raise ValueError('Wrong completed source identity')
        for descriptor in [result['native'],*([result['materialLibrary']]if result.get('materialLibrary')else[]),*result.get('dependencies',[]),*result['lods'],*([result['farClusterEvidence']['file']]if'farClusterEvidence'in result else[])]:
            current=digest(ROOT/descriptor['path'])
            if current['bytes']!=descriptor['bytes']or current['sha256']!=descriptor['sha256']:raise ValueError('Completed source receipt mismatch')
        return
    prepared=read((cache/'prepared.json').relative_to(ROOT).as_posix())
    if prepared['reuseAcceptedPilot']:return
    base=read((cache/'native-base.json').relative_to(ROOT).as_posix());actual=digest(ROOT/base['native']['path'])
    if actual!=base['native']:raise ValueError('Native base changed')
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/base['native']['path']));bpy.context.preferences.filepaths.save_version=0
    pid=prepared['prototypeId'];source=prepared['source'];materials={m['materialKey']:m for m in bpy.data.materials if'materialKey'in m};objects={lod:[bpy.data.objects[f'{pid}__lod{lod}__wood']]for lod in range(3)}
    for lod in range(3):
        leaf=bpy.data.objects.get(f'{pid}__lod{lod}__foliage')
        if leaf:objects[lod].append(leaf)
    if source['family']=='deciduous-broadleaf':
        fit=read((cache/'far-fit.json').relative_to(ROOT).as_posix());bank=read('public/models/vegetation/seasonal-r6-far/bank.json');components=read((cache/'components.json').relative_to(ROOT).as_posix())
        exact=exact_geometry(bpy.data.objects[f'{pid}__lod1__foliage'],components,set(fit['exactFallbackRanks']))
        if exact['positions']:objects[2].append(make_mesh(f'{pid}__lod2__foliage',exact,materials['LeafSet024'],extras(prepared,2,'foliage')))
        cards=card_geometry(bank,fit['placements'])
        if cards['positions']:
            card_material=materials.get('LeafSet024-r6-far')
            if not card_material:card_material=load_materials(ROOT/run['native']/'materials.blend')['LeafSet024-r6-far']
            obj=make_mesh(f'{pid}__lod2__cards',cards,card_material,{**extras(prepared,2,'foliage'),'role':'far-cards','materialKey':'LeafSet024-r6-far'});obj.hide_render=True;obj.hide_set(True)
    for lod,items in objects.items():
        for obj in items:obj.hide_render=lod!=0;obj.hide_set(lod!=0)
    # Native per-source geometry is local. The current terrain root is metadata,
    # never baked into vertices or duplicated in a parent matrix.
    directory=ROOT/run['native']/source_id;directory.mkdir(parents=True,exist_ok=True);native=directory/'model.blend'
    for library in bpy.data.libraries:
        if Path(bpy.path.abspath(library.filepath)).resolve()==(ROOT/run['native']/'materials.blend').resolve():library.filepath='//../materials.blend'
    expected={}
    for obj in bpy.data.objects:
        if obj.type=='MESH'and obj.get('archetypeId')==pid:
            record,corners=mesh_records(obj);expected[obj.name]={key:hashlib.sha256(record[key][corners].tobytes()).hexdigest()for key in record.dtype.names}
    if not native.exists():bpy.ops.wm.save_as_mainfile(filepath=str(native),compress=True,relative_remap=False)
    # Reopen the actual deliverable to resolve linked photographs and prove no
    # memory-only authoring state is necessary for its native/runtime parity.
    bpy.ops.wm.open_mainfile(filepath=str(native))
    if bpy.context.scene.get('catalog_run')!=run['id']or bpy.context.scene.get('source_tree_id')!=source_id:raise ValueError('Native run/source identity changed')
    found={}
    for obj in bpy.data.objects:
        if obj.type=='MESH'and obj.get('archetypeId')==pid:
            record,corners=mesh_records(obj);found[obj.name]={key:hashlib.sha256(record[key][corners].tobytes()).hexdigest()for key in record.dtype.names}
    if found!=expected:raise ValueError('Saved native geometry differs from deterministic source pipeline')
    objects={lod:[o for o in bpy.data.objects if o.get('archetypeId')==pid and o.get('lod')==lod and o.get('role')in('wood','foliage')]for lod in range(3)}
    lods=[];checks=[]
    for lod in range(3):
        objects[lod].sort(key=lambda o:0 if o['role']=='wood' else 1);target=ROOT/run['public']/source_id/f'lod{lod}.glb';lods.append(export_glb(objects[lod],target));checks.extend(verify_glb(objects[lod],target))
    for lod in [0,1]:
        # Per-source near and MID remain bit-identical to the base source
        # geometry across the FAR operation and native save/reopen.
        if (ROOT/lods[lod]['path']).read_bytes()!=(ROOT/base['lods'][lod]['path']).read_bytes():raise ValueError('Near/MID changed during FAR finalization')
    images=[]
    for material in bpy.data.materials:
        if material.get('materialKey')and material.library is None:raise ValueError('Photographic material lost shared library ownership')
        if material.node_tree:
            for node in material.node_tree.nodes:
                if node.type=='TEX_IMAGE'and node.image:
                    if not node.image.packed_file:raise ValueError('Native photograph is not packed in shared library')
                    images.append(node.image.name)
    intermediates=[digest(cache/name)for name in ['prepared.json','components.json','far-groups.json','far-fit.json','base.blend','lod0-base.glb','lod1-base.glb','lod2-base.glb']if(cache/name).exists()]
    result={'runId':run['id'],'sourceTreeId':source_id,'native':digest(native),'materialLibrary':digest(ROOT/run['native']/'materials.blend'),'lods':lods,'reopened':True,'cornerChecks':checks,'packedPhotographNames':sorted(set(images)),'sourceGeometryAudit':base['audit'],'sourcePreparationAudit':prepared['audit'],'intermediates':intermediates}
    if source['family']=='deciduous-broadleaf':result['farClusterEvidence']={key:fit[key]for key in ['runId','sourceTreeId','groupCount','file','counts','bankSha256']}
    if render_preview:
        preview(objects[0],cache/'native-preview.png');result['preview']=digest(cache/'native-preview.png')
    write_json(receipt,result);print('CATALOG_NATIVE_COMPLETE',source_id,flush=True)

if __name__=='__main__':
    run,args=arguments();ids=[p['sourceTreeId']for p in run['catalog']['placements']]if args['id']=='all'else[args['id']]
    known={p['sourceTreeId']for p in run['catalog']['placements']}
    for ident in ids:
        if ident not in known:raise ValueError('Unknown source ID')
        finalize_one(run,ident,args.get('preview')=='yes')
