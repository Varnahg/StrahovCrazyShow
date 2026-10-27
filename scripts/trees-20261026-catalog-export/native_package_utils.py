"""Read-only signatures for native packages, including materials and used ranks."""
import hashlib,json
import bpy
import numpy as np
from native_io import mesh_records

def mesh_signatures(objects):
    result={}
    for obj in objects:
        records,corners=mesh_records(obj)
        result[obj.name]={key:hashlib.sha256(records[key][corners].tobytes()).hexdigest()for key in records.dtype.names}
    return result

def used_ranks(obj):
    records,corners=mesh_records(obj)
    return set(int(n)for n in np.unique(records['COLOR_0'][corners,3]))if'COLOR_0'in records.dtype.names else set()

def native_inventory(prototype_id):
    result={str(lod):[]for lod in range(3)}
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH'or obj.get('archetypeId')!=prototype_id:continue
        lod=obj.get('lod');role=obj.get('role')
        if lod not in range(3)or role not in('wood','foliage','far-cards'):raise ValueError('Unexpected packaged native object')
        obj.data.calc_loop_triangles();result[str(lod)].append({'name':obj.name,'role':role,'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles),'rankGroups':len(used_ranks(obj))})
    for row in result.values():row.sort(key=lambda r:r['name'])
    return result

def material_signatures(objects):
    image_cache={};material_cache={}
    def value(v):
        if v is None or isinstance(v,(bool,int,float,str)):return v
        try:return [value(n)for n in v]
        except TypeError:return type(v).__name__
    def graph(tree):
        nodes=[]
        for n in tree.nodes:
            row={'name':n.name,'type':n.bl_idname,'mute':n.mute,'inputs':[(s.identifier,value(getattr(s,'default_value',None)))for s in n.inputs],'outputs':[(s.identifier,value(getattr(s,'default_value',None)))for s in n.outputs]}
            for key in ['operation','blend_type','space','uv_map','interpolation','extension','projection','attribute_name','is_active_output']:
                if hasattr(n,key):row[key]=value(getattr(n,key))
            image=getattr(n,'image',None)
            if image:
                pointer=image.as_pointer()
                if pointer not in image_cache:
                    if not image.packed_file:raise ValueError('Native package has an unpacked photograph')
                    raw=bytes(image.packed_file.data);image_cache[pointer]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'colorSpace':image.colorspace_settings.name,'source':image.source}
                row['image']=image_cache[pointer]
            if getattr(n,'node_tree',None):row['nodeTree']=graph(n.node_tree)
            nodes.append(row)
        links=sorted((l.from_node.name,l.from_socket.identifier,l.to_node.name,l.to_socket.identifier)for l in tree.links)
        return {'nodes':sorted(nodes,key=lambda r:r['name']),'links':links}
    def material(m):
        pointer=m.as_pointer()
        if pointer not in material_cache:
            row={'useNodes':m.use_nodes,'diffuseColor':list(m.diffuse_color),'surfaceRenderMethod':getattr(m,'surface_render_method',None),'backfaceCulling':m.use_backface_culling,'graph':graph(m.node_tree)if m.node_tree else None}
            material_cache[pointer]=hashlib.sha256(json.dumps(row,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        return material_cache[pointer]
    return {obj.name:[material(m)for m in obj.data.materials]for obj in objects}
