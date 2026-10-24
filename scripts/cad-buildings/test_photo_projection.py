"""Small CPU fixtures; no original imagery, Blender, GPU or whole-model processing."""
import hashlib
import io
import math
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest

import numpy as np
from PIL import Image
from photogrammetry_bake import normalize_cli_paths

from photo_projection import (admissible_photo_hit, barycentric, blend_photo_with_fallback,
                              confidence_edge_weights, eligible_face, fit_plane_registration,
                              fit_rigid_y, interpolate_uv, linear_to_srgb, load_i3s, local_to_world,
                              patch_basis, png_rgb_bytes, rasterize_patch_triangles, rotation_y,
                              sample_jpeg_rgb, triangle_normals, verified_source_path, world_to_local)


def patch():
    return {'id': 'facade', 'partIds': ['b01:n01:wall:plaster'],
            'origin': [0, 0, 0], 'u': [1, 0, 0], 'v': [0, 1, 0], 'normal': [0, 0, 1],
            'bounds': [0, 0, 4, 4], 'maxDistanceMetres': .45, 'sourceNormalCosine': .94}


class PhotoProjectionTest(unittest.TestCase):
    def test_feather_preserves_masks_core_fallback_and_zero_baseline_bytes(self):
        target = np.ones((4, 10), dtype=bool)
        accepted = target.copy()
        accepted[:, :2] = False
        photo = np.arange(120, dtype=np.uint8).reshape(4, 10, 3)
        before = (target.copy(), accepted.copy(), photo.copy())
        weights = confidence_edge_weights(target, accepted, [.05, .05], .15)
        output = blend_photo_with_fallback(photo, accepted, weights, [0, 0, 0])
        np.testing.assert_array_equal(output[:, :2], 0)
        np.testing.assert_array_equal(output[:, 4:], photo[:, 4:])
        self.assertTrue(np.any(output[:, 2:4] != photo[:, 2:4]))
        self.assertTrue(np.all(weights[:, 2:4] > 0))
        self.assertTrue(np.all(weights[:, 2:4] < 1))
        baseline = blend_photo_with_fallback(photo, accepted,
                    confidence_edge_weights(target, accepted, [.05, .05], 0), [0, 0, 0])
        expected = photo.copy()
        expected[:, :2] = 0
        self.assertEqual(png_rgb_bytes(baseline), png_rgb_bytes(expected))
        for actual, original in zip((target, accepted, photo), before):
            np.testing.assert_array_equal(actual, original)

    def test_feather_does_not_seed_or_cross_holes_and_diagonal_components(self):
        target = np.ones((3, 7), dtype=bool)
        target[:, 3] = False
        accepted = target.copy()
        accepted[:, :2] = False
        weights = confidence_edge_weights(target, accepted, [.05, .05], .15)
        self.assertTrue(np.all(weights[:, 2] < 1))
        np.testing.assert_array_equal(weights[:, 4:], 1)
        np.testing.assert_array_equal(weights[:, 3], 0)
        # A hole is not evidence of a rejected photograph and must not create a halo.
        weights = confidence_edge_weights(target, target, [.05, .05], .15)
        np.testing.assert_array_equal(weights[target], 1)
        diagonal = np.eye(2, dtype=bool)
        accepted = np.array([[False, False], [False, True]])
        self.assertEqual(confidence_edge_weights(diagonal, accepted, [.05, .05], .15)[1, 1], 1)

    def test_feather_metric_limit_and_linear_light_mix_are_explicit(self):
        target = np.ones((1, 4), dtype=bool)
        accepted = np.array([[False, True, True, True]])
        weights = confidence_edge_weights(target, accepted, [.1, .05], .15)
        self.assertAlmostEqual(weights[0, 1], 2/3)
        np.testing.assert_array_equal(weights[0, 2:], 1)
        photo = np.full((1, 3, 3), 255, np.uint8)
        result = blend_photo_with_fallback(photo, np.array([[False, True, True]]),
                                          np.array([[0., .5, 1.]]), [0, 0, 0])
        np.testing.assert_array_equal(result[0, 0], [0, 0, 0])
        np.testing.assert_array_equal(result[0, 1], [188, 188, 188])
        np.testing.assert_array_equal(result[0, 2], [255, 255, 255])
        with self.assertRaises(ValueError):
            confidence_edge_weights(target, accepted, [.1, .05], .151)

    def test_blender_paths_are_absolute_before_opening_the_target(self):
        names = ('alignment', 'source_root', 'model', 'output', 'report')
        args = SimpleNamespace(**{name: Path('.cache')/name for name in names})
        result = normalize_cli_paths(args)
        for name in names:
            self.assertEqual(getattr(result, name), Path.cwd()/'.cache'/name)
            self.assertTrue(getattr(result, name).is_absolute())

    def test_rigid_fit_recovers_nonzero_yaw_translation_without_scale(self):
        local = np.array([[0, 0, 0], [12, 3, 2], [-2, -3, 5], [5, 8, -7]])
        expected = {'yaw': -3.119232, 'translation': {'x': -86.9071, 'y': 4.2, 'z': 77.6795}}
        world = local_to_world(local, expected)
        fit = fit_rigid_y(local, world, [1, 2, 3, 4])
        np.testing.assert_allclose(local_to_world(local, fit['placement']), world, atol=1e-12)
        np.testing.assert_allclose(world_to_local(world, fit['placement']), local, atol=1e-12)
        self.assertEqual(fit['scale'], 1)
        self.assertLess(fit['rmsMetres'], 1e-12)

    def test_scaled_controls_remain_a_reported_mismatch(self):
        local = np.array([[0, 0, 0], [10, 0, 0], [0, 0, 10], [10, 0, 10]])
        fit = fit_rigid_y(local, local*1.1)
        self.assertEqual(fit['scale'], 1)
        self.assertAlmostEqual(fit['rmsMetres'], math.sqrt(.5))

    def test_degenerate_or_invalid_point_controls_fail(self):
        with self.assertRaises(ValueError):
            fit_rigid_y([[0, 0, 0], [1, 0, 0], [2, 0, 0]], [[0, 0, 0], [1, 0, 0], [2, 0, 0]])
        with self.assertRaises(ValueError):
            fit_rigid_y(np.eye(3), np.eye(3), [1, 0, 1])

    def test_plane_registration_recovers_four_dof_and_rejects_roof_only(self):
        local = np.array([[2, 0, -4], [2, 3, 4], [-2, 2, -4], [-2, 0, 4],
                          [-2, 1, 4], [2, 1, 4], [-1, 6, -2], [1, 6, 2]], float)
        local_normals = np.array([[1, 0, 0], [1, 0, 0], [-1, 0, 0], [-1, 0, 0],
                                 [0, 0, 1], [0, 0, 1], [0, 1, 0], [0, 1, 0]])
        expected = {'yaw': -.05, 'translation': {'x': 10, 'y': 4, 'z': -20}}
        initial = {'yaw': -.02, 'translation': {'x': 10.3, 'y': 3.8, 'z': -20.4}}
        world = local_to_world(local, expected)
        normals = local_normals@rotation_y(expected['yaw']).T
        fit = fit_plane_registration(local, world, normals, initial)
        np.testing.assert_allclose(local_to_world(local, fit['placement']), world, atol=1e-7)
        self.assertLess(fit['planeRmsMetres'], 1e-7)
        with self.assertRaises(ValueError):
            fit_plane_registration(local, world, [[0, 1, 0]]*len(local), initial)

    def test_barycentric_uv_and_float32_hit_tolerance(self):
        triangle = [[-90, 4, 110], [-88, 4, 110], [-90, 6, 110]]
        uv = [[0, 0], [1, 0], [0, 1]]
        np.testing.assert_allclose(interpolate_uv([-89.5, 4.5, 110], triangle, uv), [.25, .25])
        self.assertIsNone(interpolate_uv([-87, 5, 110], triangle, uv))
        self.assertIsNone(interpolate_uv([-89.5, 4.5, 110.00001], triangle, uv))
        np.testing.assert_allclose(interpolate_uv([-89.5, 4.5, 110.00001], triangle, uv, 2e-4), [.25, .25])
        self.assertIsNone(barycentric([0, 0, 0], [[0, 0, 0]]*3))

    def test_uv_top_left_is_not_flipped_twice_and_bilinear_is_ungraded(self):
        pixels = np.array([[[255, 0, 0], [0, 255, 0]], [[0, 0, 255], [255, 255, 255]]], np.uint8)
        np.testing.assert_array_equal(sample_jpeg_rgb(pixels, [0, 0]), [255, 0, 0])
        np.testing.assert_array_equal(sample_jpeg_rgb(pixels, [0, 1]), [0, 0, 255])
        np.testing.assert_array_equal(sample_jpeg_rgb(pixels, [.5, .5]), [127.5]*3)
        with self.assertRaises(ValueError):
            sample_jpeg_rgb(pixels, [-.1, 0])

    def test_patch_selects_only_matching_exterior_whole_faces(self):
        p = patch()
        points = [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]]
        self.assertTrue(eligible_face(points, [0, 0, 1], 'wall', p['partIds'][0], p))
        self.assertTrue(eligible_face(points, [0, 0, 1], 'canopy', p['partIds'][0], p))
        for role, part_id, normal in [('glass', p['partIds'][0], [0, 0, 1]),
                                     ('wall', 'interior', [0, 0, 1]),
                                     ('wall', p['partIds'][0], [0, 0, -1]),
                                     ('wall', p['partIds'][0], [1, 0, 0])]:
            self.assertFalse(eligible_face(points, normal, role, part_id, p))
        self.assertFalse(eligible_face(np.array(points)+[0, 0, .1], [0, 0, 1], 'wall', p['partIds'][0], p))
        self.assertFalse(eligible_face(np.array(points)+[3, 0, 0], [0, 0, 1], 'wall', p['partIds'][0], p))
        p['normal'] = [0, 0, -1]
        with self.assertRaises(ValueError):
            patch_basis(p)

    def test_first_hit_gates_do_not_search_behind_occluders(self):
        p = patch()
        self.assertTrue(admissible_photo_hit([1, 1, 0], [0, 0, 1], [1, 1, .2], [0, 0, 1], '1:3', p))
        self.assertFalse(admissible_photo_hit([1, 1, 0], [0, 0, 1], [1, 1, .6], [0, 0, 1], '1:3', p))
        self.assertFalse(admissible_photo_hit([1, 1, 0], [0, 0, 1], [1, 1, .2], [1, 0, 0], '1:3', p))
        p['sourceTriangleIds'] = ['1:4']
        self.assertFalse(admissible_photo_hit([1, 1, 0], [0, 0, 1], [1, 1, .2], [0, 0, 1], '1:3', p))

    def test_raster_keeps_window_hole_and_top_bottom_orientation(self):
        # Four bars around a one-metre square opening, in patch (u,v).
        rectangles = [(0, 0, 4, 1), (0, 3, 4, 4), (0, 1, 1, 3), (3, 1, 4, 3)]
        triangles = []
        for x0, y0, x1, y1 in rectangles:
            triangles.extend([[[x0, y0], [x1, y0], [x1, y1]], [[x0, y0], [x1, y1], [x0, y1]]])
        mask = rasterize_patch_triangles(triangles, [0, 0, 4, 4], 8, 8)
        self.assertEqual(int(mask.sum()), 48)
        self.assertFalse(mask[3, 3])
        lower = rasterize_patch_triangles(triangles[:2], [0, 0, 4, 4], 8, 8)
        self.assertTrue(lower[-1].all())
        self.assertFalse(lower[0].any())

    def test_png_preserves_rgb_bytes_and_tags_srgb(self):
        pixels = np.array([[[128, 128, 128], [255, 0, 20]], [[0, 30, 255], [4, 5, 6]]], np.uint8)
        output = png_rgb_bytes(pixels)
        image = Image.open(io.BytesIO(output))
        np.testing.assert_array_equal(np.asarray(image), pixels)
        self.assertIn('srgb', image.info)
        np.testing.assert_allclose(linear_to_srgb([0, .0031308, 1]), [0, .040449936, 1])

    def test_i3s_verified_units_v_and_source_root_bounds(self):
        cache = Path(__file__).resolve().parents[2]/'.cache/cad-buildings-20261024/photogrammetry'
        cache.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            root = Path(directory)
            (root/'public').mkdir()
            positions = np.array([[1, 2, 3], [4, 2, 3], [1, 5, 3]], dtype='<f4')
            uv = np.array([[0, 0], [1, 0], [0, 1]], dtype='<f4')
            raw = struct.pack('<II', 3, 0)+positions.tobytes()+uv.tobytes()
            (root/'public/tile.bin').write_bytes(raw)
            node = {'id': '1', 'level': 16, 'vertices': 3, 'center': [120, 230, 340],
                    'geometry': '/tile.bin', 'geometrySha256': hashlib.sha256(raw).hexdigest()}
            manifest = {'highestDetailLevel': 16, 'metresPerMercatorUnit': .5, 'localPositionScale': .25,
                        'mercatorOrigin': {'x': 100, 'y': 200}, 'worldHeightReference': 326}
            triangles, actual_uv = load_i3s(node, manifest, root)
            np.testing.assert_allclose(triangles[0, 0], [10.25, 17, -15.5])
            np.testing.assert_array_equal(actual_uv[0], uv)
            norms, areas = triangle_normals(triangles)
            np.testing.assert_allclose(norms, [[0, 1, 0]])
            self.assertAlmostEqual(areas[0], .28125)
            self.assertEqual((root/'public/tile.bin').read_bytes(), raw)
            with self.assertRaises(ValueError):
                load_i3s({**node, 'geometrySha256': '0'*64}, manifest, root)
            with self.assertRaises(ValueError):
                verified_source_path(root, '../escape.bin', '0'*64)
            with self.assertRaises(ValueError):
                load_i3s({**node, 'level': 15}, manifest, root)


if __name__ == '__main__':
    unittest.main()
