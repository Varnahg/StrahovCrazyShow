"""Prepare B1 construction geometry from local, untracked historical DXF plans.

Only derived recipe/overlays belong in the ignored output directory. The small
versioned audit contains measurements, hashes and limitations, never source text
or a reproduction of the drawings. Requires ezdxf 1.4.5 and Shapely >= 2.1.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import ezdxf
import numpy as np
import shapely
from shapely import constrained_delaunay_triangles, make_valid, set_precision
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import nearest_points, polygonize, unary_union
from shapely.strtree import STRtree


ROOT = Path(__file__).resolve().parents[2]
LEVEL_ELEVATIONS = {
    "p01": {"main": -3.0, "westWing": -4.65, "eastWing": -4.65},
    "n01": {"main": 0.0, "westWing": -1.95, "eastWing": -1.95},
    "n02": {"main": 2.85, "westWing": 1.05, "eastWing": 1.05},
    "n03": {"main": 5.70, "westWing": 4.35, "eastWing": 4.35},
    "n04": {"main": 9.0, "westWing": 8.05, "eastWing": 8.05},
}
FLOORS = {floor: levels["main"] for floor, levels in LEVEL_ELEVATIONS.items()}
SLAB_THICKNESS = 0.20
ROOF_HEAD_TOP = 11.55
WORLD_N01_ORIGIN_ESTIMATE = 4.20
HEIGHT_MODEL_ID = "b01-C-cad2005-ipr2023-hypothesis"
INTERIOR_RISER_HEIGHT = 0.15
HEIGHT_RATIONALE = (
    "Coordinator-selected variant C: explicit per-floor main and wing levels give "
    "0.15m rises across the 22 measured interior segments. Main/wing roofs and roof "
    "head are separate surfaces, not another inferred occupied storey. CAD 2005 XY "
    "and IPR Praha summer 2023 facade/platform bands support this interpretation, "
    "but do not constitute a measured interior section or as-built survey. "
    "The world N01 origin 4.20m and all vertical dimensions remain modeling estimates."
)
STRONG = "3-ZDI_SILNE"
WEAK = "3-ZDI_SLABE"
PRECISION = 0.001
MIN_AREA = 0.000025
CONSTRUCTION_MARGIN = 6.0
EXTERIOR_PROTECTION_HEIGHT = 1.0


def generator_sha256():
    """Fingerprint the actual generator bytes, including uncommitted changes."""
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def record_generator_provenance(recipe, audit, source_sha):
    if generator_sha256() != source_sha:
        raise RuntimeError("Generator changed during preparation; output was not published")
    recipe["generatorSha256"] = source_sha
    audit["generatorSha256"] = source_sha


def polygons(geometry):
    if geometry.geom_type == "Polygon":
        if geometry.area >= MIN_AREA:
            yield geometry
    elif hasattr(geometry, "geoms"):
        for part in geometry.geoms:
            yield from polygons(part)


def clean(geometry):
    return unary_union(list(polygons(set_precision(make_valid(geometry), PRECISION))))


def union(parts):
    return clean(unary_union([p for p in parts if not p.is_empty]))


def xy(point):
    return np.array([point.x / 1000.0, point.y / 1000.0])


def coords(points):
    return [[round(float(x), 6), round(float(y), 6)] for x, y in points]


@dataclass
class Segment:
    id: str
    layer: str
    a: np.ndarray
    b: np.ndarray

    def __post_init__(self):
        self.length = float(np.linalg.norm(self.b - self.a))
        self.direction = (self.b - self.a) / self.length
        self.normal = np.array([-self.direction[1], self.direction[0]])
        self.line = LineString([self.a, self.b])


def segment(identifier, layer, a, b):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    if not np.isfinite(a).all() or not np.isfinite(b).all():
        raise ValueError(f"Non-finite segment {identifier}")
    if np.linalg.norm(b - a) < 0.001:
        return None
    return Segment(identifier, layer, a, b)


def source_files(source):
    files = {floor: source / f"strahov blok1 {floor}.dxf" for floor in FLOORS}
    missing = [p.name for p in files.values() if not p.is_file()]
    if missing:
        raise FileNotFoundError("Missing B1 plans: " + ", ".join(missing))
    return files


def construction_domain(room_union, margin=CONSTRUCTION_MARGIN):
    """One bounded drawing extent, including nearby exterior stair enclosures.

    A distance buffer around a Z-shaped room union drops a measured outer
    retaining edge while accepting its inner partner (B1 P01 A8/228). The
    room bounding box preserves that pair. Full-entity containment prevents
    an unrelated line from entering this drawing from a distant origin.
    """
    # n01 entry-platform edges reach 5.085m beyond the room maximum X;
    # 6m retains these known surroundings while excluding drawing/title areas.
    if room_union.is_empty or not math.isfinite(margin) or not 0 <= margin <= CONSTRUCTION_MARGIN:
        raise ValueError("Invalid construction domain")
    xmin, ymin, xmax, ymax = room_union.bounds
    if not all(math.isfinite(value) for value in (xmin, ymin, xmax, ymax)):
        raise ValueError("Non-finite construction bounds")
    return box(xmin - margin, ymin - margin, xmax + margin, ymax + margin)


def rectangular_profile(points, closed=False):
    """Recognize a genuinely closed four-sided section, including unset flags."""
    points = [np.asarray(point, dtype=float) for point in points]
    if not all(np.isfinite(point).all() for point in points):
        return None
    if len(points) >= 2 and np.linalg.norm(points[0] - points[-1]) <= PRECISION:
        points.pop()
        closed = True
    if not closed or len(points) != 4:
        return None
    edges = [points[(i + 1) % 4] - points[i] for i in range(4)]
    lengths = [float(np.linalg.norm(edge)) for edge in edges]
    if min(lengths) < 0.1 or max(lengths) > 1.5:
        return None
    if any(abs(float(np.dot(edges[i], edges[(i + 1) % 4]))) > lengths[i] * lengths[(i + 1) % 4] * math.sin(math.radians(1)) for i in range(4)):
        return None
    profile = Polygon(points)
    return clean(profile) if profile.is_valid and 0.03 < profile.area < 1.5 else None


def matched_column_covers(profiles, columns):
    covers, unresolved = [], []
    for identifier, profile in profiles:
        container = profile.buffer(PRECISION)
        matched = [(column_id, column) for column_id, column in columns
                   if container.covers(column)
                   and 1.05 < profile.area / column.area < 4.0]
        if len(matched) != 1:
            unresolved.append({"entity": identifier, "reason": "closed profile does not uniquely enclose a measured column"})
            continue
        column_id, column = matched[0]
        covers.append({"id": identifier, "columnId": column_id, "profile": profile,
                       "geometry": clean(profile.difference(column)),
                       "basis": "closed strong rectangular profile enclosing the measured column; vertical extent estimated"})
    return covers, unresolved


def read_floor(path):
    document = ezdxf.readfile(path, encoding="cp1250")
    model = document.modelspace()
    rooms, columns, profiles, lines, arcs, statistics = [], [], [], [], [], Counter()
    labels = [(e.dxf.text, Point(xy(e.dxf.insert))) for e in model.query("TEXT")
              if e.dxf.layer == "2-C_MISTNOSTI"]
    for entity in model:
        layer, kind = entity.dxf.layer, entity.dxftype()
        if layer == "2-PLOCHY_MISTNOST" and kind == "POLYLINE":
            polygon = clean(Polygon([xy(v) for v in entity.points_in_wcs()]))
            names = [text for text, point in labels if polygon.covers(point)]
            stair_names = [name for name in names if name.endswith(("92", "93"))]
            rooms.append({"id": (stair_names or names or [entity.dxf.handle])[0], "labels": names,
                          "sourceEntity": entity.dxf.handle, "geometry": polygon})
        elif layer in (STRONG, WEAK, "3-OKNA", "3-DVERE", "3-ZDI_NADPRAZI"):
            if kind == "LINE":
                item = segment(entity.dxf.handle, layer, xy(entity.dxf.start), xy(entity.dxf.end))
                if item:
                    lines.append(item)
                else:
                    statistics["zeroLengthSegments"] += 1
            elif kind == "POLYLINE":
                points = [xy(v) for v in entity.points_in_wcs()]
                if layer == "3-DVERE":
                    arcs.append((entity.dxf.handle, points))
                    continue
                if layer == WEAK and entity.is_closed:
                    statistics["stairDirectionSymbols"] += 1
                    continue
                if layer == STRONG:
                    profile = rectangular_profile(points, entity.is_closed)
                    if profile is not None:
                        profiles.append((entity.dxf.handle, profile))
                if layer == STRONG and entity.is_closed:
                    polygon = clean(Polygon(points))
                    # Dense, approximately round sections are measured columns.
                    if len(points) >= 30 and 0.05 < polygon.area < 0.4:
                        columns.append((entity.dxf.handle, polygon))
                        continue
                if entity.is_closed:
                    points.append(points[0])
                for index, (a, b) in enumerate(zip(points, points[1:])):
                    item = segment(f"{entity.dxf.handle}:{index}", layer, a, b)
                    if item:
                        lines.append(item)
            else:
                statistics["nonConstructionEntities"] += 1
    if not rooms:
        raise ValueError(f"No usable rooms in {path.name}")
    room_union = union([r["geometry"] for r in rooms])
    domain = construction_domain(room_union)
    filtered = [line for line in lines if domain.covers(line.line)]
    statistics["remoteSegments"] = len(lines) - len(filtered)
    columns = [(name, p) for name, p in columns if domain.covers(p)]
    profiles = [(name, p) for name, p in profiles if domain.covers(p)]
    covers, unresolved_profiles = matched_column_covers(profiles, columns)
    return {"rooms": rooms, "roomUnion": room_union, "columns": columns, "columnCovers": covers,
            "unresolvedProfiles": unresolved_profiles, "constructionBounds": list(domain.bounds),
            "lines": filtered, "arcs": arcs, "statistics": statistics,
            "provenance": {"name": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                           "unitsDeclared": document.units, "cadUnitsPerMeter": 1000,
                           "titleBlock": [e.dxf.text for e in model.query("TEXT") if e.dxf.layer == "4-ROZPISKA"]}}


def parallel_strip(first, second, min_width=0.06, max_width=0.65):
    """Actual quadrilateral between overlapping, nearly parallel measured edges."""
    dot = float(np.dot(first.direction, second.direction))
    if abs(dot) < math.cos(math.radians(2)):
        return None
    other = sorted([(float(np.dot(p - first.a, first.direction)), p) for p in (second.a, second.b)], key=lambda p: p[0])
    lo, hi = max(0.0, other[0][0]), min(first.length, other[1][0])
    if hi - lo < 0.08:
        return None
    denominator = other[1][0] - other[0][0]
    c = other[0][1] + (other[1][1] - other[0][1]) * ((lo - other[0][0]) / denominator)
    d = other[0][1] + (other[1][1] - other[0][1]) * ((hi - other[0][0]) / denominator)
    a, b = first.a + lo * first.direction, first.a + hi * first.direction
    widths = [float(np.dot(c - a, first.normal)), float(np.dot(d - b, first.normal))]
    if widths[0] * widths[1] <= 0 or min(map(abs, widths)) < min_width or max(map(abs, widths)) > max_width:
        return None
    if abs(widths[0] - widths[1]) > 0.03:
        return None
    return Polygon([a, b, d, c])


def stair_tread_ids(lines):
    """Repeated measured weak edges, including external stairs without rooms."""
    items = [line for line in lines if line.layer == WEAK and 0.5 < line.length < 6]
    tree = STRtree([line.line for line in items])
    excluded = set()
    for index, first in enumerate(items):
        neighbors = 0
        for other in tree.query(first.line.buffer(0.72, cap_style=2)):
            if other == index:
                continue
            second = items[other]
            if abs(first.length - second.length) > 0.08 or abs(np.dot(first.direction, second.direction)) < 0.999:
                continue
            perpendicular = abs(float(np.dot(second.a - first.a, first.normal)))
            projections = sorted(float(np.dot(p - first.a, first.direction)) for p in (second.a, second.b))
            if 0.23 < perpendicular < 0.70 and abs(projections[0]) < 0.08 and abs(projections[1] - first.length) < 0.08:
                neighbors += 1
        if neighbors >= 2:
            excluded.add(first.id)
    return excluded


def pair_walls(lines, room_union, room_conflicts=None):
    treads = stair_tread_ids(lines)
    candidates = [line for line in lines if line.layer in (STRONG, WEAK) and line.id not in treads]
    tree = STRtree([line.line for line in candidates])
    room_core = room_union.buffer(-0.015)
    shapely.prepare(room_core)
    result, paired_ids = [], set()
    for i, first in enumerate(candidates):
        for j in tree.query(first.line.buffer(0.66, cap_style=2)):
            if j <= i:
                continue
            second = candidates[j]
            strip = parallel_strip(first, second)
            if strip is None or strip.area < MIN_AREA:
                continue
            inside_room = room_core.covers(strip.representative_point())
            overlap = strip.intersection(room_core).area if not inside_room else strip.area
            if inside_room or overlap > strip.area * 0.15:
                # The historical room-area overlay is not always consistent
                # with drawn partitions (e.g. n03 206/207). Two long strong
                # edges are stronger evidence than a room accounting polygon.
                measured_thin_wall = first.layer == second.layer == STRONG and min(first.length, second.length) >= 1.0 and strip.area / min(first.length, second.length) <= 0.201
                if not measured_thin_wall:
                    continue
                if room_conflicts is not None:
                    room_conflicts.append({"entities": [first.id, second.id], "area": round(strip.area, 4),
                                           "reason": "two long strong wall edges override inconsistent room fill"})
            result.append(strip)
            paired_ids.update((first.id, second.id))
    return union(result), paired_ids, len(result)


def close_wall_junctions(lines, wall, room_union):
    """Complete small L/T joins bounded by the drawing's actual wall edges.

    Paired strips cover only the shared projection of their parallel edges. At
    an L corner, the outer edges therefore leave a wall-thickness square. A
    closed source face can establish that square, but an unlabelled lightwell
    or vestibule is also a source face: never infer wall mass from closure alone.
    """
    if wall.is_empty:
        return wall, []
    treads = stair_tread_ids(lines)
    boundaries = [line for line in lines if line.layer in (STRONG, WEAK) and line.id not in treads]
    network = unary_union([set_precision(line.line, PRECISION) for line in boundaries])
    covered = wall.buffer(0.002)
    room_core = room_union.buffer(-0.015)
    strong_runs = [line for line in boundaries if line.layer == STRONG and line.length >= 0.4
                   and line.line.intersection(covered).length >= 0.25]
    if len(strong_runs) < 2:
        return wall, []
    tree = STRtree([line.line for line in strong_runs])
    boundary_bands = [line.line.buffer(0.002, cap_style=2) for line in strong_runs]
    wall_boundary = wall.boundary
    additions, evidence = [], []
    for face in polygonize(network):
        # An actual room/shaft face has no existing wall inside it, even when
        # every side touches a wall. Most of an accepted source face must
        # already be independently established as construction.
        if face.area < MIN_AREA or face.intersection(wall).area < face.area * 0.5:
            continue
        for gap in polygons(face.difference(wall)):
            xmin, ymin, xmax, ymax = gap.bounds
            if gap.area > 0.25 or max(xmax - xmin, ymax - ymin) > 0.8:
                continue
            if gap.intersection(room_core).area > gap.area * 0.1:
                continue
            if gap.boundary.intersection(wall_boundary).length < 0.08:
                continue
            exposed_boundary = gap.boundary.difference(covered)
            if exposed_boundary.length < 0.02:
                continue
            support_indices = [int(i) for i in tree.query(gap.buffer(0.003))
                               if gap.boundary.intersection(boundary_bands[i]).length >= 0.02
                               or any(Point(endpoint).distance(gap.boundary) <= 0.003
                                      for endpoint in (strong_runs[i].a, strong_runs[i].b))]
            supports = [strong_runs[i] for i in support_indices]
            # A tiny unlabelled vestibule may be connected to its doorway and
            # share a source face with adjacent walls. Its only exposed edge
            # is the doorway, not a measured strong outside wall boundary.
            if not any(exposed_boundary.intersection(boundary_bands[i]).length >= 0.02 for i in support_indices):
                continue
            if not any(abs(float(np.dot(first.direction, second.direction))) < math.cos(math.radians(20))
                       for i, first in enumerate(supports) for second in supports[i + 1:]):
                continue
            additions.append(gap)
            evidence.append({"kind": "closedSourceWallJunction", "entities": sorted(line.id for line in supports),
                             "area": round(gap.area, 6), "bounds": [round(v, 6) for v in gap.bounds],
                             "basis": "local closed source face, majority measured wall coverage, two nonparallel established strong runs"})
    return (union([wall] + additions) if additions else wall), evidence


def fit_circle(points):
    points = np.asarray(points, dtype=float)
    if len(points) < 3:
        raise ValueError("Door arc needs at least three points")
    origin = points.mean(axis=0)
    relative = points - origin
    fitted, _, rank, _ = np.linalg.lstsq(np.c_[2 * relative, np.ones(len(relative))], (relative * relative).sum(axis=1), rcond=None)
    if rank < 3:
        raise ValueError("Collinear door arc")
    center = fitted[:2] + origin
    radius = math.sqrt(fitted[2] + float(np.dot(fitted[:2], fitted[:2])))
    error = max(abs(np.linalg.norm(points - center, axis=1) - radius))
    return center, radius, float(error)


def doors_from_arcs(lines, arcs, floor):
    leaves = [line for line in lines if line.layer == "3-DVERE"]
    result, used, corrections = [], set(), []
    for identifier, points in arcs:
        center, radius, error = fit_circle(points)
        options = []
        for leaf in leaves:
            if leaf.id in used:
                continue
            for hinge, tip in [(leaf.a, leaf.b), (leaf.b, leaf.a)]:
                distances = [np.linalg.norm(tip - points[0]), np.linalg.norm(tip - points[-1])]
                index = int(np.argmin(distances))
                score = np.linalg.norm(hinge - center) + distances[index]
                options.append((score, leaf, hinge, tip, points[-1 if index == 0 else 0]))
        if not options:
            raise ValueError(f"Missing door leaf for {floor}/{identifier}")
        score, leaf, hinge, tip, closed = min(options, key=lambda item: item[0])
        if score > 0.05:
            # This short n01 arc is a partly drawn open leaf; a circle fit is
            # ill-conditioned. Its nearest leaf and other arc endpoint retain
            # the measured opening rather than creating a guessed new doorway.
            if floor != "n01" or identifier != "4064" or leaf.id != "406D":
                raise ValueError(f"Unresolved door {floor}/{identifier}: {score:.3f}m")
            corrections.append({"kind": "shortDoorArc", "entity": identifier, "leaf": leaf.id,
                                "fitErrorMeters": round(float(score), 6)})
        used.add(leaf.id)
        result.append({"id": f"{floor}-door-{identifier}", "hinge": coords([hinge])[0],
                       "closedEnd": coords([closed])[0], "openEnd": coords([tip])[0],
                       "sourceEntities": [identifier, leaf.id], "arcFitError": round(error, 6)})
    if len(used) != len(leaves):
        raise ValueError(f"Unpaired door leaves in {floor}: {len(leaves) - len(used)}")
    return result, corrections


def windows_from_lines(lines, floor):
    items = [line for line in lines if line.layer == "3-OKNA"]
    options = []
    for i, first in enumerate(items):
        for j in range(i + 1, len(items)):
            second = items[j]
            strip = parallel_strip(first, second, min_width=0.015, max_width=0.16)
            if strip is not None and strip.area / max(first.length, second.length) > 0.012:
                aligned = second.a if np.dot(second.direction, first.direction) > 0 else second.b
                endpoint_error = np.linalg.norm(aligned - first.a)
                options.append((float(endpoint_error), i, j))
    used, result = set(), []
    for _, i, j in sorted(options):
        if i in used or j in used:
            continue
        first, second = items[i], items[j]
        c, d = (second.a, second.b) if np.dot(first.direction, second.direction) > 0 else (second.b, second.a)
        if min(first.length, second.length) < max(first.length, second.length) * 0.85:
            continue
        a, b = (first.a + c) / 2, (first.b + d) / 2
        used.update((i, j))
        result.append({"id": f"{floor}-window-{first.id}", "a": coords([a])[0], "b": coords([b])[0],
                       "sourceEntities": [first.id, second.id]})
    unmatched = [items[i] for i in range(len(items)) if i not in used]
    # A basement pane has a third duplicated line. It must not become a second
    # window; allow it only when it lies on an already measured pane.
    duplicates = []
    for item in unmatched:
        if any(item.line.hausdorff_distance(LineString([window["a"], window["b"]])) < 0.21 for window in result):
            duplicates.append(item.id)
        else:
            raise ValueError(f"Unpaired window line {floor}/{item.id}")
    return result, duplicates


def oriented_rectangle(a, b, low, high, extend=0.0):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    direction = (b - a) / np.linalg.norm(b - a)
    normal = np.array([-direction[1], direction[0]])
    a, b = a - extend * direction, b + extend * direction
    return Polygon([a + low * normal, b + low * normal, b + high * normal, a + high * normal])


def opening_wall_span(a, b, wall, default_depth):
    """Measure wall thickness immediately beside both jambs, in opening space."""
    a, b = np.asarray(a), np.asarray(b)
    direction = (b - a) / np.linalg.norm(b - a)
    normal = np.array([-direction[1], direction[0]])
    values = []
    for point, sign in [(a, -1), (b, 1)]:
        sample = point + sign * direction * 0.04
        cross = LineString([sample - normal * 0.65, sample + normal * 0.65])
        intersection = cross.intersection(wall)
        parts = list(intersection.geoms) if hasattr(intersection, "geoms") else [intersection]
        for part in parts:
            if part.geom_type != "LineString" or part.length < 0.04:
                continue
            local = [float(np.dot(np.array(v) - sample, normal)) for v in part.coords]
            low, high = min(local), max(local)
            if low <= 0.16 and high >= -0.16 and high - low <= 0.65:
                values.append((low, high))
    if not values:
        return -default_depth / 2, default_depth / 2, "estimated-nearby-opening"
    low, high = min(p[0] for p in values), max(p[1] for p in values)
    if high - low > 0.65:
        low, high = min(values, key=lambda p: abs((p[0] + p[1]) / 2))
    return low, high, "adjacent-wall-sections"


def stair_cores(floor):
    if floor == "n04":
        # The small head does not align with the drawn n03 stair. The plans do
        # not establish its function or a stair route: keep a continuous floor.
        return []
    west = {"id": "west", "bounds": [217.48, 734.45, 228.58, 738.52],
            "flightBounds": [{"id": "west-side", "bounds": [217.4824, 734.7018, 219.8666, 738.2967]},
                             {"id": "east-side", "bounds": [226.1437, 734.7018, 228.3044, 738.2967]},
                             {"id": "center", "bounds": [220.798, 734.4596, 225.1938, 738.2967]}],
            "notes": "n01 measured wide bifurcated stair: side flights 13 edges/12 visible goings; center cut by drawing convention. Elevations and complete riser count are estimates."}
    east = {"id": "east", "bounds": [270.866, 723.228, 282.060, 727.363],
            "flightBounds": [{"id": "west-side", "bounds": [270.8659, 723.4514, 273.3991, 727.0463]},
                             {"id": "east-side", "bounds": [279.583, 723.4514, 282.0604, 727.0463]},
                             {"id": "center", "bounds": [274.1069, 723.2279, 278.7635, 727.3629]}],
            "notes": "Measured projections contain 7 central nosing edges and 13 side edges; physical routes and estimated levels are defined separately in interiorStairPlans."}
    if floor == "n02":
        west["bounds"] = [217.485476, 734.575113, 228.727911, 738.743424]
        east["bounds"] = [270.878175, 723.219959, 282.078702, 727.040879]
        for core in (west, east):
            core["notes"] = "Measured N02 core contains L-shaped side arrivals and a separate narrow departure; use interiorStairPlans, never repeated N01 straight sides."
    if floor == "n03":
        west["bounds"] = [221.4103, 734.5751, 224.646, 738.7434]
        east["bounds"] = [274.8158, 723.0668, 278.0515, 727.3883]
        west["flightBounds"] = [{"id": "west-narrow", "bounds": [221.4103, 734.5751, 222.9519, 737.1926]},
                                 {"id": "east-narrow", "bounds": [223.1044, 734.8783, 224.646, 737.1926]}]
        east["flightBounds"] = [{"id": "east-narrow", "bounds": [276.5099, 724.7708, 278.0515, 727.3883]},
                                 {"id": "west-narrow", "bounds": [274.8158, 724.7708, 276.3574, 727.0851]}]
        for core in [west, east]:
            core["notes"] = "N03 has narrow paired stair flights and rooms in the former wide side-flight areas. This does not prove a roof route. Connect to N02 only after section review."
    for core in [west, east]:
        # With the coordinator's half-level interpretation, the builder owns
        # every landing elevation in these bounds. A generic slab strip would
        # otherwise cap the lower landing and leave only 1.4m of headroom.
        core["holeLoops"] = [coords(list(box(*core["bounds"]).exterior.coords)[:-1])]
        core["landingOwner"] = "builder: replace all removed core floor surfaces with explicit half-level landings"
    return [west, east]


def explicit_corrections(floor, lines, wall):
    # The n01 west stair facade is drawn with one inner boundary. Continue its
    # measured 0.372529m thickness from the adjacent facade, outward only.
    corrections = []
    if floor == "n01":
        for line in lines:
            if line.id in ("1CF2", "1D0A"):
                strip = oriented_rectangle(line.a, line.b, 0, 0.372529)
                corrections.append((strip, {"kind": "singleFacadeEdge", "entity": line.id,
                                            "thicknessMeters": 0.372529, "basis": "adjacent measured west facade"}))
    return union([wall] + [p for p, _ in corrections]), [note for _, note in corrections]


def n01_protective_profiles(floor, lines, room_union=None):
    """Two exact exterior outlines, separately bounded from the dwelling facade.

    The weak n01 projection repeats the basement stair/lightwell sides. The
    supplied plans do not give their vertical extent. The coordinator chose a
    1m protective construction above the local wing floor, not a 3m story wall.
    Only the short attachment ends on the facade plane close these masks.
    """
    if floor != "n01":
        return []
    by_id = {line.id: line for line in lines}
    definitions = [
        ("east-wing-east-side", ["2868", "2869", "286A", "286B", "286C"], "160B",
         [("2868", "a"), ("2868", "b"), ("2869", "b"), ("286A", "b"), ("286B", "b"), ("286C", "a")]),
        ("east-wing-west-side", ["28CA", "28CB", "28CC", "28CD", "28CE", "28CF"], "185C",
         [("28CA", "a"), ("28CA", "b"), ("28CB", "b"), ("28CC", "b"),
          ("28CE", "b"), ("28CE", "a"), ("28CD", "a"), ("28CF", "a")]),
    ]
    profiles = []
    for identifier, handles, facade_handle, vertices in definitions:
        if any(handle not in by_id or by_id[handle].layer != WEAK for handle in handles):
            raise ValueError(f"Cannot establish measured n01 protective outline {identifier}")
        if facade_handle not in by_id or by_id[facade_handle].layer != STRONG:
            raise ValueError(f"Cannot establish measured facade attachment for {identifier}")
        polygon = Polygon([getattr(by_id[handle], endpoint) for handle, endpoint in vertices])
        if not polygon.is_valid or polygon.area <= 0:
            raise ValueError(f"Invalid measured protective outline {identifier}")
        geometry = clean(polygon)
        boundary = geometry.boundary.buffer(0.002)
        if any(by_id[handle].line.difference(boundary).length > 0.004 for handle in handles):
            raise ValueError(f"Protective mask does not follow all measured edges: {identifier}")
        drawn_edges = unary_union([by_id[handle].line for handle in handles]).buffer(0.002)
        attachment_edges = geometry.boundary.difference(drawn_edges)
        if attachment_edges.difference(by_id[facade_handle].line.buffer(0.002)).length > 0.004:
            raise ValueError(f"Protective mask closes away from the measured facade: {identifier}")
        if room_union is not None and geometry.intersection(room_union.buffer(-0.015)).area > 0.001:
            raise ValueError(f"Protective mask intrudes into a measured room: {identifier}")
        profiles.append({"id": identifier, "geometry": geometry, "sourceEntities": handles, "facadeEntity": facade_handle,
                         "height": EXTERIOR_PROTECTION_HEIGHT, "heightBasis": "coordinator-selected unmeasured protective height above the corresponding floor",
                         "planBasis": "measured exterior weak outlines; attachment ends close on the dwelling facade plane"})
    return profiles


def exterior_void_profiles(profiles, room_union, lowered_region=None):
    """Voids are tied to the two measured protection outlines, not all holes."""
    result = []
    for profile in profiles:
        void = clean(box(*profile["geometry"].bounds).difference(profile["geometry"]))
        pieces = list(polygons(void))
        if len(pieces) != 1 or void.intersection(room_union.buffer(-0.015)).area > 0.001:
            raise ValueError(f"Cannot establish an exterior-only void for {profile['id']}")
        polygon = pieces[0]
        closure = ("inner sides of the measured U outline, closed at its attachment plane on the dwelling facade"
                   if profile["id"] == "east-wing-west-side" else
                   "inner sides of the measured L outline and dwelling facade; open end bounded by the plane through measured terminal cap 286A")
        result.append({"id": f"b01-{profile['id']}-void", "geometry": polygon,
                       "loops": [coords(list(polygon.exterior.coords)[:-1])] + [coords(list(ring.coords)[:-1]) for ring in polygon.interiors],
                       "bottom": stair_level_height("p01.eastWing"), "openAbove": stair_level_height("n01.eastWing"),
                       "lowerLevelKey": "p01.eastWing", "upperLevelKey": "n01.eastWing",
                       "provenance": "derived historical shaft footprint; heights estimated",
                       "boundaryBasis": closure, "sourceEntities": profile["sourceEntities"] + [profile["facadeEntity"]],
                       "cutFloor": "n01", "preserveBottomFloor": "p01"})
    return result


def cut_exterior_voids(floor, envelope, voids):
    if not voids:
        return envelope
    shaft = union([void["geometry"] for void in voids])
    if floor == "p01":
        # The external shaft has no room polygon. Merely refraining from
        # cutting it leaves its bottom absent from the original envelope.
        return union([envelope, shaft])
    if floor == "n01":
        return clean(envelope.difference(shaft))
    return envelope


def exterior_stair_exit_masks(profiles, voids):
    """Volný horní výstup nad opěrnou stěnou; jeho výška je interpretovaná.

    P01 dveře jsou na jižním konci západní šachty a rameno stoupá k severu.
    Půdorysný U obrys neurčuje metr vysokou překážku přes konec schodů.
    Podzemní opěrná konstrukce a podlaha zůstávají, odstraní se jen nadzemní
    ochranná část ve světlé šířce doložené šachty.
    """
    result=[]
    for profile in profiles:
        if profile['id']!='east-wing-west-side':
            continue
        void=next(v for v in voids if v['id']=='b01-east-wing-west-side-void')
        x0,_,x1,y0=void['geometry'].bounds
        y1=profile['geometry'].bounds[3]
        cut=clean(profile['geometry'].intersection(box(x0,y0,x1,y1)))
        if cut.is_empty:
            raise ValueError('Chybí měřený horní okraj západní šachty')
        result.append({'id':'west-shaft-upper-exit','geometry':cut,
                       'bounds':list(cut.bounds),'bottom':void['openAbove'],
                       'top':round(void['openAbove']+profile['height'],4),
                       'basis':'Modeled pedestrian clearance above measured retaining wall; stair/door plan fixes the route, height is estimated'})
    return result


def measured_exterior_flight(identifier, treads, partial_edges=()):
    if len(treads) < 3:
        raise ValueError(f"Insufficient measured tread edges for {identifier}")
    normal = treads[0].normal.copy()
    if normal[1] < 0 or (abs(normal[1]) < 1e-8 and normal[0] < 0):
        normal *= -1
    if any(abs(float(np.dot(line.direction, normal))) > 0.02 for line in treads):
        raise ValueError(f"Inconsistent tread directions in {identifier}")
    positions = sorted(float(np.dot((line.a + line.b) / 2, normal)) for line in treads)
    goings = np.diff(positions)
    geometry = unary_union([line.line for line in treads])
    return {"id": identifier, "bounds": [round(v, 6) for v in geometry.bounds],
            "sourceEntities": [line.id for line in treads], "visibleTreadEdges": len(treads),
            "visibleGoings": len(goings), "goingRange": [round(float(min(goings)), 6), round(float(max(goings)), 6)],
            "widthRange": [round(min(line.length for line in treads), 6), round(max(line.length for line in treads), 6)],
            "treadNormal": [round(float(value), 6) for value in normal], "partialEdges": list(partial_edges),
            "heightsMeasured": False, "bottom": None, "top": None,
            "notes": "Measured plan edges only; visible count may be truncated by a drawing break. Direction and complete vertical run require model interpretation."}


def exterior_stair_plans(floor, lines):
    definitions = {
        "n01": [("east-wing-east-visible", [f"{value:X}" for value in range(0x286D, 0x287C)], ())],
        "p01": [("east-wing-west-visible", [f"{value:X}" for value in range(0x2A06, 0x2A14)], ()),
                ("east-wing-east-partial", ["26A1"] + [f"{value:X}" for value in range(0x26A3, 0x26AC)], ("26AA", "26AB"))],
    }
    by_id = {line.id: line for line in lines}
    result = []
    for identifier, handles, partial in definitions.get(floor, []):
        if any(handle not in by_id or by_id[handle].layer != WEAK for handle in handles):
            raise ValueError(f"Missing measured exterior stair edges for {floor}/{identifier}")
        result.append(measured_exterior_flight(f"{floor}-{identifier}", [by_id[handle] for handle in handles], partial))
    return result


def exterior_stair_graphic_ids(lines, plans):
    """Slabé nášlapy, osy, přerušení a šipky uvnitř identifikovaného ramene.

    Částečný nášlap nemusí mít stejně dlouhé sousedy, proto samotný periodický
    filtr nestačí. Silné stavební hrany a slabé bočnice přesahující schodišťový
    diagram se nikdy neodstraňují tímto filtrem.
    """
    masks=[box(p['bounds'][0]-0.025,p['bounds'][1]-0.35,
               p['bounds'][2]+0.025,p['bounds'][3]+0.35) for p in plans]
    return {line.id for line in lines if line.layer==WEAK and any(mask.covers(line.line) for mask in masks)}


def inferred_boundary_walls(lines, wall, room_union, cores):
    """Recover only strong boundary runs; never promote weak treads to walls."""
    candidates, notes, unresolved = [], [], []
    interior = room_union.buffer(-0.035)
    stair_space = union([box(*core["bounds"]) for core in cores])
    covered_edges = wall.buffer(0.012)
    room_boundary = room_union.boundary
    for line in lines:
        if line.layer != STRONG or line.length < 0.65:
            continue
        missing = line.line.difference(covered_edges)
        if missing.length < 0.25:
            continue
        if line.line.intersection(interior).length > line.length * 0.2:
            unresolved.append({"entity": line.id, "length": round(line.length, 4), "reason": "inside-room-or-stair"})
            continue
        if line.line.distance(room_boundary) > 0.065:
            unresolved.append({"entity": line.id, "length": round(line.length, 4), "reason": "no-nearby-room-boundary"})
            continue
        options = []
        for sign in (-1, 1):
            strip = oriented_rectangle(line.a, line.b, min(0, sign * 0.1), max(0, sign * 0.1))
            intrusion = strip.intersection(interior).area / strip.area
            if intrusion < 0.1:
                options.append((intrusion, strip))
        if not options:
            unresolved.append({"entity": line.id, "length": round(line.length, 4), "reason": "ambiguous-wall-side"})
            continue
        strip = min(options, key=lambda item: item[0])[1]
        # Room boundaries in a staircase can also represent the stair's slab.
        if strip.intersection(stair_space).area > strip.area * 0.6:
            unresolved.append({"entity": line.id, "length": round(line.length, 4), "reason": "stair-boundary-needs-section"})
            continue
        candidates.append(strip)
        notes.append({"kind": "singleBoundaryEdge", "entity": line.id, "thicknessMeters": 0.1,
                      "basis": "measured strong boundary; thickness estimated"})
    return union([wall] + candidates), notes, unresolved


def serialize_solids(geometry, floor, role, bottom, top, material="plaster"):
    if top - bottom < 0.001:
        return []
    result = []
    for index, polygon in enumerate(sorted(polygons(clean(geometry)), key=lambda p: (*p.bounds, p.area))):
        polygon = orient(polygon, sign=1.0)
        # Construction fragments below MIN_AREA are discarded before this step;
        # tiny triangles within a valid retained polygon must remain, otherwise
        # its constrained boundary is no longer exactly covered.
        triangles = [t for t in constrained_delaunay_triangles(polygon).geoms if t.area > 1e-12]
        if not triangles or abs(sum(t.area for t in triangles) - polygon.area) > max(1e-5, polygon.area * 1e-7):
            raise ValueError(f"Incomplete constrained triangulation in {floor}/{role}")
        if any(t.difference(polygon).area > 1e-7 for t in triangles):
            raise ValueError(f"Triangulation crossed an opening in {floor}/{role}")
        result.append({"id": f"{floor}-{role}-{bottom:.3f}-{index:04d}", "role": role, "material": material,
                       "loops": [coords(list(polygon.exterior.coords)[:-1])] + [coords(list(ring.coords)[:-1]) for ring in polygon.interiors],
                       "triangles": [coords(list(orient(t, sign=1.0).exterior.coords)[:3]) for t in triangles],
                       "bottom": round(bottom, 4), "top": round(top, 4), "collision": True})
    return result


def wall_bands(wall, openings, bottom, top, floor, role="wall", material="plaster"):
    openings = [item for item in openings if item["cut"].intersects(wall)]
    levels = sorted({bottom, top} | {max(bottom, min(top, float(item[key]))) for item in openings for key in ("bottom", "top")})
    result = []
    for low, high in zip(levels, levels[1:]):
        middle = (low + high) / 2
        cuts = [item["cut"] for item in openings if item["bottom"] < middle < item["top"]]
        geometry = wall.difference(union(cuts)) if cuts else wall
        result += serialize_solids(geometry, floor, role, low, high, material)
    return result


def footprint(room_union, wall, openings):
    connected = union([room_union, wall] + [item["bridge"] for item in openings]).buffer(0.04, join_style=2).buffer(-0.04, join_style=2)
    # B1 has no enclosed courtyards; internal voids are room/door reconstruction
    # gaps. The only vertical voids are explicitly cut stair cores below.
    return union([Polygon(p.exterior) for p in polygons(connected) if p.area > 3])


def split_zone_geometry(geometry, lowered_region):
    if lowered_region.is_empty:
        return [(geometry, False)]
    return [(geometry.difference(lowered_region), False), (geometry.intersection(lowered_region), True)]


def local_level(identifier, lower):
    return stair_level_height(f"{identifier}.{'westWing' if lower else 'main'}")


def stair_level_height(key):
    floor, level = key.split(".", 1)
    if floor not in FLOORS or level not in ("main", "westWing", "eastWing"):
        raise ValueError(f"Not a resolved floor level: {key}")
    return LEVEL_ELEVATIONS[floor][level]


def base_level_map():
    """Fresh working map: derived turn keys must never mutate the shared anchors."""
    return {f"{floor}.{zone}": value for floor, zones in LEVEL_ELEVATIONS.items() for zone, value in zones.items()}


def ceiling_height(key):
    """Underside of the next physical slab, with an independent roof-head cap."""
    floor, zone = key.split(".", 1)
    stair_level_height(key)  # Validate the key even for a roof surface.
    if floor == "n04":
        if zone != "main":
            return None  # Open wing roof, not a newly invented occupied room.
        return round(ROOF_HEAD_TOP - SLAB_THICKNESS, 6)
    order = list(LEVEL_ELEVATIONS)
    next_floor = order[order.index(floor) + 1]
    return round(stair_level_height(f"{next_floor}.{zone}") - SLAB_THICKNESS, 6)


def local_ceiling(identifier, lower):
    return ceiling_height(f"{identifier}.{'westWing' if lower else 'main'}")


def floor_wing_offset(identifier):
    return round(local_level(identifier, True) - local_level(identifier, False), 6)


def allocate_turn_level(low, high, first_count, total_count):
    if high <= low or not 0 < first_count < total_count:
        raise ValueError("Invalid measured riser allocation")
    return round(low + (high - low) * first_count / total_count, 6)


def height_model_metadata():
    return {"id": HEIGHT_MODEL_ID, "status": "interpretation-not-surveyed", "levels": {floor:dict(zones) for floor,zones in LEVEL_ELEVATIONS.items()},
            "ceilingBounds": {floor: {zone: ceiling_height(f"{floor}.{zone}") for zone in zones}
                              for floor, zones in LEVEL_ELEVATIONS.items()},
            "roofHeadTop": ROOF_HEAD_TOP, "slabThickness": SLAB_THICKNESS,
            "worldN01OriginEstimate": WORLD_N01_ORIGIN_ESTIMATE, "interiorRiserEstimate": INTERIOR_RISER_HEIGHT,
            "terrainValidationPending": True,
            "rationale": HEIGHT_RATIONALE, "evidenceDates": {"cad": 2005, "ipr": "summer 2023"}}


def opening_vertical_span(kind, reference, ceiling, sill=0.9, head=2.4):
    """The descriptor and cut geometry share one ceiling-limited opening interval."""
    if kind not in ("door", "window"):
        raise ValueError("Unsupported opening kind")
    if ceiling is None or not all(math.isfinite(value) for value in (reference, ceiling)):
        raise ValueError("Opening has no occupied-zone ceiling")
    low = reference + (0 if kind == "door" else sill)
    requested_high = reference + (2.1 if kind == "door" else head)
    high = min(requested_high, ceiling - 0.05)
    if high - low <= 0.05:
        raise ValueError("Opening cannot fit below its ceiling")
    return round(low, 6), round(high, 6)


def interior_level_map(plans):
    """Resolve only intermediate L turns; measured wing endpoints remain anchors."""
    levels = base_level_map()
    for plan in plans:
        segments = plan["segments"]
        if not segments or any(a["upperLevelKey"] != b["lowerLevelKey"] for a, b in zip(segments, segments[1:])):
            raise ValueError("Disconnected interior route " + plan["id"])
        low, high = levels[plan["lowerLevelKey"]], levels[plan["upperLevelKey"]]
        total = sum(len(segment["riserPositions"]) for segment in segments)
        completed = 0
        for segment in segments[:-1]:
            completed += len(segment["riserPositions"])
            key = segment["upperLevelKey"]
            if key not in levels:
                levels[key] = allocate_turn_level(low, high, completed, total)
        for segment in segments:
            rise = (levels[segment["upperLevelKey"]] - levels[segment["lowerLevelKey"]]) / len(segment["riserPositions"])
            if abs(rise - INTERIOR_RISER_HEIGHT) > 1e-6:
                raise ValueError(f"Interior height graph contradicts variant C in {segment['id']}: {rise}")
    return levels


def handle_range(first, last):
    return [f"{value:X}" for value in range(int(first, 16), int(last, 16) + 1)]


def measured_stair_segment(identifier, lines, handles, axis, increasing, owner_floor,
                           source_floor, lower_key, upper_key, cross_limits=None):
    by_id = {line.id: line for line in lines}
    if any(handle not in by_id for handle in handles):
        missing = [handle for handle in handles if handle not in by_id]
        raise ValueError(f"Missing stair evidence for {identifier}: {missing}")
    selected = [by_id[handle] for handle in handles]
    direction_index = 0 if axis == "x" else 1
    cross_index = 1 - direction_index
    if axis not in ("x", "y"):
        raise ValueError(f"Invalid stair axis {axis}")
    ordered = sorted([(float((line.a[direction_index] + line.b[direction_index]) / 2), line.id)
                      for line in selected], reverse=not increasing)
    positions = [round(value, 6) for value, _ in ordered]
    if len(positions) < 3 or any(abs(b - a) < 0.02 for a, b in zip(positions, positions[1:])):
        raise ValueError(f"Unresolved coincident tread edges in {identifier}")
    limits = cross_limits or (min(min(line.a[cross_index], line.b[cross_index]) for line in selected),
                              max(max(line.a[cross_index], line.b[cross_index]) for line in selected))
    center = sum(limits) / 2
    a = [positions[0], center] if axis == "x" else [center, positions[0]]
    b = [positions[-1], center] if axis == "x" else [center, positions[-1]]
    bounds = ([min(positions), limits[0], max(positions), limits[1]] if axis == "x" else
              [limits[0], min(positions), limits[1], max(positions)])
    return {"id": identifier, "a": coords([a])[0], "b": coords([b])[0],
            "bounds": [round(float(value), 6) for value in bounds], "width": round(limits[1] - limits[0], 6),
            "axis": axis, "ascendingDirection": "increasing" if increasing else "decreasing",
            "treadPositions": positions, "riserPositions": [round(abs(value - positions[0]), 6) for value in positions],
            "visibleIntervals": len(positions) - 1, "modeledRiserCount": len(positions),
            "riserCountInterpretation": "one modeled rise per measured nosing edge; final rise reaches upper landing; not measured Z",
            "sourceEntities": [handle for _, handle in ordered], "sourceFloor": source_floor,
            "ownerFloor": owner_floor, "lowerLevelKey": lower_key, "upperLevelKey": upper_key,
            "verticalBasis": "coordinator-selected height hypothesis; no CAD elevation measurement"}


def stair_surface(identifier, geometry, owner_floor, level_key, source_floor, source_entities, basis, core_id=None):
    """Landings share exactly the solid triangulator, including holes."""
    source_geometry = geometry
    if core_id is not None:
        core = next(core for core in stair_cores(owner_floor) if core["id"] == core_id)
        geometry = geometry.intersection(box(*core["bounds"]))
    result = []
    for index, payload in enumerate(serialize_solids(geometry, identifier, "stair-landing", 0, SLAB_THICKNESS, "concrete")):
        result.append({"id": identifier if index == 0 else f"{identifier}-{index}",
                       "loops": payload["loops"], "triangles": payload["triangles"],
                       "ownerFloor": owner_floor, "levelKey": level_key, "sourceFloor": source_floor,
                       "sourceEntities": source_entities, "planBasis": basis,
                       "sourcePolygons": [{"loops": [coords(list(part.exterior.coords)[:-1])] + [coords(list(ring.coords)[:-1]) for ring in part.interiors]}
                                          for part in polygons(source_geometry)],
                       "sourceBounds": list(source_geometry.bounds), "clippedToExistingCoreHole": core_id is not None})
    return result


def stair_soffit_plane(segment, thickness=SLAB_THICKNESS, levels=None):
    a, b = np.asarray(segment["a"]), np.asarray(segment["b"])
    vector = b - a
    lower = levels[segment["lowerLevelKey"]] if levels is not None else stair_level_height(segment["lowerLevelKey"])
    upper = levels[segment["upperLevelKey"]] if levels is not None else stair_level_height(segment["upperLevelKey"])
    rise = (upper - lower) / len(segment["riserPositions"])
    # The terminal measured nose belongs to the upper landing. The closed
    # flight's last tread is one rise lower; keep its underside below that.
    gradient = vector * ((upper - rise - lower) / float(np.dot(vector, vector)))
    return [float(gradient[0]), float(gradient[1]), float(lower - thickness - np.dot(gradient, a))]


def measured_edge_flight(identifier, edges, handles, lower_key, upper_key, owner_floor="p01", source_floor="n01"):
    """Preserve skew and variable width; centers are metadata, not replacement edges."""
    edges = np.array(edges, dtype=float, copy=True)
    if edges.ndim != 3 or edges.shape[1:] != (2, 2) or len(edges) < 3 or not np.isfinite(edges).all():
        raise ValueError(f"Invalid measured front edges: {identifier}")
    # Keep endpoint correspondence even if a source LINE was drawn backwards.
    for i in range(1, len(edges)):
        if np.dot(edges[i, 1] - edges[i, 0], edges[0, 1] - edges[0, 0]) < 0:
            edges[i] = edges[i, ::-1]
    centers = edges.mean(axis=1)
    widths = np.linalg.norm(edges[:, 1] - edges[:, 0], axis=1)
    progress = np.linalg.norm(np.diff(centers, axis=0), axis=1)
    heading = centers[-1] - centers[0]
    if min(widths) < 0.3 or min(progress) < 0.02 or any(np.dot(v, heading) <= 0 for v in np.diff(centers, axis=0)):
        raise ValueError(f"Unordered or degenerate front edges: {identifier}")
    return {"id": identifier, "frontEdgesCad": [coords(edge) for edge in edges],
            "a": coords([centers[0]])[0], "b": coords([centers[-1]])[0],
            "width": round(float(min(widths)), 6), "widthRange": [round(float(v), 6) for v in (min(widths), max(widths))],
            "bounds": list(LineString(edges.reshape(-1, 2)).bounds),
            "riserPositions": [round(float(v), 6) for v in np.r_[0, np.cumsum(progress)]],
            "visibleIntervals": len(edges) - 1, "modeledRiserCount": len(edges),
            "sourceEntities": handles, "sourceFloor": source_floor, "ownerFloor": owner_floor,
            "lowerLevelKey": lower_key, "upperLevelKey": upper_key,
            "riserCountInterpretation": "one modeled rise per measured front edge; final edge belongs to upper landing; no measured Z",
            "verticalBasis": "explicit endpoint level map; no measured interior section or surveyed stair Z"}


def edge_landing(flight, upper, depth=0.6):
    """Extrapolate an explicitly estimated landing from the exact terminal edge."""
    edges = np.asarray(flight["frontEdgesCad"])
    vector = edges[-1].mean(axis=0) - edges[0].mean(axis=0)
    offset = vector / np.linalg.norm(vector) * depth * (1 if upper else -1)
    edge = edges[-1] if upper else edges[0]
    return Polygon([edge[0], edge[1], edge[1] + offset, edge[0] + offset])


def paired_thickness(first, second):
    if abs(float(np.dot(first.direction, second.direction))) < 0.995:
        raise ValueError(f"Nonparallel retaining pair {first.id}/{second.id}")
    thickness = abs(float(np.dot(second.a - first.a, first.normal)))
    if not 0.06 <= thickness <= 0.65:
        raise ValueError(f"Unexpected retaining thickness {first.id}/{second.id}: {thickness}")
    return thickness


def outer_boundary_band(line, thickness, clear_space):
    """The selected N01 line is the clear face; place measured thickness outside it."""
    positive = oriented_rectangle(line.a, line.b, 0, thickness)
    negative = oriented_rectangle(line.a, line.b, -thickness, 0)
    return min((positive, negative), key=lambda shape: shape.intersection(clear_space).area)


def edge_soffit_masks(flight, levels):
    """Piecewise planes match edge_flight, constant across each measured front edge."""
    edges = np.asarray(flight["frontEdgesCad"])
    low, high = (levels[flight[key]] for key in ("lowerLevelKey", "upperLevelKey"))
    rise = (high - low) / len(edges)
    masks = []
    for index, (first, second) in enumerate(zip(edges, edges[1:])):
        direction = first[1] - first[0]
        normal = np.array([-direction[1], direction[0]]) / np.linalg.norm(direction)
        advance = float(np.dot(second.mean(axis=0) - first.mean(axis=0), normal))
        if abs(advance) < 0.02:
            raise ValueError("Degenerate skew going")
        gradient = normal * rise / advance
        plane = [float(gradient[0]), float(gradient[1]), float(low + index * rise - SLAB_THICKNESS - np.dot(gradient, first[0]))]
        masks.append({"id": f"{flight['id']}-soffit-{index}",
                      "geometry": Polygon([first[0], first[1], second[1], second[0]]), "ceilingPlane": plane,
                      "sourceEntities": flight["sourceEntities"], "basis": "actual skew flight underside; elevations estimated"})
    return masks


WEST_GRAPHICS = {
    "n01": set(handle_range("3180", "318F") + handle_range("31E3", "31ED")),
    "p01": set(["2742", "2743", "2744", "279A", "279F", "27F0"] + handle_range("2749", "2754") + handle_range("27A0", "27AA")),
}
WEST_RETAINING_PAIRS = {
    "317C": ("B0", "B1"), "317D": ("AE", "AF"), "317E": ("B5", "B6"), "317F": ("B3", "B4"),
    "31DD": ("1524", "1525"), "31DE": ("1526", "1527"), "31DF": ("1528", "1529"),
    "31E0": ("1530", "1531"), "31E1": ("152E", "152F"), "31E2": ("152B", "152C"),
}
WEST_RETAINING_RETURNS = {"317E": ["B7"], "317F": ["B8"], "31DE": ["1533", "1534"], "31E2": ["152D"]}


def west_exterior_exclusions(floor):
    retained = set(WEST_RETAINING_PAIRS) if floor == "n01" else (
        {handle for pair in WEST_RETAINING_PAIRS.values() for handle in pair}
        | {handle for returns in WEST_RETAINING_RETURNS.values() for handle in returns} if floor == "p01" else set())
    return WEST_GRAPHICS.get(floor, set()) | retained


def west_exterior_metadata(data):
    """Two local exterior routes; full N01 is canonical, P01 supplies wall thickness only."""
    n = {line.id: line for line in data["n01"]["lines"]}
    p = {line.id: line for line in data["p01"]["lines"]}
    required = set(WEST_RETAINING_PAIRS) | set(handle_range("3180", "318D")) | set(handle_range("31E3", "31EC"))
    missing = sorted(required - n.keys())
    missing += sorted({h for pair in WEST_RETAINING_PAIRS.values() for h in pair} - p.keys())
    if missing:
        raise ValueError(f"Missing west exterior source evidence: {missing}")
    low_key, turn_key = "p01.westWing", "p01-west-exterior-nw:turn"
    low = stair_level_height(low_key)
    anchors = {"westExterior.nw.top": round(low + 14 * 0.2, 4), "westExterior.ne.top": round(low + 11 * 0.2, 4)}
    estimates = {turn_key: allocate_turn_level(low, anchors["westExterior.nw.top"], 6, 14)}
    levels = {low_key: low, **anchors, **estimates}

    def flight(identifier, handles, lower, upper, terminal=None):
        edges = [[n[h].a, n[h].b] for h in handles]
        if terminal is not None:
            edges.append(terminal)
        result = measured_edge_flight(identifier, edges, handles + (["31DE", "31E1", "31E2"] if terminal is not None else []), lower, upper)
        result["edgeSourceEntities"] = [[handle] for handle in handles] + ([["31DE", "31E1", "31E2"]] if terminal is not None else [])
        return result

    nw1 = flight("p01-west-exterior-nw-first", handle_range("3180", "3185"), low_key, turn_key)
    nw2 = flight("p01-west-exterior-nw-second", handle_range("3186", "318D"), turn_key, "westExterior.nw.top")
    terminal = [n["31DE"].line.intersection(n[h].line) for h in ("31E1", "31E2")]
    if any(point.geom_type != "Point" for point in terminal):
        raise ValueError("NE terminal front must be the intersections of 31DE with both flight sides")
    ne = flight("p01-west-exterior-ne-flight", handle_range("31E3", "31EC"), low_key, "westExterior.ne.top",
                [[point.x, point.y] for point in terminal])
    courts = {
        "nw": Polygon([n["317F"].a, n["317F"].b, n["317E"].b, n["317D"].b, n["317D"].a, n["317C"].a]),
        "ne": Polygon([n["31DF"].b, n["31DF"].a, n["31DE"].a, n["31DD"].a]),
    }
    exterior_doors, _ = doors_from_arcs(data["p01"]["lines"], data["p01"]["arcs"], "p01")
    doors = {door["id"]: door for door in exterior_doors}
    connectors = {}
    for side, door_id in (("nw", "p01-door-44E2"), ("ne", "p01-door-4516")):
        if door_id not in doors:
            raise ValueError(f"Missing original exterior portal {door_id}")
        door = doors[door_id]
        connectors[side] = {"id": f"p01-west-exterior-{side}-threshold", "sourceDoorId": door_id,
                            "geometry": oriented_rectangle(door["hinge"], door["closedEnd"], -0.35, 0.35),
                            "centerCad": coords([(np.asarray(door["hinge"]) + door["closedEnd"]) / 2])[0],
                            "sourceEntities": door["sourceEntities"],
                            "basis": "measured unchanged P01 door width; estimated 0.35m threshold each side bridges local facade/courtyard alignment"}
    turn = Polygon([nw1["frontEdgesCad"][-1][0], nw1["frontEdgesCad"][-1][1], n["317F"].a, nw2["frontEdgesCad"][0][1]])
    plans, masks, cutouts, retaining, bottoms = [], [], [], [], []
    for side, flights in (("nw", [nw1, nw2]), ("ne", [ne])):
        identifier = f"p01-west-exterior-{side}"
        top_key = f"westExterior.{side}.top"
        landings = [("lower", edge_landing(flights[0], False), low_key), ("upper", edge_landing(flights[-1], True), top_key)]
        if side == "nw":
            landings.append(("turn", turn, turn_key))
        surfaces = []
        for name, shape, key in landings:
            surfaces += stair_surface(f"{identifier}-{name}-landing", shape, "p01", key, "n01",
                                      list(WEST_RETAINING_PAIRS) if side == "ne" else handle_range("3180", "318D"),
                                      "exact flight end; upper/lower extension 0.60m estimated, turn follows measured boundary")
            if name != "lower":
                masks.append({"id": f"{identifier}-{name}-cap", "geometry": shape,
                              "ceilingPlane": [0, 0, levels[key] - SLAB_THICKNESS], "sourceEntities": flights[-1]["sourceEntities"],
                              "basis": "physical support below landing, not a collision-only opening; estimated Z"})
        bottom_landing = landings[0][1]
        # The courtyard remains below the stairs. Lower landing is supplied once
        # by the builder; remove its area from this explicitly restored bottom.
        bottoms.append({"id": identifier + "-courtyard-bottom",
                        "geometry": union([courts[side], connectors[side]["geometry"]]).difference(bottom_landing), "height": low})
        for part in polygons(union([courts[side]] + [shape for _, shape, _ in landings])):
            cutouts.append({"id": identifier + "-terrain", "loops": [coords(list(part.exterior.coords)[:-1])],
                            "bottom": low, "openAbove": levels[top_key], "terrainValidationPending": True,
                            "coordinateSpace": "CAD XY metres; no origin subtraction or game-axis transform",
                            "provenance": "derived historical N01 courtyard and local landing footprint; no DEM or surveyed elevations",
                            "heightBasis": "provisional 0.20m per front edge; local exterior endpoint, not known terrain"})
        plan = {"id": identifier, "ownerFloor": "p01", "sourceFloor": "n01", "coreId": "west-exterior-" + side,
                "lowerLevelKey": low_key, "upperLevelKey": top_key, "segments": flights, "landings": surfaces,
                "heightEstimates": {key: levels[key] for key in sorted({low_key, top_key} | ({turn_key} if side == "nw" else set()))},
                "planBasis": "full N01 front edges canonical; P01 partial projections and retaining outlines disagree locally; detailed perpendicular offsets in retaining profiles",
                "verticalBasis": "provisional per-edge rise; final outdoor endpoints require DEM integration"}
        plan["exteriorPortal"] = {key: value for key, value in connectors[side].items() if key != "geometry"}
        plans.append(plan)
        masks.extend(mask for part in flights for mask in edge_soffit_masks(part, levels))
    # Individual old exterior strips are replaced, never the building facade.
    # Offset canonical clear faces outward; dividers choose the side away from
    # the actual flight, not the whole courtyard.
    ne_run = union([mask["geometry"] for mask in edge_soffit_masks(ne, levels)])
    for handle, pair in WEST_RETAINING_PAIRS.items():
        side = "nw" if handle.startswith("317") else "ne"
        reference = ne_run if handle in ("31E0", "31E1", "31E2") else courts[side]
        thickness = paired_thickness(p[pair[0]], p[pair[1]])
        geometry = outer_boundary_band(n[handle], thickness, reference)
        # For a divider outside the flight, choosing the side is ambiguous;
        # its continuation follows the nearest adjoining sloped divider.
        if handle == "31E0":
            geometry = oriented_rectangle(n[handle].a, n[handle].b, -thickness, 0)
        retaining.append({"id": f"west-exterior-retaining-{handle}", "geometry": geometry,
                          "sourceEntities": [handle, *pair, *WEST_RETAINING_RETURNS.get(handle, [])], "thickness": thickness,
                          "p01EndpointNormalOffsets": {h: [round(float(np.dot(endpoint - n[handle].a, n[handle].normal)), 6)
                                                            for endpoint in (p[h].a, p[h].b)] for h in pair},
                          "sourceFloor": "n01+p01", "top": round(max(anchors.values()) + SLAB_THICKNESS, 6), "bottom": low,
                          "basis": "N01 canonical clear face with measured P01 pair thickness; estimated common retaining crest 0.20m above the higher western exit endpoint; local inter-plan interpretation, not survey"})
    return {"plans": plans, "anchors": anchors, "estimates": estimates, "terrainCutouts": cutouts,
            "courts": courts, "bottoms": bottoms, "retaining": retaining, "masks": masks, "doorConnectors": list(connectors.values()),
            "levels": levels, "lowerLandings": union([Polygon(s["loops"][0], s["loops"][1:]) for plan in plans for s in plan["landings"] if s["levelKey"] == low_key])}


def west_retaining_solids(west):
    """Partition every support once, capped under real flight/landing surfaces."""
    result, occupied = [], GeometryCollection()
    for profile in west["retaining"]:
        remaining = clean(profile["geometry"].difference(occupied))
        occupied = union([occupied, profile["geometry"]])
        pieces = []
        for mask in west["masks"]:
            piece = clean(remaining.intersection(mask["geometry"]))
            remaining = clean(remaining.difference(mask["geometry"]))
            if not piece.is_empty:
                pieces.append((piece, mask))
        pieces.append((remaining, None))
        for index, (shape, mask) in enumerate(pieces):
            for solid in serialize_solids(shape, f"{profile['id']}-{index}", "retaining-wall", profile["bottom"], profile["top"], "concrete"):
                solid["sourceEntities"] = profile["sourceEntities"]
                solid["heightBasis"] = profile["basis"]
                if mask:
                    plane = mask["ceilingPlane"]
                    if max(plane[0]*x + plane[1]*y + plane[2] for ring in solid["loops"] for x,y in ring) <= solid["bottom"] + 1e-6:
                        continue
                    solid["ceilingPlane"] = plane
                    solid["ceilingMaskId"] = mask["id"]
                result.append(solid)
    return result


def west_floor_geometry(floor, envelope, west):
    """Cut only measured exterior courtyards; explicit basement bottoms follow separately."""
    if floor not in ("p01", "n01") or not west:
        return envelope
    cuts = union([Polygon(item["loops"][0], item["loops"][1:]) for item in west["terrainCutouts"]])
    if floor == "p01":
        cuts = union([cuts] + [connector["geometry"] for connector in west.get("doorConnectors", [])])
    return clean(envelope.difference(cuts))


def source_edge_flight(data, identifier, source_floor, owner_floor, handles, low_key, high_key):
    by_id = {line.id: line for line in data[source_floor]["lines"]}
    missing = [handle for handle in handles if handle not in by_id]
    if missing:
        raise ValueError(f"Missing exterior front edges in {identifier}: {missing}")
    result = measured_edge_flight(identifier, [[by_id[h].a, by_id[h].b] for h in handles], handles,
                                  low_key, high_key, owner_floor, source_floor)
    result["edgeSourceEntities"] = [[handle] for handle in handles]
    return result


def landing_side_of_edge(flight, upper, boundary):
    """Use the measured enclosure for a shaft landing, retaining the exact front."""
    edges = np.asarray(flight["frontEdgesCad"])
    edge = edges[-1] if upper else edges[0]
    vector = edges[-1].mean(axis=0) - edges[0].mean(axis=0)
    point = edge.mean(axis=0) + vector / np.linalg.norm(vector) * (0.1 if upper else -0.1)
    choices = [oriented_rectangle(edge[0], edge[1], -20, 0, extend=20),
               oriented_rectangle(edge[0], edge[1], 0, 20, extend=20)]
    half = next(shape for shape in choices if shape.covers(Point(point)))
    # The exact P01 west front extends 19mm past the N01 facade plane;
    # preserve that local difference rather than shortening its measured edge.
    return union([boundary.intersection(half), edge_landing(flight, upper)])


NEW_EXTERIOR_GRAPHICS = {"n01": set(handle_range("2A79", "2A88")),
                         "n02": set(handle_range("28F5", "2903"))}
UNCONFIRMED_FACADE_ARCS = {
    "n01": {"404E", "4064", "406E"},
    "n02": {"25E3", "25FB", "2612", "262D", "2643", "2650"},
    "n03": {"21D6", "21EE", "2205", "221E", "2234", "2241"},
}


def classify_facade_opening(floor, door):
    handles = set(door["sourceEntities"])
    if handles & UNCONFIRMED_FACADE_ARCS.get(floor, set()):
        door.update({"openingClassification": "facade-opening-unconfirmed-access", "accessConfirmed": False, "fixedGlazing": True,
                     "classificationBasis": "CAD leaf/arc on 3-DVERE; IPR Praha summer 2023 shows closed glazed facade rows, including N01 west above a solid parapet; no measured sill or opening height"})
    elif (floor == "n01" and handles & {"2A37", "2A4F", "2A66"}) or (floor == "n02" and "28DD" in handles):
        door.update({"openingClassification": "exterior-door-with-measured-landing", "accessConfirmed": True,
                     "classificationBasis": "source door leaf/arc and directly adjoining exterior landing and full flight"})


def connect_landing_to_portals(landing, doors):
    """Bridge the actual recessed frame to the landing through its measured width."""
    connectors = []
    for door in doors:
        a, b = door["hinge"], door["closedEnd"]
        to_a = nearest_points(Point(a), landing)[1]
        to_b = nearest_points(Point(b), landing)[1]
        geometry = clean(Polygon([a, b, [to_b.x, to_b.y], [to_a.x, to_a.y]]))
        if geometry.is_empty:
            continue
        if max(Point(a).distance(landing), Point(b).distance(landing)) > 0.5:
            raise ValueError(f"Unresolved distant exterior portal: {door['id']}")
        connectors.append({"sourceDoorId": door["id"], "sourceEntities": door["sourceEntities"], "geometry": geometry,
                           "basis": "measured closed door span connected to nearest measured upper landing edge; no opening translation or width change"})
    return union([landing] + [connector["geometry"] for connector in connectors]), connectors


def exterior_stair_routes(data, shared_voids):
    """All six exterior routes; source floor names do not establish outdoor Z."""
    west = west_exterior_metadata(data)
    plans = list(west["plans"])
    anchors = dict(west["anchors"])
    anchors.update({"exterior.mainEast.lower": -2.10,
                    "exterior.n02East.lower": round(stair_level_height("n02.eastWing") - 1.60, 6)})
    estimates = dict(west["estimates"])
    levels = base_level_map()
    levels.update(anchors)
    levels.update(estimates)
    cutouts = list(west["terrainCutouts"])
    voids = {item["id"]: item for item in shared_voids}

    def add_route(identifier, flight, landing_specs, basis, portal_arcs=()):
        surfaces = []
        for suffix, geometry, owner, key, sources in landing_specs:
            surfaces += stair_surface(identifier + "-" + suffix, geometry, owner, key, flight["sourceFloor"], sources, basis)
        plan = {"id": identifier, "ownerFloor": flight["ownerFloor"], "sourceFloor": flight["sourceFloor"],
                "coreId": identifier, "lowerLevelKey": flight["lowerLevelKey"], "upperLevelKey": flight["upperLevelKey"],
                "segments": [flight], "landings": surfaces, "planBasis": basis,
                "heightEstimates": {key: levels[key] for key in sorted({flight["lowerLevelKey"], flight["upperLevelKey"]})},
                "verticalBasis": "explicit coordinator-selected estimate; no surveyed stair Z or terrain elevation",
                "terrainValidationPending": True}
        if portal_arcs:
            plan["sourceDoorIds"] = [flight["ownerFloor"] + "-door-" + handle for handle in portal_arcs]
        plans.append(plan)
        return plan

    for side, source, handles in (("west", "p01", handle_range("2A06", "2A13")),
                                   ("east", "n01", handle_range("286D", "287B"))):
        identifier = "exterior-east-shaft-" + side
        flight = source_edge_flight(data, identifier + "-flight", source, "n01", handles,
                                    "p01.eastWing", "n01.eastWing")
        flight["verticalBasis"] = "existing estimated shaft endpoints retained; measured edge count replaces invented uniform 16-step flight"
        flight["riserLimitBasis"] = "variant C shaft endpoints give 2.70m total rise across the actual measured edges; ordinary 0.22m limit applies"
        void = voids[f"b01-east-wing-{side}-side-void"]
        boundary = Polygon(void["loops"][0], void["loops"][1:])
        add_route(identifier, flight,
                  [("lower-landing", landing_side_of_edge(flight, False, boundary), "p01", "p01.eastWing", handles[:1] + void["sourceEntities"]),
                   ("upper-landing", landing_side_of_edge(flight, True, boundary), "n01", "n01.eastWing", handles[-1:] + void["sourceEntities"])],
                  "measured shaft enclosure and complete front edges; lower cut view is reference only, not an extra flight")

    definitions = [
        ("exterior-main-east", "n01", ["2A7A"] + list(reversed(handle_range("2A7C", "2A87"))),
         "exterior.mainEast.lower", "n01.main", ("2A79", "2A7B"), ("2A37", "2A4F", "2A66")),
        ("exterior-n02-east", "n02", ["2900"] + list(reversed(handle_range("28FA", "28FF"))) + ["28F7"],
         "exterior.n02East.lower", "n02.eastWing", ("28F5", "28F6", "28F8", "28F9"), ("28DD",)),
    ]
    for identifier, floor, handles, low_key, high_key, landing_handles, portal_arcs in definitions:
        flight = source_edge_flight(data, identifier + "-flight", floor, floor, handles, low_key, high_key)
        by_id = {line.id: line for line in data[floor]["lines"]}
        if identifier == "exterior-main-east":
            # Source 2A79/2A7B provide the two long sides from facade to first
            # exterior front. Only their inside portion is the upper landing.
            first = np.asarray(flight["frontEdgesCad"][-1])
            facade = sorted([by_id[h].b for h in landing_handles], key=lambda point: point[1])
            ends = sorted(first, key=lambda point: point[1])
            upper = Polygon([facade[0], ends[0], ends[1], facade[1]])
        else:
            # A rectangle with its left extension reaches the real 28DD door;
            # no inferred straight approach through the existing lower shaft.
            lower_y = by_id["28F5"].a[1]
            upper_y = by_id["28F6"].a[1]
            upper = box(by_id["28F5"].a[0], lower_y, by_id["28F8"].a[0], upper_y)
        floor_doors, _ = doors_from_arcs(data[floor]["lines"], data[floor]["arcs"], floor)
        portal_doors = [door for door in floor_doors if set(door["sourceEntities"]) & set(portal_arcs)]
        if len(portal_doors) != len(portal_arcs):
            raise ValueError(f"Missing exterior door evidence in {identifier}")
        measured_upper = upper
        upper, connectors = connect_landing_to_portals(upper, portal_doors)
        lower = edge_landing(flight, False)
        route = add_route(identifier, flight,
                  [("lower-landing", lower, floor, low_key, handles[:1]),
                   ("upper-landing", upper, floor, high_key, list(landing_handles) + handles[-1:])],
                  "full source flight and measured upper landing; 0.60m exterior lower landing depth estimated pending terrain", portal_arcs)
        route["thresholdConnectors"] = [{key: value for key, value in connector.items() if key != "geometry"}
                                         | {"loops": [coords(list(shape.exterior.coords)[:-1])]}
                                         for connector in connectors for shape in polygons(connector["geometry"])]
        if identifier == "exterior-main-east":
            height_basis = "IPR 2023 lower-platform interpretation world 2.0-2.15m; chosen local -2.10m with estimated N01 origin 4.20m"
        else:
            height_basis = "provisional 1.60m total rise below n02.eastWing; connection to current street unresolved, historical route may be incomplete or changed"
            route["exteriorConnectionStatus"] = "unresolved-current-street-connection"
        flight["verticalBasis"] = route["verticalBasis"] = height_basis
        footprint = union([lower, measured_upper] + [mask["geometry"] for mask in edge_soffit_masks(flight, levels)])
        for shape in polygons(footprint):
            cutouts.append({"id": identifier + "-terrain", "loops": [coords(list(shape.exterior.coords)[:-1])],
                            "bottom": levels[low_key], "openAbove": levels[high_key], "terrainValidationPending": True,
                            "coordinateSpace": "CAD XY metres; no origin subtraction or game-axis transform",
                            "provenance": "derived source exterior flight/upper landing; lower 0.60m landing depth estimated",
                            "heightBasis": height_basis})
    for plan in plans:
        plan["terrainValidationPending"] = True
    return {"plans": plans, "anchors": anchors, "estimates": estimates, "levels": levels,
            "terrainCutouts": cutouts, "west": west}


def reserve_landing_surfaces(floor, geometry, height, exterior):
    """Same physical support, one surface: route landings replace matching slab pieces."""
    if not exterior:
        return geometry
    landings = [Polygon(item["loops"][0], item["loops"][1:]) for route in exterior["plans"] for item in route["landings"]
                if item["ownerFloor"] == floor and abs(exterior["levels"][item["levelKey"]] - height) < 1e-6]
    if not landings:
        return geometry
    return clean(geometry.difference(union(landings)))


def interior_stair_metadata(data):
    """One physical route per connection; lower cut views are only references."""
    plans, observations = [], []

    def segment_from(floor, identifier, handles, axis, increasing, owner, low, high, cross=None):
        return measured_stair_segment(identifier, data[floor]["lines"], handles, axis, increasing,
                                      owner, floor, low, high, cross)

    def route(identifier, owner, source, core, low, high, segments, role="canonical full arrival"):
        plan = {"id": identifier, "ownerFloor": owner, "sourceFloor": source, "coreId": core,
                "lowerLevelKey": low, "upperLevelKey": high, "segments": segments, "landings": [],
                "projections": [{"floor": source, "role": role, "build": True}],
                "verticalBasis": HEIGHT_RATIONALE}
        if source != owner:
            plan["projections"].append({"floor": owner, "role": "lower partial/departure view; not a second physical flight", "build": False})
        plans.append(plan)
        return plan

    straight = [
        ("p01-east-side-west", "p01", "p01", "east", "eastWing", "p01.main", ["2474", "2475"] + handle_range("2477", "247F"), True),
        ("p01-east-side-east", "p01", "p01", "east", "eastWing", "p01.main", ["2420", "2421"] + handle_range("2423", "242B"), True),
        ("p01-west-center", "p01", "n01", "west", "main", "n01.westWing", handle_range("2D0A", "2D10"), True),
        ("p01-east-center", "p01", "n01", "east", "main", "n01.eastWing", handle_range("2781", "2787"), False),
        ("n01-west-side-west", "n01", "n01", "west", "westWing", "n01.main", ["2C45"] + handle_range("2C49", "2C54"), False),
        ("n01-west-side-east", "n01", "n01", "west", "westWing", "n01.main", ["2CA9"] + handle_range("2CAD", "2CB8"), False),
        ("n01-east-side-west", "n01", "n01", "east", "eastWing", "n01.main", handle_range("27DA", "27E6"), True),
        ("n01-east-side-east", "n01", "n01", "east", "eastWing", "n01.main", handle_range("29CE", "29D9") + ["2835"], True),
        ("n01-west-center", "n01", "n02", "west", "main", "n02.westWing", ["2FEC", "2FEB", "2FEE", "2FEF", "286B", "286C", "286D"], True),
        ("n01-east-center", "n01", "n02", "east", "main", "n02.eastWing", ["2533"] + handle_range("2674", "2679"), False),
    ]
    for identifier, owner, source, core, low_kind, high, handles, increasing in straight:
        low = f"{owner}.{low_kind}"
        segment = segment_from(source, identifier + ":flight", handles, "y", increasing, owner, low, high)
        route(identifier, owner, source, core, low, high, [segment])

    # The western basement side graphics overlap closed rooms s133/s135. They
    # are retained as observations of the overhead N01 side runs, not invented
    # extra public connections through the northern room walls.
    for side, handles, room in [("west", ["43F3"] + handle_range("43FC", "4406"), "205E"),
                                ("east", ["27FC", "27FD", "27FF"] + handle_range("2800", "2807"), "2186")]:
        observed = segment_from("p01", f"p01-west-side-{side}-projection", handles, "y", False,
                                "p01", "unresolved", "unresolved")
        observations.append({"id": observed["id"], "build": False, "segment": observed,
                             "sourceRoom": room, "interpretedPhysicalRoute": f"n01-west-side-{side}",
                             "basis": "drawn over enclosed basement room; no demonstrated north connection to basement wing"})

    l_specs = [
        ("west", "west", ["28D3", "28D5", "28D6", "28D7", "28D8"], False,
         ["287E"] + handle_range("28CD", "28D2"), False, (217.485476, 736.563876, 219.786881, 738.743424), None),
        ("west", "east", ["2874", "2876", "2877", "2878", "2879"], True,
         ["281A"] + handle_range("286E", "2873"), False, (226.279275, 736.563876, 228.568956, 738.743424), None),
        ("east", "west", ["2680", "2682", "2683", "2684", "2685"], False,
         ["2585"] + handle_range("267A", "267F"), True, (270.878175, 723.219959, 273.232242, 725.355323), None),
        ("east", "east", ["26E2", "26E1", "26E0", "26DF", "17EF"], True,
         ["26DD"] + handle_range("2E15", "2E19") + ["17EE"], True,
         (279.724637, 723.219959, 282.078702, 725.355323), (723.219959, 725.355323)),
    ]
    for core, side, transverse, x_increasing, longitudinal, y_increasing, landing_bounds, cross in l_specs:
        identifier = f"n02-{core}-side-{side}"
        low, turn, high = f"n02.{core}Wing", identifier + ":turn", "n02.main"
        first = segment_from("n02", identifier + ":cross", transverse, "x", x_increasing, "n02", low, turn, cross)
        long_cross = (279.824637, 282.078702) if (core, side) == ("east", "east") else None
        second = segment_from("n02", identifier + ":long", longitudinal, "y", y_increasing, "n02", turn, high, long_cross)
        plan = route(identifier, "n02", "n02", core, low, high, [first, second])
        weights = [len(first["riserPositions"]), len(second["riserPositions"])]
        plan["turnLevelAllocation"] = {"levelKey": turn, "method": "equal modeled riser height across both L legs", "weights": weights}
        plan["landings"] += stair_surface(identifier + ":turn-surface", box(*landing_bounds), "n02", turn, "n02",
                                           transverse + longitudinal, "corner landing starts at measured terminal nose; adjacent outline differs by up to 44mm without moving any nosing", core)
        if (core, side) == ("east", "east"):
            plan["overlappingWallEntities"] = ["17EE", "1C9C", "17EF", "1C97", "1C9A", "1C9B"]
            plan["doorConnection"] = {"sourceFrameEntities": ["2DFB", "2DFC"], "levelKey": turn,
                                      "closedOpening": [[279.724637, 723.874921], [279.724637, 724.574920]]}
            first["boundaryCoincidentEntities"] = ["17EF"]
            second["boundaryCoincidentEntities"] = ["17EE"]

    u_specs = [
        ("west", ["407A", "27F3", "27F4"] + handle_range("407C", "4082"), True, handle_range("4084", "408C"), False,
         (221.410325, 737.192577, 224.645955, 738.743424)),
        ("east", ["4250", "4251", "4252"] + handle_range("4254", "425A"), False, handle_range("425C", "4264"), True,
         (274.815829, 723.066784, 278.051458, 724.770807)),
    ]
    for core, incoming, inc, outgoing, out_inc, landing_bounds in u_specs:
        identifier = f"n02-n03-{core}-u"
        low, middle, high = "n02.main", f"n03.{core}Wing", "n03.main"
        first = segment_from("n03", identifier + ":lower", incoming, "y", inc, "n02", low, middle)
        second = segment_from("n03", identifier + ":upper", outgoing, "y", out_inc, "n03", middle, high)
        plan = route(identifier, "n02", "n03", core, low, high, [first, second])
        plan["landings"] += stair_surface(identifier + ":middle", box(*landing_bounds), "n03", middle, "n03",
                                           incoming + outgoing, "full U middle landing, not an additional stair tread", core)

    by_plan = {plan["id"]: plan for plan in plans}
    # Walking through an offset narrow doorway need not follow the geometric
    # centre line of a much wider stair. Preserve the CAD opening itself.
    for floor, plan_id, arc in [('n01','n01-east-side-east','283A'),('n02','n02-east-side-east','2DFE')]:
        doors, _ = doors_from_arcs(data[floor]['lines'], data[floor]['arcs'], floor)
        door = next(item for item in doors if item['id'] == f'{floor}-door-{arc}')
        center = (np.asarray(door['hinge']) + np.asarray(door['closedEnd'])) / 2
        plan = by_plan[plan_id]
        flight = plan['segments'][0]
        cross_axis = 0 if flight['axis'] == 'y' else 1
        offset = [0.0, 0.0]
        offset[cross_axis] = round(float(center[cross_axis] - flight['a'][cross_axis]), 6)
        plan['accessPath'] = {'offsetCad': offset, 'sourceFloor': floor, 'sourceDoorId': door['id'],
                              'portalCenterCad': coords([center])[0],
                              'nominalWidth': round(float(np.linalg.norm(np.asarray(door['closedEnd']) - door['hinge'])), 6),
                              'basis': 'walk through measured portal centre without widening the CAD opening'}
        if floor == 'n01':
            plan['accessPath']['offsetCad'] = [0.0,0.0]
            plan['accessPath']['lowerApproachCad'] = [round(float(center[0]),6),round(float(center[1]-0.4),6)]
            plan['accessPath']['viaCad'] = [[round(float(center[0]),6),round(float(center[1]+0.8),6)]]
            upper_door = next(item for item in doors if item['id']=='n01-door-2852')
            upper_center = (np.asarray(upper_door['hinge'])+upper_door['closedEnd'])/2
            plan['accessPath']['upperApproachCad'] = [round(float(upper_center[0]),6),round(float(upper_center[1]+0.4),6)]
            plan['accessPath']['upperPortal'] = {'sourceDoorId':upper_door['id'],'centerCad':coords([upper_center])[0]}
            plan['accessPath']['basis'] = 'enter measured lower portal orthogonally, turn within the wide stair, leave through distinct upper portal; no opening changed'
    # Central plateau plus a north/south connection to the first side nosings.
    wing_landings = [
        ("p01-west-center", "n01", "west", union([box(220.797956, 736.266375, 225.193799, 738.967210), box(217.482448, 738.296658, 228.304416, 738.967210)])),
        ("p01-east-center", "n01", "east", union([box(274.106860, 723.004341, 278.763473, 725.425780), box(270.865858, 723.004341, 282.060371, 723.451376)])),
        ("n01-west-center", "n02", "west", box(220.874369, 736.563876, 225.191787, 738.948992)),
        ("n01-east-center", "n02", "east", box(274.319729, 723.066784, 278.637148, 725.355323)),
    ]
    for plan_id, floor, core, geometry in wing_landings:
        plan = by_plan[plan_id]
        plan["landings"] += stair_surface(f"{floor}-{core}-wing-landing", geometry, floor, f"{floor}.{core}Wing",
                                           plan["sourceFloor"], plan["segments"][0]["sourceEntities"],
                                           "central arrival plateau connected to side-flight first edges and wing threshold", core)

    main_bounds = {
        ("p01", "west"): (217.482448, 734.45, 228.583293, 734.714841),
        ("p01", "east"): (270.865858, 727.034893, 282.078702, 727.363),
        ("n01", "west"): (217.482448, 734.45, 228.304416, 734.878322),
        ("n01", "east"): (270.865858, 726.953149, 282.078702, 727.363),
        ("n02", "west"): (217.485476, 734.45, 228.727911, 734.878322),
        ("n02", "east"): (270.878175, 727.040879, 282.078702, 727.388270),
        ("n03", "west"): (221.410325, 734.575113, 224.645955, 734.878322),
        ("n03", "east"): (274.815829, 727.085061, 278.051458, 727.388270),
    }
    for (floor, core), bounds in main_bounds.items():
        key = f"{floor}.main"
        geometry = box(*bounds)
        for plan in plans:
            for flight in plan["segments"]:
                if plan["coreId"] == core and flight["lowerLevelKey"] == key:
                    geometry = geometry.difference(box(*flight["bounds"]))
                if plan["coreId"] == core and flight["upperLevelKey"] == key:
                    geometry = geometry.difference(box(*flight["bounds"]))
        host = next(plan for plan in plans if plan["coreId"] == core and any(f["ownerFloor"] == floor for f in plan["segments"]))
        host["landings"] += stair_surface(f"{floor}-{core}-main-landing", geometry, floor, key, floor,
                                           [], "main landing within core; actual rising flight footprints excluded", core)
    # Basement east has a real open lower corridor, unlike the closed west rooms.
    by_plan["p01-east-side-west"]["landings"] += stair_surface("p01-east-lower-landing", box(270.976271, 723.134095, 281.922273, 724.108775),
        "p01", "p01.eastWing", "p01", ["1FCC", "1FD5"], "shared open edge s193/s191d, not a wall crossing", "east")
    levels = interior_level_map(plans)
    for plan in plans:
        keys = {key for flight in plan["segments"] for key in (flight["lowerLevelKey"], flight["upperLevelKey"])}
        keys.update(landing["levelKey"] for landing in plan["landings"])
        plan["heightEstimates"] = {key: levels[key] for key in sorted(keys)}
    return {"plans": plans, "observations": observations, "levels": levels}


# These are source room faces, not new coordinate guesses. Each seam lies in
# their intervening wall/neck; connected stair landing polygons are separate.
WING_SEAM_ROOMS = {
    "p01": {"west": ("1FEE", "2081"), "east": ("1F1E", "1EE0")},
    "n01": {"west": ("1F0A", "2131"), "east": ("20D0", "portal:283A")},
    "n02": {"west": ("1FF2", "20BE"), "east": ("2001", "2037")},
    "n03": {"west": ("1F1B", "2016"), "east": ("1EF6", "1EC6")},
}
WING_WALL_COVER = {"p01": 0.50, "n01": 0.40, "n02": 0.28, "n03": 0.28}


def height_region_models(data, interior, structural, exterior_voids=()):
    """Room-connected wing masks preserve whole main rooms and explicit portals."""
    result = {}
    for floor in FLOORS:
        source = "n03" if floor == "n04" else floor
        drawing = data[source]
        rooms = {room["sourceEntity"]: room for room in drawing["rooms"]}
        xmin, ymin, xmax, ymax = drawing["roomUnion"].bounds
        zones = []
        for side in ("west", "east"):
            main_id, wing_id = WING_SEAM_ROOMS[source][side]
            main_face = rooms[main_id]["geometry"].bounds[3 if side == "west" else 1]
            if wing_id.startswith("portal:"):
                route = next(plan for plan in interior["plans"] if plan["id"] == "n01-east-side-east")
                wing_face = route["accessPath"]["portalCenterCad"][1]
            else:
                wing_face = rooms[wing_id]["geometry"].bounds[1 if side == "west" else 3]
            seam = round((main_face + wing_face) / 2, 6)
            selected = [room for room in drawing["rooms"] if
                        ((room["geometry"].representative_point().x < 250 and room["geometry"].representative_point().y > seam)
                         if side == "west" else
                         (room["geometry"].representative_point().x > 250 and room["geometry"].representative_point().y < seam))]
            if not selected:
                raise ValueError(f"No source wing rooms for {floor}/{side}")
            selected_ids = {room["sourceEntity"] for room in selected}
            originals = union([room["geometry"] for room in selected])
            half_plane = (box(xmin-6, seam, xmax+6, ymax+6) if side == "west" else
                          box(xmin-6, ymin-6, xmax+6, seam))
            # Coverage margin only assigns heights to existing source walls;
            # it never adds wall/floor geometry. Output masks are clipped to
            # the final envelope. Narrow upper wings use their own room shape.
            body_x = (box(xmin-6, ymin-6, 228.95, ymax+6) if side == "west" else
                      box(270.50, ymin-6, xmax+6, ymax+6))
            body = union([half_plane.intersection(body_x), originals,
                          originals.buffer(WING_WALL_COVER[source], join_style=2).intersection(half_plane)])
            connected = []
            connection_sources = []
            if floor != "n04":
                for feature in connected_portal_regions(floor, drawing):
                    if feature["levelKey"] == f"{floor}.{side}Wing":
                        connected.append(feature["geometry"])
                        connection_sources.append({key: value for key,value in feature.items() if key != "geometry"})
                for room in structural["rooms"]:
                    if room["floor"] == floor and room["levelKey"] == f"{floor}.{side}Wing":
                        connected.append(room["geometry"])
                        selected_ids.add(room["sourceEntity"])
                for plan in interior["plans"]:
                    for landing in plan["landings"]:
                        if landing["ownerFloor"] == floor and landing["levelKey"] == f"{floor}.{side}Wing":
                            source_polygons = landing.get("sourcePolygons", [{"loops": landing["loops"]}])
                            connected.extend(Polygon(p["loops"][0], p["loops"][1:]).buffer(2*PRECISION, join_style=2)
                                             for p in source_polygons)
                if side == "east" and floor in ("p01", "n01"):
                    connected.extend(void["geometry"].buffer(0.40, join_style=2) for void in exterior_voids)
                if side == "east" and floor in ("n02", "n03"):
                    for item in connected_bay_regions(floor, drawing):
                        connected.append(item["geometry"].buffer(2*PRECISION, join_style=2))
                        connection_sources.append({key:value for key,value in item.items() if key!='geometry'})
            # N01 room 13 is a measured overlap with the lower stair entry;
            # its 283A portal is assigned only by the actual connected landing.
            protected = [room for room in drawing["rooms"] if room["sourceEntity"] not in selected_ids
                         and not room["id"].endswith(("92", "93"))
                         and not (source == "n01" and room["sourceEntity"] == "20E2")]
            geometry = clean(union([body] + connected).difference(union([room["geometry"] for room in protected])))
            zones.append({"id": side, "levelKey": f"{floor}.{side}Wing", "geometry": geometry,
                          "occupiedGeometry": union([originals] + connected),
                          "junctionCoordinate": seam, "junctionSourceEntities": [main_id, wing_id],
                          "sourceRoomEntities": sorted(selected_ids), "sourceFloor": source,
                          "connectedSourceFeatures": connection_sources,
                          "wallCoverageMargin": WING_WALL_COVER[source],
                          "basis": "bounded body wing beyond the source separating wall, attached source rooms and explicit stair/portal footprints; ordinary main room interiors excluded"})
        result[floor] = {"zones": zones, "geometry": union([zone["geometry"] for zone in zones])}
    return result


def zone_level_key(floor, point, region_model):
    for zone in region_model["zones"]:
        if zone["geometry"].covers(point):
            return zone["levelKey"]
    return f"{floor}.main"


def opening_ceiling_bound(floor, bridge, owner_key, region_model):
    """An opening through a shared wall cannot penetrate either adjacent slab."""
    keys = {owner_key}
    for zone in region_model["zones"]:
        # Bounded body masks also cover exterior air. Only an actual room or
        # connected landing/bay supplies an adjacent occupied-zone ceiling.
        occupied = zone.get("occupiedGeometry", zone["geometry"])
        if bridge.buffer(.02, join_style=2).intersection(occupied).area > MIN_AREA:
            keys.add(zone["levelKey"])
    if bridge.difference(region_model["geometry"]).area > MIN_AREA:
        keys.add(floor + ".main")
    heights = [ceiling_height(key) for key in keys]
    if any(value is None for value in heights):
        raise ValueError("Opening overlaps an open roof zone")
    return min(heights), sorted(keys)


def serialized_wing_regions(region_model, envelope):
    return [{key: value for key, value in zone.items() if key not in ("geometry", "occupiedGeometry")}
            | {"loops": [coords(list(poly.exterior.coords)[:-1])] + [coords(list(ring.coords)[:-1]) for ring in poly.interiors]}
            for zone in region_model["zones"] for poly in polygons(clean(zone["geometry"].intersection(envelope)))]


def roof_transitions(roof, region_model, thickness=0.15):
    """Vertical closures follow the actual high/low roof intersection exactly."""
    main = clean(roof.difference(region_model["geometry"]))
    result = []
    def lines(geometry):
        if geometry.geom_type == "LineString":
            yield geometry
        elif hasattr(geometry, "geoms"):
            for part in geometry.geoms:
                yield from lines(part)
    for zone in region_model["zones"]:
        wing = clean(roof.intersection(zone["geometry"]))
        shared = main.boundary.intersection(wing.boundary)
        for line in lines(shared):
            for a, b in zip(line.coords, list(line.coords)[1:]):
                if math.dist(a, b) <= PRECISION:
                    continue
                result.append({"id": f"roof-{zone['id']}-transition-{len(result):03d}", "a": coords([a])[0], "b": coords([b])[0],
                               "lowerLevelKey": zone["levelKey"], "upperLevelKey": "n04.main", "thickness": thickness,
                               "basis": "shared boundary of separately estimated source roof zones; vertical closure thickness estimated"})
    return result


def source_wall_band(data, handles):
    by_id = {line.id: line for line in data["lines"]}
    if any(handle not in by_id or by_id[handle].layer != STRONG for handle in handles):
        raise ValueError(f"Missing under-stair strong edges: {handles}")
    lines = [by_id[handle] for handle in handles]
    return clean(unary_union([line.line for line in lines]).convex_hull)


def under_stair_metadata(data, interior):
    plans = {plan["id"]: plan for plan in interior["plans"]}
    levels = interior["levels"]
    masks, rooms = [], []

    def mask(identifier, floor, geometry, bottom_key, ceiling, source_entities, basis, top=None, minimum_bottom=None):
        if geometry.is_empty:
            return
        masks.append({"id": identifier, "floor": floor, "geometry": clean(geometry),
                      "bottomLevelKey": bottom_key, "bottom": max(levels[bottom_key], minimum_bottom) if minimum_bottom is not None else levels[bottom_key],
                      "minimumBottom": minimum_bottom,
                      "top": ceiling_height(bottom_key) if top is None else top,
                      "ceilingPlane": ceiling, "planeSpace": "CAD XY metres, model Z",
                      "sourceEntities": source_entities, "basis": basis})

    # Support pairs at the end of the incoming centers: split at the final
    # measured nose, preserving the landing-side cap and the flight-side soffit.
    for core, handles in [("west", ["189E", "189F"]), ("east", ["13DF", "13E0"])]:
        flight = plans[f"p01-{core}-center"]["segments"][0]
        band = source_wall_band(data["p01"], handles)
        end_y = flight["b"][1]
        beyond = box(200, end_y, 300, 800) if flight["ascendingDirection"] == "increasing" else box(200, 650, 300, end_y)
        cap = band.intersection(beyond)
        slope = band.difference(beyond)
        base = f"p01.{core}Wing"
        mask(f"p01-{core}-center-bearing-cap", "p01", cap, base,
             [0, 0, levels[f"n01.{core}Wing"] - SLAB_THICKNESS], handles, "measured support pair below upper landing; flat cap")
        mask(f"p01-{core}-center-bearing-soffit", "p01", slope, base,
             stair_soffit_plane(flight, levels=levels), handles, "same measured support pair on approach side of terminal nose; sloping underside")

    # The northern enclosure behind the first N01 side nose belongs below the
    # lower wing landing, not to a free-standing full-height barrier above it.
    north_band = source_wall_band(data["p01"], ["1B5C", "1B5D"])
    return_edge = next(line for line in data['p01']['lines'] if line.id == '444E' and line.layer == WEAK)
    flight = plans['n01-west-side-west']['segments'][0]
    below_landing = box(flight['bounds'][0], min(return_edge.a[1],return_edge.b[1]),
                        flight['bounds'][2], north_band.bounds[3])
    mask("p01-s133-north-cap", "p01", union([north_band,below_landing]),
         "p01.main", [0, 0, levels["n01.westWing"] - SLAB_THICKNESS], ["1B5C", "1B5D", "444E"],
         "north enclosure and its measured return below the N01 lower landing; no full-height strip between first nose and northern pair")

    room_by_entity = {room["sourceEntity"]: room for room in data["p01"]["rooms"]}
    for room_handle, level_key, route_id, basis in [
        ("205E", "p01.main", "n01-west-side-west", "s133 enclosed basement room below projected N01 side flight"),
        ("2186", "p01.main", "n01-west-side-east", "s135 enclosed basement room below projected N01 side flight"),
        ("217D", "p01.main", None, "s134 accessed from the same southern basement corridor"),
        ("208C", "p01.westWing", None, "s144 doors 5604/5603 and 561E/561D connect directly to s142/s145 without drawn steps"),
        ("1FD5", "p01.eastWing", None, "s191d shares the complete open southern edge of s193"),
    ]:
        if room_handle not in room_by_entity:
            raise ValueError(f"Missing preserved under-stair room {room_handle}")
        room = room_by_entity[room_handle]
        rooms.append({"id": room["id"], "floor": "p01", "sourceEntity": room_handle,
                      "geometry": room["geometry"], "levelKey": level_key, "height": levels[level_key], "basis": basis})
        if route_id:
            flight = plans[route_id]["segments"][0]
            geometry = box(*flight["bounds"]).intersection(room["geometry"].buffer(0.2))
            evidence = [line.id for line in data["p01"]["lines"] if line.layer == STRONG and line.line.intersection(geometry).length > 0.03]
            mask(f"p01-{room['id']}-overhead-soffit", "p01", geometry, level_key,
                 stair_soffit_plane(flight, levels=levels), evidence + [room_handle], basis + "; wall plan retained under sloping soffit")

    # The flat upper central plateau overlies s144. Limit the mask to the
    # plateau and this particular room, rather than moving the entire core.
    room = room_by_entity["208C"]
    plateau = box(220.797956, 736.266375, 225.193799, 738.967210)
    geometry = plateau.intersection(room["geometry"].buffer(0.2))
    evidence = [line.id for line in data["p01"]["lines"] if line.layer == STRONG and line.line.intersection(geometry).length > 0.03]
    mask("p01-s144-landing-enclosure", "p01", geometry, "p01.westWing",
         [0, 0, levels["n01.westWing"] - SLAB_THICKNESS], evidence + ["208C", "21F8"],
         "door-connected wing room under the upper central plateau; preserves s144 rather than erasing its overlap with s192")

    # The north edge of 137 overlaps the terminal part of the L return. Its
    # separate side doorway lies on the intermediate turn landing.
    flight = plans["n02-east-side-east"]["segments"][1]
    turn_key = flight["lowerLevelKey"]
    north_support = source_wall_band(data["n02"], ["17EE", "1C9C"])
    lower_lines = {line.id: line for line in data["n01"]["lines"]}
    jambs = [lower_lines[handle] for handle in ["1603", "1602"]]
    if any(abs(jamb.a[0]-jamb.b[0]) > PRECISION for jamb in jambs):
        raise ValueError("N01 portal 2852 no longer matches its measured vertical jambs")
    left,right = sorted((jamb.a[0]+jamb.b[0])/2 for jamb in jambs)
    # The historical floor drawings differ locally by5–12mm in Y. Register
    # only the measured portal width through this specific100mm support pair;
    # never widen the doorway or cut an unrelated upper-floor wall.
    portal_support = clean(north_support.intersection(box(left,north_support.bounds[1],right,north_support.bounds[3])))
    if portal_support.is_empty:
        raise ValueError("The documented N01 doorway does not meet the N02 support")
    _,door_head = opening_vertical_span("door",levels["n01.main"],ceiling_height("n01.main"))
    mask("n02-137-north-support", "n02", north_support.difference(portal_support), turn_key,
         stair_soffit_plane(flight, levels=levels), ["17EE", "1C9C"], "north support under the L exit, not a full-height obstacle",
         top=ceiling_height("n02.main"))
    mask("n02-137-support-above-n01-2852", "n02", portal_support, turn_key,
         stair_soffit_plane(flight, levels=levels), ["17EE", "1C9C", "1603", "1602", "2852"],
         "preserve the measured lower N01 doorway through the overlapping N02 support; doorway height remains the shared model estimate",
         top=ceiling_height("n02.main"),minimum_bottom=door_head)
    mask("n02-137-door-side", "n02", box(279.724637, 723.219959, 279.824637, 727.040879), turn_key,
         [0, 0, ceiling_height("n02.main")], ["17EF", "1C97", "1C9A", "1C9B", "2DFB", "2DFC"],
         "side enclosure and doorway start at the measured L turn, next main slab underside retained", top=ceiling_height("n02.main"))
    cross = plans['n02-east-side-east']['segments'][0]
    mask('n01-below-n02-east-cross', 'n01', source_wall_band(data['n01'],['15FD','1600']).intersection(box(*cross['bounds'])),
         'n01.main', stair_soffit_plane(cross,levels=levels), ['15FD','1600'] + cross['sourceEntities'],
         'lower-floor side support ends at the measured upper L flight soffit; not a wall through the next staircase')
    return {"masks": masks, "rooms": rooms,
            "doorOverrides": [{"floor": "n02", "sourceArc": "2DFE", "levelKey": turn_key,
                               "ceilingLevelKey": "n02.main",
                               "basis": "closed opening 2DFB/2DFC is crossed by the L route at its turn landing"}]}


def apply_under_stair_walls(wall, openings, floor, structural):
    """Split only measured masks; keep every remaining wall footprint intact."""
    result, remaining = [], wall
    for mask in structural.get("masks", []):
        if mask["floor"] != floor:
            continue
        piece = clean(remaining.intersection(mask["geometry"]))
        remaining = clean(remaining.difference(mask["geometry"]))
        for solid in wall_bands(piece, openings, mask["bottom"], mask["top"], mask["id"]):
            plane = mask["ceilingPlane"]
            heights = [plane[0] * x + plane[1] * y + plane[2] for ring in solid["loops"] for x, y in ring]
            if max(heights, default=-math.inf) <= solid["bottom"] + 1e-6:
                continue
            solid["ceilingPlane"] = plane
            solid["ceilingMaskId"] = mask["id"]
            solid["ceilingSourceEntities"] = mask["sourceEntities"]
            solid["heightBasis"] = mask["basis"]
            result.append(solid)
    return remaining, result


def exterior_support_masks(data, exterior):
    """Only the measured s146 enclosure parts beneath the real N01 entry route."""
    route = next(plan for plan in exterior["plans"] if plan["id"] == "exterior-main-east")
    if len(route["segments"]) != 1:
        raise ValueError("s146 support requires the identified single measured entry flight")
    pairs = [["1D2", "1D3"], ["1D4", "1D5"], ["1D6", "1D7"]]
    # A hull around all six edges would also cover the room. Each measured
    # wall pair is bounded separately before they are joined into the C shape.
    enclosure = union([source_wall_band(data["p01"], pair) for pair in pairs])
    levels = exterior["levels"]
    surfaces = edge_soffit_masks(route["segments"][0], levels)
    for landing in route["landings"]:
        if landing["levelKey"] != route["upperLevelKey"]:
            continue
        surfaces.append({"id": landing["id"] + "-soffit", "geometry": Polygon(landing["loops"][0], landing["loops"][1:]),
                         "ceilingPlane": [0, 0, levels[landing["levelKey"]] - SLAB_THICKNESS],
                         "sourceEntities": landing["sourceEntities"], "basis": "flat underside of actual upper entry landing"})
    result = []
    for surface in surfaces:
        geometry = clean(enclosure.intersection(surface["geometry"]))
        if geometry.is_empty:
            continue
        result.append({"id": "p01-s146-" + surface["id"], "floor": "p01", "geometry": geometry,
                       "bottom": levels["p01.main"], "top": levels[route["upperLevelKey"]] - SLAB_THICKNESS,
                       "ceilingPlane": surface["ceilingPlane"], "planeSpace": "CAD XY metres, model Z",
                       "sourceEntities": [handle for pair in pairs for handle in pair] + surface["sourceEntities"],
                       "sourceRoomEntity": "1EC6", "sourceWallPairs": pairs,
                       "basis": "measured P01 s146 enclosure retained only below the actual N01 entry flight/landing soffit; estimated levels are derived, not measured"})
    return result


WING_FACADE_RUNS = (
    ("west-west", 218.510, 740.94, 755.89), ("west-east", 227.728, 740.94, 755.89),
    ("east-west", 271.885, 705.98, 720.94), ("east-east", 281.104, 705.98, 720.94),
)
WING_FACADE_PROFILES = {"n02": (0.30, 3.05), "n03": (0.10, 3.15)}
JAMB_SOURCE_PAIRS = {
    "n02": {"2753": ("1864", "1865"), "276A": ("1868", "1869")},
    "n03": {"22CE": ("E57", "E58"), "22E5": ("E5B", "E5C")},
}
SHARED_RETURN_WINDOWS = {"n02": {"274A", "274E"}, "n03": {"22C5", "22C9"}}


def wing_facade_window_profile(floor, window):
    """Only the four measured external longitudinal pane runs, never all wing XY."""
    if floor not in WING_FACADE_PROFILES:
        return None
    a, b = np.asarray(window["a"]), np.asarray(window["b"])
    if abs(a[0] - b[0]) > 0.01:
        return None
    for side, x, ymin, ymax in WING_FACADE_RUNS:
        if max(abs(a[0]-x), abs(b[0]-x)) <= 0.02 and min(a[1],b[1]) >= ymin and max(a[1],b[1]) <= ymax:
            sill, head = WING_FACADE_PROFILES[floor]
            return {"id": f"ipr2023-{floor}-wing-tall", "facadeRun": side, "sill": sill, "head": head,
                    "lowerInfillHeight": 0.75,
                    "basis": "IPR Praha summer 2023 exterior framed rows; vertical bands interpreted with variant C, not a measured interior section",
                    "infillBasis": "material interpretation of light lower fields; IPR does not resolve opaque panel versus frosted glass"}
    return None


def explicit_jamb_span(floor, door, lines):
    pair = next((pair for arc, pair in JAMB_SOURCE_PAIRS.get(floor, {}).items() if arc in door["sourceEntities"]), None)
    if pair is None:
        return None
    by_id = {line.id: line for line in lines}
    if any(handle not in by_id or by_id[handle].layer != STRONG for handle in pair):
        raise ValueError("Missing measured narrow jamb " + str(pair))
    a, b = np.asarray(door["hinge"]), np.asarray(door["closedEnd"])
    direction = (b-a) / np.linalg.norm(b-a)
    normal = np.array([-direction[1], direction[0]])
    selected = [by_id[handle] for handle in pair]
    if any(abs(float(np.dot(line.direction, direction))) < .999 for line in selected):
        raise ValueError("Jamb evidence does not follow the door opening")
    offsets = [float(np.dot(point-a,normal)) for line in selected for point in (line.a,line.b)]
    low, high = min(offsets), max(offsets)
    if abs(high-low-.10) > .002 or min(abs(low),abs(high)) > .002:
        raise ValueError("Changed source geometry for measured 0.10m jamb")
    return low, high, list(pair)


def connected_bay_regions(floor, data):
    if floor not in JAMB_SOURCE_PAIRS:
        return []
    by_id = {line.id: line for line in data["lines"]}
    rear_ids = ["2745", "2746", "2747"] if floor == "n02" else ["22C0", "22C1", "22C2"]
    front_ids = sorted({handle for pair in JAMB_SOURCE_PAIRS[floor].values() for handle in pair})
    if any(handle not in by_id for handle in front_ids + rear_ids):
        raise ValueError("Missing source boundaries of connected shallow bay")
    points = [point for handle in rear_ids for point in (by_id[handle].a, by_id[handle].b)]
    front_x = min(point[0] for handle in front_ids for point in (by_id[handle].a, by_id[handle].b))
    shape = box(front_x, min(point[1] for point in points), max(point[0] for point in points), max(point[1] for point in points))
    return [{"id": floor + "-connected-bay", "geometry": shape, "levelKey": floor + ".eastWing",
             "sourceEntities": front_ids + rear_ids, "basis": "measured jamb-to-rear closure footprint; connected wing room, purpose unconfirmed"}]


def connected_portal_regions(floor, data):
    definitions = {
        "n01": [("east", ["1854", "1855", "1856", "1857", "1858", "1859", "185A", "185B"], .01,
                  "attached vestibule of doors28D2/28EB; measured perimeter outside the body X bound")],
        "n02": [("east", ["14F3", "14F6"], 2*PRECISION, "measured wall-depth passage from191c to central wing landing")],
        "n03": [("west", ["1100", "1101"], 2*PRECISION, "open passage between292 and291b, no additional drawn step"),
                ("east", ["B6A", "B6D"], 2*PRECISION, "door-lined wall-depth passage from291c to U landing")],
    }
    by_id = {line.id: line for line in data["lines"]}
    result = []
    for side, handles, tolerance, basis in definitions.get(floor, []):
        if any(handle not in by_id or by_id[handle].layer != STRONG for handle in handles):
            raise ValueError("Missing connected portal perimeter " + str(handles))
        geometry = unary_union([by_id[handle].line for handle in handles]).convex_hull.buffer(tolerance,join_style=2)
        result.append({"id": floor+"-"+side+"-portal-region", "levelKey": floor+"."+side+"Wing",
                       "geometry": clean(geometry), "sourceEntities": handles, "basis": basis})
    return result


def opening_cut(a, b, low, high, measured_span=False):
    # The four measured shallow-bay jambs must not cut their separate rear
    # boundary 0.66-0.80m away. Their adjacent measured return windows are
    # similarly limited to the wall, not the rear bay. Other cuts are unchanged.
    return oriented_rectangle(a, b, low-.008 if measured_span else -.72,
                              high+.008 if measured_span else .72, extend=.008)


SHALLOW_BAY_SOURCES = {
    "n02": ("2750", "2747", ["2745", "2746", "2747", "2750"]),
    "n03": ("22CB", "22C2", ["22C0", "22C1", "22C2", "22CB"]),
}


def shallow_bay_voids(floor, data):
    """The space between the measured front jamb and inner rear is not masonry."""
    if floor not in SHALLOW_BAY_SOURCES:
        return []
    front_id, rear_id, evidence = SHALLOW_BAY_SOURCES[floor]
    by_id = {line.id: line for line in data["lines"]}
    if any(handle not in by_id for handle in evidence):
        raise ValueError("Missing shallow bay boundaries in " + floor)
    front, rear = by_id[front_id], by_id[rear_id]
    if max(abs(front.a[0]-front.b[0]), abs(rear.a[0]-rear.b[0])) > .001:
        raise ValueError("Changed shallow bay orientation in " + floor)
    front_x, rear_x = float(front.a[0]), float(rear.a[0])
    ymin, ymax = sorted([float(rear.a[1]), float(rear.b[1])])
    if not .50 < rear_x-front_x < .65 or not 1.4 < ymax-ymin < 1.7:
        raise ValueError("Changed shallow bay extent in " + floor)
    return [{"id": floor + "-shallow-bay", "geometry": clean(box(front_x, ymin, rear_x, ymax)),
             "frontX": front_x, "rearX": rear_x, "sourceEntities": evidence,
             "basis": "measured free space between the 0.10m front jamb and inner rear closure; purpose unconfirmed"}]


def clear_shallow_bay_walls(wall, bays):
    # Run after inferred walls, junction repairs and opening bridges: none may
    # refill this explicit source void. Slabs are deliberately not cut here.
    return clean(wall.difference(union([bay["geometry"] for bay in bays]))) if bays else wall


def annotate_shallow_bay_approach(floor, door, bays):
    if not set(door["sourceEntities"]) & set(JAMB_SOURCE_PAIRS.get(floor, {})):
        return
    if len(bays) != 1:
        raise ValueError("Missing shallow bay for measured jamb " + door["id"])
    a, b = np.asarray(door["hinge"]), np.asarray(door["closedEnd"])
    direction = (b-a) / np.linalg.norm(b-a)
    normal = np.array([-direction[1], direction[0]])
    if abs(normal[0]) < .999:
        raise ValueError("Changed shallow bay door normal " + door["id"])
    boundary = [None, None]
    boundary[1 if normal[0] > 0 else 0] = [round(bays[0]["rearX"], 6), round(float((a[1]+b[1])/2), 6)]
    door["approachBoundaryCad"] = boundary
    door["approachBasis"] = "measured inner rear closure limits only the +CAD X approach; doorway and rear wall retained"
    door["accessClassification"] = "shallow-bay"


EXPOSED_N01_ROOF_ROOMS = {
    "west": ["2131", "213A", "2143", "214C", "2155", "2160", "216D"],
    "east": ["20F8", "210E"],
}


def exposed_roof_seeds(data):
    rooms = {room["sourceEntity"]: room for room in data["rooms"]}
    features = connected_portal_regions("n01", data)
    result = []
    for side, handles in EXPOSED_N01_ROOF_ROOMS.items():
        if any(handle not in rooms for handle in handles):
            raise ValueError("Missing occupied N01 roof source rooms: " + side)
        attached = [feature for feature in features if feature["levelKey"] == "n01." + side + "Wing"]
        result.append({"id": "n01-" + side + "-exposed-roof", "levelKey": "n02." + side + "Wing",
                       "geometry": union([rooms[handle]["geometry"] for handle in handles] + [f["geometry"] for f in attached]),
                       "sourceRoomEntities": handles,
                       "sourceAttachedEntities": sorted({handle for feature in attached for handle in feature["sourceEntities"]})})
    return result


def occupied_roof_extension(seed, wall, lower_footprint, upper_footprint, exclusions, covered_landings):
    """Close only occupied lower rooms and their existing measured perimeter."""
    # This margin selects existing masonry; it is never added as roof area.
    adjacent_wall = wall.intersection(seed.buffer(WING_WALL_COVER["n01"], join_style=2))
    support = union([seed, adjacent_wall]).intersection(lower_footprint)
    return clean(support.difference(union([upper_footprint, exclusions, covered_landings])))


def exposed_wing_roofs(data, lower, upper, interior, exterior, exterior_voids):
    voids = [void["geometry"] for void in exterior_voids]
    voids += [Polygon(item["loops"][0], item["loops"][1:]) for item in exterior["terrainCutouts"]]
    exclusions = union([lower["holes"], upper["holes"]] + voids)
    levels = {**interior["levels"], **exterior["levels"]}
    landings = [landing for plan in interior["plans"] + exterior["plans"] for landing in plan["landings"]]
    solids, audit = [], []
    for seed in exposed_roof_seeds(data):
        top = stair_level_height(seed["levelKey"])
        bottom = round(top-SLAB_THICKNESS, 6)
        covered = union([Polygon(item["loops"][0], item["loops"][1:]) for item in landings
                         if abs(levels[item["levelKey"]]-top) < 1e-6])
        geometry = occupied_roof_extension(seed["geometry"], lower["roofEligibleWall"],
            lower["footprint"], upper["footprint"], exclusions, covered)
        parts = serialize_solids(geometry, seed["id"], "slab", bottom, top, "roof")
        evidence = {key: value for key, value in seed.items() if key != "geometry"}
        evidence.update({"sourceFloor": "n01", "upperFloor": "n02", "bottom": bottom, "top": top,
                         "basis": "occupied historical N01 footprint beyond N02, with measured perimeter; ceiling height and thickness are variant C estimates"})
        for solid in parts:
            solid["roofClosure"] = evidence
        solids.extend(parts)
        audit.append({**evidence, "area": round(geometry.area, 6), "solidCount": len(parts),
                      "excludedStairVoidOverlap": round(geometry.intersection(exclusions).area, 9),
                      "existingLandingOverlap": round(geometry.intersection(covered).area, 9)})
    return solids, audit


def main_roof_parapet(main_roof, thickness=.15, height=.40, cap_thickness=.04):
    if not 0 < cap_thickness < height or thickness <= 0:
        raise ValueError("Invalid roof edge profile")
    bands = []
    for poly in polygons(main_roof):
        outer = Polygon(poly.exterior)
        bands.append(outer.difference(outer.buffer(-thickness, join_style=2)).intersection(poly))
    ring = union(bands)
    base = stair_level_height("n04.main")
    solids = serialize_solids(ring, "n04-main-parapet", "parapet", base, base+height-cap_thickness, "plaster")
    solids += serialize_solids(ring, "n04-main-parapet-cap", "parapet-cap", base+height-cap_thickness, base+height, "concrete")
    for solid in solids:
        solid["heightBasis"] = "IPR Praha summer 2023 raised main roof edge; modeled crest +0.40m, inward thickness0.15m and cap0.04m estimated"
        solid["sourceRoofLevelKey"] = "n04.main"
    return solids


def prepare_floor(identifier, data, lowered_region, previous_footprint=None, shared_exterior_voids=(), interior=None, structural=None, west=None, exterior=None, region_model=None):
    elevation = FLOORS[identifier]
    interior = interior or {"plans": [], "levels": {}}
    structural = structural or {"masks": [], "rooms": [], "doorOverrides": []}
    region_model = region_model or {"geometry": lowered_region, "zones": [{"id": "west", "levelKey": identifier+".westWing", "geometry": lowered_region}]}
    cores = stair_cores(identifier)
    for core in cores:
        suffix = "92" if core["id"] == "west" else "93"
        measured = [r for r in data["rooms"] if r["id"].endswith(suffix)]
        core["roomPolygons"] = [{"id": room["id"], "bounds": list(p.bounds),
                                 "loops": [coords(list(p.exterior.coords)[:-1])] + [coords(list(h.coords)[:-1]) for h in p.interiors]}
                                for room in measured for p in polygons(room["geometry"])]
    started = time.monotonic()
    exterior_plans = exterior_stair_plans(identifier, data['lines'])
    exterior_graphics = exterior_stair_graphic_ids(data['lines'], exterior_plans)
    west_excluded = west_exterior_exclusions(identifier) if west else set()
    new_exterior_graphics = NEW_EXTERIOR_GRAPHICS.get(identifier, set()) if exterior else set()
    construction_lines = [line for line in data['lines'] if line.id not in exterior_graphics | west_excluded | new_exterior_graphics]
    room_conflicts = []
    wall, paired, pair_count = pair_walls(construction_lines, data["roomUnion"], room_conflicts)
    print(f"{identifier}: paired walls in {time.monotonic() - started:.1f}s", flush=True)
    wall, corrections = explicit_corrections(identifier, construction_lines, wall)
    wall, fallback, unresolved = inferred_boundary_walls(construction_lines, wall, data["roomUnion"], cores)
    corrections.extend(fallback)
    wall, junction_repairs = close_wall_junctions(construction_lines, wall, data["roomUnion"])
    protective_profiles = n01_protective_profiles(identifier, data["lines"], data["roomUnion"])
    exterior_voids = exterior_void_profiles(protective_profiles, data["roomUnion"], lowered_region)
    exterior_exits = exterior_stair_exit_masks(protective_profiles, exterior_voids)
    exterior_exit_mask = union([item['geometry'] for item in exterior_exits])
    protective_mask = union([profile["geometry"] for profile in protective_profiles])
    # The measured protective outlines also establish their corner blocks;
    # their material region is a thin L/U profile, never the enclosed void.
    wall = union([wall, protective_mask])
    shallow_bays = shallow_bay_voids(identifier, data)
    doors, door_corrections = doors_from_arcs(data["lines"], data["arcs"], identifier)
    for door in doors:
        classify_facade_opening(identifier, door)
        annotate_shallow_bay_approach(identifier, door, shallow_bays)
    windows, duplicate_windows = windows_from_lines(data["lines"], identifier)
    corrections.extend(door_corrections)
    openings = []
    for kind, descriptions in [("door", doors), ("window", windows)]:
        for item in descriptions:
            a, b = (item["hinge"], item["closedEnd"]) if kind == "door" else (item["a"], item["b"])
            midpoint = Point((np.asarray(a) + np.asarray(b)) / 2)
            level_key = zone_level_key(identifier, midpoint, region_model)
            reference = stair_level_height(level_key)
            ceiling_key = level_key
            item["levelKey"] = level_key
            for override in structural["doorOverrides"]:
                if kind == "door" and override["floor"] == identifier and override["sourceArc"] in item["sourceEntities"]:
                    reference = interior["levels"][override["levelKey"]]
                    item["levelKey"] = override["levelKey"]
                    item["levelBasis"] = override["basis"]
                    ceiling_key = override.get("ceilingLevelKey", identifier + ".main")
            low, high, basis = opening_wall_span(a, b, wall, 0.13 if kind == "door" else 0.37)
            jamb = explicit_jamb_span(identifier, item, data["lines"]) if kind == "door" else None
            if jamb is not None:
                low, high, item["depthSourceEntities"] = jamb
                basis = "explicit measured 0.10m jamb; rear bay closure is a separate boundary"
            bridge = oriented_rectangle(a, b, low, high, extend=0.008)
            profile = wing_facade_window_profile(identifier, item) if kind == "window" else None
            if profile and not item["levelKey"].endswith("Wing"):
                raise ValueError("Measured tall wing facade assigned outside its wing zone: " + item["id"])
            ceiling, item["ceilingLevelKeys"] = opening_ceiling_bound(identifier, bridge, ceiling_key, region_model)
            item["bottom"], item["top"] = opening_vertical_span(kind, reference, ceiling,
                profile["sill"] if profile else .9, profile["head"] if profile else 2.4)
            item["requestedTop"] = round(reference + (2.1 if kind == "door" else profile["head"] if profile else 2.4), 6)
            item["ceilingClipped"] = item["top"] < item["requestedTop"] - 1e-6
            item["ceilingElevation"] = ceiling
            if profile:
                item["verticalProfile"] = profile
                item["lowerInfillHeight"] = profile["lowerInfillHeight"]
            item["depth"] = round(high - low, 4)
            item["normalOffset"] = round((low + high) / 2, 4)
            item["depthBasis"] = basis
            item["heightBasis"] = "variant C interpretation, ceiling-limited; " + (profile["basis"] if profile else "generic unmeasured opening height")
            measured_cut = jamb is not None or (kind == "window" and bool(set(item["sourceEntities"]) & SHARED_RETURN_WINDOWS.get(identifier,set())))
            if measured_cut:
                item["cutDepthBasis"] = "bounded measured opening span; adjacent bay rear closure retained"
            cut = opening_cut(a, b, low, high, measured_cut)
            openings.append({**item, "bridge": bridge, "cut": cut, "kind": kind})
    wall = union([wall] + [o["bridge"] for o in openings])
    wall = clear_shallow_bay_walls(wall, shallow_bays)
    print(f"{identifier}: openings prepared in {time.monotonic() - started:.1f}s", flush=True)
    envelope = cut_exterior_voids(identifier, footprint(data["roomUnion"], wall, openings),
                                  shared_exterior_voids or exterior_voids)
    holes = union([Polygon(core["holeLoops"][0]) for core in cores])
    solids = []
    region = lowered_region
    ordinary_wall, capped = apply_under_stair_walls(wall.difference(protective_mask), openings, identifier, structural)
    solids += capped
    for shape, lower in split_zone_geometry(ordinary_wall, region):
        if shape.is_empty:
            continue
        bottom = local_level(identifier, lower)
        top = local_ceiling(identifier, lower)
        if top is None:
            raise ValueError("Wall assigned to open roof zone")
        solids += wall_bands(shape, openings, bottom, top, identifier + ("-wing" if lower else ""))
    for profile in protective_profiles:
        bottom = stair_level_height(identifier + ".eastWing")
        solids += wall_bands(profile["geometry"].difference(exterior_exit_mask), openings, bottom, bottom + profile["height"],
                             f"{identifier}-protective-{profile['id']}-wing", role="low-barrier", material="concrete")
    for column_id, column in data["columns"]:
        for shape, lower in split_zone_geometry(column, region):
            if shape.is_empty:
                continue
            bottom = local_level(identifier, lower)
            solids += serialize_solids(shape, f"{identifier}-col-{column_id}" + ("-wing" if lower else ""), "column", bottom, local_ceiling(identifier, lower), "concrete")
    for cover in data["columnCovers"]:
        for shape, lower in split_zone_geometry(cover["geometry"], region):
            if shape.is_empty:
                continue
            bottom = local_level(identifier, lower)
            parts = serialize_solids(shape, f"{identifier}-cover-{cover['id']}" + ("-wing" if lower else ""),
                                     "column-cover", bottom, local_ceiling(identifier, lower), "plaster")
            for part in parts:
                part["sourceColumnId"] = cover["columnId"]
                part["sourceProfileId"] = cover["id"]
                part["heightBasis"] = "estimated same vertical extent as enclosed measured column"
            solids += parts
    slab = west_floor_geometry(identifier, envelope, west).difference(holes)
    if identifier == "p01" and west:
        solids += west_retaining_solids(west)
        for bottom in west["bottoms"]:
            parts = serialize_solids(bottom["geometry"], bottom["id"], "slab", bottom["height"] - SLAB_THICKNESS, bottom["height"], "floor")
            for part in parts:
                part["heightBasis"] = "western basement courtyard floor, estimated p01.westWing; N01 canonical outline"
            solids += parts
    if identifier == "n04":
        if previous_footprint is None:
            raise ValueError("n04 requires n03 roof footprint")
        roof = previous_footprint.difference(holes)
        for shape, lower in split_zone_geometry(roof, region):
            height = local_level(identifier, lower)
            solids += serialize_solids(shape, identifier + ("-wing" if lower else ""), "slab", height - SLAB_THICKNESS, height, "roof")
        solids += serialize_solids(envelope, identifier + "-head", "slab", ROOF_HEAD_TOP-SLAB_THICKNESS, ROOF_HEAD_TOP, "roof")
        solids += main_roof_parapet(clean(roof.difference(region)))
    else:
        for shape, lower in split_zone_geometry(slab, region):
            height = local_level(identifier, lower)
            shape = reserve_landing_surfaces(identifier, shape, height, exterior)
            solids += serialize_solids(shape, identifier + ("-wing" if lower else ""), "slab", height - SLAB_THICKNESS, height, "floor")
        for room in structural["rooms"]:
            if room["floor"] != identifier:
                continue
            # Restore only the part removed with the core. Existing floors
            # outside its hole retain their original single surface.
            restored = room["geometry"].intersection(holes)
            parts = serialize_solids(restored, f"{identifier}-room-{room['id']}", "slab", room["height"] - SLAB_THICKNESS, room["height"], "floor")
            for part in parts:
                part["sourceRoomEntity"] = room["sourceEntity"]
                part["levelKey"] = room["levelKey"]
                part["heightBasis"] = room["basis"]
            solids += parts
    audit = {"id": identifier, "roomCount": len(data["rooms"]), "roomArea": round(data["roomUnion"].area, 4),
             "roomOverlapArea": round(sum(r["geometry"].area for r in data["rooms"]) - data["roomUnion"].area, 4),
             "wallPairCount": pair_count, "wallArea": round(wall.area, 4), "columnCount": len(data["columns"]),
             "windowCount": len(windows), "doorCount": len(doors), "duplicateWindowEntities": duplicate_windows,
             "solidCount": len(solids), "triangleCount": sum(len(s["triangles"]) for s in solids),
             "footprintArea": round(envelope.area, 4), "footprintBounds": list(envelope.bounds),
             "corrections": corrections, "unresolvedStrongEdges": unresolved, "filtered": dict(data["statistics"])}
    audit["wallRoomConflicts"] = room_conflicts
    audit["junctionRepairs"] = junction_repairs
    audit["constructionDomain"] = {"method": "room bounding box with full entity containment", "margin": CONSTRUCTION_MARGIN,
                                    "bounds": data["constructionBounds"]}
    audit["columnCovers"] = [{"entity": cover["id"], "column": cover["columnId"],
                              "profileArea": round(cover["profile"].area, 6), "basis": cover["basis"]}
                             for cover in data["columnCovers"]]
    audit["unresolvedProfiles"] = data["unresolvedProfiles"]
    audit["protectiveProfiles"] = [{key: value for key, value in profile.items() if key != "geometry"}
                                   | {"bounds": list(profile["geometry"].bounds), "area": round(profile["geometry"].area, 6)}
                                   for profile in protective_profiles]
    audit["exteriorVoids"] = [{"id": void["id"], "bounds": list(void["geometry"].bounds),
                                "area": round(void["geometry"].area, 6), "bottom": void["bottom"],
                                "openAbove": void["openAbove"], "boundaryBasis": void["boundaryBasis"]}
                               for void in exterior_voids]
    audit['exteriorStairExits'] = [{key:value for key,value in item.items() if key!='geometry'} for item in exterior_exits]
    if identifier == "n03":
        audit["unmodeledDetails"] = [{"entities": ["1038", "1039", "103A", "103B"],
                                      "reason": "Closed rectangular outline has no enclosed measured round column; purpose unconfirmed, no automatic extrusion"}]
    audit["filtered"]["stairTreadSegments"] = len(stair_tread_ids(data["lines"]))
    audit['filtered']['semanticExteriorStairGraphics'] = sorted(exterior_graphics)
    audit['filtered']['westExteriorGraphics'] = sorted(WEST_GRAPHICS.get(identifier, set()) & {line.id for line in data['lines']}) if west else []
    audit['filtered']['westExteriorReplacedRetaining'] = sorted((west_excluded - WEST_GRAPHICS.get(identifier, set())) & {line.id for line in data['lines']})
    audit['filtered']['newExteriorRouteGraphics'] = sorted(new_exterior_graphics & {line.id for line in data['lines']})
    audit['facadeOpeningClassifications'] = [{key: door[key] for key in ('id', 'openingClassification', 'accessConfirmed', 'classificationBasis')}
                                             for door in doors if 'openingClassification' in door]
    audit["underStairMasks"] = [{"id": mask["id"], "sourceEntities": mask["sourceEntities"],
                                  "bounds": list(mask["geometry"].bounds), "ceilingPlane": mask["ceilingPlane"]}
                                 for mask in structural["masks"] if mask["floor"] == identifier]
    floor = {"id": identifier, "elevation": elevation, "solids": solids, "windows": windows, "doors": doors,
             "levelKind": "roof" if identifier == "n04" else "occupied-floor",
             "stairCores": cores, "estimatedCeiling": local_ceiling(identifier, False),
             "ceilingElevation": local_ceiling(identifier, False), "wingCeilingElevation": local_ceiling(identifier, True),
             "floorWingOffset": floor_wing_offset(identifier), "wingElevation": local_level(identifier, True),
             "heightRationale": HEIGHT_RATIONALE,
             "wingRegions": serialized_wing_regions(region_model, roof if identifier == "n04" else envelope)}
    audit["heightRegions"] = floor["wingRegions"]
    audit["windowVerticalProfiles"] = dict(Counter(window.get("verticalProfile", {}).get("id", "generic") for window in windows))
    audit["explicitJambCorrections"] = [{key: door[key] for key in ("id", "depth", "normalOffset", "depthSourceEntities")}
                                        for door in doors if "depthSourceEntities" in door]
    floor["shallowBayVoids"] = [{key: value for key, value in bay.items() if key != "geometry"}
                               | {"loops": [coords(list(poly.exterior.coords)[:-1])]}
                               for bay in shallow_bays for poly in polygons(bay["geometry"])]
    audit["shallowBayVoids"] = floor["shallowBayVoids"]
    audit["ceilingClippedOpenings"] = [{key: item[key] for key in ("id", "bottom", "top", "requestedTop", "ceilingElevation", "ceilingLevelKeys")}
                                       for item in doors + windows if item["ceilingClipped"]]
    floor["protectiveProfiles"] = audit["protectiveProfiles"]
    floor["exteriorVoids"] = [{key: value for key, value in void.items() if key != "geometry"} for void in exterior_voids]
    floor["exteriorStairPlans"] = exterior_plans
    floor['exteriorStairExits'] = audit['exteriorStairExits']
    floor["interiorStairPlanIds"] = [plan["id"] for plan in interior["plans"]
                                      if any(segment["ownerFloor"] == identifier for segment in plan["segments"])]
    if identifier == "n04":
        floor["roofTransitions"] = roof_transitions(roof, region_model)
        floor["mainRoofParapet"] = {"height": .40, "inwardThickness": .15, "capThickness": .04,
                                    "basis": "IPR 2023 raised main edge; thickness and material division estimated, no wing parapet"}
        floor["roofHeadBounds"] = list(data["roomUnion"].bounds)
        floor["roofHeadFootprint"] = [{"loops": [coords(list(poly.exterior.coords)[:-1])] + [coords(list(ring.coords)[:-1]) for ring in poly.interiors]}
                                      for poly in polygons(envelope)]
        floor["roofHeadNotes"] = "Small historical roof head; purpose and stair connection unconfirmed. Continuous base slab; no invented opening."
    return floor, audit, {"wall": wall, "roofEligibleWall": wall.difference(protective_mask),
                          "footprint": envelope, "holes": holes, "openings": openings, "rooms": data["rooms"]}


def draw_overlay(floor, drawing, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(16, 12))
    for room in drawing["rooms"]:
        for p in polygons(room["geometry"]):
            ax.fill(*p.exterior.xy, color="#edf0f2", zorder=1)
            center = p.representative_point()
            ax.text(center.x, center.y, room["id"], fontsize=5, ha="center", zorder=4)
    for p in polygons(drawing["wall"]):
        ax.fill(*p.exterior.xy, color="#5b5b55", zorder=2)
        for ring in p.interiors:
            ax.fill(*ring.xy, color="#edf0f2", zorder=2)
    for solid in floor["solids"]:
        if solid["role"] in ("column", "column-cover"):
            ring = np.array(solid["loops"][0])
            ax.fill(ring[:, 0], ring[:, 1], color="#292c31", zorder=3)
        if "roofClosure" in solid:
            for ring in solid["loops"]:
                closed = np.asarray(ring + [ring[0]])
                ax.plot(closed[:, 0], closed[:, 1], color="#cb651f", linewidth=.8, zorder=6)
    for opening in drawing["openings"]:
        for p in polygons(opening["bridge"]):
            ax.fill(*p.exterior.xy, color="#e7b87e" if opening["kind"] == "door" else "#57bedb", zorder=3)
    for core in floor["stairCores"]:
        p = Polygon(core["holeLoops"][0])
        ax.fill(*p.exterior.xy, facecolor="#a18bc2", alpha=0.24, zorder=4)
    for p in polygons(drawing["footprint"]):
        ax.plot(*p.exterior.xy, color="#536d48", linewidth=0.5, zorder=5)
    ax.set_aspect("equal")
    ax.set_title(f"B1 {floor['id']} — walls, doors (tan), windows (cyan), stair voids (violet), exposed roof edges (orange)")
    ax.set_xlabel("Original CAD x / 1000 [m]")
    ax.set_ylabel("Original CAD y / 1000 [m]")
    ax.grid(alpha=0.1)
    fig.tight_layout()
    fig.savefig(output / f"{floor['id']}-overlay.png", dpi=150)
    plt.close(fig)


def prepare(source, output, audit_path, overlays=True):
    source_sha = generator_sha256()
    files = source_files(source)
    data = {identifier: read_floor(path) for identifier, path in files.items()}
    lowered_rooms = [room["geometry"] for room in data["n01"]["rooms"] if room["id"] in ("91c", "14")]
    if len(lowered_rooms) != 2:
        raise ValueError("Cannot identify both split-level entrance rooms 91c and 14")
    # N01 establishes both external shaft footprints; P01 must use the same
    # footprints for their bottom slab even though it is prepared first.
    shaft_profiles = n01_protective_profiles("n01", data["n01"]["lines"], data["n01"]["roomUnion"])
    shared_exterior_voids = exterior_void_profiles(shaft_profiles, data["n01"]["roomUnion"])
    interior = interior_stair_metadata(data)
    structural = under_stair_metadata(data, interior)
    region_models = height_region_models(data, interior, structural, shared_exterior_voids)
    exterior = exterior_stair_routes(data, shared_exterior_voids)
    west = exterior["west"]
    structural["masks"].extend(exterior_support_masks(data, exterior))
    recipe = {"schemaVersion": 1, "buildingId": "b01", "osmId": 53929063, "cadOrigin": [250, 731], "heightModel": height_model_metadata(),
              "sourceProvenance": {"files": [data[f]["provenance"] for f in FLOORS],
                                   "horizontalBasis": "Historical user-supplied plans; no new survey; CAD / 1000 without per-floor normalization",
                                   "heightBasis": "All elevations, opening heights, slabs and roof head heights are modeling estimates",
                                   "floorElevations": FLOORS, "entryElevation": local_level("n01", True),
                                   "floorWingOffsets": {floor: floor_wing_offset(floor) for floor in FLOORS}, "heightRationale": HEIGHT_RATIONALE,
                                   "estimatedSlabThickness": SLAB_THICKNESS, "sourceFilesEmbedded": False}, "floors": []}
    audit = {"schemaVersion": 1, "buildingId": "b01", "status": "prepared-for-model-review", "dependencies": {"ezdxf": ezdxf.__version__, "shapely": shapely.__version__},
             "sourceFiles": [{k: v for k, v in data[f]["provenance"].items() if k != "titleBlock"} for f in FLOORS],
             "estimates": {"heightModel": height_model_metadata(), "floorElevations": FLOORS, "entryElevation": local_level("n01", True),
                           "floorWingOffsets": {floor: floor_wing_offset(floor) for floor in FLOORS},
                           "heightRationale": HEIGHT_RATIONALE, "slabThickness": SLAB_THICKNESS,
                           "doorHeight": 2.1, "windowSill": 0.9, "windowHead": 2.4, "roofHeadTop": ROOF_HEAD_TOP,
                           "wingFacadeProfiles": WING_FACADE_PROFILES,
                           "exteriorProtectionHeight": EXTERIOR_PROTECTION_HEIGHT,
                           "columnCoverHeight": "same estimated vertical extent as enclosed measured column"},
             "method": "Measured parallel-boundary strips, semantic openings, separately measured columns, constrained polygon triangulation",
             "limitations": ["Historical plans explicitly not newly surveyed", "Single boundary thickness and all vertical dimensions are estimates",
                             "Stair direction/count is partly obscured by drawing breaks; builder and section review must validate all landings",
                             "No Blender reopen, practical collision or game GPU test performed by preparation"], "floors": []}
    output.mkdir(parents=True, exist_ok=True)
    previous = None
    drawings = {}
    for identifier in FLOORS:
        floor, floor_audit, drawing = prepare_floor(identifier, data[identifier], region_models[identifier]["geometry"], previous,
                                                   shared_exterior_voids, interior, structural, west, exterior, region_models[identifier])
        recipe["floors"].append(floor)
        audit["floors"].append(floor_audit)
        previous = drawing["footprint"]
        drawings[identifier] = drawing
        print(f"{identifier}: {len(floor['solids'])} solids, {len(floor['doors'])} doors, {len(floor['windows'])} windows", flush=True)
    roof_solids, roof_audit = exposed_wing_roofs(data["n01"], drawings["n01"], drawings["n02"],
                                                interior, exterior, shared_exterior_voids)
    lower_floor = next(floor for floor in recipe["floors"] if floor["id"] == "n01")
    lower_floor["solids"].extend(roof_solids)
    lower_floor["exposedWingRoofs"] = roof_audit
    lower_audit = next(floor for floor in audit["floors"] if floor["id"] == "n01")
    lower_audit["exposedWingRoofs"] = roof_audit
    audit["limitations"].append("P01 s146 is covered by the underside of the main entry stair and upper landing; its clearance is verified by native acceptance, independently of the N01 exposed-wing flat roof repair")
    lower_audit["solidCount"] = len(lower_floor["solids"])
    lower_audit["triangleCount"] = sum(len(solid["triangles"]) for solid in lower_floor["solids"])
    recipe["geometryRevision"] = "C-exposed-roofs-shallow-bays-1"
    if overlays:
        for floor in recipe["floors"]:
            draw_overlay(floor, drawings[floor["id"]], output)
    for floor in recipe["floors"]:
        if floor["id"] in WING_FACADE_PROFILES:
            expected = 47 if floor["id"] == "n02" else 48
            actual = sum("verticalProfile" in window for window in floor["windows"])
            if actual != expected:
                raise ValueError(f"Changed source facade selection in {floor['id']}: {actual}, expected {expected}")
    recipe["exteriorVoids"] = [void for floor in recipe["floors"] for void in floor["exteriorVoids"]]
    recipe["roofTransitions"] = [item for floor in recipe["floors"] for item in floor.get("roofTransitions", [])]
    recipe["interiorStairPlans"] = interior["plans"]
    recipe["interiorStairObservations"] = interior["observations"]
    recipe["interiorStairLevelEstimates"] = interior["levels"]
    recipe["exteriorStairRoutes"] = exterior["plans"]
    recipe["exteriorLevelAnchors"] = exterior["anchors"]
    recipe["exteriorLevelEstimates"] = exterior["estimates"]
    recipe["terrainCutouts"] = exterior["terrainCutouts"]
    recipe["exteriorWestDoorConnectors"] = [{key: value for key, value in connector.items() if key != "geometry"}
                                           | {"loops": [coords(list(poly.exterior.coords)[:-1])]}
                                           for connector in west["doorConnectors"] for poly in polygons(connector["geometry"])]
    recipe["exteriorWestRetainingProfiles"] = [{key: value for key, value in profile.items() if key != "geometry"}
                                               | {"loops": [coords(list(poly.exterior.coords)[:-1])]}
                                               for profile in west["retaining"] for poly in polygons(profile["geometry"])]
    audit["exteriorWest"] = {"canonicalFloor": "n01", "referenceFloor": "p01", "anchors": west["anchors"],
                              "derivedLevels": west["estimates"], "planCount": len(west["plans"]),
                              "segmentRisers": {segment["id"]: segment["modeledRiserCount"] for plan in west["plans"] for segment in plan["segments"]},
                              "terrainValidationPending": True, "retainingProfiles": recipe["exteriorWestRetainingProfiles"],
                              "basis": "local N01/P01 interpretation; NE lower retaining outline differs by up to 0.6513m normal to canonical N01 face; residential facade and doors remain unchanged"}
    audit["exteriorRoutes"] = {"routeCount": len(exterior["plans"]), "anchors": exterior["anchors"],
                                "derivedLevels": exterior["estimates"], "terrainValidationPending": True,
                                "segments": [{key: segment[key] for key in ('id', 'ownerFloor', 'sourceFloor', 'lowerLevelKey', 'upperLevelKey', 'modeledRiserCount', 'sourceEntities')}
                                             | {"maxRiserHeight": segment.get('maxRiserHeight', .22),
                                                "estimatedRiserHeight": (exterior['levels'][segment['upperLevelKey']] - exterior['levels'][segment['lowerLevelKey']]) / len(segment['riserPositions'])}
                                             for plan in exterior["plans"] for segment in plan["segments"]]}
    recipe["underStairWallMasks"] = [{key: value for key, value in mask.items() if key != "geometry"}
                                     | {"loops": [coords(list(poly.exterior.coords)[:-1])] + [coords(list(ring.coords)[:-1]) for ring in poly.interiors]}
                                     for mask in structural["masks"] for poly in polygons(mask["geometry"])]
    recipe["underStairRooms"] = [{key: value for key, value in room.items() if key != "geometry"}
                                 | {"loops": [coords(list(poly.exterior.coords)[:-1])] + [coords(list(ring.coords)[:-1]) for ring in poly.interiors]}
                                 for room in structural["rooms"] for poly in polygons(room["geometry"])]
    record_generator_provenance(recipe, audit, source_sha)
    encoded = json.dumps(recipe, ensure_ascii=False, separators=(",", ":"))
    recipe_path = output / "recipe.json"
    recipe_path.write_text(encoded, encoding="utf-8")
    audit["recipeSha256"] = hashlib.sha256(encoded.encode("utf-8")).hexdigest()
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return recipe, audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / ".cache/cad-buildings-20261024/b01-preparation")
    parser.add_argument("--audit", type=Path, default=ROOT / "docs/reality-pack/cad-buildings/b01/preparation-audit.json")
    parser.add_argument("--no-overlays", action="store_true")
    args = parser.parse_args()
    prepare(args.source, args.output, args.audit, not args.no_overlays)


if __name__ == "__main__":
    main()
