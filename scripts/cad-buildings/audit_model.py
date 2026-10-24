"""Znovu otevře skutečný Blender model a ověří jeho GLB a konstrukční export.

Volitelné QA rendery běží v Cycles výhradně na CPU; původní master se nemění.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix,Quaternion,Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree

sys.path.insert(0,str(Path(__file__).resolve().parent))
from model_io import oriented_triangle


def arguments():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test',action='store_true')
    parser.add_argument('--blend',type=Path)
    parser.add_argument('--glb',type=Path)
    parser.add_argument('--collision',type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--render-dir',type=Path)
    parser.add_argument('--render-floor',default='all',choices=['all','plans','overall','p01','n01','n02','n03','n04','interiors','roof-interior'])
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    if not args.self_test and not all([args.blend,args.glb,args.collision,args.output]):
        parser.error('Audit potřebuje --blend, --glb, --collision a --output')
    return args


def primitive_tests():
    source=Path(__file__).with_name('build_model.py')
    spec=importlib.util.spec_from_file_location('cad_build_model',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    geometry=module.Geometry([250,731])
    geometry.prism(('n01','probe-box','concrete',True),[250,731],[253,731],0.4,0,3.2)
    geometry.solid('n01', {'id':'clipped-wall-probe','role':'probe-clipped-wall','material':'plaster',
                          'bottom':0,'top':3,'ceilingPlane':[0.5,0,-124.5],
                          'triangles':[[[250,731],[254,731],[254,733]],[[250,731],[254,733],[250,733]]]})
    geometry.solid('n01', {'id':'clipped-wall-rounding-probe','role':'probe-rounded-wall','material':'plaster',
                          'bottom':1,'top':3,'ceilingPlane':[0.5,0.2,-257.3],
                          'triangles':[[[220,735],[224,735],[224,737]],[[220,735],[224,737],[220,737]]]})
    geometry.flight('n01','probe-flight',[250,731],[250,734.2],2,0,1.6,10)
    rounding_probe=module.Geometry([250,731]).flight('n03','rounding-probe',[250,731],[250,734.2],2,4.8,6.4)
    assert rounding_probe['steps']==10,'Float zaokrouhlení nesmí přidat jeden stupeň'
    geometry.door('n01',{'id':'offset-door','hinge':[250,731],'closedEnd':[251,731],'openEnd':[250,732],
                         'bottom':0,'top':2.1,'depth':0.12,'normalOffset':0.06})
    geometry.door('n02',{'id':'fixed-facade','hinge':[260,731],'closedEnd':[261,731],'openEnd':[260,732],
                         'bottom':3,'top':5.1,'depth':0.12,'normalOffset':0.06,
                         'openingClassification':'facade-opening-unconfirmed-access','accessConfirmed':False})
    geometry.window('n02',{'id':'high-wing-window','a':[265,731],'b':[266,731],
                           'bottom':3.3,'top':6.05,'lowerInfillHeight':0.75})
    root=bpy.data.objects.new('probe',None);bpy.context.scene.collection.objects.link(root)
    results=[]
    for obj in module.create_meshes(geometry,root):
        obj.data.calc_loop_triangles();volume=0
        for triangle in obj.data.loop_triangles:
            a,b,c=[obj.data.vertices[i].co for i in triangle.vertices]
            assert (b-a).cross(c-a).length>1e-10
            volume+=a.dot(b.cross(c))/6
        assert volume>0,(obj.name,'obrácené plochy')
        if obj['role']=='stair':assert abs(volume-1.792)<1e-5
        if obj['role']=='probe-box':assert abs(volume-3.84)<1e-5
        if obj['role']=='probe-clipped-wall':assert abs(volume-12)<1e-5
        if obj['role']=='door-frame':
            xs=[v.co.x for v in obj.data.vertices]
            assert abs(min(xs)+0.12)<1e-5 and abs(max(xs))<1e-5,('Zárubeň není ve změřeném ostění',min(xs),max(xs))
        if obj['role']=='facade-glass':
            assert obj['collision'] and obj['floorId']=='n02'
            # Rovinná zavřená výplň v ostění, nikoli dřevěné křídlo otočené do prostoru.
            xs=[v.co.x for v in obj.data.vertices]
            assert abs(min(xs)+0.064)<1e-5 and abs(max(xs)+0.056)<1e-5
        if obj['role']=='window-infill':
            assert obj['collision']
            zs=[v.co.z for v in obj.data.vertices]
            assert abs(min(zs)-3.345)<1e-5 and abs(max(zs)-4.05)<1e-5
        if obj['role']=='door-leaf':
            xs=[v.co.x for v in obj.data.vertices]
            assert abs(min(xs)+1)<1e-5 and abs(max(xs))<1e-5,'Původní CAD pant se nesmí posunout se zárubní'
        results.append({'role':obj['role'],'volume':volume})
    assert geometry.counts['fixedFacadeGlazing']==1 and geometry.counts['doors']==2
    assert not any(obj['floorId']=='n02' and obj['role']=='door-leaf' for obj in bpy.data.objects if obj.type=='MESH')
    stair_geometry=module.Geometry([250,731])
    flight=stair_geometry.flight('n01','annotation-probe',[260,741],[260,744.2],2,0,1.6,10)
    measured=stair_geometry.flight('n01','measured-probe',[270,741],[270,742.8],2,0,1.47,
                                   riser_positions=[i*0.3 for i in range(7)])
    ring=[[269,742.8],[271,742.8],[271,743.8],[269,743.8]]
    stair_geometry.landing('n01','terminal-landing',[ring],
                           [[ring[0],ring[1],ring[2]],[ring[0],ring[2],ring[3]]],1.47,measured['riser'])
    edges=[[[280+i*0.3,742+i*0.1],[280+i*0.3,740+i*0.1]] for i in range(7)]
    skew=stair_geometry.edge_flight('n01','skew-probe',edges,0,1.4)
    ring=[[281.8,740.6],[282.6,740.8666667],[282.6,742.8666667],[281.8,742.6]]
    stair_geometry.landing('n01','skew-upper-landing',[ring],
                           [[ring[0],ring[1],ring[2]],[ring[0],ring[2],ring[3]]],1.4,skew['riser'])
    stair_root=bpy.data.objects.new('stair-probe',None);bpy.context.scene.collection.objects.link(stair_root)
    stair_objects=module.create_meshes(stair_geometry,stair_root)
    for obj in stair_objects:
        obj.data.calc_loop_triangles()
        for triangle in obj.data.loop_triangles:
            a,b,c=[obj.data.vertices[i].co for i in triangle.vertices]
            assert (b-a).cross(c-a).length>1e-10,('Degenerovaný schodišťový probe',obj.name)
    recipe={'cadOrigin':[250,731],'floors':[{'id':'n01','elevation':0}]}
    bpy.context.view_layer.update()
    exported=module.export_collision(stair_objects,recipe,[flight,measured,skew])
    current=stair_clearance(exported)
    assert not current['missingSupport'] and not current['blocked'],'Platný schodový probe musí projít'
    missing_landing={**exported,'parts':[part for part in exported['parts'] if part['role']!='stair-landing']}
    assert stair_clearance(missing_landing)['missingSupport'],'Poslední stoupání potřebuje skutečnou podestu'
    stair_root.location.x+=20
    bpy.context.view_layer.update()
    moved=stair_clearance(module.export_collision(stair_objects,recipe,[flight,measured,skew]))
    assert moved['missingSupport'],'Zastaralé anotace po posunu masteru musí selhat'
    print(json.dumps({'status':'primitive-tests-pass','parts':results,'staleStairAnnotationsRejected':True}))


def glb_data(path):
    data=path.read_bytes()
    magic,version,length=struct.unpack_from('<III',data)
    assert magic==0x46546c67 and version==2 and length==len(data),'Neplatná hlavička GLB'
    offset=12;spec=None;binary=None
    while offset<len(data):
        size,kind=struct.unpack_from('<II',data,offset)
        chunk=data[offset+8:offset+8+size]
        if kind==0x4e4f534a:spec=json.loads(chunk)
        if kind==0x004e4942:binary=chunk
        offset+=8+size
    assert spec is not None and binary is not None
    return spec,binary


def accessor(spec,binary,index):
    value=spec['accessors'][index]
    assert 'sparse' not in value,'Audit očekává běžné statické accessors'
    view=spec['bufferViews'][value['bufferView']]
    types={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
    code,size=types[value['componentType']]
    count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[value['type']]
    step=view.get('byteStride',size*count)
    offset=view.get('byteOffset',0)+value.get('byteOffset',0)
    return [struct.unpack_from('<'+code*count,binary,offset+i*step) for i in range(value['count'])]


def node_matrices(spec):
    matrices={}
    def visit(index,parent):
        node=spec['nodes'][index]
        if 'matrix' in node:
            raw=node['matrix'];local=Matrix([raw[i:i+4] for i in range(0,16,4)]).transposed()
        else:
            q=node.get('rotation',[0,0,0,1])
            local=Matrix.LocRotScale(Vector(node.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(node.get('scale',[1,1,1])))
        matrices[index]=parent@local
        for child in node.get('children',[]):visit(child,matrices[index])
    for index in spec['scenes'][spec.get('scene',0)]['nodes']:visit(index,Matrix.Identity(4))
    return matrices


def triangle_key(points):
    return oriented_triangle(points)[0]


def canonical_triangles(vertices,indices):
    return Counter(triangle_key([vertices[i] for i in indices[start:start+3]]) for start in range(0,len(indices),3))


def stair_clearance(expected):
    vertices=[];faces=[];owners=[]
    for part in expected['parts']:
        offset=len(vertices)
        positions=part['positions']
        vertices.extend((positions[i],-positions[i+2],positions[i+1]) for i in range(0,len(positions),3))
        indices=part['indices']
        for i in range(0,len(indices),3):
            faces.append(tuple(offset+j for j in indices[i:i+3]));owners.append(part['id'])
    tree=BVHTree.FromPolygons(vertices,faces,all_triangles=True,epsilon=1e-7)
    failed=[];missing_support=[];samples=0;origin=expected['cadOrigin']
    metadata={part['id']:part for part in expected['parts']}
    for flight in expected['stairs']:
        length=math.dist(flight['a'],flight['b'])
        surfaces=flight.get('surfaces') or [{'start':i*length/flight['steps'],'end':(i+1)*length/flight['steps'],
                                           'height':flight['bottom']+(i+1)*flight['riser']} for i in range(flight['steps'])]
        for step,surface in enumerate(surfaces):
            t=(surface['start']+surface['end'])/(2*length)
            x=flight['a'][0]+(flight['b'][0]-flight['a'][0])*t
            y=flight['a'][1]+(flight['b'][1]-flight['a'][1])*t
            if 'centerCad' in surface:
                x,y=surface['centerCad']
            z=surface['height']
            point=Vector((-(y-origin[1]),x-origin[0],z+0.02))
            _,_,support_index,support_distance=tree.ray_cast(point+Vector((0,0,0.02)),Vector((0,0,-1)),0.08)
            support=metadata[owners[support_index]] if support_index is not None else None
            if support is None or support['role']!='stair' or support['floor']!=flight['floor'] or abs(support_distance-0.04)>0.002:
                missing_support.append({'flight':flight['id'],'step':step+1,'expectedHeight':z,
                                        'support':support['id'] if support else None,'distance':support_distance})
            _,_,index,distance=tree.ray_cast(point,Vector((0,0,1)),1.88)
            samples+=1
            if index is not None:
                failed.append({'flight':flight['id'],'step':step+1,'headroom':distance+0.02,'obstruction':owners[index]})
        if flight.get('terminalRiserOnLanding'):
            dx=(flight['b'][0]-flight['a'][0])/length
            dy=(flight['b'][1]-flight['a'][1])/length
            x,y=flight['b'][0]+dx*0.05,flight['b'][1]+dy*0.05
            point=Vector((-(y-origin[1]),x-origin[0],flight['top']+0.04))
            _,_,index,distance=tree.ray_cast(point,Vector((0,0,-1)),0.08)
            support=metadata[owners[index]] if index is not None else None
            if support is None or support['role'] not in {'stair-landing','slab'} or abs(distance-0.04)>0.002:
                missing_support.append({'flight':flight['id'],'step':'upper-landing',
                                        'support':support['id'] if support else None,'distance':distance})
            _,_,index,distance=tree.ray_cast(point-Vector((0,0,0.02)),Vector((0,0,1)),1.88)
            samples+=1
            if index is not None:
                failed.append({'flight':flight['id'],'step':'upper-landing','headroom':distance+0.02,'obstruction':owners[index]})
            x,y=flight['b'][0]-dx*0.02,flight['b'][1]-dy*0.02
            point=Vector((-(y-origin[1]),x-origin[0],flight['top']-flight['riser']+0.005))
            _,_,index,distance=tree.ray_cast(point,Vector((-dy,dx,0)),0.10)
            support=metadata[owners[index]] if index is not None else None
            if support is None or support['role'] not in {'stair-landing','slab'}:
                missing_support.append({'flight':flight['id'],'step':'terminal-riser-front',
                                        'support':support['id'] if support else None,'distance':distance})
    return {'requiredHeadroom':1.9,'samples':samples,'blocked':failed,'missingSupport':missing_support,
            'scope':'Opora a svislá světlost nad středy stupňů; nenahrazuje prostorový průchod herního controlleru.'}


def audit(args):
    expected=json.loads(args.collision.read_text(encoding='utf-8'))
    assert expected['blendSha256']==hashlib.sha256(args.blend.read_bytes()).hexdigest(),'Změněný Blender master'
    assert expected['glbSha256']==hashlib.sha256(args.glb.read_bytes()).hexdigest(),'Změněný GLB'
    bpy.ops.wm.open_mainfile(filepath=str(args.blend.resolve()))
    root=bpy.data.objects.get('building:osm:way:53929063')
    assert root is not None and root.get('buildingId')=='b01'
    assert 'titleBlock' not in root.get('sourceProvenance',''),'Původní rozpiska nesmí být přibalena'
    objects=[o for o in bpy.data.objects if o.type=='MESH']
    assert objects and all(o.parent==root for o in objects),'Cizí nebo nepřipojené části'
    assert {o.get('floorId') for o in objects}=={'p01','n01','n02','n03','n04'},'Chybějící podlaží'
    assert not bpy.data.images or all(not image.filepath for image in bpy.data.images),'Model nesmí záviset na původních výkresech'
    assert not bpy.data.texts,'Model nesmí balit původní dokumenty jako Text'
    all_points=[];mesh_report=[];native={}
    for obj in objects:
        assert obj.scale==Vector((1,1,1)),obj.name
        mesh=obj.data;mesh.calc_loop_triangles()
        points=[obj.matrix_world@v.co for v in mesh.vertices]
        assert all(all(math.isfinite(v) for v in p) for p in points)
        zero=0;volume=0.0;normals={}
        positions=[(p.x,p.z,-p.y) for p in points]
        normal_matrix=obj.matrix_world.inverted().transposed().to_3x3()
        for t in mesh.loop_triangles:
            a,b,c=[points[i] for i in t.vertices]
            if (b-a).cross(c-a).length<1e-10:zero+=1
            volume+=a.dot(b.cross(c))/6
            key,offset=oriented_triangle([positions[i] for i in t.vertices])
            corner=[]
            for index in t.loops:
                normal=(normal_matrix@mesh.corner_normals[index].vector).normalized()
                corner.append((normal.x,normal.z,-normal.y))
            normals.setdefault(key,[]).append(corner[offset:]+corner[:offset])
        assert zero==0,(obj.name,'nulové trojúhelníky',zero)
        assert volume>0,(obj.name,'obrácený nebo prázdný objem',volume)
        all_points.extend(points)
        native[obj.name]={'positions':positions,'indices':[i for t in mesh.loop_triangles for i in t.vertices],'normals':normals,'object':obj}
        mesh_report.append({'name':obj.name,'vertices':len(points),'triangles':len(mesh.loop_triangles),'signedVolume':volume,'collision':bool(obj.get('collision'))})
    bounds={'min':[min(p[i] for p in all_points) for i in range(3)],'max':[max(p[i] for p in all_points) for i in range(3)]}
    assert max(bounds['max'][0]-bounds['min'][0],bounds['max'][1]-bounds['min'][1])<80,'Odlehlá CAD entita'
    spec,binary=glb_data(args.glb)
    matrices=node_matrices(spec)
    portable={}
    for index,node in enumerate(spec['nodes']):
        if 'mesh' not in node:continue
        assert index in matrices,('GLB část není připojena ke scéně',node.get('name'))
        key=node['name'];primitives=[]
        assert key in native,('Cizí GLB část',key)
        assert node.get('extras',{}).get('floorId')==native[key]['object']['floorId']
        assert node.get('extras',{}).get('role')==native[key]['object']['role']
        assert node.get('extras',{}).get('collision')==bool(native[key]['object'].get('collision'))
        normal_matrix=matrices[index].inverted().transposed().to_3x3()
        for primitive in spec['meshes'][node['mesh']]['primitives']:
            assert primitive.get('mode',4)==4
            material=native[key]['object'].data.materials[0]
            shader=material.node_tree.nodes.get('Principled BSDF')
            portable_material=spec['materials'][primitive['material']]
            pbr=portable_material.get('pbrMetallicRoughness',{})
            color=tuple(shader.inputs['Base Color'].default_value)
            alpha=shader.inputs['Alpha'].default_value
            expected_color=(*color[:3],alpha)
            assert max(abs(a-b) for a,b in zip(expected_color,pbr.get('baseColorFactor',[1,1,1,1])))<0.000001,(key,'Jiná PBR barva')
            for field,input_name in [('roughnessFactor','Roughness'),('metallicFactor','Metallic')]:
                assert abs(shader.inputs[input_name].default_value-pbr.get(field,1))<0.000001,(key,field)
            assert portable_material.get('doubleSided',False)==(not material.use_backface_culling),(key,'Jiné backface culling')
            assert portable_material.get('alphaMode','OPAQUE')==('BLEND' if alpha<1 else 'OPAQUE'),(key,'Jiný alpha režim')
            points=[tuple(matrices[index]@Vector(p)) for p in accessor(spec,binary,primitive['attributes']['POSITION'])]
            indices=[r[0] for r in accessor(spec,binary,primitive['indices'])]
            raw_normals=accessor(spec,binary,primitive['attributes']['NORMAL'])
            assert len(raw_normals)==len(points)
            assert all(abs(Vector(n).length-1)<0.001 for n in raw_normals),('Nenormalizované GLB normály',key)
            normals=[tuple((normal_matrix@Vector(n)).normalized()) for n in raw_normals]
            primitives.append((points,indices,normals))
        portable[key]=primitives
    assert set(portable)==set(native),'Jiná sada částí native/GLB (včetně dveří a rámů)'
    export_comparisons=[]
    for name,part in native.items():
        vertices=part['positions']
        triangles=canonical_triangles(vertices,part['indices'])
        tree=KDTree(len(vertices))
        for index,position in enumerate(vertices):tree.insert(position,index)
        tree.balance();actual=Counter();max_glb_error=0;max_normal_error=0
        available={key:list(values) for key,values in part['normals'].items()}
        for points,indices,normals in portable[name]:
            mapped=[]
            for point in points:
                _,index,distance=tree.find(point)
                assert distance<0.00002,(name,'GLB vrchol mimo toleranci',distance)
                max_glb_error=max(max_glb_error,distance)
                mapped.append(vertices[index])
            actual.update(canonical_triangles(mapped,indices))
            for start in range(0,len(indices),3):
                ids=indices[start:start+3]
                key,offset=oriented_triangle([mapped[i] for i in ids])
                assert available.get(key),(name,'Chybějící nebo obrácený GLB trojúhelník',key)
                actual_normals=[normals[i] for i in ids]
                actual_normals=actual_normals[offset:]+actual_normals[:offset]
                errors=[max((Vector(a)-Vector(b)).length for a,b in zip(actual_normals,candidate)) for candidate in available[key]]
                best=min(range(len(errors)),key=errors.__getitem__)
                error=errors[best];max_normal_error=max(max_normal_error,error)
                assert error<0.0002,(name,'GLB normály se liší od Blenderu',error)
                available[key].pop(best)
        mismatch=sum((triangles-actual).values())+sum((actual-triangles).values())
        assert mismatch==0,(name,'GLB/native jiné orientované trojúhelníky',mismatch)
        export_comparisons.append({'id':name,'maxGlbErrorMetres':max_glb_error,'maxCornerNormalError':max_normal_error,'triangles':len(part['indices'])//3,'glbTriangleMismatch':mismatch})
    assert {p['id'] for p in expected['parts']}=={name for name,part in native.items() if part['object'].get('collision')},'Jiná sada konstrukčních kolizí'
    comparisons=[]
    for part in expected['parts']:
        source=native[part['id']]
        positions=[value for point in source['positions'] for value in point]
        assert len(positions)==len(part['positions'])
        error=max((abs(a-b) for a,b in zip(positions,part['positions'])),default=0)
        assert error<=0.000001,(part['id'],'native/kolize rozdíl',error)
        assert source['indices']==part['indices'],(part['id'],'native/kolize jiné indexy nebo orientace')
        comparisons.append({'id':part['id'],'maxNativeErrorMetres':error,'triangles':len(part['indices'])//3})
    clearance=stair_clearance(expected)
    result={
        'status':'geometry-pass-visual-acceptance-separate' if not clearance['blocked'] and not clearance['missingSupport'] else 'stair-clearance-failed',
        'buildingId':'b01','blenderVersion':bpy.app.version_string,
        'blendSha256':expected['blendSha256'],'glbSha256':expected['glbSha256'],
        'boundsBlender':bounds,'meshes':mesh_report,
        'exportComparisons':export_comparisons,'collisionComparisons':comparisons,
        'stairClearance':clearance,
        'limitations':['Numerická shoda není stavební zaměření.',
                       'Tento audit nedokazuje průchod herním controllerem ani GPU výkon.',
                       'Vizuální správnost všech pater a schodišť musí posoudit navazující kontrola.'],
    }
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':result['status'],'objects':len(objects),'collisionParts':len(comparisons),'bounds':bounds},ensure_ascii=False))
    assert not clearance['blocked'],('Nízké stropy nad schodištěm',clearance['blocked'])
    assert not clearance['missingSupport'],('Schodišťové anotace neodpovídají skutečným stupňům',clearance['missingSupport'])
    return objects,bounds


def render(args,objects,bounds):
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
    scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world=bpy.data.worlds.new('QA svět')
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(0.7,0.76,0.82,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.65
    sun_data=bpy.data.lights.new('QA slunce','SUN');sun_data.energy=2.5;sun_data.angle=math.radians(15)
    sun=bpy.data.objects.new('QA slunce',sun_data);scene.collection.objects.link(sun);sun.rotation_euler=(math.radians(25),math.radians(-20),math.radians(-30))
    camera_data=bpy.data.cameras.new('QA kamera');camera_data.type='ORTHO'
    camera=bpy.data.objects.new('QA kamera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
    center=Vector([(a+b)/2 for a,b in zip(bounds['min'],bounds['max'])])
    args.render_dir.mkdir(parents=True,exist_ok=True)
    def shot(name,position,target,scale,roll=0):
        camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.ortho_scale=scale
        camera.rotation_euler.z+=roll
        scene.render.filepath=str((args.render_dir/(name+'.png')).resolve())
        bpy.ops.render.render(write_still=True)
    if args.render_floor in ['all','overall']:
        shot('b01-overall',center+Vector((58,-76,52)),center,87)
    if args.render_floor not in ['overall','interiors','roof-interior']:
        floors=['p01','n01','n02','n03','n04'] if args.render_floor in ['all','plans'] else [args.render_floor]
        for floor in floors:
            for obj in objects:obj.hide_render=obj.get('floorId')!=floor
            # Záběr půdorysu v původní orientaci výkresu pro audit dveří/příček.
            # ortho_scale je při landscape renderu vodorovný rozsah kamery.
            span_x=bounds['max'][1]-bounds['min'][1]
            span_y=bounds['max'][0]-bounds['min'][0]
            scale=max(span_x,span_y*scene.render.resolution_x/scene.render.resolution_y)+8
            shot('b01-'+floor,Vector((center.x,center.y,90)),Vector((center.x,center.y,0)),scale,math.pi/2)
    for obj in objects:obj.hide_render=False
    if args.render_floor in ['interiors','roof-interior']:
        root=bpy.data.objects['building:osm:way:53929063']
        floors={floor['id']:floor for floor in json.loads(root['floorMetadata'])}
        stairs=json.loads(root['stairAnnotations']);origin=list(root['cadOrigin'])
        def at(cad,z):return Vector((-(cad[1]-origin[1]),cad[0]-origin[0],z))
        fill_data=bpy.data.lights.new('QA světlo kamery, není součást modelu','AREA')
        fill_data.energy=120;fill_data.shape='DISK';fill_data.size=2
        fill=bpy.data.objects.new(fill_data.name,fill_data);scene.collection.objects.link(fill)
        camera_data.type='PERSP';camera_data.lens=24;camera_data.clip_start=.03;camera_data.clip_end=200
        def interior(name,position,target):
            camera.location=position;camera.rotation_euler=(target-position).to_track_quat('-Z','Y').to_euler()
            fill.location=position;fill.rotation_euler=camera.rotation_euler
            scene.render.filepath=str((args.render_dir/(name+'.png')).resolve())
            bpy.ops.render.render(write_still=True)
        if args.render_floor=='roof-interior':
            # N01 room29/2131: the eye is inside the measured wider lower wing,
            # outside the upper-storey footprint. Inspect its added roof soffit.
            interior('b01-interior-room29-roof',at([218.1,747.5],floors['n01']['wingElevation']+1.60),
                     at([217.3,748.15],floors['n01']['wingElevation']+2.05))
            return
        interior('b01-interior-main-corridor',at([250,731],floors['n02']['elevation']+1.65),
                 at([275,731],floors['n02']['elevation']+1.5))
        # N02 room106/1F8E centroid; window2403/2406, confirmed from source.
        interior('b01-interior-room106',at([249.737,735.462],floors['n02']['elevation']+1.60),
                 at([249.739461,738.893721],floors['n02']['elevation']+1.55))
        for route_id in ['n01-east-side-east','n02-n03-east-u']:
            flight=next((item for item in stairs if item.get('routeId')==route_id and item.get('routeIndex')==0),None)
            if flight is None:raise ValueError('Chybí schodiště pro interiérový QA pohled '+route_id)
            access=flight.get('routeAccessPath',{});offset=access.get('offsetCad',[0,0])
            a=[v+offset[i] for i,v in enumerate(flight['a'])];b=[v+offset[i] for i,v in enumerate(flight['b'])]
            length=math.dist(a,b);lower=[a[i]-(b[i]-a[i])/length*.4 for i in range(2)]
            lower=access.get('lowerApproachCad',lower)
            interior('b01-interior-'+route_id,at(lower,flight['bottom']+1.65),at(b,flight['top']+1.0))


def main():
    args=arguments()
    if args.self_test:
        primitive_tests()
        return
    objects,bounds=audit(args)
    if args.render_dir:render(args,objects,bounds)


if __name__=='__main__':main()
