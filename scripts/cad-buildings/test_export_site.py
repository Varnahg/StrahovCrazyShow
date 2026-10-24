"""Small analytical fixtures only; no B1 export, Blender or source CAD access."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from shapely.geometry import Point, Polygon, box
from shapely.ops import triangulate

from export_site import derive_site, export_site, projected_faces


def part(identifier, footprint, plane=(0, 0, 0), role='slab', floor='p01', thickness=.2):
    positions, indices = [], []
    a, b, c = plane
    for triangle in triangulate(footprint):
        if not footprint.covers(triangle):
            continue
        xz = list(triangle.exterior.coords)[:3]
        # Shapely triangles are CCW in XZ, hence their normal points down in XYZ.
        for lower in (False, True):
            base = len(positions)//3
            for x, z in xz:
                positions.extend((x, a*x+b*z+c-(thickness if lower else 0), z))
            indices.extend(base+i for i in ((0, 1, 2) if lower else (0, 2, 1)))
    return {'id': identifier, 'floor': floor, 'role': role, 'positions': positions, 'indices': indices}


def model(parts=None):
    return {'schemaVersion': 1, 'id': 'fixture', 'blendSha256': 'a'*64, 'glbSha256': 'b'*64,
            'coordinateSystem': 'model local metres', 'terrainCutouts': [],
            'parts': parts if parts is not None else [part('fixture:n04:slab:roof', box(0, 0, 10, 10), (0, 0, 9))]}


def shape(record):
    return Polygon(record['loops'][0], record['loops'][1:])


def contains(records, x, z):
    return any(shape(record).covers(Point(x, z)) for record in records)


class SiteExportTest(unittest.TestCase):
    def test_exterior_canopy_support_and_cover_preserve_ground_below(self):
        source=model([part('main:n07:slab:roof',box(0,0,4,4),(0,0,18)),
                      part('entry:n01:canopy:roof',box(5,0,8,3),(0,0,4.45),'canopy')])
        site=derive_site(source,'c'*64)
        self.assertTrue(contains(site['supportSurfaces'],6,1))
        self.assertTrue(contains(site['coverSurfaces'],6,1))
        self.assertFalse(contains(site['terrainCutouts'],6,1))

    def test_buried_chamber_keeps_terrain_without_removing_its_native_surfaces(self):
        source=model([part('main:n07:slab:roof',box(0,0,4,4),(0,0,18)),
                      part('chamber:p01:slab:floor',box(7,0,9,3),(0,0,-3)),
                      part('chamber:p01:slab:roof',box(7,0,9,3),(0,0,-2.3))])
        source['terrainPreservationAreas']=[{'id':'buried-chamber','loops':[[[7,0],[9,0],[9,3],[7,3]]],
                                            'provenance':'source-only fixture, covered ground'}]
        site=derive_site(source,'c'*64)
        self.assertAlmostEqual(site['derivation']['terrainCutoutAreaM2'],16)
        self.assertFalse(contains(site['terrainCutouts'],8,1))
        self.assertTrue(contains(site['supportSurfaces'],8,1))
        self.assertTrue(contains(site['coverSurfaces'],8,1))
        source['terrainPreservationAreas'].append(source['terrainPreservationAreas'][0])
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            derive_site(source,'c'*64)

    def test_floor_stair_hole_closed_by_roof_but_courtyard_preserved(self):
        courtyard = box(4, 4, 6, 6)
        roof = box(0, 0, 10, 10).difference(courtyard)
        floor = roof.difference(box(1, 1, 2, 2))
        source = model([part('fixture:n04:slab:roof', roof, (0, 0, 9)),
                        part('fixture:p01:slab:floor', floor, (0, 0, -3))])
        site = derive_site(source, 'c'*64)
        self.assertTrue(contains(site['terrainCutouts'], 1.5, 1.5))
        self.assertFalse(contains(site['terrainCutouts'], 5, 5))
        low = [s for s in site['supportSurfaces'] if s['partId'].endswith(':floor')]
        self.assertFalse(contains(low, 1.5, 1.5))
        self.assertAlmostEqual(site['derivation']['terrainCutoutAreaM2'], 96)
        self.assertEqual(len(site['terrainCutouts'][0]['loops']), 2)

    def test_low_slab_extends_roof_but_external_stair_does_not(self):
        source = model([part('fixture:n04:slab:roof', box(0, 0, 10, 10), (0, 0, 9)),
                        part('fixture:p01:slab:floor', box(-1, 1, 2, 3), (0, 0, -3)),
                        part('fixture:n01:stair:concrete', box(10, 1, 13, 2), (1, 0, -10), 'stair'),
                        part('fixture:n01:stair-landing:concrete', box(12, 2, 13, 3), (0, 0, 3), 'stair-landing')])
        site = derive_site(source, 'c'*64)
        self.assertTrue(contains(site['terrainCutouts'], -.5, 2))
        self.assertFalse(contains(site['terrainCutouts'], 12, 1.5))
        self.assertFalse(contains(site['terrainCutouts'], 12.5, 2.5))
        self.assertAlmostEqual(site['derivation']['lowerFloorOutsideRoofAreaM2'], 2)
        self.assertEqual(site['derivation']['roofPartIds'], ['fixture:n04:slab:roof'])
        self.assertIn('fixture:p01:slab:floor', site['terrainCutouts'][0]['sourcePartIds'])
        self.assertTrue(contains(site['supportSurfaces'], 12, 1.5))

    def test_explicit_shaft_cutout_keeps_hole_and_depth_provenance(self):
        source = model()
        source['terrainCutouts'] = [{'id': 'shaft', 'bottom': -4.65, 'openAbove': -1.95,
                                    'loops': [[[12, 0], [15, 0], [15, 3], [12, 3]],
                                              [[13, 1], [14, 1], [14, 2], [13, 2]]]}]
        site = derive_site(source, 'c'*64)
        self.assertEqual(len(site['terrainCutouts']), 2)
        self.assertTrue(contains(site['terrainCutouts'], 12.5, .5))
        self.assertFalse(contains(site['terrainCutouts'], 13.5, 1.5))
        self.assertEqual(site['derivation']['explicitTerrainCutouts'][0]['source']['bottom'], -4.65)
        self.assertIn('terrain-cutout:shaft', site['terrainCutouts'][1]['sourcePartIds'])

    def test_sloped_soffit_and_upper_face_have_distinct_real_planes(self):
        source = model()
        source['parts'].append(part('fixture:n01:stair:concrete', box(0, 0, 4, 2), (.5, -.25, 2), 'stair'))
        site = derive_site(source, 'c'*64)
        upper = [s for s in site['supportSurfaces'] if s['role'] == 'stair']
        lower = [s for s in site['coverSurfaces'] if s['role'] == 'stair']
        self.assertEqual(len(upper), 1)
        self.assertEqual(len(lower), 1)
        self.assertEqual(upper[0]['plane'], {'a': .5, 'b': -.25, 'c': 2})
        self.assertEqual(lower[0]['plane'], {'a': .5, 'b': -.25, 'c': 1.8})
        self.assertAlmostEqual(shape(lower[0]).area, 8)

    def test_disjoint_slabs_do_not_fill_their_bounding_box(self):
        source = model([part('fixture:n04:slab:roof', box(0, 0, 2, 2), (0, 0, 9)),
                        part('fixture:p01:slab:floor', box(8, 0, 10, 2))])
        site = derive_site(source, 'c'*64)
        self.assertEqual(len(site['terrainCutouts']), 2)
        self.assertFalse(contains(site['terrainCutouts'], 5, 1))

    def test_tiny_real_hole_is_not_closed_or_snapped(self):
        roof = box(0, 0, 2, 2).difference(box(1, 1, 1.0001, 1.0001))
        site = derive_site(model([part('fixture:n04:slab:roof', roof)]), 'c'*64)
        self.assertFalse(contains(site['terrainCutouts'], 1.00005, 1.00005))

    def test_orientation_vertical_faces_and_large_local_coordinates(self):
        source = part('test', box(249, 730, 250, 731), (.5, .25, -300))
        source['positions'].extend([249, 0, 730, 249, 1, 730, 249, 1, 731])
        source['indices'].extend([12, 13, 14])
        faces = list(projected_faces(source))
        self.assertEqual(len(faces), 4)
        self.assertEqual({side for side, _, _ in faces}, {'support', 'cover'})
        self.assertEqual({plane for _, plane, _ in faces}, {(.5, .25, -300), (.5, .25, -300.2)})

    def test_invalid_geometry_and_hashes_fail(self):
        for mutate in (
            lambda m: m['parts'][0]['positions'].__setitem__(0, float('nan')),
            lambda m: m['parts'][0]['indices'].__setitem__(0, 99999),
            lambda m: m['parts'].append(copy.deepcopy(m['parts'][0])),
            lambda m: m.__setitem__('blendSha256', 'no'),
            lambda m: m['parts'][0].__setitem__('role', 'wall'),
        ):
            source = model()
            mutate(source)
            with self.assertRaises(ValueError):
                derive_site(source, 'c'*64)

    def test_export_hash_nonmutation_determinism_and_atomic_failure(self):
        cache = Path(__file__).resolve().parents[2]/'.cache/cad-buildings-20261024/b01-runtime-site'
        cache.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            source_path, output = Path(directory)/'source.json', Path(directory)/'site.json'
            source_bytes = (json.dumps(model(), indent=2)+'\n').encode()
            source_path.write_bytes(source_bytes)
            site = export_site(source_path, output)
            first = output.read_bytes()
            self.assertEqual(site['sourceCollisionSha256'], hashlib.sha256(source_bytes).hexdigest())
            self.assertEqual(site['sourceBlendSha256'], 'a'*64)
            self.assertEqual(site['sourceGlbSha256'], 'b'*64)
            export_site(source_path, output)
            self.assertEqual(output.read_bytes(), first)
            self.assertEqual(source_path.read_bytes(), source_bytes)
            with self.assertRaises(ValueError):
                export_site(source_path, source_path)
            with patch('export_site.os.replace', side_effect=OSError('fixture failure')):
                with self.assertRaises(OSError):
                    export_site(source_path, output)
            self.assertEqual(output.read_bytes(), first)
            self.assertEqual(sorted(p.name for p in Path(directory).iterdir()), ['site.json', 'source.json'])


if __name__ == '__main__':
    unittest.main()
