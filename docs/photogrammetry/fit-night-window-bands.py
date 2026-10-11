"""Create the small, reviewed night-light facade annotation from source evidence.

The hand corrections refer to world-height centers visible in the evidence
projections, not to a hypothetical uniform world ground level.
"""
from pathlib import Path
import json, hashlib
ROOT=Path(__file__).resolve().parents[2]
evidence=ROOT/'docs/photogrammetry/night-evidence'
source=json.loads((evidence/'source-facade-projections.json').read_text('utf-8'))
fits={
 'b4-edge0':(15.18,3.0), 'b4-edge12':(15.05,3.025),
 'b2-edge10':(18.6,3.05), 'b9-edge2':(12.08,3.0),
 'b9-edge14':(11.98,3.05), 'b8-edge5':(13.2,3.0),
 'b5-edge4':(18.73,3.05), 'b5-edge18':(18.6,3.025),
 'b10-edge0':(10.92,3.0), 'b10-edge12':(10.9,3.025),
 'b7-edge8':(15.85,3.0), 'b7-edge14':(15.93,3.0),
 'b3-edge1':(16.6,3.025), 'b6-edge0':(17.3,3.05),
 'b6-edge12':(17.2,3.025),
}
facades=[]
for f in source['facades']:
 top,pitch=fits[f['id']]
 facades.append(dict(id=f['id'],block=f['block'],buildingId=f['buildingId'],
   origin=f['sourceA'],tangent=f['tangent'],normal=f['normal'],length=f['length'],
   topWindowY=top,rowPitch=pitch,rowCount=6,windowHalfHeight=.48,
   planeTolerance=.65,sourceDarkThreshold=.43 if f['normal'][0]<0 else (.78 if f['block']==8 else .74),
   sourceChromaThreshold=.23,occupancyBayMetres=5,
   confidence='interpreted-original-ipr2023-facade-projection-not-surveyed',
   sourceNodeIds=f['nodes'],evidence=f"docs/photogrammetry/night-evidence/{f['id']}-source.png"))
output=dict(schemaVersion=1,checkedAt='2026-10-10',capture='summer 2023',
 source='https://tiles.arcgis.com/tiles/SBTXIEUGWbqzUecw/arcgis/rest/services/praha2023_merged_WM/SceneServer/layers/0',
 attribution='datový podklad © IPR Praha',license='CC BY',
 sourceManifestSha256=source['sourceManifestSha256'],
 sourceMapSha256=hashlib.sha256((ROOT/'shared/data/map.json').read_bytes()).hexdigest(),
 method='Peak source plane fitted from original highest-detail I3S triangles; original JPEG UV facade projections inspected; per-facade window row centers interpreted from those projections. Dark neutral source pixels and vertical source triangle orientation supply a conservative glass mask. No UV or source image modification.',
 occupancy='Deterministic fictional five-metre facade groups, not real room numbers or real residents. Amber light and activity are simulated.',
 limits='Conservative partial annotation of 15 main long facades of B2-B10. Unmeasured end windows, administration B1, B11/B12 and shop interiors remain unlit. Original photographs retain captured daylight and shadows; this is an artistic night overlay, not inverse rendering or full physical relighting.',
 facades=facades)
path=ROOT/'client/data/photogrammetry-lighting.json'
path.parent.mkdir(exist_ok=True)
path.write_text(json.dumps(output,indent=2)+'\n','utf-8')
print(path)
