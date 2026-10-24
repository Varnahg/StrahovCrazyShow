import math
import unittest

from model_geometry import ceiling_clipped_faces, face_area_vector, quantized_face, stair_profile, stair_levels, skew_stair


def volume(faces):
    result = 0
    for face in faces:
        a = face[0]
        for b, c in zip(face[1:], face[2:]):
            result += (a[0] * (b[1] * c[2] - b[2] * c[1])
                       + a[1] * (b[2] * c[0] - b[0] * c[2])
                       + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    return result


RECT = [[[0, 0], [4, 0], [4, 2]], [[0, 0], [4, 2], [0, 2]]]


class CeilingClipTests(unittest.TestCase):
    def check(self, plane, expected_volume, bottom=0, top=3, triangles=RECT):
        faces = list(ceiling_clipped_faces(triangles, bottom, top, plane))
        self.assertAlmostEqual(volume(faces), expected_volume, places=7)
        for face in faces:
            self.assertGreater(sum(v * v for v in face_area_vector(face)), 1e-20)
            self.assertEqual(len(face), len(set(face)))
            for x, y, z in face:
                self.assertGreaterEqual(z, bottom - 1e-9)
                self.assertLessEqual(z, min(top, plane[0] * x + plane[1] * y + plane[2]) + 1e-9)
        return faces

    def test_plane_above_wall_preserves_box(self):
        self.check([0, 0, 5], 24)

    def test_coplanar_top_is_not_duplicated(self):
        self.check([0, 0, 3], 24)

    def test_sloped_soffit_volume_is_integral_of_height(self):
        self.check([0.5, 0, 0.5], 12)

    def test_plane_crosses_both_bottom_and_top(self):
        # z=x-1: first metre empty, then triangular area 4.5 times width2.
        self.check([1, 0, -1], 9)
        # z=2x-1: 0.5m empty + 1.5m wedge + 2m full height.
        self.check([2, 0, -1], 16.5)

    def test_ceiling_below_wall_emits_no_geometry(self):
        self.assertEqual(self.check([0, 0, -1], 0), [])
        self.assertEqual(self.check([0, 0, 0], 0), [])

    def test_negative_elevations_and_reversed_triangles(self):
        self.check([0.5, 0, -2.5], 12, -3, 0, [list(reversed(t)) for t in RECT])

    def test_hole_remains_empty(self):
        # Two disjoint room strips leave a 2m-wide hole between them.
        triangles = [[[0, 0], [1, 0], [1, 2]], [[0, 0], [1, 2], [0, 2]],
                     [[3, 0], [4, 0], [4, 2]], [[3, 0], [4, 2], [3, 2]]]
        faces = self.check([0.5, 0, 0.5], 6, triangles=triangles)
        self.assertTrue(all(not 1 < x < 3 for face in faces for x, y, z in face))

    def test_large_cad_origin_preserves_volume_and_height(self):
        triangles = [[[x + 220, y + 735] for x, y in tri] for tri in RECT]
        self.check([0.5, 0, -109.5], 12, triangles=triangles)

    def test_invalid_inputs_fail(self):
        for plane in [[math.nan, 0, 1], [0, 0, math.inf], [1, 2]]:
            with self.assertRaises(ValueError):
                list(ceiling_clipped_faces(RECT, 0, 3, plane))
        with self.assertRaises(ValueError):
            list(ceiling_clipped_faces([[[0, 0], [1, 1], [2, 2]]], 0, 3, [0, 0, 2]))

    def test_float32_wedge_endpoint_keeps_valid_triangle(self):
        triangles = [[[220,735],[224,735],[224,737]],[[220,735],[224,737],[220,737]]]
        source = list(ceiling_clipped_faces(triangles, 1, 3, [0.5,0.2,-257.3]))
        transformed = [quantized_face([(-(y-731), x-250, z) for x,y,z in face]) for face in source]
        self.assertTrue(any(len(a) != len(b) for a,b in zip(source,transformed)))
        for face in transformed:
            self.assertEqual(len(face),len(set(face)))
            if face:
                self.assertGreater(sum(v*v for v in face_area_vector(face)),1e-20)
        self.assertAlmostEqual(volume([f for f in transformed if f]),volume(source),places=4)

    def test_float32_collapsed_face_is_omitted(self):
        self.assertEqual(quantized_face([(1,1,1),(1,1,1+1e-12),(2,2,2)]),[])
        self.assertEqual(quantized_face([(0,0,0),(1,1,1),(2,2,2)]),[])


class StairProfileTests(unittest.TestCase):
    def test_complete_cad_run_keeps_terminal_riser_on_landing(self):
        positions=[i*0.280926 for i in range(7)]
        result=stair_profile(positions[-1],0,1.4,riser_positions=positions)
        self.assertEqual(result['steps'],7)
        self.assertEqual(len(result['surfaces']),6)
        self.assertEqual(result['positions'],positions)
        self.assertAlmostEqual(result['riser'],0.2)
        self.assertAlmostEqual(result['surfaces'][-1]['height'],1.2)
        self.assertNotIn((positions[-1],1.4),result['profile'])
        self.assertTrue(result['terminalRiserOnLanding'])
        self.assertAlmostEqual(max(z for u,z in result['profile']),1.2)
        self.assertAlmostEqual(result['soffit'][-1][1],1.0)

    def test_original_estimated_flight_is_unchanged(self):
        result=stair_profile(3.2,0,1.6,10)
        self.assertEqual(result['steps'],10)
        self.assertEqual(len(result['surfaces']),10)
        self.assertAlmostEqual(result['surfaces'][-1]['height'],1.6)
        self.assertAlmostEqual(result['tread'],0.32)
        self.assertEqual(stair_profile(3.2,4.8,6.4)['steps'],10)

    def test_tall_measured_exterior_riser_requires_explicit_limit(self):
        positions=[i*0.27 for i in range(14)]
        with self.assertRaisesRegex(ValueError,'Unusable step'):
            stair_profile(positions[-1],-5,-1.8,riser_positions=positions)
        section=stair_profile(positions[-1],-5,-1.8,riser_positions=positions,max_riser=.24)
        self.assertAlmostEqual(section['riser'],3.2/14)
        edges=[[[x,1],[x,-1]] for x in positions]
        self.assertAlmostEqual(skew_stair(edges,-5,-1.8,max_riser=.24)['riser'],3.2/14)
        for limit in [0,-1,.25,math.nan,math.inf]:
            with self.assertRaisesRegex(ValueError,'explicit riser limit'):
                stair_profile(3,0,1.5,steps=10,max_riser=limit)

    def test_measured_unequal_goings_remain_unequal(self):
        result=stair_profile(0.9,-2,-1.4,riser_positions=[0,0.25,0.55,0.9])
        self.assertEqual([s['start'] for s in result['surfaces']],[0,0.25,0.55])
        self.assertAlmostEqual(result['minimumGoing'],0.25)

    def test_invalid_or_unusable_run_is_rejected(self):
        for positions in [[0,0.3,0.3,0.9],[0,0.1,0.9],[0.2,0.5,0.9],[0,0.5,0.7],[0,math.nan,0.9]]:
            with self.assertRaises(ValueError):
                stair_profile(0.9,0,0.6,riser_positions=positions)
        with self.assertRaises(ValueError):
            stair_profile(1.685556,0,1.6,riser_positions=[i*0.280926 for i in range(7)])
        with self.assertRaises(ValueError):
            stair_profile(1,0,1,steps=0)


class StairLevelTests(unittest.TestCase):
    def fixture(self, middle='L:turn'):
        floors=[{'id':'n02','elevation':3.2,'wingElevation':1.4},
                {'id':'n03','elevation':6.4,'wingElevation':4.6}]
        route={'id':'L','lowerLevelKey':'n02.westWing','upperLevelKey':'n02.main','segments':[
            {'lowerLevelKey':'n02.westWing','upperLevelKey':middle,'riserPositions':list(range(5))},
            {'lowerLevelKey':middle,'upperLevelKey':'n02.main','riserPositions':list(range(7))}]}
        return floors,route

    def test_L_landing_uses_rise_counts_not_half_the_height(self):
        floors,route=self.fixture()
        levels=stair_levels(floors,[route])
        self.assertAlmostEqual(levels['L:turn'],2.15)
        self.assertAlmostEqual((2.15-1.4)/5,(3.2-2.15)/7)

    def test_exterior_anchor_resolves_turn_without_overwriting_floor(self):
        floors,route=self.fixture()
        route['upperLevelKey']=route['segments'][-1]['upperLevelKey']='outside.top'
        levels=stair_levels(floors,[route],{'outside.top':3.8})
        self.assertAlmostEqual(levels['L:turn'],2.4)
        self.assertEqual(levels['n02.main'],3.2)
        for anchors in [{'n02.main':4},{'outside.top':math.nan},{'outside.top':math.inf}]:
            with self.assertRaisesRegex(ValueError,'exterior anchor'):
                stair_levels(floors,[route],anchors)

    def test_known_U_mezzanine_is_preserved(self):
        floors,route=self.fixture('n03.westWing')
        route['lowerLevelKey']=route['segments'][0]['lowerLevelKey']='n02.main'
        route['upperLevelKey']=route['segments'][1]['upperLevelKey']='n03.main'
        self.assertEqual(stair_levels(floors,[route])['n03.westWing'],4.6)

    def test_disconnected_or_descending_route_fails(self):
        floors,route=self.fixture()
        route['segments'][1]['lowerLevelKey']='other-turn'
        with self.assertRaises(ValueError):
            stair_levels(floors,[route])
        floors,route=self.fixture('n03.westWing')
        with self.assertRaises(ValueError):
            stair_levels(floors,[route])

    def test_shared_derived_landing_conflict_fails_in_both_orders(self):
        import copy
        floors,first=self.fixture()
        second=copy.deepcopy(first);second['id']='other-L'
        for segment in second['segments']:
            segment['riserPositions']=list(range(6))
        for routes in [[first,second],[second,first]]:
            with self.assertRaisesRegex(ValueError,'Inconsistent shared landing'):
                stair_levels(floors,routes)


class SkewStairTests(unittest.TestCase):
    def test_parallel_skew_edges_are_retained_and_closed(self):
        edges=[[[i*0.3,i*0.12+1],[i*0.3,i*0.12-1]] for i in range(7)]
        result=skew_stair(edges,0,1.4)
        # A shear preserves the volume of the 1.8m by2m run with .3m
        # average vertical construction thickness (.20 + half a .20 rise).
        self.assertAlmostEqual(volume(result['faces']),1.08,places=7)
        self.assertEqual(result['edges'],[(tuple(a),tuple(b)) for a,b in edges])
        self.assertEqual(len(result['surfaces']),6)
        for actual,expected in zip(result['surfaces'][0]['centerCad'],[0.15,0.06]):
            self.assertAlmostEqual(actual,expected)
        balance={};counts={}
        for raw in result['faces']:
            face=quantized_face(raw)
            self.assertTrue(face)
            for a,b in zip(face,face[1:]+face[:1]):
                key=tuple(sorted((a,b)))
                balance[key]=balance.get(key,0)+(1 if (a,b)==key else -1)
                counts[key]=counts.get(key,0)+1
        self.assertTrue(all(count==2 for count in counts.values()))
        self.assertTrue(all(value==0 for value in balance.values()))

    def test_reversed_source_edges_and_width_variations_are_preserved(self):
        edges=[[[i*0.3,-1],[i*0.3,1+i*0.01]] for i in range(7)]
        result=skew_stair(edges,-5,-3.6)
        self.assertGreater(volume(result['faces']),1)
        self.assertAlmostEqual(result['widths'][-1],2.06)
        self.assertEqual(result['edges'][0],((0,1),(0,-1)))

    def test_short_normal_going_is_not_hidden_by_long_shear(self):
        edges=[[[i*0.1,i*0.6+1],[i*0.1,i*0.6-1]] for i in range(7)]
        with self.assertRaisesRegex(ValueError,'perpendicular going'):
            skew_stair(edges,0,1.4)


if __name__ == '__main__':
    unittest.main()
