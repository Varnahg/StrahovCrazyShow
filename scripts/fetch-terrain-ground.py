"""Reproduce explicitly reviewed pixel interpretations from the IPR ortho.

No image is fetched here. Source photograph is CC BY 4.0 and already archived
with its service extent and checksum by the street survey. All pixel decisions
are retained; these are interpretations, never surveyed paint/trunk/kerb data.
"""
from pathlib import Path
import json
import math
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / ".cache/street-python"))
from PIL import Image, ImageDraw
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely import make_valid, union_all

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs/reality-pack/terrain"
DOC.mkdir(parents=True, exist_ok=True)
georef = json.loads((ROOT / "docs/streets/ortho-georeference.json").read_text(encoding="utf-8"))
extent = georef["extent"]

def local(pixel):
    u, v = pixel
    mx = extent["xmin"] + u / georef["width"] * (extent["xmax"] - extent["xmin"])
    my = extent["ymax"] - v / georef["height"] * (extent["ymax"] - extent["ymin"])
    lon = math.degrees(mx / 6378137)
    lat = math.degrees(2 * math.atan(math.exp(my / 6378137)) - math.pi / 2)
    origin = georef["origin"]
    return [round((lon - origin["lon"]) * 111320 * math.cos(math.radians(origin["lat"])), 3),
            round(-(lat - origin["lat"]) * 111320, 3)]

ASPHALT = [(886,648),(1190,640),(1257,648),(1455,648),(1458,801),(1375,816),(1150,821),(1047,835),(887,835)]
LOGO = [(980,683),(1114,683),(1114,716),(980,716)]
# Representative visibly occupied bays in the 2024 photograph. No number plate,
# make, live occupancy or exact vehicle geometry is inferred from this source.
SLOTS = [(1014,651),(1034,651),(1055,651),(1164,653),(1186,653),
         (992,725),(1012,725),(1034,724),(1054,724),(1077,724),
         (970,749),(990,749),(1010,749),(1030,749),
         (927,818),(953,817),(977,817),(1002,817),(1029,816),
         (1262,725),(1284,725),(1328,724),(1350,724),(1380,723)]
# Faded bay-divider runs visible at the top and bottom edges of the central
# court, with explicit photographed extents. Segment spacing is an interpretation
# of the image (roughly 2.5m), not a claim of survey-grade dimensions.
RUNS = [(992,1084,636,671,10),(1155,1236,638,676,9),
        (910,1107,790,829,19),(1265,1432,696,738,16),
        (1267,1412,738,773,14)]
lines = []
for index, (x1,x2,y1,y2,count) in enumerate(RUNS):
    for divider in range(count + 1):
        x = x1 + (x2 - x1) * divider / count
        a,b = (round(x,2),y1),(round(x,2),y2)
        lines.append({"id": f"central-bay-run-{index}-{divider}", "sourcePixels": [a,b],
                      "points": [local(a),local(b)], "width": 0.09,
                      "widthProvenance": "generic-painted-line-width; placement-interpreted-ortho"})
data = {"schemaVersion":1, "origin":georef["origin"],
        "source":{"provider":"IPR Praha", "captureDate":georef["captureDate"],
                  "url":georef["service"], "license":"CC BY 4.0", "licenseUrl":georef["licenseUrl"],
                  "attribution":"datový podklad © IPR Praha, interpretace StrahovCrazyShow",
                  "orthoSha256":georef["sha256"], "georeference":"docs/streets/ortho-georeference.json",
                  "classification":"manual-georeferenced-photo-interpretation-not-survey"},
        "surfaces":[{"id":"central-asphalt-court","kind":"asphalt", "sourcePixels":ASPHALT,
                     "points":[local(p) for p in ASPHALT],
                     "crossCheckOsm":"https://www.openstreetmap.org/way/155743958",
                     "note":"Asphalt court east of sports pitches, confirmed in IPR 8.6.2024; no grass or random trees in this polygon. Edge interpretation can differ by ~1m."}],
        "paint":[{"id":"central-silicon-hill-ground-paint","text":"Silicon Hill", "sourcePixels":LOGO,
                  "points":[local(p) for p in LOGO], "color":"#e0dfd5",
                  "note":"Presence, extent and east-west reading confirmed in 2024 orthophoto. Authored text/outline approximation, not a copied image or exact vector brand asset."}],
        "paintLines":lines,
        "parkingSlots":[{"id":f"photo-central-bay-{i+1}", "x":local(p)[0],"z":local(p)[1],"yaw":math.pi,
                         "sourcePixel":p,"source":"IPR 2024-06-08 interpreted occupied bay",
                         "width":2.3,"depth":4.7,
                         "occupancy":"simulation-only; photo identifies a bay, never current occupancy",
                         "dimensionsProvenance":"generic-vehicle-envelope-not-surveyed"} for i,p in enumerate(SLOTS)]}
streets=json.loads((ROOT/"shared/data/streets.json").read_text(encoding="utf-8"))
covered=union_all([make_valid(Polygon(p["outer"],p["holes"])) for s in streets["surfaces"] for p in s["polygons"]],grid_size=.001)
fill=Polygon(data["surfaces"][0]["points"]).difference(covered)
parts=[fill] if fill.geom_type=="Polygon" else list(fill.geoms)
data["surfaces"][0]["fills"]=[{"outer":[list(p) for p in polygon.exterior.coords][:-1],
                                    "holes":[[list(p) for p in ring.coords][:-1] for ring in polygon.interiors]}
                                   for polygon in parts if polygon.area>.01]
data["surfaces"][0]["additionalFillArea"]=round(fill.area,3)
data["surfaces"][0]["fillNote"]="Exact GIS difference against all already joined STREET_SURFACES. Do not render a duplicate plane over the existing parking."
(ROOT / "shared/data/reality-ground.json").write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
image=Image.open(ROOT / "docs/streets/strahov-ortho-2024.jpg").convert("RGB")
draw=ImageDraw.Draw(image,"RGBA")
draw.polygon(ASPHALT,fill=(240,160,45,60),outline=(255,200,50,255),width=3)
draw.polygon(LOGO,outline=(255,70,200,255),width=3)
for entry in lines:
    draw.line([tuple(p) for p in entry["sourcePixels"]],fill=(60,220,255,210),width=2)
for i,p in enumerate(SLOTS):
    draw.ellipse((p[0]-4,p[1]-4,p[0]+4,p[1]+4),outline=(80,255,80,255),width=2)
draw.text((900,850),"IPR 2024-06-08 | gold: interpreted asphalt | magenta: observed Silicon Hill paint | cyan: bay lines | green: representative bays",fill="white",stroke_fill="black",stroke_width=2)
image.save(DOC / "ground-photo-interpretation.jpg",quality=94)
print(json.dumps({"surfacePoints":data["surfaces"][0]["points"],"logo":data["paint"][0]["points"],"slots":len(SLOTS),"paintLines":len(lines),"additionalAsphaltFillArea":round(fill.area,3)}))
