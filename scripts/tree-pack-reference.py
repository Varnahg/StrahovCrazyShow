"""Read-only reference interpretation: source crowns/green scan points -> clean tree parameters.
No source mesh or photographic pixels are copied into the authored tree geometry.
"""
import sys, json, math, hashlib, struct
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.cache/street-python'))
import numpy as np
from PIL import Image
CACHE = ROOT / '.cache/tree-pack'
DOCS = ROOT / 'docs/vegetation'
DOCS.mkdir(parents=True, exist_ok=True)
manifest_path = ROOT / 'shared/data/photogrammetry.json'
manifest = json.loads(manifest_path.read_text(encoding='utf8'))
placements = [t for t in json.loads((CACHE / 'placements.json').read_text(encoding='utf8')) if not t['osmId'].startswith('ipr-b')]
survey = json.loads((ROOT / 'shared/data/surveyed-trees.json').read_text(encoding='utf8'))
ortho_meta = json.loads((ROOT / 'docs/streets/ortho-georeference.json').read_text(encoding='utf8'))
ortho = np.array(Image.open(ROOT / 'docs/streets/strahov-ortho-2024.jpg').convert('RGB'))
factor = manifest['metresPerMercatorUnit']
extent = ortho_meta['extent']
def from_pixel(px, py):
    return ((extent['xmin'] + px / ortho_meta['width'] * (extent['xmax']-extent['xmin']) - manifest['mercatorOrigin']['x']) * factor,
            -(extent['ymax'] - py / ortho_meta['height'] * (extent['ymax']-extent['ymin']) - manifest['mercatorOrigin']['y']) * factor)
def to_pixel(x, z):
    return ((x / factor + manifest['mercatorOrigin']['x']-extent['xmin']) / (extent['xmax']-extent['xmin']) * ortho_meta['width'],
            (extent['ymax'] + z / factor-manifest['mercatorOrigin']['y']) / (extent['ymax']-extent['ymin']) * ortho_meta['height'])
# Individually reviewed outlines missing from the previous crown-centre inventory.
# These are interpretations of the actual image, not surveyed trunk positions.
annotations = [
    ('ipr-b6-north-bare', 525, 323, 7.5, 'bare', 'Broad bare forked trunk in user Street View B6 north entry; sparse silhouette also visible in 2024 orthophoto. Exact trunk not surveyed.'),
    ('ipr-b6-north-conifer', 581, 325, 6.5, 'conifer', 'Conical dark evergreen behind the north B6 entry in user Street View; interpreted crown centre on 2024 orthophoto.'),
    ('ipr-b5-north-small', 285, 320, 5.5, 'broadleaf', 'Small separated tree crown on the grass directly northwest of B5; 2024 orthophoto.'),
    ('ipr-b6-south-conifer', 559, 570, 8.0, 'conifer', 'Separated pointed crown at southwest B6 corner in 2024 orthophoto; appearance class, no botanical species claim.'),
    ('ipr-b7-south-wide', 736, 608, 13.0, 'broadleaf', 'Wide irregular separated crown at southwest B7 corner in 2024 orthophoto.'),
]
extra = []
for ident, px, py, diameter, appearance, note in annotations:
    x, z = from_pixel(px, py)
    if any(math.hypot(t['x']-x,t['z']-z)<3 for t in placements): continue
    tree = {'osmId': ident, 'x': round(x,3), 'z': round(z,3), 'size': 12 if appearance=='bare' else 11, 'yaw': 0, 'crownDiameter': diameter, 'provenance': 'reference-interpreted-not-surveyed', 'positionUncertaintyMetres': 2.5, 'appearance': appearance, 'note': note, 'pixel': [px,py]}
    placements.append(tree);extra.append(tree)
grid = json.loads((ROOT/'shared/data/terrain-grid.json').read_text(encoding='utf8'))
g=grid['grid']; heights=np.array(grid['heights']).reshape(g['rows'],g['columns'])
def ground(x,z):
    fx=np.clip((x-g['minX'])/g['step'],0,g['columns']-1.000001);fz=np.clip((z-g['minZ'])/g['step'],0,g['rows']-1.000001)
    ix=np.floor(fx).astype(int);iz=np.floor(fz).astype(int);u=fx-ix;v=fz-iz
    a=heights[iz,ix];b=heights[iz,ix+1];c=heights[iz+1,ix];d=heights[iz+1,ix+1]
    return np.where(u+v<=1,a+(b-a)*u+(c-a)*v,d+(c-d)*(1-u)+(b-d)*(1-v))-grid['reference']['absoluteHeight']
clouds=[[] for _ in placements]; source_ids=[set() for _ in placements]
for node in manifest['nodes']:
    if node['children']:continue
    cx=(node['center'][0]-manifest['mercatorOrigin']['x'])*factor
    cz=-(node['center'][1]-manifest['mercatorOrigin']['y'])*factor
    candidates=[(i,t) for i,t in enumerate(placements) if math.hypot(t['x']-cx,t['z']-cz)<node['radius']*factor+max(4,t.get('crownDiameter',8)/2)]
    if not candidates:continue
    raw=(ROOT/('public'+node['geometry'])).read_bytes();count=struct.unpack_from('<I',raw)[0]
    p=np.frombuffer(raw,dtype='<f4',count=count*3,offset=8).reshape(-1,3).astype(np.float64)
    uv=np.frombuffer(raw,dtype='<f4',count=count*2,offset=8+count*12).reshape(-1,2)
    tex=np.array(Image.open(ROOT/('public'+node['texture'])).convert('RGB'))
    # Original I3S UVs use bottom-up V. Green filter rejects most roof/ground data.
    tx=np.clip((uv[:,0]*tex.shape[1]).astype(int),0,tex.shape[1]-1);ty=np.clip(((1-uv[:,1])*tex.shape[0]).astype(int),0,tex.shape[0]-1)
    rgb=tex[ty,tx].astype(float)
    green=(rgb[:,1]>rgb[:,0]*1.035)&(rgb[:,1]>rgb[:,2]*1.1)&(rgb[:,1]>28)
    x=cx+p[:,0]*factor;z=cz-p[:,1]*factor;y=node['center'][2]+p[:,2]-manifest['worldHeightReference']
    above=y-ground(x,z);green&=(above>3)&(above<28)
    for i,t in candidates:
        radius=max(3,min(10,t.get('crownDiameter',8)/2))
        mask=green&((x-t['x'])**2+(z-t['z'])**2<radius**2)
        if mask.any():
            clouds[i].append(np.column_stack([x[mask]-t['x'],z[mask]-t['z'],above[mask]]));source_ids[i].add(node['id'])
result=[]
for i,t in enumerate(placements):
    seed=int(hashlib.sha256(t['osmId'].encode()).hexdigest()[:8],16)
    pts=np.concatenate(clouds[i]) if clouds[i] else np.empty((0,3))
    sufficient=len(pts)>=30
    diameter=t.get('crownDiameter',max(6,t['size']*.9))
    px,py=to_pixel(t['x'],t['z']);radius=diameter/2
    outline=[]
    for a in range(16):
        angle=a*math.tau/16; accepted=[]
        for distance in np.linspace(radius*.35,radius*1.08,18):
            sx,sz=t['x']+math.cos(angle)*distance,t['z']+math.sin(angle)*distance
            ox,oy=to_pixel(sx,sz);ox=int(ox);oy=int(oy)
            if 0<=ox<ortho.shape[1] and 0<=oy<ortho.shape[0]:
                rgb=ortho[oy,ox].astype(float)
                if rgb[1]>rgb[0]*1.025 and rgb[1]>rgb[2]*1.08 and rgb[1]>25:accepted.append(distance)
        outline.append(round(max(accepted)/radius,3) if accepted else .72)
    if sufficient:
        top=pts[pts[:,2]>np.percentile(pts[:,2],35)]
        covariance=np.cov(top[:,:2].T);values,vectors=np.linalg.eigh(covariance)
        major=vectors[:,1];azimuth=math.atan2(major[1],major[0])
        ratio=float(np.clip(math.sqrt(max(values[0],.1)/max(values[1],.1)),.56,1))
        height=float(np.clip(np.percentile(pts[:,2],97),5,24))
        offset=np.clip(np.median(top[:,:2],axis=0),-radius*.25,radius*.25)
    else:
        azimuth=0;ratio=.86;height=float(t['size']);offset=np.array([0.,0.])
    appearance=t.get('appearance','broadleaf')
    if appearance=='bare':height=12.;ratio=.82
    if appearance=='conifer':height=max(12.,height);ratio=.9
    result.append({'id': t['osmId'], 'x': t['x'], 'z': t['z'], 'appearance': appearance, 'botanicalSpecies': None,
      'height': round(height,3), 'crownDiameter': round(diameter,3), 'crownMinorRatio': round(ratio,3), 'crownAzimuth': round(azimuth,5), 'crownOffset': [round(float(v),3) for v in offset], 'radialOutline':outline,
      'trunkRadius': .38 if appearance=='bare' else round(min(.65,max(.13,diameter*.027)),3), 'seed':seed,
      'reference': {'crownCaptureDate':'2024-06-08','heightCaptureDate':'summer 2023' if sufficient else None,'sourceManifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),'sourceOrthoSha256':ortho_meta['sha256'],'sourceNodes':sorted(source_ids[i]),'sourceGreenVertices':len(pts),'heightMethod':'97th percentile of green source vertices above DMR; interpretation, not a surveyed tree height' if sufficient else 'game estimate; insufficient separated green source points','shapeMethod':'2024 ortho radial green envelope plus 2023 scan PCA; a soft reference for clean branching, not source mesh topology','positionUncertaintyMetres':t.get('positionUncertaintyMetres',1),'note':t.get('note','Botanical species and exact branch topology are not established by these aerial references.')}})
out={'schemaVersion':1,'source':'IPR Praha 2023 aerial mesh and 2024 orthophoto, reference only; original clean procedural branches/leaves','attribution':'datový podklad © IPR Praha','limitations':['Historical captures differ; cannot infer every present-day tree or botanical species.','Green-point height/PCA can include neighbouring crowns. Parameters guide clean models and do not force photogrammetry defects into the game.','Broadleaf is the default appearance class where a ground-level species reference is unavailable.','Root positions from aerial crown centres have up to 2.5 m uncertainty; roots are grounded in native DMR in the game.'],'additionalPlacements':extra,'trees':result}
(ROOT/'shared/data/tree-reconstruction.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf8')
(DOCS/'realistic-pack-reference-audit.json').write_text(json.dumps({'treeCount':len(result),'sourceShapeCount':sum(t['reference']['sourceGreenVertices']>=30 for t in result),'additionalCount':len(extra),'heightRange':[min(t['height'] for t in result),max(t['height'] for t in result)]},indent=2)+'\n',encoding='utf8')
print('Reference trees',len(result),'scan-guided shapes',sum(t['reference']['sourceGreenVertices']>=30 for t in result),'newly annotated',len(extra),flush=True)
