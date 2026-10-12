"""Offline repair of one source-identified far lip; no file mutation on import."""
import numpy as np
import json,subprocess,shutil
FIELD={'BOOLEAN':'value','INT':'value','INT16_2D':'value','INT32_2D':'value','FLOAT':'value','FLOAT2':'vector','FLOAT_VECTOR':'vector','FLOAT_COLOR':'color','BYTE_COLOR':'color_srgb'}
TOPOLOGY={'position','.edge_verts','.corner_vert','.corner_edge'}
def vals(a):
    result=[]
    for item in a.data:
        v=getattr(item,FIELD[a.data_type]);result.append(tuple(v) if hasattr(v,'__iter__') and not isinstance(v,str) else v)
    return result
def key(pos,uv):return tuple(round(v,6) for v in [*pos,*uv])
def exported_normal(n):
    a=np.round(np.asarray([n[0],n[2],-n[1]],dtype=np.float32),4);return a/np.linalg.norm(a)
def capture_source_lip(mesh,recipe):
    lookup={}
    for loop in mesh.loops:
        p=tuple(mesh.vertices[loop.vertex_index].co);uv=tuple(mesh.uv_layers.active.data[loop.index].uv);n=tuple(mesh.corner_normals[loop.index].vector)
        lookup.setdefault(key(p,uv),[]).append((p,uv,n))
    result=[];maximum=0
    for p,uv,n in zip(recipe['positions'],recipe['uv'],recipe['normals']):
        candidates=lookup.get(key((p[0],-p[2],p[1]),(uv[0],1-uv[1])),[])
        if not candidates:raise RuntimeError('Near source corner not found '+repr(p))
        best=min(candidates,key=lambda c:float(np.linalg.norm(exported_normal(c[2])-np.asarray(n))))
        error=float(np.linalg.norm(exported_normal(best[2])-np.asarray(n)));maximum=max(maximum,error)
        if error>2e-7:raise RuntimeError('Near export normal correspondence drift '+str(error))
        result.append(best)
    return {'recipe':recipe,'corners':result,'normalMatchMaximumError':maximum}
def repair_far_fold(obj,capture):
    import bpy
    source_corners=capture['corners'];recipe=capture['recipe']
    old=obj.data
    import hashlib,struct
    if old.users!=1 or old.shape_keys or len(obj.vertex_groups):raise RuntimeError('Expected unshared rigid paint mesh')
    if old.uv_layers.active is None or len(old.uv_layers)!=1:raise RuntimeError('Expected the reviewed single source UV layer')
    if len(old.polygons)!=1815:raise RuntimeError('Far paint polygon count changed')
    buffer=[]
    for face in range(830,959):
        corners=[tuple(old.vertices[i].co) for i in old.polygons[face].vertices]
        if len(corners)!=3:raise RuntimeError('Far lip triangle layout changed')
        cycle=min(tuple(v for p in corners[i:]+corners[:i] for v in p) for i in range(3))
        buffer.extend(cycle)
    if hashlib.sha256(struct.pack('<'+'f'*len(buffer),*buffer)).hexdigest()!='550ca379a5cecbf30dc318473023897ffb9b4e15dd970992b30ebd4fa7161809':raise RuntimeError('Far source lip geometry changed')
    positions=[tuple(v.co) for v in old.vertices];normals=[tuple(n.vector) for n in old.corner_normals]
    attributes={a.name:{'domain':a.domain,'type':a.data_type,'values':vals(a)} for a in old.attributes if a.name not in TOPOLOGY}
    removed=set(recipe['removedTriangles']);retained=[p for p in old.polygons if p.index not in removed]
    removed_vertices={v for p in old.polygons if p.index in removed for v in p.vertices}
    if any(v in removed_vertices for p in retained for v in p.vertices):raise RuntimeError('Source lip shares an outside vertex')
    # Source UV/normal seams remain per corner while geometric vertices weld.
    source_vertices={};source_map=[]
    for p,uv,n in source_corners:
        if p not in source_vertices:source_vertices[p]=len(positions);positions.append(p)
        source_map.append(source_vertices[p])
    faces=[tuple(p.vertices) for p in retained]+[tuple(source_map[i] for i in recipe['indices'][t:t+3]) for t in range(0,len(recipe['indices']),3)]
    origins=[i for p in retained for i in p.loop_indices]
    source_loop_ids=recipe['indices'];new_count=len(source_loop_ids)
    rebuilt=bpy.data.meshes.new(old.name+'.source-lip')
    try:
        rebuilt.from_pydata(positions,[],faces,shade_flat=False)
        old_edges={tuple(sorted(e.vertices)):e.index for e in old.edges}
        for name,a in attributes.items():
            if name=='custom_normal':continue
            target=rebuilt.attributes.get(name) or rebuilt.attributes.new(name,a['type'],a['domain'])
            for i,item in enumerate(target.data):
                if a['domain']=='CORNER':origin=origins[i] if i<len(origins) else None
                elif a['domain']=='POINT':origin=i if i<len(old.vertices) else None
                elif a['domain']=='FACE':origin=retained[i].index if i<len(retained) else None
                elif a['domain']=='EDGE':origin=old_edges.get(tuple(sorted(rebuilt.edges[i].vertices)))
                else:raise RuntimeError('Unreviewed domain '+a['domain'])
                if origin is not None:setattr(item,FIELD[a['type']],a['values'][origin])
        for material in old.materials:rebuilt.materials.append(material)
        for p,q in zip(rebuilt.polygons,retained):p.material_index=q.material_index;p.use_smooth=q.use_smooth
        for p in list(rebuilt.polygons)[len(retained):]:p.material_index=0;p.use_smooth=True
        for layer in old.uv_layers:
            target=rebuilt.uv_layers[layer.name];target.active_render=layer.active_render;target.active_clone=layer.active_clone
        rebuilt.uv_layers.active_index=old.uv_layers.active_index
        for i,source_id in enumerate(source_loop_ids):rebuilt.uv_layers.active.data[len(origins)+i].uv=source_corners[source_id][1]
        for name,value in old.items():rebuilt[name]=value
        if rebuilt.validate(verbose=True,clean_customdata=False):raise RuntimeError('Fresh source topology needed repair')
        desired=[normals[i] for i in origins]+[source_corners[i][2] for i in source_loop_ids]
        exact=rebuilt.attributes.new('custom_normal','FLOAT_VECTOR','CORNER');exact.data.foreach_set('vector',[v for n in desired for v in n]);rebuilt.update()
        decoded=[tuple(n.vector) for n in rebuilt.corner_normals]
        if decoded!=desired:raise RuntimeError('Decoded source normal drift')
        if [tuple(v.co) for v in rebuilt.vertices][:len(old.vertices)]!=[tuple(v.co) for v in old.vertices]:raise RuntimeError('Old position buffer changed')
        for i,origin in enumerate(origins):
            if rebuilt.loops[i].vertex_index!=old.loops[origin].vertex_index or tuple(rebuilt.uv_layers.active.data[i].uv)!=tuple(old.uv_layers.active.data[origin].uv):raise RuntimeError('Unrelated corner drift')
        name=old.name;obj.data=rebuilt;bpy.data.meshes.remove(old);rebuilt.name=name
        return {'removedPolygons':sorted(removed),'addedTriangles':new_count//3,'retainedCornerCount':len(origins),'sourceGeometricVertices':len(source_vertices),'decodedNormalMaximumError':0,'oldVertexBufferAndRetainedCornersExact':True,'normalStorage':'FLOAT_VECTOR/CORNER','method':'Complete isolated source lip rebuilt with welded geometric vertices, separate original UV/normal corners; original end caps retained'}
    except BaseException:
        if rebuilt.users==0:bpy.data.meshes.remove(rebuilt)
        raise

def load_source_recipe(root):
    node=shutil.which('node')
    if not node:raise RuntimeError('Node is required for source-corner matching')
    result=subprocess.run([node,str(root/'scripts/repair-car-far.mjs'),'--recipe'],cwd=str(root),capture_output=True,text=True,check=True)
    return json.loads(result.stdout)
