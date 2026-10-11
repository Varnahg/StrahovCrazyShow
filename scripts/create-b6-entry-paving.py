"""Small source-informed native-entry connection, not a surveyed new OSM way."""
import sys,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.cache/street-python'))
from shapely.geometry import Polygon,LineString,box
from shapely.ops import unary_union
from shapely import make_valid
streets_path=ROOT/'shared/data/streets.json';streets=json.loads(streets_path.read_text(encoding='utf8'))
map_path=ROOT/'shared/data/map.json';world=json.loads(map_path.read_text(encoding='utf8'))
photo_path=ROOT/'docs/reality-pack/facade-study/b6-entry-path-audit.json';photo=json.loads(photo_path.read_text(encoding='utf8'))
anchor=[-11.233297668965756,-84.08451212422128]
points=[anchor,[-8.4,-83.7],[-4.85,-82.2],[-4.85,-81.4]]
line=LineString(points);footprint=line.buffer(.9,cap_style=2,join_style=2).union(box(-6.15,-82.6,-3.55,-81.4))
original=unary_union([make_valid(Polygon(p['outer'],p['holes']))for s in streets['surfaces']for p in s['polygons'] if Polygon(p['outer']).intersects(footprint)])
buildings=unary_union([Polygon(b['points']).buffer(.025,join_style=2)for b in world['buildings']])
surface=footprint.difference(original).difference(buildings)
parts=list(surface.geoms)if hasattr(surface,'geoms')else[surface]
polygons=[{'outer':[[round(x,8),round(z,8)]for x,z in p.exterior.coords][:-1],'holes':[[[round(x,8),round(z,8)]for x,z in ring.coords][:-1]for ring in p.interiors],'area':p.area}for p in parts if p.area>.001]
assert sum(p['area']for p in polygons)>5
data={'schemaVersion':1,'id':'b6-north-entry-native-connector','classification':'photo-informed-native-entry-adaptation-not-surveyed','measured':False,'positionUncertaintyMetres':2,'material':'paving','widthMetres':1.8,'points':points,'polygons':polygons,'sourceOsmWayId':'25920440','sourceStreetSha256':hashlib.sha256(streets_path.read_bytes()).hexdigest(),'sourcePhotoSha256':photo['sha256'],'sourcePhotoCaptureDate':photo['captureDate'],'sourcePhotoUrl':photo['url'],'nativeEntry':photo['entryNative'],'note':'Mapped west-side footway anchor follows OSM25920440. A short diagonal approach and north landing adapt the photo-informed portal to the native schematic B6 entry; deep ortho shadows and native registration uncertainty prevent a claim of surveyed edges. This does not invent a straight road-to-door strip on x=-4.85. Existing street material polygons and building footprints are subtracted, so no coplanar pavement overlays or building interiors are filled.'}
(ROOT/'shared/data/b6-entry-paving.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
print(json.dumps({'areaM2':sum(p['area']for p in polygons),'polygons':len(polygons),'points':points,'originalStreetBytesUnchanged':data['sourceStreetSha256']==hashlib.sha256(streets_path.read_bytes()).hexdigest()}))
