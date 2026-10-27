"""Transform only verified native B5 subtree vertices; no runtime export."""
import json
import math
import os
import sys
os.environ['OMP_NUM_THREADS'] = '2'
sys.dont_write_bytecode = True
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import bpy
import numpy as np
from native_common import ROOT, CACHE, SOURCE, SOURCE_SHA, NATIVE, info, positions, mesh_audit, studio, render, set_view


def transform(points, entry):
    return (np.asarray(points) - entry['sourceAnchor']) @ np.asarray(entry['rotation']).T + entry['targetAnchor']


def sample(points, t):
    p = t * (len(points) - 1); i = min(int(p), len(points) - 2); f = p - i
    return np.asarray(points[i]) * (1-f) + np.asarray(points[i+1]) * f


def native_ring_vertices(branch):
    points = np.asarray(branch['points']); out = []
    for i, point in enumerate(points):
        direction = points[min(i+1,len(points)-1)] - points[max(i-1,0)]
        direction /= np.linalg.norm(direction)
        side = np.cross(direction, [0,1,0] if abs(direction[1]) < .95 else [1,0,0]); side /= np.linalg.norm(side)
        up = np.cross(direction,side)
        out.extend(point + branch['radii'][i] * (side * math.cos(j*math.tau/branch['sides']) + up * math.sin(j*math.tau/branch['sides'])) for j in range(branch['sides']))
    return np.asarray(out)


def surface_distances(points, vertices, faces):
    """Float64 exact triangle/edge distances, independent of Blender's BVH."""
    triangles = np.asarray(vertices,dtype=np.float64)[np.asarray(faces)]
    p = np.asarray(points,dtype=np.float64)[:,None,:]
    a,b,c = (triangles[None,:,i,:] for i in range(3))
    distances=[]
    for first,last in ((a,b),(b,c),(c,a)):
        edge=last-first; t=np.clip(np.sum((p-first)*edge,axis=-1)/np.sum(edge*edge,axis=-1),0,1)
        distances.append(np.sum((p-first-t[:,:,None]*edge)**2,axis=-1))
    ab=b-a;ac=c-a;n=np.cross(ab,ac);n2=np.sum(n*n,axis=-1)
    signed=np.sum((p-a)*n,axis=-1);projected=p-signed[:,:,None]/n2[:,:,None]*n
    v=projected-a;aa=np.sum(ab*ab,axis=-1);bb=np.sum(ab*ac,axis=-1);cc=np.sum(ac*ac,axis=-1)
    va=np.sum(v*ab,axis=-1);vc=np.sum(v*ac,axis=-1);den=aa*cc-bb*bb
    s=(cc*va-bb*vc)/den;t=(aa*vc-bb*va)/den
    distances.append(np.where((s>=0)&(t>=0)&(s+t<=1),signed*signed/n2,np.inf))
    return np.sqrt(np.min(np.minimum.reduce(distances),axis=1))


def main():
    plan = json.loads((CACHE/'plan.json').read_text())
    for pin in plan['inputPins'].values(): assert info(ROOT/pin['path']) == pin
    assert info(SOURCE)['sha256'] == SOURCE_SHA
    axes = json.loads((ROOT/plan['inputPins']['axes']['path']).read_text())
    by_axis = {b['id']: b for b in axes['axes']}
    data = json.loads((ROOT/plan['inputPins']['wood']['path']).read_text())
    branches = next(v for v in data['nearWood'] if v['id']=='own-broadleaf' and v['candidateId']=='projection075')['branches']
    metadata = next(v for v in json.loads((ROOT/plan['inputPins']['metadata']['path']).read_text())['variants'] if v['id']=='own-broadleaf')['foliage']['componentMetadata']
    atlas = next(a for a in json.loads((ROOT/plan['inputPins']['atlas']['path']).read_text())['atlases'] if a['id']=='LeafSet024')
    components = {c['id']: c for c in atlas['components']}; parts = {p['id']:p for p in atlas['parts']}
    by_transform = {branch_id:t for t in plan['transforms'] for branch_id in t['branchIds']}
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    source_audits = [mesh_audit(o) for o in bpy.context.scene.objects if o.type=='MESH']
    packed = [{'name':i.name,'sha256':__import__('hashlib').sha256(bytes(i.packed_file.data)).hexdigest(),'bytes':i.packed_file.size,'size':list(i.size)} for i in bpy.data.images if i.source=='FILE' and i.users>0 and i.packed_file]
    source_objects = [bpy.data.objects['own-broadleaf__lod0__'+role] for role in ('wood','foliage')]
    collection = bpy.data.collections.new('R6 candidate — only branch 3 descendants'); bpy.context.scene.collection.children.link(collection)
    candidates = []
    for source in source_objects:
        obj = source.copy(); obj.data = source.data.copy(); obj.name = 'R6 candidate__'+source['role']
        collection.objects.link(obj); obj['r6CandidateOnly'] = True; obj['selectedOriginalBranchId'] = 3
        candidates.append(obj)
    wood, foliage = candidates
    wood_before = positions(wood.data); wood_after = wood_before.copy()
    branch_ranges = {}; vertex_offset = 0; face_offset = 0; max_source_wood_error = 0.
    for b in branches:
        count = len(b['points'])*b['sides']; faces = 2*(len(b['points'])-1)*b['sides']+2*(b['sides']-2)
        original = wood_before[vertex_offset:vertex_offset+count]
        assert len(original)==count
        error = np.linalg.norm(original-native_ring_vertices(b),axis=1).max()
        max_source_wood_error = max(max_source_wood_error,float(error)); assert error < 2e-6
        branch_ranges[b['id']] = (vertex_offset,count,face_offset,faces)
        if b['id'] in by_transform: wood_after[vertex_offset:vertex_offset+count] = transform(original,by_transform[b['id']])
        vertex_offset += count; face_offset += faces
    assert vertex_offset == len(wood_before) and face_offset==len(wood.data.polygons)
    wood.data.vertices.foreach_set('co',wood_after.reshape(-1)); wood.data.update()
    for t in plan['transforms']:
        ids = [i for bid in t['branchIds'] for i in range(branch_ranges[bid][0],sum(branch_ranges[bid][:2]))]
        wood.vertex_groups.new(name=f"original-branch-{t['id']}-group-{t['group']}").add(ids,1,'REPLACE')
    mesh=foliage.data; old=positions(mesh).reshape(-1,6,3); new=old.copy()
    assert len(old)==len(metadata)==82100
    colors=np.empty(len(mesh.vertices)*4,dtype=np.float32);mesh.color_attributes.active_color.data.foreach_get('color',colors)
    ranks=np.rint(colors.reshape(-1,6,4)[:,:,3]*65535).astype(np.int32)
    loop_indices=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',loop_indices)
    uv_loops=np.empty(len(mesh.loops)*2,dtype=np.float32);mesh.uv_layers.active.data.foreach_get('uv',uv_loops)
    uv=np.empty((len(mesh.vertices),2),dtype=np.float32);uv[loop_indices]=uv_loops.reshape(-1,2);uv=uv.reshape(-1,6,2)
    expected_uv={}
    for part_id,part in parts.items():
        hull=np.asarray(components[part['componentId']]['cutoutHullUvBlender']);lo=hull.min(0);hi=hull.max(0)
        expected_uv[part_id]=np.array([[x,y]for y in [lo[1],(lo[1]+hi[1])/2,hi[1]]for x in [lo[0],hi[0]]])
    grouped={}; moved=[]; max_anchor_error=0.
    for i,p in enumerate(metadata):
        assert np.all(ranks[i]==p['rank']) and np.max(np.abs(uv[i]-expected_uv[p['partId']]))<1e-7
        error=float(np.linalg.norm(np.array(p['anchor'])-sample(by_axis[p['branchId']]['points'],p['branchT'])))
        max_anchor_error=max(max_anchor_error,error);assert error<1e-10
        grouped.setdefault(p['branchId'],[]).append((i,p))
        if p['branchId'] in by_transform:
            t=by_transform[p['branchId']];new[i]=transform(old[i],t);moved.append(i)
    mesh.vertices.foreach_set('co',new.reshape(-1));mesh.update()
    for t in plan['transforms']:
        indices=[i*6+j for i,p in enumerate(metadata) if p['branchId'] in t['branchIds'] for j in range(6)]
        foliage.vertex_groups.new(name=f"original-branch-{t['id']}-group-{t['group']}").add(indices,1,'REPLACE')
    # Verify every moved anchor against its own actual native branch triangles,
    # before/after. This cannot accidentally accept another nearby branch.
    max_distance_delta=0.;max_distance=0.;max_threshold_ratio=0.;support_count=0
    for bid in by_transform:
        leaves=grouped.get(bid,[])
        if not leaves:continue
        start,count,face_start,face_count=branch_ranges[bid]
        faces=[tuple(i-start for i in p.vertices)for p in wood.data.polygons[face_start:face_start+face_count]]
        assert all(0<=i<count for face in faces for i in face)
        anchors=np.array([p['anchor']for _,p in leaves])
        before_distances=surface_distances(anchors,wood_before[start:start+count],faces)
        after_distances=surface_distances(transform(anchors,by_transform[bid]),wood_after[start:start+count],faces)
        for (_,p),d0,d1 in zip(leaves,before_distances,after_distances):
            threshold=max(.008,p['supportRadius']+.005)
            assert d1<=threshold and abs(d1-d0)<2e-6, (bid,p['rank'],d0,d1,threshold,abs(d1-d0))
            max_distance=max(max_distance,float(d1));max_distance_delta=max(max_distance_delta,float(abs(d1-d0)));max_threshold_ratio=max(max_threshold_ratio,float(d1/threshold));support_count+=1
    assert support_count==len(moved)==10256
    max_leaf_size_error=0.
    for a in range(6):
        for b in range(a+1,6):
            delta=np.abs(np.linalg.norm(new[moved,a]-new[moved,b],axis=1)-np.linalg.norm(old[moved,a]-old[moved,b],axis=1))
            max_leaf_size_error=max(max_leaf_size_error,float(delta.max()))
    assert max_leaf_size_error<2e-6
    unchanged=np.ones(len(old),dtype=bool);unchanged[moved]=False
    assert np.array_equal(new[unchanged],old[unchanged])
    junctions=[]
    for t in plan['transforms']:
        a=np.asarray(t['sourceAnchor']);b=np.asarray(t['targetAnchor'])
        assert np.linalg.norm(b-sample(by_axis[3]['points'],t['t']))<1e-10
        assert np.linalg.norm(transform(by_axis[t['id']]['points'][0],t)-b)<1e-10
        parent=next(x for x in branches if x['id']==3);params=np.asarray(parent['sourceParameters']);k=min(np.searchsorted(params,t['t'],side='right')-1,len(params)-2)
        f=(t['t']-params[k])/(params[k+1]-params[k]);native=np.asarray(parent['points'][k])*(1-f)+np.asarray(parent['points'][k+1])*f
        radius=parent['radii'][k]*(1-f)+parent['radii'][k+1]*f
        error=float(np.linalg.norm(b-native));assert error<radius*.1
        junctions.append({'id':t['id'],'targetT':t['t'],'targetAnchor':b.tolist(),'nativeParentCentreError':error,'nativeParentRadius':radius,'childBaseRadius':by_axis[t['id']]['radii'][0]})
    max_junction_error=0.
    for bid,t in by_transform.items():
        b=by_axis[bid]
        if b['parent']==3:continue
        error=float(np.linalg.norm(transform(b['points'][0],t)-transform(sample(by_axis[b['parent']]['points'],b['attachmentT']),t)))
        assert error<1e-8;max_junction_error=max(max_junction_error,error)
    # Native source geometry, materials and packed bytes stay in the file.
    for audit in source_audits: assert mesh_audit(bpy.data.objects[audit['name']])==audit
    audits=[mesh_audit(o)for o in candidates]
    for source,candidate in zip(source_objects,candidates):
        a,b=mesh_audit(source),mesh_audit(candidate)
        for field in ('vertices','polygons','triangles','topology','uv','colors','materials','origin'):assert a[field]==b[field]
    source_bounds=np.array([np.minimum(wood_before.min(0),old.reshape(-1,3).min(0)),np.maximum(wood_before.max(0),old.reshape(-1,3).max(0))])
    candidate_bounds=np.array([np.minimum(wood_after.min(0),new.reshape(-1,3).min(0)),np.maximum(wood_after.max(0),new.reshape(-1,3).max(0))])
    scene=studio()
    # Reuse already completed immutable control pixels after fixing audit-only
    # IDPropertyArray serialization; the original failed log remains evidence.
    controls=[]
    for degrees in (0,45):
        view=set_view(scene,degrees)
        for bare in (True,False):controls.append({**info(CACHE/f'control-{degrees:02d}-{"bare"if bare else "summer"}.png'),**view,'bare':bare,'variant':'control','provenance':'Native Blender authoring preview; rendered by native_common.py'})
    (CACHE/'control.json').write_text(json.dumps({'source':info(SOURCE),'objects':source_audits,'renders':controls},indent=2)+'\n')
    renders=[render(scene,candidates,'candidate',degrees,bare)for degrees in (0,45)for bare in (True,False)]
    for obj in candidates:obj.hide_render=False;obj.hide_set(False)
    for obj in source_objects:obj.hide_render=True;obj.hide_set(True)
    set_view(scene,0)
    for collection_item in bpy.data.collections:
        if collection_item!=collection:collection_item.hide_viewport=True
    provenance=bpy.data.texts.new('R6-plan-and-provenance.json');provenance.write(json.dumps(plan,indent=2))
    readme=bpy.data.texts.new('R6-README');readme.write('Native authoring experiment, NOT a game screenshot. Toggle R5 own-broadleaf / R6 candidate collections. Only candidate wood/foliage were copied. Vertex groups identify every transformed source subtree. Original atlas UV, rank values and materials are unchanged. No runtime GLB export. Botanical species unknown.')
    NATIVE.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(NATIVE),compress=True)
    report={'version':1,'source':info(SOURCE),'native':info(NATIVE),'plan':info(CACHE/'plan.json'),'generator':info(Path(__file__)),
      'sourceObjects':source_audits,'candidateObjects':audits,'packedImages':packed,'renders':renders,
      'validation':{'movedBranches':len(by_transform),'movedLeaves':len(moved),'unchangedLeaves':int(unchanged.sum()),'allSourceWoodMapped':len(wood_before),
        'maxNativeWoodReconstructionError':max_source_wood_error,'allLeafRankUvAnchorJoins':len(metadata),'maxOriginalAnchorError':max_anchor_error,
        'allMovedOwnBranchSupports':support_count,'maxMovedAnchorSurfaceDistance':max_distance,'maxSupportThresholdRatio':max_threshold_ratio,
        'maxBeforeAfterSupportDistanceDelta':max_distance_delta,'maxLeafPairwiseDistanceDelta':max_leaf_size_error,
        'maxDescendantJunctionError':max_junction_error,'directJunctions':junctions,'sourceBounds':source_bounds.tolist(),'candidateBounds':candidate_bounds.tolist(),
        'boundsDelta':(candidate_bounds-source_bounds).tolist(),'untouchedOriginalObjects':len(source_audits)},
      'render':{'engine':'Cycles CPU','threads':2,'samples':12,'size':[1100,900],'materials':'Original source material datablocks shared by control and candidate','light':'Same fixed studio softbox/background; not game lighting'},
      'limitations':['One branch experiment only. Whole-crown habitus and tone remain unaccepted.','Near native geometry only; candidate has no runtime LOD/GLB.','Structural capsule screen is not complete mesh intersection analysis.']}
    (CACHE/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    for pin in plan['inputPins'].values():assert info(ROOT/pin['path'])==pin
    print('R6_CANDIDATE_COMPLETE',flush=True)


if __name__=='__main__':main()
