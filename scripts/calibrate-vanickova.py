"""Stage a photo-interpreted Vanickova footprint; --publish writes its source.

Run with Blender Python, from any directory. Source OSM and PID points remain
unchanged. This script is deliberately not a GTFS map matcher. Publishing does
not regenerate streets; fetch-streets.py performs the final material partition.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.cache/street-python'))
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
from shapely import make_valid
from pyproj import Transformer

DOCS = ROOT / 'docs/reality-pack/roads'


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(relative):
    return hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()


def parts(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [p for g in geometry.geoms for p in parts(g)]


def encode(p, precision=3):
    ring = lambda coords: [[round(x, precision), round(z, precision)] for x, z in list(coords)[:-1]]
    return {'outer': ring(p.exterior.coords), 'holes': [ring(r.coords) for r in p.interiors], 'area': round(p.area, 3)}


def source_geometry(streets):
    return {surface['material']: unary_union([make_valid(Polygon(p['outer'], p['holes'])) for p in surface['polygons']]) for surface in streets['surfaces']}


def samples(transit, streets, geometry):
    bounds = streets['bounds']
    roads = [(f, LineString(f['points'])) for f in streets['features'] if f['kind'] == 'road']
    result = []
    for shape_id, shape in transit['shapes'].items():
        for segment in range(1, len(shape)):
            a, b = shape[segment - 1], shape[segment]
            t = 0.0
            while t <= 1:
                x, z = a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t
                t += 0.1
                if not (bounds['minX']+3 <= x <= bounds['maxX']-3 and bounds['minZ']+3 <= z <= bounds['maxZ']-3):
                    continue
                point = Point(x, z)
                feature, line = min(roads, key=lambda row: row[1].distance(point))
                distance = line.distance(point)
                material = next((name for name, surface in geometry.items() if surface.covers(point)), None)
                result.append({'shapeId': shape_id, 'segment': segment, 'fraction': round(t-.1, 10), 'x': x, 'z': z,
                               'nearestFeature': feature['id'], 'name': feature['tags'].get('name'),
                               'distance': distance, 'width': feature['width'], 'widthProvenance': feature['widthProvenance'],
                               'outsideCorridor': distance >= feature['width']/2+.5, 'material': material})
    return result


def summarize(rows):
    bad = [r for r in rows if r['material'] != 'asphalt']
    corridor = [r for r in rows if r['outsideCorridor']]
    grouped = {}
    for row in bad:
        key = row['nearestFeature']
        group = grouped.setdefault(key, {'name': row['name'], 'count': 0, 'minX': math.inf, 'maxX': -math.inf, 'minZ': math.inf, 'maxZ': -math.inf, 'maxDistance': 0, 'width': row['width'], 'widthProvenance': row['widthProvenance']})
        group['count'] += 1
        for k, coordinate in [('X','x'),('Z','z')]:
            group['min'+k] = min(group['min'+k], row[coordinate])
            group['max'+k] = max(group['max'+k], row[coordinate])
        group['maxDistance'] = max(group['maxDistance'], row['distance'])
    return {'samples': len(rows), 'offAsphalt': len(bad), 'outsideCorridor': len(corridor), 'byFeature': grouped}


def photo_geometry(streets):
    controls = read('docs/reality-pack/roads/vanickova-control-points.json')
    origin = streets['origin']
    transform = Transformer.from_crs(3857, 4326, always_xy=True)
    polygons, features, sources = [], [], []
    for patch in controls['patches']:
        geo = read(patch['georeference'])
        assert digest(patch['image']) == geo['sha256'], patch['image']
        e = geo['extent']
        def world(pixel):
            u, v = pixel
            mx = e['xmin'] + u / geo['width'] * (e['xmax'] - e['xmin'])
            my = e['ymax'] - v / geo['height'] * (e['ymax'] - e['ymin'])
            lon, lat = transform.transform(mx, my)
            return [(lon-origin['lon'])*111320*math.cos(math.radians(origin['lat'])), -(lat-origin['lat'])*111320]
        polygon = Polygon([world(pixel) for pixel in patch['asphaltBoundaryPixels']])
        assert polygon.is_valid and polygon.area > 10
        polygons.append(polygon)
        centreline = [world(pixel) for pixel in patch['centrelinePixels']]
        # The manually marked axis is a guide. Centre it between the two
        # PHOTO boundaries along the local cross section, without consulting
        # a single PID point. Repeated projection handles the curved section.
        for iteration in range(4):
            centred = []
            for index, point in enumerate(centreline):
                pixel=patch['centrelinePixels'][index]
                if pixel[0] in [0,geo['width']] or pixel[1] in [0,geo['height']]:
                    # Image crop edges are not physical kerbs. Preserve the
                    # guide endpoint instead of centring against the crop.
                    centred.append(point)
                    continue
                a = centreline[max(0,index-1)]
                b = centreline[min(len(centreline)-1,index+1)]
                length = math.dist(a,b)
                dx,dz = (b[0]-a[0])/length,(b[1]-a[1])/length
                x,z=point
                section=LineString([(x-dz*30,z+dx*30),(x+dz*30,z-dx*30)]).intersection(polygon)
                if section.geom_type == 'LineString' and section.length > 5:
                    midpoint=section.interpolate(.5,normalized=True)
                    centred.append([midpoint.x,midpoint.y])
                else:
                    centred.append(point)
            centreline=centred
        for index, (a, b) in enumerate(zip(centreline, centreline[1:])):
            length = math.dist(a, b)
            dx, dz = (b[0]-a[0])/length, (b[1]-a[1])/length
            mx, mz = (a[0]+b[0])/2, (a[1]+b[1])/2
            cross_section = LineString([(mx-dz*30,mz+dx*30),(mx+dz*30,mz-dx*30)])
            width = cross_section.intersection(polygon).length
            assert 6 < width < 18, (patch['id'], index, width)
            features.append({'id': patch['id']+':'+str(index), 'nodeIds': [],
                'points': [[round(x,3),round(z,3)] for x,z in [a,b]], 'tags': {'name':'Vaníčkova','highway':'secondary','surface':'asphalt'},
                'width':round(width,3), 'widthProvenance':'ipr-2024-photo-cross-section-interpreted-not-measured',
                'isArea':False,'source':geo['source'],'kind':'road','surface':'asphalt',
                'surfaceProvenance':'ipr-2024-photo-interpreted','material':'asphalt',
                'renderArea':0,'length':round(length,3),'sourceOsmWayId':'124071290',
                'interpretationId':patch['id'],
                'centrelineProvenance':'manual-guide-centred-between-photo-kerb-boundaries-not-PID-matched'})
        sources.append({'id':patch['id'],'image':patch['image'],'sha256':geo['sha256'],
            'georeference':patch['georeference'],'captureDate':geo['captureDate'],'provider':geo['provider'],
            'license':geo['license'],'attribution':geo['attribution'],'url':geo['source'],
            'area':round(polygon.area,3),'worldBoundary':[[round(x,3),round(z,3)] for x,z in list(polygon.exterior.coords)[:-1]]})
    return unary_union(polygons), features, sources, controls


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit-only', action='store_true')
    parser.add_argument('--publish', action='store_true', help='Publish only source photo geometry; then run fetch-streets.py from cached OSM')
    args = parser.parse_args()
    streets, transit = read('shared/data/streets.json'), read('shared/data/transit.json')
    if args.publish:
        footprint, features, sources, controls = photo_geometry(streets)
        write(ROOT/'shared/data/road-calibration.json', {
            'schemaVersion':1,'origin':streets['origin'],'classification':controls['classification'],
            'estimatedBoundaryUncertaintyMetres':controls['estimatedBoundaryUncertaintyMetres'],
            'controlPoints':'docs/reality-pack/roads/vanickova-control-points.json',
            'controlPointsSha256':digest('docs/reality-pack/roads/vanickova-control-points.json'),
            'sources':sources,'photoFootprint':[encode(p) for p in parts(footprint)],'features':features,
            'rawOsmAndPidPreserved':True,
            'provenance':'Original IPR Praha orthophotos captured 2024-06-08; manually interpreted asphalt/kerb boundaries, not surveyed widths. Local axis is centred between photo boundaries without consulting PID. Original OSM centreline and PID coordinates are preserved.',
            'license':'CC-BY-4.0','licenseSource':'https://geoportalpraha.cz/data-a-sluzby/otevrena-data',
            'attribution':'datový podklad © IPR Praha'})
        print('Published photo source only, segments:',len(features))
        return
    geometry = source_geometry(streets)
    before = samples(transit, streets, geometry)
    audit = {'sourceHashes': {p: digest(p) for p in ['shared/data/streets.json','shared/data/transit.json','shared/data/map.json']},
             'before': summarize(before), 'samplesBefore': before}
    write(DOCS / 'vanickova-coverage-audit.json', audit)
    print(json.dumps(audit['before'], ensure_ascii=True, indent=2))
    if args.audit_only:
        return
    footprint, features, sources, controls = photo_geometry(streets)
    map_data = read('shared/data/map.json')
    buildings = unary_union([make_valid(Polygon(b['points'])) for b in map_data['buildings']])
    cutout = buildings.buffer(.025, join_style='mitre')
    occupied = unary_union(list(geometry.values()))
    additions = footprint.difference(cutout).difference(occupied)
    # Preserve disjoint source borders in the staging difference. The final
    # fetch-streets partition owns its existing millimetre export precision.
    encoded_additions = [encode(p, 9) for p in parts(additions) if p.area > .02]
    # Audit the exact rounded candidate geometry, not its higher precision precursor.
    rounded_additions = unary_union([make_valid(Polygon(p['outer'], p['holes'])) for p in encoded_additions])
    after_geometry = {**geometry, 'asphalt': geometry['asphalt'].union(rounded_additions)}
    after_streets = {**streets, 'features':streets['features']+features}
    after = samples(transit, after_streets, after_geometry)
    candidate = {'schemaVersion':1,'origin':streets['origin'],
        'classification':controls['classification'],'estimatedBoundaryUncertaintyMetres':controls['estimatedBoundaryUncertaintyMetres'],
        'sourceHashes':audit['sourceHashes'],'controlPoints':'docs/reality-pack/roads/vanickova-control-points.json',
        'sources':sources,'photoFootprint':[encode(p) for p in parts(footprint)],
        'material':'asphalt','additions':encoded_additions,'features':features,
        'rawOsmAndPidPreserved':True,'otherMaterialOverlapArea':round(rounded_additions.intersection(unary_union([g for name,g in geometry.items() if name!='asphalt'])).area,9),
        'buildingOverlapArea':round(rounded_additions.intersection(buildings).area,9),
        'existingAsphaltOverlapArea':round(rounded_additions.intersection(geometry['asphalt']).area,9),
        'addedArea':round(rounded_additions.area,3),'before':summarize(before),'after':summarize(after)}
    write(ROOT / '.cache/vanickova-calibration-candidate.json',candidate)
    write(DOCS / 'vanickova-calibration-candidate.json',candidate)
    audit['after'] = candidate['after']
    audit['samplesAfter'] = after
    write(DOCS / 'vanickova-coverage-audit.json',audit)
    print(json.dumps({k:candidate[k] for k in ['addedArea','buildingOverlapArea','otherMaterialOverlapArea','existingAsphaltOverlapArea','after']},ensure_ascii=True,indent=2))
    if candidate['after']['offAsphalt'] or candidate['after']['outsideCorridor']:
        raise SystemExit('Candidate still fails source coverage; inspect the uncovered point against the photograph.')


if __name__ == '__main__':
    main()
