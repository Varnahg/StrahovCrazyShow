"""Independent saved-pixel silhouette audit; no source image edits."""
import sys,json,hashlib
from pathlib import Path
sys.dont_write_bytecode=True
import bpy
import numpy as np
ROOT=Path(__file__).resolve().parents[2];CACHE=ROOT/'.cache/trees-r6-far-20261026'
def pixels(path):
 image=bpy.data.images.load(str(path),check_existing=False);image.colorspace_settings.name='Non-Color';size=tuple(image.size);data=np.array(image.pixels[:],dtype=np.float32).reshape(size[1],size[0],4);bpy.data.images.remove(image);return data
def dilate(mask):
 padded=np.pad(mask,1);return np.maximum.reduce([padded[y:y+mask.shape[0],x:x+mask.shape[1]]for y in range(3)for x in range(3)])
def main():
 report=json.loads((CACHE/'native-report.json').read_text());rows=[]
 for entry in report['renders']:
  if entry['variant']!='reference':continue
  source=ROOT/entry['path'];candidate=Path(str(source).replace('mask-reference-','mask-candidate-'));a=pixels(source)[:,:,0]>=.5;b=pixels(candidate)[:,:,0]>=.5;area=int(a.sum());added=int((b&~dilate(a)).sum());missing=int((a&~dilate(b)).sum())
  rows.append({'distance':entry['distance'],'angle':entry['angle'],'amount':entry['amount'],'referenceAreaPixels':area,'candidateAreaPixels':int(b.sum()),'areaRatio':float(b.sum()/area),'addedOutside1px':added,'missingOutside1px':missing,'addedFraction':added/area,'missingFraction':missing/area,'xorFraction':int((a^b).sum())/area})
 mask=pixels(ROOT/report['maps']['opacity']['path'])[:,:,0];tiles=[]
 bank=json.loads((CACHE/'bank-blender.json').read_text());used={c['tile']for p in bank['prototypes']for c in p['cards']}
 for tile in sorted(used):
  x=(tile%32)*32;y=(tile//32)*32;t=mask[y:y+32,x:x+32];border=np.ones((32,32),dtype=bool);border[4:28,4:28]=False
  tiles.append({'tile':tile,'coveragePixels':int((t>=.5).sum()),'borderOpaquePixels':int(((t>=.5)&border).sum())})
 out={'silhouettes':rows,'tiles':{'count':len(tiles),'empty':sum(t['coveragePixels']==0 for t in tiles),'opaquePaddingPixels':sum(t['borderOpaquePixels']for t in tiles),'minimumCoveragePixels':min(t['coveragePixels']for t in tiles)},'limits':{'areaRatio':[.95,1.05],'outside1pxFraction':.05},'acceptedMaskComparisons':all(.95<=r['areaRatio']<=1.05 and r['addedFraction']<=.05 and r['missingFraction']<=.05 for r in rows),'limitations':['Cycles CPU orthographic masks, not game sampler/GPU proof.','Automatic atlas mips not validated; tile padding only covers base level.','Tested75/135/175m projection and0/45/90deg; not all possible viewing directions.']}
 (CACHE/'image-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
if __name__=='__main__':main()
