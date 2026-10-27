"""Whole B5 crown in native Blender only; preserve source LOD membership."""
import os
import sys
import json
import hashlib
import math
from pathlib import Path
os.environ['OMP_NUM_THREADS']='2'
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/trees-20261026-r6'))
from native_common import info,positions,mesh_audit,studio,set_view,SOURCE
from candidate import transform,sample,native_ring_vertices,surface_distances
sys.path.insert(0,str(ROOT/'scripts/trees-20261025'))
from lod_geometry import wood_lod
import bpy
import numpy as np
CACHE=ROOT/'.cache/trees-r6-crown-20261026'
NATIVE=ROOT/'assets/blender/vegetation/seasonal-r6-crown/r6-b5-crown-three-lods.blend'


def image_provenance():
    result=[]
    for image in bpy.data.images:
        if image.source=='FILE' and image.users>0:
            assert image.packed_file
            result.append({'name':image.name,'sha256':hashlib.sha256(bytes(image.packed_file.data)).hexdigest(),'bytes':image.packed_file.size,'size':list(image.size)})
    return result


def check_pins(plan):
    for pin in plan['inputPins'].values():assert info(ROOT/pin['path'])==pin,pin['path']


def branch_ranges(mesh,branches,lod):
    original=positions(mesh);ranges={};v=0;f=0;maximum=0.
    for b in branches:
        count=len(b['points'])*b['sides']
        faces=(2*(len(b['points'])-1)*b['sides']+2*(b['sides']-2)) if lod==0 else (len(b['points'])-1)*b['sides']+2
        error=float(np.linalg.norm(original[v:v+count]-native_ring_vertices(b),axis=1).max())
        assert error<2e-6,(lod,b['id'],error);maximum=max(maximum,error)
        for poly in mesh.polygons[f:f+faces]:assert all(v<=i<v+count for i in poly.vertices)
        ranges[b['id']]=(v,count,f,faces);v+=count;f+=faces
    assert v==len(mesh.vertices) and f==len(mesh.polygons)
    return ranges,maximum


def source_parameters(branch,original,branches):
    if 'sourceParameters'in branch:return branch['sourceParameters']
    ts=sorted({i/(len(original['points'])-1)for i in range(len(original['points']))}|{float(child['attachmentT'])for child in branches if child['parent']==branch['id']})
    points=np.array([sample(original['points'],t)for t in ts]);result=[]
    for p in branch['points']:
        distances=np.linalg.norm(points-p,axis=1);i=int(np.argmin(distances));assert distances[i]<1e-9;result.append(ts[i])
    assert result==sorted(result)
    return result


def triangles(mesh,start,count,vertex_start):
    result=[]
    for poly in mesh.polygons[start:start+count]:
        ids=[i-vertex_start for i in poly.vertices]
        result.extend([ids[0],ids[i],ids[i+1]]for i in range(1,len(ids)-1))
    return result


def transform_wood(obj,branches,lod,by_transform,original_axes):
    ranges,error=branch_ranges(obj.data,branches,lod);old=positions(obj.data);new=old.copy();by_id={b['id']:b for b in branches}
    group_indices={t['id']:[]for t in by_transform.values()}
    for b in branches:
        start,count,_,_=ranges[b['id']]
        if b['id']in by_transform:
            t=by_transform[b['id']];new[start:start+count]=transform(old[start:start+count],t);group_indices[t['id']].extend(range(start,start+count))
        else:assert b['id']<=8
    obj.data.vertices.foreach_set('co',new.reshape(-1));obj.data.update()
    for ident,indices in group_indices.items():
        if indices:obj.vertex_groups.new(name=f'original-subtree-{ident}').add(indices,1,'REPLACE')
    junctions=[]
    for t in {v['id']:v for v in by_transform.values()}.values():
        if t['id']not in by_id:continue
        b=by_id[t['parentId']];ts=source_parameters(b,original_axes[b['id']],branches)
        k=min(int(np.searchsorted(ts,t['t'],side='right'))-1,len(ts)-2);f=(t['t']-ts[k])/(ts[k+1]-ts[k])
        centre=np.asarray(b['points'][k])*(1-f)+np.asarray(b['points'][k+1])*f
        radius=b['radii'][k]*(1-f)+b['radii'][k+1]*f;offset=float(np.linalg.norm(np.asarray(t['targetAnchor'])-centre))
        inscribed=radius*math.cos(math.pi/b['sides']);child_radius=by_id[t['id']]['radii'][0]
        # Parent polygon-tube conservative centreline screen. A positive
        # inscribed margin places the child root inside its actual support.
        assert offset<inscribed,(lod,t['id'],offset,inscribed)
        start,count,face_start,face_count=ranges[b['id']]
        dist=float(surface_distances([t['targetAnchor']],new[start:start+count],triangles(obj.data,face_start,face_count,start))[0])
        junctions.append({'childId':t['id'],'parentId':t['parentId'],'axisOffset':offset,'parentInscribedRadius':inscribed,'parentSurfaceDistance':dist,'childRadius':child_radius})
    for id in range(9):
        start,count,_,_=ranges[id];assert np.array_equal(old[start:start+count],new[start:start+count])
    return {'ranges':ranges,'old':old,'new':new,'branches':branches,'mappingMaximumError':error,'junctions':junctions}


def uv_templates(atlas):
    components={c['id']:c for c in atlas['components']};result={}
    for part in atlas['parts']:
        hull=np.asarray(components[part['componentId']]['cutoutHullUvBlender']);lo=hull.min(0);hi=hull.max(0)
        near=np.array([[x,y]for y in [lo[1],(lo[1]+hi[1])/2,hi[1]]for x in [lo[0],hi[0]]])
        result[part['id']]={6:near,4:near[[0,1,5,4]]}
    return result


def transform_foliage(obj,lod,metadata,templates,by_transform,wood):
    mesh=obj.data;stride=6 if lod==0 else 4;old=positions(mesh).reshape(-1,stride,3);new=old.copy()
    colors=np.empty(len(mesh.vertices)*4,dtype=np.float32);mesh.color_attributes.active_color.data.foreach_get('color',colors)
    ranks=np.rint(colors.reshape(-1,stride,4)[:,:,3]*65535).astype(np.int32);assert np.all(ranks==ranks[:,:1])
    loops=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',loops)
    loop_uv=np.empty(len(mesh.loops)*2,dtype=np.float32);mesh.uv_layers.active.data.foreach_get('uv',loop_uv)
    uv=np.empty((len(mesh.vertices),2),dtype=np.float32);uv[loops]=loop_uv.reshape(-1,2);uv=uv.reshape(-1,stride,2)
    by_rank={}
    for i,p in enumerate(metadata):by_rank.setdefault(p['rank'],[]).append((i,p))
    source_indices=[];parts_by_branch={};groups={}
    for i,rank in enumerate(ranks[:,0]):
        matched=[(index,p)for index,p in by_rank[int(rank)] if np.max(np.abs(uv[i]-templates[p['partId']][stride]))<1e-7]
        assert len(matched)==1,(lod,i,rank)
        index,p=matched[0];source_indices.append(index);t=by_transform[p['branchId']]
        new[i]=transform(old[i],t);parts_by_branch.setdefault(p['branchId'],[]).append(p)
        groups.setdefault(t['id'],[]).extend(range(i*stride,(i+1)*stride))
    assert len(set(source_indices))==len(source_indices)
    mesh.vertices.foreach_set('co',new.reshape(-1));mesh.update()
    for id,indices in groups.items():obj.vertex_groups.new(name=f'original-subtree-{id}').add(indices,1,'REPLACE')
    size_error=max(float(np.max(np.abs(np.linalg.norm(new[:,a]-new[:,b],axis=1)-np.linalg.norm(old[:,a]-old[:,b],axis=1))))for a in range(stride)for b in range(a+1,stride))
    assert size_error<5e-6
    support_count=0;missing=0;max_delta=0.;max_ratio=0.;max_distance=0.
    for bid,parts in parts_by_branch.items():
        if bid not in wood['ranges']:missing+=len(parts);continue
        start,count,face_start,face_count=wood['ranges'][bid];faces=triangles(wood['object'].data,face_start,face_count,start)
        anchors=np.array([p['anchor']for p in parts]);updated=transform(anchors,by_transform[bid])
        before=surface_distances(anchors,wood['old'][start:start+count],faces);after=surface_distances(updated,wood['new'][start:start+count],faces)
        delta=float(np.max(np.abs(after-before)));assert delta<5e-6,(lod,bid,delta);max_delta=max(max_delta,delta)
        thresholds=np.array([max(.008,p['supportRadius']+.005)for p in parts])
        # Only near has the source all-branch support budget. Lower wood LODs
        # retain their prior simplification, audited separately before/after.
        if lod==0:assert np.all(after<=thresholds)
        max_ratio=max(max_ratio,float(np.max(after/thresholds)));max_distance=max(max_distance,float(after.max()));support_count+=len(parts)
    return {'sourcePartIndices':source_indices,'old':old,'new':new,'parts':len(old),'ranks':len(set(ranks[:,0].tolist())),
      'maxPairDistanceError':size_error,'ownBranchSupportsTested':support_count,'sourceOwnBranchCulledParts':missing,
      'maxSupportDistanceDelta':max_delta,'maxSupportThresholdRatio':max_ratio,'maxSupportDistance':max_distance}


def render(scene,objects,variant,degrees,bare,lod=0):
    view=set_view(scene,degrees)
    for obj in objects:obj.hide_render=bare and obj.get('role')=='foliage'
    file=CACHE/f'{variant}-lod{lod}-{degrees:02d}-{"bare"if bare else "summer"}.png';scene.render.filepath=str(file)
    bpy.ops.render.render(write_still=True)
    for obj in objects:obj.hide_render=True
    return{**info(file),**view,'variant':variant,'bare':bare,'lod':lod,'provenance':'Native Blender CPU authoring preview; not game screenshot'}


def main():
    plan=json.loads((CACHE/'plan.json').read_text());check_pins(plan)
    axes=json.loads((ROOT/plan['inputPins']['axes']['path']).read_text());by_axis={b['id']:b for b in axes['axes']}
    prepared=json.loads((ROOT/plan['inputPins']['wood']['path']).read_text())
    near=next(v for v in prepared['nearWood']if v['id']=='own-broadleaf' and v['candidateId']=='projection075')['branches']
    profiles=[near,wood_lod(axes['axes'],1)[0],wood_lod(axes['axes'],2)[0]]
    by_transform={id:t for t in plan['transforms']for id in t['branchIds']}
    manifest=json.loads((ROOT/plan['inputPins']['metadata']['path']).read_text());source=next(v for v in manifest['variants']if v['id']=='own-broadleaf');metadata=source['foliage']['componentMetadata']
    atlas=next(a for a in json.loads((ROOT/plan['inputPins']['atlas']['path']).read_text())['atlases']if a['id']=='LeafSet024');templates=uv_templates(atlas)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));source_audits=[mesh_audit(o)for o in bpy.context.scene.objects if o.type=='MESH'];packed=image_provenance()
    collection=bpy.data.collections.new('R6 whole crown candidate');bpy.context.scene.collection.children.link(collection)
    candidates=[];lod_reports=[];foliages=[]
    for lod in range(3):
        objects=[]
        for role in ('wood','foliage'):
            old=bpy.data.objects[f'own-broadleaf__lod{lod}__{role}'];obj=old.copy();obj.data=old.data.copy();obj.name=f'R6 crown__lod{lod}__{role}';collection.objects.link(obj)
            obj['r6CrownCandidateOnly']=True;obj['sourceDelta']='.cache/trees-r6-crown-20261026/source-delta.json';objects.append(obj)
        wood=transform_wood(objects[0],profiles[lod],lod,by_transform,by_axis);wood['object']=objects[0]
        foliage=transform_foliage(objects[1],lod,metadata,templates,by_transform,wood);foliages.append(foliage)
        for role,obj in zip(('wood','foliage'),objects):
            a,b=mesh_audit(bpy.data.objects[f'own-broadleaf__lod{lod}__{role}']),mesh_audit(obj)
            for field in ('vertices','polygons','triangles','topology','uv','colors','materials','origin'):assert a[field]==b[field],(lod,role,field)
        candidates.append(objects)
        lod_reports.append({'lod':lod,'retainedOriginalWoodBranches':len(profiles[lod]),'sourceWoodMappingMaxError':wood['mappingMaximumError'],'junctions':wood['junctions'],
          'sourceBounds':[np.minimum(wood['old'].min(0),foliage['old'].reshape(-1,3).min(0)).tolist(),np.maximum(wood['old'].max(0),foliage['old'].reshape(-1,3).max(0)).tolist()],
          'candidateBounds':[np.minimum(wood['new'].min(0),foliage['new'].reshape(-1,3).min(0)).tolist(),np.maximum(wood['new'].max(0),foliage['new'].reshape(-1,3).max(0)).tolist()],
          'foliage':{k:v for k,v in foliage.items()if k not in ('old','new')}})
    assert foliages[0]['sourcePartIndices']==foliages[1]['sourcePartIndices']==list(range(82100))
    assert len(foliages[2]['sourcePartIndices'])==16383 and set(foliages[2]['sourcePartIndices']).issubset(foliages[0]['sourcePartIndices'])
    assert np.array_equal(foliages[1]['new'],foliages[0]['new'][:,[0,1,5,4]])
    updated=[{**p,'sourcePartIndex':i,'anchor':transform(p['anchor'],by_transform[p['branchId']]).tolist()}for i,p in enumerate(metadata)]
    updated_axes=json.loads((CACHE/'updated-axes.json').read_text());updated_by={b['id']:b for b in updated_axes['axes']}
    max_anchor=max(float(np.linalg.norm(np.asarray(p['anchor'])-sample(updated_by[p['branchId']]['points'],p['branchT'])))for p in updated)
    max_junction=max(float(np.linalg.norm(np.asarray(b['points'][0])-sample(updated_by[b['parent']]['points'],b['attachmentT'])))for b in updated_axes['axes']if b['parent']is not None)
    assert max_anchor<1e-10 and max_junction<1e-10
    delta={'version':1,'sourceTreeId':source['sourceTreeId'],'coordinateSpace':'root-local Blender Z-up','originalMetadata':plan['inputPins']['metadata'],
      'plan':info(CACHE/'plan.json'),'axes':info(CACHE/'updated-axes.json'),'leaves':updated,
      'lodSourceMembership':[{'lod':r['lod'],'sourcePartIndices':r['foliage']['sourcePartIndices']}for r in lod_reports]}
    (CACHE/'source-delta.json').write_text(json.dumps(delta)+'\n')
    scene=studio();renders=[]
    for degrees in (0,45):
        for variant,objects in [('control',[bpy.data.objects['own-broadleaf__lod0__'+role]for role in ('wood','foliage')]),('candidate',candidates[0])]:
            for bare in (True,False):renders.append(render(scene,objects,variant,degrees,bare))
    for lod in (1,2):
        for degrees in (0,45):renders.append(render(scene,candidates[lod],'candidate',degrees,False,lod))
    for audit in source_audits:assert mesh_audit(bpy.data.objects[audit['name']])==audit
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':obj.hide_set(obj not in candidates[0]);obj.hide_render=obj not in candidates[0]
    for other in bpy.data.collections:other.hide_viewport=other!=collection
    set_view(scene,0)
    text=bpy.data.texts.new('R6 crown transform provenance.json');text.write(json.dumps(plan,indent=2))
    readme=bpy.data.texts.new('R6 crown README');readme.write('Native authoring preview, not game screenshot. Candidate has 3 LODs; show exactly one pair. Original R5 objects remain unchanged. Near and MID retain all82,100 source leaves; FAR retains original16,383 subset. Main axes0–8/root/collider unchanged.96 named original subtree groups preserve editable source identity. Full updated axes and leaf anchors are in source-delta.json; no runtime export.')
    NATIVE.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE),compress=True)
    report={'version':1,'source':info(SOURCE),'native':info(NATIVE),'generator':info(Path(__file__)),'plan':info(CACHE/'plan.json'),'sourceDelta':info(CACHE/'source-delta.json'),
      'sourceObjects':source_audits,'candidateObjects':[mesh_audit(o)for pair in candidates for o in pair],'packedImages':packed,'lods':lod_reports,
      'allUpdatedLeafAnchorError':max_anchor,'allUpdatedBranchJunctionError':max_junction,'renders':renders,
      'render':{'engine':'Cycles CPU','threads':2,'samples':12,'seed':62,'size':[1100,900],'sameSourceMaterialsAndStudioLighting':True},
      'limitations':['Generic authored crown; botanical species unknown.','FAR keeps original sparse source subset.','Lower wood LOD retains original pruning, so some leaf supporting twigs are absent exactly as in source.','Structural capsule audit is not exhaustive mesh self-intersection proof.','No runtime GLB or full-game/GPU acceptance.']}
    (CACHE/'report.json').write_text(json.dumps(report,indent=2)+'\n');check_pins(plan);assert image_provenance()==packed
    print('R6_CROWN_COMPLETE',flush=True)


if __name__=='__main__':main()
