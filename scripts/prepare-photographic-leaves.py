from pathlib import Path
import json,sys,hashlib,math
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/".cache/photographic-leaf-export"
sys.path.insert(0,str(ROOT/'.cache/street-python'))
import numpy as np
from PIL import Image
report=json.loads((OUT/'leaf-bake-report.json').read_text(encoding='utf8'))
inputs={channel:np.asarray(Image.open(OUT/details['file']).convert('RGBA')).copy() for channel,details in report['passes'].items()}
alpha=inputs['albedo'][:,:,3];assert all(np.array_equal(alpha,image[:,:,3]) for image in inputs.values())
def dilate(data,valid,radius=6):
 result=data.copy();mask=valid.copy()
 for step in range(radius):
  before=mask.copy()
  for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:
   shifted=np.roll(before,(dy,dx),(0,1));values=np.roll(result,(dy,dx),(0,1))
   if dy==1:shifted[0]=False
   if dy==-1:shifted[-1]=False
   if dx==1:shifted[:,0]=False
   if dx==-1:shifted[:,-1]=False
   take=(~mask)&shifted;result[take]=values[take];mask[take]=True
 return result
albedo=inputs['albedo'].copy();normal=inputs['normal'].copy();rough=inputs['roughness'][:,:,0].copy()
for leaf in report['leaves']:
 col,row=leaf['atlasCell'];ys=slice(row*128,(row+1)*128);xs=slice(col*64,(col+1)*64);valid=alpha[ys,xs]>0
 albedo[ys,xs,:3]=dilate(albedo[ys,xs,:3],valid);normal[ys,xs,:3]=dilate(normal[ys,xs,:3],valid);rough[ys,xs]=dilate(rough[ys,xs],valid)
arm=np.dstack((np.full_like(rough,255),rough,np.zeros_like(rough),alpha));alphargb=np.dstack((alpha,alpha,alpha,np.full_like(alpha,255)))
bentnormal=normal.copy();geometry={key:{'positions':[],'normals':[],'uvs':[],'indices':[]} for key in ['flat','bent']}
for leaf in report['leaves']:
 root=np.array(leaf['root']);right=np.array(leaf['right']);up=np.array(leaf['up']);n=np.array(leaf['normal']);uc,vc=leaf['centreUVMetres'];width=leaf['width'];height=leaf['height'];v0=vc-height/2;v1=vc+height/2;mid=leaf['midV'];h=leaf['midHeight'];tip=leaf['tipV'];u0,u1=uc-width/2,uc+width/2
 def bend(v):return h*v/mid if v<=mid else h*(tip-v)/(tip-mid)
 au0,av0,au1,av1=leaf['atlasUV']
 for key in ['flat','bent']:
  intervals=[(v0,v1)] if key=='flat' else [(v0,mid),(mid,v1)]
  for bottom,top in intervals:
   slope=0 if key=='flat' else (bend(top)-bend(bottom))/(top-bottom);plane_n=(n-up*slope)/math.sqrt(1+slope*slope);target=geometry[key];offset=len(target['positions'])//3
   for x,y in [(u0,bottom),(u1,bottom),(u1,top),(u0,top)]:
    p=root+right*x+up*y+n*(0 if key=='flat' else bend(y));target['positions'].extend(p.tolist());target['normals'].extend(plane_n.tolist());fu=(x-u0)/width;fv=1-(y-v0)/height;target['uvs'].extend([au0+(au1-au0)*fu,av0+(av1-av0)*fv])
   target['indices'].extend([offset,offset+1,offset+2,offset,offset+2,offset+3])
 col,row=leaf['atlasCell'];ys=slice(row*128,(row+1)*128);xs=slice(col*64,(col+1)*64);rgb=normal[ys,xs,:3].astype(float)/127.5-1
 v=vc+(.5-(np.arange(128)+.5)/128)*height;slope=np.where(v<=mid,h/mid,-h/(tip-mid))[:,None];scale=np.sqrt(1+slope*slope)
 transformed=np.stack((rgb[:,:,0],(rgb[:,:,1]+slope*rgb[:,:,2])/scale,(rgb[:,:,2]-slope*rgb[:,:,1])/scale),axis=2)
 bentnormal[ys,xs,:3]=np.clip(np.rint((transformed+1)*127.5),0,255).astype(np.uint8)
 leaf['acceptedAlphaTexels']=int((alpha[ys,xs]/255>=.45).sum());leaf['projectedAlphaUnionSquareMetres']=leaf['acceptedAlphaTexels']/(64*128)*width*height
for key,g in geometry.items():g['triangles']=len(g['indices'])//3
assert geometry['flat']['triangles']==84 and geometry['bent']['triangles']==168
channels={}
for channel,pixels in [('albedo',albedo),('alpha',alphargb),('normal',normal),('normal-bent',bentnormal),('arm',arm)]:
 file='leaves-'+channel+'.png';Image.fromarray(pixels,'RGBA').save(OUT/file);channels[channel]={'file':file,'sha256':hashlib.sha256((OUT/file).read_bytes()).hexdigest(),'bytes':(OUT/file).stat().st_size,'gamma':channel=='albedo'}
manifest={**report,'runtimeGeometrySha256':report['sourceGeometrySha256'],'channels':channels,'geometries':geometry,'normalTransfer':'Flat normal map stores source normal in each leaf plane basis. Bent normal map rotates those vectors into the actual lower/upper segment tangent bases before runtime PBR transforms them back to world. No baked illumination or emission.','padding':'Six texels of RGB extension only where baked alpha is zero, independently per leaf cell; alpha and nonzero-alpha RGB remain unchanged.','rootInterpretation':'Source root/tip centres remain exactly on each representation. Source basal-edge/fold/twist deviations are separately measured.'}
(OUT/'leaf-manifest.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n',encoding='utf8')
print(json.dumps({'triangles':{k:g['triangles'] for k,g in geometry.items()},'sourceMaxPlaneError':max(l['flatMaximumDistanceMetres'] for l in report['leaves']),'sourceMaxBentError':max(l['bentMaximumDistanceMetres'] for l in report['leaves']),'bytes':sum(c['bytes'] for c in channels.values())},indent=2))

