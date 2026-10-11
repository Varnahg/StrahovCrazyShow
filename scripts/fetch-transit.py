"""Download public PID GTFS and retain actual 143/149 services and campus shapes.
Python stdlib only. No account, realtime key or fabricated timetable required.
"""
import csv, datetime, hashlib, io, json, math, pathlib, urllib.request, zipfile, argparse, heapq

ROOT = pathlib.Path(__file__).resolve().parents[1]
URL = 'https://data.pid.cz/PID_GTFS.zip'
parser = argparse.ArgumentParser()
parser.add_argument('--cached', action='store_true')
args = parser.parse_args()
cache = ROOT / '.cache/PID_GTFS.zip'
cache.parent.mkdir(exist_ok=True)
if not args.cached:
    urllib.request.urlretrieve(URL, cache)
z = zipfile.ZipFile(cache)
def rows(name):
    # newline='' handles the CRCRLF supplied by the current publisher.
    return csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig', newline=''))
origin = json.loads((ROOT/'shared/data/map.json').read_text(encoding='utf-8'))['origin']
def xy(lat, lon):
    return [round((lon-origin['lon'])*111320*math.cos(math.radians(origin['lat'])),3),
            round((origin['lat']-lat)*111320,3)]
routes = {r['route_id']:r for r in rows('routes.txt') if r['route_short_name'] in ['143','149']}
trips = {r['trip_id']:r for r in rows('trips.txt') if r['route_id'] in routes}
shape_ids = {r['shape_id'] for r in trips.values()}
shapes = {s:[] for s in shape_ids}
for r in rows('shapes.txt'):
    if r['shape_id'] in shapes:
        x,y=xy(float(r['shape_pt_lat']),float(r['shape_pt_lon']))
        shapes[r['shape_id']].append([int(r['shape_pt_sequence']),x,y,float(r['shape_dist_traveled'])])
# Full clipping window includes stadium stops and road approaches beyond walk bounds.
window = [-230,470,-300,280]
trimmed = {}
for sid, points in shapes.items():
    points.sort()
    inside=[i for i,p in enumerate(points) if window[0]<=p[1]<=window[1] and window[2]<=p[2]<=window[3]]
    if not inside: continue
    start,end=max(0,min(inside)-1),min(len(points),max(inside)+2)
    trimmed[sid]=[[p[1],p[2],p[3]] for p in points[start:end]]
trips={k:v for k,v in trips.items() if v['shape_id'] in trimmed}
times = {s:[] for s in trips}
def seconds(value):
    h,m,s=map(int,value.split(':')); return h*3600+m*60+s
used_stops=set()
for r in rows('stop_times.txt'):
    if r['trip_id'] not in times: continue
    times[r['trip_id']].append([int(r['stop_sequence']),r['stop_id'],seconds(r['arrival_time']),
        seconds(r['departure_time']),float(r.get('shape_dist_traveled') or 0),int(r.get('drop_off_type') or 0)])
    used_stops.add(r['stop_id'])
stops={}
for r in rows('stops.txt'):
    if r['stop_id'] in used_stops:
        x,y=xy(float(r['stop_lat']),float(r['stop_lon']))
        stops[r['stop_id']]={'name':r['stop_name'],'x':x,'z':y,'lat':float(r['stop_lat']),'lon':float(r['stop_lon'])}
services={r['service_id'] for r in trips.values()}
calendar={r['service_id']:{'start':r['start_date'],'end':r['end_date'],
    'week':[int(r[d]) for d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']]}
    for r in rows('calendar.txt') if r['service_id'] in services}
exceptions=[{'service':r['service_id'],'date':r['date'],'type':int(r['exception_type'])}
    for r in rows('calendar_dates.txt') if r['service_id'] in services]
output_trips=[]
for tid,r in trips.items():
    t=sorted(times[tid]); shape=trimmed[r['shape_id']]
    # Keep bracketing stops so interpolation retains real times across both edges.
    lo,hi=shape[0][2],shape[-1][2]
    indexes=[i for i,p in enumerate(t) if lo<=p[4]<=hi]
    if not indexes: continue
    begin, end=max(0,min(indexes)-1),min(len(t),max(indexes)+2)
    t=t[begin:end]
    output_trips.append({'id':tid,'route':routes[r['route_id']]['route_short_name'],
        'service':r['service_id'],'headsign':r['trip_headsign'],'direction':int(r['direction_id']),
        'shape':r['shape_id'],'stops':[p[1:] for p in t]})
used_stops={p[0] for t in output_trips for p in t['stops']}
info=next(rows('feed_info.txt'))
out={'schemaVersion':1,'source':URL,'publisher':'ROPID / Pražská integrovaná doprava',
    'license':'CC-BY-4.0','licenseSource':'https://pid.cz/o-systemu/opendata/',
    'downloadedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sha256':hashlib.sha256(cache.read_bytes()).hexdigest(),'start':info['feed_start_date'],'end':info['feed_end_date'],
    'timezone':'Europe/Prague','origin':origin,'clip':window,
    'modifications':'Only lines 143 and 149; shapes clipped to campus approach; coordinates converted to local metres; stop_times retained around clipping edges.',
    'routes':{r['route_short_name']:{'id':r['route_id'],'name':r['route_long_name'],'url':r['route_url']} for r in routes.values()},
    'calendar':calendar,'exceptions':exceptions,'stops':{k:v for k,v in stops.items() if k in used_stops},
    'shapes':trimmed,'trips':output_trips}
path=ROOT/'shared/data/transit.json'
path.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'{len(output_trips)} trips, {len(trimmed)} shapes, {len(used_stops)} stops; {out["start"]}–{out["end"]}; {path.stat().st_size} bytes')

# Canonical north-facing passenger paths are rebuilt by fetch-transit.mjs
# through scripts/rebuild-campus-transit-navigation.ts after this import.
