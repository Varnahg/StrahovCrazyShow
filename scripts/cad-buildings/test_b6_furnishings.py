"""Small independent geometry/clearance proofs, no Blender or source CAD copy."""
from collections import Counter, defaultdict
import ast
from copy import deepcopy
import math
from pathlib import Path
import unittest

import b6_furnishings as furnishing


def recipe(usage='bedroom',width=2.30,depth=6.0):
    room={'id':'101','sourceEntity':'ROOM','usage':usage,'usageBasis':'Fixture CAD classification',
          'levelKey':'n02.main','loops':[[[0,0],[width,0],[width,depth],[0,depth]]]}
    return {'buildingId':'b06','floors':[{'id':'n02','elevation':3,'levelElevations':{'main':3},'rooms':[room],
        'doors':[{'id':'door','hinge':[width/2-.4,-.12],'closedEnd':[width/2+.4,-.12],
                  'openEnd':[width/2-.4,.68],'bottom':3,'levelKey':'n02.main'}],
        'windows':[{'id':'window','a':[.45,depth+.15],'b':[width-.45,depth+.15],'levelKey':'n02.main'}]}]}


def sanitary(kind,center,facing,size,index):
    return {'kind':kind,'centerCad':center,'facingCad':facing,'size':size,
            'sourceEntities':['CAD-'+str(index)],'sourceBasis':'Fixture CAD equipment symbol'}


def bathroom():
    r=recipe('bathroom',3,6);room=r['floors'][0]['rooms'][0];fixtures=[]
    for side in (0,1):
        for row in range(4):
            fixtures.append(sanitary('basin',[.25 if side==0 else 2.75,.8+row*.8],
                [1,0] if side==0 else [-1,0],[.60,.45],len(fixtures)))
    for x in (.55,1.50,2.45):
        fixtures.append(sanitary('shower',[x,5.45],[0,-1],[.8,.8],len(fixtures)))
    room['sanitaryFixtures']=fixtures
    return r


class Capture:
    def __init__(self):self.counts=defaultdict(int);self.faces=[];self.prisms=[];self.uv_frames=[]
    def at(self,p,z):return (-p[1],p[0],z)
    def face(self,key,points,uv_frame=None):self.faces.append((key,[tuple(p) for p in points]));self.uv_frames.append(uv_frame)
    def prism(self,key,a,b,width,bottom,top):
        # Test the adapter contract; the production Geometry owns box meshing.
        self.prisms.append((key,a,b,width,bottom,top))


class FurnishingTests(unittest.TestCase):
    def test_beveled_panel_is_closed_outward_and_stays_inside_old_collision_envelope(self):
        bounds=(1.,2.,3.,1.018,2.65,4.40)
        vertices,faces=furnishing.beveled_box(bounds)
        edges=Counter();volume=0
        for face in faces:
            for a,b in zip(face,face[1:]+face[:1]):edges[tuple(sorted((a,b)))]+=1
            a=vertices[face[0]]
            for j in range(1,len(face)-1):
                b,c=vertices[face[j]],vertices[face[j+1]]
                volume+=sum(a[k]*(b[(k+1)%3]*c[(k+2)%3]-b[(k+2)%3]*c[(k+1)%3]) for k in range(3))/6
        self.assertEqual(len(faces),26);self.assertTrue(all(v==2 for v in edges.values()))
        self.assertGreater(volume,.018*.65*1.4*.97);self.assertLess(volume,.018*.65*1.4)
        self.assertTrue(all(bounds[i]-1e-10<=p[i]<=bounds[i+3]+1e-10 for p in vertices for i in range(3)))

    def test_cabinet_has_real_panels_open_upper_cavity_and_ivory_lower_door(self):
        plan=furnishing.plan_b06_furnishings(recipe())
        cabinet=next(i for i in plan['items'] if i['shape']=='cabinet-open-top')
        panels=furnishing.cabinet_panels(cabinet)
        self.assertEqual({p['name'] for p in panels},{'left','right','bottom','top','back','shelf','door'})
        door=next(p for p in panels if p['name']=='door')
        self.assertEqual(door['material'],'b6_laminate_ivory')
        self.assertLess(door['bounds'][5],cabinet['bottom']+(cabinet['top']-cabinet['bottom'])*.51)
        # Panels meet at seams, never overlap volumes or replace the open cavity
        # with the former whole box. The old planner footprint stays intact.
        for i,a in enumerate(panels):
            for b in panels[i+1:]:
                overlap=math.prod(max(0,min(a['bounds'][j+3],b['bounds'][j+3])-max(a['bounds'][j],b['bounds'][j])) for j in range(3))
                self.assertLess(overlap,1e-10)
        g=Capture();audit=furnishing.add_b06_furnishings(g,recipe())
        self.assertIn('b6_laminate_ivory',audit['materialKeys'])
        self.assertGreater(sum(frame is not None for frame in g.uv_frames),100)
        self.assertLess(len({key for key,_ in g.faces}),20)

    def test_panel_frame_tracks_room_orientation_and_long_grain_axis(self):
        g=Capture();bounds=(.2,.4,3.,.218,1.0,4.4)
        for frame in ({'origin':(0,0),'u':(1,0),'v':(0,1)}, {'origin':(0,6),'u':(1,0),'v':(0,-1)}):
            uv=furnishing.panel_uv_frame(g,frame,bounds)
            self.assertEqual(uv['axes'][1],[0,0,1])
            self.assertEqual(len(uv['origin']),3)
            for i,a in enumerate(uv['axes']):
                for j,b in enumerate(uv['axes']):self.assertAlmostEqual(sum(x*y for x,y in zip(a,b)),1 if i==j else 0)

    def test_corridor_lights_respect_holes_and_do_not_populate_bedrooms(self):
        r=recipe('corridor',45,3);floor=r['floors'][0];floor['levelCeilings']={'main':5.8}
        room=floor['rooms'][0];room['loops'].append([[19,0],[27,0],[27,3],[19,3]])
        fixtures=furnishing.corridor_ceiling_fixtures(r)
        self.assertGreater(len(fixtures),0)
        self.assertTrue(all(item['ceiling']==5.8 and not 19<item['a'][0]<27 for item in fixtures))
        room['usage']='bedroom'
        self.assertEqual(furnishing.corridor_ceiling_fixtures(r),[])

    def test_unclassified_rooms_and_service_rooms_do_not_become_bedrooms(self):
        for usage in (None,'corridor','service','unknown'):
            self.assertEqual(furnishing.plan_b06_furnishings(recipe(usage))['items'],[])
        bad=recipe();del bad['floors'][0]['rooms'][0]['usageBasis']
        with self.assertRaisesRegex(ValueError,'provenance'):furnishing.plan_b06_furnishings(bad)

    def test_bedroom_has_two_beds_desks_and_an_actual_clear_central_aisle(self):
        r=recipe();p=furnishing.plan_b06_furnishings(r)
        self.assertEqual(p['skipped'],[]);self.assertEqual(len(p['rooms']),1)
        beds=[i for i in p['items'] if i['id'].endswith('-frame') and i['role'].endswith('/bed')]
        desks=[i for i in p['items'] if i['id'].endswith('-top') and i['role'].endswith('/desk')]
        self.assertEqual(len(beds),2);self.assertEqual(len(desks),2)
        beds.sort(key=lambda i:i['bounds'][0]);gap=beds[1]['bounds'][0]-beds[0]['bounds'][2]
        self.assertGreaterEqual(gap,.60);self.assertAlmostEqual(gap,.70)
        for i in p['items']:
            self.assertTrue(furnishing.footprint_inside(i['footprintCad'],r['floors'][0]['rooms'][0]['loops']))
            if i['collision'] and i['bottom']<4.8:
                self.assertFalse(furnishing._overlap(i['footprintCad'],p['rooms'][0]['aisleCad']))
        for material in ('b6_wood','b6_fabric_teal','b6_curtain','b6_radiator','b6_fabric_blue'):
            self.assertIn(material,{i['material'] for i in p['items']})

    def test_mirrored_room_faces_its_actual_window_and_preserves_door_path(self):
        r=recipe();f=r['floors'][0]
        for opening in f['doors']:
            for key in ('hinge','closedEnd','openEnd'):opening[key][1]=6-opening[key][1]
        for opening in f['windows']:
            for key in ('a','b'):opening[key][1]=6-opening[key][1]
        p=furnishing.plan_b06_furnishings(r);self.assertEqual(p['skipped'],[])
        desks=[i for i in p['items'] if i['id'].endswith('-top')]
        self.assertTrue(all(max(q[1] for q in i['footprintCad'])<.8 for i in desks))
        zone=p['rooms'][0]['doorClearanceCad'][0]
        self.assertTrue(all(not furnishing._overlap(i['footprintCad'],zone) for i in p['items'] if i['bottom']<5.1))

    def test_realistic_entry_notch_is_respected_and_oversized_notch_is_reported(self):
        r=recipe();room=r['floors'][0]['rooms'][0]
        room['loops']=[[[0,1.31],[.57,1.31],[.57,0],[2.3,0],[2.3,6],[0,6]]]
        p=furnishing.plan_b06_furnishings(r);self.assertEqual(p['skipped'],[])
        room['loops']=[[[0,3],[1,3],[1,0],[2.3,0],[2.3,6],[0,6]]]
        p=furnishing.plan_b06_furnishings(r);self.assertEqual(p['items'],[])
        self.assertIn(p['skipped'][0]['reason'],('required-furniture-clearance','unsupported-bedroom-proportions'))

    def test_window_bay_widening_does_not_place_beds_through_the_narrower_wall(self):
        r=recipe(width=2.41);room=r['floors'][0]['rooms'][0]
        room['loops']=[[[0,0],[2.30,0],[2.30,4.75],[2.41,4.75],[2.41,6],[0,6]]]
        p=furnishing.plan_b06_furnishings(r);self.assertEqual(p['skipped'],[])
        bed=[i for i in p['items'] if i['id'].endswith('bed-2-frame')][0]
        self.assertLessEqual(max(q[0] for q in bed['footprintCad']),2.30)

    def test_polygon_containment_rejects_crossed_concavity_and_enclosed_hole(self):
        concave=[[[0,0],[3,0],[3,3],[2,3],[2,1],[1,1],[1,3],[0,3]]]
        self.assertFalse(furnishing.footprint_inside([[.5,.5],[2.5,.5],[2.5,2],[.5,2]],concave))
        hole=[[[0,0],[4,0],[4,4],[0,4]],[[1,1],[2,1],[2,2],[1,2]]]
        self.assertFalse(furnishing.footprint_inside([[.5,.5],[3,.5],[3,3],[.5,3]],hole))

    def test_missing_openings_wrong_floor_and_too_narrow_rooms_do_not_gain_furniture(self):
        for mode in ('window','door','narrow','wrong-floor'):
            r=recipe(width=2.0 if mode=='narrow' else 2.3);f=r['floors'][0]
            if mode=='window':f['windows']=[]
            if mode=='door':f['doors']=[]
            if mode=='wrong-floor':f['doors'][0]['levelKey']='n01.main'
            p=furnishing.plan_b06_furnishings(r);self.assertEqual(p['items'],[]);self.assertEqual(len(p['skipped']),1)
        r=recipe();r['floors'][0]['id']='p01'
        self.assertEqual(furnishing.plan_b06_furnishings(r)['skipped'][0]['reason'],'bedroom-outside-supported-storeys')

    def test_bathroom_keeps_source_counts_positions_and_curved_basins(self):
        r=bathroom();p=furnishing.plan_b06_furnishings(r)
        self.assertEqual(p['skipped'],[])
        basins=[i for i in p['items'] if i['role']=='interior-sanitary/basin' and i['shape']=='basin']
        trays=[i for i in p['items'] if i['id'].endswith('-tray')]
        self.assertEqual(len(basins),8);self.assertEqual(len(trays),3)
        self.assertTrue(all(i['sourceEntities'] for i in basins+trays))
        for basin in basins:
            vertices,faces=furnishing._profile_mesh(basin,[(0,0),(.7,.15),(1,.8),(.8,1),(.6,.8),(0,.4)])
            self.assertGreater(len(vertices),40);self.assertGreater(len(faces),40)
            self.assertTrue(all(len(set(face))>=3 for face in faces))
        self.assertIn('interior-sanitary/ventilation',{i['role'] for i in p['items']})

    def test_wc_consumes_only_explicit_source_symbols(self):
        r=recipe('wc',4.5,4.4);f=r['floors'][0];room=f['rooms'][0]
        room['sanitaryFixtures']=[sanitary('toilet',[.5+i*.85,3.8],[0,-1],[.352,.5],i) for i in range(5)]
        room['sanitaryFixtures'] += [sanitary('urinal',[.5+i*.85,.2],[0,1],[.3473,.2565],i+5) for i in range(5)]
        f['doors']=[{'id':'wc-door','hinge':[-.12,1.6],'closedEnd':[-.12,2.4],'levelKey':'n02.main'}]
        p=furnishing.plan_b06_furnishings(r);self.assertEqual(p['skipped'],[])
        self.assertEqual(len([i for i in p['items'] if i['id'].endswith('-bowl')]),5)
        self.assertEqual(len([i for i in p['items'] if i['id'].endswith('-body')]),5)

    def test_source_column_corner_is_cut_from_tray_without_moving_measured_fixture(self):
        r=bathroom();room=r['floors'][0]['rooms'][0]
        room['loops']=[[[0,0],[3,0],[3,6],[.3,6],[.3,5.7],[0,5.7]]]
        original=deepcopy(room['sanitaryFixtures']);p=furnishing.plan_b06_furnishings(r)
        self.assertEqual(p['skipped'],[]);self.assertEqual(room['sanitaryFixtures'],original)
        clipped=[i for i in p['items'] if i.get('sourceClipping') and '-tray' in i['id']]
        self.assertEqual(len(clipped),2)
        self.assertTrue(all(furnishing.footprint_inside(i['footprintCad'],room['loops']) for i in clipped))
        kept=sum((i['bounds'][2]-i['bounds'][0])*(i['bounds'][3]-i['bounds'][1]) for i in clipped)
        self.assertGreater(kept,.9*.796*.796);self.assertLess(kept,.796*.796)
        self.assertEqual(len({i['id'] for i in p['items']}),len(p['items']))

    def test_fixed_leaf_does_not_invent_a_second_traversable_door_target(self):
        r=recipe();f=r['floors'][0]
        fixed=deepcopy(f['doors'][0]);fixed.update(id='fixed',openingClassification='fixed-paired-door-leaf')
        f['doors'].append(fixed)
        p=furnishing.plan_b06_furnishings(r)
        self.assertEqual(p['rooms'][0]['doorIds'],['door'])

    def test_curved_profiles_have_closed_noncollapsed_positive_volume(self):
        item={'bounds':[0,0,.6,.45],'bottom':0,'top':.23,'frame':{'origin':[0,0],'u':[1,0],'v':[0,1]}}
        vertices,faces=furnishing._profile_mesh(item,[(0,0),(.7,.12),(1,.43),(.94,.88),(.84,1),(.67,.87),(.28,.41),(0,.38)])
        edges=Counter();volume=0
        for face in faces:
            for a,b in zip(face,face[1:]+face[:1]):edges[tuple(sorted((a,b)))]+=1
            a=vertices[face[0]]
            for j in range(1,len(face)-1):
                b,c=vertices[face[j]],vertices[face[j+1]]
                normal=(b[1]*c[2]-b[2]*c[1],b[2]*c[0]-b[0]*c[2],b[0]*c[1]-b[1]*c[0])
                volume+=sum(a[k]*normal[k] for k in range(3))/6
        self.assertTrue(all(count==2 for count in edges.values()))
        self.assertGreater(volume,.001);self.assertLess(volume,.6*.45*.23)

    def test_walk_candidates_are_continuous_and_explicitly_require_actual_controller(self):
        for data in (recipe(),bathroom()):
            p=furnishing.plan_b06_furnishings(data);room=p['rooms'][0]
            self.assertEqual(room['walkPathUnresolved'],[])
            self.assertEqual(room['walkPathStatus'],'candidate-only')
            self.assertTrue(room['requiresActualController'])
            self.assertEqual(room['walkPath'][0]['cad'],room['walkPath'][-1]['cad'])
            self.assertEqual(room['walkPath'][0]['sourceDoorId'],'door')
        self.assertEqual(len(room['walkExtraTargets']),3)
        self.assertTrue(all('not a claimed route' in p['reason'] for p in room['walkExtraTargets']))

    def test_static_route_cannot_cross_a_thin_obstacle_or_invent_a_reset(self):
        data=recipe();floor=data['floors'][0];room=floor['rooms'][0]
        plan=furnishing._RoomPlan('n02',room,3,floor['doors'])
        plan.items=[{'collision':True,'bottom':3,'top':5,
            'footprintCad':[(0,1.8),(2.3,1.8),(2.3,1.81),(0,1.81)]}]
        audit=furnishing._walk_evidence(plan,floor['doors'],floor['windows'])
        self.assertTrue(audit['walkPathUnresolved'])
        self.assertTrue(all(p['cad'][1]<1.8 for p in audit['walkPath']))

    def test_emit_uses_shared_batched_keys_finite_mesh_and_actual_storey_height(self):
        r=bathroom();before=deepcopy(r);g=Capture();audit=furnishing.add_b06_furnishings(g,r)
        self.assertEqual(r,before);self.assertEqual(audit['byUsage'],{'bathroom':1})
        self.assertEqual(g.counts['furnished-bathroom'],1)
        for key,points in g.faces:
            self.assertEqual(len(key),4);self.assertEqual(key[0],'n02')
            self.assertIn(key[2],furnishing.MATERIALS)
            self.assertTrue(all(all(math.isfinite(n) for n in p) for p in points))
            self.assertTrue(all(3<=p[2]<=5.6 for p in points))
        self.assertGreater(len(g.faces),500)
        # Many washbasins share one material/role batch rather than objects.
        self.assertLess(len({key for key,_ in g.faces}),20)

    def test_production_geometry_adapter_without_importing_blender(self):
        # Execute the ACTUAL pure Geometry methods, not a second implementation
        # of batching/prisms. Only the class is loaded; no bpy module or export.
        from model_geometry import quantized_face
        source=Path(__file__).with_name('build_model.py').read_text(encoding='utf-8')
        cls=next(n for n in ast.parse(source).body if isinstance(n,ast.ClassDef) and n.name=='Geometry')
        namespace={'math':math,'defaultdict':defaultdict,'quantized_face':quantized_face}
        exec(compile(ast.Module(body=[cls],type_ignores=[]),'actual-Geometry','exec'),namespace)
        for data in (recipe(),bathroom()):
            geometry=namespace['Geometry']([0,0]);audit=furnishing.add_b06_furnishings(geometry,data)
            self.assertEqual(audit['roomCount'],1);self.assertLess(len(geometry.groups),40)
            self.assertGreater(sum(len(g['vertices']) for g in geometry.groups.values()),100)
            for key,group in geometry.groups.items():
                self.assertTrue(key[1].startswith(('interior-furniture/','interior-sanitary/')))
                self.assertTrue(all(all(math.isfinite(v) for v in p) for p in group['vertices']))
                self.assertTrue(all(3<=p[2]<5.6 for p in group['vertices']))

    def test_invalid_geometry_and_unproven_sanitary_data_fail_closed(self):
        r=recipe();r['floors'][0]['rooms'][0]['loops'][0][0][0]=math.nan
        with self.assertRaisesRegex(ValueError,'Nonfinite'):furnishing.plan_b06_furnishings(r)
        r=bathroom();r['floors'][0]['rooms'][0]['sanitaryFixtures'][0]['sourceEntities']=[]
        with self.assertRaisesRegex(ValueError,'source handles'):furnishing.plan_b06_furnishings(r)
        r=recipe('bathroom');p=furnishing.plan_b06_furnishings(r)
        self.assertEqual(p['items'],[]);self.assertEqual(p['skipped'][0]['reason'],'missing-source-sanitary-fixtures')


if __name__=='__main__':unittest.main()
