"""Geometry regressions; synthetic fixtures contain no private CAD source."""

import json
import hashlib
import math
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

import numpy as np
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.ops import unary_union

import prepare_b01 as prepare


def current_height_recipe(path=None):
    """Optional private fixtures locally; B01_RECIPE_ACCEPTANCE=1 fails closed."""
    if path is None:
        path = prepare.ROOT / '.cache/cad-buildings-20261024/b01-preparation/recipe.json'

    def unavailable(reason):
        error = AssertionError if os.environ.get('B01_RECIPE_ACCEPTANCE') == '1' else unittest.SkipTest
        raise error(reason + '; regenerate with the current prepare_b01.py before recipe acceptance')

    try:
        recipe = json.loads(path.read_text(encoding='utf8'))
    except FileNotFoundError:
        unavailable('Private recipe absent')
    if recipe.get('generatorSha256') != prepare.generator_sha256():
        unavailable('Private recipe generator SHA-256 absent or stale')
    if recipe.get('heightModel', {}).get('id') != prepare.HEIGHT_MODEL_ID:
        unavailable('Private recipe height model is stale')
    return recipe


class RecipeProvenanceTests(unittest.TestCase):
    def fixture(self, sha='current', height=None):
        return {'generatorSha256': sha, 'heightModel': {'id': height or prepare.HEIGHT_MODEL_ID}}

    def load(self, fixture=None, strict=False, missing=False):
        path = Mock(spec=Path)
        if missing:
            path.read_text.side_effect = FileNotFoundError('synthetic missing fixture')
        else:
            path.read_text.return_value = json.dumps(fixture)
        with patch.dict(os.environ, {'B01_RECIPE_ACCEPTANCE': '1' if strict else '0'}), \
                patch.object(prepare, 'generator_sha256', return_value='current'):
            return current_height_recipe(path)

    def test_generator_fingerprints_actual_file_bytes(self):
        self.assertEqual(prepare.generator_sha256(), hashlib.sha256(Path(prepare.__file__).read_bytes()).hexdigest())

    def test_recipe_and_audit_receive_same_provenance(self):
        recipe, audit = {'floors': []}, {'status': 'fixture'}
        with patch.object(prepare, 'generator_sha256', return_value='current'):
            prepare.record_generator_provenance(recipe, audit, 'current')
        self.assertEqual(recipe, {'floors': [], 'generatorSha256': 'current'})
        self.assertEqual(audit, {'status': 'fixture', 'generatorSha256': 'current'})

    def test_midrun_generator_change_does_not_stamp_outputs(self):
        recipe, audit = {}, {}
        with patch.object(prepare, 'generator_sha256', return_value='newer'), \
                self.assertRaisesRegex(RuntimeError, 'Generator changed'):
            prepare.record_generator_provenance(recipe, audit, 'current')
        self.assertEqual((recipe, audit), ({}, {}))

    def test_matching_fixture_is_accepted_in_both_modes(self):
        for strict in [False, True]:
            self.assertEqual(self.load(self.fixture(), strict), self.fixture())

    def test_normal_mode_skips_missing_private_cache(self):
        with self.assertRaisesRegex(unittest.SkipTest, 'Private recipe absent'):
            self.load(missing=True)

    def test_strict_mode_fails_missing_private_cache(self):
        with self.assertRaisesRegex(AssertionError, 'Private recipe absent'):
            self.load(strict=True, missing=True)

    def test_old_sha_and_legacy_absent_sha_never_pass(self):
        for fixture in [self.fixture('old'), {'heightModel': {'id': prepare.HEIGHT_MODEL_ID}}]:
            for strict, error in [(False, unittest.SkipTest), (True, AssertionError)]:
                with self.assertRaisesRegex(error, 'SHA-256 absent or stale'):
                    self.load(fixture, strict)

    def test_matching_sha_does_not_bypass_height_model_check(self):
        for strict, error in [(False, unittest.SkipTest), (True, AssertionError)]:
            with self.assertRaisesRegex(error, 'height model is stale'):
                self.load(self.fixture(height='older-model'), strict)


class PreparationTests(unittest.TestCase):
    def test_measured_nosing_edges_are_not_confused_with_goings(self):
        lines = [prepare.segment(str(i), prepare.WEAK, [0, y], [2, y]) for i, y in enumerate([10, 10.28, 10.56])]
        flight = prepare.measured_stair_segment("test", lines, ["0", "1", "2"], "y", True,
                                                "n01", "n02", "n01.main", "n02.westWing")
        self.assertEqual(flight["riserPositions"], [0, 0.28, 0.56])
        self.assertEqual(flight["modeledRiserCount"], 3)
        self.assertEqual(flight["visibleIntervals"], 2)
        self.assertEqual(flight["ownerFloor"], "n01")
        self.assertEqual(flight["sourceFloor"], "n02")

    def test_decreasing_flight_keeps_positive_ordered_riser_distances(self):
        lines = [prepare.segment(str(i), prepare.WEAK, [x, 0], [x, 2]) for i, x in enumerate([1, 1.28, 1.56])]
        flight = prepare.measured_stair_segment("turn", lines, ["0", "1", "2"], "x", False,
                                                "n02", "n02", "n02.westWing", "turn")
        self.assertEqual(flight["treadPositions"], [1.56, 1.28, 1.0])
        self.assertEqual(flight["riserPositions"], [0, 0.28, 0.56])
        self.assertEqual(flight["sourceEntities"], ["2", "1", "0"])

    def test_missing_measured_edge_is_not_silently_filled(self):
        with self.assertRaisesRegex(ValueError, "Missing stair evidence"):
            prepare.measured_stair_segment("test", [], ["a", "b", "c"], "y", True,
                                            "n01", "n02", "n01.main", "n02.westWing")

    def test_landing_metadata_preserves_polygon_hole_and_owner(self):
        shape = box(0, 0, 4, 3).difference(box(1, 1, 2, 2))
        landing = prepare.stair_surface("landing", shape, "n03", "n03.westWing", "n03", ["a"], "synthetic")[0]
        coverage = unary_union([Polygon(triangle) for triangle in landing["triangles"]])
        self.assertLess(shape.symmetric_difference(coverage).area, 1e-8)
        self.assertEqual(landing["ownerFloor"], "n03")
        self.assertEqual(landing["levelKey"], "n03.westWing")

    def test_soffit_follows_last_actual_tread_below_terminal_landing(self):
        flight = {"a": [0, 0], "b": [0, 2], "lowerLevelKey": "low", "upperLevelKey": "high", "riserPositions": [0, 1, 2]}
        plane = prepare.stair_soffit_plane(flight, levels={"low": 1.0, "high": 1.6})
        self.assertAlmostEqual(plane[2], 0.8)
        self.assertAlmostEqual(plane[1] * 2 + plane[2], 1.2)

    def test_under_stair_mask_preserves_untouched_wall_and_limits_cap(self):
        wall = box(0, 0, 3, 0.2)
        structural = {"masks": [{"id": "cap", "floor": "p01", "geometry": box(0, 0, 1, 0.2),
                                 "bottom": -3, "top": 0, "ceilingPlane": [0, 0, -1],
                                 "sourceEntities": ["a", "b"], "basis": "synthetic measured support"}]}
        remaining, solids = prepare.apply_under_stair_walls(wall, [], "p01", structural)
        capped = unary_union([Polygon(s["loops"][0], s["loops"][1:]) for s in solids])
        self.assertLess(unary_union([remaining, capped]).symmetric_difference(wall).area, 1e-8)
        self.assertTrue(remaining.covers(Point(2, 0.1)))
        self.assertFalse(capped.covers(Point(2, 0.1)))
        self.assertTrue(all(s["ceilingPlane"] == [0, 0, -1] for s in solids))

    def test_new_height_hypothesis_is_explicit_and_consistent(self):
        self.assertEqual(prepare.stair_level_height("p01.westWing"), -4.65)
        self.assertEqual(prepare.stair_level_height("n02.eastWing"), 1.05)
        self.assertEqual(prepare.stair_level_height("n03.westWing"), 4.35)
        self.assertEqual(prepare.stair_level_height("n04.eastWing"), 8.05)
        self.assertEqual(prepare.height_model_metadata()['status'], 'interpretation-not-surveyed')

    @staticmethod
    def boundary_lines(polygon):
        lines = []
        for ring_index, ring in enumerate([polygon.exterior, *polygon.interiors]):
            points = list(ring.coords)
            for index, (a, b) in enumerate(zip(points, points[1:])):
                lines.append(prepare.segment(f"ring-{ring_index}-{index}", prepare.STRONG, a, b))
        return lines

    @staticmethod
    def synthetic_protective_lines():
        endpoints = {
            "2868": ((0, 0), (2, 0)), "2869": ((2, 0), (2, 4)),
            "286A": ((2, 4), (1.8, 4)), "286B": ((1.8, 4), (1.8, 0.2)),
            "286C": ((0, 0.2), (1.8, 0.2)),
            "28CA": ((-3, 0), (-5, 0)), "28CB": ((-5, 0), (-5, 4)),
            "28CC": ((-5, 4), (-3, 4)), "28CD": ((-4.8, 0.2), (-4.8, 3.8)),
            "28CE": ((-4.8, 3.8), (-3, 3.8)), "28CF": ((-3, 0.2), (-4.8, 0.2)),
        }
        lines = [prepare.segment(identifier, prepare.WEAK, a, b) for identifier, (a, b) in endpoints.items()]
        lines += [prepare.segment("160B", prepare.STRONG, (0, 0), (0, 5)),
                  prepare.segment("185C", prepare.STRONG, (-3, 0), (-3, 5))]
        return lines

    def test_construction_bbox_keeps_both_retaining_edges_outside_room_buffer(self):
        rooms = unary_union([box(0, 8, 10, 12), box(20, 0, 30, 12)])
        outer = LineString([(17.4, 0), (17.4, 6)])
        inner = LineString([(17.7, 0), (17.7, 6)])
        self.assertFalse(rooms.buffer(2.5).intersects(outer))
        self.assertTrue(rooms.buffer(2.5).intersects(inner))
        domain = prepare.construction_domain(rooms)
        self.assertTrue(domain.covers(outer))
        self.assertTrue(domain.covers(inner))

    def test_construction_bbox_rejects_remote_entities_and_crossing_origin_line(self):
        domain = prepare.construction_domain(box(10, 10, 20, 20), margin=5)
        self.assertFalse(domain.covers(LineString([(0, 0), (1, 1)])))
        self.assertFalse(domain.covers(LineString([(-1000, 15), (15, 15)])))
        self.assertFalse(domain.covers(LineString([(4.9, 10), (4.9, 20)])))
        self.assertTrue(domain.covers(LineString([(5.1, 10), (5.1, 20)])))

    def test_default_margin_retains_measured_entry_platform_extension(self):
        domain = prepare.construction_domain(box(10, 10, 20, 20))
        self.assertTrue(domain.covers(LineString([(20, 12), (25.085, 12)])))
        self.assertFalse(domain.covers(LineString([(20, 12), (26.1, 12)])))

    def test_protective_profiles_are_only_thin_l_u_shapes(self):
        profiles = prepare.n01_protective_profiles("n01", self.synthetic_protective_lines())
        east, west = (profile["geometry"] for profile in profiles)
        east_expected = unary_union([box(0, 0, 2, 0.2), box(1.8, 0, 2, 4)])
        west_expected = unary_union([box(-5, 0, -3, 0.2), box(-5, 0, -4.8, 4), box(-5, 3.8, -3, 4)])
        self.assertLess(east.symmetric_difference(east_expected).area, 1e-8)
        self.assertLess(west.symmetric_difference(west_expected).area, 1e-8)
        self.assertFalse(east.covers(Point(1, 2)))
        self.assertFalse(west.covers(Point(-4, 2)))

    def test_low_protection_is_one_meter_and_leaves_adjacent_facade_full_height(self):
        profiles = prepare.n01_protective_profiles("n01", self.synthetic_protective_lines())
        mask = unary_union([profile["geometry"] for profile in profiles])
        facade = box(-0.2, 0, 0, 4)
        self.assertLess(facade.intersection(mask).area, 1e-8)
        base = prepare.local_level("n01", True)
        full = prepare.wall_bands(facade.difference(mask), [], base, base + 3, "normal")
        low = prepare.wall_bands(mask, [], base, base + 1, "low", role="low-barrier", material="concrete")
        self.assertTrue(all(abs(s["top"] - s["bottom"] - 1) < 1e-6 for s in low))
        self.assertTrue(all(s["role"] == "low-barrier" for s in low))
        self.assertTrue(all(abs(s["top"] - (base + 3)) < 1e-8 and s["role"] == "wall" for s in full))
        self.assertEqual(prepare.n01_protective_profiles("p01", []), [])

    def test_incomplete_protective_source_stops_instead_of_guessing_a_mask(self):
        with self.assertRaisesRegex(ValueError, "Cannot establish measured"):
            prepare.n01_protective_profiles("n01", self.synthetic_protective_lines()[:-1])

    def test_protective_profile_must_not_intrude_into_a_room(self):
        with self.assertRaisesRegex(ValueError, "intrudes into a measured room"):
            prepare.n01_protective_profiles("n01", self.synthetic_protective_lines(), box(1.7, 1, 2.2, 3))

    def test_exterior_voids_open_only_the_identified_n01_shafts(self):
        profiles = prepare.n01_protective_profiles("n01", self.synthetic_protective_lines())
        rooms = box(-3, 0, 0, 4)
        voids = prepare.exterior_void_profiles(profiles, rooms, box(-10, -10, 10, 10))
        envelope = box(-5, 0, 2, 4)
        floor = prepare.cut_exterior_voids("n01", envelope, voids)
        self.assertFalse(floor.covers(Point(1, 2)))
        self.assertFalse(floor.covers(Point(-4, 2)))
        self.assertTrue(floor.covers(Point(-1, 2)))
        self.assertTrue(floor.covers(Point(1.9, 2)))
        self.assertTrue(all(void["bottom"] == prepare.local_level("p01", True) and void["openAbove"] == prepare.local_level("n01", True) for void in voids))
        self.assertTrue(all(void["provenance"] == "derived historical shaft footprint; heights estimated" for void in voids))

    def test_exterior_void_cut_preserves_an_unlabelled_vestibule(self):
        profiles = prepare.n01_protective_profiles("n01", self.synthetic_protective_lines())
        voids = prepare.exterior_void_profiles(profiles, box(-3, 0, 0, 4), box(-10, -10, 10, 10))
        vestibule = box(4, 1, 4.5, 1.5)
        envelope = unary_union([box(-5, 0, 2, 4), vestibule])
        floor = prepare.cut_exterior_voids("n01", envelope, voids)
        self.assertTrue(floor.covers(vestibule))

    def test_exterior_void_does_not_remove_basement_bottom_slab(self):
        profiles = prepare.n01_protective_profiles("n01", self.synthetic_protective_lines())
        voids = prepare.exterior_void_profiles(profiles, box(-3, 0, 0, 4), box(-10, -10, 10, 10))
        envelope = box(-5, 0, 2, 4)
        basement = prepare.cut_exterior_voids("p01", envelope, voids)
        self.assertTrue(basement.covers(Point(1, 2)))
        self.assertTrue(basement.covers(Point(-4, 2)))
        level = prepare.local_level("p01", True)
        bottom = prepare.serialize_solids(basement, "p01-wing", "slab", level - 0.2, level, "floor")
        self.assertTrue(all(solid["top"] == level for solid in bottom))

    def test_stair_exit_clears_only_the_upper_cross_barrier(self):
        profiles=prepare.n01_protective_profiles('n01',self.synthetic_protective_lines())
        voids=prepare.exterior_void_profiles(profiles,box(-3,0,0,4),box(-10,-10,10,10))
        exits=prepare.exterior_stair_exit_masks(profiles,voids)
        self.assertEqual(len(exits),1)
        cut=exits[0]['geometry']
        west=next(p['geometry'] for p in profiles if p['id']=='east-wing-west-side')
        self.assertTrue(cut.covers(Point(-4,3.9)))
        self.assertFalse(cut.covers(Point(-4.9,2)))
        self.assertTrue(west.difference(cut).covers(Point(-4.9,2)))
        base = prepare.local_level('n01', True)
        self.assertEqual((exits[0]['bottom'],exits[0]['top']),(base,round(base+1,4)))

    def test_missing_external_basement_floor_is_created_only_in_shaft(self):
        profiles = prepare.n01_protective_profiles("n01", self.synthetic_protective_lines())
        rooms = box(-3, 0, 0, 4)
        voids = prepare.exterior_void_profiles(profiles, rooms, box(-10, -10, 10, 10))
        basement = prepare.cut_exterior_voids("p01", rooms, voids)
        self.assertTrue(basement.covers(rooms))
        for void in voids:
            self.assertLess(void["geometry"].difference(basement).area, 1e-8)
        self.assertFalse(basement.covers(Point(4, 2)))
        self.assertTrue(prepare.cut_exterior_voids("n02", rooms, voids).equals(rooms))

    def test_exterior_stair_plan_reports_measured_treads_without_invented_heights(self):
        treads = [prepare.segment(str(i), prepare.WEAK, [0, i * 0.3], [1.8 if i < 4 else 0.9, i * 0.3]) for i in range(5)]
        plan = prepare.measured_exterior_flight("synthetic", treads, partial_edges=("4",))
        self.assertEqual(plan["visibleTreadEdges"], 5)
        self.assertEqual(plan["visibleGoings"], 4)
        self.assertEqual(plan["goingRange"], [0.3, 0.3])
        self.assertFalse(plan["heightsMeasured"])
        self.assertIsNone(plan["bottom"])
        self.assertIsNone(plan["top"])

    def test_partial_exterior_tread_and_arrow_are_not_walls(self):
        definitions=[('partial',prepare.WEAK,[0,3.9],[0.8,3.9]),
                     ('arrow',prepare.WEAK,[0.8,3.9],[0.6,3.6]),
                     ('break',prepare.WEAK,[0,4.2],[2,3.7]),
                     ('structural',prepare.STRONG,[0,0],[0,4]),
                     ('side-wall',prepare.WEAK,[2, -2],[2,6]),
                     ('outside',prepare.WEAK,[2.2,1],[2.2,2])]
        lines=[prepare.segment(*args) for args in definitions]
        excluded=prepare.exterior_stair_graphic_ids(lines,[{'bounds':[0,0,2,4]}])
        self.assertEqual(excluded,{'partial','arrow','break'})

    def test_closed_unflagged_profile_is_matched_to_its_column(self):
        profile = prepare.rectangular_profile([(-0.3, -0.2), (0.3, -0.2), (0.3, 0.5), (-0.3, 0.5), (-0.3, -0.2)])
        column = prepare.clean(Point(0, 0).buffer(0.2, quad_segs=16))
        covers, unresolved = prepare.matched_column_covers([("cover", profile)], [("column", column)])
        self.assertEqual(len(covers), 1)
        self.assertEqual(unresolved, [])
        self.assertEqual(covers[0]["columnId"], "column")
        self.assertLess(covers[0]["geometry"].intersection(column).area, 1e-8)
        self.assertLess(unary_union([covers[0]["geometry"], column]).symmetric_difference(profile).area, 1e-8)
        solids = prepare.serialize_solids(covers[0]["geometry"], "test-cover", "column-cover", 0, 3, "plaster")
        triangles = unary_union([Polygon(triangle) for solid in solids for triangle in solid["triangles"]])
        self.assertLess(triangles.intersection(column).area, 1e-8)

    def test_unproven_rectangular_outline_does_not_create_a_column_cover(self):
        points = [(-0.3, -0.2), (0.3, -0.2), (0.3, 0.5), (-0.3, 0.5)]
        self.assertIsNone(prepare.rectangular_profile(points))
        profile = prepare.rectangular_profile(points, closed=True)
        covers, unresolved = prepare.matched_column_covers([("unknown", profile)], [])
        self.assertEqual(covers, [])
        self.assertEqual(len(unresolved), 1)

    def test_profile_covering_two_distinct_columns_is_not_assigned_arbitrarily(self):
        profile = box(-0.35, -0.175, 0.35, 0.175)
        columns = [("a", Point(-0.18, 0).buffer(0.15)), ("b", Point(0.18, 0).buffer(0.15))]
        covers, unresolved = prepare.matched_column_covers([("ambiguous", profile)], columns)
        self.assertEqual(covers, [])
        self.assertEqual(len(unresolved), 1)

    def test_n04_like_ring_recovers_four_measured_corner_squares(self):
        outer, inner = box(0, 0, 3, 4), box(0.2, 0.2, 2.8, 3.8)
        expected = outer.difference(inner)
        strips = unary_union([box(0.2, 0, 2.8, 0.2), box(0.2, 3.8, 2.8, 4),
                              box(0, 0.2, 0.2, 3.8), box(2.8, 0.2, 3, 3.8)])
        wall, repairs = prepare.close_wall_junctions(self.boundary_lines(expected), strips, inner)
        self.assertEqual(len(repairs), 4)
        self.assertAlmostEqual(wall.area - strips.area, 4 * 0.04, places=6)
        self.assertLess(wall.symmetric_difference(expected).area, 1e-8)

    def test_n02_like_l_join_closes_only_missing_thin_corner(self):
        expected = Polygon([(0, 0), (3, 0), (3, 0.1), (0.1, 0.1), (0.1, 2), (0, 2)])
        strips = unary_union([box(0.1, 0, 3, 0.1), box(0, 0.1, 0.1, 2)])
        wall, repairs = prepare.close_wall_junctions(self.boundary_lines(expected), strips, GeometryCollection())
        self.assertEqual(len(repairs), 1)
        self.assertAlmostEqual(wall.area - strips.area, 0.01, places=6)
        self.assertTrue(wall.covers(Point(0.05, 0.05)))

    def test_t_join_uses_measured_branch_ending_at_the_junction(self):
        expected = unary_union([box(-2, 0, 2, 0.2), box(-0.1, -2, 0.1, 0)])
        gap = box(-0.1, 0, 0.1, 0.2)
        strips = expected.difference(gap)
        wall, repairs = prepare.close_wall_junctions(self.boundary_lines(expected), strips, GeometryCollection())
        self.assertEqual(len(repairs), 1)
        self.assertLess(wall.symmetric_difference(expected).area, 1e-8)

    def test_small_unlabelled_shaft_is_not_solid_construction(self):
        shaft = box(0.15, 0.15, 0.45, 0.45)
        ring = box(0, 0, 0.6, 0.6).difference(shaft)
        wall, repairs = prepare.close_wall_junctions(self.boundary_lines(ring), ring, GeometryCollection())
        self.assertEqual(repairs, [])
        self.assertFalse(wall.covers(Point(0.3, 0.3)))
        self.assertAlmostEqual(wall.area, ring.area, places=6)

    def test_small_unlabelled_vestibule_is_not_filled(self):
        vestibule = box(0.1, 0.1, 0.7, 0.5)
        ring = box(0, 0, 0.8, 0.6).difference(vestibule)
        wall, repairs = prepare.close_wall_junctions(self.boundary_lines(ring), ring, GeometryCollection())
        self.assertEqual(repairs, [])
        self.assertLess(wall.intersection(vestibule).area, 1e-8)

    def test_tiny_vestibule_connected_to_a_door_is_not_a_junction(self):
        interior = box(0.15, 0.15, 0.45, 0.45)
        doorway = box(0.225, 0, 0.375, 0.2)
        walls = box(0, 0, 0.6, 0.6).difference(unary_union([interior, doorway]))
        lines = self.boundary_lines(box(0, 0, 0.6, 0.6))
        # The source outer contour is closed by a weak threshold; the small
        # vestibule has no room polygon and no closed interior source ring.
        lines = [line for line in lines if not (line.a[1] == line.b[1] == 0)]
        lines += [prepare.segment("threshold", prepare.WEAK, [0, 0], [0.6, 0]),
                  prepare.segment("inside-left", prepare.STRONG, [0.15, 0.15], [0.15, 0.45]),
                  prepare.segment("inside-top", prepare.STRONG, [0.15, 0.45], [0.45, 0.45]),
                  prepare.segment("inside-right", prepare.STRONG, [0.45, 0.45], [0.45, 0.15])]
        wall, repairs = prepare.close_wall_junctions(lines, walls, GeometryCollection())
        self.assertEqual(repairs, [])
        self.assertLess(wall.intersection(interior).area, 1e-8)

    def test_open_or_single_direction_source_does_not_invent_join(self):
        strips = unary_union([box(0.2, 0, 3, 0.2), box(0, 0.2, 0.2, 3)])
        lines = [prepare.segment("a", prepare.STRONG, [0, 0], [3, 0]),
                 prepare.segment("b", prepare.STRONG, [0, 0], [0, 3])]
        wall, repairs = prepare.close_wall_junctions(lines, strips, GeometryCollection())
        self.assertEqual(repairs, [])
        self.assertFalse(wall.covers(Point(0.1, 0.1)))

    def test_measured_partition_with_door_and_window_remains_open(self):
        wall = box(0, 0, 8, 0.2)
        openings = [
            {"bottom": 0, "top": 2.1, "cut": box(1, -1, 2, 1)},
            {"bottom": 0.9, "top": 2.4, "cut": box(4, -1, 6, 1)},
        ]
        solids = prepare.wall_bands(wall, openings, 0, 3, "synthetic")

        def section(height):
            return unary_union([Polygon(s["loops"][0], s["loops"][1:]) for s in solids if s["bottom"] < height < s["top"]])

        self.assertFalse(section(1.2).covers(Point(1.5, 0.1)))
        self.assertFalse(section(1.2).covers(Point(5, 0.1)))
        self.assertTrue(section(0.4).covers(Point(5, 0.1)))
        self.assertTrue(section(2.7).covers(Point(1.5, 0.1)))
        self.assertTrue(section(1.2).covers(Point(3, 0.1)))

    def test_paired_rotated_walls_keep_measured_width(self):
        angle = math.radians(17)
        axis = np.array([math.cos(angle), math.sin(angle)])
        normal = np.array([-axis[1], axis[0]])
        a = prepare.segment("a", prepare.STRONG, [10, 20], np.array([10, 20]) + 5 * axis)
        b = prepare.segment("b", prepare.STRONG, a.a + normal * 0.23, a.b + normal * 0.23)
        wall, _, _ = prepare.pair_walls([a, b], GeometryCollection())
        self.assertAlmostEqual(wall.area, 5 * 0.23, delta=0.004)

    def test_room_interior_stair_lines_do_not_become_walls(self):
        treads = [prepare.segment(str(i), prepare.WEAK, [1, 1 + 0.3 * i], [3, 1 + 0.3 * i]) for i in range(8)]
        wall, _, _ = prepare.pair_walls(treads, box(0, 0, 4, 4))
        self.assertTrue(wall.is_empty)

    def test_external_stair_treads_without_room_polygon_do_not_become_walls(self):
        treads = [prepare.segment(str(i), prepare.WEAK, [1, 1 + 0.3 * i], [3, 1 + 0.3 * i]) for i in range(8)]
        wall, _, _ = prepare.pair_walls(treads, GeometryCollection())
        self.assertTrue(wall.is_empty)

    def test_two_strong_partition_edges_override_inconsistent_room_fill(self):
        lines = [prepare.segment("a", prepare.STRONG, [1, 1], [1, 5]),
                 prepare.segment("b", prepare.STRONG, [1.12, 1], [1.12, 5])]
        conflicts = []
        wall, _, _ = prepare.pair_walls(lines, box(0, 0, 6, 6), conflicts)
        self.assertAlmostEqual(wall.area, 0.48, places=6)
        self.assertEqual(len(conflicts), 1)

    def test_constrained_triangles_preserve_concavity_and_stair_hole(self):
        polygon = Polygon([(0, 0), (6, 0), (6, 2), (3, 2), (3, 6), (0, 6)], [[(0.5, 1), (2, 1), (2, 3), (0.5, 3)]])
        solid = prepare.serialize_solids(polygon, "test", "slab", -0.2, 0, "floor")[0]
        coverage = unary_union([Polygon(t) for t in solid["triangles"]])
        self.assertAlmostEqual(coverage.area, polygon.area, places=6)
        self.assertLess(coverage.symmetric_difference(polygon).area, 1e-8)
        self.assertFalse(coverage.covers(Point(1, 2)))
        self.assertFalse(coverage.covers(Point(4, 4)))

    def test_door_arc_recovers_actual_hinge_and_closed_end(self):
        hinge = np.array([10, 20])
        points = [hinge + [0.9 * math.cos(t), 0.9 * math.sin(t)] for t in np.linspace(0, math.pi / 2, 17)]
        leaf = prepare.segment("leaf", "3-DVERE", hinge, hinge + [0, 0.9])
        doors, corrections = prepare.doors_from_arcs([leaf], [("arc", points)], "test")
        self.assertEqual(corrections, [])
        np.testing.assert_allclose(doors[0]["hinge"], hinge)
        np.testing.assert_allclose(doors[0]["closedEnd"], hinge + [0.9, 0])
        np.testing.assert_allclose(doors[0]["openEnd"], hinge + [0, 0.9])

    def test_missing_or_unmatched_door_is_an_error(self):
        points = [[math.cos(t), math.sin(t)] for t in np.linspace(0, math.pi / 2, 17)]
        with self.assertRaisesRegex(ValueError, "Missing door leaf"):
            prepare.doors_from_arcs([], [("arc", points)], "test")
        with self.assertRaisesRegex(ValueError, "Collinear"):
            prepare.fit_circle([[0, 0], [1, 0], [2, 0]])

    def test_parallel_window_lines_are_one_pane(self):
        lines = [prepare.segment("a", "3-OKNA", [0, 0], [1.2, 0]),
                 prepare.segment("b", "3-OKNA", [1.2, 0.05], [0, 0.05])]
        windows, duplicates = prepare.windows_from_lines(lines, "test")
        self.assertEqual(len(windows), 1)
        self.assertEqual(duplicates, [])
        np.testing.assert_allclose(windows[0]["a"], [0, 0.025])
        np.testing.assert_allclose(windows[0]["b"], [1.2, 0.025])

    def test_non_finite_or_zero_geometry_is_not_exported(self):
        self.assertIsNone(prepare.segment("z", prepare.STRONG, [0, 0], [0, 0]))
        with self.assertRaisesRegex(ValueError, "Non-finite"):
            prepare.segment("n", prepare.STRONG, [0, float("nan")], [1, 0])

    def test_missing_input_stops_before_output(self):
        with self.assertRaisesRegex(FileNotFoundError, "Missing B1 plans"):
            prepare.source_files(Path(__file__).parent / "missing-synthetic-source")


class WestExteriorTests(unittest.TestCase):
    def flight(self):
        return prepare.measured_edge_flight("synthetic-skew", [[[0, 0], [0, 2]], [[0.3, 0.1], [0.3, 2.12]],
                                                              [[0.6, 0.2], [0.6, 2.2]]],
                                             ["a", "b", "c"], "low", "high")

    def test_skew_edges_and_different_widths_are_preserved(self):
        flight = self.flight()
        self.assertEqual(flight["frontEdgesCad"][1], [[0.3, 0.1], [0.3, 2.12]])
        self.assertEqual(flight["widthRange"], [2, 2.02])
        self.assertEqual(flight["modeledRiserCount"], 3)
        self.assertEqual(flight["visibleIntervals"], 2)
        self.assertAlmostEqual(flight["riserPositions"][1], math.hypot(.3, .11), places=6)
        self.assertEqual(flight["ownerFloor"], "p01")
        self.assertEqual(flight["sourceFloor"], "n01")

    def test_reversed_line_endpoint_order_does_not_twist_flight(self):
        flight = prepare.measured_edge_flight("reverse", [[[0, 0], [0, 2]], [[.3, 2.1], [.3, .1]], [[.6, .2], [.6, 2.2]]],
                                                ["a", "b", "c"], "low", "high")
        self.assertEqual(flight["frontEdgesCad"][1], [[.3, .1], [.3, 2.1]])

    def test_endpoint_normalization_does_not_mutate_source_array(self):
        edges = np.array([[[0, 0], [0, 2]], [[.3, 2.1], [.3, .1]], [[.6, .2], [.6, 2.2]]])
        saved = edges.copy()
        prepare.measured_edge_flight("source", edges, ["a", "b", "c"], "low", "high")
        self.assertTrue(np.array_equal(edges, saved))

    def test_backtracking_front_edges_fail_instead_of_reordering_evidence(self):
        with self.assertRaisesRegex(ValueError, "Unordered"):
            prepare.measured_edge_flight("bad", [[[0,0],[0,2]], [[.6,0],[.6,2]], [[.3,0],[.3,2]]],
                                          ["a","b","c"], "low", "high")

    def test_landing_starts_on_exact_terminal_edge_and_has_half_meter_support(self):
        flight = self.flight()
        direction = np.array(flight["b"]) - flight["a"]
        direction /= np.linalg.norm(direction)
        upper = prepare.edge_landing(flight, True)
        lower = prepare.edge_landing(flight, False)
        self.assertTrue(upper.buffer(1e-8).covers(LineString(flight["frontEdgesCad"][-1])))
        self.assertTrue(lower.covers(Point(np.array(flight["a"]) - .5 * direction)))
        self.assertTrue(upper.covers(Point(np.array(flight["b"]) + .5 * direction)))

    def test_skew_soffit_is_constant_across_each_front_and_follows_measured_rise(self):
        flight = self.flight()
        masks = prepare.edge_soffit_masks(flight, {"low": -5, "high": -4.4})
        for index, mask in enumerate(masks):
            plane = mask["ceilingPlane"]
            heights = [plane[0]*x + plane[1]*y + plane[2] for x,y in flight["frontEdgesCad"][index]]
            self.assertAlmostEqual(heights[0], -5.2 + index * .2)
            self.assertAlmostEqual(heights[0], heights[1])
        last = flight["frontEdgesCad"][-1][0]
        plane = masks[-1]["ceilingPlane"]
        self.assertAlmostEqual(plane[0]*last[0]+plane[1]*last[1]+plane[2], -4.8)

    def test_measured_retaining_thickness_is_not_an_estimated_constant(self):
        a = prepare.segment("a", prepare.STRONG, [0,0], [5,0])
        b = prepare.segment("b", prepare.STRONG, [1,.28], [4,.28])
        self.assertAlmostEqual(prepare.paired_thickness(a,b), .28)
        band = prepare.outer_boundary_band(a, .28, box(0,0,5,3))
        self.assertLess(band.intersection(box(0,0,5,3)).area, 1e-9)
        self.assertAlmostEqual(band.area, 1.4)

    def test_retaining_bands_are_partitioned_without_overlapping_solids(self):
        profiles = [{"id": str(i), "geometry": shape, "bottom": -5, "top": -2,
                     "sourceEntities": [str(i)], "basis": "fixture"}
                    for i,shape in enumerate([box(0,0,2,.3), box(1.8,0,2.1,2)])]
        masks = [{"id": "upper", "geometry": box(0,0,1,1), "ceilingPlane": [0,0,-3],
                  "sourceEntities": ["a"], "basis": "fixture"}]
        solids = prepare.west_retaining_solids({"retaining": profiles, "masks": masks})
        shapes = [Polygon(s["loops"][0],s["loops"][1:]) for s in solids]
        self.assertAlmostEqual(sum(p.area for p in shapes), unary_union(shapes).area)
        capped = [s for s in solids if s.get("ceilingPlane")]
        self.assertTrue(capped)
        self.assertTrue(all(s["bottom"] == -5 for s in capped))
        self.assertTrue(all(s["ceilingPlane"] == [0,0,-3] for s in capped))

    def test_specific_graphics_and_replaced_pairs_exclude_no_facade_return(self):
        n01 = prepare.west_exterior_exclusions("n01")
        p01 = prepare.west_exterior_exclusions("p01")
        self.assertTrue({"3180", "318F", "31E3", "31ED", "31DE"} <= n01)
        self.assertTrue({"279A", "27F0", "152B", "152C", "1533", "1534", "B7", "B8"} <= p01)
        self.assertNotIn("152A", p01)
        self.assertNotIn("B2", p01)
        for window in ("2738", "2739", "273C", "273F", "2720", "2721"):
            self.assertNotIn(window, p01)
        self.assertEqual(prepare.west_exterior_exclusions("n02"), set())

    def test_courtyard_cut_is_local_and_does_not_remove_other_floors(self):
        envelope = box(0,0,10,10)
        west = {"terrainCutouts": [{"loops": [[[0,0],[2,0],[2,4],[0,4]]]}]}
        self.assertAlmostEqual(prepare.west_floor_geometry("n01", envelope, west).area, 92)
        self.assertAlmostEqual(prepare.west_floor_geometry("p01", envelope, west).area, 92)
        self.assertEqual(prepare.west_floor_geometry("n02", envelope, west), envelope)
        self.assertTrue(prepare.west_floor_geometry("n01", envelope, west).covers(Point(5,5)))

    def test_door_threshold_is_replaced_once_only_on_basement_floor(self):
        envelope = box(0,0,4,4)
        west = {"terrainCutouts": [{"loops": [[[0,0],[1,0],[1,4],[0,4]]]}],
                "doorConnectors": [{"geometry": box(.8,1,1.3,2)}]}
        p01 = prepare.west_floor_geometry("p01", envelope, west)
        n01 = prepare.west_floor_geometry("n01", envelope, west)
        self.assertFalse(p01.covers(Point(1.2,1.5)))
        self.assertTrue(n01.covers(Point(1.2,1.5)))
        restored = unary_union([p01, box(0,0,1,4), box(.8,1,1.3,2)])
        self.assertLess(restored.symmetric_difference(envelope).area, 1e-8)


class ExteriorRouteTests(unittest.TestCase):
    def support_fixture(self, low=-2.6, high=0, floor=-3.2):
        pairs = [('1D2',[1,0],[1,2]),('1D3',[1.2,0],[1.2,2]),
                 ('1D4',[0,2.2],[1.2,2.2]),('1D5',[0,2],[1.2,2]),
                 ('1D6',[0,0],[1.2,0]),('1D7',[0,-.2],[1.2,-.2])]
        data = {'p01':{'lines':[prepare.segment(h,prepare.STRONG,a,b) for h,a,b in pairs]}}
        flight = prepare.measured_edge_flight('entry', [[[2,0],[2,2]],[[1,0],[1,2]],[[0,0],[0,2]]],
                                              ['a','b','c'], 'outside','inside','n01','n01')
        landing = prepare.stair_surface('upper',box(-.5,0,0,2),'n01','inside','n01',['b'],'fixture')[0]
        exterior = {'levels':{'outside':low,'inside':high,'p01.main':floor},
                    'plans':[{'id':'exterior-main-east','segments':[flight],'landings':[landing],'upperLevelKey':'inside'}]}
        return data,exterior

    def test_s146_cap_is_limited_to_measured_wall_pairs_and_source_flight(self):
        data,exterior = self.support_fixture()
        masks = prepare.exterior_support_masks(data, exterior)
        shapes = unary_union([m['geometry'] for m in masks])
        self.assertTrue(shapes.covers(Point(1.1,1)))
        self.assertFalse(shapes.covers(Point(.5,1)), 'the room must not become a convex wall mask')
        self.assertFalse(shapes.covers(Point(.5,2.1)), 'outside-flight wall strip remains unchanged')

    def test_s146_soffit_and_bottom_follow_level_map_changes(self):
        data,exterior = self.support_fixture()
        masks = prepare.exterior_support_masks(data, exterior)
        changed_data,changed = self.support_fixture(low=-1.8,high=.2,floor=-2.8)
        shifted = prepare.exterior_support_masks(changed_data, changed)
        self.assertTrue(all(m['bottom']==-2.8 and m['top']==0 for m in shifted))
        a = next(m for m in masks if m['geometry'].covers(Point(1.1,1)))['ceilingPlane']
        b = next(m for m in shifted if m['geometry'].covers(Point(1.1,1)))['ceilingPlane']
        self.assertNotAlmostEqual(a[0]*1.1+a[2], b[0]*1.1+b[2])

    def test_source_flight_keeps_its_actual_owner_and_source_floor(self):
        data = {"p01": {"lines": [prepare.segment(str(i), prepare.WEAK, [0,y],[2,y]) for i,y in enumerate([0,.3,.6])]}}
        flight = prepare.source_edge_flight(data, "route", "p01", "n01", ["0","1","2"], "p01.eastWing", "n01.eastWing")
        self.assertEqual(flight["ownerFloor"], "n01")
        self.assertEqual(flight["sourceFloor"], "p01")
        self.assertEqual(flight["edgeSourceEntities"], [["0"],["1"],["2"]])

    def test_shaft_landing_uses_the_enclosure_on_the_correct_side_of_front(self):
        flight = prepare.measured_edge_flight("shaft", [[[0,1],[2,1]], [[0,1.3],[2,1.3]], [[0,1.6],[2,1.6]]],
                                              ["a","b","c"], "low", "high")
        lower = prepare.landing_side_of_edge(flight, False, box(-.1,0,2.1,3))
        upper = prepare.landing_side_of_edge(flight, True, box(-.1,0,2.1,3))
        self.assertTrue(lower.covers(Point(1,.5)))
        self.assertFalse(lower.covers(Point(1,1.4)))
        self.assertTrue(upper.covers(Point(1,2.5)))
        self.assertFalse(upper.covers(Point(1,1.4)))

    def test_only_same_height_same_floor_landing_replaces_existing_support(self):
        exterior = {"levels": {"low": -5, "high": -1.8}, "plans": [{"landings": [
            {"loops": [[[0,0],[1,0],[1,1],[0,1]]], "ownerFloor": "p01", "levelKey": "low"},
            {"loops": [[[0,2],[1,2],[1,3],[0,3]]], "ownerFloor": "n01", "levelKey": "high"}]}]}
        floor = box(0,0,2,3)
        remaining = prepare.reserve_landing_surfaces("p01", floor, -5, exterior)
        self.assertAlmostEqual(remaining.area, 5)
        self.assertTrue(remaining.covers(Point(.5,2.5)))
        self.assertEqual(prepare.reserve_landing_surfaces("p01", floor, -3.2, exterior), floor)
        self.assertLess(unary_union([remaining,box(0,0,1,1)]).symmetric_difference(floor).area, 1e-8)

    def test_facade_symbols_are_classified_without_inventing_access_or_changing_xy(self):
        door = {"sourceEntities": ["25E3","25E2"], "hinge": [1,2], "closedEnd": [1,3]}
        prepare.classify_facade_opening("n02", door)
        self.assertFalse(door["accessConfirmed"])
        self.assertEqual(door["hinge"], [1,2])
        known = {"sourceEntities": ["28DD","28DC"]}
        prepare.classify_facade_opening("n02", known)
        self.assertTrue(known["accessConfirmed"])
        unrelated = {"sourceEntities": ["arbitrary"]}
        prepare.classify_facade_opening("n02", unrelated)
        self.assertNotIn("accessConfirmed", unrelated)

    def test_only_concrete_new_route_handles_are_excluded_from_walls(self):
        self.assertTrue({"2A79","2A7A","2A87","2A88"} <= prepare.NEW_EXTERIOR_GRAPHICS["n01"])
        self.assertTrue({"28F5","28F7","28FF","2900","2903"} <= prepare.NEW_EXTERIOR_GRAPHICS["n02"])
        self.assertNotIn("28DD", prepare.NEW_EXTERIOR_GRAPHICS["n02"])
        self.assertNotIn("2708", prepare.NEW_EXTERIOR_GRAPHICS["n02"])

    def test_recessed_door_threshold_is_connected_without_widening_its_opening(self):
        door = {"id": "recessed", "hinge": [0,.2], "closedEnd": [0,.8], "sourceEntities": ["arc","leaf"]}
        upper, connectors = prepare.connect_landing_to_portals(box(.3,0,1,1), [door])
        self.assertTrue(upper.covers(Point(.15,.5)))
        self.assertFalse(upper.covers(Point(.15,.1)))
        self.assertEqual(door["hinge"], [0,.2])
        self.assertEqual(door["closedEnd"], [0,.8])
        self.assertEqual(connectors[0]["sourceDoorId"], "recessed")

    def test_distant_door_is_not_connected_by_an_invented_balcony(self):
        with self.assertRaisesRegex(ValueError, "distant exterior portal"):
            prepare.connect_landing_to_portals(box(2,0,3,1), [{"id":"distant","hinge":[0,.2],"closedEnd":[0,.8],"sourceEntities":["arc"]}])


class HeightCUnitTests(unittest.TestCase):
    def test_ceilings_follow_next_slab_and_roofs_are_independent(self):
        expected = {'p01':(-.2,-2.15),'n01':(2.65,.85),'n02':(5.5,4.15),'n03':(8.8,7.85),'n04':(11.35,None)}
        for floor,(main,wing) in expected.items():
            self.assertEqual(prepare.local_ceiling(floor,False), main)
            self.assertEqual(prepare.local_ceiling(floor,True), wing)
        self.assertEqual(prepare.ROOF_HEAD_TOP,11.55)
        self.assertNotEqual(prepare.floor_wing_offset('n03'),prepare.floor_wing_offset('n04'))

    def test_all_twenty_two_frozen_source_segments_resolve_to_fifteen_cm(self):
        path=prepare.ROOT/'.cache/cad-buildings-20261024/b01-preparation/before-height-c/recipe.json'
        if not path.exists():self.skipTest('Private frozen XY plan unavailable')
        plans=json.loads(path.read_text(encoding='utf8'))['interiorStairPlans']
        before=json.dumps(plans,sort_keys=True)
        levels=prepare.interior_level_map(plans)
        segments=[s for p in plans for s in p['segments']]
        self.assertEqual(len(segments),22)
        for segment in segments:
            rise=(levels[segment['upperLevelKey']]-levels[segment['lowerLevelKey']])/len(segment['riserPositions'])
            self.assertAlmostEqual(rise,.15)
        self.assertEqual(levels['n02-east-side-east:turn'],1.8)
        self.assertEqual(json.dumps(plans,sort_keys=True),before)
        self.assertTrue(all(not s['upperLevelKey'].startswith('n04') for s in segments))

    def test_changed_riser_count_is_not_silently_accepted(self):
        plan={'id':'bad','lowerLevelKey':'n01.main','upperLevelKey':'n02.westWing',
              'segments':[{'id':'bad-flight','lowerLevelKey':'n01.main','upperLevelKey':'n02.westWing','riserPositions':[0,1,2]}]}
        with self.assertRaisesRegex(ValueError,'contradicts variant C'):
            prepare.interior_level_map([plan])

    def test_generic_opening_is_clipped_below_roof_head_ceiling(self):
        low,high=prepare.opening_vertical_span('window',9,prepare.ceiling_height('n04.main'))
        self.assertEqual((low,high),(9.9,11.3))
        self.assertLessEqual(high+.05,prepare.ceiling_height('n04.main')+1e-9)
        self.assertEqual(prepare.opening_vertical_span('door',-4.65,-2.15),(-4.65,-2.55))

    def test_shared_main_wing_wall_respects_both_adjacent_ceilings(self):
        wing=box(0,0,1,2);model={'geometry':wing,'zones':[{'levelKey':'n02.eastWing','geometry':wing}]}
        ceiling,keys=prepare.opening_ceiling_bound('n02',box(.9,.5,1.1,1.5),'n02.main',model)
        self.assertEqual(ceiling,4.15)
        self.assertEqual(keys,['n02.eastWing','n02.main'])
        self.assertEqual(prepare.opening_vertical_span('window',2.85,ceiling),(3.75,4.10))
        main_ceiling,_=prepare.opening_ceiling_bound('n02',box(2,.5,2.2,1.5),'n02.main',model)
        self.assertEqual(prepare.opening_vertical_span('window',2.85,main_ceiling),(3.75,5.25))

    def test_exterior_air_in_body_mask_does_not_clip_a_main_room_window(self):
        body=box(0,0,3,3);occupied=box(0,0,1,1)
        model={'geometry':body,'zones':[{'levelKey':'n01.westWing','geometry':body,'occupiedGeometry':occupied}]}
        ceiling,_=prepare.opening_ceiling_bound('n01',box(2,2,2.2,2.8),'n01.main',model)
        self.assertEqual(ceiling,2.65)
        self.assertEqual(prepare.opening_vertical_span('window',0,ceiling),(.9,2.4))

    def test_tall_profile_selects_only_confirmed_external_longitudinal_runs(self):
        pane={'a':[218.510,741.0],'b':[218.510,742.0]}
        for floor,sill,head in [('n02',.30,3.05),('n03',.10,3.15)]:
            profile=prepare.wing_facade_window_profile(floor,pane)
            self.assertEqual((profile['sill'],profile['head']),(sill,head))
            low,high=prepare.opening_vertical_span('window',prepare.local_level(floor,True),prepare.local_ceiling(floor,True),sill,head)
            self.assertLessEqual(high+.05,prepare.local_ceiling(floor,True)+1e-9)
            self.assertLess(profile['lowerInfillHeight'],high-low)
        for floor,pane in [('n01',pane),('n02',{'a':[249,738.894],'b':[250,738.894]}),
                           ('n02',{'a':[223,741],'b':[223,742]}),('n03',{'a':[218.51,735],'b':[218.51,736]})]:
            self.assertIsNone(prepare.wing_facade_window_profile(floor,pane))

    def test_profile_span_drives_the_same_wall_opening(self):
        low,high=prepare.opening_vertical_span('window',1.05,4.15,.30,3.05)
        shape=box(0,0,2,.2);cut=box(.5,-.1,1.5,.3)
        solids=prepare.wall_bands(shape,[{'cut':cut,'bottom':low,'top':high}],1.05,4.15,'profile')
        center=Point(1,.1)
        self.assertFalse(any(s['bottom']<(low+high)/2<s['top'] and Polygon(s['loops'][0],s['loops'][1:]).covers(center) for s in solids))
        self.assertTrue(any(s['bottom']<1.2<s['top'] and Polygon(s['loops'][0],s['loops'][1:]).covers(center) for s in solids))

    def test_narrow_jamb_offsets_follow_door_direction_and_preserve_rear_barrier(self):
        lines=[prepare.segment('1864',prepare.STRONG,[0,1],[0,1.1]),prepare.segment('1865',prepare.STRONG,[.1,1],[.1,1.1]),
               prepare.segment('1868',prepare.STRONG,[0,-.1],[0,0]),prepare.segment('1869',prepare.STRONG,[.1,-.1],[.1,0])]
        for arc,a,b,offset in [('2753',[0,1],[0,0],.05),('276A',[0,0],[0,1],-.05)]:
            span=prepare.explicit_jamb_span('n02',{'sourceEntities':[arc],'hinge':a,'closedEnd':b},lines)
            self.assertAlmostEqual(span[1]-span[0],.1)
            self.assertAlmostEqual((span[1]+span[0])/2,offset)
            cut=prepare.opening_cut(a,b,span[0],span[1],True)
            self.assertLess(cut.intersection(box(.66,0,.80,1)).area,1e-9)

    def test_measured_return_window_does_not_cut_its_neighboring_bay_rear(self):
        a,b=[280.271512,723.003993],[281.673236,723.003993]
        rear=Point(280.94,722.5)
        self.assertTrue(prepare.opening_cut(a,b,-.222,.216).covers(rear))
        self.assertFalse(prepare.opening_cut(a,b,-.222,.216,True).covers(rear))

    def test_source_west_and_east_portals_bridge_only_the_wall_depth(self):
        specs=[('1100',[224.630401,739.115346],[224.630401,738.743424]),
               ('1101',[221.443882,739.115346],[221.443882,738.743424]),
               ('B6A',[278.051458,722.782047],[278.051458,723.219959]),
               ('B6D',[274.815829,722.782047],[274.815829,723.219959])]
        features=prepare.connected_portal_regions('n03',{'lines':[prepare.segment(h,prepare.STRONG,a,b) for h,a,b in specs]})
        model={'zones':[{'geometry':f['geometry'],'levelKey':f['levelKey']} for f in features]}
        self.assertEqual(prepare.zone_level_key('n03',Point(222.5,738.9),model),'n03.westWing')
        self.assertEqual(prepare.zone_level_key('n03',Point(275.5,723.03),model),'n03.eastWing')
        self.assertEqual(prepare.zone_level_key('n03',Point(219,738.6),model),'n03.main')

    def test_parapet_is_inward_ring_and_cap_has_identical_footprint(self):
        roof=box(0,0,10,10).difference(box(4,4,6,6))
        solids=prepare.main_roof_parapet(roof)
        body=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in solids if s['role']=='parapet'])
        cap=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in solids if s['role']=='parapet-cap'])
        self.assertAlmostEqual(body.area,100-9.7**2,places=5)
        self.assertLess(body.symmetric_difference(cap).area,1e-8)
        self.assertLess(body.difference(roof).area,1e-8)
        self.assertFalse(body.covers(Point(3,3)))
        self.assertFalse(body.covers(Point(5,5)))
        self.assertTrue(all(9<=s['bottom']<s['top']<=9.4 for s in solids))

    def test_roof_transition_is_only_shared_boundary_of_two_roof_levels(self):
        roof=box(0,0,10,10);wing=box(0,0,3,10)
        transitions=prepare.roof_transitions(roof,{'geometry':wing,'zones':[{'id':'west','levelKey':'n04.westWing','geometry':wing}]})
        self.assertEqual(len(transitions),1)
        line=LineString([transitions[0]['a'],transitions[0]['b']])
        self.assertAlmostEqual(line.length,10)
        self.assertTrue(all(abs(x-3)<1e-6 for x,y in line.coords))
        self.assertEqual(transitions[0]['lowerLevelKey'],'n04.westWing')
        self.assertEqual(transitions[0]['upperLevelKey'],'n04.main')


class RoofAndShallowBayTests(unittest.TestCase):
    @staticmethod
    def bay_data(floor='n02'):
        front, rear, ids = prepare.SHALLOW_BAY_SOURCES[floor]
        positions = {ids[0]: .80, ids[1]: .71, rear: .66, front: .10}
        return {'lines': [prepare.segment(handle, prepare.WEAK, [x, 0], [x, 1.5]) for handle, x in positions.items()]}

    def test_bay_free_space_preserves_jamb_sides_and_rear(self):
        for floor in ['n02','n03']:
            bays=prepare.shallow_bay_voids(floor,self.bay_data(floor))
            original=box(0,-.1,.8,1.6)
            result=prepare.clear_shallow_bay_walls(original,bays)
            self.assertFalse(result.covers(Point(.4,.75)))
            for point in [(.05,.75),(.73,.75),(.4,-.05),(.4,1.55)]:
                self.assertTrue(result.covers(Point(point)))
            self.assertLess(result.symmetric_difference(original.difference(box(.1,0,.66,1.5))).area,1e-8)
            # The floor generator still fills this enclosed footprint; it is
            # only the wall mass that has changed.
            self.assertTrue(prepare.footprint(box(-4,-4,0,2),result,[]).covers(Point(.4,.75)))

    def test_bay_final_subtraction_cannot_be_refilled_by_opening_bridge(self):
        bays=prepare.shallow_bay_voids('n02',self.bay_data())
        wall=unary_union([box(0,0,.8,.3),box(.2,.3,.6,1.3),box(0,1.3,.8,1.5)])
        result=prepare.clear_shallow_bay_walls(wall,bays)
        self.assertLess(result.intersection(box(.101,.001,.659,1.499)).area,1e-9)

    def test_bay_boundary_uses_door_normal_order_and_no_other_doors(self):
        bays=prepare.shallow_bay_voids('n02',self.bay_data())
        for handle,a,b,side in [('2753',[0,1.4],[0,.7],1),('276A',[0,.1],[0,.7],0)]:
            door={'id':handle,'sourceEntities':[handle],'hinge':a,'closedEnd':b}
            prepare.annotate_shallow_bay_approach('n02',door,bays)
            self.assertEqual(door['approachBoundaryCad'][side],[.66,round((a[1]+b[1])/2,6)])
            self.assertIsNone(door['approachBoundaryCad'][1-side])
            self.assertEqual(door['accessClassification'],'shallow-bay')
        door={'id':'other','sourceEntities':['other'],'hinge':[0,0],'closedEnd':[0,1]}
        prepare.annotate_shallow_bay_approach('n02',door,bays)
        self.assertNotIn('approachBoundaryCad',door)

    def test_bay_missing_source_stops_and_other_floors_are_unchanged(self):
        with self.assertRaisesRegex(ValueError,'Missing shallow bay'):
            prepare.shallow_bay_voids('n03',{'lines':[]})
        self.assertEqual(prepare.shallow_bay_voids('n01',{'lines':[]}),[])
        wall=box(0,0,2,2)
        self.assertTrue(prepare.clear_shallow_bay_walls(wall,[]).equals(wall))

    def test_occupied_roof_keeps_stair_void_and_existing_landing_open(self):
        seed=box(1,1,5,5);wall=box(.8,.8,5.2,5.2).difference(seed)
        shaft=box(1,2,1.6,3);landing=box(4,3,5,4);upper=box(2,1,4,5)
        result=prepare.occupied_roof_extension(seed,wall,box(0,0,9,9),upper,shaft,landing)
        self.assertTrue(result.covers(Point(1.8,4)))
        self.assertTrue(result.covers(Point(.9,4)))
        for excluded in [shaft,landing,upper]:self.assertLess(result.intersection(excluded).area,1e-9)
        self.assertFalse(result.covers(Point(7,7)))

    def test_roof_margin_selects_only_measured_walls_and_never_creates_canopy(self):
        seed=box(1,1,5,5);wall=box(.9,1,1,5)
        result=prepare.occupied_roof_extension(seed,wall,box(0,0,10,10),GeometryCollection(),GeometryCollection(),GeometryCollection())
        self.assertAlmostEqual(result.area,16.4)
        self.assertFalse(result.covers(Point(5.1,3)))
        self.assertTrue(result.covers(Point(.95,3)))

    def test_roof_clips_to_lower_footprint_even_if_source_room_overlaps_void(self):
        seed=box(0,0,5,5);lower=seed.difference(box(0,2,1,3))
        result=prepare.occupied_roof_extension(seed,GeometryCollection(),lower,GeometryCollection(),GeometryCollection(),GeometryCollection())
        self.assertTrue(result.equals(lower))


class LocalRoofBayRecipeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe=current_height_recipe()
        if cls.recipe.get('geometryRevision')!='C-exposed-roofs-shallow-bays-1':
            raise AssertionError('Current generator recipe is missing the expected roof/bay geometry revision')
        cls.floors={floor['id']:floor for floor in cls.recipe['floors']}

    def test_both_wing_interiors_and_attached_vestibule_have_roof(self):
        roofs=[s for s in self.floors['n01']['solids'] if 'roofClosure' in s]
        shape=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in roofs])
        for point in [(217.55,747.5),(228.5,747.5),(270.9,715),(282,715),(269.9,716.7)]:
            self.assertTrue(shape.covers(Point(point)),point)
        self.assertTrue(all(abs(s['bottom']-.85)<1e-8 and abs(s['top']-1.05)<1e-8 for s in roofs))
        self.assertFalse(shape.covers(Point(283,731.7)), 'P01 s146 is not this flat roof')

    def test_added_roofs_do_not_cover_shafts_cores_or_duplicate_upper_landing(self):
        roofs=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in self.floors['n01']['solids'] if 'roofClosure' in s])
        voids=[Polygon(v['loops'][0],v['loops'][1:]) for v in self.recipe['exteriorVoids']+self.recipe['terrainCutouts']]
        voids += [box(*c['bounds']) for floor in ['n01','n02'] for c in self.floors[floor]['stairCores']]
        for shape in voids:self.assertLess(roofs.intersection(shape).area,.002)
        route=next(p for p in self.recipe['exteriorStairRoutes'] if p['id']=='exterior-n02-east')
        upper=next(l for l in route['landings'] if l['levelKey']=='n02.eastWing')
        self.assertLess(roofs.intersection(Polygon(upper['loops'][0],upper['loops'][1:])).area,1e-6)

    def test_bay_space_is_free_but_rear_and_floor_remain(self):
        for fid in ['n02','n03']:
            floor=self.floors[fid];midheight=floor['wingElevation']+1
            walls=[Polygon(s['loops'][0],s['loops'][1:]) for s in floor['solids'] if s['role']=='wall' and s['bottom']<midheight<s['top']]
            solid=unary_union(walls)
            self.assertFalse(solid.covers(Point(280.6,722.1)))
            self.assertTrue(solid.covers(Point(280.94,722.1)))
            slabs=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in floor['solids'] if s['role']=='slab' and abs(s['top']-floor['wingElevation'])<1e-6])
            self.assertTrue(slabs.covers(Point(280.6,722.1)))

    def test_exactly_four_doors_have_directional_approach_boundary(self):
        doors=[d for f in self.recipe['floors'] for d in f['doors'] if 'approachBoundaryCad' in d]
        self.assertEqual({d['id'] for d in doors},{'n02-door-2753','n02-door-276A','n03-door-22CE','n03-door-22E5'})
        for door in doors:
            a,b=np.array(door['hinge']),np.array(door['closedEnd']);side=1 if b[1]<a[1] else 0
            boundary=door['approachBoundaryCad']
            self.assertIsNone(boundary[1-side])
            self.assertAlmostEqual(boundary[side][0],280.833814,places=6)
            self.assertAlmostEqual(boundary[side][1],(a[1]+b[1])/2,places=5)


class LocalExteriorRecipeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = current_height_recipe()

    def test_west_routes_preserve_measured_fronts_and_anchor_contract(self):
        plans = self.recipe["exteriorStairRoutes"]
        self.assertEqual(len(plans), 6)
        self.assertEqual([len(s["frontEdgesCad"]) for p in plans for s in p["segments"]], [6,8,11,14,15,13,8])
        self.assertEqual(self.recipe["exteriorLevelAnchors"], {"westExterior.nw.top": -1.85, "westExterior.ne.top": -2.45,
                                                             "exterior.mainEast.lower": -2.10, "exterior.n02East.lower": -.55})
        self.assertEqual(self.recipe["exteriorLevelEstimates"], {"p01-west-exterior-nw:turn": -3.45})
        for plan in plans:
            for segment in plan["segments"]:
                self.assertEqual(len(segment["edgeSourceEntities"]), len(segment["frontEdgesCad"]))
            for landing in plan["landings"]:
                shape = Polygon(landing["loops"][0], landing["loops"][1:])
                self.assertAlmostEqual(shape.area, sum(Polygon(t).area for t in landing["triangles"]), places=5)

    def test_west_bottoms_and_lower_landings_cover_courts_without_n01_false_slab(self):
        p01 = next(f for f in self.recipe["floors"] if f["id"] == "p01")
        n01 = next(f for f in self.recipe["floors"] if f["id"] == "n01")
        bottoms = [Polygon(s["loops"][0],s["loops"][1:]) for s in p01["solids"] if s["role"] == "slab" and s["top"] == prepare.local_level('p01',True)]
        west_plans = [p for p in self.recipe["exteriorStairRoutes"] if p["id"].startswith("p01-west-exterior-")]
        lower = [Polygon(s["loops"][0],s["loops"][1:]) for p in west_plans for s in p["landings"] if s["levelKey"] == "p01.westWing"]
        top_slabs = unary_union([Polygon(s["loops"][0],s["loops"][1:]) for s in n01["solids"] if s["role"] == "slab"])
        self.assertLess(unary_union(bottoms).intersection(unary_union(lower)).area, .002)
        for plan in west_plans:
            portal = plan["exteriorPortal"]["centerCad"]
            self.assertTrue(unary_union(bottoms + lower).covers(Point(portal)))
        self.assertEqual(len(self.recipe["terrainCutouts"]), 4)
        for cut in [c for c in self.recipe["terrainCutouts"] if c["id"].startswith("p01-west-exterior-")]:
            self.assertTrue(cut["terrainValidationPending"])
            self.assertIn("CAD XY metres", cut["coordinateSpace"])
            self.assertLess(top_slabs.intersection(Polygon(cut["loops"][0])).area, .002)

    def test_west_opposite_plans_do_not_leave_generic_tall_panel(self):
        n01 = next(f for f in self.recipe["floors"] if f["id"] == "n01")
        for solid in n01["solids"]:
            if solid["role"] == "wall":
                self.assertFalse(Polygon(solid["loops"][0],solid["loops"][1:]).covers(Point(239,753)))
        p01 = next(f for f in self.recipe["floors"] if f["id"] == "p01")
        supports = [s for s in p01["solids"] if s["role"] == "retaining-wall"]
        self.assertTrue(supports)
        self.assertTrue(any(s.get("ceilingPlane",[1,1,0])[:2]==[0,0] and abs(s['ceilingPlane'][2]+2.65)<1e-6 for s in supports))
        self.assertTrue(all(s["bottom"] == -4.65 and s["top"] == -1.65 for s in supports))

    def test_both_measured_shaft_counts_fit_normal_riser_limit(self):
        segments = [s for p in self.recipe["exteriorStairRoutes"] for s in p["segments"]]
        exceptions = [s for s in segments if s.get("maxRiserHeight", .22) > .22]
        self.assertEqual(exceptions, [])
        shafts = [s for s in segments if s['id'].startswith('exterior-east-shaft-')]
        self.assertEqual([len(s['frontEdgesCad']) for s in shafts], [14,15])
        self.assertTrue(all(2.70/len(s['frontEdgesCad']) <= .22 for s in shafts))
        self.assertTrue(all("maxRiserHeight" not in s for p in self.recipe["interiorStairPlans"] for s in p["segments"]))

    def test_two_new_routes_have_upper_landing_support_at_real_portals(self):
        plans = {p["id"]: p for p in self.recipe["exteriorStairRoutes"]}
        self.assertEqual(plans["exterior-n02-east"]["sourceDoorIds"], ["n02-door-28DD"])
        for route_id, witness in [("exterior-n02-east", (281.3,708.9)), ("exterior-main-east",(282.4,730.9))]:
            plan = plans[route_id]
            upper = unary_union([Polygon(s["loops"][0],s["loops"][1:]) for s in plan["landings"] if s["levelKey"] == plan["upperLevelKey"]])
            self.assertTrue(upper.covers(Point(witness)), route_id)
        tagged = [d for f in self.recipe["floors"] for d in f["doors"] if d.get("openingClassification") == "facade-opening-unconfirmed-access"]
        self.assertEqual(len(tagged), 15)

    def test_main_entry_threshold_has_no_gap_between_frame_and_landing(self):
        route = next(p for p in self.recipe["exteriorStairRoutes"] if p["id"] == "exterior-main-east")
        floor = next(f for f in self.recipe["floors"] if f["id"] == "n01")
        support = unary_union([Polygon(s["loops"][0],s["loops"][1:]) for s in floor["solids"] if s["role"] == "slab" and s["top"] == 0]
                              + [Polygon(s["loops"][0],s["loops"][1:]) for s in route["landings"] if s["levelKey"] == "n01.main"])
        for door in [d for d in floor["doors"] if d["id"] in route["sourceDoorIds"]]:
            center = (np.asarray(door["hinge"]) + door["closedEnd"]) / 2
            self.assertTrue(support.buffer(.001).covers(LineString([center + [-.3,0], center + [.6,0]])), door["id"])

    def test_new_stair_graphics_do_not_become_full_height_panels(self):
        for floor_id, point in [("n01",Point(285,730.9)), ("n02",Point(283.5,707.5))]:
            floor = next(f for f in self.recipe["floors"] if f["id"] == floor_id)
            self.assertFalse(any(Polygon(s["loops"][0],s["loops"][1:]).covers(point) for s in floor["solids"] if s["role"] == "wall"))


class LocalRecipeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recipe = current_height_recipe()

    def test_expected_floors_and_shared_unshifted_coordinates(self):
        self.assertEqual([f["id"] for f in self.recipe["floors"]], list(prepare.FLOORS))
        self.assertEqual(self.recipe["cadOrigin"], [250, 731])
        for floor in self.recipe["floors"]:
            self.assertGreater(len(floor["solids"]), 0)
            for solid in floor["solids"]:
                self.assertLess(solid["bottom"], solid["top"])
                self.assertGreater(len(solid["triangles"]), 0)
                for ring in solid["loops"]:
                    for x, y in ring:
                        self.assertTrue(210 < x < 290 and 700 < y < 760)

    def test_source_opening_and_stair_xy_counts_handles_remain_unchanged(self):
        path=prepare.ROOT/'.cache/cad-buildings-20261024/b01-preparation/before-height-c/recipe.json'
        if not path.exists():self.skipTest('Private frozen XY checkpoint unavailable')
        before=json.loads(path.read_text(encoding='utf8'))
        for old,new in zip(before['floors'],self.recipe['floors']):
            for field,keys in [('doors',['id','hinge','closedEnd','openEnd','sourceEntities']),('windows',['id','a','b','sourceEntities'])]:
                self.assertEqual([{k:v[k] for k in keys} for v in old[field]],[{k:v[k] for k in keys} for v in new[field]])
        for field in ['interiorStairPlans','exteriorStairRoutes']:
            for old,new in zip(before[field],self.recipe[field]):
                self.assertEqual(old['id'],new['id'])
                self.assertEqual(len(old['segments']),len(new['segments']))
                for a,b in zip(old['segments'],new['segments']):
                    for key in ['id','a','b','width','bounds','riserPositions','sourceEntities','ownerFloor','sourceFloor','frontEdgesCad']:
                        self.assertEqual(a.get(key),b.get(key),(old['id'],key))
                self.assertEqual([(s['loops'],s['triangles']) for s in old['landings']],[(s['loops'],s['triangles']) for s in new['landings']])

    def test_actual_main_facades_and_attached_portals_use_their_own_levels(self):
        for floor in self.recipe['floors']:
            regions=[Polygon(r['loops'][0],r['loops'][1:]) for r in floor['wingRegions']]
            if floor['id']!='n04':
                self.assertFalse(any(r.covers(Point(250,y)) for r in regions for y in [723.008,738.894]))
            self.assertEqual(floor['ceilingElevation'],prepare.local_ceiling(floor['id'],False))
            self.assertEqual(floor['wingCeilingElevation'],prepare.local_ceiling(floor['id'],True))
        n01=next(f for f in self.recipe['floors'] if f['id']=='n01')
        for arc in ['28D2','28EB']:
            door=next(d for d in n01['doors'] if arc in d['sourceEntities'])
            self.assertEqual(door['levelKey'],'n01.eastWing')
            self.assertAlmostEqual(door['bottom'],-1.95)
        n03=next(f for f in self.recipe['floors'] if f['id']=='n03')
        for x,y in [(219,738.6),(227,738.6),(272,723.3),(280,723.3)]:
            slabs=[s for s in n03['solids'] if s['role']=='slab' and Polygon(s['loops'][0],s['loops'][1:]).covers(Point(x,y))]
            self.assertTrue(slabs,(x,y))
            self.assertTrue(all(s['top']==5.7 for s in slabs),(x,y))

    def test_actual_tall_facade_profiles_and_generic_main_windows_are_separate(self):
        for floor in [f for f in self.recipe['floors'] if f['id'] in ['n02','n03']]:
            high=[w for w in floor['windows'] if 'verticalProfile' in w]
            self.assertEqual(len(high),47 if floor['id']=='n02' else 48)
            world_low,world_high=(5.55,8.30) if floor['id']=='n02' else (8.65,11.70)
            for window in high:
                self.assertAlmostEqual(window['bottom']+4.2,world_low)
                self.assertAlmostEqual(window['top']+4.2,world_high)
                self.assertLessEqual(window['top']+.05,window['ceilingElevation']+1e-6)
                self.assertEqual(window['lowerInfillHeight'],.75)
            for y in [723.008,738.894]:
                candidates=[w for w in floor['windows'] if abs((w['a'][1]+w['b'][1])/2-y)<.01]
                window=min(candidates,key=lambda w:abs((w['a'][0]+w['b'][0])/2-250))
                self.assertEqual(window['levelKey'],floor['id']+'.main')
                self.assertNotIn('verticalProfile',window)
                self.assertAlmostEqual(window['bottom'],floor['elevation']+.9)
                self.assertAlmostEqual(window['top'],floor['elevation']+2.4)

    def test_actual_narrow_jambs_keep_bay_floor_and_rear_barrier(self):
        for floor_id,arcs in [('n02',['2753','276A']),('n03',['22CE','22E5'])]:
            floor=next(f for f in self.recipe['floors'] if f['id']==floor_id)
            for arc in arcs:
                door=next(d for d in floor['doors'] if arc in d['sourceEntities'])
                self.assertAlmostEqual(door['depth'],.10,places=4)
                self.assertAlmostEqual(abs(door['normalOffset']),.05,places=4)
                y=(door['hinge'][1]+door['closedEnd'][1])/2
                self.assertTrue(any(s['role']=='slab' and s['top']==floor['wingElevation'] and Polygon(s['loops'][0],s['loops'][1:]).covers(Point(280.661,y)) for s in floor['solids']))
                for height in [floor['wingElevation']+1,floor['wingCeilingElevation']-.1]:
                    self.assertTrue(self.walls_at(floor_id,280.94,y,height),(floor_id,arc,height))

    def test_actual_roofs_head_and_parapet_do_not_create_another_occupied_floor(self):
        floor=next(f for f in self.recipe['floors'] if f['id']=='n04')
        self.assertEqual(floor['elevation'],9)
        self.assertEqual(floor['wingElevation'],8.05)
        self.assertEqual(floor['levelKind'],'roof')
        self.assertIsNone(floor['wingCeilingElevation'])
        head=unary_union([Polygon(p['loops'][0],p['loops'][1:]) for p in floor['roofHeadFootprint']])
        self.assertTrue(head.covers(Point(220.8,731.5)))
        self.assertFalse(head.covers(Point(250,731)))
        self.assertTrue(any(s['role']=='slab' and s['top']==11.55 for s in floor['solids']))
        body=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in floor['solids'] if s['role']=='parapet'])
        cap=unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in floor['solids'] if s['role']=='parapet-cap'])
        self.assertFalse(body.is_empty)
        self.assertLess(body.symmetric_difference(cap).area,1e-6)
        self.assertFalse(body.covers(Point(250,731)))
        self.assertFalse(body.covers(Point(220.8,731.5)))
        self.assertTrue(self.recipe['roofTransitions'])
        self.assertTrue(all(t['upperLevelKey']=='n04.main' and t['lowerLevelKey'] in ['n04.westWing','n04.eastWing'] for t in self.recipe['roofTransitions']))

    def test_interior_routes_are_unique_and_use_full_arrival_centers(self):
        plans = {plan["id"]: plan for plan in self.recipe["interiorStairPlans"]}
        self.assertNotIn("p01-west-side-west", plans)
        self.assertNotIn("p01-west-side-east", plans)
        self.assertIn("p01-east-side-west", plans)
        self.assertIn("p01-east-side-east", plans)
        self.assertEqual(plans["p01-west-center"]["sourceFloor"], "n01")
        self.assertEqual(plans["n01-west-center"]["sourceFloor"], "n02")
        self.assertAlmostEqual(plans["p01-west-center"]["segments"][0]["b"][1], 736.266375, places=5)
        self.assertAlmostEqual(plans["n01-west-center"]["segments"][0]["b"][1], 736.563876, places=5)
        flights = [segment for plan in plans.values() for segment in plan["segments"]]
        self.assertEqual(len(flights), len({segment["id"] for segment in flights}))
        for flight in flights:
            self.assertEqual(len(flight["riserPositions"]), flight["visibleIntervals"] + 1)

    def test_l_turns_have_corner_landings_and_explicit_endpoint_keys(self):
        plans = {plan["id"]: plan for plan in self.recipe["interiorStairPlans"]}
        for core in ["west", "east"]:
            for side in ["west", "east"]:
                plan = plans[f"n02-{core}-side-{side}"]
                first, second = plan["segments"]
                self.assertEqual(first["upperLevelKey"], second["lowerLevelKey"])
                landing = next(s for s in plan["landings"] if s["levelKey"] == first["upperLevelKey"])
                shape = Polygon(landing["loops"][0], landing["loops"][1:])
                self.assertGreater(shape.area, 3)
                self.assertEqual([len(first["riserPositions"]), len(second["riserPositions"])], [5, 7])

    def test_s144_floor_and_137_door_follow_connected_landing_levels(self):
        floors = {floor["id"]: floor for floor in self.recipe["floors"]}
        s144 = [solid for solid in floors["p01"]["solids"] if solid.get("sourceRoomEntity") == "208C"]
        self.assertTrue(s144)
        self.assertTrue(all(solid["top"] == prepare.stair_level_height('p01.westWing') for solid in s144))
        door = next(door for door in floors["n02"]["doors"] if "2DFE" in door["sourceEntities"])
        self.assertEqual(door["levelKey"], "n02-east-side-east:turn")
        self.assertAlmostEqual(door["bottom"], self.recipe["interiorStairLevelEstimates"][door["levelKey"]])
        self.assertAlmostEqual(door['bottom'], 1.80)

    def test_entrance_is_lower_and_n04_is_not_full_extra_floor(self):
        floors = {f["id"]: f for f in self.recipe["floors"]}
        self.assertTrue(any(s["role"] == "slab" and s["top"] == prepare.local_level('n01',True) for s in floors["n01"]["solids"]))
        upper_walls = [Polygon(s["loops"][0], s["loops"][1:]) for s in floors["n04"]["solids"] if s["role"] == "wall"]
        self.assertLess(unary_union(upper_walls).area, 5)
        self.assertLessEqual(len(floors["n04"]["windows"]), 1)

    def test_narrow_n03_stair_does_not_remove_neighboring_room_floors(self):
        floor = next(f for f in self.recipe["floors"] if f["id"] == "n03")
        slab = unary_union([Polygon(s["loops"][0], s["loops"][1:]) for s in floor["solids"] if s["role"] == "slab"])
        for point in [(219, 736), (227, 736), (272, 725), (280, 725)]:
            self.assertTrue(slab.covers(Point(point)), point)
        self.assertFalse(slab.covers(Point(222, 736)))
        self.assertFalse(slab.covers(Point(277, 726)))

    def test_wing_height_hypothesis_is_applied_to_all_floors_and_roof(self):
        for floor in self.recipe["floors"]:
            self.assertEqual(floor["floorWingOffset"], prepare.floor_wing_offset(floor['id']))
            wing_point = Point(223, 747)
            floors = [s for s in floor["solids"] if s["role"] == "slab" and Polygon(s["loops"][0], s["loops"][1:]).covers(wing_point)]
            self.assertTrue(floors, floor["id"])
            self.assertTrue(any(abs(s["top"] - prepare.local_level(floor['id'],True)) < 1e-6 for s in floors), floor["id"])

    def test_identifiers_are_unique(self):
        ids = [s["id"] for f in self.recipe["floors"] for s in f["solids"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_measured_p01_outer_retaining_pair_is_present(self):
        floor = next(f for f in self.recipe["floors"] if f["id"] == "p01")
        wall = unary_union([Polygon(s["loops"][0], s["loops"][1:]) for s in floor["solids"]
                            if s["role"] == "wall" and s["bottom"] < -3 < s["top"]])
        self.assertTrue(wall.covers(Point(268.6, 708)), "measured A8/228 retaining strip")

    def test_n01_protection_and_exported_shaft_voids_match(self):
        floor = next(f for f in self.recipe["floors"] if f["id"] == "n01")
        protection = [s for s in floor["solids"] if s["role"] == "low-barrier"]
        self.assertGreaterEqual(len(protection), 2)
        self.assertTrue(all(s["top"] - s["bottom"] <= 1.0001 for s in protection))
        base = prepare.local_level('n01', True)
        self.assertTrue(all(s["bottom"] >= base and s["top"] <= round(base + 1,4) for s in protection))
        slab = unary_union([Polygon(s["loops"][0], s["loops"][1:]) for s in floor["solids"] if s["role"] == "slab"])
        self.assertEqual(len(self.recipe["exteriorVoids"]), 2)
        for void in self.recipe["exteriorVoids"]:
            self.assertEqual((void["bottom"], void["openAbove"]), (prepare.local_level("p01", True), prepare.local_level("n01", True)))
            shape = Polygon(void["loops"][0], void["loops"][1:])
            self.assertLess(slab.intersection(shape).area, 1e-5)

    def test_measured_n02_column_cover_is_retained_separately(self):
        floor = next(f for f in self.recipe["floors"] if f["id"] == "n02")
        covers = [s for s in floor["solids"] if s["role"] == "column-cover" and s["sourceProfileId"] == "1D4B"]
        self.assertTrue(covers)
        self.assertTrue(all(s["sourceColumnId"] == "1762" for s in covers))
        geometry = unary_union([Polygon(s["loops"][0], s["loops"][1:]) for s in covers])
        self.assertTrue(geometry.covers(Point(220.45, 733.7)))

    def test_both_exterior_stairs_have_a_complete_bottom_floor(self):
        floor = next(f for f in self.recipe["floors"] if f["id"] == "p01")
        for void in self.recipe["exteriorVoids"]:
            shape = Polygon(void["loops"][0], void["loops"][1:])
            parts = [Polygon(s["loops"][0], s["loops"][1:]) for s in floor["solids"]
                     if s["role"] == "slab" and abs(s["top"] - void["bottom"]) < 1e-6]
            parts += [Polygon(s["loops"][0], s["loops"][1:]) for p in self.recipe.get("exteriorStairRoutes",[]) for s in p["landings"]
                      if s["ownerFloor"] == "p01" and s["levelKey"] == "p01.eastWing"]
            bottom = unary_union(parts)
            self.assertLess(shape.difference(bottom).area, 1e-5, void["id"])

    def test_exterior_stair_has_no_metrehigh_wall_across_its_exit(self):
        floor=next(f for f in self.recipe['floors'] if f['id']=='n01')
        point=Point(269.6,711.85)
        self.assertEqual(len(floor['exteriorStairExits']),1)
        for solid in floor['solids']:
            if solid['bottom'] < -1.0 < solid['top']:
                self.assertFalse(Polygon(solid['loops'][0],solid['loops'][1:]).covers(point),solid['id'])

    def test_partial_stair_arrow_does_not_become_a_low_ceiling(self):
        floor=next(f for f in self.recipe['floors'] if f['id']=='p01')
        point=Point(283.243135,708.969310)
        for solid in floor['solids']:
            if solid['role']=='wall' and solid['bottom'] < -2 < solid['top']:
                self.assertFalse(Polygon(solid['loops'][0],solid['loops'][1:]).covers(point),solid['id'])

    def walls_at(self, floor_id, x, y, z):
        floor=next(f for f in self.recipe['floors'] if f['id']==floor_id)
        result=[]
        for solid in floor['solids']:
            if solid['role']!='wall' or not solid['bottom'] < z < solid['top']:
                continue
            plane=solid.get('ceilingPlane')
            if plane and z>plane[0]*x+plane[1]*y+plane[2]:
                continue
            if Polygon(solid['loops'][0],solid['loops'][1:]).covers(Point(x,y)):
                result.append(solid['id'])
        return result

    def test_capsule_witness_north_return_is_below_landing(self):
        self.assertTrue(self.walls_at('p01',218.6745,738.35,-2.5))
        self.assertEqual(self.walls_at('p01',218.6745,738.35,-1.0),[])

    def test_capsule_witness_upper_L_does_not_cross_lower_wall(self):
        self.assertTrue(self.walls_at('n01',279.54,724.2877,0.5))
        self.assertEqual(self.walls_at('n01',279.54,724.2877,2.4),[])

    def test_actual_s146_wall_stays_below_the_external_step_eleven(self):
        self.assertTrue(self.walls_at('p01',284.258277,730.957836,-1.2))
        self.assertEqual(self.walls_at('p01',284.258277,730.957836,-0.35),[])
        # This strip lies beyond the measured north side of the flight.
        self.assertTrue(self.walls_at('p01',283.0,733.025,-0.3))

    def test_n01_portal_2852_remains_open_below_n02_support(self):
        self.assertEqual(self.walls_at('n02',280.821696,727.003149,1.95),[])
        self.assertTrue(self.walls_at('n02',280.821696,727.003149,2.2))
        self.assertTrue(self.walls_at('n02',280.1,727.003149,1.95))
        self.assertTrue(self.walls_at('n02',281.5,727.003149,1.95))

    def test_s146_room_floor_door_and_wall_footprints_are_preserved(self):
        path = prepare.ROOT / '.cache/cad-buildings-20261024/b01-preparation/r8-before-s146-soffit/recipe.json'
        if not path.exists():
            self.skipTest('Private frozen source checkpoint unavailable')
        before = next(f for f in json.loads(path.read_text(encoding='utf8'))['floors'] if f['id']=='p01')
        after = next(f for f in self.recipe['floors'] if f['id']=='p01')
        keys = ['id','hinge','closedEnd','openEnd','sourceEntities']
        self.assertEqual([{k:d[k] for k in keys} for d in before['doors']], [{k:d[k] for k in keys} for d in after['doors']])
        old_floor = unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in before['solids'] if s['role']=='slab'])
        new_floor = unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in after['solids'] if s['role']=='slab'])
        self.assertLess(old_floor.symmetric_difference(new_floor).area, .002)
        old = unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in before['solids'] if s['role']=='wall'])
        new = unary_union([Polygon(s['loops'][0],s['loops'][1:]) for s in after['solids'] if s['role']=='wall'])
        # New height-zone cuts add vertices on the existing1mm precision grid.
        # A global area threshold grows with wall length and falsely rejected
        # C's0.472mm maximum boundary difference. Bound displacement locally in
        # both directions instead, so a missing wall or new hole cannot hide
        # behind the large building's total area.
        self.assertLessEqual(old.boundary.hausdorff_distance(new.boundary),prepare.PRECISION)
        self.assertTrue(old.buffer(prepare.PRECISION).covers(new))
        self.assertTrue(new.buffer(prepare.PRECISION).covers(old))

    def test_access_paths_use_measured_doors_without_changing_their_width(self):
        plans={p['id']:p for p in self.recipe['interiorStairPlans']}
        for floor_id,plan_id,arc,cross_axis in [('n01','n01-east-side-east','283A',0),('n02','n02-east-side-east','2DFE',1)]:
            plan=plans[plan_id];access=plan['accessPath']
            floor=next(f for f in self.recipe['floors'] if f['id']==floor_id)
            door=next(d for d in floor['doors'] if d['id']==f'{floor_id}-door-{arc}')
            center=(np.array(door['hinge'])+door['closedEnd'])/2
            if floor_id=='n01':
                self.assertAlmostEqual(access['lowerApproachCad'][0],center[0],places=5)
                self.assertAlmostEqual(access['viaCad'][0][0],center[0],places=5)
                self.assertGreater(access['viaCad'][0][1]-center[1],0.6)
                self.assertEqual(access['upperPortal']['sourceDoorId'],'n01-door-2852')
            else:
                self.assertAlmostEqual(plan['segments'][0]['a'][cross_axis]+access['offsetCad'][cross_axis],center[cross_axis],places=5)
            self.assertAlmostEqual(access['nominalWidth'],np.linalg.norm(np.array(door['closedEnd'])-door['hinge']),places=5)
        self.assertAlmostEqual(plans['n01-east-side-east']['accessPath']['nominalWidth'],0.614638,places=5)

    def test_no_columns_or_wall_triangles_fill_opening_centers(self):
        for floor in self.recipe["floors"]:
            for door in floor["doors"]:
                center = Point((np.array(door["hinge"]) + np.array(door["closedEnd"])) / 2)
                height = (door["bottom"] + door["top"]) / 2
                for solid in floor["solids"]:
                    if solid["role"] == "wall" and solid["bottom"] < height < solid["top"]:
                        if "ceilingPlane" in solid:
                            plane = solid["ceilingPlane"]
                            if plane[0] * center.x + plane[1] * center.y + plane[2] < height:
                                continue
                        shape = Polygon(solid["loops"][0], solid["loops"][1:])
                        self.assertFalse(shape.buffer(-0.002).covers(center), door["id"])


if __name__ == "__main__":
    unittest.main()
