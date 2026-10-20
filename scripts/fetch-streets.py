"""Build source-backed, joined Strahov pavement geometry, not segment boxes.

Run from the repository root with Python 3.13 (Blender's Python is sufficient).
Dependencies: shapely, pyproj, Pillow (see docs/streets/README.md).
The runtime consumes the generated JSON and has no Python/GIS dependency.
"""
import argparse
import collections
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".cache/street-python"))
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely import make_valid
from pyproj import Transformer

COVERAGE = json.loads((ROOT/'shared/data/campus-coverage.json').read_text(encoding='utf-8'))
ORIGIN = COVERAGE['origin']
BOUNDS = COVERAGE['walkBounds']
CLIP = box(BOUNDS["minX"] - 12, BOUNDS["minZ"] - 12,
           BOUNDS["maxX"] + 12, BOUNDS["maxZ"] + 12)
BB=COVERAGE['osmBBox']
OSM_URL = 'https://api.openstreetmap.org/api/0.6/map?bbox='+','.join(str(BB[k]) for k in ['west','south','east','north'])
ORTHO = "https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer"
DOCS = ROOT / "docs/streets"
DATA = ROOT / "shared/data"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={
        "User-Agent": "StrahovCrazyShow local reference prototype (no bulk download)"
    }), timeout=60).read()


def project(lat, lon):
    return [round((lon - ORIGIN["lon"]) * 111320 * math.cos(math.radians(ORIGIN["lat"])), 3),
            round(-(lat - ORIGIN["lat"]) * 111320, 3)]


def unproject(x, z):
    return [ORIGIN["lon"] + x / (111320 * math.cos(math.radians(ORIGIN["lat"]))),
            ORIGIN["lat"] - z / 111320]


def tags(element):
    return {tag.get("k"): tag.get("v") for tag in element.findall("tag")}


def number(raw):
    try:
        return float(str(raw).replace(" m", "").replace(",", "."))
    except (ValueError, TypeError):
        return None


def width_for(t):
    width = number(t.get("width"))
    if width and 0.4 <= width <= 30:
        return width, "osm-width-tag-not-independently-surveyed"
    width = number(t.get("est_width"))
    if width and 0.4 <= width <= 30:
        return width, "osm-estimated-width-tag"
    h = t.get("highway")
    if h == "service":
        return (6 if t.get("lanes") == "2" else 3.4 if t.get("service") == "driveway" else 4.2), "class-inferred-not-measured"
    fallback = {"secondary": 7.0, "tertiary": 6.5, "residential": 6.0,
                "unclassified": 5.5, "living_street": 5.0, "pedestrian": 3.0,
                "footway": 1.8, "path": 1.4, "steps": 1.8, "cycleway": 2.5,
                "track": 2.8}
    return fallback.get(h, 1.8), "class-inferred-not-measured"


def polygon_parts(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == "Polygon":
        return [geometry]
    if hasattr(geometry, "geoms"):
        return [p for g in geometry.geoms for p in polygon_parts(g)]
    return []


def encode_polygon(p):
    def ring(coords):
        # Keep centimetre precision without retaining duplicated closing vertex.
        return [[round(x, 3), round(z, 3)] for x, z in list(coords)[:-1]]
    return {"outer": ring(p.exterior.coords), "holes": [ring(r.coords) for r in p.interiors],
            "area": round(p.area, 3)}


def build(osm):
    root = ET.fromstring(osm)
    nodes = {n.get("id"): {"element": n, "tags": tags(n), "lat": float(n.get("lat")),
                           "lon": float(n.get("lon")), "point": project(float(n.get("lat")), float(n.get("lon")))}
             for n in root.findall("node")}
    ways = []
    buildings = []
    parking = []
    exclusions = []
    for w in root.findall("way"):
        refs = [n.get("ref") for n in w.findall("nd")]
        points = [nodes[n]["point"] for n in refs if n in nodes]
        t = tags(w)
        if len(points) < 2:
            continue
        closed = refs[0] == refs[-1] and len(points) >= 4
        shape = make_valid(Polygon(points)) if closed else LineString(points)
        if t.get("highway") and (t.get("tunnel") in ["yes", "building_passage"] or int(t.get("layer", "0")) < 0):
            exclusions.append({"osmId": w.get("id"), "reason": "below-ground-or-covered-separate-level", "tags": t})
            continue
        if not shape.intersects(CLIP):
            continue
        if t.get("building") and t.get("building") != "roof":
            buildings.extend(polygon_parts(make_valid(Polygon(points))))
        if t.get("amenity") == "parking" and closed:
            parking.append({"id": w.get("id"), "points": points[:-1], "tags": t,
                            "shape": make_valid(Polygon(points))})
        if not t.get("highway"):
            continue
        if t["highway"] not in ["secondary", "tertiary", "residential", "unclassified", "living_street", "service", "footway", "path", "steps", "pedestrian", "track", "cycleway"]:
            exclusions.append({"osmId": w.get("id"), "reason": "not-supported-walkable-surface", "tags": t})
            continue
        width, provenance = width_for(t)
        is_area = closed and t.get("area") == "yes"
        geometry = shape if is_area else LineString(points).buffer(width / 2, quad_segs=4, cap_style="round", join_style="round")
        ways.append({"id": w.get("id"), "nodeIds": refs, "points": points,
                     "tags": t, "width": width, "widthProvenance": provenance,
                     "isArea": is_area, "shape": geometry.intersection(CLIP),
                     "source": "https://www.openstreetmap.org/way/" + w.get("id")})
    building_union = unary_union(buildings)
    # Centimetre clearance prevents simplification/JSON rounding from slipping
    # a thin pavement sliver under a footprint wall.
    building_cutout = building_union.buffer(0.025, join_style="mitre")
    road_classes = {"secondary", "tertiary", "residential", "unclassified", "living_street", "service"}
    road_union = unary_union([w["shape"] for w in ways if w["tags"]["highway"] in road_classes])
    parking_union = unary_union([p["shape"] for p in parking]).intersection(CLIP)
    buckets = collections.defaultdict(list)
    features = []
    for w in ways:
        t = w["tags"]
        road = t["highway"] in road_classes
        surface = t.get("surface", "asphalt" if road else "paving_stones" if t["highway"] in ["footway", "pedestrian", "steps"] else "compacted")
        material = ("asphalt" if surface in ["asphalt", "paved"] else "sett" if surface in ["sett", "cobblestone"] else "gravel" if surface in ["compacted", "gravel", "ground", "dirt", "fine_gravel", "unpaved", "sand"] else "paving")
        kind = "road" if road else "steps" if t["highway"] == "steps" else "sidewalk" if t.get("footway") == "sidewalk" else "pedestrian-area" if w["isArea"] else "footway"
        # Road and foot surfaces share a precise disjoint boundary: no stack of boxes.
        geom = w["shape"].difference(building_cutout)
        if not road:
            geom = geom.difference(road_union).difference(parking_union)
        buckets[material].append(geom)
        features.append({k: v for k, v in w.items() if k != "shape"} | {
            "kind": kind, "surface": surface, "surfaceProvenance": "osm-tag" if t.get("surface") else "class-inferred-not-measured",
            "material": material, "renderArea": round(geom.area, 3),
            "length": round(LineString(w["points"]).length, 3)})
    for p in parking:
        buckets["asphalt"].append(p["shape"].intersection(CLIP).difference(building_cutout))
    # A separate, photo-interpreted source corrects only the stadium bend.
    # Keep the original OSM centreline/width and all existing non-asphalt
    # materials. The final material union below owns the shared mesh boundary.
    calibration_path = DATA / "road-calibration.json"
    calibration = json.loads(calibration_path.read_text(encoding="utf-8"))
    if calibration["origin"] != ORIGIN:
        raise ValueError("Road calibration origin differs from the OSM world origin")
    photo_footprint = unary_union([
        make_valid(Polygon(p["outer"], p["holes"]))
        for p in calibration["photoFootprint"]
    ]).intersection(CLIP)
    non_asphalt = unary_union([
        geom for material, geometries in buckets.items() if material != "asphalt"
        for geom in geometries
    ])
    photo_asphalt = photo_footprint.difference(building_cutout).difference(non_asphalt)
    photo_additions = photo_asphalt.difference(unary_union(buckets["asphalt"]))
    buckets["asphalt"].append(photo_asphalt)
    # These are interpreted road segments, not fabricated OSM node IDs. They
    # support local corridor/marking queries without changing raw OSM data or
    # introducing pedestrian navigation edges.
    features.extend(calibration["features"])
    calibration_provenance = {
        "data": "shared/data/road-calibration.json",
        "sha256": hashlib.sha256(calibration_path.read_bytes()).hexdigest(),
        "classification": calibration["classification"],
        "estimatedBoundaryUncertaintyMetres": calibration["estimatedBoundaryUncertaintyMetres"],
        "sources": calibration["sources"],
        "attribution": calibration["attribution"],
        "license": calibration["license"],
        "licenseSource": calibration["licenseSource"],
        "interpretedSegments": len(calibration["features"]),
        "photoFootprintArea": round(photo_footprint.area, 3),
        "addedAsphaltArea": round(photo_additions.area, 3),
        "rawOsmAndPidPreserved": True,
    }
    # Partition material buckets so even roads with different surfacing cannot flicker.
    occupied = Polygon()
    surfaces = []
    for material in ["asphalt", "sett", "paving", "gravel"]:
        union = unary_union(buckets[material]).difference(occupied)
        union = make_valid(union).simplify(0.012, preserve_topology=True).difference(building_cutout).difference(occupied)
        occupied = occupied.union(union)
        surfaces.append({"material": material, "polygons": [encode_polygon(p) for p in polygon_parts(union) if p.area > 0.02]})
    lamps = []
    crossings = []
    for nid, n in nodes.items():
        if not Point(n["point"]).intersects(CLIP):
            continue
        t = n["tags"]
        if t.get("highway") == "street_lamp" or t.get("man_made") == "street_lamp":
            lamps.append({"id": nid, "x": n["point"][0], "z": n["point"][1], "tags": t,
                          "height": number(t.get("height")) or 6.0,
                          "heightProvenance": "osm-tag" if t.get("height") else "typology-inferred-not-measured",
                          "provenance": "mapped-osm-node", "source": "https://www.openstreetmap.org/node/" + nid})
        if t.get("highway") == "crossing":
            crossings.append({"id": nid, "x": n["point"][0], "z": n["point"][1], "tags": t,
                              "source": "https://www.openstreetmap.org/node/" + nid})
    # There are no mapped curb ways in the source: do not invent blocking edges.
    curb_ways = []
    for w in root.findall("way"):
        if tags(w).get("barrier") == "kerb":
            curb_ways.append(w.get("id"))
    output = {"schemaVersion": 1, "origin": ORIGIN, "bounds": BOUNDS,
              "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
              "source": OSM_URL, "attribution": "© OpenStreetMap contributors · ODbL 1.0; datový podklad © IPR Praha · CC BY 4.0",
              "sourceSha256": hashlib.sha256(osm).hexdigest(),
              "terrain": "2D source polygons draped at runtime onto shared CUZK DMR5G triangles; no surveyed kerb heights",
              "features": features, "surfaces": surfaces,
              "roadCalibration": calibration_provenance,
              "parking": [{k: v for k, v in p.items() if k != "shape"} | {"source": "https://www.openstreetmap.org/way/" + p["id"]} for p in parking],
              "lamps": lamps, "crossings": crossings, "mappedCurbWayIds": curb_ways,
              "excludedWays": exclusions,
              "coverageNotes": ["Only mapped separate sidewalks are rendered; separate/no flags never create imaginary sidewalks.",
                                "Most OSM widths are explicit class estimates; tagged values are not independently surveyed.",
                                "Fourteen separate IPR 2024 photo-interpreted road segments calibrate the stadium bend; their widths are not surveyed and do not replace the raw OSM centreline.",
                                "Tree, lamp and entrance surveys are incomplete. A missing node does not imply absence.",
                                "Stairs preserve plan alignment; their true rise and landing heights await DTM/survey."]}
    write_json(DATA / "streets.json", output)
    audit = {"generatedAt": output["generatedAt"], "sourceSha256": output["sourceSha256"],
             "featureCount": len(features), "byKind": dict(collections.Counter(f["kind"] for f in features)),
             "widths": dict(collections.Counter(f["widthProvenance"] for f in features)),
             "names": sorted(set(f["tags"]["name"] for f in features if f["tags"].get("name"))),
             "parkingAreas": len(parking), "mappedLamps": len(lamps), "mappedCrossings": len(crossings),
             "surfaceArea": round(occupied.area, 2), "buildingOverlapArea": round(occupied.intersection(building_union).area, 6),
             "roadCalibration": calibration_provenance,
             "excludedWays": exclusions}
    write_json(DOCS / "audit.json", audit)
    print(json.dumps({k: v for k, v in audit.items() if k != "excludedWays"}, ensure_ascii=True))


def ortho(output_dir=None):
    # One georeferenced open-data image for visual interpretation. Never a game texture.
    output_dir = DOCS if output_dir is None else output_dir
    lon0, lat0 = unproject(BOUNDS["minX"] - 10, BOUNDS["maxZ"] + 10)
    lon1, lat1 = unproject(BOUNDS["maxX"] + 10, BOUNDS["minZ"] - 10)
    trans = Transformer.from_crs(4326, 3857, always_xy=True)
    x0, y0 = trans.transform(lon0, lat0)
    x1, y1 = trans.transform(lon1, lat1)
    width = 2048
    height = round(width * (y1 - y0) / (x1 - x0))
    params = {"f": "json", "bbox": f"{x0},{y0},{x1},{y1}", "bboxSR": 3857,
              "imageSR": 3857, "size": f"{width},{height}", "format": "jpg", "interpolation": "RSP_BilinearInterpolation"}
    service = json.loads(request(ORTHO + "?f=json"))
    result = json.loads(request(ORTHO + "/exportImage?" + urllib.parse.urlencode(params)))
    if "href" not in result:
        raise RuntimeError(result)
    image = request(result["href"])
    (output_dir / "strahov-ortho-2024.jpg").write_bytes(image)
    write_json(output_dir / "ortho-georeference.json", {
        "provider": "IPR Praha", "attribution": "datový podklad © IPR Praha",
        "license": "CC BY 4.0 (IPR open-data portal)",
        "licenseUrl": "https://geoportalpraha.cz/data-a-sluzby/otevrena-data",
        "service": ORTHO, "serviceDescription": service.get("serviceDescription"),
        "captureDate": "2024-06-08", "downloadedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "image": "strahov-ortho-2024.jpg", "sha256": hashlib.sha256(image).hexdigest(),
        "width": result.get("width", width), "height": result.get("height", height),
        "extent": result["extent"], "origin": ORIGIN,
        "interpretation": "Crowns and surfaces are interpreted manually, not a measured trunk inventory."})
    print("Saved one IPR ortho reference", width, height)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Download the official OSM bbox again")
    parser.add_argument("--ortho", action="store_true", help="Fetch one IPR open-data orthophoto reference")
    args = parser.parse_args()
    DOCS.mkdir(parents=True, exist_ok=True)
    source = ROOT / ".cache/osm.xml"
    if args.refresh or not source.exists():
        source.write_bytes(request(OSM_URL))
    build(source.read_bytes())
    if args.ortho:
        ortho()
