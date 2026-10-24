"""Small B6 geometry fixtures; private source/model acceptance is explicit."""
import hashlib
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import numpy as np
from shapely.geometry import GeometryCollection, Point, Polygon, box
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
        self.assertGreater(b6.EAST_TERRACE_TOP-.15-head,.20)
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


class LocalB6RecipeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path=b6.ROOT/'.cache/cad-buildings-20261024/b06-preparation/recipe.json'
        strict=os.environ.get('B06_RECIPE_ACCEPTANCE')=='1'
        if not path.exists():
            if strict:raise AssertionError('B6 recipe absent; full generation is required')
            raise unittest.SkipTest('Private B6 recipe absent')
        cls.recipe=json.loads(path.read_text(encoding='utf8'))
        if not b6.validate_cache(cls.recipe,strict=False):
            if strict:raise AssertionError('B6 generator/helper cache is stale')
            raise unittest.SkipTest('B6 recipe is stale')

    def test_all_eight_source_floors_and_room_counts(self):
        self.assertEqual(self.recipe['buildingId'],'b06')
        self.assertEqual(self.recipe['osmId'],53929071)
        self.assertEqual([f['id'] for f in self.recipe['floors']],list(b6.FLOORS))
        self.assertEqual([len(f['rooms']) for f in self.recipe['floors']],[44,59,58,58,58,58,55,2])
        self.assertEqual(sum(len(f['doors']) for f in self.recipe['floors']),703)

    def test_all_physical_flights_have_measured_edges_and_explicit_levels(self):
        plans=self.recipe['interiorStairPlans']+self.recipe['exteriorStairRoutes']
        segments=[s for p in plans for s in p['segments']]
        self.assertEqual(len(segments),37)
        self.assertEqual(len({s['id'] for s in segments}),37)
        self.assertEqual(sorted(len(s['frontEdgesCad']) for s in segments),[10]*36+[12])

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
