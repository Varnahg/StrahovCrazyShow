"""Small B6 geometry fixtures; private source/model acceptance is explicit."""
import hashlib
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import numpy as np
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.ops import unary_union

import prepare_b06 as b6


def line(handle, a, b, layer=None):
    return b6.geom.segment(handle, layer or b6.geom.WEAK, a, b)


def source_stair_fixture():
    result={}
    for floor in b6.FLOORS[:-1]:
        lines=[]
        for side in b6.CORE:
            spec=b6.core_spec(floor,side)
            for lane,(xmin,xmax) in spec['lanes'].items():
                for i in range(10):
                    y=spec['run'][0]+i*.30
                    lines.append(line(f'{floor}-{side}-{lane}-{i}',[xmin,y],[xmax,y]))
        result[floor]={'lines':lines}
    return result


class B6SourcePrimitiveTests(unittest.TestCase):
    def test_all_generator_dependencies_are_real_files(self):
        hashes=b6.dependencies()
        self.assertEqual(set(hashes),{'prepare_b06.py','prepare_b01.py'})
        self.assertEqual(hashes['prepare_b01.py'],hashlib.sha256(Path(b6.geom.__file__).read_bytes()).hexdigest())

    def test_changed_helper_invalidates_recipe(self):
        recipe={'generatorDependenciesSha256':b6.dependencies(),'heightModel':{'id':b6.HEIGHT_MODEL_ID}}
        self.assertTrue(b6.validate_cache(recipe))
        recipe['generatorDependenciesSha256']['prepare_b01.py']='old'
        with self.assertRaisesRegex(ValueError,'stale'):b6.validate_cache(recipe)
        self.assertFalse(b6.validate_cache(recipe,strict=False))

    def test_missing_source_is_rejected_before_preparation(self):
        with self.assertRaises(FileNotFoundError):b6.source_files(Path('nonexistent-b6-private-source'))

    def test_leaf_endpoints_and_duplicate_line_are_one_door(self):
        arc=np.array([[np.cos(t),np.sin(t)] for t in np.linspace(0,np.pi/2,17)])
        leaf=line('leaf',[0,0],[0,1],'3-DVERE')
        duplicate=line('copy',[0,1],[0,0],'3-DVERE')
        doors,notes=b6.doors_from_source({'lines':[leaf,duplicate],'arcs':[('arc',arc)]},'n02')
        self.assertEqual(len(doors),1)
        self.assertEqual(doors[0]['hinge'],[0,0]);self.assertEqual(doors[0]['closedEnd'],[1,0])
        self.assertEqual(doors[0]['sourceEntities'],['arc','leaf','copy']);self.assertFalse(notes)

    def test_short_b6_leaf_needs_its_own_source_identity(self):
        arc=np.array([[.85,0],[.77,.19],[.67,.339]])
        leaf=line('124A',[0,0],arc[-1],'3-DVERE')
        data={'lines':[leaf],'arcs':[('123F',arc)]}
        doors,notes=b6.doors_from_source(data,'n01')
        self.assertEqual(doors[0]['closedEnd'],[.85,0]);self.assertEqual(len(notes),1)
        with self.assertRaisesRegex(ValueError,'Unresolved B6 door'):
            b6.doors_from_source({'lines':[leaf],'arcs':[('unknown',arc)]},'n01')

    def test_unpaired_actual_leaf_is_not_silently_dropped(self):
        with self.assertRaisesRegex(ValueError,'Unpaired B6 door leaves'):
            b6.doors_from_source({'lines':[line('unused',[0,0],[1,0],'3-DVERE')],'arcs':[]},'n03')

    def test_ten_positions_are_nine_goings_and_do_not_mutate_source(self):
        data=source_stair_fixture()['n02']
        before=[(q.id,q.a.copy(),q.b.copy()) for q in data['lines']]
        segment=b6.stair_segment(data,'n02','west','left','n02.main','n02.mezzanine','n02')
        self.assertEqual(segment['modeledRiserCount'],10);self.assertEqual(segment['visibleIntervals'],9)
        self.assertAlmostEqual(segment['riserPositions'][-1],2.7)
        self.assertGreater(segment['a'][1],segment['b'][1])
        for old,new in zip(before,data['lines']):
            self.assertTrue(np.array_equal(old[1],new.a));self.assertTrue(np.array_equal(old[2],new.b))

    def test_missing_nosing_is_not_invented(self):
        data=source_stair_fixture()['n02'];data['lines']=[q for q in data['lines'] if q.id!='n02-west-left-3']
        with self.assertRaisesRegex(ValueError,'expected ten measured'):
            b6.measured_rows(data,'n02','west','left')

    def test_split_source_break_retains_one_row_with_both_handles(self):
        data=source_stair_fixture()['n02'];data['lines']=[q for q in data['lines'] if q.id!='n02-west-centre-3']
        xmin,xmax=b6.CORE['west']['lanes']['centre'];y=b6.CORE['west']['run'][0]+.9
        mid=(xmin+xmax)/2
        data['lines'] += [line('piece-a',[xmin,y],[mid-.12,y]),line('piece-b',[mid+.12,y],[xmax,y])]
        rows=b6.measured_rows(data,'n02','west','centre')
        self.assertEqual(rows[3][1],['piece-a','piece-b'])

    def test_physical_routes_and_shared_landings_are_unique(self):
        metadata=b6.stair_metadata(source_stair_fixture());plans=metadata['plans']
        ids=[s['id'] for p in plans for s in p['segments']]
        self.assertEqual(len(ids),36);self.assertEqual(len(set(ids)),36)
        self.assertFalse(any(i.startswith('p01') and i.endswith('centre') for i in ids))
        self.assertFalse(any(i.startswith('n06') and not i.endswith('centre') for i in ids))
        shared={}
        for plan in plans:
            for segment in plan['segments']:
                self.assertAlmostEqual((metadata['levels'][segment['upperLevelKey']]-metadata['levels'][segment['lowerLevelKey']])/len(segment['riserPositions']),.15)
            for surface in plan['landings']:
                encoded=json.dumps(surface,sort_keys=True)
                if surface['id'] in shared:self.assertEqual(shared[surface['id']],encoded)
                shared[surface['id']]=encoded
                shape=Polygon(surface['loops'][0],surface['loops'][1:])
                self.assertAlmostEqual(shape.area,sum(Polygon(t).area for t in surface['triangles']),places=5)

    def test_p01_east_landing_bridges_only_centre_and_not_last_side_treads(self):
        shape=b6.mezzanine_landing_shape('p01','east')
        spec=b6.core_spec('p01','east')
        for side in ['left','right']:
            left,right=spec['lanes'][side]
            last_tread=box(left,spec['run'][1]-.30,right,spec['run'][1])
            self.assertLess(shape.intersection(last_tread).area,.002)
        left,right=b6.CORE['east']['lanes']['centre']
        connector=box(left+.002,14.50,right-.002,14.66)
        self.assertLess(connector.difference(shape).area,1e-8)
        self.assertTrue(shape.covers(Point(53.727,15)))
        self.assertFalse(shape.covers(Point(56.494,14.55)))
        self.assertFalse(shape.covers(Point(50.964,14.55)))

    def test_final_coverage_resolves_late_junction_but_keeps_real_gap(self):
        edges=[line('resolved',[0,0],[0,2],b6.geom.STRONG),line('gap',[2,0],[2,2],b6.geom.STRONG)]
        solids=b6.geom.serialize_solids(box(0,0,.2,2),'fixture','wall',0,3)
        candidates=[{'entity':q.id,'reason':'early candidate'} for q in edges]
        remaining,resolved=b6.final_edge_coverage(candidates,edges,solids)
        self.assertEqual([q['entity'] for q in resolved],['resolved'])
        self.assertEqual([q['entity'] for q in remaining],['gap'])
        self.assertAlmostEqual(remaining[0]['remainingLength'],2)

    def test_overlay_identity_and_roof_legend_are_b6(self):
        title=b6.overlay_title('n07')
        self.assertIn('B6 n07',title);self.assertNotIn('B1',title)
        self.assertIn('roof perimeter',title)

    def test_corner_block_requires_four_measured_boundaries(self):
        lines=[line('outer-h',[0,0],[2,0],b6.geom.STRONG),line('outer-v',[0,0],[0,2],b6.geom.STRONG),
               line('inner-h',[.375,.375],[2,.375],b6.geom.STRONG),line('inner-v',[.375,.375],[.375,2],b6.geom.STRONG)]
        shape,handles=b6.measured_corner_face(lines,'outer-h','outer-v')
        self.assertAlmostEqual(shape.area,.375**2)
        self.assertEqual(set(handles),{q.id for q in lines})
        with self.assertRaisesRegex(ValueError,'lacks measured inner'):
            b6.measured_corner_face(lines[:2],'outer-h','outer-v')

    def test_corner_does_not_connect_nonmeeting_edges(self):
        lines=[line('h',[1,0],[2,0],b6.geom.STRONG),line('v',[0,1],[0,2],b6.geom.STRONG)]
        with self.assertRaisesRegex(ValueError,'do not meet'):
            b6.measured_corner_face(lines,'h','v')

    def test_candidate_join_cannot_fill_a_room_or_shaft_accounting_polygon(self):
        candidate=box(0,0,.375,.375)
        with patch.object(b6,'measured_corner_face',return_value=(candidate,['h','v','ih','iv'])), \
                patch.object(b6,'measured_t_face',return_value=(GeometryCollection(),[])), \
                self.assertRaisesRegex(ValueError,'intrudes into a source room'):
            b6.complete_b6_wall_joins('n02',[],GeometryCollection(),box(0,0,1,1))

    def test_t_join_is_only_measured_wall_thickness_and_branch_gap(self):
        lines=[line('outer',[3,0],[3,4],b6.geom.STRONG),line('lower',[0,1],[2.625,1],b6.geom.STRONG),
               line('upper',[0,1.125],[2.625,1.125],b6.geom.STRONG)]
        shape,handles=b6.measured_t_face(lines,'outer',1,1.125)
        self.assertEqual(shape.bounds,(2.625,1.0,3.0,1.125))
        self.assertEqual(set(handles),{'outer','lower','upper'})

    def test_one_retaining_panel_is_buried_and_low_without_reclassifying_others(self):
        lines=[line('1072',[2.093803,19.714404],[2.093803,16.724404]),
               line('1073',[2.468804,19.714404],[2.468804,16.724404])]
        item=b6.retaining_panel('n01',lines)
        self.assertEqual(item['bottom'],-3);self.assertEqual(item['top'],-1.05)
        self.assertAlmostEqual(item['geometry'].area, .375*2.99,places=5)
        self.assertIsNone(b6.retaining_panel('n02',lines))
        self.assertIn('IPR',item['heightBasis'])

    def test_exterior_entry_first_nose_matches_selected_photogrammetry_band(self):
        rise=(b6.level('n01.mezzanine')-b6.ENTRY_LOWER)/len(b6.ENTRY_FRONTS)
        self.assertAlmostEqual(rise,.175)
        world_first=b6.ENTRY_LOWER+rise+.6962777093118497
        self.assertGreaterEqual(world_first,.19);self.assertLessEqual(world_first,.345)

    def test_existing_lower_portals_cut_upper_wall_and_slab_but_keep_lintel(self):
        data={'lines':[line('970',[12,-.0856],[20,-.0856],b6.geom.STRONG),line('971',[12,.1644],[20,.1644],b6.geom.STRONG)]}
        doors=[{'id':'n05-door-'+h,'sourceEntities':[h], 'hinge':[x,.2644],'closedEnd':[x+.84,.2644]}
               for h,x in zip(['4D34','4D3E','4D61','4D77'],[14.4,15.24,16.17,17.01])]
        portals=b6.upper_annex_portals(data,doors);self.assertEqual(len(portals),4)
        wall=box(12,-.0856,20,.1644)
        cut_wall=b6.geom.wall_bands(wall,[{'cut':p['geometry'],'bottom':p['bottom'],'top':p['top']} for p in portals],15,17.8,'fixture')
        point=Point(14.8,0)
        self.assertFalse(any(s['bottom']<15.3<s['top'] and Polygon(s['loops'][0]).covers(point) for s in cut_wall))
        self.assertTrue(any(s['bottom']<16<s['top'] and Polygon(s['loops'][0]).covers(point) for s in cut_wall))
        slab=box(12,-.0856,20,.3644)
        self.assertFalse(b6.clip_slab_at_portals(slab,14.8,15,portals).covers(point))
        self.assertTrue(b6.clip_slab_at_portals(slab,17.8,18,portals).covers(point))
        self.assertTrue(b6.clip_slab_at_portals(slab,14.8,15,portals).covers(Point(13,0)))

    def test_missing_lower_portal_does_not_create_an_approximate_opening(self):
        data={'lines':[line('970',[12,-.0856],[20,-.0856],b6.geom.STRONG),line('971',[12,.1644],[20,.1644],b6.geom.STRONG)]}
        with self.assertRaisesRegex(ValueError,'four actual'):
            b6.upper_annex_portals(data,[])

    def test_4a4_continuation_keeps_room_and_perpendicular_window_clear(self):
        lines=[line('4A4',[2.875,-.46],[2.875,3],b6.geom.STRONG),line('683',[2.5,.65],[2.5,1.25],b6.geom.STRONG),
               line('703',[0,.65],[2.5,.65],b6.geom.STRONG),line('70A',[0,0],[2.29,0],b6.geom.STRONG),
               line('6EA',[2.29,-.46],[2.29,0],b6.geom.STRONG)]
        shape,handles=b6.p01_facade_continuation(lines)
        self.assertAlmostEqual(shape.area,.24375)
        self.assertEqual(set(handles),{q.id for q in lines})
        self.assertLess(shape.intersection(box(0,.65,2.5,3)).area,1e-9)
        self.assertLess(shape.intersection(box(0,-.15,2.29,.15)).area,1e-9)
        self.assertFalse(shape.covers(Point(2.4,.3)))

    def test_canopy_is_collision_cover_not_ground_cutting_slab(self):
        feature=b6.exterior_feature('cover',box(0,0,4,5),'canopy','roof',b6.ENTRY_CANOPY_TOP-.1,b6.ENTRY_CANOPY_TOP,['source'],'fixture')
        solids=b6.feature_solids([feature],'n01')
        self.assertTrue(all(s['role']=='canopy' and s['collision'] for s in solids))
        self.assertGreaterEqual(min(s['bottom'] for s in solids)-b6.level('n01.mezzanine'),1.9)
        self.assertGreaterEqual(b6.ENTRY_CANOPY_TOP-.2-b6.level('n01.mezzanine'),1.9)

    def test_basement_shell_stops_below_terrace_without_cutting_inner_sill_or_door(self):
        wall=box(0,0,4,2);cover=box(1,1,3,2);mezz=box(-1,-1,5,3)
        feature=b6.exterior_feature('b06-east-mezz-terrace',cover,'canopy','concrete',.8687223,1.0187223,['source'],'fixture')
        opening={'cut':box(1.5,.8,2.5,2.2),'bottom':-1.5,'top':.6}
        remaining,solids=b6.terrace_soffit_walls('p01',wall,mezz,[opening],[feature])
        self.assertTrue(remaining.covers(Point(2,.5)))
        self.assertFalse(remaining.covers(Point(2,1.5)))
        self.assertTrue(solids)
        self.assertTrue(all(s['top']<=.8687223 for s in solids))
        at_door=[s for s in solids if Polygon(s['loops'][0],s['loops'][1:]).covers(Point(2,1.5))]
        self.assertFalse(any(s['bottom']<0<s['top'] for s in at_door))
        self.assertTrue(any(s['bottom']<=.7<s['top'] for s in at_door))
        upper,extras=b6.terrace_soffit_walls('n01',wall,mezz,[opening],[feature])
        self.assertTrue(upper.equals(wall));self.assertEqual(extras,[])

    def test_east_cover_preserves_lower_door_head_and_records_real_drop(self):
        _,head=b6.geom.opening_vertical_span('door',b6.level('p01.mezzanine'),b6.ceiling('p01.mezzanine'))
        self.assertGreater(b6.EAST_TERRACE_TOP-.20-head,.20)
        self.assertAlmostEqual(b6.level('n01.mezzanine')-b6.EAST_TERRACE_TOP,.4812777)

    def test_portico_support_replaces_same_level_once_not_canopy_shadow(self):
        floor=box(0,0,5,5)
        support=b6.exterior_feature('porch',box(0,0,1,5),'slab','floor',-.2,0,[],'fixture')
        roof=b6.exterior_feature('cover',box(2,0,3,5),'canopy','roof',3.6,3.7,[],'fixture')
        remaining=b6.reserve_exterior_support(floor,[support,roof],'n01',0)
        self.assertAlmostEqual(remaining.area,20)
        self.assertTrue(remaining.covers(Point(2.5,2)))
        self.assertTrue(b6.reserve_exterior_support(floor,[support,roof],'p01',-3).equals(floor))
        self.assertLess(remaining.intersection(support['geometry']).area,1e-9)

    def test_buried_chamber_is_closed_below_observed_ground_without_entry(self):
        room=box(0,0,3,6);envelope=room.buffer(.10,join_style=2)
        chamber=b6.buried_chamber({'rooms':[{'sourceEntity':'A5A','geometry':room}]},envelope)
        self.assertEqual(chamber['bottom'],-3)
        self.assertAlmostEqual(chamber['coverTop']+.6962777093118497,-1.60)
        self.assertLess(chamber['coverTop']+.6962777093118497,-1.439)
        self.assertTrue(chamber['terrainPreservationRequired'])
        self.assertTrue(chamber['geometry'].equals(envelope))

    def test_chamber_mask_cannot_expand_to_connected_main_building(self):
        room=box(0,0,3,6)
        with self.assertRaisesRegex(ValueError,'isolated source chamber'):
            b6.buried_chamber({'rooms':[{'sourceEntity':'A5A','geometry':room}]},box(-5,-5,10,10))

    def test_mezzanine_zone_does_not_cut_adjacent_main_room(self):
        bedroom={'id':'124','sourceEntity':'ordinary','geometry':box(47.5,10.4,49.925,16.2)}
        front={'id':'147','sourceEntity':'annex','geometry':box(13,-5,19,.264)}
        region=b6.mezzanine_region('n02',{'rooms':[bedroom,front]})
        self.assertLess(region.intersection(bedroom['geometry']).area,1e-9)
        self.assertTrue(region.covers(Point(16,-2)))
        self.assertFalse(region.covers(Point(35,15)))

    def test_roof_and_tall_last_mezzanine_ceiling_follow_ipr_interpretation(self):
        self.assertEqual(b6.level('n07.annexRoof'),18)
        self.assertEqual(b6.ceiling('n05.mezzanine'),17.8)
        self.assertEqual(b6.LEVELS['n06'],{'main':15})
        self.assertEqual((b6.level('n07.westHeadRoof'),b6.level('n07.eastHeadRoof')),(21.41,20.5))

    def test_source_roof_is_used_without_an_extra_residential_floor(self):
        outline=box(0,0,70,16).union(box(12,-6,20,0));heads=box(9,4,12,7).union(box(57,10,60,13))
        floors=[{'id':'n07','solids':[]}]
        b6.attach_roofs(floors,{'n07':{'footprint':heads}}, {'roofOutline':outline,'roofOutlineEntity':'source'})
        solids=floors[0]['solids']
        deck=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in solids if s['top']==18])
        self.assertLess(deck.symmetric_difference(outline).area,1e-8)
        self.assertTrue(all(s['role']=='slab' for s in solids))
        self.assertEqual(len(floors[0]['roofHeadFootprint']),2)

    def test_small_floor_pipeline_keeps_room_wall_and_real_window(self):
        room=box(30,6,34,10);outer=box(29.8,5.8,34.2,10.2)
        lines=[]
        for label,polygon in [('inner',room),('outer',outer)]:
            pts=list(polygon.exterior.coords)
            lines += [line(f'{label}-{i}',a,c,b6.geom.STRONG) for i,(a,c) in enumerate(zip(pts,pts[1:]))]
        lines += [line('pane-a',[31,5.86],[33,5.86],'3-OKNA'),line('pane-b',[31,5.92],[33,5.92],'3-OKNA')]
        data={'lines':lines,'rooms':[{'id':'101','sourceEntity':'room','geometry':room}],'roomUnion':room,'columns':[],'columnCovers':[]}
        interior={'plans':[],'levels':b6.all_levels()};exterior={'plans':[],'levels':b6.all_levels()}
        # This tiny generic-room fixture intentionally has no identified B6
        # outer-corner source entities; their strict helpers are tested above.
        with patch.object(b6,'complete_b6_wall_joins',side_effect=lambda floor,lines,wall,rooms:(wall,[])):
            floor,audit,drawing=b6.prepare_floor('n02',data,[],interior,exterior)
        self.assertEqual(len(floor['rooms']),1);self.assertEqual(len(floor['windows']),1)
        self.assertTrue(any(s['role']=='slab' for s in floor['solids']))
        point=Point(32,5.9);height=4.4
        self.assertFalse(any(s['role']=='wall' and s['bottom']<height<s['top'] and Polygon(s['loops'][0],s['loops'][1:]).covers(point) for s in floor['solids']))


class B6PhotoShellTests(unittest.TestCase):
    def window_fixture(self, cap=True):
        data={'rooms':[
            {'id':'104','sourceEntity':'A31','geometry':box(27.628804,.384403,29.928803,6.364403)},
            {'id':'105','sourceEntity':'A26','geometry':box(30.028803,.384403,32.328803,6.364403)}],
            'lines':[line('F5A',[27.751002,.239404],[32.151002,.239404],'3-OKNA'),
                     line('F5B',[27.751002,.189403],[32.151002,.189403],'3-OKNA'),
                     line('5EC',[30.028803,.189403],[30.028803,5.054403],b6.geom.STRONG),
                     line('5ED',[29.928803,.189403],[29.928803,5.054403],b6.geom.STRONG)]}
        if cap:data['lines'].append(line('94C',[29.928803,.189403],[30.028803,.189403],b6.geom.STRONG))
        b6.annotate_room_usage(data,'n02')
        return data,{'id':'n02-window-F5A','a':[27.751002,.2144035],'b':[32.151002,.2144035],
                     'sourceEntities':['F5A','F5B']}

    def test_room_usage_does_not_turn_annex_sink_only_or_basement_into_bedrooms(self):
        room={'id':'104','sourceEntity':'source','geometry':box(27.629,.384,29.929,6.364)}
        self.assertEqual(b6.room_usage('n02',room)[0],'bedroom')
        self.assertEqual(b6.room_usage('p01',room)[0],'other')
        for identifier in ('143','145a','147'):
            self.assertEqual(b6.room_usage('n02',{**room,'id':identifier})[0],'other')
        self.assertEqual(b6.room_usage('n02',{**room,'geometry':box(0,0,2.3,6)})[0],'other')
        for identifier,usage in [('144b','bathroom'),('121a','wc'),('191','corridor')]:
            self.assertEqual(b6.room_usage('n02',{**room,'id':identifier})[0],usage)

    def test_measured_sanitary_strokes_group_without_merging_adjacent_basins(self):
        room={'id':'144b','geometry':box(0,0,3,6)}
        equipment=[]
        for i,y in enumerate((1,1.70425)):
            for label,shape in [('outer',box(.1,y-.3,.55,y+.3)),('inner',box(.14,y-.26,.51,y+.26))]:
                equipment.append((f'{i}-{label}',LineString(shape.exterior.coords)))
        fixtures=b6.sanitary_fixtures(room,equipment)
        self.assertEqual(len(fixtures),2)
        for i,item in enumerate(fixtures):
            self.assertEqual(item['kind'],'basin');self.assertEqual(item['size'],[.6,.45])
            self.assertEqual(item['facingCad'],[1,0])
            self.assertEqual(item['sourceEntities'],[f'{i}-inner',f'{i}-outer'])
        self.assertEqual(fixtures[0]['boundsCad'],[.1,.7,.55,1.3])

    def test_unknown_sanitary_symbol_is_not_invented_or_repeated(self):
        with self.assertRaisesRegex(ValueError,'Unknown B6 sanitary symbol'):
            b6.sanitary_fixtures({'id':'144b','geometry':box(0,0,3,6)},[('unknown',LineString(box(.1,.1,1.1,1.1).exterior.coords))])

    def test_source_room_pair_retains_only_the_full_swing_as_active(self):
        room={'id':'104','sourceEntity':'A31','usage':'bedroom','geometry':box(0,0,2.3,6)}
        data={'rooms':[room,{'usage':'corridor','geometry':box(0,6.125,2.3,8)}]}
        doors=[{'id':'short','hinge':[.5,6.125],'closedEnd':[1.125,6.125],'openEnd':[1.059017,6.404508]},
               {'id':'full','hinge':[1.75,6.125],'closedEnd':[1.125,6.125],'openEnd':[1.75,6.75]},
               {'id':'entry','hinge':[8,6.125],'closedEnd':[9,6.125],'openEnd':[8,7.125]}]
        b6.annotate_bedroom_door_pairs(data,doors)
        self.assertEqual(doors[0]['openingClassification'],'fixed-paired-door-leaf')
        self.assertEqual(doors[0]['pairedDoorId'],'full');self.assertEqual(doors[1]['pairedDoorId'],'short')
        self.assertNotIn('openingClassification',doors[1]);self.assertNotIn('pairedDoorRole',doors[2])
        self.assertEqual(doors[0]['closedEnd'],[1.125,6.125])
        doors[0]['openEnd']=[.5,6.75]
        with self.assertRaisesRegex(ValueError,'Ambiguous active bedroom leaf'):b6.annotate_bedroom_door_pairs(data,doors)

    def test_two_room_window_keeps_actual_100mm_partition_and_frame_plane(self):
        data,window=self.window_fixture()
        children,keep=b6.split_bedroom_window(window,data)
        self.assertEqual(len(children),2)
        self.assertEqual([c['roomId'] for c in children],['104','105'])
        self.assertEqual([c['paneCount'] for c in children],[2,2])
        self.assertAlmostEqual(children[1]['a'][0]-children[0]['b'][0],.1)
        for c in children:
            self.assertEqual(c['windowPlaneNormalOffset'],0)
            self.assertAlmostEqual(c['a'][1],window['a'][1],delta=.000001)
            self.assertEqual(c['parentWindowId'],window['id'])
        self.assertTrue(keep.covers(Point(29.978803,.214404)))
        self.assertFalse(keep.covers(Point(29.978803,.14)), 'do not extend the source wall to the outer sill face')

    def test_partition_without_cap_requires_both_faces_end_at_source_frame(self):
        data,window=self.window_fixture(cap=False)
        children,keep=b6.split_bedroom_window(window,data)
        self.assertEqual(len(children),2);self.assertIn('F5B',children[0]['partitionSourceEntities'])
        data['lines'][2]=line('5EC',[30.028803,.20],[30.028803,5.054403],b6.geom.STRONG)
        children,keep=b6.split_bedroom_window(window,data)
        self.assertEqual(len(children),1);self.assertTrue(keep.is_empty)

    def test_window_cut_preserves_source_wall_instead_of_only_changing_labels(self):
        data,window=self.window_fixture()
        _,partition=b6.split_bedroom_window(window,data)
        wall=partition.union(box(27.151,-.060596,32.751,.384403))
        openings,windows,_=b6.opening_descriptors('n02',data,wall,GeometryCollection(),[])
        self.assertEqual(len(windows),2)
        self.assertEqual(sum(o['kind']=='window-sill-cut' for o in openings),2)
        opening=next(o for o in openings if o['kind']=='window')
        witness=Point(29.978803,.214404)
        self.assertTrue(opening['bridge'].covers(witness))
        self.assertFalse(opening['cut'].covers(witness))
        bands=b6.geom.wall_bands(wall,openings,3,5.8,'fixture')
        solid=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in bands if s['bottom']<4.5<s['top']])
        self.assertTrue(solid.covers(witness))
        self.assertFalse(solid.covers(Point(29,.214404)))
        self.assertFalse(solid.covers(Point(31,.214404)))

    def test_sanitary_or_single_room_windows_do_not_acquire_bedroom_split(self):
        data,window=self.window_fixture()
        for room in data['rooms']:room['usage']='bathroom'
        children,keep=b6.split_bedroom_window(window,data)
        self.assertEqual(len(children),1);self.assertTrue(keep.is_empty)

    def test_room_finish_covers_exact_slab_intersection_without_stair_or_other_level(self):
        room={'levelKey':'n02.main','loops':[[[0,0],[4,0],[4,4],[0,4]]]}
        hole=box(1,1,2,3);supported=box(0,0,4,4).difference(hole)
        solids=b6.geom.serialize_solids(supported,'floor','slab',2.8,3,'floor')
        solids+=b6.geom.serialize_solids(hole,'lower-floor','slab',1.3,1.5,'floor')
        solids+=b6.geom.serialize_solids(hole,'landing','stair-landing',2.8,3,'floor')
        b6.room_floor_finishes([room],solids)
        triangles=unary_union([Polygon(t) for t in room['finishTriangles']])
        self.assertAlmostEqual(room['finishAreaM2'],14)
        self.assertAlmostEqual(triangles.symmetric_difference(supported).area,0)
        self.assertAlmostEqual(triangles.intersection(hole).area,0)
        self.assertEqual(room['loops'],[[[0,0],[4,0],[4,4],[0,4]]])


    def test_understairs_finish_has_one_owner_without_changing_accounting_rooms(self):
        corridor={'sourceEntity':'8F6','usage':'corridor','levelKey':'n02.main','loops':[[[0,0],[4,0],[4,4],[0,4]]]}
        under={'sourceEntity':'8EB','usage':'other','levelKey':'n02.main','loops':[[[1,1],[2,1],[2,3],[1,3]]]}
        solids=b6.geom.serialize_solids(box(0,0,4,4),'floor','slab',2.8,3,'floor')
        b6.room_floor_finishes([corridor,under],solids)
        a=unary_union([Polygon(t) for t in corridor['finishTriangles']])
        b=unary_union([Polygon(t) for t in under['finishTriangles']])
        self.assertAlmostEqual(a.intersection(b).area,0)
        self.assertAlmostEqual(a.union(b).area,16)
        self.assertEqual(corridor['loops'],[[[0,0],[4,0],[4,4],[0,4]]])


class B6RearSourceTests(unittest.TestCase):
    def test_two_observed_slopes_have_explicit_estimated_counts_and_ground_foot(self):
        rear=b6.rear_exterior_metadata();route=rear['plans'][0]
        self.assertEqual(len(route['segments']),2)
        self.assertAlmostEqual(rear['anchors']['exterior.rear.lower']+b6.B6_PHOTO_ORIGIN_Y,-1.0655)
        self.assertAlmostEqual(rear['anchors']['exterior.rear.mid']+b6.B6_PHOTO_ORIGIN_Y,.32)
        for segment in route['segments']:
            self.assertFalse(segment['sourceFrontsMeasured']);self.assertEqual(len(segment['frontEdgesCad']),8)
            self.assertGreater(min(np.diff(segment['riserPositions'])),.2)
            rise=(rear['anchors'][segment['upperLevelKey']]-rear['anchors'][segment['lowerLevelKey']])/8
            self.assertTrue(.17<rise<.18)
        self.assertEqual(route['upperSupportSolidId'],'b06-east-mezz-terrace')
        self.assertEqual(len(route['landings']),2,'canopy is not duplicated as another upper landing')

    def test_terrace_reaches_ipr_envelope_and_supports_terminal_without_covering_last_tread(self):
        route=b6.rear_exterior_metadata()['plans'][0];segment=route['segments'][-1];edges=segment['frontEdgesCad']
        deck=b6.rear_terrace_shape();last=Polygon([edges[-2][0],edges[-2][1],edges[-1][1],edges[-1][0]])
        self.assertGreater(deck.bounds[3],20.2);self.assertTrue(19<deck.area<21)
        self.assertLess(LineString(edges[-1]).difference(deck.buffer(.001)).length,.001)
        self.assertLess(deck.intersection(last).area,.002)
        self.assertTrue(deck.covers(Point(53.7,17.5)))

    def test_rear_terrain_mask_does_not_erase_terrace_shadow_or_surrounding_lawn(self):
        rear=b6.rear_exterior_metadata()
        self.assertEqual(rear['terrainCutouts'],[], 'raised open flights must retain ground beneath their whole footprint')
        self.assertTrue(rear['plans'][0]['terrainValidationPending'])
        sign=b6.rear_sign();self.assertGreater(sign['a'][0],sign['b'][0]);self.assertAlmostEqual(sign['top']-sign['bottom'],.7)

    def test_shower_cap_keeps_perimeter_and_measured_half_metre_openings(self):
        lines=[];shapes=[]
        for i,(lo,hi,slo,shi) in enumerate([(6.908802,7.493768,7.232103,7.332103),(7.993767,8.578803,8.155502,8.255502)]):
            for suffix,a,c in [('bar',[lo,5.114403],[hi,5.114403]),('left',[lo,5.114403],[lo,5.214403]),
                               ('right',[hi,5.114403],[hi,5.214403]),('stem-a',[slo,5.214403],[slo,6.114403]),('stem-b',[shi,5.214403],[shi,6.114403])]:
                lines.append(line(str(i)+suffix,a,c,b6.geom.STRONG))
            shapes += [box(lo,5.114403,hi,5.214403),box(slo,5.214403,shi,6.114403)]
        room={'id':'144b','sourceEntity':'A80','usage':'bathroom','geometry':box(6.409,.364,9.079,6.114),
              'sanitaryFixtures':[{'kind':'shower','centerCad':[x,5.664403],'boundsCad':[x-.36165,5.264403,x+.36165,6.064403],'facingCad':[0,-1]}
                                  for x in (6.820453,7.743803,8.667153)]}
        perimeter=unary_union([box(6.309,.264,6.409,6.314),box(9.079,.264,9.179,6.314),box(6.409,6.114403,9.079,6.314)])
        wall=unary_union(shapes+[perimeter]);before=room['geometry'].wkt
        remaining,solids,notes=b6.capped_shower_walls('n02',{'rooms':[room],'lines':lines},wall,GeometryCollection(),[])
        self.assertEqual(len(notes),2);self.assertTrue(all(abs(s['top']-5.05)<1e-6 for s in solids))
        self.assertTrue(remaining.covers(Point(6.36,5.16)));self.assertTrue(remaining.covers(Point(8,6.25)))
        self.assertFalse(remaining.covers(Point(7.28,5.5)))
        retained=remaining.union(unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in solids]))
        self.assertLess(retained.symmetric_difference(wall).area,.001)
        self.assertFalse(retained.covers(Point(6.65,5.1644)));self.assertEqual(room['geometry'].wkt,before)


class B6ShellRevision2Tests(unittest.TestCase):
    def test_slab_top_partitions_cover_rooms_and_remainder_once_with_holes(self):
        slab=box(0,0,6,4).difference(box(2,1,4,3));solids=b6.geom.serialize_solids(slab,'floor','slab',2.8,3,'floor')
        original=json.loads(json.dumps(solids[0]));rooms=[]
        for ident,shape,usage in [('left',box(0,0,3,4),'bedroom'),('right',box(3,0,5,4),'corridor')]:
            rooms.append({'id':ident,'sourceEntity':ident,'levelKey':'n02.main','usage':usage,
                          'finishTriangles':b6.surface_triangles(shape.intersection(slab))})
        floor={'id':'n02','rooms':rooms,'solids':solids};b6.partition_slab_tops(floor)
        parts=solids[0]['topSurfacePartitions'];triangles=[Polygon(t) for p in parts for t in p['triangles']]
        whole=unary_union(triangles)
        self.assertAlmostEqual(whole.symmetric_difference(slab).area,0)
        self.assertAlmostEqual(sum(t.area for t in triangles),20)
        self.assertAlmostEqual(whole.intersection(box(2,1,4,3)).area,0)
        self.assertEqual(sum(p['role']=='floor-finish' for p in parts),2)
        self.assertAlmostEqual(sum(Polygon(t).area for p in parts if p['role']=='slab' for t in p['triangles']),4)
        self.assertEqual({k:solids[0][k] for k in original},original,'original volume, side/bottom inputs and height stay unchanged')

    def test_slab_top_keeps_tiny_remainder_and_ignores_other_elevations(self):
        shape=box(0,0,1,1);tiny=box(.999,.999,1,1);solid=b6.geom.serialize_solids(shape,'tiny','slab',2.8,3,'floor')[0]
        room={'id':'room','sourceEntity':'room','usage':'bedroom','levelKey':'n02.main',
              'finishTriangles':b6.surface_triangles(shape.difference(tiny))}
        floor={'id':'n02','rooms':[room],'solids':[solid]};b6.partition_slab_tops(floor)
        remainder=[Polygon(t) for p in solid['topSurfacePartitions'] if p['role']=='slab' for t in p['triangles']]
        self.assertAlmostEqual(sum(t.area for t in remainder),.000001,places=10)
        room['levelKey']='n01.main';b6.partition_slab_tops(floor)
        self.assertEqual(len(solid['topSurfacePartitions']),1)
        self.assertEqual(solid['topSurfacePartitions'][0]['role'],'slab')

    def test_slab_top_rejects_conflicting_accepted_room_finishes(self):
        floor={'id':'n02','solids':b6.geom.serialize_solids(box(0,0,3,2),'overlap','slab',2.8,3,'floor'),
               'rooms':[{'id':str(i),'sourceEntity':str(i),'usage':'bedroom','levelKey':'n02.main',
                         'finishTriangles':b6.surface_triangles(shape)} for i,shape in enumerate([box(0,0,2,2),box(1,0,3,2)])]}
        with self.assertRaisesRegex(ValueError,'Overlapping accepted'):b6.partition_slab_tops(floor)

    def test_sill_volume_replaces_wall_cap_and_retains_the_thin_room_partition(self):
        data,window=B6PhotoShellTests().window_fixture()
        _,partition=b6.split_bedroom_window(window,data)
        wall=b6.geom.clean(partition.union(box(27.151,-.060596,32.751,.384403)))
        openings,windows,_=b6.opening_descriptors('n02',data,wall,GeometryCollection(),[])
        solids=b6.geom.wall_bands(wall,openings,3,5.8,'fixture')
        caps=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in solids if s['top']==3.9])
        at_sill=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in solids if s['bottom']<3.88<s['top']])
        self.assertTrue(at_sill.covers(Point(29.978803,.214403)))
        for child in windows:
            sill=child['sill'];shape=Polygon(sill['loops'][0],sill['loops'][1:])
            self.assertAlmostEqual(caps.intersection(shape).area,0)
            self.assertAlmostEqual(at_sill.intersection(shape).area,0)
            self.assertAlmostEqual(shape.intersection(partition).area,0)
            self.assertAlmostEqual(sum(Polygon(t).area for t in sill['triangles']),shape.area)
            self.assertEqual((sill['bottom'],sill['top']),(3.865,3.9))

    def test_annex_short_jambs_do_not_use_parallel_half_metre_projection(self):
        w={'id':'n05-window-F7D','a':[15.241349,-5.563095],'b':[17.116256,-5.563095],
           'sourceEntities':['F7D','F7E'],'depth':.5,'normalOffset':-.1879,'bottom':14.4,'top':15.9}
        lines=[line('F77',[15.241349,-5.500594],[15.241349,-5.625594]),
               line('F73',[17.116256,-5.500594],[17.116256,-5.618433]),
               line('F7F',[13.388023,-6.000595],[18.969584,-6.000595]),
               line('F7B',[13.357326,-5.750595],[19.000279,-5.750595])]
        w['frameJamb']=b6.measured_window_jamb(w,lines)
        sill,shape=b6.window_sill(w)
        self.assertEqual(set(w['frameJamb']['sourceEntities']),{'F77','F73'})
        self.assertAlmostEqual(w['frameJamb']['depth'],.125)
        self.assertAlmostEqual(sill['width'],.225)
        self.assertAlmostEqual(sill['a'][1],-5.563094,places=6)
        self.assertEqual(w['depth'],.5,'surrounding reveal is a separate retained observation')
        self.assertGreater(shape.bounds[1],-5.68)

    def last_facade_fixture(self):
        profile=box(50.125,16.034,57.329,16.284);floors=[]
        for fid,base in [('n05',14.4),('n06',15.9)]:
            windows=[];openings=[]
            for i,(a,c) in enumerate([(54.853803,52.600304),(52.450303,50.200304),(57.253802,55.003803)]):
                source=(['D17','D19','D1B'] if fid=='n05' else ['CE6','CE8','CEA'])[i]
                w={'id':fid+'-'+source,'sourceEntities':[source],'a':[a,16.209403],'b':[c,16.209403],
                   'bottom':base,'top':base+1.5,'normalOffset':.0504,'depth':.25}
                w['sill']=b6.window_sill(w)[0] if fid=='n05' else None
                windows.append(w);openings.append({'cut':b6.geom.opening_cut(w['a'],w['b'],-.0746,.1754,True),'bottom':base,'top':base+1.5})
            solids=b6.geom.wall_bands(profile,openings,13.5 if fid=='n05' else 15,17.8,fid)
            if fid=='n06':solids+=b6.geom.serialize_solids(profile,'n06-front','slab',14.8,15,'floor')
            untouched=b6.geom.serialize_solids(box(60,5,61,6),fid+'-untouched','wall',15,17.8)
            solids+=untouched
            floors.append({'id':fid,'rooms':[],'windows':windows,'solids':solids,
                           'levelRegions':[{'levelKey':'n05.mezzanine','loops':[[[49.875,14.499],[57.579,14.499],[57.579,16.6],[49.875,16.6]]]}]})
        return floors

    def test_last_facade_opens_all_existing_z_and_removes_only_duplicate_owned_volume(self):
        floors=self.last_facade_fixture();before=[next(s for s in f['solids'] if 'untouched' in s['id']) for f in floors]
        note=b6.resolve_last_east_facade(floors)
        self.assertGreater(note['openingRemovedVolumeM3'],0);self.assertGreater(note['duplicateRemovedVolumeM3'],0)
        for z in [14.5,14.9,15.4,15.95,16.5,17.3]:
            self.assertFalse(any(Polygon(s['loops'][0],s['loops'][1:]).covers(Point(51.3253,16.209403))
                for f in floors for s in f['solids'] if s['bottom']<z<s['top']))
        for z in [15.1,15.8,16.5,17.6]:
            shapes=[unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in f['solids'] if s['bottom']<z<s['top']]) for f in floors]
            self.assertAlmostEqual(shapes[0].intersection(shapes[1]).intersection(box(49,14,58,17)).area,0)
        for f,original in zip(floors,before):self.assertIn(original,f['solids'])
        self.assertTrue(all(w['sill'] is None and w['facadeOwnerFloor']=='n05' for w in floors[1]['windows']))
        self.assertEqual([(w['bottom'],w['top']) for w in floors[0]['windows']],[(14.4,15.9)]*3)

    def test_last_facade_refuses_unmatched_source_positions(self):
        floors=self.last_facade_fixture();floors[1]['windows'][0]['a'][1]+=.1
        with self.assertRaisesRegex(ValueError,'continuity'):b6.resolve_last_east_facade(floors)


class B6DoorFrameOwnershipTests(unittest.TestCase):
    @staticmethod
    def source_pair():
        return [
            {'id':'n02-door-468B','hinge':[21.940103,6.489404],'closedEnd':[21.315103,6.489404],
             'openEnd':[21.940103,7.114403],'sourceEntities':['468B','468A'],'pairedDoorId':'n02-door-46A1',
             'bottom':3,'top':5.1,'depth':.125,'normalOffset':.0629},
            {'id':'n02-door-46A1','hinge':[20.690104,6.489404],'closedEnd':[21.315064,6.489404],
             'openEnd':[21.249121,6.768912],'sourceEntities':['46A1','46A0'],'pairedDoorId':'n02-door-468B',
             'bottom':3,'top':5.1,'depth':.125,'normalOffset':-.0629,'openingClassification':'fixed-paired-door-leaf'}]

    @staticmethod
    def entry():
        return {'id':'n01-door-12E1','hinge':[12.975616,-3.462369],'closedEnd':[12.828549,-2.674438],
            'openEnd':[12.131954,-3.565958],'sourceEntities':['12E1','12C0'],
            'bottom':1.5,'top':3.6,'depth':.356,'normalOffset':.0251}

    @staticmethod
    def shape(solid):return Polygon(solid['loops'][0],solid['loops'][1:])

    def test_measured_12e1_header_replaces_wall_volume_across_floor_and_keeps_rest(self):
        door=self.entry();before=json.dumps(door,sort_keys=True)
        floor={'id':'n01','doors':[door],'rooms':[],'solids':[]}
        raw=b6.door_frame_profiles(floor)
        header=next(p for p in raw if p['bottom']==3.6)
        wall=header['geometry'].buffer(.20,join_style=2)
        # Legacy header occupies 100% of this uncut structural fixture.
        self.assertAlmostEqual(wall.intersection(header['geometry']).area/header['geometry'].area,1)
        upper={'id':'n02','doors':[],'rooms':[],'solids':b6.serialize_exact_solids(wall,'upper','wall',3.4,4,'plaster')}
        b6.reserve_door_frames([floor,upper])
        removed=upper['crossFloorDoorFrameRemovedVolumeM3']
        expected=sum(p['geometry'].intersection(wall).area*max(0,min(4,p['top'])-max(3.4,p['bottom'])) for p in raw)
        self.assertAlmostEqual(removed,expected,places=8)
        for solid in upper['solids']:
            for p in raw:
                if min(solid['top'],p['top'])>max(solid['bottom'],p['bottom']):
                    self.assertLess(self.shape(solid).intersection(p['geometry']).area,1e-12)
        after={k:v for k,v in door.items() if k not in ('frameOwnership','frameSolidIds')}
        self.assertEqual(json.dumps(after,sort_keys=True),before)
        self.assertEqual(door['frameOwnership'],'recipe-solids')
        self.assertTrue(door['frameSolidIds'])
        retained_above=unary_union([self.shape(s) for s in upper['solids'] if s['bottom']<3.8<s['top']])
        self.assertLess(retained_above.symmetric_difference(wall).area,1e-12)

    def test_source_paired_frame_has_one_header_and_no_center_post_or_opening_pinch(self):
        doors=self.source_pair();floor={'id':'n02','doors':doors,'rooms':[],'solids':[]}
        b6.reserve_door_frames([floor])
        self.assertEqual(len(floor['solids']),3)
        self.assertEqual(doors[0]['frameSolidIds'],doors[1]['frameSolidIds'])
        low=unary_union([self.shape(s) for s in floor['solids'] if s['bottom']<4<s['top']])
        self.assertFalse(low.covers(Point(21.3151,6.426504)))
        for d in doors:
            a,b,_,depth=b6.door_frame_span(d)
            self.assertLess(low.intersection(LineString([a,b]).buffer(depth/2,cap_style=2)).area,1e-12)
        headers=[s for s in floor['solids'] if s['bottom']==5.1]
        self.assertEqual(len(headers),1)
        self.assertEqual(headers[0]['sourceDoorIds'],sorted(d['id'] for d in doors))
        self.assertEqual(doors[1]['openingClassification'],'fixed-paired-door-leaf')

    def test_only_unique_shared_end_reverse_collinear_same_reveal_pairs_are_combined(self):
        first,second=self.source_pair()
        for d in (first,second):d.pop('pairedDoorId')
        self.assertEqual(len(b6.door_frame_groups([first,second])),1)
        for patch_values in ({'top':5.2},{'depth':.15},{'normalOffset':-.08},
                             {'closedEnd':[21.32,6.489404]},{'hinge':[21.315064,5.864404]}):
            self.assertEqual(len(b6.door_frame_groups([first,{**second,**patch_values}])),2,patch_values)
        duplicate={**second,'id':'ambiguous-other','sourceEntities':['other']}
        self.assertEqual(len(b6.door_frame_groups([first,second,duplicate])),3)

    def test_invalid_declared_pair_and_nonfinite_source_are_rejected(self):
        first,second=self.source_pair()
        with self.assertRaisesRegex(ValueError,'paired frame'):b6.door_frame_groups([first,{**second,'top':5.2}])
        with self.assertRaisesRegex(ValueError,'Invalid source door'):b6.door_frame_span({**first,'depth':float('nan')})

    def test_intersecting_source_frame_profiles_have_one_volume_owner_per_z_band(self):
        first=self.entry();duplicate={**first,'id':'n02-source-projection'}
        floors=[{'id':'n01','doors':[first],'rooms':[],'solids':[]},
                {'id':'n02','doors':[duplicate],'rooms':[],'solids':[]}]
        b6.reserve_door_frames(floors)
        solids=[s for f in floors for s in f['solids']]
        for i,s in enumerate(solids):
            self.assertTrue(s['collision']);self.assertEqual(s['material'],'frame')
            self.assertAlmostEqual(sum(Polygon(t).area for t in s['triangles']),self.shape(s).area)
            for other in solids[:i]:
                if min(s['top'],other['top'])>max(s['bottom'],other['bottom']):
                    self.assertLess(self.shape(s).intersection(self.shape(other)).area,1e-12)
        self.assertEqual(first['frameSolidIds'],duplicate['frameSolidIds'])
        self.assertFalse(floors[1]['solids'])

    def test_structural_insert_refreshes_floor_finish_before_top_partitioning(self):
        door={**self.entry(),'hinge':[0,0],'closedEnd':[1,0],'bottom':-.2,'top':2,'normalOffset':0,'depth':.2}
        slab=b6.serialize_exact_solids(box(-1,-1,2,1),'floor','slab',-.2,0,'floor')
        room={'id':'1','sourceEntity':'room','geometry':box(-1,-1,2,1),'loops':[[[-1,-1],[2,-1],[2,1],[-1,1]]],
              'levelKey':'n01.main','usage':'bedroom'}
        floor={'id':'n01','rooms':[room],'doors':[door],'solids':slab}
        b6.reserve_door_frames([floor]);b6.partition_slab_tops(floor)
        support=unary_union([self.shape(s) for s in floor['solids'] if s['role']=='slab' and s['top']==0])
        finish=unary_union([Polygon(t) for t in room['finishTriangles']])
        self.assertLess(support.symmetric_difference(finish).area,1e-8)
        self.assertLess(support.area,6)
        for s in floor['solids']:
            if s['role']=='slab':
                surface=unary_union([Polygon(t) for p in s['topSurfacePartitions'] for t in p['triangles']])
                self.assertLess(self.shape(s).symmetric_difference(surface).area,1e-8)


class LocalB6RecipeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path=Path(os.environ.get('B06_RECIPE_PATH',str(b6.ROOT/'.cache/cad-buildings-20261024/b06-preparation/recipe.json')))
        strict=os.environ.get('B06_RECIPE_ACCEPTANCE')=='1'
        if not path.exists():
            if strict:raise AssertionError('B6 recipe absent; full generation is required')
            raise unittest.SkipTest('Private B6 recipe absent')
        cls.recipe=json.loads(path.read_text(encoding='utf8'))
        if not b6.validate_cache(cls.recipe,strict=False):
            if strict:raise AssertionError('B6 generator/helper cache is stale')
            raise unittest.SkipTest('B6 recipe is stale')

    def test_all_source_door_frames_own_disjoint_structural_volumes_including_12e1(self):
        from shapely.strtree import STRtree
        frames=[s for f in self.recipe['floors'] for s in f['solids'] if s['role']=='door-frame']
        self.assertTrue(frames)
        others=[s for f in self.recipe['floors'] for s in f['solids'] if s['role'] in ('wall','slab','door-frame')]
        shapes=[Polygon(s['loops'][0],s['loops'][1:]) for s in others];tree=STRtree(shapes)
        by_id={s['id']:s for s in frames}
        for frame in frames:
            shape=Polygon(frame['loops'][0],frame['loops'][1:])
            self.assertTrue(frame['collision']);self.assertEqual(frame['material'],'frame')
            for index in tree.query(shape):
                other=others[index]
                if other['id']==frame['id']:continue
                overlap=min(frame['top'],other['top'])-max(frame['bottom'],other['bottom'])
                if overlap>1e-9:self.assertLess(shape.intersection(shapes[index]).area,1e-9,(frame['id'],other['id']))
        doors=[d for f in self.recipe['floors'] for d in f['doors']]
        entry=next(d for d in doors if d['id']=='n01-door-12E1')
        self.assertEqual((entry['bottom'],entry['top']),(1.5,3.6))
        for door in doors:
            self.assertEqual(door['frameOwnership'],'recipe-solids')
            self.assertTrue(door['frameSolidIds'])
            self.assertTrue(all(door['id'] in by_id[i]['sourceDoorIds'] for i in door['frameSolidIds']))

    def test_actual_paired_door_openings_are_not_narrowed_by_center_jambs(self):
        paired=0
        for floor in self.recipe['floors']:
            frames={s['id']:s for s in floor['solids'] if s['role']=='door-frame'}
            for door in floor['doors']:
                if not door.get('pairedDoorId'):continue
                paired+=1;a,b,_,depth=b6.door_frame_span(door)
                clear=LineString([a,b]).buffer(depth/2,cap_style=2)
                for identifier in door['frameSolidIds']:
                    frame=frames[identifier]
                    if frame['bottom']<door['top']-1e-9:
                        self.assertLess(Polygon(frame['loops'][0],frame['loops'][1:]).intersection(clear).area,1e-9,door['id'])
        self.assertEqual(paired,456)

    def test_revision2_keeps_rear_ground_and_clears_the_shared_east_window_stack(self):
        self.assertNotIn('b06-rear-stair-terrain',[c['id'] for c in self.recipe['terrainCutouts']])
        floors=[f for f in self.recipe['floors'] if f['id'] in ('n05','n06')]
        self.assertEqual(len(floors),2)
        for f in floors:self.assertEqual(f['sharedEastFacade']['ownerFloor'],'n05')
        for z in [14.5,14.9,15.4,15.95,16.5,17.3]:
            self.assertFalse(any(Polygon(s['loops'][0],s['loops'][1:]).covers(Point(51.3253,16.209403))
                for f in floors for s in f['solids'] if s['role'] in ('wall','slab') and s['bottom']<z<s['top']))
        for z in [15.1,16.5,17.6]:
            shapes=[unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in f['solids']
                    if s['role'] in ('wall','slab') and s['bottom']<z<s['top']]) for f in floors]
            self.assertLess(shapes[0].intersection(shapes[1]).intersection(box(50.125,16.034,57.329,16.284)).area,1e-6)
        upper=[w for w in floors[1]['windows'] if set(w['sourceEntities']) & {'CE6','CE8','CEA'}]
        self.assertEqual(len(upper),3);self.assertTrue(all(w['sill'] is None and w['sillOmissionBasis'] for w in upper))

    def test_revision2_every_sill_has_one_profile_and_no_same_facing_wall_cap(self):
        caps={}
        for floor in self.recipe['floors']:
            for solid in floor['solids']:
                if solid['role']=='wall' and 'ceilingPlane' not in solid:
                    caps.setdefault(solid['top'],[]).append(Polygon(solid['loops'][0],solid['loops'][1:]))
        caps={height:unary_union(parts) for height,parts in caps.items()}
        for floor in self.recipe['floors']:
            for window in floor['windows']:
                self.assertIn('sill',window)
                if window['sill'] is None:continue
                sill=window['sill'];shape=Polygon(sill['loops'][0],sill['loops'][1:])
                self.assertAlmostEqual(sill['top'],window['bottom']);self.assertAlmostEqual(sill['top']-sill['bottom'],.035)
                self.assertLess(shape.intersection(caps.get(sill['top'],GeometryCollection())).area,1e-6,window['id'])
                self.assertAlmostEqual(sum(Polygon(t).area for t in sill['triangles']),shape.area,places=5)
        middle=next(w for f in self.recipe['floors'] if f['id']=='n05' for w in f['windows'] if w['id']=='n05-window-F7D')
        self.assertAlmostEqual(middle['depth'],.5)
        self.assertAlmostEqual(middle['frameJamb']['depth'],.125)
        self.assertAlmostEqual(middle['sill']['width'],.225)

    def test_revision2_structural_slab_tops_are_disjoint_complete_partitions(self):
        for floor in self.recipe['floors']:
            for solid in floor['solids']:
                if solid['role']!='slab':continue
                parts=solid['topSurfacePartitions'];triangles=[Polygon(t) for p in parts for t in p['triangles']]
                shape=Polygon(solid['loops'][0],solid['loops'][1:]);whole=unary_union(triangles)
                tolerance=max(1e-5,shape.area*1e-7)
                self.assertLessEqual(shape.symmetric_difference(whole).area,tolerance,solid['id'])
                self.assertLessEqual(sum(t.area for t in triangles)-whole.area,tolerance,solid['id'])
                self.assertTrue(all(p['triangles'] and p['material'] and p['role'] for p in parts))

    def test_photo_usage_and_single_bedroom_leaf_are_source_scoped(self):
        for floor in self.recipe['floors']:
            bedrooms=[room for room in floor['rooms'] if room['usage']=='bedroom']
            fixed=[door for door in floor['doors'] if door.get('openingClassification')=='fixed-paired-door-leaf']
            expected=38 if floor['id'] in b6.FLOORS[1:7] else 0
            self.assertEqual(len(bedrooms),expected);self.assertEqual(len(fixed),expected)
            by_id={door['id']:door for door in floor['doors']}
            for door in fixed:
                active=by_id[door['pairedDoorId']]
                self.assertEqual(active['pairedDoorId'],door['id']);self.assertEqual(active['pairedDoorRole'],'active')
                self.assertEqual(active['roomSourceEntity'],door['roomSourceEntity'])
            for room in floor['rooms']:
                self.assertIn(room['usage'],('bedroom','bathroom','wc','corridor','other'))
                self.assertIn(room['sourceEntity'],room['usageSourceEntities'])
                self.assertIn('finishTriangles',room)
        n01=next(f for f in self.recipe['floors'] if f['id']=='n01')
        n02=next(f for f in self.recipe['floors'] if f['id']=='n02')
        self.assertEqual(sum(q['kind']=='urinal' for r in n01['rooms'] for q in r.get('sanitaryFixtures',[])),5)
        self.assertEqual(sum(q['kind']=='urinal' for r in n02['rooms'] for q in r.get('sanitaryFixtures',[])),10)

    def test_photo_window_parts_preserve_the_measured_thin_partition(self):
        for floor in self.recipe['floors'][1:7]:
            windows=[w for w in floor['windows'] if 'roomId' in w]
            self.assertEqual(len(windows),38)
            self.assertEqual(len({w['roomId'] for w in windows}),38)
            self.assertTrue(all(w['paneCount']==2 and w['windowPlaneNormalOffset']==0 for w in windows))
        floor=next(f for f in self.recipe['floors'] if f['id']=='n02')
        wall=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in floor['solids']
                         if s['role']=='wall' and s['bottom']<4.5<s['top']])
        self.assertTrue(wall.covers(Point(29.978803,.214403)))
        self.assertFalse(wall.covers(Point(29,.214403)))
        self.assertFalse(wall.covers(Point(31,.214403)))

    def test_all_eight_source_floors_and_room_counts(self):
        self.assertEqual(self.recipe['buildingId'],'b06')
        self.assertEqual(self.recipe['osmId'],53929071)
        self.assertEqual([f['id'] for f in self.recipe['floors']],list(b6.FLOORS))
        self.assertEqual([len(f['rooms']) for f in self.recipe['floors']],[44,59,58,58,58,58,55,2])
        self.assertEqual(sum(len(f['doors']) for f in self.recipe['floors']),703)

    def test_all_physical_flights_have_source_or_estimated_edges_and_explicit_levels(self):
        plans=self.recipe['interiorStairPlans']+self.recipe['exteriorStairRoutes']
        segments=[s for p in plans for s in p['segments']]
        self.assertEqual(len(segments),39)
        self.assertEqual(len({s['id'] for s in segments}),39)
        self.assertEqual(sorted(len(s['frontEdgesCad']) for s in segments),[8,8]+[10]*36+[12])
        estimated=[s for s in segments if s.get('sourceFrontsMeasured') is False]
        self.assertEqual(len(estimated),2)

    def test_roof_heads_are_independent_and_no_seventh_room_floor(self):
        roof=self.recipe['floors'][-1]
        self.assertEqual(roof['levelKind'],'roof')
        self.assertEqual(len(roof['roofHeadFootprint']),2)
        self.assertEqual(roof['roofOutlineSourceEntity'],'1036')
        self.assertEqual(self.recipe['roofTransitions'],[])

    def test_unique_solids_and_every_opening_below_its_ceiling(self):
        solids=[s for f in self.recipe['floors'] for s in f['solids']]
        self.assertEqual(len(solids),len({s['id'] for s in solids}))
        for floor in self.recipe['floors']:
            for opening in floor['doors']+floor['windows']:
                self.assertLess(opening['bottom'],opening['top'])
                self.assertLessEqual(opening['top'],opening['ceilingElevation'])

    def test_real_n01_partitions_exist_and_source_door_remains_open(self):
        floor=next(f for f in self.recipe['floors'] if f['id']=='n01')
        walls=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in floor['solids'] if s['role']=='wall' and s['bottom']<1.3<s['top']])
        for xy in [(29.979,3.374),(32.427,13.284),(65.04,12.8)]:
            self.assertTrue(walls.covers(Point(xy)),xy)
        self.assertFalse(walls.covers(Point(65.04,14.05)))

    def test_actual_p01_sides_are_not_covered_by_mezzanine_landing(self):
        plans=[p for p in self.recipe['interiorStairPlans'] if p['id'] in ['p01-east-left-route','p01-east-right-route']]
        self.assertEqual(len(plans),2)
        for plan in plans:
            segment=plan['segments'][0];edges=segment['frontEdgesCad']
            last=Polygon([edges[-2][0],edges[-2][1],edges[-1][1],edges[-1][0]])
            landing=unary_union([Polygon(p['loops'][0],p['loops'][1:]) for p in plan['landings'] if p['levelKey']=='p01.mezzanine'])
            self.assertLess(last.intersection(landing).area,.002)

    def test_source_corners_and_t_return_are_present(self):
        for floor in self.recipe['floors']:
            if floor['id']=='n07':continue
            wall=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in floor['solids'] if s['role']=='wall'])
            for point in [(.18,.18),(69.72,16.47)]:self.assertTrue(wall.covers(Point(point)),(floor['id'],point))
            if floor['id']!='p01':self.assertTrue(wall.covers(Point(69.72,11.94)))

    def test_specific_low_panel_has_no_main_floor_or_high_wall_duplicate(self):
        floor=next(f for f in self.recipe['floors'] if f['id']=='n01');point=Point(2.28,18)
        matching=[s for s in floor['solids'] if Polygon(s['loops'][0],s['loops'][1:]).covers(point)]
        self.assertEqual(len(matching),1)
        self.assertEqual(matching[0]['role'],'retaining-wall')
        self.assertEqual((matching[0]['bottom'],matching[0]['top']),(-3,-1.05))
        self.assertEqual(self.recipe['exteriorLevelAnchors']['exterior.entry.lower'],-.60)

    def test_n05_annex_doors_are_not_blocked_by_n06_band(self):
        floor=next(f for f in self.recipe['floors'] if f['id']=='n06')
        self.assertEqual(len(floor['crossFloorPortals']),4)
        for x in [14.8336,15.67365,16.59363,17.43365]:
            point=Point(x,0)
            self.assertFalse(any(s['role'] in ['wall','slab'] and s['bottom']<15.3 and s['top']>14.8
                and Polygon(s['loops'][0],s['loops'][1:]).covers(point) for s in floor['solids']))

    def test_exterior_caps_porticos_and_mezzanine_glazing_are_explicit(self):
        floor=next(f for f in self.recipe['floors'] if f['id']=='n01');features={f['id']:f for f in floor['exteriorFeatures']}
        self.assertEqual(len(features),8)
        for name in ['b06-entry-canopy','b06-east-mezz-terrace']:
            self.assertEqual(features[name]['role'],'canopy')
        for side,xy in [('west',(1,8)),('east',(68.3,8))]:
            decks=[s for s in floor['solids'] if s['role']=='slab' and s['top']==0 and Polygon(s['loops'][0],s['loops'][1:]).covers(Point(xy))]
            self.assertEqual(len(decks),1)
            self.assertEqual(features['b06-'+side+'-portico-plinth']['bottom'],-1)
        glazing=[d for d in floor['doors'] if d.get('openingClassification')=='openable-glazing']
        self.assertEqual(len(glazing),6)
        self.assertTrue(all(not d['fixedGlazing'] and d['leafMaterial']=='glass' for d in glazing))
        self.assertTrue(all(abs(d['outsideStepEstimate']-.4812777)<1e-6 for d in glazing))

    def test_s201_preserves_ground_and_has_a_buried_cover(self):
        areas=self.recipe['terrainPreservationAreas'];self.assertEqual(len(areas),1)
        self.assertEqual(areas[0]['sourceEntity'],'A5A');self.assertEqual(areas[0]['role'],'buried-chamber')
        floor=next(f for f in self.recipe['floors'] if f['id']=='p01');point=Point(44.8,-4)
        covers=[s for s in floor['solids'] if s['id'].startswith('p01-s201-cover') and Polygon(s['loops'][0],s['loops'][1:]).covers(point)]
        self.assertEqual(len(covers),1);self.assertAlmostEqual(covers[0]['top'],b6.S201_COVER_TOP,places=4)
        room=next(room for room in floor['rooms'] if room['sourceEntity']=='A5A')
        self.assertFalse(room['habitable']);self.assertFalse(room['accessConfirmed'])

    def test_remaining_p01_facade_interval_is_not_an_unmarked_exit(self):
        floor=next(f for f in self.recipe['floors'] if f['id']=='p01');point=Point(67.65,.70)
        self.assertTrue(any(s['role']=='wall' and s['bottom']<-1.5<s['top'] and Polygon(s['loops'][0],s['loops'][1:]).covers(point) for s in floor['solids']))


if __name__=='__main__':unittest.main()
