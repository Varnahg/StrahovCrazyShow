"""Numeric independent source/OSM/native-frame audit, no main data writes."""
import sys,json,hashlib,math,struct,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.cache/street-python'))
import numpy as np
from shapely.geometry import Polygon,Point
from pyproj import Geod
out=ROOT/'docs/reality-pack/facade-study'
manifest=json.loads((ROOT/'shared/data/photogrammetry.json').read_text(encoding='utf8'))
study=json.loads((out/'study.json').read_text(encoding='utf8'))
world=json.loads((ROOT/'shared/data/map.json').read_text(encoding='utf8'))
building=next(b for b in world['buildings']if b['id']=='53929071');poly=Polygon(building['points'])
origin=manifest['origin'];factor=math.cos(math.radians(origin['lat']));R=6378137
merc=lambda lat,lon:(R*math.radians(lon),R*math.log(math.tan(math.pi/4+math.radians(lat)/2)))
mo=merc(origin['lat'],origin['lon'])
xml=ET.parse(ROOT/'.cache/osm.xml');nodes={n.attrib['id']:(float(n.attrib['lat']),float(n.attrib['lon']))for n in xml.getroot().findall('node')}
way=next(w for w in xml.getroot().findall('way')if w.attrib['id']=='53929071')
geographic=[nodes[n.attrib['ref']]for n in way.findall('nd')]
projected=[((merc(lat,lon)[0]-mo[0])*factor,-(merc(lat,lon)[1]-mo[1])*factor)for lat,lon in geographic]
stored=np.array(building['points']);recomputed=np.array(projected)
geod=Geod(ellps='WGS84');lengths=[geod.inv(geographic[i][1],geographic[i][0],geographic[i+1][1],geographic[i+1][0])[2]for i in range(len(geographic)-1)]
all_tri=[];max_formula_error=0
selected_ids={r['id']for r in study['sourceResources']}
for n in manifest['nodes']:
 if n['id']not in selected_ids:continue
 blob=(ROOT/'public'/n['geometry'].lstrip('/')).read_bytes();count=struct.unpack_from('<I',blob)[0]
 local=np.frombuffer(blob,dtype='<f4',count=count*3,offset=8).reshape((-1,3)).astype(np.float64)
 scale=manifest.get('localPositionScale',manifest['metresPerMercatorUnit'])
 p=np.column_stack(((n['center'][0]-mo[0])*factor+local[:,0]*scale,n['center'][2]-manifest['worldHeightReference']+local[:,2],-(n['center'][1]-mo[1])*factor-local[:,1]*scale))
 direct=np.column_stack(((n['center'][0]+local[:,0]-mo[0])*factor,n['center'][2]+local[:,2]-manifest['worldHeightReference'],-(n['center'][1]+local[:,1]-mo[1])*factor))
 max_formula_error=max(max_formula_error,float(np.max(np.abs(p-direct))))
 t=p.reshape((-1,3,3));c=t.mean(axis=1);normal=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);area=np.linalg.norm(normal,axis=1)/2;normal/=np.maximum(2*area[:,None],1e-12)
 mask=(c[:,1]>15)&(c[:,1]<27)&(np.abs(normal[:,1])>.85)&(area>.02)
 mask&=np.array([poly.buffer(.2).contains(Point(v[0],v[2]))if m else False for v,m in zip(c,mask)])
 all_tri.append(t[mask])
t=np.concatenate(all_tri);c=t.mean(axis=1);roof=study['fittedPlanes']['roof']['heightWorld']
rooftops=[]
for name,selection in [('north',c[:,2]<-55),('south',c[:,2]>=-55)]:
 selection&=(c[:,1]>roof+1)&(c[:,1]<roof+6)
 p=t[selection].reshape((-1,3))
 if len(p):rooftops.append({'id':name,'sourceTriangleCount':int(selection.sum()),'minWorld':p.min(axis=0).tolist(),'maxWorld':p.max(axis=0).tolist(),'estimatedRiseOverSourceRoofM':float(np.median(c[selection,1])-roof),'confidence':'photogrammetry top-surface envelope, not as-built dimensions'})
roofp=t[np.abs(c[:,1]-roof)<.4].reshape((-1,3))
report={'sourceProvider':'IPR Praha + OpenStreetMap/RUIAN','originalMapSha256':hashlib.sha256((ROOT/'shared/data/map.json').read_bytes()).hexdigest(),'osmXmlSha256':hashlib.sha256((ROOT/'.cache/osm.xml').read_bytes()).hexdigest(),'origin':origin,'expectedCosLatitude':factor,'manifestMetresPerMercatorUnit':manifest['metresPerMercatorUnit'],'manifestLocalPositionScale':manifest.get('localPositionScale'),'cosLatitudeDifference':abs(factor-manifest['metresPerMercatorUnit']),'osmGeographicVertices':geographic,'osmStoredBounds':[stored.min(axis=0).tolist(),stored.max(axis=0).tolist()],'osmReprojectedMercatorBounds':[recomputed.min(axis=0).tolist(),recomputed.max(axis=0).tolist()],'maxOSMEquirectangularVsMercatorRoundedPointDifferenceM':float(np.max(np.abs(stored-recomputed))),'osmGeodesicEdgeLengthsM':lengths,'nativeBodyBounds':{'minX':0,'maxX':16,'minZ':-90,'maxZ':-20,'lengthM':70},'sourceRoofNearPlaneBoundsWorld':[roofp.min(axis=0).tolist(),roofp.max(axis=0).tolist()],'sourceFormulaIndependentMaxErrorM':max_formula_error,'rooftopTopSurfaceCandidates':rooftops,'notes':['All source XY uses cos(latitude) once; Bpv height is unscaled.','OSM/native/IPR all have roughly70m main length; the source wide glazing grouping difference cannot be explained by a1.56x horizontal scale discrepancy.','Visible glazing groups do not establish room inventory. Lower rows are partly occluded by trees; threshold candidate counts are not adopted as a facade plan.']}
assert report['cosLatitudeDifference']<1e-12
assert max_formula_error<1e-6
assert report['maxOSMEquirectangularVsMercatorRoundedPointDifferenceM']<.02
(out/'georeference-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:report[k]for k in ['osmStoredBounds','sourceRoofNearPlaneBoundsWorld','maxOSMEquirectangularVsMercatorRoundedPointDifferenceM','sourceFormulaIndependentMaxErrorM','rooftopTopSurfaceCandidates']}))
