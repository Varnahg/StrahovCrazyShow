"""Reopen every candidate LOD, original source mesh, map and camera framing."""
import sys,json,hashlib
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
from build import ROOT,CACHE,NATIVE,SOURCE,info,mesh_audit,positions,image_provenance,check_pins,set_view,surface_distances,branch_ranges,triangles,wood_lod,np,bpy
from bpy_extras.object_utils import world_to_camera_view
report=json.loads((CACHE/'report.json').read_text());plan=json.loads((CACHE/'plan.json').read_text());check_pins(plan)
assert info(NATIVE)==report['native']
bpy.ops.wm.open_mainfile(filepath=str(NATIVE))
scene=bpy.context.scene
assert scene.render.engine=='CYCLES'and scene.cycles.device=='CPU'and scene.render.threads==2
assert len([o for o in scene.objects if o.type=='MESH'])==18
for row in report['sourceObjects']+report['candidateObjects']:assert mesh_audit(bpy.data.objects[row['name']])==row
assert image_provenance()==report['packedImages']
for lod in range(3):
    for role in ('wood','foliage'):
        candidate=bpy.data.objects[f'R6 crown__lod{lod}__{role}'];original=bpy.data.objects[f'own-broadleaf__lod{lod}__{role}']
        assert list(candidate.data.materials)==list(original.data.materials)
        assert not candidate.data.has_custom_normals and not original.data.has_custom_normals
        for key in ('sourceRootXZ','trunkRadius','sourceTreeId','archetypeId'):
            a,b=candidate[key],original[key]
            assert (list(a)==list(b))if hasattr(a,'to_list')else a==b
        assert list(candidate.location)==[0,0,0]and list(candidate.scale)==[1,1,1]
distances=surface_distances([[.5,.5,3],[3,0,0],[1.5,1.5,0]],[[0,0,0],[2,0,0],[0,2,0]],[[0,1,2]])
assert np.allclose(distances,[3,1,np.sqrt(.5)],atol=1e-12,rtol=0)
# Exact closed native parent volume containment, independent of the build's
# conservative centreline/radius screen. Sum oriented triangle solid angles.
axes=json.loads((ROOT/plan['inputPins']['axes']['path']).read_text())['axes']
prepared=json.loads((ROOT/plan['inputPins']['wood']['path']).read_text())
profiles=[next(v for v in prepared['nearWood']if v['id']=='own-broadleaf'and v['candidateId']=='projection075')['branches'],wood_lod(axes,1)[0],wood_lod(axes,2)[0]]
containment=[]
for lod,branches in enumerate(profiles):
    mesh=bpy.data.objects[f'own-broadleaf__lod{lod}__wood'].data;ranges,_=branch_ranges(mesh,branches,lod);pos=positions(mesh)
    mesh.calc_loop_triangles();parent_triangles={}
    for parent_id in range(1,9):
        _,_,face_start,face_count=ranges[parent_id]
        parent_triangles[parent_id]=np.array([tuple(t.vertices)for t in mesh.loop_triangles if face_start<=t.polygon_index<face_start+face_count])
    for edit in plan['transforms']:
        if edit['id']not in ranges:continue
        start,count,face_start,face_count=ranges[edit['parentId']]
        tri=pos[parent_triangles[edit['parentId']]].astype(np.float64)-np.asarray(edit['targetAnchor'])
        a,b,c=tri[:,0],tri[:,1],tri[:,2];la,lb,lc=(np.linalg.norm(v,axis=1)for v in(a,b,c))
        determinant=np.sum(a*np.cross(b,c),axis=1)
        denominator=la*lb*lc+np.sum(a*b,axis=1)*lc+np.sum(b*c,axis=1)*la+np.sum(c*a,axis=1)*lb
        winding=float(np.sum(2*np.arctan2(determinant,denominator))/(4*np.pi))
        assert abs(abs(winding)-1)<1e-5,(lod,edit['id'],winding)
        containment.append({'lod':lod,'childId':edit['id'],'absoluteWinding':abs(winding)})
framing=[]
for degrees in (0,45):
    set_view(scene,degrees);bpy.context.view_layer.update()
    projection=scene.camera.calc_matrix_camera(bpy.context.evaluated_depsgraph_get(),x=scene.render.resolution_x,y=scene.render.resolution_y,scale_x=1,scale_y=1)
    for lod in range(3):
        for variant,prefix in [('control','own-broadleaf'),('candidate','R6 crown')]:
            bounds=[]
            for role in ('wood','foliage'):
                obj=bpy.data.objects[f'{prefix}__lod{lod}__{role}'];p=positions(obj.data)
                matrix=np.asarray(projection @ scene.camera.matrix_world.inverted() @ obj.matrix_world,dtype=np.float64)
                clip=np.column_stack([p,np.ones(len(p))]) @ matrix.T;projected=(clip[:,:2]/clip[:,3,None]+1)*.5
                # Cross-check vectorized projection against Blender's API.
                reference=world_to_camera_view(scene,scene.camera,obj.matrix_world @ obj.data.vertices[0].co)
                assert np.linalg.norm(projected[0]-[reference.x,reference.y])<1e-6
                bounds.append([projected.min(0),projected.max(0)])
            lo=np.minimum(bounds[0][0],bounds[1][0]);hi=np.maximum(bounds[0][1],bounds[1][1])
            assert np.all(lo>.005)and np.all(hi<.995),(variant,lod,degrees,lo,hi)
            framing.append({'variant':variant,'lod':lod,'degrees':degrees,'bounds':[lo.tolist(),hi.tolist()]})
near=bpy.data.objects['R6 crown__lod0__foliage'];mid=bpy.data.objects['R6 crown__lod1__foliage']
assert np.array_equal(positions(near.data).reshape(-1,6,3)[:,[0,1,5,4]],positions(mid.data).reshape(-1,4,3))
result={'nativeOpened':True,'sourceObjectsVerified':12,'candidateObjectsVerified':6,'packedImagesVerified':image_provenance(),
 'nearMidCornerParity':True,'sourceOriginsCollidersAndMaterialsUnchanged':True,'noStaleCustomNormals':True,'analyticSurfaceDistanceCases':3,
 'nativeParentVolumeContainment':containment,'framing':framing,'native':info(NATIVE)}
(CACHE/'native-readback.json').write_text(json.dumps(result,indent=2)+'\n')
print('R6_CROWN_READBACK_PASS',json.dumps({'sourceObjects':12,'candidateObjects':6,'images':len(report['packedImages']),'framingViews':len(framing)}))
