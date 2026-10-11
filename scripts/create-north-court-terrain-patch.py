"""Canonical local terrain TIN; original DMR JSON/TIFF never overwritten."""
import sys,json,hashlib,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.cache/street-python'))
import numpy as np
from shapely.geometry import Polygon
from shapely import constrained_delaunay_triangles
terrain_path=ROOT/'shared/data/terrain-grid.json';raw=json.loads(terrain_path.read_text(encoding='utf8'));g=raw['grid'];reference=raw['reference']['absoluteHeight']
source_path=ROOT/'docs/reality-pack/terrain/court-repair/court-source-comparison.json';source=json.loads(source_path.read_text(encoding='utf8'))
polygon=Polygon(source['court']['points']);plane=source['iprPlane'];step=g['step']
original_hash=hashlib.sha256(terrain_path.read_bytes()).hexdigest()
def vertex(col,row):
 x=g['minX']+col*step;z=g['minZ']+row*step
 distance=max(-12-x,x-20,-96-z,z+16,0);weight=min(1,distance/4)
 return float(np.float32((raw['heights'][row*g['columns']+col]-reference)*weight))
def baseline(x,z):
 gx=max(0,min(g['columns']-1,(x-g['minX'])/step));gz=max(0,min(g['rows']-1,(z-g['minZ'])/step));col=min(g['columns']-2,int(gx));row=min(g['rows']-2,int(gz));u=gx-col;v=gz-row
 nw,ne,sw,se=vertex(col,row),vertex(col+1,row),vertex(col,row+1),vertex(col+1,row+1)
 return nw+u*(ne-nw)+v*(sw-nw)if u+v<=1 else se+(1-u)*(sw-se)+(1-v)*(ne-se)
def height(x,z):
 from shapely.geometry import Point
 point=Point(x,z);distance=polygon.distance(point)
 t=min(1,distance/3);weight=1-t*t*(3-2*t)
 return baseline(x,z)*(1-weight)+(plane[0]*x+plane[1]*z+plane[2])*weight
outer=polygon.buffer(3,join_style=2)
minx,minz,maxx,maxz=outer.bounds
minx=g['minX']+math.floor((minx-g['minX'])/step)*step;maxx=g['minX']+math.ceil((maxx-g['minX'])/step)*step
minz=g['minZ']+math.floor((minz-g['minZ'])/step)*step;maxz=g['minZ']+math.ceil((maxz-g['minZ'])/step)*step
rings=[polygon,polygon.buffer(1,join_style=2),polygon.buffer(2,join_style=2),outer]
zones=[rings[0]]+[rings[i].difference(rings[i-1])for i in range(1,4)]
positions=[];indices=[];cells=[];index_by_coordinate={};max_delta=0
def add_triangle(coords):
 global max_delta
 coords=list(coords)[:3]
 if (coords[1][0]-coords[0][0])*(coords[2][1]-coords[0][1])-(coords[1][1]-coords[0][1])*(coords[2][0]-coords[0][0])<0:coords[1],coords[2]=coords[2],coords[1]
 for x,z in coords:
  x=round(x,8);z=round(z,8);y=round(height(x,z),8);key=(x,z)
  max_delta=max(max_delta,abs(y-baseline(x,z)))
  if key not in index_by_coordinate:index_by_coordinate[key]=len(positions)//3;positions.extend([x,y,z])
  indices.append(index_by_coordinate[key])
for row in range(int((minz-g['minZ'])/step),int((maxz-g['minZ'])/step)):
 for col in range(int((minx-g['minX'])/step),int((maxx-g['minX'])/step)):
  x=g['minX']+col*step;z=g['minZ']+row*step;first=len(indices)
  for coords in [[(x,z),(x+step,z),(x,z+step)],[(x,z+step),(x+step,z),(x+step,z+step)]]:
   tri=Polygon(coords);pieces=[tri.intersection(zone)for zone in zones]+[tri.difference(outer)];area=0
   for piece in pieces:
    if piece.is_empty:continue
    parts=list(piece.geoms)if hasattr(piece,'geoms')else[piece]
    for part in parts:
     if part.area<1e-9:continue
     triangles=constrained_delaunay_triangles(part)
     for t in triangles.geoms:
      assert part.covers(t.representative_point())
      area+=t.area;add_triangle(t.exterior.coords)
   assert abs(area-tri.area)<1e-6,(row,col,area,tri.area)
  cells.append({'column':col,'row':row,'firstIndex':first,'indexCount':len(indices)-first})
data={'schemaVersion':1,'id':'north-b6-court-293949920','classification':'photo-and-source-ground-interpreted-local-reconstruction','measured':False,'rawTerrainSha256':original_hash,'rawDMRUnchanged':True,'referenceBpv':reference,'court':source['court'],'targetPlane':plane,'planeEvidence':{'sourceComparisonSha256':hashlib.sha256(source_path.read_bytes()).hexdigest(),'sourceIPR2023RedTriangles':source['redGroundCount'],'sourceIPRPlaneMinusDMRPlaneRangeM':source['iprPlaneMinusDMRPlaneMinMaxM'],'nativeDMRRasterMetres':2,'auditExportSpacingMetres':1,'runtimeSourceGridMetres':4},'apronWidthMetres':3,'breaklineOffsetsMetres':[0,1,2,3],'bounds':{'minX':minx,'maxX':maxx,'minZ':minz,'maxZ':maxz},'sourceGrid':{'minX':g['minX'],'minZ':g['minZ'],'step':step},'positions':positions,'indices':indices,'cells':cells,'maxSourceVertexAdjustmentMetres':max_delta,'notes':['Flat tilted sport surface follows direct original red IPR23 ground; independent DMR interior plane agrees within7cm.','3m local apron restores original terrain; source-grid triangle edges and outer-region heights remain exact.','No survey precision is claimed; raw JSON/TIFF/JPEG files are unchanged.']}
assert hashlib.sha256(terrain_path.read_bytes()).hexdigest()==original_hash
path=ROOT/'shared/data/north-court-terrain-patch.json';path.write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf8')
print(json.dumps({'bounds':data['bounds'],'vertices':len(positions)//3,'triangles':len(indices)//3,'cells':len(cells),'maxAdjustmentM':max_delta,'rawSha256':original_hash}))
