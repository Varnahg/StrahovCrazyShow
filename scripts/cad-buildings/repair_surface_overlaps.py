"""Create render-only GLBs by subtracting the verified overlapping faces."""

import hashlib
from itertools import product
import json
from pathlib import Path
import struct
import sys

import numpy as np
from shapely import constrained_delaunay_triangles, get_parts, union_all
from shapely.geometry import Polygon
from shapely.strtree import STRtree


ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "public"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
PLANE_TOLERANCE = 0.00008
MIN_AREA = 0.0000002


class Glb:
    def __init__(self, data):
        magic, version, size, json_size, kind = struct.unpack_from("<4sIIII", data)
        assert (magic, version, size, kind) == (b"glTF", 2, len(data), JSON_CHUNK)
        bin_offset = 20 + json_size
        bin_size, bin_kind = struct.unpack_from("<II", data, bin_offset)
        assert bin_kind == BIN_CHUNK and bin_offset + 8 + bin_size == len(data)
        self.doc = json.loads(data[20:bin_offset])
        self.data = bytearray(data[bin_offset + 8:])
        assert len(self.doc["buffers"]) == 1

    def read(self, index):
        accessor = self.doc["accessors"][index]
        view = self.doc["bufferViews"][accessor["bufferView"]]
        assert view["buffer"] == 0 and "byteStride" not in view and "sparse" not in accessor
        dtype = {5123: "<u2", 5125: "<u4", 5126: "<f4"}[accessor["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[accessor["type"]]
        offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        return np.frombuffer(self.data, dtype, accessor["count"] * width, offset).copy().reshape((-1, width))

    def append(self, data, target):
        offset = len(self.data)
        assert offset % 4 == 0
        raw = data.tobytes()
        self.data.extend(raw)
        views = self.doc["bufferViews"]
        accessors = self.doc["accessors"]
        views.append(dict(buffer=0, byteOffset=offset, byteLength=len(raw), target=target))
        index = target == 34963
        accessor = dict(bufferView=len(views) - 1, count=len(data),
                        componentType=5125 if index else 5126,
                        type="SCALAR" if index else f"VEC{data.shape[1]}")
        if target == 34962 and data.shape[1] == 3:
            accessor.update(min=data.min(axis=0).tolist(), max=data.max(axis=0).tolist())
        accessors.append(accessor)
        return len(accessors) - 1

    def encode(self):
        self.doc["buffers"][0]["byteLength"] = len(self.data)
        doc = json.dumps(self.doc, ensure_ascii=False, separators=(",", ":")).encode()
        doc += b" " * (-len(doc) % 4)
        return (struct.pack("<4sIIII", b"glTF", 2, 28 + len(doc) + len(self.data), len(doc), JSON_CHUNK)
                + doc + struct.pack("<II", len(self.data), BIN_CHUNK) + self.data)


def face_keys(positions):
    xyz = positions.astype(np.float64)
    cross = np.cross(xyz[:, 1] - xyz[:, 0], xyz[:, 2] - xyz[:, 0])
    lengths = np.linalg.norm(cross, axis=1)
    unit = np.divide(cross, lengths[:, None], out=np.zeros_like(cross), where=lengths[:, None] > 1e-10)
    axis = np.abs(unit).argmax(axis=1)
    offset = np.sum(unit * xyz[:, 0], axis=1)
    return unit, axis, offset, lengths


def primitives(glb, role, floor=None):
    def visit(index, identity):
        node = glb.doc["nodes"][index]
        identity = identity and not any(k in node for k in ("translation", "rotation", "scale", "matrix"))
        extras = node.get("extras", {})
        if "mesh" in node and extras.get("role") == role and (floor is None or extras.get("floorId") == floor):
            assert identity, node["name"]
            yield from glb.doc["meshes"][node["mesh"]]["primitives"]
        for child in node.get("children", []):
            yield from visit(child, identity)
    for start in glb.doc["scenes"][glb.doc.get("scene", 0)]["nodes"]:
        yield from visit(start, True)


def triangle_positions(glb, primitive):
    return glb.read(primitive["attributes"]["POSITION"])[glb.read(primitive["indices"]).reshape((-1, 3))]


def projected_catalog(points, horizontal_only):
    unit, axis, offsets, lengths = face_keys(points)
    tables = []
    for d in range(3):
        if horizontal_only and d != 1:
            tables.append(None)
            continue
        select = (axis == d) & (lengths > MIN_AREA)
        if horizontal_only:
            select &= np.abs(unit[:, 1]) > 0.999999
        axes = [i for i in range(3) if i != d]
        u, h = unit[select], offsets[select]
        polygons = [Polygon(t) for t in points[select][:, :, axes]]
        tables.append((axes, u, h, polygons, STRtree(polygons)))
    return tables


def trim_primitive(glb, primitive, catalog, horizontal_only):
    assert set(primitive["attributes"]).issubset({"POSITION", "NORMAL", "TEXCOORD_0"})
    attributes = {key: glb.read(value) for key, value in primitive["attributes"].items()}
    indices = glb.read(primitive["indices"]).reshape((-1, 3))
    positions = attributes["POSITION"][indices]
    normals, axis, offsets, lengths = face_keys(positions)
    added = {key: [] for key in attributes}
    updated = []
    trimmed = 0
    removed_area = 0.
    for i, indexes in enumerate(indices):
        d = int(axis[i])
        table = catalog[d]
        if table is None or lengths[i] <= MIN_AREA or (horizontal_only and abs(normals[i, 1]) < 0.999999):
            updated.append(indexes)
            continue
        axes, target_normals, target_offsets, polygons, tree = table
        xyz = positions[i].astype(np.float64)
        points = xyz[:, axes]
        polygon = Polygon(points)
        unit = normals[i]
        possible = tree.query(polygon)
        same_plane = ((target_normals[possible] @ unit) >= 0.99999999
                      ) & (np.abs(target_offsets[possible] - offsets[i]) <= PLANE_TOLERANCE)
        cutters = [polygons[j] for j in possible[same_plane] if polygons[j].intersects(polygon)]
        if not cutters:
            updated.append(indexes)
            continue
        # Clip at the original edges, then preserve the original attributes by
        # interpolating them in the original triangle's coordinate system.
        cut = union_all(cutters)
        remainder = polygon.difference(cut)
        loss = polygon.area - remainder.area
        if loss <= MIN_AREA:
            updated.append(indexes)
            continue
        trimmed += 1
        removed_area += loss / abs(unit[d])
        basis = np.column_stack([points[1] - points[0], points[2] - points[0]])
        tessellated = 0.
        for part in get_parts(remainder):
            if part.geom_type != "Polygon" or part.area <= MIN_AREA:
                continue
            for tri in get_parts(constrained_delaunay_triangles(part)):
                if tri.area <= MIN_AREA:
                    continue
                corners = np.asarray(tri.exterior.coords)[:3]
                uv = np.linalg.solve(basis, (corners - points[0]).T).T
                weights = np.column_stack([1 - uv.sum(axis=1), uv])
                if np.linalg.det(weights) < 0:
                    weights[[1, 2]] = weights[[2, 1]]
                start = len(attributes["POSITION"]) + len(added["POSITION"])
                for key, original in attributes.items():
                    values = weights @ original[indexes]
                    if key == "NORMAL":
                        values /= np.linalg.norm(values, axis=1)[:, None]
                    added[key].extend(values)
                updated.append([start, start + 1, start + 2])
                tessellated += tri.area
        assert abs(tessellated - remainder.area) < max(0.00002, remainder.area * 1e-6)
    if not trimmed:
        return 0, 0.
    assert updated
    for key, original in attributes.items():
        if added[key]:
            data = np.concatenate([original, np.asarray(added[key], dtype="<f4")])
            assert np.isfinite(data).all()
            primitive["attributes"][key] = glb.append(data, 34962)
    primitive["indices"] = glb.append(np.asarray(updated, dtype="<u4").reshape(-1), 34963)
    return trimmed, removed_area


def clip_surface(glb, owner_role, edited_role="wall", owner_floor=None, edited_floor=None, horizontal_only=False):
    owned = np.concatenate([triangle_positions(glb, p) for p in primitives(glb, owner_role, owner_floor)])
    catalog = projected_catalog(owned, horizontal_only)
    patches = [trim_primitive(glb, p, catalog, horizontal_only) for p in primitives(glb, edited_role, edited_floor)]
    trimmed, area = sum(x[0] for x in patches), sum(x[1] for x in patches)
    assert trimmed and area > 1
    return dict(affectedTriangles=trimmed, removedAreaM2=round(area, 6))


def deduplicate_frames(glb):
    removed = 0
    for role in ("door-frame", "window-frame"):
        for primitive in primitives(glb, role):
            indices = glb.read(primitive["indices"]).reshape((-1, 3))
            positions = glb.read(primitive["attributes"]["POSITION"])
            keys = {}
            keep = []
            for face in indices:
                # The CAD export may round identical walls in adjoining zones
                # independently. Use 10 μm, retaining orientation and material.
                vertices = [tuple(float(x) for x in positions[index]) for index in face]
                ordered = min(vertices[i:] + vertices[:i] for i in range(3))
                center = np.mean(ordered, axis=0)
                key = tuple(int(np.floor(x * 100_000)) for x in center)
                found = any(
                    all(abs(a - b) <= 0.00001 for p, q in zip(ordered, other) for a, b in zip(p, q))
                    for dx, dy, dz in product((-1, 0, 1), repeat=3)
                    for other in keys.get((key[0] + dx, key[1] + dy, key[2] + dz), ())
                )
                if not found:
                    keys.setdefault(key, []).append(ordered)
                    keep.append(face)
            if len(keep) < len(indices):
                assert keep
                removed += len(indices) - len(keep)
                primitive["indices"] = glb.append(np.asarray(keep, dtype="<u4").reshape(-1), 34963)
    return removed


def repair(building, source, target):
    source_bytes = source.read_bytes()
    glb = Glb(source_bytes)
    if building == "b01":
        patches = {
            "windowSills": clip_surface(glb, "window-sill", horizontal_only=True),
            "doorFrames": clip_surface(glb, "door-frame"),
            "stairLanding": clip_surface(glb, "stair-landing", "slab", "p01", "p01", horizontal_only=True),
        }
    else:
        patches = {"storeySeam": clip_surface(glb, "wall", owner_floor="n05", edited_floor="n06")}
    duplicates = deduplicate_frames(glb)
    result = glb.encode()
    with target.open("xb") as file:
        file.write(result)
    native = PUBLIC / "models" / "cad-buildings" / f"{building}.glb"
    return dict(nativeSha256=hashlib.sha256(native.read_bytes()).hexdigest(),
                sourceSha256=hashlib.sha256(source_bytes).hexdigest(), sha256=hashlib.sha256(result).hexdigest(),
                bytes=len(result), patches=patches, removedDuplicateFrameTriangles=duplicates)


if __name__ == "__main__":
    output = Path(sys.argv[1]).resolve()
    assert output.drive.upper() == "D:"
    output.mkdir(parents=True, exist_ok=True)
    release = json.loads((ROOT / "shared/data/assets/geometry-release-20261111.json").read_text())
    result = {}
    for building, relative in (("b01", "models/cad-buildings/b01.glb"), ("b06", release["b06"]["url"].lstrip("/"))):
        name = f"{building}-surface-repair-20261114.glb"
        result[building] = repair(building, PUBLIC / relative, output / name)
        result[building]["url"] = f"/models/cad-buildings/key79/{name}"
    print(json.dumps(result, indent=2))
