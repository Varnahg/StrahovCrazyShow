"""Read-only diagnostic: source DMR at the north B6 clay court, not a repair.

Original campus data stays untouched. A 1m export samples the provider's 2m
raster more densely; it is not claimed to contain 1m survey information.
"""
from pathlib import Path
import sys, json, math, hashlib, urllib.request, urllib.parse
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".cache/street-python"))
from PIL import Image
from shapely.geometry import Polygon, Point

OUT = ROOT / "docs/reality-pack/terrain/court-source-audit"
OUT.mkdir(parents=True, exist_ok=True)
terrain = json.loads((ROOT / "shared/data/terrain-grid.json").read_text(encoding="utf-8"))
land = json.loads((ROOT / "shared/data/landcover.json").read_text(encoding="utf-8"))
court = next(a for a in land["areas"] if a["osmId"] == "293949920")
polygon = Polygon(court["points"])
origin, reference = terrain["origin"], terrain["reference"]["absoluteHeight"]
lon_m = 111320 * math.cos(math.radians(origin["lat"]))
lon = lambda x: origin["lon"] + x/lon_m
lat = lambda z: origin["lat"] - z/111320
grid = dict(minX=-32, maxX=32, minZ=-154, maxZ=-102, step=1, columns=65, rows=53)
service = terrain["source"]["service"]
params = dict(f="json", bbox=",".join(map(str,[lon(-32.5),lat(-101.5),lon(32.5),lat(-154.5)])),
              bboxSR=4326,imageSR=4326,size="65,53",adjustAspectRatio="false",format="tiff",pixelType="F32",
              interpolation="RSP_BilinearInterpolation",renderingRule=json.dumps({"rasterFunction":"None"}))
request = urllib.request.Request(service+"/exportImage",data=urllib.parse.urlencode(params).encode(),
                                headers={"User-Agent":"StrahovCrazyShow source terrain diagnostic"})
with urllib.request.urlopen(request,timeout=45) as response:
    export=json.load(response)
if "error" in export: raise RuntimeError(export["error"])
with urllib.request.urlopen(export["href"],timeout=45) as response: data=response.read()
path=OUT/"north-court-source-1m-export.tif"
path.write_bytes(data)
image=Image.open(path)
assert image.mode=="F" and image.size==(65,53)
values=list(map(float,image.getdata()))
samples=[]
for row in range(53):
    for col in range(65):
        x,z=-32+col,-154+row
        point=Point(x,z)
        if polygon.covers(point):
            h=values[row*65+col]-reference
            assert math.isfinite(h) and -100<h<100
            samples.append(dict(x=x,z=z,y=h,edgeDistance=polygon.boundary.distance(point)))
interior=[p for p in samples if p["edgeDistance"]>3]
def fit(points):
    matrix=[[sum(([p["x"],p["z"],1][i])*([p["x"],p["z"],1][j]) for p in points) for j in range(3)]+
            [sum(([p["x"],p["z"],1][i])*p["y"] for p in points)] for i in range(3)]
    for i in range(3):
        pivot=max(range(i,3),key=lambda j:abs(matrix[j][i]))
        matrix[i],matrix[pivot]=matrix[pivot],matrix[i]
        factor=matrix[i][i]
        matrix[i]=[v/factor for v in matrix[i]]
        for j in range(3):
            if j!=i:
                factor=matrix[j][i]
                matrix[j]=[a-factor*b for a,b in zip(matrix[j],matrix[i])]
    return [matrix[i][3] for i in range(3)]
plane=fit(interior)
clean=[p for p in interior if abs(p["y"]-(plane[0]*p["x"]+plane[1]*p["z"]+plane[2]))<.3]
if len(clean)>8: plane=fit(clean)
result=dict(createdAt=datetime.now(timezone.utc).isoformat(),purpose="diagnostic only; no runtime repair applied",
            source=dict(provider="ČÚZK DMR 5G",service=service,license="CC BY 4.0",attribution="© ČÚZK, upraveno",
                        nativeResolutionMetres=2,exportSpacingMetres=1,request=params,response=export,sha256=hashlib.sha256(data).hexdigest()),
            grid=grid,referenceBpv=reference,court=court,samples=samples,
            statistics=dict(count=len(samples),minY=min(p["y"] for p in samples),maxY=max(p["y"] for p in samples),
                            interiorCount=len(interior),interiorMin=min(p["y"] for p in interior),interiorMax=max(p["y"] for p in interior),
                            robustPlaneCoefficients=plane,planeFitSamples=len(clean),
                            maxPositiveResidual=max(p["y"]-(plane[0]*p["x"]+plane[1]*p["z"]+plane[2]) for p in samples)))
(OUT/"audit.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(result["statistics"]))
