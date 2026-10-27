"""Independent saved-file readback, source parity and framing verification."""
import hashlib
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).parent))
import bpy
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
from native_common import ROOT,CACHE,NATIVE,SOURCE,info,mesh_audit,set_view
from candidate import surface_distances

report=json.loads((CACHE/'report.json').read_text())
assert info(NATIVE)==report['native'] and info(SOURCE)==report['source']
triangle=[[0,0,0],[2,0,0],[0,2,0]]
distances=surface_distances([[.5,.5,3],[3,0,0],[1.5,1.5,0]],triangle,[[0,1,2]])
assert np.allclose(distances,[3,1,np.sqrt(.5)],atol=1e-12,rtol=0)
bpy.ops.wm.open_mainfile(filepath=str(NATIVE))
scene=bpy.context.scene
assert scene.render.engine=='CYCLES' and scene.cycles.device=='CPU' and scene.render.threads==2
for audit in report['sourceObjects']+report['candidateObjects']:
    assert mesh_audit(bpy.data.objects[audit['name']])==audit
assert len([o for o in scene.objects if o.type=='MESH'])==len(report['sourceObjects'])+2
images=[]
for i in bpy.data.images:
    if i.source=='FILE' and i.users>0:
        assert i.packed_file
        images.append({'name':i.name,'sha256':hashlib.sha256(bytes(i.packed_file.data)).hexdigest(),'bytes':i.packed_file.size,'size':list(i.size)})
assert images==report['packedImages']
for role in ('wood','foliage'):
    source=bpy.data.objects['own-broadleaf__lod0__'+role];candidate=bpy.data.objects['R6 candidate__'+role]
    assert list(source.data.materials)==list(candidate.data.materials)
    assert len(candidate.vertex_groups)==12
    assert list(candidate['sourceRootXZ'])==list(source['sourceRootXZ'])==[-67.59,-60.96]
    assert candidate['trunkRadius']==source['trunkRadius'] and abs(candidate['trunkRadius']-.484)<1e-12
    assert list(candidate.location)==[0,0,0] and list(candidate.scale)==[1,1,1]
framing=[]
for degrees in (0,45):
    set_view(scene,degrees);bpy.context.view_layer.update()
    for variant,names in [('control',['own-broadleaf__lod0__wood','own-broadleaf__lod0__foliage']),('candidate',['R6 candidate__wood','R6 candidate__foliage'])]:
        points=[world_to_camera_view(scene,scene.camera,bpy.data.objects[name].matrix_world @ v.co)for name in names for v in bpy.data.objects[name].data.vertices]
        bounds=[[min(p[i]for p in points)for i in range(2)],[max(p[i]for p in points)for i in range(2)]]
        assert all(v>.005 for v in bounds[0])and all(v<.995 for v in bounds[1]),(variant,degrees,bounds)
        framing.append({'variant':variant,'degrees':degrees,'normalizedBounds':bounds})
result={'nativeOpened':True,'originalObjectsUnchanged':len(report['sourceObjects']),
        'candidateObjectsVerified':2,'packedImagesByteIdentical':images,'sharedOriginalMaterials':True,
        'originsAndColliderPreserved':True,'editableNamedSubtreeVertexGroupsPerCandidateMesh':12,
        'surfaceDistanceAnalyticCases':3,'framing':framing,'native':info(NATIVE)}
(CACHE/'native-readback.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
