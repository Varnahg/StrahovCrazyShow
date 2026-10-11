"""Local source-derived inner-shell repair. Importable by the car generator.
Only six loop vertex/UV/normal assignments in two coplanar polygons change.
This importable helper does not perform file IO.
"""
import json

# Blender coordinates (X, -gameZ, gameY), after the retained normalisation.
A=(.8053064346313477,-.664768397808075,.3073022663593292)
B=(.8053064346313477,.9763556718826294,.7302349805831909)
C=(.8053064346313477,1.3432865142822266,1.0204403400421143)
D=(.8053064346313477,.9522988200187683,.7246257066726685)
def key(p):return tuple(round(x,6) for x in p)
def face_key(points):return tuple(sorted(key(p) for p in points))
def repair_inner_shell(mesh):
    wanted=[face_key([A,C,B]),face_key([A,B,D])]
    found={}
    for p in mesh.polygons:
        if len(p.vertices)==3:
            k=face_key([mesh.vertices[i].co for i in p.vertices])
            if k in wanted:
                if k in found:raise RuntimeError('Ambiguous duplicate repair face')
                found[k]=p.index
    if len(found)!=2:raise RuntimeError('Reviewed source-derived shell patch not found exactly once')
    faces=[mesh.polygons[found[k]] for k in wanted]
    if faces[0].material_index!=faces[1].material_index:raise RuntimeError('Cross-material repair rejected')
    old_positions=[tuple(v.co) for v in mesh.vertices]
    old_indices=[l.vertex_index for l in mesh.loops]
    old_uv=[tuple(l.uv) for l in mesh.uv_layers.active.data]
    old_normals=[tuple(n.vector) for n in mesh.corner_normals]
    old_encoded_normals=[tuple(n.value) for n in mesh.attributes['custom_normal'].data]
    before_poly=len(mesh.polygons);mesh.calc_loop_triangles();before_tri=len(mesh.loop_triangles)
    loops=[list(p.loop_indices) for p in faces]
    by_position=[]
    for face in faces:
        by_position.append({key(mesh.vertices[mesh.loops[i].vertex_index].co):i for i in face.loop_indices})
    # Select precisely the same original corners as the canonical GLB index patch.
    source_loops=[by_position[0][key(C)],by_position[0][key(B)],by_position[1][key(D)],by_position[0][key(C)],by_position[1][key(D)],by_position[0][key(A)]]
    changed_loops=loops[0]+loops[1]
    for point in [A,B]:
        if old_uv[by_position[0][key(point)]]!=old_uv[by_position[1][key(point)]]:raise RuntimeError('UV seam crosses proposed diagonal')
    normals=list(old_normals)
    for dst,src in zip(changed_loops,source_loops):
        mesh.loops[dst].vertex_index=old_indices[src]
        mesh.uv_layers.active.data[dst].uv=old_uv[src]
        normals[dst]=old_normals[src]
    # Tag position-derived normal spaces explicitly after changing loop indices;
    # writing an identical coordinate array preserves every coordinate byte.
    mesh.vertices.foreach_set('co',[v for p in old_positions for v in p])
    mesh.update(calc_edges=True,calc_edges_loose=True)
    allowed=set(changed_loops)
    mesh.normals_split_custom_set(normals)
    # Only retain re-encoded custom values for the two genuinely non-planar
    # source corner normals. Zero is the exact geometric -X normal for the
    # other four corners; restoring unrelated packed values avoids whole-mesh
    # quantization drift from Blender's global setter.
    for i,value in enumerate(old_encoded_normals):
        if i not in allowed:mesh.attributes['custom_normal'].data[i].value=value
    for i in changed_loops:
        if normals[i][1]==0 and normals[i][2]==0:mesh.attributes['custom_normal'].data[i].value=(0,0)
    mesh.update()
    mesh.calc_loop_triangles()
    if mesh.validate(verbose=True):raise RuntimeError('Repaired master required structural validation repair')
    if old_positions!=[tuple(v.co) for v in mesh.vertices]:raise RuntimeError('Unexpected vertex displacement')
    if len(mesh.polygons)!=before_poly or len(mesh.loop_triangles)!=before_tri:raise RuntimeError('Triangle count changed')
    if any(mesh.loops[i].vertex_index!=old_indices[i] or tuple(mesh.uv_layers.active.data[i].uv)!=old_uv[i] for i in range(len(old_indices)) if i not in allowed):raise RuntimeError('Unrelated corner index/UV changed')
    if any(tuple(mesh.attributes['custom_normal'].data[i].value)!=old_encoded_normals[i] for i in range(len(old_indices)) if i not in allowed):raise RuntimeError('Unrelated packed normal changed')
    decoded=[tuple(n.vector) for n in mesh.corner_normals]
    normal_errors=[sum((decoded[i][j]-normals[i][j])**2 for j in range(3))**.5 for i in range(len(normals))]
    max_normal_error=max(normal_errors)
    if max_normal_error>.001:
        worst=sorted(range(len(normals)),key=lambda i:normal_errors[i],reverse=True)[:8]
        print(json.dumps({'normalError':max_normal_error,'worst':[{'loop':i,'expected':normals[i],'actual':decoded[i],'changed':i in allowed} for i in worst]},indent=2),flush=True)
        raise RuntimeError('Custom normal re-encoding exceeded conservative tolerance')
    unchanged_error=max(normal_errors[i] for i in range(len(normals)) if i not in allowed)
    if unchanged_error!=0:raise RuntimeError('Unrelated decoded normal changed')
    return {'polygons':[p.index for p in faces],'changedLoops':changed_loops,'newVertexIndices':[mesh.loops[i].vertex_index for i in changed_loops],'sourceCornerLoops':source_loops,'verticesUnchanged':True,'unrelatedCornerIndicesUVsAndPackedNormalsUnchanged':True,'polygonCount':before_poly,'triangles':before_tri,'customNormalReencodingMaxVectorError':max_normal_error,'unmodifiedCornersDecodedNormalMaxError':unchanged_error,'validationChanged':False}
