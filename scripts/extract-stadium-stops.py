import zipfile,csv,io,math,json,xml.etree.ElementTree as ET,hashlib
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
root=Path(__file__).resolve().parents[1]
z=zipfile.ZipFile(root/'.cache/PID_GTFS.zip')
def rows(file):return csv.DictReader(io.TextIOWrapper(z.open(file),encoding='utf-8-sig',newline=''))
stops={r['stop_id']:r for r in rows('stops.txt') if r['stop_name']=='Stadion Strahov'}
routes={r['route_id'] for r in rows('routes.txt') if r['route_short_name']=='191'}
trips={r['trip_id']:r.get('trip_headsign','') for r in rows('trips.txt') if r['route_id'] in routes}
served=set()
heads={}
for r in rows('stop_times.txt'):
 if r['stop_id'] in stops and r['trip_id'] in trips:
  served.add(r['stop_id']);heads.setdefault(r['stop_id'],set()).add(trips[r['trip_id']])
output=[]
for sid,s in stops.items():
 output.append({'id':sid,'lat':float(s['stop_lat']),'lon':float(s['stop_lon']),'x':round((float(s['stop_lon'])-14.39175)*111320*math.cos(math.radians(50.08065)),3),'z':round((50.08065-float(s['stop_lat']))*111320,3),'servedBy191':sid in served,'platformCode':s.get('platform_code'),'parentStation':s.get('parent_station'),'headsigns191':sorted(heads.get(sid,[]))})
print(json.dumps(output,ensure_ascii=False,indent=2),flush=True)
(root/'.cache/stadium-stops-191.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
osm=[]
for node in ET.parse(root/'.cache/osm.xml').getroot().findall('node'):
 tags={t.get('k'):t.get('v') for t in node.findall('tag')}
 if tags.get('name')=='Stadion Strahov' and ('public_transport' in tags or tags.get('highway')=='bus_stop'):
  lat,lon=float(node.get('lat')),float(node.get('lon'))
  osm.append({'osmId':node.get('id'),'x':round((lon-14.39175)*111320*math.cos(math.radians(50.08065)),3),'z':round((50.08065-lat)*111320,3),'tags':tags})
result={'schemaVersion':1,'checkedAt':'2026-10-10','source':'https://data.pid.cz/PID_GTFS.zip','gtfsSha256':hashlib.sha256((root/'.cache/PID_GTFS.zip').read_bytes()).hexdigest(),'officialLine':'https://pid.cz/zastavkove-jizdni-rady/?cid=191&from=1787954400&type=bus','platforms':[s for s in output if s['servedBy191']],'osmPlatforms':osm,'limitations':'Static official GTFS positions and OSM stop objects, not survey or live vehicle positions. 191 timetable/vehicle simulation not added by this waypoint dataset.'}
(root/'shared/data/stadium-stops.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'osmPlatforms':osm},ensure_ascii=False,indent=2),flush=True)
