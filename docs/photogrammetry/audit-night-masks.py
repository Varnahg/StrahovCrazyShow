"""Audit source-fragment night candidates, retain heatmap evidence and hashes.

Samples original triangle centroids, not a semantic segmentation guarantee.
Source input files are read only; every inspected resource is SHA-checked.
"""
from pathlib import Path
import sys,json,struct,hashlib
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'.cache/street-python'))
import numpy as np
from PIL import Image,ImageDraw
OUT=ROOT/'docs/photogrammetry/night-evidence'
manifest=json.loads((ROOT/'shared/data/photogrammetry.json').read_text('utf-8'))
annotations=json.loads((ROOT/'client/data/photogrammetry-lighting.json').read_text('utf-8'))
facades=annotations['facades']
index={n['id']:n for n in manifest['nodes']}
stats=[];resources=[]
def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)
for f in facades:
    per=dict(id=f['id'],sourceTriangles=0,emissionCandidateCentroids=0,weightedSourceArea=0,
        horizontalSurfaceCandidates=0,greenFoliageCandidates=0,outOfWindowBandCandidates=0,
        maximumPlaneDistance=0,sourceNodes=[])
    for node_id in f['sourceNodeIds']:
        node=index[node_id]
        data=(ROOT/('public'+node['geometry'])).read_bytes()
        jpeg=(ROOT/('public'+node['texture'])).read_bytes()
        for kind,blob in [('geometry',data),('texture',jpeg)]:
            digest=hashlib.sha256(blob).hexdigest()
            if digest != node[kind+'Sha256']:raise ValueError('Changed original '+node_id+' '+kind)
            resources.append(dict(node=node_id,kind=kind,sha256=digest))
        count,_=struct.unpack_from('<II',data)
        local=np.frombuffer(data,dtype='<f4',count=count*3,offset=8).reshape((-1,3))
        center=np.array([(node['center'][0]-manifest['mercatorOrigin']['x'])*manifest['metresPerMercatorUnit'],
            node['center'][2]-manifest['worldHeightReference'],
            -(node['center'][1]-manifest['mercatorOrigin']['y'])*manifest['metresPerMercatorUnit']])
        scale=manifest.get('localPositionScale',manifest['metresPerMercatorUnit'])
        pos=np.stack([center[0]+local[:,0]*scale,center[1]+local[:,2],center[2]-local[:,1]*scale],axis=1).reshape((-1,3,3))
        uv=np.frombuffer(data,dtype='<f4',count=count*2,offset=8+count*12).reshape((-1,3,2)).mean(axis=1)
        normal=np.cross(pos[:,1]-pos[:,0],pos[:,2]-pos[:,0])
        area=np.linalg.norm(normal,axis=1)*.5
        normal/=np.maximum(area[:,None]*2,1e-10)
        centers=pos.mean(axis=1)
        tex=np.array(Image.open(ROOT/('public'+node['texture'])).convert('RGB')).astype(float)/255
        tx=np.clip((uv[:,0]*tex.shape[1]).astype(int),0,tex.shape[1]-1)
        ty=np.clip((uv[:,1]*tex.shape[0]).astype(int),0,tex.shape[0]-1)
        rgb=tex[ty,tx]
        delta=centers[:,[0,2]]-f['origin']
        s=delta@np.array(f['tangent']);d=delta@np.array(f['normal'])
        rows=np.floor((f['topWindowY']-centers[:,1])/f['rowPitch']+.5)
        dy=np.abs(centers[:,1]-(f['topWindowY']-rows*f['rowPitch']))
        hi=rgb.max(1);lo=rgb.min(1)
        green=rgb[:,1]>np.maximum(rgb[:,0],rgb[:,2])*1.07+.01
        gate=((s>.35)&(s<f['length']-.35)&(np.abs(d)<f['planeTolerance'])&
            (np.abs(normal[:,1])<.45)&(np.abs(normal[:,[0,2]]@np.array(f['normal']))>.8)&
            (rows>=0)&(rows<f['rowCount'])&(~green))
        mask=gate*(1-smooth(f['windowHalfHeight']-.08,f['windowHalfHeight'],dy))*\
            (1-smooth(f['sourceDarkThreshold']-.04,f['sourceDarkThreshold'],hi))*\
            (1-smooth(f['sourceChromaThreshold']-.04,f['sourceChromaThreshold'],hi-lo))
        selected=mask>.01
        per['sourceTriangles']+=len(centers)
        per['emissionCandidateCentroids']+=int(selected.sum())
        per['weightedSourceArea']+=float((area*mask).sum())
        per['horizontalSurfaceCandidates']+=int((selected&(np.abs(normal[:,1])>=.45)).sum())
        per['greenFoliageCandidates']+=int((selected&green).sum())
        per['outOfWindowBandCandidates']+=int((selected&(dy>=f['windowHalfHeight'])).sum())
        if selected.any():per['maximumPlaneDistance']=max(per['maximumPlaneDistance'],float(np.abs(d[selected]).max()))
        per['sourceNodes'].append(node_id)
    # Evidence heatmap uses the same sRGB and vertical-band rules. Its original
    # facade projection is separate; no original atlas is ever overwritten.
    img=np.array(Image.open(OUT/f"{f['id']}-source.png")).astype(float)/255
    yy,xx=np.indices(img.shape[:2]);worldy=25-(yy+.5)/12
    rows=np.floor((f['topWindowY']-worldy)/f['rowPitch']+.5)
    dy=np.abs(worldy-(f['topWindowY']-rows*f['rowPitch']))
    hi=img.max(2);lo=img.min(2)
    green=img[:,:,1]>np.maximum(img[:,:,0],img[:,:,2])*1.07+.01
    mask=(rows>=0)&(rows<f['rowCount'])&(~green)&(xx/12>.35)&(xx/12<f['length']-.35)
    heat=mask*(1-smooth(f['windowHalfHeight']-.08,f['windowHalfHeight'],dy))*\
        (1-smooth(f['sourceDarkThreshold']-.04,f['sourceDarkThreshold'],hi))*\
        (1-smooth(f['sourceChromaThreshold']-.04,f['sourceChromaThreshold'],hi-lo))
    overlay=img*(1-heat[:,:,None]*.72)+np.array([1,.28,.025])*heat[:,:,None]*.72
    Image.fromarray((np.clip(overlay,0,1)*255).astype('uint8')).save(OUT/f"{f['id']}-window-heatmap.png")
    stats.append(per)
resource_index={(r['node'],r['kind']):r for r in resources}
report=dict(checkedAt='2026-10-10',sourceManifestSha256=annotations['sourceManifestSha256'],
    annotationSha256=hashlib.sha256((ROOT/'client/data/photogrammetry-lighting.json').read_bytes()).hexdigest(),
    method='Original source triangle-centroid position, geometric normal, original nearest atlas RGB at centroid UV. Same analytic row/plane/color mask as runtime, before fictional occupancy.',
    limits='Centroid audit is conservative geometric/color evidence, not proof that every shaded branch or plaster pixel is semantically identified. Window reflections too bright for the source mask intentionally remain dark. No claim of inverse-rendered source daylight.',
    originalFilesModified=False,checkedUniqueResources=len(resource_index),facades=stats,
    totalEmissionCandidateCentroids=sum(s['emissionCandidateCentroids'] for s in stats),
    horizontalSurfaceCandidates=sum(s['horizontalSurfaceCandidates'] for s in stats),
    greenFoliageCandidates=sum(s['greenFoliageCandidates'] for s in stats),
    outOfWindowBandCandidates=sum(s['outOfWindowBandCandidates'] for s in stats))
(OUT/'night-mask-audit.json').write_text(json.dumps(report,indent=2)+'\n','utf-8')
(OUT/'original-resource-hashes.json').write_text(json.dumps(list(resource_index.values()),indent=2)+'\n','utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='facades'}))
