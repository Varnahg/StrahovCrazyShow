"""Derive runtime polygons from the saved collision mesh, without CAD or Blender.

Requires Shapely 2. No XY snapping, hull, morphological closing or height inference:
source triangles and explicit model terrain cutouts are the only spatial inputs.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile

import shapely
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

SURFACE_ROLES = frozenset(('slab', 'stair', 'stair-landing', 'canopy'))
PLANE_DIGITS = 8
PLANE_RESIDUAL_METRES = 1e-5
NORMAL_Y_MIN = 1e-8


def polygons(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    if geometry.geom_type in ('MultiPolygon', 'GeometryCollection'):
        return [p for child in geometry.geoms for p in polygons(child)]
    raise ValueError('Unexpected non-polygon union: ' + geometry.geom_type)


def canonical_loop(ring):
    coords = [(float(x), float(z)) for x, z in list(ring.coords)[:-1]]
    first = min(range(len(coords)), key=coords.__getitem__)
    return [list(p) for p in coords[first:] + coords[:first]]


def polygon_record(polygon, identifier, sources):
    polygon = orient(polygon, sign=1)
    exterior = canonical_loop(polygon.exterior)
    holes = sorted(canonical_loop(ring) for ring in polygon.interiors)
    min_x, min_z, max_x, max_z = polygon.bounds
    return {'id': identifier,
            'bounds': {'minX': min_x, 'minZ': min_z, 'maxX': max_x, 'maxZ': max_z},
            'loops': [exterior, *holes], 'sourcePartIds': sorted(sources)}


def ordered_polygons(geometry):
    return sorted(polygons(geometry), key=lambda p: (*p.bounds, p.area, p.wkb_hex))


def checked_union(items):
    result = unary_union(items)
    if not result.is_valid:
        raise ValueError('Invalid projected union; refusing to repair source geometry implicitly')
    return result


def validate_hash(value, name):
    if not isinstance(value, str) or not re.fullmatch('[a-f0-9]{64}', value):
        raise ValueError('Invalid ' + name)
    return value


def explicit_regions(items, kind):
    result, seen = [], set()
    for item in items:
        identifier = item['id']
        if not isinstance(identifier, str) or not identifier or identifier in seen:
            raise ValueError('Duplicate or invalid explicit ' + kind)
        seen.add(identifier)
        loops = item['loops']
        if not loops or any(len(loop) < 3 for loop in loops) or not all(
                len(point) == 2 and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in point)
                for loop in loops for point in loop):
            raise ValueError('Invalid explicit terrain loop: ' + identifier)
        geometry = Polygon(loops[0], loops[1:])
        if not geometry.is_valid or geometry.area == 0:
            raise ValueError('Invalid explicit terrain polygon: ' + identifier)
        result.append((identifier, geometry, item))
    return result


def projected_faces(part):
    """Yield orientation, plane, projected triangle for every nonvertical source face."""
    positions, indices = part['positions'], part['indices']
    if len(positions) % 3 or len(indices) % 3:
        raise ValueError('Unaligned triangle buffers: ' + part['id'])
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
               for v in positions):
        raise ValueError('Non-finite position: ' + part['id'])
    count = len(positions) // 3
    if not all(isinstance(i, int) and not isinstance(i, bool) and 0 <= i < count for i in indices):
        raise ValueError('Invalid triangle index: ' + part['id'])
    for offset in range(0, len(indices), 3):
        p, q, r = [positions[3*i:3*i+3] for i in indices[offset:offset+3]]
        u, v = [q[i]-p[i] for i in range(3)], [r[i]-p[i] for i in range(3)]
        nx, ny, nz = u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]
        normal_length = math.sqrt(nx*nx + ny*ny + nz*nz)
        if normal_length == 0:
            raise ValueError('Degenerate triangle: ' + part['id'])
        if abs(ny) <= NORMAL_Y_MIN * normal_length:
            continue
        a, b = -nx/ny, -nz/ny
        plane = tuple(round(value, PLANE_DIGITS) for value in (a, b, p[1]-a*p[0]-b*p[2]))
        if max(abs(vertex[1] - (plane[0]*vertex[0] + plane[1]*vertex[2] + plane[2]))
               for vertex in (p, q, r)) > PLANE_RESIDUAL_METRES:
            raise ValueError('Plane quantization exceeds tolerance: ' + part['id'])
        triangle = Polygon([(vertex[0], vertex[2]) for vertex in (p, q, r)])
        if not triangle.is_valid or triangle.area == 0:
            raise ValueError('Invalid projected triangle: ' + part['id'])
        yield 'support' if ny > 0 else 'cover', plane, triangle


def derive_site(model, collision_sha256):
    if model.get('schemaVersion') != 1 or not isinstance(model.get('id'), str) or not model['id']:
        raise ValueError('Unsupported collision model identity')
    hashes = {'sourceCollisionSha256': validate_hash(collision_sha256, 'collision SHA-256'),
              'sourceBlendSha256': validate_hash(model.get('blendSha256'), 'blend SHA-256'),
              'sourceGlbSha256': validate_hash(model.get('glbSha256'), 'GLB SHA-256')}
    supports, covers, slabs, roofs, slab_sources = [], [], [], [], []
    part_ids, selected_triangles = set(), 0
    for part in model['parts']:
        part_id = part['id']
        if not isinstance(part_id, str) or not part_id or part_id in part_ids:
            raise ValueError('Duplicate or invalid part ID')
        part_ids.add(part_id)
        if part['role'] not in SURFACE_ROLES:
            continue
        if not isinstance(part.get('floor'), str):
            raise ValueError('Missing part floor: ' + part_id)
        groups, projections = {}, []
        selected_triangles += len(part['indices']) // 3
        for side, plane, triangle in projected_faces(part):
            groups.setdefault((side, plane), []).append(triangle)
            if part['role'] == 'slab':
                projections.append(triangle)
        for (side, plane), triangles in sorted(groups.items()):
            target = supports if side == 'support' else covers
            for polygon in ordered_polygons(checked_union(triangles)):
                record = polygon_record(polygon, f'{part_id}:{side}:{len(target):05d}', [part_id])
                record.update(partId=part_id, floor=part['floor'], role=part['role'],
                              plane=dict(zip(('a', 'b', 'c'), plane)))
                target.append(record)
        if projections:
            projected = checked_union(projections)
            is_roof = part_id.endswith(':slab:roof')
            slabs.append(projected)
            if is_roof:
                roofs.append(projected)
            slab_sources.append((part_id, projected, is_roof))
    if not slabs or not roofs or not supports or not covers:
        raise ValueError('Model lacks slab/roof/support/cover geometry')
    explicit_sources = explicit_regions(model.get('terrainCutouts', []), 'terrain cutout')
    preserved_sources = explicit_regions(model.get('terrainPreservationAreas', []), 'terrain preservation area')
    slab_union, roof_union = checked_union(slabs), checked_union(roofs)
    footprint = checked_union([slab_union, *(item[1] for item in explicit_sources)])
    if preserved_sources:
        footprint = footprint.difference(checked_union([item[1] for item in preserved_sources]))
        if not footprint.is_valid:
            raise ValueError('Invalid footprint after explicit terrain preservation')
    cutouts = []
    for index, polygon in enumerate(ordered_polygons(footprint)):
        sources = [part_id for part_id, geometry, _ in slab_sources if polygon.intersection(geometry).area > 0]
        sources.extend('terrain-cutout:' + identifier for identifier, geometry, _ in explicit_sources
                       if polygon.intersection(geometry).area > 0)
        cutouts.append(polygon_record(polygon, f'{model["id"]}:terrain:{index:03d}', sources))
    return {
        'schemaVersion': 1, 'id': model['id'], **hashes,
        'coordinateSystem': 'model local metres; +X east, +Y up, +Z south; no world placement applied',
        'terrainCutouts': cutouts, 'supportSurfaces': supports, 'coverSurfaces': covers,
        'derivation': {
            'method': 'actual slab projections plus explicit cutouts, minus explicit buried-space terrain preservation; holes preserved',
            'surfaceMethod': 'oriented slab/stair/stair-landing/canopy triangles grouped by plane and part; exterior canopy does not cut ground',
            'shapelyVersion': shapely.__version__, 'planeDigits': PLANE_DIGITS,
            'maxPlaneResidualMetres': PLANE_RESIDUAL_METRES, 'normalYMinimum': NORMAL_Y_MIN,
            'sourceCoordinateSystem': model.get('coordinateSystem'),
            'sourcePartCount': len(model['parts']), 'selectedTriangleCount': selected_triangles,
            'slabParts': [{'partId': identifier, 'isRoof': is_roof, 'projectedAreaM2': geometry.area,
                           'outsideRoofAreaM2': geometry.difference(roof_union).area}
                          for identifier, geometry, is_roof in slab_sources],
            'roofPartIds': [identifier for identifier, _, is_roof in slab_sources if is_roof],
            'slabUnionAreaM2': slab_union.area, 'roofUnionAreaM2': roof_union.area,
            'lowerFloorOutsideRoofAreaM2': slab_union.difference(roof_union).area,
            'explicitTerrainCutouts': [{'id': identifier, 'projectedAreaM2': geometry.area,
                                        'source': source} for identifier, geometry, source in explicit_sources],
            'terrainPreservationAreas': [{'id': identifier, 'projectedAreaM2': geometry.area,
                                         'source': source} for identifier, geometry, source in preserved_sources],
            'terrainCutoutAreaM2': footprint.area,
            'sourcePartIdConvention': 'terrain-cutout:<id> refers to explicit collision-model metadata, all other IDs are collision parts',
        },
    }


def export_site(model_path, output_path):
    model_path, output_path = Path(model_path), Path(output_path)
    if model_path.resolve() == output_path.resolve():
        raise ValueError('Output must not replace the source model')
    source = model_path.read_bytes()
    site = derive_site(json.loads(source), hashlib.sha256(source).hexdigest())
    payload = (json.dumps(site, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output_path.parent, prefix=output_path.name+'.', suffix='.tmp', delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output_path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return site


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    site = export_site(args.model, args.output)
    print(json.dumps({'id': site['id'], 'sourceCollisionSha256': site['sourceCollisionSha256'],
                      'terrainPolygons': len(site['terrainCutouts']), 'supportSurfaces': len(site['supportSurfaces']),
                      'coverSurfaces': len(site['coverSurfaces']), 'output': str(args.output)}))


if __name__ == '__main__':
    main()
