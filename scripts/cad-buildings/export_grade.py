"""Derive a small source-backed approach TIN; never modify the original DMR.

Shapely 2.2 is required. The fitted plane is retained only in the explicitly
labelled source/interpretation region. Piecewise planar blend rings meet the
original NE--SW source-grid triangles and unchanged outer boundary heights.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

from shapely import constrained_delaunay_triangles
from shapely.geometry import MultiPoint, Point, Polygon, box
from shapely.ops import unary_union, nearest_points

FRACTIONS = (0.0, 0.25, 0.5, 0.75, 1.0)
EPSILON = 1e-8
# Explicitly selected by the task coordinator from original IPR ground, not a
# search for arbitrary additional entrances. Outside points identify the side.
B1_ENTRY_SOURCES = (
    {'doorId': 'n01-door-30F4', 'outsideWorldXZ': [-75.248462, 56.823734],
     'sourceTriangles': [('1127362', 665)], 'occluded': False},
    {'doorId': 'n01-door-312B', 'outsideWorldXZ': [-75.442106, 44.273276],
     'sourceTriangles': [('1127370', 666), ('1127370', 655)], 'occluded': True, 'maxExtrapolationMetres': 1.051},
)


def finite(values, label):
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in values):
        raise ValueError('Non-finite ' + label)


def polygon_parts(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    if geometry.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return [p for child in geometry.geoms for p in polygon_parts(child)]
    return []  # zero-area line/vertex intersections remove no terrain


def loop(ring):
    points = [[round(x, 9), round(z, 9)] for x, z in list(ring.coords)[:-1]]
    first = min(range(len(points)), key=points.__getitem__)
    return points[first:] + points[:first]


def geometry_records(geometry):
    return [{'loops': [loop(p.exterior), *[loop(h) for h in p.interiors]], 'areaM2': p.area}
            for p in sorted(polygon_parts(geometry), key=lambda p: (*p.bounds, p.area))]


class SourceTerrain:
    def __init__(self, data):
        self.data, self.grid = data, data['grid']
        self.reference = data['reference']['absoluteHeight']
        g = self.grid
        finite([g[k] for k in ('minX', 'minZ', 'step')] + [self.reference], 'source grid')
        if g['step'] <= 0 or g['rows'] < 2 or g['columns'] < 2 or len(data['heights']) != g['rows'] * g['columns']:
            raise ValueError('Invalid source grid dimensions')
        finite(data['heights'], 'DMR heights')

    def vertex(self, column, row):
        # This is the exact native-B6 F32 source branch in shared/terrain.ts.
        value = self.data['heights'][row * self.grid['columns'] + column] - self.reference
        return struct.unpack('<f', struct.pack('<f', value))[0]

    def height(self, x, z):
        g, step = self.grid, self.grid['step']
        gx, gz = (x - g['minX']) / step, (z - g['minZ']) / step
        if gx < -EPSILON or gz < -EPSILON or gx > g['columns'] - 1 + EPSILON or gz > g['rows'] - 1 + EPSILON:
            raise ValueError('Patch extends beyond source DMR')
        column = min(g['columns'] - 2, max(0, math.floor(gx)))
        row = min(g['rows'] - 2, max(0, math.floor(gz)))
        u, v = gx - column, gz - row
        nw, ne, sw, se = (self.vertex(column, row), self.vertex(column + 1, row),
                          self.vertex(column, row + 1), self.vertex(column + 1, row + 1))
        return nw + u * (ne - nw) + v * (sw - nw) if u + v <= 1 else se + (1 - u) * (sw - se) + (1 - v) * (ne - se)


def checked_sources(observations, proposal):
    if observations['buildingId'] != proposal['buildingId'] or observations['placement'] != proposal['placement']:
        raise ValueError('Ground/proposal placement identity mismatch')
    plane = proposal['worldPlane']
    finite([plane[k] for k in ('a', 'b', 'c')], 'ground plane')
    if any(abs(plane[k] - observations['smoothApproachPlane'][k]) > 1e-12 for k in ('a', 'b', 'c')):
        raise ValueError('Ground/proposal plane mismatch')
    samples = proposal['validSamples']
    if len(samples) != observations['smoothApproachPlane']['points'] or len(samples) < 3:
        raise ValueError('Ground sample count mismatch')
    seen = set()
    for sample in samples:
        x, y, z = sample['worldXYZ']
        finite([x, y, z, sample['backMetres'], sample['acrossMetres']], 'source sample')
        key = (x, z)
        if key in seen:
            raise ValueError('Duplicate ground sample')
        seen.add(key)
        candidates = [p for p in observations['samples']
                      if abs(p['backMetres'] - sample['backMetres']) < 1e-10
                      and abs(p['acrossMetres'] - sample['acrossMetres']) < 1e-10
                      and math.dist(p['worldXZ'], [x, z]) < 1e-8]
        if len(candidates) != 1 or not any(hit['sourceTriangle'] == sample['sourceTriangle']
                and abs(hit['y'] - y) < 1e-9 and hit['normalY'] > .92 for hit in candidates[0]['groundHits']):
            raise ValueError('Selected sample is not a matching smooth source-ground hit')
    envelope = MultiPoint([(s['worldXYZ'][0], s['worldXYZ'][2]) for s in samples]).convex_hull
    if envelope.geom_type != 'Polygon' or envelope.area <= 1e-8:
        raise ValueError('Source samples have no planar interpolation area')
    source_polygons = []
    for entry in proposal['polygons']:
        rings = entry['worldLoops']
        for ring in rings:
            for p in ring:
                if len(p) != 2:
                    raise ValueError('Source polygon needs XZ pairs')
                finite(p, 'source polygon')
        polygon = Polygon(rings[0], rings[1:])
        if not polygon.is_valid or polygon.area <= 0:
            raise ValueError('Invalid source-supported polygon')
        source_polygons.append(polygon)
    supported = unary_union(source_polygons)
    if not envelope.buffer(EPSILON).covers(supported):
        raise ValueError('Source mask exceeds its sample envelope')
    residuals = [s['worldXYZ'][1] - (plane['a'] * s['worldXYZ'][0] + plane['b'] * s['worldXYZ'][2] + plane['c']) for s in samples]
    rms = math.sqrt(sum(value * value for value in residuals) / len(residuals))
    if abs(rms - proposal['sampleRmsMetres']) > 1e-8:
        raise ValueError('Source plane residual identity mismatch')
    return plane, envelope, supported, rms, residuals


def front_geometry(observations):
    center = [s for s in observations['samples'] if s['backMetres'] == 0 and s['acrossMetres'] == 0]
    if len(center) != 1 or math.dist(center[0]['cadXY'], observations['lowerCadXY']) > 1e-8:
        raise ValueError('Missing source first-front centre')
    center = center[0]['worldXZ']
    unit, yaw, width = observations['acrossCadUnit'], observations['placement']['yaw'], observations['widthMetres']
    finite([*center, *unit, yaw, width], 'first-front geometry')
    if width <= 0 or abs(math.hypot(*unit) - 1) > 1e-8:
        raise ValueError('Invalid first-front width/direction')
    c, s = math.cos(yaw), math.sin(yaw)
    # CAD (+x,+y) -> model (-y,-x), followed by the same registered Y rotation.
    across = [c * -unit[1] + s * -unit[0], -s * -unit[1] + c * -unit[0]]
    endpoints = [[center[i] + sign * across[i] * width / 2 for i in (0, 1)] for sign in (-1, 1)]
    for sign, endpoint in zip((-1, 1), endpoints):
        matches = [p for p in observations['samples'] if p['backMetres'] == 0 and abs(p['acrossMetres'] - sign * width / 2) < 1e-8]
        if len(matches) != 1 or math.dist(endpoint, matches[0]['worldXZ']) > 1e-8:
            raise ValueError('Source front endpoint disagrees with placement and width')
    return center, across, endpoints


def blend_rings(core, outer, fractions=FRACTIONS):
    """Nested convex Minkowski interpolation; outermost ring returns to DMR.

    This needs no invented world-coordinate control points. The smallest convex
    plane region contains only supported samples and the explicitly approved
    full first-front line; the outer apron is limited by its covering cells.
    """
    if not core.is_valid or not outer.covers(core) or core.boundary.distance(outer.boundary) <= EPSILON:
        raise ValueError('Plane region must lie strictly inside its source cells')
    a, b = list(core.exterior.coords)[:-1], list(outer.exterior.coords)[:-1]
    rings = [MultiPoint([((1 - t) * p[0] + t * q[0], (1 - t) * p[1] + t * q[1]) for p in a for q in b]).convex_hull for t in fractions]
    if any(not rings[i].buffer(EPSILON).covers(rings[i - 1]) for i in range(1, len(rings))):
        raise ValueError('Blend contours are not nested')
    return rings


def triangulate_core(source, plane, core, *, max_cells=2, apron_width=.5, domain_margin=0):
    """One immutable local plane/boundary-blend TIN, split on source diagonals."""
    finite([plane[k] for k in ('a', 'b', 'c')], 'ground plane')
    g, step = source.grid, source.grid['step']
    min_x, min_z, max_x, max_z = core.buffer(domain_margin, quad_segs=2).bounds if domain_margin else core.bounds
    col0, col1 = math.floor((min_x - g['minX']) / step), math.ceil((max_x - g['minX']) / step)
    row0, row1 = math.floor((min_z - g['minZ']) / step), math.ceil((max_z - g['minZ']) / step)
    if (col1 - col0) * (row1 - row0) > max_cells:
        raise ValueError('Approach exceeds the explicitly limited source-cell extent')
    if col0 < 0 or row0 < 0 or col1 >= g['columns'] or row1 >= g['rows']:
        raise ValueError('Approach outside original DMR')
    bounds = {'minX': g['minX'] + col0 * step, 'maxX': g['minX'] + col1 * step,
              'minZ': g['minZ'] + row0 * step, 'maxZ': g['minZ'] + row1 * step}
    finite([apron_width], 'apron width')
    if not 0 < apron_width <= 1:
        raise ValueError('Approach blend must remain a small explicit apron')
    domain = box(bounds['minX'], bounds['minZ'], bounds['maxX'], bounds['maxZ'])
    # Rounded convex buffer avoids long mitres at source hull corners. Only the
    # local apron changes; the rest of the two source cells remains pure DMR.
    outer = core.buffer(apron_width, quad_segs=2).intersection(domain)
    rings = blend_rings(core, outer)
    covers = [r.buffer(EPSILON) for r in rings]
    weights = [1 - t * t * (3 - 2 * t) for t in FRACTIONS]
    zones = [rings[0], *[rings[i].difference(rings[i - 1]) for i in range(1, len(rings))]]

    def height(x, z):
        p = Point(x, z)
        if not covers[-1].covers(p):
            return source.height(x, z)
        if p.distance(outer.boundary) < EPSILON:
            return source.height(x, z)
        if covers[0].covers(p):
            weight = 1.0
            target_point = p
        else:
            weight = 0.0
            # The apron blends the nearest approved plane-boundary value into
            # DMR. It does not extend the source plane farther beyond its core.
            target_point = nearest_points(core, p)[0]
            for i in range(1, len(rings)):
                if covers[i].covers(p):
                    inside = rings[i - 1].distance(p)
                    outside = rings[i].boundary.distance(p)
                    t = inside / (inside + outside)
                    weight = weights[i - 1] * (1 - t) + weights[i] * t
                    break
        target = plane['a'] * target_point.x + plane['b'] * target_point.y + plane['c']
        return source.height(x, z) * (1 - weight) + target * weight

    positions, indices, cells, lookup = [], [], [], {}
    max_adjustment = 0.0

    def add_triangle(triangle):
        nonlocal max_adjustment
        coords = [(round(x, 9), round(z, 9)) for x, z in list(triangle.exterior.coords)[:3]]
        a, b, c = coords
        area2 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if abs(area2) < 1e-12:
            raise ValueError('Degenerate triangle after output precision')
        if area2 < 0:
            coords[1], coords[2] = coords[2], coords[1]
        for x, z in coords:
            if (x, z) not in lookup:
                y = round(height(x, z), 9)
                finite([x, y, z], 'generated vertex')
                max_adjustment = max(max_adjustment, abs(y - source.height(x, z)))
                lookup[(x, z)] = len(positions) // 3
                positions.extend([x, y, z])
            indices.append(lookup[(x, z)])

    for row in range(row0, row1):
        for column in range(col0, col1):
            x, z = g['minX'] + column * step, g['minZ'] + row * step
            first = len(indices)
            for points in [[(x, z), (x + step, z), (x, z + step)], [(x, z + step), (x + step, z), (x + step, z + step)]]:
                original = Polygon(points)
                parts = [part for zone in zones for part in polygon_parts(original.intersection(zone)) if part.area > 1e-12]
                parts.extend(part for part in polygon_parts(original.difference(outer)) if part.area > 1e-12)
                area = 0.0
                for part in parts:
                    generated = list(constrained_delaunay_triangles(part).geoms)
                    for tri in sorted(generated, key=lambda t: (*t.centroid.coords[0], t.area)):
                        if not part.buffer(EPSILON).covers(tri):
                            raise ValueError('Triangulation escaped its constrained region')
                        area += tri.area
                        add_triangle(tri)
                if abs(area - original.area) > 1e-7:
                    raise ValueError('DMR triangle partition lost area')
            cells.append({'column': column, 'row': row, 'firstIndex': first, 'indexCount': len(indices) - first})
    return {'rawDMRUnchanged': True, 'referenceBpv': source.reference, 'sourceGrid': {k: g[k] for k in ('minX', 'minZ', 'step')},
            'bounds': bounds, 'positions': positions, 'indices': indices, 'cells': cells,
            'apronWidthMetres': apron_width, 'targetPlane': plane,
            'regions': {'planeRegion': geometry_records(core), 'transitionToDmrMask': geometry_records(outer.difference(core)),
                        'unchangedDmrWithinCellsMask': geometry_records(domain.difference(outer))},
            'blendContours': [{'fraction': t, 'planeWeight': w, 'loops': geometry_records(r)[0]['loops']} for t, w, r in zip(FRACTIONS, weights, rings)],
            'maxSourceVertexAdjustmentMetres': max_adjustment}


def generate_grade(terrain_data, observations, proposal, *, max_cells=2, apron_width=.5):
    source = SourceTerrain(terrain_data)
    plane, envelope, supported, rms, residuals = checked_sources(observations, proposal)
    center, across, endpoints = front_geometry(observations)
    core = MultiPoint([*list(envelope.exterior.coords)[:-1], *endpoints]).convex_hull
    result = triangulate_core(source, plane, core, max_cells=max_cells, apron_width=apron_width)
    return {**result, 'schemaVersion': 1, 'id': observations['buildingId'] + '-entry-grade', 'buildingId': observations['buildingId'],
            'buildingOsmId': '53929071', 'classification': 'photo-plane-plus-explicitly-extrapolated-game-grade', 'measured': False,
            'targetPlane': plane, 'placement': observations['placement'],
            'planeEvidence': {'sourceEpoch': 'IPR Praha summer 2023', 'sourceManifestSha256': proposal['sourceManifestSha256'],
                              'samples': proposal['validSamples'], 'sampleCount': len(proposal['validSamples']), 'sampleRmsMetres': rms,
                              'sampleResidualRangeMetres': [min(residuals), max(residuals)], 'sourceTriangleIds': proposal['sourceTriangleIds']},
            'regions': {**result['regions'], 'sourceSupportedMask': geometry_records(supported), 'sampleInterpolationMask': geometry_records(envelope),
                        'interpolatedSourceHolesMask': geometry_records(envelope.difference(supported)),
                        'extrapolatedGameGradeMask': geometry_records(core.difference(envelope))},
            'frontConstraint': {'sourceLowerCadXY': observations['lowerCadXY'], 'sourcePlacement': observations['placement'],
                                'centerWorldXZ': center, 'acrossWorldUnit': across, 'widthMetres': observations['widthMetres'],
                                'endpointsWorldXZ': endpoints, 'planeHeights': [plane['a'] * p[0] + plane['b'] * p[1] + plane['c'] for p in [endpoints[0], center, endpoints[1]]],
                                'interpretation': 'Minimum convex plane region joining the sample envelope to the complete source first-front line; outside samples is extrapolated game grading, not measured ground.'},
            'notes': ['Enabled only for registered native B6, using unflattened original DMR.',
                      'The source-supported mask is preserved separately; mesh-hole interpolation and all extrapolation are explicitly labelled.',
                      'The entire observed plane slope is retained; no constant ground height or extra stair is introduced to force a walking test.',
                      'Every original NE-SW DMR triangle remains a constraint; outer boundary heights are the original F32 DMR and shared-cell vertices are identical.',
                      'Transition triangle heights define the runtime TIN; this is an interpreted local approach, not a survey or an Actor acceptance result.']}


def read_source_triangle(manifest, node_id, triangle_index, public_root):
    node = next(n for n in manifest['nodes'] if str(n['id']) == str(node_id))
    path = (public_root / node['geometry'].lstrip('/')).resolve()
    path.relative_to(public_root.resolve())
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != node['geometrySha256']:
        raise ValueError('IPR source geometry SHA mismatch')
    count, features = struct.unpack_from('<II', data)
    if count != node['vertices'] or count % 3 or len(data) != 8 + count * 20 + features * 16 or not 0 <= triangle_index < count // 3:
        raise ValueError('Unsupported IPR geometry layout or source triangle')
    vertices = []
    factor, center = manifest['metresPerMercatorUnit'], node['center']
    for index in range(3):
        x, y, z = struct.unpack_from('<fff', data, 8 + (triangle_index * 3 + index) * 12)
        vertices.append([(center[0] - manifest['mercatorOrigin']['x'] + x) * factor,
                         center[2] - manifest['worldHeightReference'] + z,
                         -(center[1] - manifest['mercatorOrigin']['y'] + y) * factor])
    finite([value for vertex in vertices for value in vertex], 'IPR triangle')
    a, b, c = vertices
    u, v = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
    n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    length = math.sqrt(sum(value * value for value in n))
    if length == 0 or n[1] / length < .9:
        raise ValueError('Selected IPR triangle is not upward smooth ground')
    pa, pb = -n[0] / n[1], -n[2] / n[1]
    plane = {'a': pa, 'b': pb, 'c': a[1] - pa * a[0] - pb * a[2]}
    return {'sourceTriangle': str(node_id) + ':' + str(triangle_index), 'geometrySha256': digest,
            'verticesWorldXYZ': vertices, 'normalY': n[1] / length, 'plane': plane}


def door_world_line(model, placement, door):
    a, b = door['hinge'], door['closedEnd']
    width = math.dist(a, b)
    if width <= 0:
        raise ValueError('Invalid native door width')
    normal = [-(b[1] - a[1]) / width, (b[0] - a[0]) / width]
    c, s = math.cos(placement['yaw']), math.sin(placement['yaw'])
    result = []
    for p in (a, b):
        cad = [p[i] + normal[i] * door.get('normalOffset', 0) for i in (0, 1)]
        x, z = -(cad[1] - model['cadOrigin'][1]), -(cad[0] - model['cadOrigin'][0])
        result.append([placement['translation']['x'] + c * x + s * z,
                       placement['translation']['z'] - s * x + c * z])
    return result


def generate_door_grades(terrain_data, model, placement, evidence, *, apron_width=.3, max_cells_per_entry=4):
    source = SourceTerrain(terrain_data)
    entries, combined_positions, combined_indices, combined_cells, owners = [], [], [], [], set()
    for item in evidence:
        matches = [d for d in model['doors'] if d['id'] == item['doorId']]
        if len(matches) != 1:
            raise ValueError('Missing or duplicate native entry door')
        door = matches[0]
        jamb = door_world_line(model, placement, door)
        center = [(jamb[0][i] + jamb[1][i]) / 2 for i in (0, 1)]
        width = math.dist(*jamb)
        tangent = [(jamb[1][i] - jamb[0][i]) / width for i in (0, 1)]
        normal = [-tangent[1], tangent[0]]
        outside = item['outsideWorldXZ']
        finite([*outside], 'observed exterior point')
        delta = [outside[i] - center[i] for i in (0, 1)]
        if abs(sum(delta[i] * tangent[i] for i in (0, 1))) > 1e-4:
            raise ValueError('Observed outside point does not identify the native door axis')
        distance = sum(delta[i] * normal[i] for i in (0, 1))
        if not .05 < abs(distance) < 2:
            raise ValueError('Outside point is not a local entry approach')
        outside_edge = [[p[i] + normal[i] * distance for i in (0, 1)] for p in jamb]
        requested = Polygon([jamb[0], jamb[1], outside_edge[1], outside_edge[0]])
        primary, *checks = item['triangles']
        plane = primary['plane']
        source_polygon = Polygon([(p[0], p[2]) for p in primary['verticesWorldXYZ']])
        if not source_polygon.is_valid or source_polygon.area <= 0:
            raise ValueError('Invalid source ground triangle projection')
        core = requested
        if item['occluded']:
            limit = item['maxExtrapolationMetres']
            finite([limit], 'extrapolation limit')
            if limit <= 0 or source_polygon.distance(Point(outside)) > limit:
                raise ValueError('Occluded approach exceeds approved source extrapolation')
            core = core.intersection(source_polygon.buffer(limit, quad_segs=16))
            supported = Polygon()  # Entire occluded apron remains an estimate.
        else:
            if not source_polygon.buffer(EPSILON).covers(Point(outside)):
                raise ValueError('Direct exterior point is outside selected source ground')
            supported = core.intersection(source_polygon)
        if core.geom_type != 'Polygon' or core.area < 1e-6:
            raise ValueError('Entry has no approved approach area')
        tin = triangulate_core(source, plane, core, max_cells=max_cells_per_entry, apron_width=apron_width, domain_margin=apron_width)
        for cell in tin['cells']:
            key = (cell['column'], cell['row'])
            if key in owners:
                raise ValueError('Entry source cells overlap; independent planes cannot silently override each other')
            owners.add(key)
        vertex_offset, index_offset = len(combined_positions) // 3, len(combined_indices)
        combined_positions.extend(tin['positions']); combined_indices.extend(index + vertex_offset for index in tin['indices'])
        combined_cells.extend({**cell, 'firstIndex': cell['firstIndex'] + index_offset} for cell in tin['cells'])
        heights = lambda p: plane['a'] * p[0] + plane['b'] * p[1] + plane['c']
        entry = {key: value for key, value in tin.items() if key not in ('positions', 'indices', 'cells', 'sourceGrid', 'referenceBpv', 'rawDMRUnchanged')}
        entry.update({'doorId': door['id'], 'classification': 'extrapolated-historical-occlusion-game-grade' if item['occluded'] else 'direct-photo-ground-with-interpreted-threshold-apron',
                      'measured': False, 'nativeDoorSourceEntities': door.get('sourceEntities', []), 'nativeJambWorldXZ': jamb,
                      'widthMetres': width, 'observedOutsideWorldXZ': outside, 'thresholdWorldXZ': center,
                      'sourcePlaneAtOutside': heights(outside), 'sourcePlaneAtThreshold': heights(center),
                      'originalDmrAtOutside': source.height(*outside), 'nativeInsideFloorY': placement['translation']['y'] + door['bottom'],
                      'sourceTriangles': item['triangles'], 'sourceDistanceAtOutsideMetres': source_polygon.distance(Point(outside)),
                      'maximumCoreDistanceToSourceMetres': max(source_polygon.distance(Point(p)) for p in core.exterior.coords),
                      'approvedMaximumExtrapolationMetres': item.get('maxExtrapolationMetres'),
                      'checkPlaneHeightDifferencesMetres': [[check['plane']['a'] * p[0] + check['plane']['b'] * p[1] + check['plane']['c'] - heights(p)
                                                          for p in (outside, center)] for check in checks],
                      'regions': {**tin['regions'], 'sourceSupportedMask': geometry_records(supported),
                                  'extrapolatedGameGradeMask': geometry_records(core.difference(supported)),
                                  'requestedCoreOutsideApprovedLimit': geometry_records(requested.difference(core))}})
        entries.append(entry)
    if not entries:
        raise ValueError('No entry grades requested')
    bounds = {key: (min if key.startswith('min') else max)(entry['bounds'][key] for entry in entries) for key in ('minX', 'maxX', 'minZ', 'maxZ')}
    return {'schemaVersion': 1, 'id': model['id'] + '-entry-grade', 'buildingId': model['id'], 'buildingOsmId': '53929063',
            'classification': 'local-photo-ground-and-explicit-occlusion-game-grading', 'measured': False,
            'rawDMRUnchanged': True, 'referenceBpv': source.reference, 'sourceGrid': {k: source.grid[k] for k in ('minX', 'minZ', 'step')},
            'placement': placement, 'bounds': bounds, 'positions': combined_positions, 'indices': combined_indices, 'cells': combined_cells,
            'entries': entries, 'maxSourceVertexAdjustmentMetres': max(e['maxSourceVertexAdjustmentMetres'] for e in entries),
            'notes': ['Only the explicitly selected B1 door aprons are changed; native model geometry and door flags remain untouched.',
                      '312B is entirely an occlusion/historical estimate from neighbouring IPR ground, never a direct measurement.',
                      'The approved plane region is distance-limited; its apron interpolates nearest boundary heights to DMR without further plane extrapolation.',
                      'All original grid diagonals and outer cell heights remain exact; Actor/world acceptance is separate.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--building', choices=['b01', 'b06'], default='b06')
    parser.add_argument('--terrain', type=Path, required=True)
    parser.add_argument('--observations', type=Path)
    parser.add_argument('--proposal', type=Path)
    parser.add_argument('--model', type=Path)
    parser.add_argument('--alignment', type=Path, default=Path('shared/data/cad-buildings/photo-alignment.json'))
    parser.add_argument('--photo-manifest', type=Path, default=Path('shared/data/photogrammetry.json'))
    parser.add_argument('--public-root', type=Path, default=Path('public'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    inputs = {'terrain': args.terrain.read_bytes()}
    if args.building == 'b06':
        if not args.observations or not args.proposal:
            parser.error('B6 requires --observations and --proposal')
        inputs.update({'observations': args.observations.read_bytes(), 'proposal': args.proposal.read_bytes()})
        result = generate_grade(*(json.loads(inputs[name]) for name in ('terrain', 'observations', 'proposal')))
        result.update({'sourceObservationSha256': hashlib.sha256(inputs['observations']).hexdigest(),
                       'sourceProposalSha256': hashlib.sha256(inputs['proposal']).hexdigest()})
    else:
        if not args.model:
            parser.error('B1 requires the accepted native --model JSON')
        inputs.update({'model': args.model.read_bytes(), 'alignment': args.alignment.read_bytes(), 'manifest': args.photo_manifest.read_bytes()})
        model, alignment, manifest = (json.loads(inputs[name]) for name in ('model', 'alignment', 'manifest'))
        if model['id'] != 'b01':
            raise ValueError('B1 source mapping requires native B1')
        placement = alignment['buildings']['b01']['placement']
        evidence = [{**entry, 'triangles': [read_source_triangle(manifest, node, index, args.public_root)
                                          for node, index in entry['sourceTriangles']]} for entry in B1_ENTRY_SOURCES]
        result = generate_door_grades(json.loads(inputs['terrain']), model, placement, evidence)
        result.update({'sourceModelSha256': hashlib.sha256(inputs['model']).hexdigest(),
                       'sourceAlignmentSha256': hashlib.sha256(inputs['alignment']).hexdigest(),
                       'sourceManifestSha256': hashlib.sha256(inputs['manifest']).hexdigest(),
                       'sourceLicense': manifest['license'], 'sourceAttribution': manifest['attribution']})
    result.update({'rawTerrainSha256': hashlib.sha256(inputs['terrain']).hexdigest(),
                   'generatorSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
    if args.terrain.read_bytes() != inputs['terrain']:
        raise ValueError('Source DMR changed during generation')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    summary = {'building': args.building, 'bounds': result['bounds'], 'cells': len(result['cells']), 'vertices': len(result['positions']) // 3,
               'triangles': len(result['indices']) // 3, 'maxAdjustmentMetres': result['maxSourceVertexAdjustmentMetres']}
    if 'entries' in result:
        summary['entries'] = [{key: entry[key] for key in ('doorId', 'bounds', 'classification', 'sourcePlaneAtOutside', 'sourcePlaneAtThreshold',
                                                           'sourceDistanceAtOutsideMetres', 'maximumCoreDistanceToSourceMetres')} for entry in result['entries']]
    else:
        summary.update({'sourceAreaM2': sum(p['areaM2'] for p in result['regions']['sourceSupportedMask']),
                        'planeAreaM2': sum(p['areaM2'] for p in result['regions']['planeRegion']), 'frontPlaneHeights': result['frontConstraint']['planeHeights']})
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
