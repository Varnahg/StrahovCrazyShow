import collections
import json
import math
import sys
from pathlib import Path

import numpy as np
import shapely
from shapely import STRtree


root = Path(sys.argv[1]).resolve()
assert root.drive.upper() == 'D:'
manifest = json.loads((root / 'meshes.json').read_text(encoding='utf-8'))
meshes = manifest['metadata']
records = np.memmap(root / 'triangles.bin', dtype=[('xyz', '<f4', (3, 3)), ('mesh', '<u4'), ('triangle', '<u4')], mode='r')
assert len(records) == manifest['triangleCount']
tri = records['xyz'].astype(np.float64)
mesh_id = records['mesh']
normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
area2 = np.linalg.norm(normal, axis=1)
valid = np.isfinite(tri).all(axis=(1, 2)) & (area2 > 2e-10)
normal[valid] /= area2[valid, None]
axis = np.abs(normal).argmax(axis=1)
direction = np.sign(normal[np.arange(len(normal)), axis])
normal *= direction[:, None]
groups = collections.defaultdict(list)
for i in np.flatnonzero(valid):
    # Combine directions modulo sign. UV, material and mesh ownership play no role in this search.
    key = (int(axis[i]), *[int(t) for t in np.rint(normal[i] * 100)])
    groups[key].append(i)

families = [m['name'].split(' ', 1)[0] if not m['name'].startswith('outdoor-artifact:') else 'outdoor-artifact' for m in meshes]
asset = [m['source'] for m in meshes]
lod = [m['lod'] for m in meshes]
pair_counts = collections.Counter()
found = {}
coverage = collections.Counter()


def meshes_can_coexist(a, b):
    return not (asset[a] and asset[a] == asset[b] and families[a] == families[b]
                and {lod[a], lod[b]} == {'near', 'far'})


def group_result(a, b, p, gap, surface, opposing, first_index, second_index):
    m, n = meshes[a], meshes[b]
    terrain = 'source-dmr5g-terrain' in (m['name'], n['name'])
    if terrain and ((m['zOffset'] or n['zOffset']) or (m['zOffsetUnits'] or n['zOffsetUnits'])):
        category = 'terrain with depth-biased overlay'
    elif opposing and m['cull'] and n['cull']:
        category = 'opposing culled faces'
    elif m['alpha'] < 0.999 or n['alpha'] < 0.999 or not m['cull'] or not n['cull']:
        category = 'transparent or double-sided'
    else:
        category = 'opaque competing faces'
    separation = 'coincident' if gap <= 0.00015 else 'close'
    pair_counts[(category, separation)] += 1
    names = (m['name'], n['name'])
    # A mesh can span the map. Keep distinct locations for such batches and for large landmarks.
    region = tuple(math.floor(p[j] / 12) for j in (0, 2)) if (not m['source'] or not n['source'] or 'landmark stadium' in ' '.join(names)) else ()
    key = (category, separation, min(a, b), max(a, b), region)
    if key not in found:
        found[key] = dict(category=category, separation=separation, meshes=[m, n],
                          trianglePairs=0, areaSum=0.0, minGapMm=float('inf'), maxGapMm=0.0, examples=[])
    row = found[key]
    row['trianglePairs'] += 1
    row['areaSum'] += surface
    row['minGapMm'] = min(row['minGapMm'], gap * 1000)
    row['maxGapMm'] = max(row['maxGapMm'], gap * 1000)
    examples = row['examples']
    if len(examples) < 3 or surface > examples[-1]['area']:
        examples.append(dict(point=[round(float(x), 5) for x in p], area=round(float(surface), 8),
                             gapMm=round(float(gap * 1000), 6), triangles=[int(records['triangle'][first_index]), int(records['triangle'][second_index])]))
        examples.sort(key=lambda x: -x['area'])
        del examples[3:]


for key, owned in sorted(groups.items(), key=lambda pair: -len(pair[1])):
    if len(owned) < 2:
        continue
    dominant = key[0]
    flat = [x for x in (0, 1, 2) if x != dominant]
    ids = np.array(owned, dtype=np.intp)
    triangles = tri[ids]
    poly = shapely.polygons(triangles[:, :, flat])
    tree = STRtree(poly)
    dominant_min = triangles[:, :, dominant].min(axis=1)
    dominant_max = triangles[:, :, dominant].max(axis=1)
    ns = normal[ids]
    constant = np.sum(ns * triangles[:, 0], axis=1)
    for start in range(0, len(ids), 350):
        a, b = tree.query(poly[start:start+350])
        a += start
        keep = (a < b) & (dominant_min[a] <= dominant_max[b] + 0.022) & (dominant_min[b] <= dominant_max[a] + 0.022)
        a, b = a[keep], b[keep]
        if len(a) == 0:
            continue
        mask = np.array([meshes_can_coexist(int(mesh_id[ids[i]]), int(mesh_id[ids[j]])) for i, j in zip(a, b)])
        a, b = a[mask], b[mask]
        if len(a) == 0:
            continue
        # Require near-parallel planes. Test signed separation on the projected intersection vertices.
        keep = np.sum(ns[a] * ns[b], axis=1) >= math.cos(math.radians(0.12))
        a, b = a[keep], b[keep]
        if len(a) == 0:
            continue
        overlap = shapely.intersection(poly[a], poly[b])
        area = shapely.area(overlap) / ns[a, dominant]
        use = area >= 0.000001
        a, b, overlap, area = a[use], b[use], overlap[use], area[use]
        if len(a) == 0:
            continue
        coordinates, owners = shapely.get_coordinates(overlap, return_index=True)
        aa, bb = a[owners], b[owners]
        plane_a = (constant[aa] - np.sum(ns[aa][:, flat] * coordinates, axis=1)) / ns[aa, dominant]
        plane_b = (constant[bb] - np.sum(ns[bb][:, flat] * coordinates, axis=1)) / ns[bb, dominant]
        # Measure maximum absolute gap throughout the overlapping patch.
        worst = np.zeros(len(a))
        np.maximum.at(worst, owners, np.abs(plane_a - plane_b))
        use = worst <= 0.015
        if not use.any():
            continue
        a, b, overlap, area, worst = a[use], b[use], overlap[use], area[use], worst[use]
        center = shapely.get_coordinates(shapely.point_on_surface(overlap))
        height = (constant[a] - np.sum(ns[a][:, flat] * center, axis=1)) / ns[a, dominant]
        for i, j, uv, h, gap, surface in zip(ids[a], ids[b], center, height, worst, area):
            p = [0.0, 0.0, 0.0]
            p[dominant], p[flat[0]], p[flat[1]] = h, *uv
            mi, mj = int(mesh_id[i]), int(mesh_id[j])
            same = direction[i] == direction[j]
            group_result(mi, mj, p, gap, float(surface), not same, i, j)
    coverage[dominant] += len(ids)

rows = sorted(found.values(), key=lambda r: (r['category'], r['separation'], -r['areaSum']))
summary = dict(sourceCommit=manifest['sourceCommit'], triangles=len(records), meshes=len(meshes),
               validTriangles=int(valid.sum()), orientationGroupedTriangles=sum(coverage.values()),
               sources=len(manifest['pivots']),
               maxPivotBaseline=max(p['baseline'] for p in manifest['pivots'].values()),
               maxPivotTranslationError=max(p['translation'] for p in manifest['pivots'].values()),
               pivotVertices=sum(p['vertices'] for p in manifest['pivots'].values()),
               terrainHits=manifest['terrainHits'], cadBytes=manifest['cadBytes'],
               categories={f'{a} / {b}': n for (a, b), n in pair_counts.items()},
               locations={f'{a} / {b}': n for (a, b), n in collections.Counter((r['category'], r['separation']) for r in rows).items()},
               uvZero=sum(m['uvZero'] for m in meshes), uvInvalid=sum(m['uvInvalid'] for m in meshes),
               normalInvalid=sum(m['normalInvalid'] for m in meshes))
(root / 'locations.json').write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
(root / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=True, indent=2))
