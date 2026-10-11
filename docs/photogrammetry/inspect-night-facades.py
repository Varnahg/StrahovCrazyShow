"""Reproject original CC BY IPR 2023 UVs onto surveyed-source facade planes.

This produces evidence only, never changes source JPEGs, bins, or shared data.
Run using Blender's Python; Pillow/numpy live in the project's cached GIS env.
"""
from pathlib import Path
import sys, json, struct, hashlib
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.cache/street-python'))
import numpy as np
from PIL import Image, ImageDraw

OUT = ROOT / 'docs/photogrammetry/night-evidence'
OUT.mkdir(exist_ok=True)
manifest_path = ROOT / 'shared/data/photogrammetry.json'
manifest = json.loads(manifest_path.read_text('utf-8'))
campus = json.loads((ROOT / 'shared/data/map.json').read_text('utf-8'))
catalog = json.loads((ROOT / 'shared/data/building-catalog.json').read_text('utf-8'))
blocks = {e['osmId']: e['block'] for e in catalog['entries'] if e.get('block') in range(2,11)}
origin = np.array(manifest['mercatorOrigin']['x']), np.array(manifest['mercatorOrigin']['y'])
scale = manifest['metresPerMercatorUnit']
pos_scale = manifest.get('localPositionScale', scale)
facades = []
for b in campus['buildings']:
    if b['id'] not in blocks: continue
    pts = np.array(b['points'])
    for i in range(len(pts)-1):
        a, end = pts[i], pts[i+1]
        delta = end-a
        length = np.linalg.norm(delta)
        if length < 45: continue
        tangent = delta/length
        normal = np.array([tangent[1], -tangent[0]])
        facades.append(dict(id=f"b{blocks[b['id']]}-edge{i}", block=blocks[b['id']], buildingId=b['id'],
            a=a.tolist(), tangent=tangent.tolist(), normal=normal.tolist(), length=float(length),
            triangles=[], nodes=set(), planeOffset=0.0))

decoded = {}
for node in manifest['nodes']:
    if node['children']: continue
    center = np.array([(node['center'][0]-float(origin[0]))*scale,
        node['center'][2]-manifest['worldHeightReference'], -(node['center'][1]-float(origin[1]))*scale])
    wanted = [f for f in facades if abs(np.dot(center[[0,2]]-f['a'],f['normal'])) < 20 and
        -20 < np.dot(center[[0,2]]-f['a'],f['tangent']) < f['length']+20]
    if not wanted: continue
    data = (ROOT / ('public'+node['geometry'])).read_bytes()
    n, features = struct.unpack_from('<II', data)
    local = np.frombuffer(data,dtype='<f4',count=n*3,offset=8).reshape((-1,3))
    positions = np.stack([center[0]+local[:,0]*pos_scale,center[1]+local[:,2],center[2]-local[:,1]*pos_scale],axis=1).reshape((-1,3,3))
    uv = np.frombuffer(data,dtype='<f4',count=n*2,offset=8+n*12).reshape((-1,3,2))
    normals = np.cross(positions[:,1]-positions[:,0],positions[:,2]-positions[:,0])
    normals /= np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-9)
    centroids=positions.mean(axis=1)
    xz=centroids[:,[0,2]]
    for f in wanted:
        s=(xz-f['a'])@np.array(f['tangent'])
        d=(xz-f['a'])@np.array(f['normal'])
        orientation=np.abs(normals[:,[0,2]]@np.array(f['normal']))
        mask=(np.abs(d)<2.5)&(s>-.6)&(s<f['length']+.6)&(np.abs(normals[:,1])<.65)&(orientation>.7)&(centroids[:,1]>-12)&(centroids[:,1]<24)
        indices=np.nonzero(mask)[0]
        if len(indices):
            f['nodes'].add(node['id'])
            f['triangles'].extend((node['id'],int(index),float(d[index])) for index in indices)
    decoded[node['id']]=(positions,uv)

textures={}
panels=[]
for f in facades:
    hist,edges=np.histogram([t[2] for t in f['triangles']], bins=100,range=(-2.5,2.5))
    peak=np.argmax(hist)
    plane=float((edges[peak]+edges[peak+1])*.5)
    f['planeOffset']=plane
    a=np.array(f['a'])+np.array(f['normal'])*plane
    f['sourceA']=a.tolist()
    ppm=12
    width=int(f['length']*ppm)+1
    h=37*ppm
    rgb=np.full((h,width,3),245,dtype=np.uint8)
    depth=np.full((h,width),999.,dtype=np.float32)
    for node_id,index,d in f['triangles']:
        if abs(d-plane)>1.05: continue
        pos,uv=decoded[node_id]
        tri=pos[index]
        sourceuv=uv[index]
        ss=(tri[:,[0,2]]-a)@np.array(f['tangent'])
        yy=tri[:,1]
        screen=np.stack([ss*ppm,(25-yy)*ppm],axis=1)
        x0=max(0,int(np.floor(screen[:,0].min())))
        x1=min(width-1,int(np.ceil(screen[:,0].max())))
        y0=max(0,int(np.floor(screen[:,1].min())))
        y1=min(h-1,int(np.ceil(screen[:,1].max())))
        if x0>x1 or y0>y1:continue
        xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
        v0,v1,v2=screen
        denom=(v1[1]-v2[1])*(v0[0]-v2[0])+(v2[0]-v1[0])*(v0[1]-v2[1])
        if abs(denom)<1e-8:continue
        w0=((v1[1]-v2[1])*(xx-v2[0])+(v2[0]-v1[0])*(yy-v2[1]))/denom
        w1=((v2[1]-v0[1])*(xx-v2[0])+(v0[0]-v2[0])*(yy-v2[1]))/denom
        w2=1-w0-w1
        accept=(w0>=0)&(w1>=0)&(w2>=0)&(abs(d-plane)<depth[y0:y1+1,x0:x1+1])
        if not accept.any():continue
        if node_id not in textures:
            textures[node_id]=np.array(Image.open(ROOT/'public/models/photogrammetry/ipr2023'/f'{node_id}.jpg').convert('RGB'))
        tex=textures[node_id]
        vuv=w0[...,None]*sourceuv[0]+w1[...,None]*sourceuv[1]+w2[...,None]*sourceuv[2]
        tx=np.clip((vuv[...,0]*tex.shape[1]).astype(int),0,tex.shape[1]-1)
        ty=np.clip((vuv[...,1]*tex.shape[0]).astype(int),0,tex.shape[0]-1)
        rgb[y0:y1+1,x0:x1+1][accept]=tex[ty,tx][accept]
        depth[y0:y1+1,x0:x1+1][accept]=abs(d-plane)
    image=Image.fromarray(rgb)
    image.save(OUT/f"{f['id']}-source.png")
    panel=Image.new('RGB',(max(width,850),h+32),'white')
    panel.paste(image,(0,32))
    draw=ImageDraw.Draw(panel)
    draw.text((5,5),f"{f['id']} source plane offset={plane:.3f} m; world Y 25..-12; 12 pixels/m",fill='black')
    for y in range(-10,25,2):
        row=int((25-y)*ppm)+32
        draw.line((0,row,8,row),fill='red')
        draw.text((10,row-5),str(y),fill='red')
    panels.append(panel)
    f['nodes']=sorted(f['nodes'])
    f['candidateTriangles']=len(f['triangles'])
    del f['triangles']
sheet=Image.new('RGB',(max(p.width for p in panels),sum(p.height for p in panels)),'white')
y=0
for p in panels:sheet.paste(p,(0,y));y+=p.height
sheet.save(OUT/'facade-contact-sheet.jpg',quality=94)
(OUT/'source-facade-projections.json').write_text(json.dumps(dict(
    sourceManifestSha256=hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
    method='Original highest-level I3S triangles and their original top-left JPEG UVs; longest OSM facade edges fitted to peak source plane at 0.05m bins. Evidence only.',
    capture=manifest['capture'],facades=facades),indent=2)+'\n','utf-8')
print(json.dumps(dict(facades=len(facades),nodes=len(decoded),evidence=str(OUT/'facade-contact-sheet.jpg'))))
