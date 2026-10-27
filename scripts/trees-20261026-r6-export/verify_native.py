"""Independent reopen: compare every indexed exported corner with native data."""
import os,sys,json,hashlib,struct
from pathlib import Path
os.environ['OMP_NUM_THREADS']='2';sys.dont_write_bytecode=True
import bpy
import numpy as np
ROOT=Path(__file__).resolve().parents[2];CACHE=ROOT/'.cache/trees-r6-export-20261026'
sys.path.insert(0,str(ROOT/'scripts/trees-20261026-r6'))
from native_common import info,mesh_audit
source=ROOT/'assets/blender/vegetation/seasonal-r6-crown/r6-b5-crown-three-lods.blend'
assert info(source)['sha256']=='1c212a55abf286894c874cd1da1b8f20b0ba30a59d02317c4180ba4580ce596c'
raw=(ROOT/'public/models/vegetation/seasonal-r6/own-broadleaf.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+length]);binary=raw[28+length:]
def accessor(index):
    a=gltf['accessors'][index];v=gltf['bufferViews'][a['bufferView']];components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    return np.frombuffer(binary,dtype={5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']],offset=v.get('byteOffset',0)+a.get('byteOffset',0),count=a['count']*components).reshape(-1,components)
bpy.ops.wm.open_mainfile(filepath=str(source));rows=[]
for lod in range(3):
    for role in ('wood','foliage'):
        obj=bpy.data.objects[f'R6 crown__lod{lod}__{role}'];m=obj.data;m.calc_loop_triangles();name=f'own-broadleaf__lod{lod}__{role}'
        node=next(n for n in gltf['nodes']if n['name']==name);primitive=gltf['meshes'][node['mesh']]['primitives'][0]
        indices=accessor(primitive['indices']).reshape(-1)
        loops=np.empty(len(m.loops),dtype=np.int32);m.loops.foreach_get('vertex_index',loops)
        source_corners=np.empty(len(m.loop_triangles)*3,dtype=np.int32);m.loop_triangles.foreach_get('loops',source_corners)
        vertex_ids=loops[source_corners]
        source_positions=np.empty(len(m.vertices)*3,dtype=np.float32);m.vertices.foreach_get('co',source_positions);source_positions=source_positions.reshape(-1,3)[vertex_ids]
        source_normals=np.empty(len(m.loops)*3,dtype=np.float32);m.corner_normals.foreach_get('vector',source_normals);source_normals=source_normals.reshape(-1,3)[source_corners]
        source_uv=np.empty(len(m.loops)*2,dtype=np.float32);m.uv_layers.active.data.foreach_get('uv',source_uv);source_uv=source_uv.reshape(-1,2)[source_corners]
        expected={}
        for semantic,data in [('POSITION',source_positions),('NORMAL',source_normals)]:
            converted=np.empty_like(data);converted[:,0]=data[:,0];converted[:,1]=data[:,2];converted[:,2]=-data[:,1];expected[semantic]=converted
        expected['TEXCOORD_0']=np.column_stack([source_uv[:,0],np.float32(1)-source_uv[:,1]])
        if role=='foliage':
            color=np.empty(len(m.vertices)*4,dtype=np.float32);m.color_attributes.active_color.data.foreach_get('color',color)
            expected['COLOR_0']=np.rint(color.reshape(-1,4)[vertex_ids]*np.float32(65535)).astype(np.uint16)
            a=gltf['accessors'][primitive['attributes']['COLOR_0']];assert a['componentType']==5123 and a['normalized']and a['type']=='VEC4'
        hashes={}
        for semantic,native in expected.items():
            decoded=accessor(primitive['attributes'][semantic])[indices]
            assert decoded.shape==native.shape and decoded.tobytes()==native.tobytes(),(name,semantic)
            hashes[semantic]=hashlib.sha256(decoded.tobytes()).hexdigest()
        assert len(indices)==len(source_corners)
        for key in ('sourceTreeId','archetypeId','lod','role','materialKey','trunkRadius'):
            assert node['extras'][key]==obj[key],(name,key)
        assert node['extras']['sourceRootXZ']==list(obj['sourceRootXZ'])
        for field in ('translation','rotation','scale','matrix'):assert field not in node
        # Ordered triangle corners prove winding, independent of index remap.
        rows.append({'name':name,'triangles':len(indices)//3,'expandedNativeBytesIdentical':hashes,'nativeWindingPreserved':True,'rawNativeNormalsPreserved':True})
report=json.loads((ROOT/'.cache/trees-r6-crown-20261026/report.json').read_text())
images=[{'name':i.name,'sha256':hashlib.sha256(bytes(i.packed_file.data)).hexdigest(),'bytes':i.packed_file.size,'size':list(i.size)}for i in bpy.data.images if i.source=='FILE'and i.users>0]
assert images==report['packedImages']
for row in report['candidateObjects']+report['sourceObjects']:assert mesh_audit(bpy.data.objects[row['name']])==row
result={'nativeReopened':True,'whole':info(ROOT/'public/models/vegetation/seasonal-r6/own-broadleaf.glb'),'native':info(source),'meshes':rows,'packedImagesUnchanged':images,'sourceObjectsUnchanged':18}
(CACHE/'native-roundtrip.json').write_text(json.dumps(result,indent=2)+'\n')
print('R6_NATIVE_ROUNDTRIP_PASS',len(rows),'meshes; ordered triangle corners bitwise identical')
