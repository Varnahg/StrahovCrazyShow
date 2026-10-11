"""Extract mapped land cover from the archived OSM bbox; never infer surveyed grass."""
import json,math,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
coverage=json.loads((ROOT/'shared/data/campus-coverage.json').read_text(encoding='utf-8'))
bb=coverage['osmBBox']
tree=ET.parse(ROOT/'.cache/osm.xml').getroot()
nodes={n.attrib['id']:(float(n.attrib['lat']),float(n.attrib['lon'])) for n in tree.findall('node')}
def xy(lat,lon):return [round((lon-14.39175)*111320*math.cos(math.radians(50.08065)),2),round((50.08065-lat)*111320,2)]
areas=[];trees=[]
for way in tree.findall('way'):
 tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
 if tags.get('landuse') in ['grass','forest','meadow'] or tags.get('natural') in ['grassland','wood','scrub'] or tags.get('leisure') in ['pitch','park','garden']:
  points=[xy(*nodes[n.attrib['ref']]) for n in way.findall('nd') if n.attrib['ref'] in nodes]
  if len(points)>3 and points[0]==points[-1]:areas.append({'osmId':way.attrib['id'],'kind':tags.get('landuse') or tags.get('natural') or tags.get('leisure'),'surface':tags.get('surface'),'points':points,'source':'OSM mapped area; not a vegetation survey'})
for n in tree.findall('node'):
 tags={t.attrib['k']:t.attrib['v'] for t in n.findall('tag')}
 if tags.get('natural')=='tree':
  x,z=xy(*nodes[n.attrib['id']]);trees.append({'osmId':n.attrib['id'],'x':x,'z':z,'species':tags.get('species')})
data={'source':'https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(str(bb[k]) for k in ['west','south','east','north']),'attribution':'© OpenStreetMap contributors · ODbL','areas':areas,'trees':trees}
(ROOT/'shared/data/landcover.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'areas':len(areas),'mappedTrees':len(trees)}))
