"""Fetch a bounded public ČÚZK DMR 5G F32 export; no credentials or map scraping.

Run with Python and Pillow. The WGS84 export pixel CENTRES are the local grid
vertices. adjustAspectRatio=false matters: longitude degrees are not metres.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import math
import urllib.parse
import urllib.request
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'.cache/street-python'))
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs/reality-pack/terrain"
DOC.mkdir(parents=True, exist_ok=True)
SERVICE = "https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer"
COVERAGE = json.loads((ROOT/'shared/data/campus-coverage.json').read_text(encoding='utf-8'))
ORIGIN = COVERAGE['origin']
GRID = COVERAGE['terrainGrid']
COLS = round((GRID["maxX"] - GRID["minX"]) / GRID["step"]) + 1
ROWS = round((GRID["maxZ"] - GRID["minZ"]) / GRID["step"]) + 1
LON_M = 111320 * math.cos(math.radians(ORIGIN["lat"]))

def lon(x):
    return ORIGIN["lon"] + x / LON_M

def lat(z):
    return ORIGIN["lat"] - z / 111320

def post(path, data):
    request = urllib.request.Request(SERVICE + path, data=urllib.parse.urlencode(data).encode(),
                                     headers={"User-Agent": "StrahovCrazyShow/0.1 (open-data terrain research)"})
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.load(response)
    if "error" in result:
        raise RuntimeError(result["error"])
    return result

metadata = json.load(urllib.request.urlopen(SERVICE + "?f=json", timeout=60))
(DOC / "dmr5g-service.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
params = {"f": "json", "bbox": ",".join(map(str, [lon(GRID["minX"] - 2), lat(GRID["maxZ"] + 2),
                                                  lon(GRID["maxX"] + 2), lat(GRID["minZ"] - 2)])),
          "bboxSR": 4326, "imageSR": 4326, "size": f"{COLS},{ROWS}", "adjustAspectRatio": "false",
          "format": "tiff", "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation",
          "renderingRule": json.dumps({"rasterFunction": "None"})}
export = post("/exportImage", params)
with urllib.request.urlopen(export["href"], timeout=60) as response:
    tif = response.read()
(DOC / "dmr5g-strahov-4m.tif").write_bytes(tif)
image = Image.open(DOC / "dmr5g-strahov-4m.tif")
assert image.size == (COLS, ROWS), image.size
assert image.mode == "F", image.mode
values = [round(float(value), 3) for value in image.getdata()]
assert all(200 < value < 500 for value in values), "Nodata or non-elevation pixels"
entry = post("/identify", {"f": "json", "geometryType": "esriGeometryPoint", "returnGeometry": "false",
            "returnCatalogItems": "false", "renderingRule": json.dumps({"rasterFunction": "None"}),
            "geometry": json.dumps({"x": lon(-7), "y": lat(-73), "spatialReference": {"wkid": 4326}})})
result = {"schemaVersion": 1, "origin": ORIGIN, "grid": {**GRID, "columns": COLS, "rows": ROWS},
          "heights": values, "storage": "row-major; first row north/minZ, columns west-to-east; vertex heights metres Bpv",
          "source": {"provider": "ČÚZK / Zeměměřický úřad", "service": SERVICE,
                     "product": "DMR 5G public image service, source 2m raster exported at 4m",
                     "sourceAcquisition": "service metadata: national lidar acquisition 2009–2013, later updates possible; local acquisition date not supplied",
                     "heightCRS": "Baltic 1957 / Bpv, EPSG vertical 8357", "license": "CC BY 4.0",
                     "licenseUrl": "https://ags.cuzk.gov.cz/opendata/", "attribution": "© ČÚZK, upraveno pro StrahovCrazyShow",
                     "downloadedAt": datetime.now(timezone.utc).isoformat(), "tifSha256": hashlib.sha256(tif).hexdigest(),
                     "request": params, "responseExtent": export["extent"]},
          "reference": {"x": -7, "z": -73, "absoluteHeight": float(entry["value"]),
                        "meaning": "B6 west entry terrain sample; render y=0 at this DMR5G reference, not a surveyed threshold"},
          "statistics": {"minAbsolute": min(values), "maxAbsolute": max(values), "samples": len(values)},
          "adaptations": [{"kind": "B6-interior-foundation", "bounds": {"minX": -12, "maxX": 20, "minZ": -96, "maxZ": -16},
                           "renderY": 0, "blendApronMetres": 4,
                           "reason": "Existing schematic B6 floor and basement at y=0; source heights retained independently. Not a claim of measured grading."}]}
(ROOT / "shared/data/terrain-grid.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
(DOC / "download.json").write_text(json.dumps({"request": params, "response": export,
    "referenceIdentify": entry, "statistics": result["statistics"], "tifSha256": result["source"]["tifSha256"]}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"grid": result["grid"], "reference": result["reference"], "statistics": result["statistics"]}, ensure_ascii=False))
