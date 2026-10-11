"""Read-only red court ground comparison: original IPR23 + original DMR5G."""
import sys,json,hashlib,math,struct,urllib.request,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.cache/street-python'))
import numpy as np
from PIL import Image
from shapely.geometry import Polygon,Point
OUT=ROOT/'docs/reality-pack/terrain/court-repair';OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads((ROOT/'shared/data/photogrammetry.json').read_text(encoding='utf8'))
audit=json.loads((ROOT/'docs/reality-pack/terrain/court-source-audit/audit.json').read_text(encoding='utf8'))
polygon=Polygon(audit['court']['points']);bounds=polygon.bounds;factor=manifest['metresPerMercatorUnit']
records=[];sources=[]
for n in manifest['nodes']:
 if n['children']:continue
 ox=(n['center'][0]-manifest['mercatorOrigin']['x'])*factor;oz=-(n['center'][1]-manifest['mercatorOrigin']['y'])*factor;r=n['radius']*factor
 if ox+r<bounds[0] or ox-r>bounds[2] or oz+r<bounds[1] or oz-r>bounds[3]:continue
 geometry=ROOT/'public'/n['geometry'].lstrip('/');texture=ROOT/'public'/n['texture'].lstrip('/');blob=geometry.read_bytes()
 assert hashlib.sha256(blob).hexdigest()==n['geometrySha256'];assert hashlib.sha256(texture.read_bytes()).hexdigest()==n['textureSha256']
 count=struct.unpack_from('<I',blob)[0];p=np.frombuffer(blob,dtype='<f4',count=count*3,offset=8).reshape((-1,3)).astype(np.float64)
 uv=np.frombuffer(blob,dtype='<f4',count=count*2,offset=8+count*12).reshape((-1,3,2)).mean(axis=1)
 world=np.column_stack((ox+p[:,0]*factor,n['center'][2]-manifest['worldHeightReference']+p[:,2],oz-p[:,1]*factor)).reshape((-1,3,3))
 c=world.mean(axis=1);normal=np.cross(world[:,1]-world[:,0],world[:,2]-world[:,0]);area=np.linalg.norm(normal,axis=1)/2;normal/=np.maximum(2*area[:,None],1e-12)
 possible=(c[:,1]>-1)&(c[:,1]<2)&(normal[:,1]>.65)&(area>.005)&(c[:,0]>=bounds[0])&(c[:,0]<=bounds[2])&(c[:,2]>=bounds[1])&(c[:,2]<=bounds[3])
 possible&=np.array([polygon.covers(Point(v[0],v[2]))if m else False for v,m in zip(c,possible)])
 pixels=np.array(Image.open(texture).convert('RGB'));h,w=pixels.shape[:2];rgb=pixels[np.clip((uv[:,1]*(h-1)).astype(int),0,h-1),np.clip((uv[:,0]*(w-1)).astype(int),0,w-1)].astype(float)
 red=possible&(rgb[:,0]>rgb[:,1]*1.12)&(rgb[:,0]>rgb[:,2]*1.05)&(rgb[:,0]>30)
 for i in np.where(red)[0]:records.append({'x':float(c[i,0]),'y':float(c[i,1]),'z':float(c[i,2]),'area':float(area[i]),'rgb':rgb[i].tolist(),'sourceId':n['id']})
 sources.append({'id':n['id'],'geometrySha256':n['geometrySha256'],'textureSha256':n['textureSha256']})
assert len(records)>12,'Insufficient direct red ground evidence'
p=np.array([[v['x'],v['z'],1]for v in records]);y=np.array([v['y']for v in records]);w=np.sqrt([v['area']for v in records]);keep=np.ones(len(y),bool)
for i in range(3):fit=np.linalg.lstsq(p[keep]*w[keep,None],y[keep]*w[keep],rcond=None)[0];residual=y-p@fit;keep=np.abs(residual)<.15
target=np.array(audit['statistics']['robustPlaneCoefficients']);difference=p@fit-p@target
x=(bounds[0]+bounds[2])/2;z=(bounds[1]+bounds[3])/2
extent=[x-32,z-24,x+32,z+24]
bbox=[manifest['mercatorOrigin']['x']+extent[0]/factor,manifest['mercatorOrigin']['y']-extent[3]/factor,manifest['mercatorOrigin']['x']+extent[2]/factor,manifest['mercatorOrigin']['y']-extent[1]/factor]
params=dict(bbox=','.join(map(str,bbox)),bboxSR=3857,imageSR=3857,size='640,480',format='jpg',interpolation='RSP_NearestNeighbor',f='json')
url='https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer/exportImage?'+urllib.parse.urlencode(params)
with urllib.request.urlopen(url,timeout=40)as response:meta=json.load(response)
with urllib.request.urlopen(meta['href'],timeout=40)as response:image=response.read()
(OUT/'court-ortho-2024.jpg').write_bytes(image)
report={'capture':'IPR mesh summer2023; IPR ortho2024-06-08','court':audit['court'],'originalSourceResources':sources,'redGroundCount':len(records),'redGroundAreaM2':sum(r['area']for r in records),'iprPlane':fit.tolist(),'iprFitRetained':int(keep.sum()),'iprResidualMinMaxM':[float(residual[keep].min()),float(residual[keep].max())],'dmrRobustPlane':target.tolist(),'iprPlaneMinusDMRPlaneMinMaxM':[float(difference.min()),float(difference.max())],'ortho':{'url':url,'sha256':hashlib.sha256(image).hexdigest(),'worldExtent':extent,'resolution':[640,480],'metresPerPixel':.1},'samples':records,'interpretation':'Red atlas + horizontal source geometry are evidence, not semantic ground truth or survey. Plane selection remains a documented local game reconstruction.'}
(OUT/'court-source-comparison.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in report.items()if k not in['samples','originalSourceResources','court','ortho']}))
