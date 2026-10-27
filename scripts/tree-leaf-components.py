"""Read-only alpha analysis; writes JSON, never images. Requires Pillow + NumPy.

python scripts/tree-leaf-components.py [--check]
All image coordinates use pixel EDGES, origin top left. Blender UV is
(x/width, 1-y/height); its hull winding is explicitly counter-clockwise.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path("shared/data/assets/tree-materials-manifest.json")
OUTPUT = Path("shared/data/tree-leaf-components.json")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def hull(points):
    """Exact convex hull in numeric x/y coordinates; no raster changes."""
    points = sorted(set(points))
    if len(points) <= 1:
        return points
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    def half(values):
        result = []
        for point in values:
            while len(result) >= 2 and cross(result[-2], result[-1], point) <= 0:
                result.pop()
            result.append(point)
        return result
    return half(points)[:-1] + half(reversed(points))[:-1]


def polygon_area(points):
    return abs(sum(a[0]*b[1]-a[1]*b[0]
                   for a, b in zip(points, points[1:]+points[:1]))) / 2


def conservative_hull(points, width, height, sides=12, guard=1):
    """Intersection of twelve supporting half-planes, clipped to atlas edges.

    This outer approximation cannot cut opaque pixels, unlike vertex deletion
    or an inscribed simplified hull. It trades some transparent fill for a
    strict <=12-vertex cutout. Caller may choose the exact hull instead.
    """
    planes = []
    corners = [(0, 0), (width, 0), (width, height), (0, height)]
    for index in range(sides):
        angle = math.tau * index / sides
        nx, ny = math.cos(angle), math.sin(angle)
        if abs(nx) < 1e-12: nx = 0.0
        if abs(ny) < 1e-12: ny = 0.0
        support = max(nx*x+ny*y for x, y in points) + guard
        # The four axis planes also keep UVs inside the original atlas.
        if index % (sides // 4) == 0:
            support = min(support, max(nx*x+ny*y for x, y in corners))
        planes.append((nx, ny, support))
    # Some supporting planes are redundant. Clip a polygon instead of blindly
    # intersecting adjacent lines, which could violate a nonadjacent plane.
    polygon = [(0.0, 0.0), (float(width), 0.0), (float(width), float(height)), (0.0, float(height))]
    for nx, ny, support in planes:
        clipped = []
        for a, b in zip(polygon, polygon[1:]+polygon[:1]):
            da, db = nx*a[0]+ny*a[1]-support, nx*b[0]+ny*b[1]-support
            if da <= 1e-9:
                clipped.append(a)
            if (da <= 0) != (db <= 0):
                t = da/(da-db)
                clipped.append((a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])))
        polygon = clipped
    return hull([(round(x, 8), round(y, 8)) for x, y in polygon])


def component_runs(mask):
    """8-connected components via scanline runs, O(pixels + neighbouring runs).

    No SciPy install and no Python object per opaque pixel. Parent arrays and
    run storage are temporary per atlas and released before the next atlas.
    """
    parents, runs, previous = [], [], []
    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index
    for y, row in enumerate(mask):
        edges = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
        starts, ends = np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)
        current, cursor = [], 0
        for start, end in zip(starts.tolist(), ends.tolist()):
            label = len(parents); parents.append(label)
            while cursor < len(previous) and previous[cursor][1] < start:
                cursor += 1
            scan = cursor
            while scan < len(previous) and previous[scan][0] <= end:
                parents[find(label)] = find(previous[scan][2]); scan += 1
            runs.append((y, start, end, label)); current.append((start, end, label))
        previous = current
    groups = {}
    for y, start, end, label in runs:
        groups.setdefault(find(label), []).append((y, start, end))
    return list(groups.values())


def analyze_mask(mask, atlas_metres=None, minimum_pixels=64):
    height, width = mask.shape
    accepted, rejected_count, rejected_pixels = [], 0, 0
    for runs in component_runs(mask):
        count = sum(end-start for _, start, end in runs)
        x0, x1 = min(start for _, start, _ in runs), max(end for _, _, end in runs)
        y0, y1 = min(y for y, _, _ in runs), max(y for y, _, _ in runs)+1
        if count < minimum_pixels or min(x1-x0, y1-y0) < 4:
            rejected_count += 1; rejected_pixels += count; continue
        corners = [(x, yy) for y, start, end in runs for x in (start, end) for yy in (y, y+1)]
        exact = hull(corners)
        outer = conservative_hull(exact, width, height)
        uv = lambda points: [[round(x/width, 10), round(1-y/height, 10)] for x, y in reversed(points)]
        def endpoint(row):
            pixels = [x for y, start, end in runs if y == row for x in range(start, end)]
            return [pixels[len(pixels)//2]+0.5, row+0.5]
        accepted.append({
            "boundsPixels": [x0, y0, x1, y1],
            "sizePixels": [x1-x0, y1-y0],
            "opaquePixels": count,
            "boxCoverage": count/((x1-x0)*(y1-y0)),
            "exactHullCoverage": count/polygon_area(exact),
            "cutoutCoverage": count/polygon_area(outer),
            "uvBoundsBlender": [x0/width, 1-y1/height, x1/width, 1-y0/height],
            "uvCentreBlender": [(x0+x1)/(2*width), 1-(y0+y1)/(2*height)],
            "exactHullPixels": exact,
            "cutoutHullPixels": outer,
            "exactHullUvBlender": uv(exact),
            "cutoutHullUvBlender": uv(outer),
            "sizeMetres": [(x1-x0)/width*atlas_metres[0], (y1-y0)/height*atlas_metres[1]] if atlas_metres else None,
            "physicalScaleKnown": atlas_metres is not None,
            "lowerExtremePixel": endpoint(y1-1),
            "upperExtremePixel": endpoint(y0),
        })
    # IDs follow source image order, never size order or random discovery order.
    accepted.sort(key=lambda item: (item["boundsPixels"][1], item["boundsPixels"][0]))
    for index, item in enumerate(accepted):
        item["id"] = index
    return {"opaquePixels": int(mask.sum()), "components": accepted,
            "rejectedComponents": {"count": rejected_count, "opaquePixels": rejected_pixels,
                                   "reason": "Below 64 opaque pixels or below 4 pixels in either dimension; source remains untouched."}}


def pilot_parts(asset_id, components, mask):
    # Source-scoped interpretation after viewing the ORIGINAL colour atlases.
    # Fir also contains bark strips and tiny disconnected needles: blindly
    # treating all alpha components as foliage would publish those as branches.
    fir_bounds = {
        (1336, 82, 1921, 755): "upper-right-spray",
        (387, 95, 878, 638): "upper-left-spray",
        (1103, 202, 1206, 468): "upper-single-twig",
        (1010, 532, 1292, 819): "middle-right-twig",
        (792, 592, 941, 783): "middle-left-twig",
        (626, 819, 1320, 1588): "lower-left-spray",
        (1299, 926, 1961, 1700): "lower-right-spray",
    }
    height, width = mask.shape
    parts = []
    for component in components:
        bounds = tuple(component["boundsPixels"])
        name = "leaf-"+str(component["id"]) if asset_id == "LeafSet024" else fir_bounds.get(bounds)
        component["pilotEligible"] = name is not None
        if name is None:
            continue
        attachment, tip = component["lowerExtremePixel"], component["upperExtremePixel"]
        polygon = component["cutoutHullPixels"]
        x0 = max(0, math.floor(min(p[0] for p in polygon)))
        x1 = min(width, math.ceil(max(p[0] for p in polygon)))
        y0 = max(0, math.floor(min(p[1] for p in polygon)))
        y1 = min(height, math.ceil(max(p[1] for p in polygon)))
        ys, xs = np.nonzero(mask[y0:y1, x0:x1])
        xs, ys = xs+x0+0.5, ys+y0+0.5
        inside = np.ones(len(xs), dtype=bool)
        for a, b in zip(polygon, polygon[1:]+polygon[:1]):
            inside &= (b[0]-a[0])*(ys-a[1])-(b[1]-a[1])*(xs-a[0]) >= -1e-5
        sampled = int(inside.sum())
        parts.append({"id": name, "componentId": component["id"],
                      "attachmentPixel": attachment, "axisTipPixel": tip,
                      "attachmentUvBlender": [attachment[0]/width, 1-attachment[1]/height],
                      "axisTipUvBlender": [tip[0]/width, 1-tip[1]/height],
                      "attachmentBasis": "Original colour atlas viewed 2026-10-25: base/petiole is downward, tip upward. Actual terminal opaque pixel selected; authored orientation, not a botanical survey.",
                      "sampledOpaquePixels": sampled,
                      "additionalIslandOpaquePixels": sampled-component["opaquePixels"],
                      "cutoutCoverage": sampled/polygon_area(polygon),
                      "physicalLengthMetres": math.hypot((tip[0]-attachment[0])/width*0.4, (tip[1]-attachment[1])/height*0.4) if asset_id == "LeafSet024" else None})
    if asset_id == "fir_tree_01" and len(parts) != len(fir_bounds):
        raise ValueError("Source twig topology changed; inspect before changing the explicit pilot whitelist")
    return parts


def read_opacity(path):
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[24] not in (8, 16):
        raise ValueError("Expected original 8/16-bit PNG opacity")
    depth = raw[24]
    with Image.open(path) as image:
        if image.mode not in ("L", "I", "I;16", "I;16B", "I;16L", "RGB", "RGBA"):
            raise ValueError("Unsupported opacity storage: " + image.mode)
        values = np.asarray(image)
        decoded_depth = depth
        if values.ndim == 3:
            if not (np.array_equal(values[:,:,0], values[:,:,1]) and np.array_equal(values[:,:,0], values[:,:,2])):
                raise ValueError("Opacity must be grayscale; cannot silently pick a colour/alpha channel")
            # Pillow's RGB16 PNG decoder exposes the most significant byte.
            # For the fixed 0.5 cutoff, highByte >=128 is EXACTLY equivalent to
            # rawUint16 >=32768. Tests independently decode original PNG rows.
            if depth == 16 and values.dtype == np.uint8:
                decoded_depth = 8
            values = values[:,:,0]
        # Do not Image.convert('L'): that clips 16-bit masks instead of scaling.
        cutoff = math.ceil(((1 << decoded_depth)-1) * 0.5)
        mask = values >= cutoff
    return mask, {"bitDepth": depth, "decodedBitDepth": decoded_depth,
                  "cutoffInteger": cutoff, "sourceCutoffInteger": math.ceil(((1 << depth)-1)*0.5), "cutoffNormalized": 0.5,
                  "semantics": "grayscale map values; PNG alpha channel is not the opacity source"}


def build(root=ROOT):
    manifest_bytes = (root/MANIFEST).read_bytes()
    manifest = json.loads(manifest_bytes)
    output = {"schemaVersion": 1, "materialManifest": str(MANIFEST).replace("\\", "/"),
              "materialManifestSha256": digest(manifest_bytes),
              "analysis": {"algorithm": "scanline-8-connected-alpha-v1", "connectivity": 8, "minimumOpaquePixels": 64,
                           "imageCoordinates": "pixel edges, x right, y down, origin top-left; bounds are [x0,y0,x1,y1) when enumerating pixels",
                           "blenderUv": "u=x/width; v=1-y/height; hulls counter-clockwise in UV space",
                           "cutout": "outer 12-direction supporting-plane hull, 1 pixel guard, clamped to atlas; contains exact opaque pixel hull",
                           "sourcePixelsModified": False}, "atlases": []}
    for asset in manifest["assets"]:
        entry = asset["maps"]["opacity"]
        path = root/entry["sourcePath"]
        if digest(path.read_bytes()) != entry["sha256"]:
            raise ValueError("Original opacity hash mismatch: " + asset["id"])
        mask, storage = read_opacity(path)
        if list(reversed(mask.shape)) != asset["atlasPixels"]:
            raise ValueError("Opacity size differs from material atlas")
        result = analyze_mask(mask, asset["atlasMetres"])
        result["parts"] = pilot_parts(asset["id"], result["components"], mask)
        output["atlases"].append({"id": asset["id"], "opacitySha256": entry["sha256"],
                                  "atlasPixels": asset["atlasPixels"], "atlasMetres": asset["atlasMetres"],
                                  "storage": storage, **result})
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Recompute and compare JSON without writing")
    args = parser.parse_args()
    result = build()
    encoded = (json.dumps(result, indent=2, ensure_ascii=False)+"\n").encode("utf8")
    if args.check:
        if (ROOT/OUTPUT).read_bytes() != encoded:
            raise ValueError("Component output differs from fresh original-alpha analysis")
    else:
        (ROOT/OUTPUT).write_bytes(encoded)
    print(json.dumps({"status": "checked" if args.check else "derived-metadata-only",
                      "sha256": digest(encoded), "atlases": [{"id": a["id"], "components": len(a["components"]),
                      "opaquePixels": a["opaquePixels"], "rejected": a["rejectedComponents"]} for a in result["atlases"]]}))


if __name__ == "__main__":
    main()
