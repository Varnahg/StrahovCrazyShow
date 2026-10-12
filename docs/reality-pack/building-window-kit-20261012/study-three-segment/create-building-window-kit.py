"""Author editable building window profiles and export evaluated Blender geometry.

blender --background --threads 2 --python scripts/create-building-window-kit.py
No photographs are embedded; dimensions are explicitly architectural game estimates.
"""
import bpy
import bmesh
import hashlib
import json
import math
import pathlib
import sys
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[1]
MASTER = ROOT / "assets/blender/building-window-kit"
PUBLIC = ROOT / "public/models/building-window-kit"
DOC = ROOT / "docs/reality-pack/building-window-kit-20261012"
RUNTIME = ROOT / "shared/data/building-window-kit.json"
for directory in (MASTER, PUBLIC, DOC):
    directory.mkdir(parents=True, exist_ok=True)

NOMINAL = {"width": 2.18, "height": 1.5, "depth": 0.18, "glassZ": -0.182}
SOURCES = [
    {"id": "ctu-exteriors-2024-3", "url": "https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov#lg=1&slide=2",
     "imageUrl": "https://media.cvut.cz/sites/media/files/content/photos/4747a232-056d-41a1-8baa-a2255d7d7efb/fe9b7d5b-facc-479d-9e50-1c07806041ce.jpg",
     "author": "Jiří Ryszawy", "captureDate": "2024-06-20", "reviewDate": "2026-10-12",
     "evidence": "Four vertical panes, nested dark brown frame, pale sloping sheet-metal sill with front return; block number not identified.",
     "usage": "Reference only. No photo pixels embedded or redistributed."},
    {"id": "ctu-exteriors-2024-2", "url": "https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov#lg=1&slide=1",
     "author": "Jiří Ryszawy", "captureDate": "2024-06-20", "reviewDate": "2026-10-12",
     "evidence": "Identified B4 entrance wing: individual small square openings with recessed dark frames and narrow pale sills.",
     "usage": "Reference only. No photo pixels embedded or redistributed."},
    {"id": "b12-2009", "url": "https://commons.wikimedia.org/wiki/File:Strahov,_studentsk%C3%A1_kolej_%C4%8D.12.JPG",
     "path": "docs/world-architecture/media/b12-detail-2009.jpg", "author": "Ondrej.konicek",
     "captureDate": "2009-10-06", "reviewDate": "2026-10-12", "license": "CC BY-SA 3.0",
     "evidence": "Historical B12 deep reveal, nested frame and horizontal transom. Damage and historical colour ageing not transferred to current blocks."},
]
for source in SOURCES:
    if source.get("path"):
        source["sha256"] = hashlib.sha256((ROOT / source["path"]).read_bytes()).hexdigest()


def native(p):
    """Canonical X/right Y/up Z/out -> Blender X/right Y/in Z/up (det +1)."""
    return (p[0], -p[2], p[1])


def canonical(p):
    return (p[0], p[2], -p[1])


def number(v):
    value = round(float(v), 8)
    return 0 if value == 0 else value


def material(role, color, roughness, metallic=0):
    mat = bpy.data.materials.new("window-profile:" + role)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    pbr = mat.node_tree.nodes.get("Principled BSDF")
    pbr.inputs["Base Color"].default_value = (*color, 1)
    pbr.inputs["Roughness"].default_value = roughness
    pbr.inputs["Metallic"].default_value = metallic
    mat["role"] = role
    mat["sourceInterpretation"] = "Photo-informed type, not measured albedo"
    return mat


def setup_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    scene["assetPurpose"] = "Editable highest window profile construction, plus evaluated near export"
    scene["coordinateContract"] = "Export metres: X along opening, Y up, Z outward. Opening bottom-left is origin."
    scene["sourceScope"] = "CTU2024 current typology; B12 2009 historical transom only. No current damage inferred."
    return scene


def ring(width, height, profile, closed=True):
    vertices = []
    for inset, depth in profile:
        vertices.extend([(inset, inset, depth), (width-inset, inset, depth),
                         (width-inset, height-inset, depth), (inset, height-inset, depth)])
    faces = []
    sections = len(profile) if closed else len(profile)-1
    for section in range(sections):
        next_section = (section+1) % len(profile)
        for corner in range(4):
            nxt = (corner+1) % 4
            faces.append((section*4+corner, section*4+nxt,
                          next_section*4+nxt, next_section*4+corner))
    return vertices, faces


def extrusion(width, polygon_yz, x0=0):
    vertices = [(x, y, z) for x in (x0, width+x0) for y, z in polygon_yz]
    n = len(polygon_yz)
    faces = [tuple(reversed(range(n))), tuple(range(n, n*2))]
    faces += [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
    return vertices, faces


def vertical_bar(width, height, polygon_xz):
    vertices = [(x, y, z) for y in (0, height) for x, z in polygon_xz]
    n = len(polygon_xz)
    faces = [tuple(range(n)), tuple(reversed(range(n, n*2)))]
    faces += [(i, i+n, (i+1) % n+n, (i+1) % n) for i in range(n)]
    return vertices, faces


def create_part(identifier, role, width, height, geometry, bevel, normal_mode="preserve", open_surface=False):
    vertices, faces = geometry
    mesh = bpy.data.meshes.new(identifier + ":editable-cross-section")
    mesh.from_pydata([native(p) for p in vertices], [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # The reveal is an intentionally open sheet, facing INTO the opening.
    if open_surface:
        for face in bm.faces:
            centre = canonical(face.calc_center_median())
            n = canonical(face.normal)
            to_aperture = Vector((width/2-centre[0], height/2-centre[1], 0))
            if Vector(n).dot(to_aperture) < 0:
                face.normal_flip()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    uv = mesh.uv_layers.new(name="metres")
    # Planar per-face metric projection. Physical dimensions retained, not 0..1 stretches.
    for polygon in mesh.polygons:
        normal = canonical(polygon.normal)
        drop = max(range(3), key=lambda i: abs(normal[i]))
        axes = [axis for axis in range(3) if axis != drop]
        for loop_index in polygon.loop_indices:
            p = canonical(mesh.vertices[mesh.loops[loop_index].vertex_index].co)
            uv.data[loop_index].uv = (p[axes[0]], p[axes[1]])
        polygon.use_smooth = True
    # Preserve actual construction joins; only small bevel faces may interpolate.
    adjacent = {}
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            adjacent.setdefault(tuple(sorted(edge_key)), []).append(polygon)
    for edge in mesh.edges:
        faces_on_edge = adjacent.get(tuple(sorted(edge.vertices)), [])
        edge.use_edge_sharp = len(faces_on_edge) != 2 or faces_on_edge[0].normal.dot(faces_on_edge[1].normal) < math.cos(math.radians(28))
    obj = bpy.data.objects.new(identifier, mesh)
    profiles.objects.link(obj)
    obj.data.materials.append(materials[role])
    obj["role"] = role
    obj["nominalWidth"] = width
    obj["nominalHeight"] = height
    obj["normalMode"] = normal_mode
    obj["openSurface"] = open_surface
    obj["dimensionsStatus"] = "architectural-game-estimate-not-survey"
    if bevel:
        modifier = obj.modifiers.new("Small manufactured edge roll — highest 3 segments", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = math.radians(25)
        modifier.affect = "EDGES"
        modifier.use_clamp_overlap = True
        modifier.harden_normals = True
    weighted = obj.modifiers.new("Weighted broad faces; bevel highlights remain soft", "WEIGHTED_NORMAL")
    weighted.keep_sharp = True
    weighted.weight = 50
    return obj


def weights(identifier, p, width, height):
    wx = 1 if p[0] > width / 2 else 0
    wy = 1 if p[1] > height / 2 else 0
    if identifier == "mullion":
        wx = 0
    if identifier in ("sill", "transom"):
        wy = 0
    if identifier == "reveal":
        wz = 1 if p[2] < -0.09 else 0
    elif identifier == "sill":
        wz = 1 if p[2] < -0.09 else 0
    else:
        wz = 1
    return (wx, wy, wz)


def evaluated_part(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
    mesh.calc_loop_triangles()
    positions, normals, uvs, indices, resize_weights = [], [], [], [], []
    dedup = {}
    width, height = obj["nominalWidth"], obj["nominalHeight"]
    for triangle in mesh.loop_triangles:
        for loop_index in triangle.loops:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            p = tuple(number(v) for v in canonical(vertex.co))
            n = tuple(number(v) for v in canonical(mesh.corner_normals[loop_index].vector))
            uv = tuple(number(v) for v in mesh.uv_layers.active.data[loop_index].uv)
            resize = weights(obj.name, p, width, height)
            key = p+n+uv+resize
            index = dedup.get(key)
            if index is None:
                index = len(positions)//3
                dedup[key] = index
                positions.extend(p)
                normals.extend(n)
                uvs.extend(uv)
                resize_weights.extend(resize)
            indices.append(index)
    bounds = {key: [number(fn(positions[axis::3])) for axis in range(3)]
              for key, fn in (("min", min), ("max", max))}
    result = {"role": obj["role"], "nominalWidth": width, "nominalHeight": height,
              "normalMode": obj["normalMode"], "normalsSource": "Blender evaluated split-loop WeightedNormal",
              "openSurface": obj["openSurface"], "positions": positions, "normals": normals,
              "uvs": uvs, "indices": indices, "resizeWeights": resize_weights, "bounds": bounds,
              "triangles": len(indices)//3}
    evaluated.to_mesh_clear()
    return result


def payload(level):
    for obj in parts:
        for modifier in obj.modifiers:
            if modifier.type == "BEVEL":
                modifier.segments = 3
                # Main shaped profile edges remain in base geometry. The near
                # asset omits only sub-millimetre secondary manufacturing rolls.
                modifier.show_viewport = level == "highest"
                modifier.show_render = level == "highest"
    bpy.context.view_layer.update()
    data = {"schemaVersion": 1, "level": level, "nominal": NOMINAL,
            "coordinateSystem": {"units": "metres", "x": "along opening", "y": "up", "z": "out of facade", "origin": "opening bottom-left"},
            "resizeFormula": "p + [wx*(width-nominalWidth), wy*(height-nominalHeight), wz*(nominal.depth-depth)] + [0,0,frontDepth]",
            "placement": {"outerFrame": "opening", "reveal": "opening", "sill": "opening",
                          "sash": "each clear pane cell between outer frame and dividers",
                          "gasket": "same clear pane cell as sash; separate adjacent profile",
                          "mullion": "vertical divider; nominalWidth fixed, height resized",
                          "transom": "optional horizontal divider only for existing source-backed transom"},
            "construction": {"outerFrameWidth": 0.045, "sashWidth": 0.016, "gasketWidth": 0.006,
                             "mullionWidth": 0.036, "transomHeight": 0.045,
                             "dimensionsStatus": "architectural-game-estimate-not-survey",
                             "glass": "Existing runtime glass plane/UVs/blinds/night masks retained; no duplicate kit glass."},
            "sources": SOURCES, "primitives": {obj.name: evaluated_part(obj) for obj in parts}}
    data["totalPrimitiveTriangles"] = sum(p["triangles"] for p in data["primitives"].values())
    return data


def clone_evaluated(obj, collection, name, offset=(0, 0, 0), width=None, height=None):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True,
                                         depsgraph=bpy.context.evaluated_depsgraph_get())
    clone = bpy.data.objects.new(name, mesh)
    collection.objects.link(clone)
    w, h = obj["nominalWidth"], obj["nominalHeight"]
    for vertex in mesh.vertices:
        p = canonical(vertex.co)
        resize = weights(obj.name, p, w, h)
        vertex.co = native((p[0]+resize[0]*((width if width is not None else w)-w),
                            p[1]+resize[1]*((height if height is not None else h)-h), p[2]))
    clone.location = native(offset)
    clone["sourcePrimitive"] = obj.name
    clone["role"] = obj["role"]
    return clone


def export_glb(level):
    # Local primitive vertices are unchanged; gallery placement is only glTF node translation.
    collection = bpy.data.collections.new("temporary evaluated GLB profiles")
    bpy.context.scene.collection.children.link(collection)
    clones = []
    for index, obj in enumerate(parts):
        clones.append(clone_evaluated(obj, collection, obj.name, (index*2.7, 0, 0)))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in clones:
        obj.select_set(True)
    path = PUBLIC / ("window-kit-profiles-"+level+".glb")
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_yup=True, export_apply=False, export_extras=True,
                              export_texcoords=True, export_normals=True, export_materials="EXPORT")
    for obj in clones:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    bpy.data.collections.remove(collection)
    return path


def assembly():
    collection = bpy.data.collections.new("02 — Four-pane example; no inferred transom")
    bpy.context.scene.collection.children.link(collection)
    source = {obj.name: obj for obj in parts}
    for identifier in ("outerFrame", "reveal", "sill"):
        clone_evaluated(source[identifier], collection, "assembled:"+identifier)
    cell = (2.18-0.045*2-0.036*3)/4
    for i in range(4):
        x = 0.045+i*(cell+0.036)
        for identifier in ("sash", "gasket"):
            clone_evaluated(source[identifier], collection, "assembled:"+identifier+":"+str(i),
                            (x, 0.045, 0), cell, 1.41)
        if i < 3:
            clone_evaluated(source["mullion"], collection, "assembled:mullion:"+str(i),
                            (x+cell, 0.045, 0), height=1.41)
    # An explicitly separate preview-only glass plane shows aperture layout in Blender.
    vertices = [(0.045,0.045,-0.182),(2.135,0.045,-0.182),(2.135,1.455,-0.182),(0.045,1.455,-0.182)]
    mesh = bpy.data.meshes.new("preview-only glass; not exported to runtime")
    mesh.from_pydata([native(p) for p in vertices], [], [(0,1,2,3)])
    mesh.materials.append(material("previewGlass", (0.075,0.13,0.17), .23))
    obj = bpy.data.objects.new("Preview glass only — runtime retains existing glass", mesh)
    collection.objects.link(obj)
    obj["runtimeExport"] = False
    return collection


def audit_geometry(data):
    report = {}
    for identifier, part in data["primitives"].items():
        p, n, idx = part["positions"], part["normals"], part["indices"]
        degenerate, opposed = 0, 0
        min_dot = 1
        for offset in range(0, len(idx), 3):
            ids = idx[offset:offset+3]
            a,b,c = [Vector(p[i*3:i*3+3]) for i in ids]
            face = (b-a).cross(c-a)
            if face.length < 1e-12:
                degenerate += 1
                continue
            face.normalize()
            for i in ids:
                dot = face.dot(Vector(n[i*3:i*3+3]))
                min_dot = min(min_dot, dot)
                opposed += dot < -1e-5
        assert degenerate == 0, (identifier, "degenerate", degenerate)
        assert opposed == 0, (identifier, "opposed", opposed, min_dot)
        assert all(abs(Vector(n[i:i+3]).length-1) < 2e-6 for i in range(0,len(n),3))
        report[identifier] = {"triangles":part["triangles"], "vertices":len(p)//3,
                              "degenerate":degenerate, "opposedCornerNormals":opposed,
                              "minimumFaceNormalDot":number(min_dot), "bounds":part["bounds"]}
    return report


scene = setup_scene()
profiles = bpy.data.collections.new("01 — Editable canonical profiles; highest modifiers retained")
scene.collection.children.link(profiles)
materials = {"frame":material("frame",(.11,.065,.035),.48),
             "gasket":material("gasket",(.018,.021,.018),.78),
             "sill":material("sill",(.48,.51,.49),.42,.42),
             "reveal":material("reveal",(.62,.63,.58),.88)}
parts = [
    create_part("outerFrame", "frame", 2.18,1.5,
                ring(2.18,1.5,[(0,-.183),(0,-.163),(.003,-.159),(.017,-.159),
                                (.021,-.164),(.043,-.164),(.045,-.167),(.045,-.183)]),.0007),
    create_part("reveal", "reveal",2.18,1.5,
                ring(2.18,1.5,[(0,0),(.012,-.012),(.012,-.18)],False),0,
                "recompute-on-depth-resize",True),
    create_part("sill","sill",2.18,1.5,
                extrusion(2.27,[(.012,-.18),(-.025,.08),(-.068,.08),(-.072,.075),
                                (-.066,.070),(-.034,.070),(.003,-.18)],-.045),.0006,
                "recompute-on-depth-resize"),
    create_part("sash","frame",.488,1.41,
                ring(.488,1.41,[(0,-.182),(0,-.168),(.003,-.164),(.013,-.164),
                                (.016,-.169),(.016,-.182)]),.00045),
    create_part("gasket","gasket",.488,1.41,
                ring(.488,1.41,[(.016,-.1815),(.016,-.174),(.022,-.174),(.022,-.1815)]),0),
    create_part("mullion","frame",.036,1.5,
                vertical_bar(.036,1.5,[(0,-.182),(0,-.166),(.003,-.160),(.033,-.160),
                                       (.036,-.166),(.036,-.182)]),.0006),
    create_part("transom","frame",2.18,.045,
                extrusion(2.18,[(0,-.182),(0,-.165),(.003,-.159),(.042,-.159),
                                (.045,-.165),(.045,-.182)]),.0006),
]

# Highest is authored/exported first; near changes only bevel tessellation.
highest = payload("highest")
(MASTER / "highest-geometry.json").write_text(json.dumps(highest,separators=(",",":"))+"\n",encoding="utf-8")
highest_audit = audit_geometry(highest)
highest_glb = export_glb("highest")
near = payload("near")
RUNTIME.write_text(json.dumps(near,separators=(",",":"))+"\n",encoding="utf-8")
near_audit = audit_geometry(near)
near_glb = export_glb("near")
payload("highest")
assembly()
for index,obj in enumerate(parts):
    obj.location = native((index*2.7,-3,0))
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.name.startswith("assembled:"):
        obj.select_set(True)
scene["highestPrimitiveTriangles"] = highest["totalPrimitiveTriangles"]
scene["nearPrimitiveTriangles"] = near["totalPrimitiveTriangles"]
blend = MASTER / "building-window-kit.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend),check_existing=False)

# A real reopen verifies the master survives serialisation with editable modifiers.
bpy.ops.wm.open_mainfile(filepath=str(blend))
reopened = {obj.name:obj for obj in bpy.data.objects if obj.get("nominalWidth") is not None}
assert set(reopened) == {"outerFrame","reveal","sill","sash","gasket","mullion","transom"}
assert all(obj.type == "MESH" and obj.data.uv_layers for obj in reopened.values())
assert all(any(m.type == "WEIGHTED_NORMAL" for m in obj.modifiers) for obj in reopened.values())
assert all(m.segments == 3 for obj in reopened.values() for m in obj.modifiers if m.type == "BEVEL")
report = {"schemaVersion":1,"blenderVersion":bpy.app.version_string,"cpuThreads":2,
          "gpuRender":False,"reopenPassed":True,"nominal":NOMINAL,
          "highest":highest_audit,"near":near_audit,
          "nearPrimitiveTriangles":near["totalPrimitiveTriangles"],
          "highestPrimitiveTriangles":highest["totalPrimitiveTriangles"],
          "files":[]}
for path in (blend,highest_glb,near_glb,RUNTIME,MASTER/"highest-geometry.json"):
    report["files"].append({"path":path.relative_to(ROOT).as_posix(),"bytes":path.stat().st_size,
                             "sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
(DOC/"blender-export-audit.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print("WINDOW_KIT_EXPORT",json.dumps({"nearTriangles":report["nearPrimitiveTriangles"],
                                      "highestTriangles":report["highestPrimitiveTriangles"],
                                      "reopenPassed":True}))
