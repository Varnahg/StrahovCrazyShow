"""Import and verify the entire, original highest-detail IPR 2023 cutout.

Run with Blender, not system Python. No decimation, welding, JPEG recompression,
colour grading, ground replacement or runtime cutouts are applied to this master.
The source I3S triangle order, coordinates and atlas UVs remain inspectable.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "shared/data/photogrammetry.json"
OUT = ROOT / "assets/blender/photogrammetry/strahov-ipr2023-master.blend"
AUDIT = ROOT / "docs/photogrammetry/blender-master-audit.json"
PREVIEW = ROOT / "docs/photogrammetry/evidence/blender-master-central-aerial.png"
START = time.perf_counter()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def log(message: str) -> None:
    print(f"[IPR master {time.perf_counter() - START:.1f}s] {message}", flush=True)


def resident_memory_bytes() -> int | None:
    """Working set of this importer, not graphics memory or a game measurement."""
    if sys.platform != "win32":
        return None
    import ctypes
    from ctypes import wintypes
    class MemoryCounters(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t)]
    counters = MemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
    psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
    if psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return int(counters.WorkingSetSize)
    return None


def jpeg_size(data: bytes) -> tuple[int, int]:
    """Read original SOF dimensions without allocating 2,588 full image buffers."""
    if data[:2] != b"\xff\xd8":
        raise ValueError("Invalid JPEG start")
    cursor = 2
    while cursor < len(data):
        if data[cursor] != 0xff:
            raise ValueError("Invalid JPEG marker")
        while data[cursor] == 0xff:
            cursor += 1
        marker = data[cursor]
        cursor += 1
        if marker == 0xda:
            break
        if marker in (0x01, 0xd8, 0xd9) or 0xd0 <= marker <= 0xd7:
            continue
        length = int.from_bytes(data[cursor:cursor + 2], "big")
        if length < 2 or cursor + length > len(data):
            raise ValueError("Invalid JPEG segment length")
        if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
                      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
            height, width = struct.unpack_from(">HH", data, cursor + 3)
            return width, height
        cursor += length
    raise ValueError("JPEG lacks an SOF marker")


def source_geometry(node: dict) -> tuple[np.ndarray, np.ndarray, list[int], list[list[int]]]:
    path = ROOT / "public" / node["geometry"].lstrip("/")
    data = path.read_bytes()
    if sha(data) != node["geometrySha256"]:
        raise ValueError(f"Geometry SHA mismatch: {node['id']}")
    count, features = struct.unpack_from("<II", data)
    if count != node["vertices"] or count % 3 or len(data) != 8 + count * 20 + features * 16:
        raise ValueError(f"Unsupported I3S layout: {node['id']}")
    positions = np.frombuffer(data, dtype="<f4", count=count * 3, offset=8).reshape((-1, 3))
    uv = np.frombuffer(data, dtype="<f4", count=count * 2, offset=8 + count * 12).reshape((-1, 2))
    if not np.isfinite(positions).all() or not np.isfinite(uv).all():
        raise ValueError(f"Nonfinite source data: {node['id']}")
    feature_ids = np.frombuffer(data, dtype="<u8", count=features, offset=8 + count * 20)
    ranges = np.frombuffer(data, dtype="<u4", count=features * 2,
                           offset=8 + count * 20 + features * 8).reshape((-1, 2))
    if any(a > b or b >= count // 3 for a, b in ranges):
        raise ValueError(f"Invalid feature face ranges: {node['id']}")
    return positions, uv, [int(i) for i in feature_ids], ranges.tolist()


def node_origin(node: dict, manifest: dict) -> tuple[float, float, float]:
    center = node["center"]
    factor = manifest["metresPerMercatorUnit"]
    return ((center[0] - manifest["mercatorOrigin"]["x"]) * factor,
            (center[1] - manifest["mercatorOrigin"]["y"]) * factor,
            center[2] - manifest["worldHeightReference"])


def local_positions(source: np.ndarray, manifest: dict) -> np.ndarray:
    result = source.copy()
    factor = manifest.get("localPositionScale", manifest["metresPerMercatorUnit"])
    result[:, :2] = (source[:, :2].astype(np.float64) * factor).astype(np.float32)
    return result


def material(node: dict) -> tuple[bpy.types.Material, tuple[int, int]]:
    texture_path = ROOT / "public" / node["texture"].lstrip("/")
    data = texture_path.read_bytes()
    if sha(data) != node["textureSha256"]:
        raise ValueError(f"Texture SHA mismatch: {node['id']}")
    dimensions = jpeg_size(data)
    image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.name = f"IPR2023_original_atlas_{node['id']}"
    image.colorspace_settings.name = "sRGB"
    image["original_sha256"] = node["textureSha256"]
    image["original_width"], image["original_height"] = dimensions
    image["attribution"] = "datový podklad © IPR Praha"
    # External JPEG remains exact and is already shipped under public/models.
    image.filepath = "//" + Path(__import__("os").path.relpath(texture_path, OUT.parent)).as_posix()
    result = bpy.data.materials.new(f"IPR2023_original_phototexture_{node['id']}")
    result.use_nodes = True
    nodes = result.node_tree.nodes
    nodes.clear()
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "Original IPR JPEG, no resizing or colour grading"
    texture.image = image
    texture.interpolation = "Linear"
    texture.extension = "CLIP"
    texture.location = (-300, 0)
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    uv.location = (-500, 0)
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1
    emission.location = (0, 0)
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (200, 0)
    result.node_tree.links.new(uv.outputs["UV"], texture.inputs["Vector"])
    result.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    result.node_tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    nodes.active = texture
    result["source_texture_sha256"] = node["textureSha256"]
    result["source_id"] = node["id"]
    result["photobaked_lighting"] = True
    result["shader_note"] = "Unlit original atlas: captured shadows remain; no additional relighting."
    # The master stores references, not multi-gigabyte decoded pixel duplicates.
    image.buffers_free()
    return result, dimensions


def import_master(manifest: dict, manifest_sha: str, selected: list[dict]) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene["source_provider"] = manifest["provider"]
    scene["source_item"] = manifest["sourceItem"]
    scene["source_layer"] = manifest["source"]
    scene["source_capture"] = manifest["capture"]
    scene["source_license"] = manifest["license"]
    scene["source_attribution"] = manifest["attribution"]
    scene["source_manifest_sha256"] = manifest_sha
    scene["source_item_metadata_sha256"] = manifest["sourceItemSha256"]
    scene["horizontal_crs"] = manifest["horizontalCRS"]
    scene["vertical_crs"] = manifest["verticalCRS"]
    scene["origin_latitude"] = manifest["origin"]["lat"]
    scene["origin_longitude"] = manifest["origin"]["lon"]
    scene["mercator_origin_x"] = manifest["mercatorOrigin"]["x"]
    scene["mercator_origin_y"] = manifest["mercatorOrigin"]["y"]
    scene["metres_per_mercator_unit"] = manifest["metresPerMercatorUnit"]
    scene["height_reference_bpv_metres"] = manifest["worldHeightReference"]
    scene["axes"] = "Blender X east, Y north, Z up; game x=X, y=Z, z=-Y; metres"
    scene["master_scope"] = "All original highest-detail L16 tiles, including tile margins; no runtime cutouts/repairs."
    scene["texture_v_conversion"] = "UVMap=(u,1-v); ORIGINAL_I3S_UV=(u,v) unchanged float32"
    scene["originality"] = "Original triangle order, no welding/decimation/texture resize/recompression/AI"
    collection = bpy.data.collections.new("IPR Praha · summer 2023 · original highest detail L16")
    scene.collection.children.link(collection)
    report = []
    extents_min = np.full(3, np.inf)
    extents_max = np.full(3, -np.inf)
    memory_samples = []
    for index, node in enumerate(selected):
        source, source_uv, feature_ids, ranges = source_geometry(node)
        positions = local_positions(source, manifest)
        count = len(source)
        mesh = bpy.data.meshes.new(f"IPR2023_L16_{node['id']}_original_mesh")
        mesh.vertices.add(count)
        mesh.vertices.foreach_set("co", positions.reshape(-1))
        mesh.loops.add(count)
        mesh.loops.foreach_set("vertex_index", np.arange(count, dtype=np.int32))
        mesh.polygons.add(count // 3)
        mesh.polygons.foreach_set("loop_start", np.arange(0, count, 3, dtype=np.int32))
        mesh.polygons.foreach_set("loop_total", np.full(count // 3, 3, dtype=np.int32))
        mesh.uv_layers.new(name="UVMap")
        blender_uv = source_uv.copy()
        blender_uv[:, 1] = 1 - blender_uv[:, 1]
        mesh.uv_layers["UVMap"].data.foreach_set("uv", blender_uv.reshape(-1))
        mesh.uv_layers.new(name="ORIGINAL_I3S_UV")
        mesh.uv_layers["ORIGINAL_I3S_UV"].data.foreach_set("uv", source_uv.reshape(-1))
        mesh.uv_layers.active = mesh.uv_layers["UVMap"]
        # Source coordinate floats remain bit-identical, before the unit transform.
        source_attribute = mesh.attributes.new("ORIGINAL_I3S_POSITION", "FLOAT_VECTOR", "POINT")
        source_attribute.data.foreach_set("vector", source.reshape(-1))
        mesh.update(calc_edges=True)
        obj = bpy.data.objects.new(f"IPR2023_L16_{node['id']}", mesh)
        collection.objects.link(obj)
        origin = node_origin(node, manifest)
        obj.location = origin
        obj["source_id"] = node["id"]
        obj["source_level"] = node["level"]
        obj["source_provider"] = manifest["provider"]
        obj["source_capture"] = manifest["capture"]
        obj["source_license"] = manifest["license"]
        obj["source_attribution"] = manifest["attribution"]
        obj["source_item"] = manifest["sourceItem"]
        obj["source_layer"] = manifest["source"]
        obj["source_geometry"] = node["geometry"]
        obj["source_texture"] = node["texture"]
        obj["source_geometry_sha256"] = node["geometrySha256"]
        obj["source_texture_sha256"] = node["textureSha256"]
        obj["source_center_epsg3857_bpv"] = list(node["center"])
        obj["source_vertex_count"] = count
        obj["source_triangle_count"] = count // 3
        obj["source_feature_ids_decimal"] = json.dumps(feature_ids)
        obj["source_feature_inclusive_face_ranges"] = json.dumps(ranges)
        obj["source_winding_and_triangle_order_preserved"] = True
        mat, dimensions = material(node)
        mesh.materials.append(mat)
        extents_min = np.minimum(extents_min, positions.min(axis=0).astype(np.float64) + origin)
        extents_max = np.maximum(extents_max, positions.max(axis=0).astype(np.float64) + origin)
        report.append({"sourceId": node["id"], "vertices": count,
                       "triangles": count // 3, "geometrySha256": node["geometrySha256"],
                       "textureSha256": node["textureSha256"], "textureDimensions": list(dimensions),
                       "featureCount": len(feature_ids)})
        if (index + 1) % 100 == 0 or index + 1 == len(selected):
            memory = resident_memory_bytes()
            memory_samples.append({"objects": index + 1, "workingSetBytes": memory,
                                   "elapsedSeconds": round(time.perf_counter() - START, 3)})
            log(f"Imported {index + 1}/{len(selected)} tiles; working set {memory}")
    text = bpy.data.texts.new("READ ME · original IPR photogrammetric master")
    text.write("Original IPR Praha CC BY aerial photogrammetry, summer 2023.\n"
               "datový podklad © IPR Praha\n" + manifest["sourceItem"] + "\n\n"
               "This scene preserves every original L16 triangle, original float32 offsets in\n"
               "ORIGINAL_I3S_POSITION, original UVs in ORIGINAL_I3S_UV and unmodified external\n"
               "JPEG atlases. No runtime ground repairs or B6 interior cutouts are applied.\n"
               "Blender axes: X east / Y north / Z up, 1 Blender unit = 1 metre.\n"
               "UVMap V is flipped only to match Blender's image origin. Source UVs remain unchanged.\n"
               "The atlas already contains captured sunlight and shadows. Its emission shader\n"
               "shows original pixels without adding fictitious relighting.\n"
               "Keep public/models/photogrammetry/ipr2023 alongside this repository; texture\n"
               "paths are relative. Never overwrite this master with destructive gameplay edits.\n"
               "See docs/photogrammetry/blender-master.md and its per-tile verification audit.\n")
    camera_data = bpy.data.cameras.new("Central campus aerial QA")
    camera = bpy.data.objects.new("Central campus aerial QA", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (265, -335, 330)
    camera.rotation_euler = (Vector((-15, 15, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 460
    camera_data.clip_end = 3000
    scene.camera = camera
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.clip_end = 5000
                area.spaces.active.region_3d.view_distance = 760
                area.spaces.active.region_3d.view_location = Vector((-30, 0, 0))
                area.spaces.active.shading.type = "SOLID"
                area.spaces.active.shading.color_type = "TEXTURE"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    log("Saving compressed editable full master")
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT), compress=True)
    return {"nodes": report, "blenderExtentsMetres": {"min": extents_min.tolist(), "max": extents_max.tolist()},
            "importMemorySamples": memory_samples, "saveElapsedSeconds": time.perf_counter() - START}


def verify_master(manifest: dict, manifest_sha: str, selected: list[dict]) -> dict:
    log("Reopening saved master for independent source read-back")
    bpy.ops.wm.open_mainfile(filepath=str(OUT))
    scene = bpy.context.scene
    assert scene["source_manifest_sha256"] == manifest_sha
    objects = {obj["source_id"]: obj for obj in scene.objects if obj.type == "MESH" and "source_id" in obj}
    assert len(objects) == len(selected)
    report = []
    max_position_error = 0.0
    max_origin_error = 0.0
    total_vertices = total_triangles = 0
    for index, node in enumerate(selected):
        obj = objects[node["id"]]
        mesh = obj.data
        source, source_uv, feature_ids, ranges = source_geometry(node)
        count = len(source)
        assert len(mesh.vertices) == count and len(mesh.loops) == count and len(mesh.polygons) == count // 3
        assert len(obj.modifiers) == 0
        position = np.empty(count * 3, dtype=np.float32)
        mesh.vertices.foreach_get("co", position)
        position_error = float(np.max(np.abs(position.reshape((-1, 3)) - local_positions(source, manifest))))
        max_position_error = max(max_position_error, position_error)
        assert position_error == 0, f"Position changed: {node['id']}"
        original = np.empty(count * 3, dtype=np.float32)
        mesh.attributes["ORIGINAL_I3S_POSITION"].data.foreach_get("vector", original)
        assert np.array_equal(original.view(np.uint32), source.reshape(-1).view(np.uint32))
        original_uv = np.empty(count * 2, dtype=np.float32)
        mesh.uv_layers["ORIGINAL_I3S_UV"].data.foreach_get("uv", original_uv)
        assert np.array_equal(original_uv.view(np.uint32), source_uv.reshape(-1).view(np.uint32))
        uv = np.empty(count * 2, dtype=np.float32)
        mesh.uv_layers["UVMap"].data.foreach_get("uv", uv)
        expected_uv = source_uv.copy()
        expected_uv[:, 1] = 1 - expected_uv[:, 1]
        assert np.array_equal(uv, expected_uv.reshape(-1))
        loop_indices = np.empty(count, dtype=np.int32)
        mesh.loops.foreach_get("vertex_index", loop_indices)
        assert np.array_equal(loop_indices, np.arange(count, dtype=np.int32))
        loop_starts = np.empty(count // 3, dtype=np.int32)
        mesh.polygons.foreach_get("loop_start", loop_starts)
        assert np.array_equal(loop_starts, np.arange(0, count, 3, dtype=np.int32))
        loop_totals = np.empty(count // 3, dtype=np.int32)
        mesh.polygons.foreach_get("loop_total", loop_totals)
        assert np.all(loop_totals == 3)
        origin_error = float(np.max(np.abs(np.array(obj.location) - node_origin(node, manifest))))
        max_origin_error = max(max_origin_error, origin_error)
        assert origin_error < 0.00005, f"Float32 tile origin exceeds 0.05mm: {node['id']}"
        assert json.loads(obj["source_feature_ids_decimal"]) == feature_ids
        assert json.loads(obj["source_feature_inclusive_face_ranges"]) == ranges
        assert obj["source_geometry_sha256"] == node["geometrySha256"]
        mat = mesh.materials[0]
        image = next(n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE")
        path = Path(bpy.path.abspath(image.filepath)).resolve()
        expected_path = (ROOT / "public" / node["texture"].lstrip("/")).resolve()
        assert path == expected_path and path.is_file()
        texture_bytes = path.read_bytes()
        assert sha(texture_bytes) == node["textureSha256"]
        assert image.colorspace_settings.name == "sRGB" and image.packed_file is None
        assert [image["original_width"], image["original_height"]] == list(jpeg_size(texture_bytes))
        assert any(n.type == "UVMAP" and n.uv_map == "UVMap" for n in mat.node_tree.nodes)
        assert any(n.type == "EMISSION" and n.inputs["Strength"].default_value == 1 for n in mat.node_tree.nodes)
        total_vertices += count
        total_triangles += count // 3
        report.append({"sourceId": node["id"], "status": "PASS", "vertices": count,
                       "triangles": count // 3, "originalPositionFloatBitsPreserved": True,
                       "originalUvFloatBitsPreserved": True, "triangleOrderAndWindingPreserved": True,
                       "unmodifiedExternalTextureShaMatches": True, "tileOriginErrorMetres": origin_error})
        if (index + 1) % 500 == 0 or index + 1 == len(selected):
            log(f"Read-back verified {index + 1}/{len(selected)} tiles")
    assert sha(MANIFEST.read_bytes()) == manifest_sha, "Source manifest changed during import"
    return {"status": "PASS", "reopenedSavedBlend": True, "meshObjects": len(objects),
            "vertices": total_vertices, "triangles": total_triangles,
            "materials": len(bpy.data.materials), "originalExternalAtlasCount": len(bpy.data.images),
            "maximumLocalPositionErrorMetres": max_position_error,
            "maximumTileOriginErrorMetres": max_origin_error,
            "originalFloat32PositionAndUvBitsPreserved": True,
            "sourceManifestUnchanged": True, "nodes": report,
            "workingSetAfterReadBackBytes": resident_memory_bytes()}


def render_preview(manifest: dict, selected: list[dict]) -> dict:
    """Small central-campus source preview, not a runtime/FPS quality claim."""
    scene = bpy.context.scene
    visible = 0
    for obj in scene.objects:
        if obj.type == "MESH":
            obj.hide_render = math.hypot(obj.location.x + 15, obj.location.y - 15) > 255
            if not obj.hide_render:
                visible += 1
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("Neutral original atlas background")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.12, 0.12, 0.12, 1)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(PREVIEW)
    started = time.perf_counter()
    log(f"Rendering CPU source preview of {visible} central tiles, 1024×768, one sample")
    bpy.ops.render.render(write_still=True)
    # This preview mask is temporary; the already saved master includes every tile.
    return {"status": "PASS", "path": PREVIEW.relative_to(ROOT).as_posix(),
            "sha256": sha(PREVIEW.read_bytes()), "resolution": [1024, 768],
            "engine": "Cycles CPU", "threads": 2, "samples": 1,
            "centralTilesVisible": visible, "completeMasterRemainsUnmasked": True,
            "renderSeconds": time.perf_counter() - started,
            "note": "Original unlit JPEG atlas preview; no additional lighting, game FPS or full-scene GPU claim."}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--render-preview", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    raw = MANIFEST.read_bytes()
    manifest = json.loads(raw)
    manifest_sha = sha(raw)
    selected = sorted((n for n in manifest["nodes"] if n["level"] == manifest["highestDetailLevel"]),
                      key=lambda n: n["id"])
    assert len(selected) == manifest["leafCount"]
    audit = {"schemaVersion": 1, "createdAt": datetime.now(timezone.utc).isoformat(),
             "blenderVersion": bpy.app.version_string, "sourceManifestSha256": manifest_sha,
             "sourceItem": manifest["sourceItem"], "attribution": manifest["attribution"],
             "license": manifest["license"], "capture": manifest["capture"],
             "blendPath": OUT.relative_to(ROOT).as_posix(), "highestDetailLevel": manifest["highestDetailLevel"],
             "modifications": {"decimation": False, "welding": False, "sourceTriangleRemoval": False,
                               "textureResize": False, "textureRecompression": False,
                               "runtimeGroundRepairs": False, "runtimeInteriorCutouts": False}}
    if not args.verify_only:
        audit["import"] = import_master(manifest, manifest_sha, selected)
    audit["verification"] = verify_master(manifest, manifest_sha, selected)
    audit["blendBytes"] = OUT.stat().st_size
    audit["blendSha256"] = sha(OUT.read_bytes())
    if args.render_preview:
        audit["preview"] = render_preview(manifest, selected)
    audit["elapsedSeconds"] = time.perf_counter() - START
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"PASS: {audit['verification']['meshObjects']} objects, {audit['verification']['triangles']} original triangles; "
        f"saved {audit['blendBytes']} bytes; audit {AUDIT}")


if __name__ == "__main__":
    main()
