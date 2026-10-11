"""Source-informed red/green tennis appearance, original ortho stays exact."""
import sys,json,hashlib,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.cache/street-python'))
import numpy as np
from PIL import Image
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
from shapely import contains_xy
source=json.loads((ROOT/'docs/reality-pack/terrain/court-repair/court-source-comparison.json').read_text(encoding='utf8'))
points=np.array(source['court']['points'][:-1]);center=points.mean(axis=0);across=(points[1]-points[0]);width=np.linalg.norm(across);across/=width;along=points[3]-points[0];length=np.linalg.norm(along);along/=length
image_path=ROOT/'docs/reality-pack/terrain/court-repair/court-ortho-2024.jpg';rgb=np.array(Image.open(image_path).convert('RGB')).astype(float)
minx,minz,maxx,maxz=source['ortho']['worldExtent'];h,w=rgb.shape[:2];xx,zz=np.meshgrid(minx+(np.arange(w)+.5)*.1,minz+(np.arange(h)+.5)*.1)
mask=contains_xy(Polygon(points),xx,zz)&(rgb[:,:,0]>rgb[:,:,1]*1.18)&(rgb[:,:,0]>rgb[:,:,2]*1.08)&(rgb[:,:,0]>90)
red=np.column_stack((xx[mask],zz[mask]));local=np.column_stack(((red-center)@across,(red-center)@along))
lo=np.quantile(local,.002,axis=0);hi=np.quantile(local,.998,axis=0);mid=(lo+hi)/2
def world(u,v):return(center+across*u+along*v).tolist()
red_points=[world(lo[0],lo[1]),world(hi[0],lo[1]),world(hi[0],hi[1]),world(lo[0],hi[1])]
segments=[(-5.485,-11.885,5.485,-11.885),(5.485,-11.885,5.485,11.885),(5.485,11.885,-5.485,11.885),(-5.485,11.885,-5.485,-11.885),(-4.115,-11.885,-4.115,11.885),(4.115,-11.885,4.115,11.885),(-4.115,-6.4,4.115,-6.4),(-4.115,6.4,4.115,6.4),(0,-6.4,0,6.4)]
scale_u=(hi[0]-lo[0])/10.97;scale_v=(hi[1]-lo[1])/23.77
lines=unary_union([LineString([world(a*scale_u+mid[0],b*scale_v+mid[1]),world(c*scale_u+mid[0],d*scale_v+mid[1])]).buffer(.0375,cap_style=2,join_style=2)for a,b,c,d in segments])
polys=list(lines.geoms)if hasattr(lines,'geoms')else[lines]
paint=[{'outer':list(p.exterior.coords)[:-1],'holes':[list(r.coords)[:-1]for r in p.interiors]}for p in polys]
court=Polygon(points);red_poly=Polygon(red_points);assert court.covers(red_poly);assert court.covers(lines)
data={'schemaVersion':1,'osmId':'293949920','name':'Severní tenisový kurt u B6','measured':False,'sourceSportTag':'tennis visual interpretation','sourceSurfaceTagRetained':'clay','visualSurface':'red playing area and sage-green runoff','orthoCaptureDate':'2024-06-08','orthoSha256':hashlib.sha256(image_path.read_bytes()).hexdigest(),'orthoSourceUrl':source['ortho']['url'],'courtPoints':points.tolist(),'center':center.tolist(),'across':across.tolist(),'along':along.tolist(),'widthMetres':float(width),'lengthMetres':float(length),'redPhotoMaskPixelCount':int(mask.sum()),'redLocalBounds':[lo.tolist(),hi.tolist()],'redPolygon':red_points,'paintPolygons':paint,'paintWidthMetres':.075,'lineReference':'https://www.itftennis.com/media/7221/2026-rules-of-tennis-english.pdf','lineReferenceDimensions':{'doublesWidthMetres':10.97,'lengthMetres':23.77,'singlesWidthMetres':8.23,'serviceLineFromNetMetres':6.4},'lineScalingToPhotoBounds':{'across':float(scale_u),'along':float(scale_v),'note':'Standard tennis proportions are fitted to photo-estimated colour bounds, not asserted as a regulation-surveyed playing rectangle.'},'fenceStatus':'Fence visible in ortho; height/gate geometry unverified and omitted in this surface-only reconstruction.','netStatus':'Vertical net model omitted here; no guessed collision or gate is added.','coatingStatus':'Photo-interpreted paint colours, not a measured coating or assertion that the OSMclay tag is current.'}
data['sourceSportTag']='multi';data['sourceTagTimestamp']='2014-12-08T11:11:47Z';data['visualSport']='tennis';data['sourceTagUrl']='https://www.openstreetmap.org/way/293949920'
(ROOT/'shared/data/north-court-style.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:data[k]for k in['widthMetres','lengthMetres','redPhotoMaskPixelCount','redLocalBounds']}))
