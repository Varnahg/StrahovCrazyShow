"""Index-only cleanup of derived GLB triangles. Original attribute/image bytes stay intact."""
import json, struct, hashlib

def remove_glb_degenerates(path, epsilon=1e-12):
    blob=path.read_bytes()
    length=struct.unpack_from('<I',blob,12)[0]
    spec=json.loads(blob[20:20+length])
    binary=bytearray(blob[20+length+8:])
    widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
    formats={5121:'B',5123:'H',5125:'I',5126:'f'}
    def accessor(index):
        a=spec['accessors'][index];v=spec['bufferViews'][a['bufferView']]
        form=formats[a['componentType']];size=struct.calcsize('<'+form)
        width=widths[a['type']];stride=v.get('byteStride',size*width)
        start=v.get('byteOffset',0)+a.get('byteOffset',0)
        return a,lambda i:struct.unpack_from('<'+form*width,binary,start+i*stride),start,stride,form
    def attribute_bytes():
        ids={index for mesh in spec['meshes'] for p in mesh['primitives'] for index in p['attributes'].values()}
        return [b''.join(struct.pack('<'+formats[spec['accessors'][i]['componentType']]*widths[spec['accessors'][i]['type']],*accessor(i)[1](row)) for row in range(spec['accessors'][i]['count'])) for i in sorted(ids)]
    attributes_before=attribute_bytes()
    image_bytes_before=[bytes(binary[spec['bufferViews'][im['bufferView']].get('byteOffset',0):spec['bufferViews'][im['bufferView']].get('byteOffset',0)+spec['bufferViews'][im['bufferView']]['byteLength']]) for im in spec.get('images',[]) if 'bufferView' in im]
    kept_before=hashlib.sha256();kept_after=hashlib.sha256();removed=0;triangles_before=0;triangles_after=0
    for mesh in spec['meshes']:
        for p in mesh['primitives']:
            assert p.get('mode',4)==4
            positions=accessor(p['attributes']['POSITION'])[1]
            indices,get_index,start,stride,form=accessor(p['indices'])
            kept=[]
            for row in range(0,indices['count'],3):
                ids=[get_index(row+i)[0] for i in range(3)]
                a,b,c=[positions(i) for i in ids]
                u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
                cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                triangles_before+=1
                if all(abs(value)<epsilon for value in cross):
                    removed+=1;continue
                kept.extend(ids)
                kept_before.update(struct.pack('<9f',*(a+b+c)))
            assert kept,'Cannot silently retain an empty glTF primitive'
            assert sum(a.get('bufferView')==indices['bufferView'] for a in spec['accessors'])==1
            for row,value in enumerate(kept):struct.pack_into('<'+form,binary,start+row*stride,value)
            indices['count']=len(kept)
            if 'min' in indices:indices['min']=[min(kept)]
            if 'max' in indices:indices['max']=[max(kept)]
            triangles_after+=len(kept)//3
            for row in range(0,len(kept),3):
                triangle=[positions(i) for i in kept[row:row+3]]
                kept_after.update(struct.pack('<9f',*(triangle[0]+triangle[1]+triangle[2])))
    assert attributes_before==attribute_bytes(),'Repair changed original vertex/normal/UV/color bytes'
    assert kept_before.digest()==kept_after.digest(),'Repair changed a nondegenerate triangle'
    for index,image in enumerate(im for im in spec.get('images',[]) if 'bufferView' in im):
        view=spec['bufferViews'][image['bufferView']];assert image_bytes_before[index]==bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
    encoded=json.dumps(spec,separators=(',',':')).encode('utf-8');encoded+=b' '*(-len(encoded)%4)
    output=struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(binary))
    output+=struct.pack('<II',len(encoded),0x4e4f534a)+encoded
    output+=struct.pack('<II',len(binary),0x004e4942)+binary
    path.write_bytes(output)
    return {'beforeTriangles':triangles_before,'afterTriangles':triangles_after,'removedZeroAreaTriangles':removed,
            'nondegenerateTriangleSha256':kept_after.hexdigest(),'attributeBytesUnchanged':True,'imageBytesUnchanged':True}

def remove_blender_degenerate_faces(mesh, epsilon=1e-12):
    import bmesh
    bm=bmesh.new();bm.from_mesh(mesh)
    doomed=[face for face in bm.faces if face.calc_area()<epsilon/2]
    if doomed:bmesh.ops.delete(bm,geom=doomed,context='FACES_ONLY')
    bm.to_mesh(mesh);bm.free();mesh.update()
    return len(doomed)
