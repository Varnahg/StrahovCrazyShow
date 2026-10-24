import copy
import json
import math
import unittest

from shapely.geometry import MultiPoint

from export_grade import SourceTerrain, generate_grade, generate_door_grades


def fixture():
    terrain = {'grid': {'minX': 0, 'minZ': 0, 'step': 4, 'columns': 3, 'rows': 2},
               'reference': {'absoluteHeight': 100}, 'heights': [100, 100.2, 100.1, 100.4, 100.9, 100.6]}
    plane = {'a': .04, 'b': .03, 'c': .1}
    placement = {'yaw': math.pi, 'translation': {'x': 3.5, 'y': 0, 'z': 2.2}}
    observations = {'buildingId': 'b06', 'placement': placement, 'lowerCadXY': [0, 0],
                    'acrossCadUnit': [0, 1], 'ascendingCadUnit': [1, 0], 'widthMetres': 3.86,
                    'smoothApproachPlane': {**plane, 'points': 16}, 'samples': []}
    valid = []
    for back in [.2, .4, .6, .8]:
        for across in [-1.5, -.5, .5, 1]:
            x, z = 3.5 + across, 2.2 - back
            y = plane['a'] * x + plane['b'] * z + plane['c']
            hit = {'sourceTriangle': 'fixture:0', 'normalY': 1, 'y': y}
            observations['samples'].append({'backMetres': back, 'acrossMetres': across, 'cadXY': [-back, across],
                                             'worldXZ': [x, z], 'groundHits': [hit]})
            valid.append({'backMetres': back, 'acrossMetres': across, 'worldXYZ': [x, y, z], 'sourceTriangle': 'fixture:0'})
    for across in [-1.93, 0, 1.93]:
        observations['samples'].append({'backMetres': 0, 'acrossMetres': across, 'cadXY': [0, across],
                                        'worldXZ': [3.5 + across, 2.2], 'groundHits': []})
    hull = MultiPoint([(v['worldXYZ'][0], v['worldXYZ'][2]) for v in valid]).convex_hull
    proposal = {'buildingId': 'b06', 'placement': placement, 'worldPlane': plane, 'validSamples': valid,
                'polygons': [{'worldLoops': [list(hull.exterior.coords)[:-1]]}], 'sampleRmsMetres': 0,
                'sourceManifestSha256': 'a' * 64, 'sourceTriangleIds': ['fixture:0']}
    return terrain, observations, proposal


def triangles(data, cell=None):
    start = cell['firstIndex'] if cell else 0
    stop = start + cell['indexCount'] if cell else len(data['indices'])
    for index in range(start, stop, 3):
        yield [data['positions'][3 * i:3 * i + 3] for i in data['indices'][index:index + 3]]


def sample(data, cell, x, z):
    for a, b, c in triangles(data, cell):
        den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
        u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den
        v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den
        if min(u, v, 1 - u - v) >= -1e-8:
            return u * a[1] + v * b[1] + (1 - u - v) * c[1]
    raise AssertionError(('No triangle support', cell, x, z))


class GradeTests(unittest.TestCase):
    def setUp(self):
        self.terrain, self.observations, self.proposal = fixture()
        self.data = generate_grade(self.terrain, self.observations, self.proposal)

    def test_partition_area_winding_and_source_diagonals(self):
        self.assertEqual(self.data['bounds'], {'minX': 0, 'maxX': 8, 'minZ': 0, 'maxZ': 4})
        self.assertEqual(len(self.data['cells']), 2)
        for cell in self.data['cells']:
            area = 0
            for a, b, c in triangles(self.data, cell):
                cross = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])
                self.assertGreater(cross, 0)
                self.assertTrue(all(math.isfinite(v) for p in [a, b, c] for v in p))
                area += cross / 2
                diagonal = [(p[0] - cell['column'] * 4) / 4 + p[2] / 4 - 1 for p in [a, b, c]]
                self.assertTrue(min(diagonal) >= -1e-8 or max(diagonal) <= 1e-8, 'A triangle crosses the original NE--SW diagonal')
            self.assertAlmostEqual(area, 16, places=7)

    def test_outer_boundaries_keep_original_dmr_and_shared_cell_seam_agrees(self):
        source = SourceTerrain(self.terrain)
        for i in range(101):
            t = i / 100
            for x, z in [(0, 4 * t), (8, 4 * t), (8 * t, 0), (8 * t, 4)]:
                cell = self.data['cells'][0 if x <= 4 else 1]
                self.assertAlmostEqual(sample(self.data, cell, x, z), source.height(x, z), places=8)
            left = sample(self.data, self.data['cells'][0], 4, 4 * t)
            right = sample(self.data, self.data['cells'][1], 4, 4 * t)
            self.assertAlmostEqual(left, right, places=9)

    def test_plane_preserved_on_samples_and_entire_first_front_without_flattening(self):
        p = self.proposal['worldPlane']
        for value in self.proposal['validSamples']:
            x, _, z = value['worldXYZ']
            cell = self.data['cells'][0 if x <= 4 else 1]
            self.assertAlmostEqual(sample(self.data, cell, x, z), p['a'] * x + p['b'] * z + p['c'], places=8)
        a, b = self.data['frontConstraint']['endpointsWorldXZ']
        for i in range(31):
            t = i / 30
            x, z = [a[j] * (1 - t) + b[j] * t for j in (0, 1)]
            self.assertAlmostEqual(sample(self.data, self.data['cells'][0 if x <= 4 else 1], x, z), p['a'] * x + p['b'] * z + p['c'], places=8)
        self.assertNotAlmostEqual(self.data['frontConstraint']['planeHeights'][0], self.data['frontConstraint']['planeHeights'][2])

    def test_source_mask_and_approved_mesh_hole_interpolation_are_distinct(self):
        self.proposal['polygons'][0]['worldLoops'].append([[2.95, 1.65], [3.05, 1.65], [3.05, 1.75], [2.95, 1.75]])
        data = generate_grade(self.terrain, self.observations, self.proposal)
        self.assertEqual(len(data['regions']['sourceSupportedMask'][0]['loops']), 2)
        self.assertAlmostEqual(sum(p['areaM2'] for p in data['regions']['interpolatedSourceHolesMask']), .01)
        self.assertGreater(sum(p['areaM2'] for p in data['regions']['extrapolatedGameGradeMask']), 0)
        self.assertFalse(data['measured'])
        self.assertAlmostEqual(sample(data, data['cells'][0], 3, 1.7), .04 * 3 + .03 * 1.7 + .1, places=8)

    def test_deterministic_generation_and_inputs_untouched(self):
        original = copy.deepcopy((self.terrain, self.observations, self.proposal))
        repeated = generate_grade(self.terrain, self.observations, self.proposal)
        self.assertEqual(json.dumps(repeated, sort_keys=True), json.dumps(self.data, sort_keys=True))
        self.assertEqual(original, (self.terrain, self.observations, self.proposal))

    def test_small_apron_leaves_most_cells_unchanged(self):
        source = SourceTerrain(self.terrain)
        unchanged = sum(p['areaM2'] for p in self.data['regions']['unchangedDmrWithinCellsMask'])
        self.assertGreater(unchanged, 20)
        self.assertAlmostEqual(sample(self.data, self.data['cells'][0], .5, .5), source.height(.5, .5), places=8)
        self.assertAlmostEqual(sample(self.data, self.data['cells'][1], 7.5, 3.5), source.height(7.5, 3.5), places=8)

    def test_invalid_identity_nonfinite_samples_and_scope_are_rejected(self):
        bad = copy.deepcopy(self.proposal); bad['worldPlane']['a'] = float('nan')
        with self.assertRaisesRegex(ValueError, 'Non-finite'):
            generate_grade(self.terrain, self.observations, bad)
        bad = copy.deepcopy(self.proposal); bad['validSamples'][0]['worldXYZ'][1] += .1
        with self.assertRaisesRegex(ValueError, 'matching smooth'):
            generate_grade(self.terrain, self.observations, bad)
        with self.assertRaisesRegex(ValueError, 'limited source-cell'):
            generate_grade(self.terrain, self.observations, self.proposal, max_cells=1)
        bad = copy.deepcopy(self.observations); bad['placement']['yaw'] = 0
        with self.assertRaisesRegex(ValueError, 'placement identity'):
            generate_grade(self.terrain, bad, self.proposal)


class DoorGradeTests(unittest.TestCase):
    def setUp(self):
        self.terrain, _, self.proposal = fixture()
        self.model = {'id': 'b01', 'cadOrigin': [0, 0], 'doors': [
            {'id': 'n01-door-fixture', 'hinge': [2, 0], 'closedEnd': [2.84, 0], 'bottom': .6, 'normalOffset': 0}]}
        self.placement = {'yaw': 0, 'translation': {'x': 2, 'y': 0, 'z': 5}}

    def source(self, points):
        plane = self.proposal['worldPlane']
        return {'sourceTriangle': 'fixture:0', 'geometrySha256': 'b' * 64,
                'verticesWorldXYZ': [[x, plane['a'] * x + plane['b'] * z + plane['c'], z] for x, z in points],
                'normalY': 1 / math.sqrt(1 + plane['a'] ** 2 + plane['b'] ** 2), 'plane': plane}

    def test_direct_source_mask_and_native_door_rectangle(self):
        evidence = [{'doorId': 'n01-door-fixture', 'outsideWorldXZ': [2.5, 2.58], 'occluded': False,
                     'triangles': [self.source([(1.9, 2), (3, 3.2), (3, 2)])]}]
        data = generate_door_grades(self.terrain, self.model, self.placement, evidence)
        entry = data['entries'][0]
        self.assertAlmostEqual(entry['widthMetres'], .84)
        self.assertEqual(entry['nativeJambWorldXZ'], [[2, 3], [2, 2.16]])
        self.assertEqual(entry['sourceDistanceAtOutsideMetres'], 0)
        self.assertGreater(sum(p['areaM2'] for p in entry['regions']['sourceSupportedMask']), 0)
        self.assertGreater(sum(p['areaM2'] for p in entry['regions']['extrapolatedGameGradeMask']), 0)
        self.assertAlmostEqual(sample(data, data['cells'][0], 2.5, 2.58), .04 * 2.5 + .03 * 2.58 + .1, places=8)
        self.assertFalse(data['measured'])
        with self.assertRaisesRegex(ValueError, 'cells overlap'):
            generate_door_grades(self.terrain, self.model, self.placement, evidence * 2)

    def test_occluded_region_is_all_estimated_and_obeys_maximum_extrapolation(self):
        evidence = [{'doorId': 'n01-door-fixture', 'outsideWorldXZ': [2.5, 2.58], 'occluded': True,
                     'maxExtrapolationMetres': .8, 'triangles': [self.source([(3, 1.5), (3, 3.5), (4, 2.5)])]}]
        data = generate_door_grades(self.terrain, self.model, self.placement, evidence)
        entry = data['entries'][0]
        self.assertEqual(entry['regions']['sourceSupportedMask'], [])
        self.assertLessEqual(entry['maximumCoreDistanceToSourceMetres'], .8 + 1e-8)
        self.assertGreater(sum(p['areaM2'] for p in entry['regions']['requestedCoreOutsideApprovedLimit']), 0)
        self.assertAlmostEqual(sum(p['areaM2'] for p in entry['regions']['extrapolatedGameGradeMask']),
                               sum(p['areaM2'] for p in entry['regions']['planeRegion']))
        self.assertAlmostEqual(sample(data, data['cells'][0], 2.5, 2.58), .04 * 2.5 + .03 * 2.58 + .1, places=8)
        evidence[0]['maxExtrapolationMetres'] = .4
        with self.assertRaisesRegex(ValueError, 'approved source extrapolation'):
            generate_door_grades(self.terrain, self.model, self.placement, evidence)

    def test_unrelated_exterior_point_is_rejected(self):
        evidence = [{'doorId': 'n01-door-fixture', 'outsideWorldXZ': [2.5, 3.58], 'occluded': False,
                     'triangles': [self.source([(1.9, 2), (3, 3.2), (3, 2)])]}]
        with self.assertRaisesRegex(ValueError, 'native door axis'):
            generate_door_grades(self.terrain, self.model, self.placement, evidence)


if __name__ == '__main__':
    unittest.main()
