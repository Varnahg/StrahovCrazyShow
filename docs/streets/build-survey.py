"""Manually interpreted crown locations from the georeferenced IPR ortho.

Pixel centres are explicitly recorded below so this interpretation is reviewable.
They are approximate canopy centres, not measured trunk coordinates or species.
"""
from pathlib import Path
import sys
import json
import math

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".cache/street-python"))
from pyproj import Transformer
from PIL import Image, ImageDraw

DOC = ROOT / "docs/streets"
georef = json.loads((DOC / "ortho-georeference.json").read_text(encoding="utf-8"))
streets = json.loads((ROOT / "shared/data/streets.json").read_text(encoding="utf-8"))
extent = georef["extent"]
transform = Transformer.from_crs(3857, 4326, always_xy=True)
reverse = Transformer.from_crs(4326, 3857, always_xy=True)


def local(pixel):
    u, v = pixel[:2]
    mx = extent["xmin"] + u / georef["width"] * (extent["xmax"] - extent["xmin"])
    my = extent["ymax"] - v / georef["height"] * (extent["ymax"] - extent["ymin"])
    lon, lat = transform.transform(mx, my)
    origin = georef["origin"]
    return [round((lon - origin["lon"]) * 111320 * math.cos(math.radians(origin["lat"])), 2),
            round(-(lat - origin["lat"]) * 111320, 2)], [round(lon, 7), round(lat, 7)]


def pixel(x, z):
    origin = georef["origin"]
    lon = origin["lon"] + x / (111320 * math.cos(math.radians(origin["lat"])))
    lat = origin["lat"] - z / 111320
    mx, my = reverse.transform(lon, lat)
    return [(mx - extent["xmin"]) / (extent["xmax"] - extent["xmin"]) * georef["width"],
            (extent["ymax"] - my) / (extent["ymax"] - extent["ymin"]) * georef["height"]]


# Each tuple: observed pixel centre u,v and approximate crown diameter in pixels.
# Distinct crowns were picked by visual inspection, avoiding the continuous
# woodland north/east where individual trunk count cannot be inferred reliably.
CROWNS = [
    # West edge / Vaníčkova, northern campus entrance.
    (126,68,65),(173,88,55),(166,139,49),(256,225,60),(337,244,72),
    (167,341,74),(118,377,46),(151,445,64),(204,443,53),
    (159,536,65),(163,579,62),(291,558,79),(300,608,58),(351,458,72),
    (375,518,42),(343,377,56),
    # Northern end along Olympijská, B5 / B6 / B7 and around R-ko.
    (747,221,69),(793,239,88),(908,238,66),(955,236,63),(1004,228,51),
    (1094,233,66),(1194,282,65),(1049,329,57),(986,326,57),(944,332,43),
    (1280,360,73),(1262,426,76),(1285,468,67),
    # Mature trees at southern ends of northern dormitory row.
    (510,609,58),(557,590,65),(740,613,69),(773,617,45),
    # North/east detached crowns, not the continuous woodland.
    (1439,158,69),(1450,238,58),(1407,298,54),(1341,338,52),
    (1424,422,62),(1528,472,62),(1616,426,48),(1690,397,52),
    # Central parking border and southern-row entrances.
    (1475,818,57),(1360,823,62),(1280,823,62),(1223,817,58),
    (1180,860,65),(1050,836,46),(895,849,32),(845,864,50),(647,868,65),
    (403,871,46),(426,913,60),(184,863,55),(197,924,57),(170,978,70),
    (173,1044,69),(329,1137,67),(308,1155,62),(420,1119,76),(471,1115,69),
    (1013,1015,75),(1171,1090,63),(1186,1140,53),(1326,1140,64),
    (1581,954,40),(1594,1045,55),(1738,1101,76),(1812,1094,65),
    (1835,1158,54),(1875,1196,57),
    # Around B11 / B12, separately distinguishable crowns.
    (1600,652,63),(1775,637,62),(1871,674,70),(1910,688,57),(1894,757,62),
    (1813,463,62),(1901,507,66),(1931,561,57),
]


trees = []
for index, crown in enumerate(CROWNS):
    point, geographic = local(crown)
    trees.append({"id": f"ipr-crown-{index+1:03}", "x": point[0], "z": point[1],
                  "lon": geographic[0], "lat": geographic[1], "pixel": list(crown[:2]),
                  "crownDiameter": round(crown[2] / georef["width"] * 510, 2),
                  "species": None, "height": None,
                  "provenance": "reference-interpreted-not-surveyed",
                  "positionMeaning": "approximate-canopy-centre-not-measured-trunk",
                  "positionUncertaintyMetres": 2.5,
                  "sourceImageSha256": georef["sha256"], "source": georef["service"],
                  "captureDate": georef["captureDate"]})
result = {"schemaVersion": 1, "origin": georef["origin"],
          "attribution": georef["attribution"], "license": georef["license"],
          "source": georef["service"], "georeference": "docs/streets/ortho-georeference.json",
          "reviewedAt": "2026-10-10", "trees": trees,
          "limitations": ["Manually interpreted crown centres, not measured trunks.",
                          "Not a complete inventory: merged woodland crowns and occluded saplings are excluded.",
                          "Individual crown spread, trunk height and species are not surveyed.",
                          "Capture is June 2024, not a claim about every tree in October 2026."]}
(ROOT / "shared/data/surveyed-trees.json").write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

image = Image.open(DOC / georef["image"]).convert("RGB")
draw = ImageDraw.Draw(image)
for feature in streets["features"]:
    points = [pixel(x,z) for x,z in feature["points"]]
    draw.line(points, fill=(255, 193, 50) if feature["kind"] == "road" else (50, 230, 255), width=2)
for index, crown in enumerate(CROWNS):
    x,y,diameter = crown
    draw.ellipse((x-6,y-6,x+6,y+6), fill=(100,255,110), outline=(0,40,0), width=2)
    draw.text((x+7,y-8),str(index+1),fill=(255,255,255),stroke_width=2,stroke_fill=(0,0,0))
draw.rectangle((0,0,660,28),fill=(20,30,35))
draw.text((8,8),"IPR Praha 8.6.2024 | yellow: OSM road | cyan: OSM walking | numbered: interpreted crown",fill="white")
image.save(DOC / "survey-overlay.jpg", quality=92)
print("Saved", len(trees), "individually interpreted crowns and review overlay")
