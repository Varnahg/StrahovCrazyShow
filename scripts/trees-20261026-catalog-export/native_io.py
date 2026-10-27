"""Owned Blender IO and lossless ordered-corner GLB export."""
import os,sys,json,hashlib,struct,math
from pathlib import Path
os.environ['OMP_NUM_THREADS']='2';sys.dont_write_bytecode=True
import bpy
import numpy as np
ROOT=Path(__file__).resolve().parents[2]

def digest(path):
    path=Path(path);raw=path.read_bytes();return {'path':path.relative_to(ROOT).as_posix(),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
def read(relative):return json.loads((ROOT/relative).read_text(encoding='utf8'))
def write_json(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);raw=(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
    if path.exists():
        if path.read_bytes()!=raw:raise ValueError('Existing result differs '+str(path))
    else:
        temporary=Path(str(path)+'.partial');temporary.write_bytes(raw);temporary.rename(path)
    return digest(path)
def arguments():
    args=sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[];values={}
    for a in args:
        if not a.startswith('--')or'='not in a:raise ValueError('Use --run= and --id=')
        key,value=a[2:].split('=',1);values[key]=value
    if not values.get('run')or not values.get('id'):raise ValueError('Missing run/source')
    manifest=(ROOT/values['run']).resolve();allowed=(ROOT/'.cache/trees-catalog-export-20261026/runs').resolve()
    if allowed not in manifest.parents or manifest.name!='run.json':raise ValueError('Run outside task')
    run=json.loads(manifest.read_text());
    if run.get('version')!=1 or not __import__('re').fullmatch('[a-f0-9]{16}',run.get('id','')):raise ValueError('Invalid run identity')
    for key,prefix in [('cache','.cache/trees-catalog-export-20261026/runs/'),('native','assets/blender/vegetation/seasonal-catalog/'),('public','public/models/vegetation/seasonal-catalog/')]:
        if run[key]!=prefix+run['id']:raise ValueError('Run output scope mismatch')
    for pin in run['recipe']['inputs']+run['recipe']['code']:
        if digest(ROOT/pin['path'])!=pin:raise ValueError('Changed run input '+pin['path'])
    if run['catalog']!=read('.cache/trees-catalog-20261026/source-plan.json'):raise ValueError('Run catalogue differs from pinned source plan')
    return run,values
def make_mesh(name,geometry,material,extras):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(geometry['positions'],[],geometry['faces']);mesh.update();uv=mesh.uv_layers.new(name='sourceUV')
    for loop in mesh.loops:uv.data[loop.index].uv=geometry['loopUvs'][loop.index]if'loopUvs'in geometry else geometry['uvs'][loop.vertex_index]
    if'ranks'in geometry:
        colors=mesh.color_attributes.new(name='seasonDropRank',type='FLOAT_COLOR',domain='POINT')
        colors.data.foreach_set('color',np.asarray([[1,1,1,r/65535]for r in geometry['ranks']],dtype=np.float32).reshape(-1));mesh.color_attributes.active_color=colors;mesh.color_attributes.render_color_index=0
    for poly in mesh.polygons:poly.use_smooth=True
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(material)
    for k,v in extras.items():obj[k]=v
    return obj
def extras(prepared,lod,role):
    source=prepared['source'];return {'archetypeId':prepared['prototypeId'],'sourceTreeId':source['sourceTreeId'],'sourceRootXZ':source['sourceRootXZ'],'trunkRadius':source['dimensions']['trunkRadius'],
      'lod':lod,'role':role,'materialKey':'Bark012'if role=='wood'else'fir_tree_01'if source['family']=='evergreen-conifer'else'LeafSet024','botanicalSpecies':'unknown'}
def mesh_records(obj):
    mesh=obj.data;mesh.calc_loop_triangles();loops=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',loops)
    tri_loops=np.empty(len(mesh.loop_triangles)*3,dtype=np.int32);mesh.loop_triangles.foreach_get('loops',tri_loops)
    p=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',p);p=p.reshape(-1,3)[loops]
    n=np.empty(len(mesh.loops)*3,dtype=np.float32);mesh.corner_normals.foreach_get('vector',n);n=n.reshape(-1,3)
    uv=np.empty(len(mesh.loops)*2,dtype=np.float32);mesh.uv_layers.active.data.foreach_get('uv',uv);uv=uv.reshape(-1,2)
    p=p[:,[0,2,1]].copy();p[:,2]*=-1;n=n[:,[0,2,1]].copy();n[:,2]*=-1;uv[:,1]=np.float32(1)-uv[:,1]
    dtype=[('POSITION','<f4',(3,)),('NORMAL','<f4',(3,)),('TEXCOORD_0','<f4',(2,))];foliage=obj.get('role')in('foliage','far-cards')
    if foliage:dtype.append(('COLOR_0','<u2',(4,)))
    records=np.empty(len(loops),dtype=np.dtype(dtype));records['POSITION']=p;records['NORMAL']=n;records['TEXCOORD_0']=uv
    if foliage:
        c=np.empty(len(mesh.vertices)*4,dtype=np.float32);mesh.color_attributes.active_color.data.foreach_get('color',c);c=c.reshape(-1,4)
        if not np.all(c[:,:3]==1):raise ValueError('Nonwhite foliage RGB')
        encoded=np.floor(c*np.float32(65535)+np.float32(.5)).astype(np.uint16)
        if not np.all((encoded[:,3]>=1)&(encoded[:,3]<=65534)):raise ValueError('Invalid ranks')
        records['COLOR_0']=encoded[loops]
    if not np.isfinite(p).all()or not np.isfinite(n).all()or not np.isfinite(uv).all():raise ValueError('Nonfinite native attributes')
    return records,tri_loops
def export_glb(objects,path):
    chunks=[];views=[];accessors=[];meshes=[];nodes=[];offset=0;audits=[]
    def append(array,kind,component,normalized=False):
        nonlocal offset
        raw=array.tobytes();view=len(views);index=len(accessors);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(raw)})
        a={'bufferView':view,'byteOffset':0,'componentType':component,'count':len(array),'type':kind}
        if normalized:a['normalized']=True
        accessors.append(a);padding=(4-len(raw)%4)%4;chunks.extend([raw,bytes(padding)]);offset+=len(raw)+padding;return index
    for obj in objects:
        records,tri_loops=mesh_records(obj);_,first,inverse=np.unique(records.view(np.dtype((np.void,records.dtype.itemsize))).reshape(-1),return_index=True,return_inverse=True)
        unique=records[first];indices=inverse[tri_loops].astype(np.uint16 if len(unique)<=65535 else np.uint32);attrs={}
        for name in records.dtype.names:
            size=unique[name].shape[1];attrs[name]=append(unique[name].copy(),'VEC'+str(size),5123 if name=='COLOR_0' else 5126,name=='COLOR_0')
            if name=='POSITION':accessors[attrs[name]].update(min=unique[name].min(0).tolist(),max=unique[name].max(0).tolist())
        index=append(indices,'SCALAR',5123 if indices.dtype==np.uint16 else 5125)
        extra={k:(list(v)if hasattr(v,'to_list')else v)for k,v in obj.items()if k in('archetypeId','sourceTreeId','sourceRootXZ','trunkRadius','lod','role','materialKey','botanicalSpecies')}
        nodes.append({'name':obj.name,'mesh':len(meshes),'extras':extra});meshes.append({'name':obj.name,'primitives':[{'attributes':attrs,'indices':index,'mode':4}]})
        audits.append({'name':obj.name,'vertices':len(unique),'triangles':len(indices)//3,'expandedNativeHashes':{k:hashlib.sha256(records[k][tri_loops].tobytes()).hexdigest()for k in records.dtype.names}})
    binary=b''.join(chunks);gltf={'asset':{'version':'2.0','generator':'Strahov catalogue exact native corners'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(binary)}]}
    text=json.dumps(gltf,separators=(',',':')).encode();text+=b' '*((-len(text))%4);raw=struct.pack('<IIIII',0x46546c67,2,28+len(text)+len(binary),len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists()and path.read_bytes()!=raw:raise ValueError('Existing GLB differs '+str(path))
    if not path.exists():path.write_bytes(raw)
    return {**digest(path),'meshes':audits}
def verify_glb(objects,path):
    raw=Path(path).read_bytes();n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);binary=raw[28+n:];rows=[]
    def accessor(index):
        a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.frombuffer(binary,dtype={5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']],offset=v['byteOffset']+a.get('byteOffset',0),count=a['count']*size).reshape(-1,size)
    for obj in objects:
        record,corners=mesh_records(obj);node=next(n for n in g['nodes']if n['name']==obj.name);p=g['meshes'][node['mesh']]['primitives'][0];indices=accessor(p['indices']).reshape(-1)
        for key in record.dtype.names:
            if accessor(p['attributes'][key])[indices].tobytes()!=record[key][corners].tobytes():raise ValueError('Native corner mismatch '+obj.name+'/'+key)
        rows.append({'name':obj.name,'triangles':len(indices)//3,'nativeCornersBitwiseIdentical':True})
    return rows
