"""Small CPU finish/UV/pixel regressions; no Blender or source-image mutation."""
import copy
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

from b6_finishes import B6Finishes, FINISHES, SOURCES, material_provenance, png_bytes, texture_pixels, texture_override


def rectangle(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def recipe():
    floor = {'id': 'n01', 'elevation': 0., 'levelKind': 'occupied-floor',
             'levelElevations': {'main': 0., 'mezzanine': 1.5},
             'levelCeilings': {'main': 2.8, 'mezzanine': 4.3},
             'solids': [{'role': 'slab', 'bottom': -.2, 'top': 0,
                         'loops': [rectangle(34.6, 7.6, 44.4, 13.4)]}],
             'rooms': [
                 {'id': 'bed', 'usage': 'bedroom', 'levelKey': 'n01.main', 'loops': [rectangle(35, 8, 39, 11)]},
                 {'id': 'hall', 'usage': 'corridor', 'levelKey': 'n01.main', 'loops': [rectangle(35, 11.2, 39, 13)]},
                 {'id': 'bath', 'usage': 'bathroom', 'levelKey': 'n01.main', 'loops': [rectangle(39.2, 8, 42, 11)]},
                 {'id': 'service', 'usage': 'other', 'levelKey': 'n01.main', 'loops': [rectangle(42.2, 8, 44, 11)]},
                 {'id': 'mezz', 'usage': 'bathroom', 'levelKey': 'n01.mezzanine', 'loops': [rectangle(35, 14, 39, 17)]},
             ]}
    return {'buildingId': 'b06', 'cadOrigin': [35, 8], 'floors': [floor]}


def blender(x, y, z):
    return (8-y, x-35, z)


def top(x0, y0, x1, y1, z=.002):
    return [blender(x0, y0, z), blender(x1, y0, z), blender(x1, y1, z), blender(x0, y1, z)]


def wall(x0, x1, y, bottom, upper, positive_cad_y):
    points = [blender(x0, y, bottom), blender(x1, y, bottom), blender(x1, y, upper), blender(x0, y, upper)]
    return list(reversed(points)) if positive_cad_y else points


class FinishClassificationTest(unittest.TestCase):
    def setUp(self):
        self.recipe = recipe()
        self.finishes = B6Finishes(self.recipe)

    def test_no_bpy_import_and_no_other_building_or_source_mutation(self):
        self.assertNotIn('bpy', sys.modules)
        before = copy.deepcopy(self.recipe)
        self.finishes.face_material('n01', 'floor-finish', top(35.2, 8.2, 38.8, 10.8), 'floor')
        self.assertEqual(self.recipe, before)
        with self.assertRaises(ValueError):
            B6Finishes({**recipe(), 'buildingId': 'b01'})

    def test_exact_room_floor_finishes_and_unknown_usage(self):
        for box, expected in [((35.2, 8.2, 38.8, 10.8), 'b6_bedroom_floor'),
                              ((35.2, 11.3, 38.8, 12.9), 'b6_corridor_floor'),
                              ((39.3, 8.2, 41.9, 10.8), 'b6_bath_floor'),
                              ((42.3, 8.2, 43.9, 10.8), 'floor')]:
            self.assertEqual(self.finishes.face_material('n01', 'floor-finish', top(*box), 'floor'), expected)
        self.recipe['floors'][0]['rooms'][2]['usage'] = 'wc'
        self.assertEqual(B6Finishes(self.recipe).face_material('n01', 'floor-finish', top(39.3, 8.2, 41.9, 10.8), 'floor'), 'b6_bath_floor')

    def test_broad_slab_and_mixed_usage_triangle_are_not_centroid_colored(self):
        points = [blender(35, 8.5, .002), blender(42, 8.5, .002), blender(35, 10.5, .002)]
        self.assertEqual(self.finishes.face_material('n01', 'floor-finish', points, 'floor'), 'floor')
        self.assertEqual(self.finishes.face_material('n01', 'slab', top(35.2, 8.2, 38.8, 10.8, 0), 'floor'), 'floor')
        self.assertEqual(self.finishes.face_material('n01', 'slab', list(reversed(top(35, 8, 39, 11, -.2))), 'floor'), 'b6_white_paint')

    def test_outward_normal_keeps_facade_outside_and_room_finish_inside(self):
        self.assertEqual(self.finishes.face_material('n01', 'wall', wall(35.2, 38.8, 7.6, 0, 2.8, False), 'plaster'), 'b6_facade_ivory')
        self.assertEqual(self.finishes.face_material('n01', 'wall', wall(35.2, 38.8, 8, 0, 2.8, True), 'plaster'), 'b6_white_paint')
        self.assertEqual(self.finishes.face_material('n01', 'wall', wall(39.3, 41.9, 7.6, 0, 2.8, False), 'plaster'), 'b6_facade_service')
        self.assertEqual(self.finishes.face_material('n01', 'wall', wall(39.3, 41.9, 8, 0, 2.8, True), 'plaster'), 'b6_bath_wall')

    def test_corridor_and_bedroom_sides_of_a_partition_do_not_share_the_band(self):
        self.assertEqual(self.finishes.face_material('n01', 'wall', wall(35.2, 38.8, 11, 0, 2.8, False), 'plaster'), 'b6_white_paint')
        self.assertEqual(self.finishes.face_material('n01', 'wall', wall(35.2, 38.8, 11.2, 0, 2.8, True), 'plaster'), 'b6_corridor_wall')

    def test_exterior_floor_slab_edges_continue_facade_without_grey_storey_bands(self):
        for span,expected in [((35.2,38.8),'b6_facade_ivory'),((39.3,41.9),'b6_facade_service')]:
            points=wall(*span,7.6,-.2,0,False)
            self.assertEqual(self.finishes.face_material('n01','slab',points,'floor'),expected)
            self.assertEqual(self.finishes.face_material('n01','slab',points,'concrete'),'concrete')
        self.assertEqual(self.finishes.face_material('n01','slab',wall(35.2,38.8,10,-.2,0,False),'floor'),'floor')

    def test_main_and_mezzanine_band_uv_origin_uses_the_real_level(self):
        for floor_base, points in [(0, wall(39.3, 41.9, 8, 0, 2.8, True)),
                                   (1.5, wall(35.2, 38.8, 14, 1.5, 4.3, True))]:
            key = self.finishes.face_material('n01', 'wall', points, 'plaster')
            self.assertEqual(key, 'b6_bath_wall')
            uv = self.finishes.uv_for_face('n01', 'wall', points, key)
            for point, (_, v) in zip(points, uv):
                self.assertAlmostEqual(v, (point[2]-floor_base)/8)
            self.assertAlmostEqual(min(v for _, v in uv), 0)
            self.assertAlmostEqual(max(v for _, v in uv), 2.8/8)

    def test_long_mezzanine_wall_does_not_repeat_band_at_next_storey(self):
        self.recipe['floors'][0]['levelCeilings']['mezzanine'] = 6.5
        finishes = B6Finishes(self.recipe)
        points = wall(35.2, 38.8, 14, 1.5, 6.5, True)
        uv = finishes.uv_for_face('n01', 'wall', points, 'b6_bath_wall')
        self.assertAlmostEqual(max(v for _, v in uv), 5/8)
        self.assertTrue(all(0 <= v < 1 for _, v in uv))

    def test_metric_floor_rows_and_oblique_wall_uv_distance(self):
        points = top(35.5, 8.5, 36.7, 9.7)
        uv = self.finishes.uv_for_face('n01', 'floor-finish', points, 'b6_corridor_floor')
        self.assertAlmostEqual(abs(uv[1][1]-uv[0][1]), 1)
        self.assertAlmostEqual(abs(uv[2][0]-uv[1][0]), 1)
        points = [(0, 0, 0), (.6, .8, 0), (.6, .8, 2), (0, 0, 2)]
        uv = self.finishes.uv_for_face('n01', 'wall', points, 'b6_facade_ivory')
        self.assertAlmostEqual(abs(uv[1][0]-uv[0][0]), 1)
        self.assertAlmostEqual(abs(uv[2][1]-uv[1][1]), 2)

    def test_stair_treads_risers_soffits_and_exterior_are_distinct(self):
        self.assertEqual(self.finishes.face_material('n01', 'stair', top(36, 9, 37, 10, .5), 'concrete'), 'b6_stair_terrazzo')
        self.assertEqual(self.finishes.face_material('n01', 'stair-landing', top(36, 9, 37, 10, 1.5), 'concrete'), 'b6_corridor_floor')
        self.assertEqual(self.finishes.face_material('n01', 'stair', list(reversed(top(36, 9, 37, 10, .3))), 'concrete'), 'b6_white_paint')
        self.assertEqual(self.finishes.face_material('n01', 'stair', wall(36, 37, 9, .5, .65, True), 'concrete'), 'b6_stair_terrazzo')
        self.assertEqual(self.finishes.face_material('n01', 'stair', top(28, 3, 30, 5, .5), 'concrete'), 'b6_exterior_concrete')
        self.assertEqual(self.finishes.face_material('n01', 'stair-handrail', top(36, 9, 37, 10, 1.5), 'handrail'), 'b6_handrail_wood')
        self.assertEqual(self.finishes.face_material('n01', 'stair-baluster', top(36, 9, 37, 10, 1.5), 'metal'), 'b6_metal')
        self.assertEqual(self.finishes.face_material('n01', 'stair-handrail', top(28, 3, 30, 5, 1.5), 'metal'), 'b6_exterior_rail')

    def test_frames_doors_glazing_and_roof_have_explicit_ownership(self):
        exterior = wall(35.5, 36.5, 7.6, .9, 2.4, False)
        interior = wall(35.5, 36.5, 8, .9, 2.4, True)
        self.assertEqual(self.finishes.face_material('n01', 'window-frame', exterior, 'frame'), 'b6_frame_bronze')
        self.assertEqual(self.finishes.face_material('n01', 'window-frame', interior, 'frame'), 'b6_frame_white')
        self.assertEqual(self.finishes.face_material('n01', 'window-glass', exterior, 'glass'), 'glass')
        self.assertEqual(self.finishes.face_material('n01', 'window-sill', top(35.5,7.8,36.5,8.2,.9), 'concrete'), 'b6_laminate_ivory')
        self.assertEqual(self.finishes.face_material('n01', 'window-gasket', exterior, 'gasket'), 'gasket')
        self.assertEqual(self.finishes.face_material('n01', 'slab', top(35, 8, 39, 11, 9), 'roof'), 'roof')
        self.assertIsNone(self.finishes.uv_for_face('n01', 'slab', top(35, 8, 39, 11, 9), 'roof'))
        self.assertEqual(self.finishes.face_material('n01', 'door-leaf', wall(35.5, 36.5, 11.2, 0, 2.1, True), 'door'), 'b6_door_beige')
        self.assertEqual(self.finishes.face_material('n01', 'door-frame', wall(35.5, 36.5, 11.2, 0, 2.1, True), 'frame'), 'b6_frame_white')

    def test_furniture_keys_are_preserved_and_source_is_not_b2(self):
        keys = ['b6_wood', 'b6_fabric_cream', 'b6_fabric_teal', 'b6_fabric_blue', 'b6_metal',
                'b6_ceramic', 'b6_mirror', 'b6_curtain', 'b6_shower_curtain', 'b6_chrome', 'b6_radiator']
        for key in keys:
            self.assertEqual(self.finishes.face_material('n01', 'interior-furniture', top(36, 9, 37, 10, .8), key), key)
            meta = material_provenance(key)
            self.assertEqual(meta['provenance'], 'B6-photo-informed-authored')
            self.assertFalse(meta['sourcePixelsEmbedded'])
            self.assertFalse(meta['dimensionsMeasured'])
            self.assertNotIn('b2', meta['sourceIds'].lower())
            for source in json.loads(meta['sourceHashes']):
                self.assertEqual(len(source['sha256']), 64)

    def test_roof_room_ceiling_comes_from_matching_source_slab(self):
        source = recipe()
        source['floors'] = [{'id': 'n07', 'elevation': 18, 'levelKind': 'roof',
            'levelElevations': {'main': 18, 'headRoof': 21.41}, 'ceilingElevation': None,
            'solids': [{'role': 'slab', 'bottom': 21.21, 'top': 21.41, 'loops': [rectangle(35, 8, 39, 11)]}],
            'rooms': [{'id': '601', 'usage': 'other', 'levelKey': 'n07.main', 'loops': [rectangle(35.2, 8.2, 38.8, 10.8)]}]}]
        finishes = B6Finishes(source)
        self.assertEqual(finishes.rooms['n07'][0]['ceiling'], 21.21)

    def test_conflicting_same_level_source_overlap_stays_neutral_in_either_order(self):
        floor = self.recipe['floors'][0]
        floor['rooms'].append({**copy.deepcopy(floor['rooms'][0]), 'id': 'overlap', 'usage': 'other'})
        points = top(35.2, 8.2, 38.8, 10.8)
        for _ in range(2):
            finishes = B6Finishes(self.recipe)
            self.assertEqual(finishes.face_material('n01', 'floor-finish', points, 'floor'), 'floor')
            floor['rooms'].reverse()

    def test_room_cache_is_owned_by_one_recipe_instance(self):
        first, second = B6Finishes(recipe()), B6Finishes(recipe())
        first._at('n01', blender(36, 9, .1))
        self.assertEqual(first._room_at.cache_info().currsize, 1)
        self.assertEqual(second._room_at.cache_info().currsize, 0)


class FinishPixelsTest(unittest.TestCase):
    def test_original_png_override_is_hash_verified_and_keeps_metric_period(self):
        cache=Path(__file__).resolve().parents[2]/'.cache/b6-photo-finishes-20261024'
        cache.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            path=Path(directory)/'fixture.png';raw=png_bytes(np.full((8,8,3),128,dtype=np.uint8));path.write_bytes(raw)
            spec={'path':str(path),'sha256':hashlib.sha256(raw).hexdigest(),'periodMetres':[1.6,1.6],
                  'sourceProvenance':{'generator':'fixture','referenceSha256':'1'*64,'prompt':'authored original fixture'}}
            loaded=texture_override(spec)
            self.assertEqual(loaded['bytes'],raw);self.assertEqual((loaded['width'],loaded['height']),(8,8))
            f=B6Finishes(recipe(),{'b6_bedroom_floor':spec})
            points=top(35.2,8.2,36.8,9.8)
            uv=f.uv_for_face('n01','floor-finish',points,'b6_bedroom_floor')
            self.assertAlmostEqual(abs(uv[1][1]-uv[0][1]),1)
            for bad in ({**spec,'sha256':'0'*64},{**spec,'sourceProvenance':{}},{**spec,'path':'relative.png'}):
                with self.assertRaises(ValueError):texture_override(bad)
            self.assertEqual(path.read_bytes(),raw)

    def test_panel_uv_frame_preserves_metric_grain_under_rotation_and_translation(self):
        f=B6Finishes(recipe())
        points=[(1,2,3),(1,2.6,3),(1,2.6,4.4),(1,2,4.4)]
        frame={'origin':[1,2,3],'axes':[[0,1,0],[0,0,1],[1,0,0]]}
        uv=f.uv_for_face('n01','interior-furniture/storage',points,'b6_wood',frame)
        self.assertEqual(uv[0],(0,0));self.assertAlmostEqual(uv[1][0],.6);self.assertAlmostEqual(uv[2][1],1.4)
        rotate=lambda p:(-p[1]+10,p[0]-20,p[2]+4)
        frame2={'origin':rotate(frame['origin']),'axes':[[-a[1],a[0],a[2]] for a in frame['axes']]}
        uv2=f.uv_for_face('n01','interior-furniture/storage',[rotate(p) for p in points],'b6_wood',frame2)
        np.testing.assert_allclose(uv,uv2,atol=1e-12)
        with self.assertRaises(ValueError):f.uv_for_face('n01','interior-furniture/storage',points,'b6_wood',{**frame,'axes':[[1,0,0]]*3})

    def sample(self, key, x, y):
        spec = FINISHES[key]
        pixels = texture_pixels(key)
        row = min(pixels.shape[0]-1, max(0, int((1-y/spec.period[1])*pixels.shape[0])))
        col = min(pixels.shape[1]-1, max(0, int(x/spec.period[0]*pixels.shape[1])))
        return pixels[row, col].astype(float)

    def test_corridor_has_true_crosswise_colored_rows_and_metric_repetition(self):
        dark = self.sample('b6_corridor_floor', .075, .075)
        blue = self.sample('b6_corridor_floor', .075, .225)
        np.testing.assert_allclose(dark, FINISHES['b6_corridor_floor'].rgb, atol=1)
        np.testing.assert_allclose(blue, FINISHES['b6_corridor_floor'].lower_rgb, atol=1)
        self.assertGreater(blue[2]-dark[2], 70)
        np.testing.assert_allclose(self.sample('b6_corridor_floor', .675, .675), dark, atol=2)

    def test_bathroom_white_tiles_lower_blue_zone_and_no_next_floor_band(self):
        np.testing.assert_allclose(self.sample('b6_bath_wall', .1, .5), FINISHES['b6_bath_wall'].lower_rgb, atol=1)
        for height in [1.1, 2.3, 3.5, 4.7]:
            np.testing.assert_allclose(self.sample('b6_bath_wall', .1, height), FINISHES['b6_bath_wall'].rgb, atol=1)
        self.assertEqual(FINISHES['b6_bath_wall'].tile, (.2, .2))
        self.assertEqual(FINISHES['b6_bath_wall'].grout, .003)

    def test_corridor_wainscot_keeps_an_upper_white_surface(self):
        np.testing.assert_allclose(self.sample('b6_corridor_wall', .2, .5), FINISHES['b6_corridor_wall'].lower_rgb, atol=2)
        np.testing.assert_allclose(self.sample('b6_corridor_wall', .2, 2.2), FINISHES['b6_corridor_wall'].rgb, atol=2)

    def test_authored_png_is_deterministic_exact_rgb_and_srgb_tagged(self):
        pixels = texture_pixels('b6_bedroom_floor')
        encoded = png_bytes(pixels)
        self.assertEqual(hashlib.sha256(encoded).digest(), hashlib.sha256(png_bytes(texture_pixels('b6_bedroom_floor'))).digest())
        decoded = Image.open(io.BytesIO(encoded))
        np.testing.assert_array_equal(np.asarray(decoded), pixels)
        self.assertIn('srgb', decoded.info)
        self.assertGreater(int(pixels.max())-int(pixels.min()), 30)
        self.assertEqual(FINISHES['b6_stair_terrazzo'].sources, ('b3-stair-typology',))


if __name__ == '__main__':
    unittest.main()
