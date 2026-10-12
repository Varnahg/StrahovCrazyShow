"""Build B4's identified grey panel faces from the authoritative opening plan.

Blender 5.2: --background --threads 2 --python scripts/create-b4-facade-panels.py
The output replaces the facade wall. It is not an overlay over a solid wall.
"""
import bpy
import bmesh
import hashlib
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "shared/data/b4-facade-plan.json"
MASTER = ROOT / "assets/blender/b4-panel-kit"
PUBLIC = ROOT / "public/models/architecture/b4-facade"
DOC = ROOT / "docs/reality-pack/b4-facade-panels-20261012"
RUNTIME = ROOT / "shared/data/b4-panel-kit.json"
for directory in (MASTER, PUBLIC, DOC):
    directory.mkdir(parents=True, exist_ok=True)

# These construction dimensions are declared game interpretations, not surveys.
PROFILE = {"backZ": -0.02, "jointDepth": 0.006, "jointWidth": 0.012,
           "jointShoulder": 0.002, "outerEdgeBevel": 0.0015,
           "status": "architectural-game-estimate-not-survey",
           "composition": "unknown-grey-panel-cladding-no-concrete-composition-inferred"}


def native(p):
    return (p[0], -p[2], p[1])


def canonical(p):
    return (p[0], p[2], -p[1])


def q(value):
    result = round(float(value), 8)
    return 0 if result == 0 else result


def unique(values, end):
    return sorted({round(max(0, min(end, value)), 9) for value in values})


def axis_positions(end, joints, opening_edges, level):
    values = [0, PROFILE["outerEdgeBevel"], end-PROFILE["outerEdgeBevel"], end]
    half = PROFILE["jointWidth"] / 2
    for centre in joints:
        values.extend([centre-half, centre+half])
        for sign in (-1, 1):
            values.append(centre+sign*(half+PROFILE["jointShoulder"]))
            if level == "highest":
                values.extend(centre+sign*(half+PROFILE["jointShoulder"]*t) for t in (1/3,2/3))
    values.extend(opening_edges)
    if level == "highest":
        values.extend([PROFILE["outerEdgeBevel"]*.5, end-PROFILE["outerEdgeBevel"]*.5])
    return unique(values, end)


def depression(value, end, joints, level):
    depth = 0
    half, shoulder = PROFILE["jointWidth"]/2, PROFILE["jointShoulder"]
    for centre in joints:
        distance = abs(value-centre)
        if distance <= half:
            depth = max(depth, PROFILE["jointDepth"])
        elif distance < half+shoulder:
            t = (distance-half)/shoulder
            # Same endpoints; highest adds a restrained manufactured shoulder roll.
            factor = 1-t if level == "near" else 1-(t*t*(3-2*t))
            depth = max(depth, PROFILE["jointDepth"]*factor)
    edge_distance = min(value, end-value)
    if edge_distance < PROFILE["outerEdgeBevel"]:
        depth = max(depth, PROFILE["outerEdgeBevel"]-edge_distance)
    return depth


def source_openings(face):
    return [{key: float(opening[key]) for key in ("u", "v", "w", "h")} for opening in face["openings"]]


def wall_geometry(face, level):
    width, height = float(face["width"]), float(face["height"])
    openings = source_openings(face)
    joints = face.get("joints", {})
    vertical, horizontal = joints.get("verticalU", []), joints.get("horizontalY", [])
    xs = axis_positions(width, vertical, [p for o in openings for p in (o["u"],o["u"]+o["w"])], level)
    ys = axis_positions(height, horizontal, [p for o in openings for p in (o["v"],o["v"]+o["h"])], level)
    occupied = set()
    for xi in range(len(xs)-1):
        for yi in range(len(ys)-1):
            x,y = (xs[xi]+xs[xi+1])/2,(ys[yi]+ys[yi+1])/2
            if not any(o["u"] < x < o["u"]+o["w"] and o["v"] < y < o["v"]+o["h"] for o in openings):
                occupied.add((xi,yi))
    vertices, faces, vertex_map = [], [], {}

    def index(xi,yi,back=False):
        key=(xi,yi,back)
        if key not in vertex_map:
            x,y=xs[xi],ys[yi]
            z=PROFILE["backZ"] if back else -max(depression(x,width,vertical,level),depression(y,height,horizontal,level))
            vertex_map[key]=len(vertices)
            vertices.append((x,y,z))
        return vertex_map[key]

    for xi,yi in sorted(occupied):
        corners=[(xi,yi),(xi+1,yi),(xi+1,yi+1),(xi,yi+1)]
        front=[index(*corner) for corner in corners]
        back=[index(*corner,True) for corner in corners]
        # Front and back are real shell surfaces; no opaque faces span openings.
        faces.extend([tuple(front),tuple(reversed(back))])
        neighbours=[(xi,yi-1),(xi+1,yi),(xi,yi+1),(xi-1,yi)]
        for side,neighbour in enumerate(neighbours):
            if neighbour not in occupied:
                nxt=(side+1)%4
                faces.append((front[side],back[side],back[nxt],front[nxt]))
    return vertices,faces,{"gridColumns":len(xs)-1,"gridRows":len(ys)-1,"wallCells":len(occupied),"openingCount":len(openings)}


def mesh_object(face, level, collection):
    vertices,faces,grid=wall_geometry(face,level)
    mesh=bpy.data.meshes.new(face["id"]+":"+level+":editable-panels")
    mesh.from_pydata([native(p) for p in vertices],[],faces)
    mesh.update()
    bm=bmesh.new()
    bm.from_mesh(mesh)
    # Joint intersections are not necessarily planar quads: triangulate in the
    # editable mesh before computing normals and exporting the exact same faces.
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    # Flat geometric normals keep unmeasured planar panels genuinely planar.
    uv=mesh.uv_layers.new(name="facade metres")
    for polygon in mesh.polygons:
        polygon.use_smooth=False
        n=canonical(polygon.normal)
        drop=max(range(3),key=lambda axis:abs(n[axis]))
        axes=[axis for axis in range(3) if axis!=drop]
        for loop_index in polygon.loop_indices:
            p=canonical(mesh.vertices[mesh.loops[loop_index].vertex_index].co)
            uv.data[loop_index].uv=(p[axes[0]],p[axes[1]])
    obj=bpy.data.objects.new(face["id"]+":"+level,mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    obj["faceId"]=face["id"]
    obj["detailLevel"]=level
    obj["materialRole"]="greyPanel"
    obj["sourcePlanSha256"]=source_sha
    obj["sourceWidth"]=face["width"]
    obj["sourceHeight"]=face["height"]
    obj["openingCount"]=len(face["openings"])
    obj["constructionStatus"]=PROFILE["status"]
    obj["panelComposition"]=PROFILE["composition"]
    return obj,grid


def export_geometry(obj):
    mesh=obj.data
    mesh.calc_loop_triangles()
    positions,normals,uvs,indices=[],[],[],[]
    lookup={}
    for triangle in mesh.loop_triangles:
        for li in triangle.loops:
            p=tuple(q(v) for v in canonical(mesh.vertices[mesh.loops[li].vertex_index].co))
            n=tuple(q(v) for v in canonical(mesh.corner_normals[li].vector))
            uv=tuple(q(v) for v in mesh.uv_layers.active.data[li].uv)
            key=p+n+uv
            if key not in lookup:
                lookup[key]=len(positions)//3
                positions.extend(p);normals.extend(n);uvs.extend(uv)
            indices.append(lookup[key])
    return {"positions":positions,"normals":normals,"uvs":uvs,"indices":indices}


def audit(obj,geometry):
    bm=bmesh.new();bm.from_mesh(obj.data)
    boundary=sum(edge.is_boundary for edge in bm.edges)
    nonmanifold=sum(not edge.is_manifold for edge in bm.edges)
    bm.free()
    mesh=obj.data
    mesh.calc_loop_triangles()
    degenerates=sum(triangle.area < 1e-12 for triangle in mesh.loop_triangles)
    assert boundary==0 and nonmanifold==0, (obj.name,boundary,nonmanifold)
    assert degenerates==0,(obj.name,"degenerate",degenerates)
    assert all(math.isfinite(v) for key in ("positions","normals","uvs") for v in geometry[key])
    return {"vertices":len(geometry["positions"])//3,"triangles":len(geometry["indices"])//3,
            "boundaryEdges":boundary,"nonManifoldEdges":nonmanifold,"degenerateTriangles":degenerates}


source_bytes=SOURCE.read_bytes()
plan=json.loads(source_bytes)
source_sha=hashlib.sha256(source_bytes).hexdigest()
source_faces=plan["faces"]
if isinstance(source_faces,dict):
    source_faces=[dict(face,id=identifier) for identifier,face in source_faces.items()]
assert len(source_faces)==3,"Only the three identified B4 faces are authorised"
bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene
scene.unit_settings.system="METRIC";scene.unit_settings.scale_length=1
scene.render.engine="CYCLES";scene.cycles.device="CPU"
scene.render.threads_mode="FIXED";scene.render.threads=2
scene["sourcePlanSha256"]=source_sha
scene["sourcePlan"]=SOURCE.relative_to(ROOT).as_posix()
scene["constructionProfile"]=json.dumps(PROFILE)
scene["scope"]="B4 north tower, recessed north face and northwest return only. No invented vents or glass."
material=bpy.data.materials.new("B4 grey panel cladding — composition unknown")
shade=plan["material"]["neutralShadeHex"].lstrip("#")
srgb=[int(shade[i:i+2],16)/255 for i in (0,2,4)]
linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb]
material.diffuse_color=(*linear,1)
material.use_nodes=True
material.use_backface_culling=True
bsdf=material.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value=(*linear,1)
bsdf.inputs["Roughness"].default_value=.84
material["materialRole"]="greyPanel"
material["sourceNote"]="Neutral grey photographic interpretation; no invented concrete or board-form texture"

report={"schemaVersion":1,"blenderVersion":bpy.app.version_string,"cpuThreads":2,"gpuRender":False,
        "sourcePlanSha256":source_sha,"construction":PROFILE,"levels":{},"files":[]}
all_objects=[]
exported_geometry={}
for level in ("highest","near"):
    collection=bpy.data.collections.new(level+" — B4 panels from exact shared openings")
    scene.collection.children.link(collection)
    payload={"schemaVersion":1,"level":level,"sourcePlanSha256":source_sha,
             "coordinateSystem":{"units":"metres","x":"source edge a to b","y":"up from common building foundation","z":"outward, no additional facade recess"},
             "construction":PROFILE,"faces":{}}
    rows={};offset=0
    for face in source_faces:
        obj,grid=mesh_object(face,level,collection)
        geometry=export_geometry(obj)
        exported_geometry[(level,face["id"])]=geometry
        rows[face["id"]]={**audit(obj,geometry),**grid}
        payload["faces"][face["id"]]={"width":face["width"],"height":face["height"],
              "openingCount":len(face["openings"]),"parts":[{"materialRole":"greyPanel","geometry":geometry}]}
        # Canonical geometry stays local. Gallery translation affects GLB nodes only.
        obj.location=native((offset,0,0))
        offset+=float(face["width"])+2
        all_objects.append((obj,level))
    target=MASTER/"highest-geometry.json" if level=="highest" else RUNTIME
    target.write_text(json.dumps(payload,separators=(",",":"))+"\n",encoding="utf-8")
    bpy.ops.object.select_all(action="DESELECT")
    for obj,obj_level in all_objects:
        if obj_level==level:obj.select_set(True)
    glb=PUBLIC/("b4-facade-panels-"+level+".glb")
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format="GLB",use_selection=True,export_yup=True,
                              export_normals=True,export_texcoords=True,export_extras=True)
    report["levels"][level]=rows
    report["files"].extend([target,glb])
for obj,level in all_objects:
    if level=="near":obj.hide_set(True);obj.hide_render=True
bpy.ops.object.select_all(action="DESELECT")
for obj,level in all_objects:
    if level=="highest":obj.select_set(True)
blend=MASTER/"b4-facade-panels.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(blend),check_existing=False)
bpy.ops.wm.open_mainfile(filepath=str(blend))
reopened=[obj for obj in bpy.data.objects if obj.get("faceId")]
assert len(reopened)==6
assert all(obj.data.uv_layers and len(obj.data.materials)==1 for obj in reopened)
assert all(obj["sourcePlanSha256"]==source_sha for obj in reopened)
report["nativeReopenGeometry"]={}
for obj in reopened:
    level,face_id=obj["detailLevel"],obj["faceId"]
    expected=exported_geometry[(level,face_id)]
    actual=export_geometry(obj)
    assert actual==expected,(obj.name,"save/reopen changed positions, normals, UVs or topology")
    result=audit(obj,actual)
    result["exactGeometryMatch"]=True
    result["geometrySha256"]=hashlib.sha256(json.dumps(actual,separators=(",",":")).encode()).hexdigest()
    report["nativeReopenGeometry"][level+":"+face_id]=result
report["nativeReopenPassed"]=True
report["files"].append(blend)
report["files"]=[{"path":path.relative_to(ROOT).as_posix(),"bytes":path.stat().st_size,
                  "sha256":hashlib.sha256(path.read_bytes()).hexdigest()} for path in report["files"]]
(DOC/"blender-export-audit.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print("B4_PANEL_EXPORT",json.dumps({level:sum(face["triangles"] for face in rows.values()) for level,rows in report["levels"].items()}))
