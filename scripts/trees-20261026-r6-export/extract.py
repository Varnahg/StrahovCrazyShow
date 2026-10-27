"""Lossless native corner data: no Blender glTF normal rounding, no source save."""
import sys,os,json,hashlib
from pathlib import Path
os.environ['OMP_NUM_THREADS']='2';sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/trees-20261026-r6'))
from native_common import mesh_audit,info,positions
import bpy
import numpy as np
CACHE=ROOT/'.cache/trees-r6-export-20261026'
SOURCE=ROOT/'assets/blender/vegetation/seasonal-r6-crown/r6-b5-crown-three-lods.blend'
EXPECTED='1c212a55abf286894c874cd1da1b8f20b0ba30a59d02317c4180ba4580ce596c'


def main():
    CACHE.mkdir(parents=True,exist_ok=True);assert info(SOURCE)['sha256']==EXPECTED
    report=json.loads((ROOT/'.cache/trees-r6-crown-20261026/report.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    for row in report['candidateObjects']+report['sourceObjects']:assert mesh_audit(bpy.data.objects[row['name']])==row
    chunks=[];views=[];accessors=[];nodes=[];meshes=[];audit=[];offset=0
    def append(array,kind,component_type,normalized=False,bounds=False):
        nonlocal offset
        raw=array.tobytes();index=len(accessors)
        views.append({'buffer':0,'byteOffset':offset,'byteLength':len(raw)})
        accessor={'bufferView':len(views)-1,'byteOffset':0,'componentType':component_type,'count':len(array),'type':kind}
        if normalized:accessor['normalized']=True
        if bounds:accessor.update(min=array.min(0).tolist(),max=array.max(0).tolist())
        accessors.append(accessor);pad=(4-len(raw)%4)%4;chunks.extend([raw,bytes(pad)]);offset+=len(raw)+pad
        return index
    for lod in range(3):
        for role in ('wood','foliage'):
            obj=bpy.data.objects[f'R6 crown__lod{lod}__{role}'];mesh=obj.data
            assert obj.parent is None and np.array_equal(np.asarray(obj.matrix_world),np.eye(4)) and not mesh.has_custom_normals
            mesh.calc_loop_triangles()
            loops=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',loops)
            tri_loops=np.empty(len(mesh.loop_triangles)*3,dtype=np.int32);mesh.loop_triangles.foreach_get('loops',tri_loops)
            normal=np.empty(len(mesh.loops)*3,dtype=np.float32);mesh.corner_normals.foreach_get('vector',normal);normal=normal.reshape(-1,3)
            uv=np.empty(len(mesh.loops)*2,dtype=np.float32);mesh.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
            p=positions(mesh)[loops];p=p[:,[0,2,1]].copy();p[:,2]*=-1
            n=normal[:,[0,2,1]].copy();n[:,2]*=-1
            uv[:,1]=np.float32(1)-uv[:,1]
            assert np.isfinite(p).all()and np.isfinite(n).all()and np.isfinite(uv).all()
            normal_error=float(np.max(np.abs(np.linalg.norm(n,axis=1)-1)));assert normal_error<2e-6
            dtype=[('position','<f4',(3,)),('normal','<f4',(3,)),('uv','<f4',(2,))]
            if role=='foliage':dtype.append(('color','<u2',(4,)))
            records=np.empty(len(loops),dtype=np.dtype(dtype));records['position']=p;records['normal']=n;records['uv']=uv
            rank_values=None
            if role=='foliage':
                colors=np.empty(len(mesh.vertices)*4,dtype=np.float32);mesh.color_attributes.active_color.data.foreach_get('color',colors);colors=colors.reshape(-1,4)
                assert np.all(colors[:,:3]==1)
                encoded=np.floor(colors*np.float32(65535)+np.float32(.5)).astype(np.uint16)
                assert np.all((encoded[:,3]>=1)&(encoded[:,3]<=65534))
                records['color']=encoded[loops];rank_values=np.unique(encoded[:,3])
            # Bitwise record dedup preserves even signed zero and distinct raw
            # normals. Triangle order and winding remain native loop order.
            _,first,inverse=np.unique(records.view(np.dtype((np.void,records.dtype.itemsize))).reshape(-1),return_index=True,return_inverse=True)
            unique=records[first];indices=inverse[tri_loops].astype(np.uint16 if len(unique)<=65535 else np.uint32)
            attrs={'POSITION':append(unique['position'].copy(),'VEC3',5126,bounds=True),'NORMAL':append(unique['normal'].copy(),'VEC3',5126),'TEXCOORD_0':append(unique['uv'].copy(),'VEC2',5126)}
            if role=='foliage':attrs['COLOR_0']=append(unique['color'].copy(),'VEC4',5123,normalized=True)
            index_accessor=append(indices,'SCALAR',5123 if indices.dtype==np.uint16 else 5125)
            name=f'own-broadleaf__lod{lod}__{role}'
            extras={key:(list(value)if hasattr(value,'to_list')else value)for key,value in obj.items()if key in ('archetypeId','sourceTreeId','sourceRootXZ','trunkRadius','lod','role','materialKey','rankEncoding','componentCount','photographicPartCount','botanicalSpecies')}
            nodes.append({'name':name,'mesh':len(meshes),'extras':extras});meshes.append({'name':name,'primitives':[{'attributes':attrs,'indices':index_accessor,'mode':4}]})
            expanded={field:hashlib.sha256(records[field][tri_loops].tobytes()).hexdigest()for field in records.dtype.names}
            if role=='foliage':
                triangle_ranks=unique['color'][indices,3].reshape(-1,3);assert np.all(triangle_ranks==triangle_ranks[:,:1])and np.all(np.diff(triangle_ranks[:,0].astype(np.int32))>=0)
            audit.append({'name':name,'nativeObject':obj.name,'nativeVertices':len(mesh.vertices),'vertices':len(unique),'triangles':len(indices)//3,
              'ranks':len(rank_values)if rank_values is not None else None,'nativeBoundsBlender':mesh_audit(obj)['bounds'],'gltfBounds':[p.min(0).tolist(),p.max(0).tolist()],
              'nativeLoopTriangles':len(mesh.loop_triangles),'expandedAttributeSha256':expanded,'maximumNativeNormalLengthError':normal_error})
    binary=b''.join(chunks)
    gltf={'asset':{'version':'2.0','generator':'Strahov R6 exact native corners; Blender 5.2.2 CPU'},'scene':0,'scenes':[{'nodes':list(range(6))}],
          'nodes':nodes,'meshes':meshes,'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(binary)}]}
    (CACHE/'native-geometry.bin').write_bytes(binary);(CACHE/'native-gltf.json').write_text(json.dumps(gltf,separators=(',',':'))+'\n')
    images=[{'name':i.name,'sha256':hashlib.sha256(bytes(i.packed_file.data)).hexdigest(),'bytes':i.packed_file.size,'size':list(i.size)}for i in bpy.data.images if i.source=='FILE'and i.users>0]
    assert images==report['packedImages']
    out={'source':info(SOURCE),'generator':info(Path(__file__)),'geometryBin':info(CACHE/'native-geometry.bin'),'geometryJson':info(CACHE/'native-gltf.json'),
      'coordinateConversion':'position/normal [x,z,-y], UV [u,1-v], determinant +1, native triangle order unchanged','normalPolicy':'Raw native Float32 corner normals, no rounding or renormalization',
      'rankPolicy':'native FLOAT_COLOR -> round(alpha*65535), uint16 normalized; RGB white; no 8bit conversion','meshes':audit,'packedImages':images}
    (CACHE/'native-extraction.json').write_text(json.dumps(out,indent=2)+'\n');assert info(SOURCE)['sha256']==EXPECTED
    print('R6_NATIVE_EXTRACT_COMPLETE',json.dumps({'binBytes':len(binary),'meshes':len(meshes),'images':len(images)}))


if __name__=='__main__':main()
