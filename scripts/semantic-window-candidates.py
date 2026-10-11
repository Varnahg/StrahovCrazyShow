"""Conservative image measurements, not verified window/room inventory."""
import sys,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.cache/street-python'))
import numpy as np
from PIL import Image
path=ROOT/'docs/reality-pack/facade-study/west-original.png'
im=np.array(Image.open(path).convert('RGBA'));rgb=im[:,:,:3].mean(axis=2)
mask=(rgb<75)&(im[:,:,3]>240)
roi=np.zeros_like(mask);roi[145:505,100:390]=True;mask&=roi
seen=np.zeros(mask.shape,bool);candidates=[]
for y,x in zip(*np.where(mask)):
 if seen[y,x]:continue
 stack=[(int(y),int(x))];seen[y,x]=True;points=[]
 while stack:
  py,px=stack.pop();points.append((py,px))
  for ny,nx in [(py-1,px),(py+1,px),(py,px-1),(py,px+1)]:
   if 0<=ny<mask.shape[0] and 0<=nx<mask.shape[1] and mask[ny,nx] and not seen[ny,nx]:seen[ny,nx]=True;stack.append((ny,nx))
 ys,xs=zip(*points);w=max(xs)-min(xs)+1;h=max(ys)-min(ys)+1
 if 9<=w<=32 and 8<=h<=25 and len(points)>55:
  candidates.append({'pixelBounds':[min(xs),min(ys),max(xs)+1,max(ys)+1],'widthM':w*.05,'heightM':h*.05,'centerGameZ':-95+(min(xs)+max(xs)+1)*.025,'centerGameY':26-(min(ys)+max(ys)+1)*.025,'confidence':'image-threshold-candidate; shadow/glazing edge, not measured opening'})
rows=[]
for cy in [173,234,295,356,417,478]:
 values=(rgb[cy-5:cy+6,500:1490]<85).mean(axis=0)>.7
 # Join only narrow pane dividers, retaining the broad wall/pilaster gaps.
 for i in range(1,len(values)-1):
  if not values[i] and values[i-1]:
   end=i
   while end<len(values) and not values[end]:end+=1
   if end-i<=7 and end<len(values):values[i:end]=True
 runs=[];start=None
 for i,value in enumerate(np.r_[values,False]):
  if value and start is None:start=i
  if not value and start is not None:
   if i-start>=20:runs.append({'pixels':[500+start,500+i],'centerGameZ':-95+(1000+start+i)*.025,'widthM':(i-start)*.05})
   start=None
 rows.append({'imageY':cy,'gameY':26-(cy+.5)*.05,'visibleDarkGroups':len(runs),'groups':runs,'note':'Visible dark glazing groups only; trees/shadows can merge/occlude groups, not a room count.'})
out={'source':path.name,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'metresPerPixel':.05,'roiPx':[100,145,390,505],'candidateCount':len(candidates),'medianDarkRegionWidthM':float(np.median([c['widthM']for c in candidates])) if candidates else None,'medianDarkRegionHeightM':float(np.median([c['heightM']for c in candidates])) if candidates else None,'regularRegionRows':rows,'notInventory':True,'notAsBuiltDimensions':True,'candidates':candidates}
(path.parent/'window-candidates.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in out.items() if k not in ['candidates','regularRegionRows']}));print('ROW GROUP COUNTS',[r['visibleDarkGroups']for r in rows])
