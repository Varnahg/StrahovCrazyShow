"""Source-only lamp reference crop. No photographic pixels enter game textures.

The original orthophoto is retained with georeference and hash; interpretation
is a separate manually reviewed artifact, never a generated random lamp grid.
"""
import hashlib, json, urllib.request, urllib.parse, sys, struct, math, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs/weather/night-repair-evidence'
DOCS.mkdir(parents=True, exist_ok=True)
manifest = json.loads((ROOT / 'shared/data/photogrammetry.json').read_text())
factor = manifest['metresPerMercatorUnit']
origin = manifest['mercatorOrigin']
bounds = {'minX': 40, 'maxX': 250, 'minZ': -38, 'maxZ': 62}
bbox = [origin['x'] + bounds['minX']/factor, origin['y'] - bounds['maxZ']/factor,
        origin['x'] + bounds['maxX']/factor, origin['y'] - bounds['minZ']/factor]
url = 'https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer/exportImage?' + urllib.parse.urlencode({
    'bbox': ','.join(map(str,bbox)), 'bboxSR': 3857, 'imageSR':3857,
    'size':'2100,1000', 'format':'jpg', 'interpolation':'RSP_NearestNeighbor','f':'json'})
def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'StrahovCrazyShow source reference audit'}), timeout=90).read()
target = DOCS / 'central-parking-ortho-2024.jpg'
if not target.exists():
    result = json.loads(fetch(url))
    target.write_bytes(fetch(result['href']))
    meta = {'source':url,'provider':'IPR Praha','captureDate':'2024-06-08','license':'CC BY',
            'attribution':'datový podklad © IPR Praha','sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
            'width':result['width'],'height':result['height'],'extent':result['extent'],
            'worldBounds':bounds,'interpretation':'reference only; manually identified poles are not a surveyed inventory'}
    target.with_suffix('.json').write_text(json.dumps(meta,indent=2)+'\n')
print(json.dumps({'image':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}))
reference = ROOT / 'assets/reference/lighting'
reference.mkdir(parents=True, exist_ok=True)
for path in [target,target.with_suffix('.json')]:
    shutil.copyfile(path,reference/path.name)
if '--scan' in sys.argv:
    sys.path.insert(0, str(ROOT / '.cache/street-python'))
    import numpy as np
    from PIL import Image
    grid = json.loads((ROOT/'shared/data/terrain-grid.json').read_text())
    g=grid['grid']; heights=np.array(grid['heights']).reshape(g['rows'],g['columns'])
    def ground(x,z):
        fx=np.clip((x-g['minX'])/g['step'],0,g['columns']-1.000001);fz=np.clip((z-g['minZ'])/g['step'],0,g['rows']-1.000001)
        ix=np.floor(fx).astype(int);iz=np.floor(fz).astype(int);u=fx-ix;v=fz-iz
        a=heights[iz,ix];b=heights[iz,ix+1];c=heights[iz+1,ix];d=heights[iz+1,ix+1]
        return np.where(u+v<=1,a+(b-a)*u+(c-a)*v,d+(c-d)*(1-u)+(b-d)*(1-v))-grid['reference']['absoluteHeight']
    # Candidate pole bases visually interpreted in the high-resolution reference.
    candidates = [(60,32), (128,31), (164,-17), (243,47)]
    image = Image.open(target)
    for index, candidate in enumerate(candidates):
        px=(candidate[0]-bounds['minX'])*10;py=(candidate[1]-bounds['minZ'])*10
        image.crop((max(0,px-120),max(0,py-120),min(2100,px+120),min(1000,py+120))).save(DOCS/f'pole-candidate-{index+1}-ortho-crop.png')
    rows=[[] for _ in candidates]; nodes=[set() for _ in candidates]
    for node in manifest['nodes']:
        if node['children']:continue
        cx=(node['center'][0]-origin['x'])*factor;cz=-(node['center'][1]-origin['y'])*factor
        nearby=[(i,p) for i,p in enumerate(candidates) if math.hypot(p[0]-cx,p[1]-cz)<node['radius']*factor+5]
        if not nearby:continue
        raw=(ROOT/('public'+node['geometry'])).read_bytes();count=struct.unpack_from('<I',raw)[0]
        local=np.frombuffer(raw,dtype='<f4',count=count*3,offset=8).reshape(-1,3).astype(np.float64)
        x=cx+local[:,0]*factor;z=cz-local[:,1]*factor;y=node['center'][2]+local[:,2]-manifest['worldHeightReference']
        height=y-ground(x,z)
        for i,p in nearby:
            mask=((x-p[0])**2+(z-p[1])**2<5**2)&(height>3)&(height<14)
            if mask.any(): rows[i].append(np.column_stack([x[mask],z[mask],y[mask],height[mask]]));nodes[i].add(node['id'])
    result=[]
    for i,p in enumerate(candidates):
        pts=np.concatenate(rows[i]) if rows[i] else np.empty((0,4))
        result.append({'candidate':p,'vertices':len(pts),'nodes':sorted(nodes[i]),'bounds': [pts.min(axis=0).tolist(),pts.max(axis=0).tolist()] if len(pts) else None,'points':np.unique(np.round(pts,3),axis=0).tolist()})
    (DOCS/'pole-candidate-scan-points.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps([{k:v for k,v in item.items() if k!='points'} for item in result],indent=2))
