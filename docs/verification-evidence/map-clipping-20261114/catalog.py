import collections
import csv
import json
import sys
from pathlib import Path


raw = Path(sys.argv[1]).resolve()
output = Path(__file__).resolve().parent
rows = json.loads((raw / 'locations.json').read_text(encoding='utf-8'))
summary = json.loads((raw / 'summary.json').read_text(encoding='utf-8'))
manifest = json.loads((raw / 'meshes.json').read_text(encoding='utf-8'))
metadata = manifest['metadata']
counts = collections.Counter()
potential = collections.defaultdict(lambda: [0, 0.0, 0, None])


def identity(mesh):
    return tuple(mesh[k] for k in ('name', 'source', 'lod', 'material', 'triangles'))


by_identity = {identity(mesh): mesh for mesh in metadata}


def role(mesh):
    name = mesh['name']
    if name.startswith('cad-door-batch:'):
        return 'CAD door runtime batch'
    if ':entry:' in name:
        return 'CAD interior entry view'
    if name.startswith(('b01:', 'b06:')):
        return 'CAD ' + name.split(':', 3)[2]
    if name.startswith('building foundation '):
        return 'foundation'
    return mesh['material']


with (output / 'locations.csv').open('w', newline='', encoding='utf-8-sig') as stream:
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(['category', 'separation', 'asset_a', 'lod_a', 'mesh_a', 'material_a', 'asset_b', 'lod_b',
                     'mesh_b', 'material_b', 'x_m', 'y_m', 'z_m', 'pair_count', 'area_sum_m2', 'min_gap_mm',
                     'max_gap_mm', 'triangle_a', 'triangle_b'])
    for row in rows:
        a, b = (by_identity[identity(mesh)] for mesh in row['meshes'])
        category = row['category']
        names = (a['name'], b['name'])
        # Keep these alternative draw sources in the raw catalog.
        if any(name.startswith('sign source ') for name in names):
            category = 'hidden road-sign instance template'
        elif any(':entry:' in name for name in names) or any(name.startswith('b06:') and ':door-' in name
                and not item['enabledAtBuild'] and not name.split(':')[2].startswith('door-frame')
                for name, item in zip(names, (a, b))):
            category = 'CAD visibility variant or retired source'
        elif any('lamp-pool' in name for name in names):
            category = 'lamp glow with depth writes disabled'
        elif any('ground-paint' in name or 'markings' in name or 'bay-lines' in name or 'road-paint' in name for name in names):
            category = 'authored ground markings'
        elif 'mapped-flush-material-joints' in names:
            category = 'authored depth-biased pavement junction'
        elif any(m.get('blended') or m.get('alphaTest') for m in (a, b)):
            category = 'blended or alpha-tested material'
        elif a['cull'] and b['cull'] and 'side' in a and 'side' in b and category in ('opaque competing faces', 'opposing culled faces'):
            flipped = (a['side'], a['cullBackFaces']) != (b['side'], b['cullBackFaces'])
            if flipped:
                category = 'opaque competing faces' if category == 'opposing culled faces' else 'opposing culled faces'
        counts[category] += 1
        p = row['examples'][0]
        writer.writerow([category, row['separation'], a['source'], a['lod'], a['name'], a['material'], b['source'], b['lod'],
                         b['name'], b['material'], *p['point'], row['trianglePairs'], round(row['areaSum'], 7),
                         round(row['minGapMm'], 5), round(row['maxGapMm'], 5), *p['triangles']])
        if category == 'opaque competing faces':
            key = (a['source'] or b['source'] or 'surface without asset root', row['separation'], *sorted((role(a), role(b))))
            value = potential[key]
            value[0] += row['trianglePairs']
            value[1] += row['areaSum']
            value[2] += 1
            if value[3] is None or p['area'] > value[3]['area']:
                value[3] = p

ranked = sorted(potential.items(), key=lambda x: -x[1][1])
summary['catalogEntries'] = dict(counts)
summary['roofUvMismatch'] = manifest['roofUv']
summary['collapsedUvMeshes'] = [{key: item[key] for key in ('name', 'material', 'uvZero', 'triangles')}
                               for item in metadata if item['uvZero']]
summary['topOpaqueGroups'] = [dict(asset=k[0], separation=k[1], materials=k[2:], trianglePairs=v[0],
                                   areaSum=round(v[1], 7), groups=v[2], example=v[3]) for k, v in ranked[:30]]
(output / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'catalog': dict(counts), 'top': summary['topOpaqueGroups'][:15]}, ensure_ascii=True, indent=2))
