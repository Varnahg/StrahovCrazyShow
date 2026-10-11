"""Build the small, editable Strahov furniture library with Blender 5.2.

Run from the repository root:
  blender --background --python scripts/create-environment.py
No add-ons, downloads, textures, or third-party geometry are required.
Geometry is authored in metres (Blender Z up); glTF export converts to Y up.
"""
from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
BLENDS = ROOT / "assets/blender/environment"
OUTPUT = ROOT / "public/models/environment"
DOCS = ROOT / "docs/models"
for folder in (BLENDS, OUTPUT, DOCS):
    folder.mkdir(parents=True, exist_ok=True)

ROOMS = "https://media.cvut.cz/cs/foto/20161116-pokoje-na-kolejich-strahov"
EXTERIORS = "https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov"
PHOTO_ROOT = "https://media.cvut.cz/sites/media/files/content/photos/"
ROOM_PHOTOS = PHOTO_ROOT + "45cbe750-1f12-495b-98d7-47a7d17c33f2/"
OUTDOOR_PHOTOS = PHOTO_ROOT + "4747a232-056d-41a1-8baa-a2255d7d7efb/"
ROOM_VIEW = ROOM_PHOTOS + "1a0d26c4-1e5a-40f7-86b1-8399f384e3f6.jpg"
WARDROBE_VIEW = ROOM_PHOTOS + "714b5818-d9b5-482e-97d2-1c9a7b30cd52.jpg"
KITCHEN_VIEW = ROOM_PHOTOS + "1bd4563f-0594-4378-a02e-6254dce72499.jpg"
BENCH_VIEW = OUTDOOR_PHOTOS + "11aa8468-49c4-4f9b-972f-4acb047ea157.jpg"


def srgb(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def material(name, color, roughness=0.82, metallic=0.0):
    mat = bpy.data.materials.new(name)
    rgb = tuple(srgb(int(color[i:i + 2], 16) / 255.0) for i in (1, 3, 5))
    mat.diffuse_color = (*rgb, 1.0)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*rgb, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return mat


def box(name, size, center, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Small realistic edge", "BEVEL")
        modifier.width = min(bevel, min(size) * 0.22)
        modifier.segments = 1
        modifier.affect = "EDGES"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        normals = obj.modifiers.new("Weighted broad face normals", "WEIGHTED_NORMAL")
        normals.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=normals.name)
    return obj


def tube(name, start, end, radius, mat, vertices=8):
    delta = Vector(end) - Vector(start)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius,
                                       depth=delta.length,
                                       location=(Vector(start) + Vector(end)) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return obj


def frame_handle(name, center, height, mat):
    x, y, z = center
    tube(name + " lower mount", (x, y, z - height / 2),
         (x, y - 0.025, z - height / 2), 0.008, mat)
    tube(name + " grip", (x, y - 0.025, z - height / 2),
         (x, y - 0.025, z + height / 2), 0.008, mat)
    tube(name + " upper mount", (x, y - 0.025, z + height / 2),
         (x, y, z + height / 2), 0.008, mat)


def bed(m):
    wood, fabric, linen = m
    box("Recessed plinth", (1.87, 0.78, 0.20), (0, 0, 0.10), wood, 0.008)
    box("Timber base", (2.04, 0.92, 0.16), (0, 0, 0.28), wood, 0.012)
    box("Long wall sideboard", (2.04, 0.035, 0.53), (0, 0.4625, 0.555), wood, 0.007)
    box("Mattress", (2.00, 0.88, 0.16), (0, -0.01, 0.44), linen, 0.035)
    box("Duvet", (1.48, 0.86, 0.075), (0.24, -0.012, 0.552), fabric, 0.016)
    box("Folded duvet hem", (0.18, 0.86, 0.028), (-0.42, -0.012, 0.598), fabric, 0.006)
    pillow = box("Pillow", (0.48, 0.66, 0.10), (-0.72, -0.005, 0.57), linen, 0.022)
    pillow.rotation_euler.z = math.radians(-4)
    return [collision("bed footprint", (0, 0, 0.41), (2.04, 0.96, 0.82))]


def desk(m):
    wood, dark = m
    box("Continuous desk top", (1.20, 0.62, 0.035), (0, 0, 0.7525), wood, 0.006)
    for x, suffix in ((-0.575, "left"), (0.575, "right")):
        box(suffix + " supporting side panel", (0.025, 0.58, 0.72), (x, 0, 0.375), wood, 0.004)
        box(suffix + " rear foot", (0.028, 0.09, 0.015), (x, 0.22, 0.0075), dark, 0.002)
        box(suffix + " front foot", (0.028, 0.09, 0.015), (x, -0.22, 0.0075), dark, 0.002)
    box("Rear modesty and support panel", (1.13, 0.018, 0.22), (0, 0.22, 0.60), wood, 0.003)
    return [collision("left side", (-0.575, 0, 0.375), (0.04, 0.58, 0.75)),
            collision("right side", (0.575, 0, 0.375), (0.04, 0.58, 0.75)),
            collision("table top", (0, 0, 0.7525), (1.20, 0.62, 0.035))]


def chair(m):
    metal, upholstery = m
    for x in (-0.21, 0.21):
        for y in (-0.215, 0.215):
            box("Rubber foot cap", (0.035, 0.035, 0.03),
                (x * 1.14, y * 1.10, 0.015), metal, 0.004)
            tube("Splayed steel leg", (x * 1.14, y * 1.10, 0.015),
                 (x, y, 0.43), 0.015, metal)
    for x in (-0.21, 0.21):
        tube("Back upright", (x, 0.19, 0.40), (x, 0.255, 0.82), 0.015, metal)
        tube("Seat supporting rail", (x, -0.22, 0.405), (x, 0.22, 0.405), 0.012, metal)
    box("Rounded upholstered seat", (0.46, 0.455, 0.07), (0, -0.005, 0.455), upholstery, 0.015)
    shell = box("Back shell", (0.445, 0.03, 0.28), (0, 0.25, 0.72), metal, 0.006)
    shell.rotation_euler.x = math.radians(-8)
    cushion = box("Upholstered back", (0.42, 0.035, 0.245), (0, 0.225, 0.72), upholstery, 0.007)
    cushion.rotation_euler.x = math.radians(-8)
    return [collision("chair footprint", (0, 0.018, 0.43), (0.51, 0.54, 0.86))]


def wardrobe(m):
    wood, dark = m
    box("Recessed toe kick", (0.91, 0.50, 0.08), (0, 0.015, 0.04), dark, 0.004)
    box("Cabinet carcass", (0.98, 0.57, 2.22), (0, 0.015, 1.19), wood, 0.006)
    for x in (-0.244, 0.244):
        box("Tall wardrobe door", (0.48, 0.025, 1.72), (x, -0.285, 0.96), wood, 0.004)
        box("Top cupboard door", (0.48, 0.025, 0.48), (x, -0.285, 2.07), wood, 0.004)
    for x in (-0.055, 0.055):
        frame_handle("Long door handle", (x, -0.30, 1.03), 0.15, dark)
        frame_handle("Top door handle", (x, -0.30, 2.02), 0.115, dark)
    return [collision("wardrobe", (0, -0.01, 1.15), (0.98, 0.62, 2.30))]


def nightstand(m):
    wood, dark = m
    box("Cabinet plinth", (0.34, 0.32, 0.04), (0, 0.015, 0.02), dark, 0.003)
    for x in (-0.19, 0.19):
        box("Cabinet side", (0.02, 0.40, 0.52), (x, 0, 0.29), wood, 0.004)
    box("Top", (0.40, 0.42, 0.025), (0, 0, 0.5625), wood, 0.005)
    box("Shelf separating open cubby", (0.36, 0.39, 0.02), (0, 0, 0.412), wood, 0.003)
    box("Back panel", (0.36, 0.018, 0.52), (0, 0.19, 0.29), wood, 0.003)
    box("Door below cubby", (0.36, 0.02, 0.36), (0, -0.201, 0.222), wood, 0.003)
    frame_handle("Cabinet handle", (-0.12, -0.216, 0.25), 0.10, dark)
    return [collision("nightstand", (0, 0, 0.2875), (0.4, 0.44, 0.575))]


def wall_shelf(m):
    wood, = m
    for z in (0.015, 0.315):
        box("Overhanging horizontal shelf", (1.15, 0.25, 0.03), (0, 0, z), wood, 0.005)
    box("Rear panel", (0.76, 0.018, 0.27), (0, 0.115, 0.165), wood, 0.003)
    for x in (-0.395, 0.395):
        box("Vertical shelf divider", (0.025, 0.23, 0.27), (x, 0, 0.165), wood, 0.004)
    return [collision("wall shelf", (0, 0, 0.165), (1.15, 0.25, 0.33))]


def sink_bowl(metal):
    # A genuine open bowl, not a grey plane hidden underneath the countertop.
    outer = [(-0.21, -0.16, 0.895), (0.21, -0.16, 0.895),
             (0.21, 0.16, 0.895), (-0.21, 0.16, 0.895)]
    inner = [(-0.16, -0.11, 0.755), (0.16, -0.11, 0.755),
             (0.16, 0.11, 0.755), (-0.16, 0.11, 0.755)]
    vertices = [(x + 0.42, y - 0.015, z) for x, y, z in outer + inner]
    faces = [(i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4) for i in range(4)]
    faces.append((4, 5, 6, 7))
    mesh = bpy.data.meshes.new("Open stainless sink mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(metal)
    obj = bpy.data.objects.new("Open stainless sink bowl", mesh)
    bpy.context.collection.objects.link(obj)


def kitchenette(m):
    wood, neutral, metal = m
    # Historical reference: lower fridge at the left, open sink support at right,
    # two cooking rings and upper oak cupboards around an open central shelf.
    box("Mini fridge", (0.50, 0.51, 0.79), (-0.54, 0.01, 0.415), neutral, 0.009)
    box("Fridge door", (0.48, 0.025, 0.74), (-0.54, -0.2575, 0.415), neutral, 0.005)
    tube("Fridge pull", (-0.72, -0.278, 0.60), (-0.72, -0.278, 0.72), 0.009, metal)
    for x in (-0.77, 0.77):
        box("Counter supporting end", (0.025, 0.57, 0.88), (x, 0.005, 0.44), neutral, 0.004)
    box("Rear support", (1.5, 0.025, 0.15), (0, 0.2675, 0.76), neutral, 0.003)
    # Countertop split around the sink aperture, avoiding coplanar faces.
    box("Countertop left", (0.99, 0.62, 0.035), (-0.305, 0, 0.8775), neutral, 0.003)
    box("Countertop right", (0.17, 0.62, 0.035), (0.715, 0, 0.8775), neutral, 0.003)
    for y in (-0.2375, 0.2375):
        box("Countertop sink surround", (0.44, 0.145, 0.035), (0.41, y, 0.8775), neutral, 0.003)
    sink_bowl(metal)
    for x in (0.20, 0.64):
        box("Stainless sink side rim", (0.02, 0.36, 0.008), (x, -0.015, 0.899), metal)
    for y in (-0.185, 0.155):
        box("Stainless sink end rim", (0.44, 0.02, 0.008), (0.42, y, 0.899), metal)
    tube("Tap stem", (0.42, 0.20, 0.90), (0.42, 0.20, 1.10), 0.018, metal)
    tube("Tap spout", (0.42, 0.20, 1.10), (0.42, 0.07, 1.10), 0.016, metal)
    box("Two ring hob", (0.49, 0.43, 0.015), (-0.35, -0.015, 0.905), metal, 0.003)
    for x in (-0.48, -0.22):
        tube("Cooking ring", (x, 0.02, 0.914), (x, 0.02, 0.925), 0.087, metal, 16)
        tube("Hob control", (x, -0.16, 0.915), (x, -0.16, 0.935), 0.017, metal, 8)
    for x in (-0.55, 0.55):
        box("Upper cupboard carcass", (0.49, 0.31, 0.65), (x, 0.155, 1.675), wood, 0.005)
        box("Upper cupboard door", (0.475, 0.025, 0.63), (x, -0.0125, 1.675), wood, 0.004)
        frame_handle("Upper cupboard handle", (x, -0.028, 1.43), 0.11, metal)
    box("Open shelf rear", (0.59, 0.018, 0.65), (0, 0.29, 1.675), neutral, 0.002)
    for z in (1.35, 1.565, 1.78, 1.99):
        box("Open centre shelf", (0.60, 0.30, 0.018), (0, 0.15, z), neutral, 0.003)
    return [collision("lower counter", (0, 0, 0.45), (1.60, 0.62, 0.90)),
            collision("upper cupboards", (0, 0.15, 1.675), (1.60, 0.34, 0.65))]


def bench(m):
    wood, metal = m
    for y in (-0.175, -0.055, 0.065, 0.185):
        box("Seat timber slat", (1.80, 0.105, 0.04), (0, y, 0.45), wood, 0.007)
    for z in (0.64, 0.78):
        slat = box("Back timber slat", (1.80, 0.04, 0.12), (0, 0.235, z), wood, 0.007)
        slat.rotation_euler.x = math.radians(-8)
    for x in (-0.65, 0.65):
        for y in (-0.16, 0.18):
            box("Bench foot plate", (0.06, 0.06, 0.03), (x, y, 0.015), metal, 0.004)
            tube("Bench steel leg", (x, y, 0.015), (x, y, 0.43), 0.026, metal)
        tube("Seat frame", (x, -0.22, 0.41), (x, 0.23, 0.41), 0.025, metal)
        tube("Back supporting upright", (x, 0.185, 0.40), (x, 0.27, 0.86), 0.021, metal)
    tube("Bench lower cross brace", (-0.65, 0.16, 0.19), (0.65, 0.16, 0.19), 0.02, metal)
    return [collision("seat", (0, 0.005, 0.235), (1.80, 0.47, 0.47)),
            collision("back", (0, 0.25, 0.66), (1.80, 0.10, 0.41))]


def collision(name, center, dimensions):
    # Blender x/y/z to glTF x/y/z = x/z/-y. These are box dimensions, NOT half extents.
    return {"name": name,
            "center": [round(center[0], 5), round(center[2], 5), round(-center[1], 5)],
            "dimensions": [round(dimensions[0], 5), round(dimensions[2], 5), round(dimensions[1], 5)],
            "rotation": [0, 0, 0]}


def bounds(objects):
    # Rotated local bounding boxes overestimate chamfered pieces and cylinders.
    # Use actual post-modifier vertices, matching the exported binary geometry.
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    minimum = [min(p[i] for p in points) for i in range(3)]
    maximum = [max(p[i] for p in points) for i in range(3)]
    return minimum, maximum


def glb_stats(path):
    with path.open("rb") as handle:
        header = handle.read(12)
        magic, version, size = struct.unpack("<III", header)
        assert magic == 0x46546C67 and version == 2 and size == path.stat().st_size
        length, kind = struct.unpack("<II", handle.read(8))
        assert kind == 0x4E4F534A
        gltf = json.loads(handle.read(length).decode("utf-8"))
    primitives = [p for mesh in gltf.get("meshes", []) for p in mesh["primitives"]]
    triangles = sum(gltf["accessors"][p["indices"]]["count"] // 3 for p in primitives)
    return triangles, len(primitives), len(gltf.get("materials", []))


LIBRARY = [
    ("dorm-bed", "Kolejní postel s bočnicí", bed, ["wood", "fabric", "linen"],
     [ROOMS, ROOM_VIEW], "medium-historical-typology",
     "Nízká postel s dlouhou dřevěnou bočnicí podle záběru2016. Povlečení zjednodušené. Nepotvrzený blok a současný stav B6."),
    ("dorm-desk", "Kolejní pracovní stůl", desk, ["wood", "metal"],
     [ROOMS, ROOM_VIEW], "medium-historical-typology",
     "Jednomístná modulární varianta dlouhého panelového stolu pod oknem. Rozměry odhadnuté, není přesné zaměření."),
    ("dorm-chair", "Čalouněná kolejní židle", chair, ["metal", "upholstery"],
     [ROOMS, ROOM_VIEW], "medium-historical-typology",
     "Ocelové splay nohy a čalouněný sedák/opěradlo dle fotografie2016. Modré čalounění převedené do tlumené zelené herní palety."),
    ("dorm-wardrobe", "Skříň s horními dvířky", wardrobe, ["wood", "metal"],
     [ROOMS, WARDROBE_VIEW], "medium-historical-typology",
     "Dvoudveřová skříň s oddělenými horními dvířky podle fotografie2016. Výška a vnitřní rozměry jsou odhad."),
    ("dorm-nightstand", "Noční stolek s otevřenou policí", nightstand, ["wood", "metal"],
     [ROOMS, ROOM_VIEW], "medium-historical-typology",
     "Dolní dvířka a otevřená horní přihrádka jsou viditelné na fotografii2016; rozměry odhadnuté."),
    ("dorm-wall-shelf", "Nástěnná police", wall_shelf, ["wood"],
     [ROOMS, ROOM_VIEW], "medium-historical-typology",
     "Dvě přečnívající desky a dvě vnitřní svislé příčky podle fotografie2016. Pivot je spodní hrana police; při umístění zvednout cca1.45m."),
    ("dorm-kitchenette", "Kuchyňská linka s dřezem a dvouvařičem", kitchenette, ["wood", "neutral", "stainless"],
     [ROOMS, KITCHEN_VIEW], "medium-historical-typology",
     "Linka, lednice, dvouvařič, otevřený prostor pod dřezem a horní skříňky dle fotografie2016. Není potvrzený společný prostor B6 ani nové vybavení B4."),
    ("campus-bench", "Venkovní lamelová lavička", bench, ["wood", "metal"],
     [EXTERIORS, BENCH_VIEW], "low-distant-typology",
     "Tmavé lamelové lavičky jsou viditelné u oplocení sportoviště vpravo na snímku2024. Drobné spoje ani konkrétní rozměry nejsou rozlišitelné; herní konstrukce je odhad."),
]

manifest = {"schemaVersion": 1, "authoredAt": "2026-10-10", "units": "metres",
            "coordinateSystem": "glTF Y-up; front +Z; asset root pivot on supporting surface",
            "dimensionOrder": ["widthX", "heightY", "depthZ"],
            "collisionFormat": "local Y-up centres; full dimensions, not half extents; radians",
            "referenceUsage": "Visual references only; no source photos, pixels, textures or third-party geometry embedded.",
            "assets": []}
preview_objects = []

for index, (asset_id, title, builder, mat_names, references, confidence, note) in enumerate(LIBRARY):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    mats = {
        "wood": material("Strahov | warm wood", "#8F7560", 0.82),
        "metal": material("Strahov | painted steel", "#555F5F", 0.72),
        "fabric": material("Strahov | duvet", "#B8B5A9", 0.95),
        "linen": material("Strahov | linen", "#E2DFD1", 0.95),
        "upholstery": material("Strahov | upholstery", "#657B70", 0.94),
        "neutral": material("Strahov | warm cabinet and worktop", "#D3D1C7", 0.75),
        "stainless": material("Strahov | matte stainless", "#929893", 0.45, 0.65),
    }
    collision_boxes = builder([mats[name] for name in mat_names])
    objects = [obj for obj in scene.objects if obj.type == "MESH"]
    bpy.context.view_layer.update()
    minimum, maximum = bounds(objects)
    assert abs(minimum[2]) < 0.0001, (asset_id, minimum)
    for obj in objects:
        obj["asset_id"] = asset_id
        obj["references"] = json.dumps(references)
    scene["asset_id"] = asset_id
    scene["units_note"] = "Metres. Editable individual parts. Front Blender -Y / glTF +Z."
    scene["reference_note"] = note
    scene["dimension_confidence"] = "Unmeasured estimate. Not a surveyed B6 model."
    # Source retains individual named mesh parts and material slots for editing.
    bpy.ops.wm.save_as_mainfile(filepath=str(BLENDS / (asset_id + ".blend")))

    # Join for export only: 1 mesh, 1 primitive per material; source stays editable.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = asset_id
    scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    out_file = OUTPUT / (asset_id + ".glb")
    bpy.ops.export_scene.gltf(filepath=str(out_file), export_format="GLB", use_selection=True,
                              export_yup=True, export_apply=True,
                              export_materials="EXPORT", export_extras=False)
    triangle_count, primitive_count, material_count = glb_stats(out_file)
    assert triangle_count <= 1500, (asset_id, triangle_count)
    assert primitive_count <= 3 and material_count <= 3, (asset_id, primitive_count, material_count)
    size = [maximum[i] - minimum[i] for i in range(3)]
    asset = {"id": asset_id, "label": title, "url": "/models/environment/" + out_file.name,
             "sourceBlend": "assets/blender/environment/" + asset_id + ".blend",
             "dimensions": [round(size[0], 5), round(size[2], 5), round(size[1], 5)],
             "bounds": {"min": [round(minimum[0], 5), round(minimum[2], 5), round(-maximum[1], 5)],
                        "max": [round(maximum[0], 5), round(maximum[2], 5), round(-minimum[1], 5)]},
             "triangleCount": triangle_count, "primitiveCount": primitive_count,
             "materialCount": material_count, "textureCount": 0, "byteLength": out_file.stat().st_size,
             "referenceUrls": references, "referenceDate": "2024-06-20" if asset_id == "campus-bench" else "2016-11-16",
             "confidence": confidence, "dimensionsMeasured": False,
             "currentB6Confirmed": False, "collisionBoxes": collision_boxes,
             "defaultRotation": [0, 0, 0], "note": note}
    manifest["assets"].append(asset)
    print("ASSET_AUDIT", json.dumps(asset, ensure_ascii=False))

(OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
# Vite imports source metadata; public contains the unchanged downloadable copy.
source_manifest = ROOT / "shared/data/assets/environment-manifest.json"
source_manifest.parent.mkdir(parents=True, exist_ok=True)
source_manifest.write_bytes((OUTPUT / "manifest.json").read_bytes())

# A single Blender-authored contact sheet; floor and labels are preview only.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 1600
scene.render.resolution_y = 1040
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("Preview only studio world")
scene.world.color = (0.22, 0.22, 0.22)
scene.view_settings.view_transform = "AgX"
floor = material("Preview only | floor", "#DEDCD3", 0.95)
box("Preview only floor", (14, 12, 0.04), (0, 0, -0.025), floor)
for index, asset in enumerate(manifest["assets"]):
    x = (index % 4 - 1.5) * 3.0
    y = (index // 4 - 0.5) * 3.4
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "public" / asset["url"].lstrip("/")))
    imported = list(bpy.context.selected_objects)
    for obj in imported:
        if obj.parent is None:
            obj.location += Vector((x, y, 0))
    bpy.ops.object.text_add(location=(x - 0.92, y - 1.0, 0.005))
    label = bpy.context.object
    label.name = "Preview only label " + asset["id"]
    label.data.body = asset["id"] + "\n" + str(asset["triangleCount"]) + " tris / " + str(asset["materialCount"]) + " mats"
    label.data.size = 0.16
    label.data.extrude = 0
    label.data.materials.append(material("Preview only | label " + str(index), "#354B46", 1))

for location, energy, size in (((-4, -6, 10), 1800, 7), ((5, 3, 7), 1300, 6)):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (Vector((0, 0, 0.6)) - light.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.camera_add(location=(9, -15, 15))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 0.7)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 14.3
scene.camera = camera
scene.render.filepath = str(DOCS / "environment-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(BLENDS / "environment-preview.blend"))
bpy.ops.render.render(write_still=True)
print("ENVIRONMENT_COMPLETE", len(manifest["assets"]), "assets")
