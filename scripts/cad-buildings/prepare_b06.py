"""B6-only CAD preparation. Original DXFs remain local and are never embedded.

The shared B1 module supplies geometric primitives only; no B1 floor correction,
zone, room, door exception or stair-core selection is called here.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import sys

import ezdxf
import numpy as np
from shapely.geometry import GeometryCollection, LineString, Point, Polygon, box
from shapely.ops import unary_union

import prepare_b01 as geom

ROOT = Path(__file__).resolve().parents[2]
FLOORS = ("p01", "n01", "n02", "n03", "n04", "n05", "n06", "n07")
CAD_ORIGIN = [35.0, 8.0]
SLAB = .20
HEIGHT_MODEL_ID = "b06-cad2005-half-storey-hypothesis-v1"
LEVELS = {floor: {"main": (index-1)*3.0, **({"mezzanine": (index-1)*3.0+1.5} if index < 6 else {})}
          for index, floor in enumerate(FLOORS[:-1])}
LEVELS["n07"] = {"main": 18.0, "annexRoof": 18.0, "westHeadRoof": 21.41, "eastHeadRoof": 20.5}
HEIGHT_BASIS = ("Working B6 interpretation: two side flights from main to the same drawing's upper mezzanine, "
                "one incoming centre from the previous mezzanine to the next main; ten measured fronts modeled "
                "as 0.15m rises. Main levels, mezzanines, roof/head levels, opening heights and slab thickness "
                "are estimates, not measured CAD elevations. IPR 2023 roof interpretation with provisional world origin "
                "+0.73m supports main/annex roof18.0, west head21.41 and east head20.50 locally; rigid site fit is pending. "
                "No N06 annex room or extra floor is invented; the last N05 mezzanine room has an interpreted taller ceiling.")
SHORT_LEAVES = {
    "p01": {"AB3": "AD0", "AC6": "AD2", "23D9": "23F6", "23EC": "23F8"},
    "n01": {"123F": "124A", "124B": "123D", "128E": "129B", "12B0": "12AD", "65C8": "65D3", "65D4": "65C6"},
}
CORE = {
    "west": {"bounds": [12.578804, .364404, 19.778803, 4.739404], "run": [2.039403, 4.739404],
             "lanes": {"left": [12.578804, 14.248803], "centre": [14.508802, 17.848803], "right": [18.108804, 19.778803]},
             "mainDirection": 1},
    "east": {"bounds": [50.125303, 11.801735, 57.328803, 16.034404], "run": [11.799403, 14.499404],
             "lanes": {"left": [50.225303, 51.825304], "centre": [52.085303, 55.368803], "right": [55.628803, 57.228804]},
             "mainDirection": -1},
}
ENTRY_FRONTS = ["1438", "1439", "143A", "1441"] + geom.handle_range("12F7", "12FE")
ENTRY_GRAPHICS = set(geom.handle_range("13D1", "1444") + geom.handle_range("12F7", "12FE") + ["12BD", "12BE", "12BF"])
ENTRY_LOWER = -.60
RETAINING_PANEL_TOP = -1.05
ENTRY_CANOPY_TOP = 3.7540823
EAST_TERRACE_TOP = 1.0187223
B6_PHOTO_ORIGIN_Y = .6962777093118497
REAR_IPR_MANIFEST_SHA256 = "d556d38d5c32d9d039479e492d7937e2c358df90cf94f7aee232f5e1ba330d93"
REAR_MID_WORLD = .320
REAR_FOOT_WORLD = -1.0655
REAR_STAIR_WIDTH = 1.50
REAR_STAIR_POINTS = ((62.29399,21.69625),(59.82771,20.15845),(59.27177,19.81181),(57.19903,18.51939))
REAR_SOURCE_TRIANGLES = ["1127328:"+str(i) for i in (1537,805,1017,251,12,404,233,30,1402,1515,1549,240,377)]
S201_COVER_TOP = -2.29627770931185
TERRACE_GRAPHICS = {"D82","D83","D85","D8A","D8B","D8C","D90","F63","4DCF"}
CORNER_PAIRS = {
    "p01": [("38F","3EF",.65),("57B","66C",.65),("6E3","6E0",.65),("705","6E0",.65)],
    "n01": [("7E6","963",.65),("3F0","29C",.65),("28D","29C",.45)],
    "n02": [("79B","918",.65),("3D2","27E",.65),("26F","27E",.45)],
    "n03": [("798","915",.65),("3CF","27E",.65),("26F","27E",.45)],
    "n04": [("798","915",.65),("3CF","27E",.65),("26F","27E",.45)],
    "n05": [("798","915",.65),("3CF","27E",.65),("26F","27E",.45)],
    "n06": [("78A","907",.65),("3C9","278",.65),("269","278",.45)],
}
USER_ROOM_PHOTO_SHA256 = "a689950942d17ec2ebff17d77cbf45abe2df850aa73381d83ed0fb1963ca90e9"
USER_CORRIDOR_PHOTO_SHA256 = "79edd7ae4f162235d7f31ffd4769893122d2c38c99755caff3b2da81b89a3bec"
USER_BATHROOM_PHOTO_SHA256 = "8bd41d9646499d743bbcaee6f4e32e2c5acaac40c7dbb3d4e34c1a3bc891d126"


def room_usage(floor, room):
    """Classify source rooms, never the obsolete schematic room inventory."""
    identifier=room["id"]
    if floor=="p01" and identifier in {"s191a","s191b","s191c","s192","s193"}:
        return "corridor", "source circulation polygon and connected basement portals"
    if floor not in FLOORS[1:7]:
        return "other", "source room retained; no evidenced residential or sanitary use assigned"
    prefix="" if floor=="n01" else str(int(floor[1:])-1)
    groups=({"bathroom":{"54b","31b"},"wc":{"54a","54c","31a","31"},
             "corridor":{"54","31c","91","92","93"}} if floor=="n01" else
            {"bathroom":{prefix+"44b",prefix+"21b"},
             "wc":{prefix+suffix for suffix in ("44a","44c","21a","21c")},
             "corridor":{prefix+suffix for suffix in ("44","21","91","92","93")}})
    for usage,ids in groups.items():
        if identifier in ids:
            return usage, ("source sanitary polygon and actual 2-ZARIZENI symbols" if usage!="corridor" else
                           "source main/hygiene circulation or stair-core polygon and connected portals")
    numbers=set(range(11,30))|set(range(34,53)) if floor=="n01" else set(range(1,20))|set(range(24,43))
    number=int(identifier) if identifier.isdigit() else -1
    xmin,ymin,xmax,ymax=room["geometry"].bounds
    in_row=(19.9<xmin and xmax<67.5 and .3<ymin<.5 and 6.3<ymax<6.5) or (
            2.4<xmin and xmax<50 and 10.3<ymin<10.4 and 16.1<ymax<16.3)
    if number-(0 if floor=="n01" else int(prefix)*100) in numbers and in_row and 2.2<xmax-xmin<2.55 and 5.7<ymax-ymin<6.1:
        return "bedroom", "source numbered residential row, corridor doorway and facade window; use interpreted with user B6 room/corridor photos, not an occupancy survey"
    return "other", "source room retained; sink alone, room number or annex location does not establish its use"


def source_equipment(document):
    result=[]
    for entity in document.modelspace():
        if entity.dxf.layer!="2-ZARIZENI":continue
        points=([geom.xy(v) for v in entity.points_in_wcs()] if entity.dxftype()=="POLYLINE" else
                [geom.xy(entity.dxf.start),geom.xy(entity.dxf.end)] if entity.dxftype()=="LINE" else [])
        if len(points)>1:result.append((entity.dxf.handle,LineString(points)))
    return result


def sanitary_fixture_kind(width, depth):
    """Exact B6 drafting-symbol extents, checked against the source drawings."""
    signatures={"basin":(.60,.45),"toilet":(.352,.50),"urinal":(.3473,.2565),
                "shower":(.72335,.80),"service-sink":(.55,.40)}
    for kind,(across,along) in signatures.items():
        for axis,(x,y) in enumerate(((across,along),(along,across))):
            if abs(width-x)<.003 and abs(depth-y)<.003:return kind,axis,across,along
    return None


def sanitary_fixtures(room, equipment):
    selected=[(identifier,shape) for identifier,shape in equipment if room["geometry"].buffer(.002).covers(shape.centroid)]
    if not selected:return []
    # Only join strokes of an actual symbol; adjacent sanitary fittings are
    # separated by more than this 64mm total gap in the supplied drawing.
    groups=unary_union([shape.buffer(.032) for _,shape in selected])
    result=[]
    for group in geom.polygons(groups):
        members=[(identifier,shape) for identifier,shape in selected if group.covers(shape)]
        if not members:continue
        outline=unary_union([shape for _,shape in members]);xmin,ymin,xmax,ymax=outline.bounds
        if max(xmax-xmin,ymax-ymin)<.18:continue # detached tap/drain details
        signature=sanitary_fixture_kind(xmax-xmin,ymax-ymin)
        if signature is None:
            raise ValueError(f"Unknown B6 sanitary symbol in {room['id']}: {outline.bounds}")
        kind,axis,_,_=signature;centre=np.array([(xmin+xmax)/2,(ymin+ymax)/2])
        facing=np.zeros(2);depth_axis=1-axis
        facing[depth_axis]=1 if room["geometry"].centroid.coords[0][depth_axis]>centre[depth_axis] else -1
        size=[ymax-ymin,xmax-xmin] if axis else [xmax-xmin,ymax-ymin]
        result.append({"kind":kind,"centerCad":geom.coords([centre])[0],"boundsCad":[round(v,6) for v in outline.bounds],
            "size":[round(v,6) for v in size],"facingCad":geom.coords([facing])[0],
            "sourceEntities":sorted(identifier for identifier,_ in members),
            "sourceBasis":"measured 2-ZARIZENI symbol footprint; facing follows its depth axis away from the backing side into the source room; vertical dimensions are not CAD measurements"})
    return sorted(result,key=lambda item:(item["centerCad"][0],item["centerCad"][1],item["kind"]))


def annotate_room_usage(data, floor, equipment=()):
    for room in data["rooms"]:
        usage,basis=room_usage(floor,room)
        room.update({"usage":usage,"sourceBasis":basis,"usageBasis":basis,
                     "usageSourceEntities":[room["sourceEntity"]]})
        if usage in ("bathroom","wc"):
            fixtures=sanitary_fixtures(room,equipment)
            room["sanitaryFixtures"]=fixtures
            room["usageSourceEntities"]+=sorted({identifier for item in fixtures for identifier in item["sourceEntities"]})
        elif usage=="bedroom":room["usagePhotoSha256"]=[USER_ROOM_PHOTO_SHA256,USER_CORRIDOR_PHOTO_SHA256]


def door_swing_degrees(door):
    closed=np.asarray(door["closedEnd"])-door["hinge"];opened=np.asarray(door["openEnd"])-door["hinge"]
    return math.degrees(math.acos(float(np.clip(np.dot(closed,opened)/(np.linalg.norm(closed)*np.linalg.norm(opened)),-1,1))))


def annotate_bedroom_door_pairs(data, doors):
    corridors=geom.union([room["geometry"] for room in data["rooms"] if room.get("usage")=="corridor"])
    for room in data["rooms"]:
        if room.get("usage")!="bedroom":continue
        candidates=[]
        for door in doors:
            a,b=np.asarray(door["hinge"]),np.asarray(door["closedEnd"]);mid=(a+b)/2
            direction=(b-a)/np.linalg.norm(b-a);normal=np.array([-direction[1],direction[0]])
            sides=[Point(mid+.3*sign*normal) for sign in (-1,1)]
            if any(room["geometry"].covers(sides[i]) and corridors.covers(sides[1-i]) for i in (0,1)):
                candidates.append(door)
        if len(candidates)!=2:raise ValueError(f"Bedroom {room['id']} no longer has its two source corridor leaves")
        first,second=candidates
        if np.linalg.norm(np.asarray(first["closedEnd"])-second["closedEnd"])>.002:
            raise ValueError(f"Bedroom {room['id']} leaf endpoints do not form one door")
        passive,active=sorted(candidates,key=door_swing_degrees)
        if not 20<door_swing_degrees(passive)<35 or not 85<door_swing_degrees(active)<95:
            raise ValueError(f"Ambiguous active bedroom leaf {room['id']}")
        for door,other,role in [(active,passive,"active"),(passive,active,"fixed")]:
            door.update({"roomId":room["id"],"roomSourceEntity":room["sourceEntity"],"pairedDoorId":other["id"],
                "pairedDoorRole":role,"sourceSwingDegrees":round(door_swing_degrees(door),6),
                "doorPairBasis":"actual common closed endpoint and opposite source hinges; user 2026-10-24 confirms one opening leaf for corridor bedrooms only; the 90-degree source leaf stays active, the 26.565-degree leaf stays closed"})
        passive["openingClassification"]="fixed-paired-door-leaf"


def dependencies():
    return {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in (Path(__file__), Path(geom.__file__))}


def level(key):
    floor, name = key.split(".", 1)
    return LEVELS[floor][name]


def all_levels():
    return {f"{floor}.{key}": value for floor, values in LEVELS.items() for key, value in values.items()}


def ceiling(key):
    floor, name = key.split(".", 1)
    if floor == "n07":
        return LEVELS[floor][name] - SLAB
    if name == "mezzanine" and floor == "n05":
        return level("n07.annexRoof") - SLAB
    next_floor = FLOORS[FLOORS.index(floor)+1]
    return LEVELS[next_floor][name] - SLAB


def validate_cache(recipe, strict=True):
    valid = recipe.get("generatorDependenciesSha256") == dependencies() and recipe.get("heightModel", {}).get("id") == HEIGHT_MODEL_ID
    if strict and not valid:
        raise ValueError("B6 recipe is absent/stale: regenerate both generator and helper dependency provenance")
    return valid


def source_files(source):
    paths = {floor: source / f"strahov blok6 {floor}.dxf" for floor in FLOORS}
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing B6 source: " + ", ".join(missing))
    return paths


def measure_scale(path):
    document = ezdxf.readfile(path, encoding="cp1250")
    candidates = [entity for entity in document.modelspace().query("LINE")
                  if entity.dxf.layer == "4-ROZPISKA" and abs(entity.dxf.start.y-entity.dxf.end.y) < .001
                  and 19990 < (entity.dxf.end-entity.dxf.start).magnitude < 20010]
    if len(candidates) != 1:
        raise ValueError("B6 20m graphic scale is missing or ambiguous in " + path.name)
    line = candidates[0]
    length = (line.dxf.end-line.dxf.start).magnitude
    return {"entity": line.dxf.handle, "cadLength": length, "labelMeters": 20,
            "cadUnitsPerMeter": 1000, "relativeError": abs(length/20000-1),
            "basis": "actual endpoints of the horizontal 0-20m graphic bar, not text anchors"}


def read_sources(source):
    result = {}
    for floor, path in source_files(source).items():
        drawing = geom.read_floor(path)
        drawing["scale"] = measure_scale(path)
        annotate_room_usage(drawing,floor,source_equipment(ezdxf.readfile(path,encoding="cp1250")))
        result[floor] = drawing
    document=ezdxf.readfile(source_files(source)["n07"],encoding="cp1250")
    outlines=[]
    for entity in document.modelspace().query("POLYLINE"):
        if entity.dxf.layer!=geom.WEAK or not entity.is_closed:continue
        polygon=geom.clean(Polygon([geom.xy(point) for point in entity.points_in_wcs()]))
        if polygon.area>500:outlines.append((entity.dxf.handle,polygon))
    if len(outlines)!=1:raise ValueError("Missing or ambiguous source B6 roof outline")
    result["n07"]["roofOutlineEntity"],result["n07"]["roofOutline"]=outlines[0]
    for floor in FLOORS[1:6]:
        for suffix in ("92", "93"):
            room = next(r for r in result[floor]["rooms"] if r["id"].endswith(suffix))
            reference = next(r for r in result["n01"]["rooms"] if r["id"] == suffix)
            if room["geometry"].hausdorff_distance(reference["geometry"]) > .002:
                raise ValueError("Changed B6 floor registration: " + floor + "/" + suffix)
    return result


def doors_from_source(data, floor):
    """Use actual leaf endpoints; scoped short drawings never borrow B1 exceptions."""
    leaves, duplicate_ids = {}, {}
    for line in data["lines"]:
        if line.layer != "3-DVERE":
            continue
        key = tuple(sorted(tuple(round(float(x), 5) for x in end) for end in (line.a, line.b)))
        if key in leaves:
            duplicate_ids.setdefault(leaves[key].id, []).append(line.id)
        else:
            leaves[key] = line
    available = {line.id: line for line in leaves.values()}
    doors, corrections = [], []
    for handle, points in data["arcs"]:
        centre, radius, fit_error = geom.fit_circle(points)
        choices = []
        for leaf in available.values():
            for hinge, tip in [(leaf.a, leaf.b), (leaf.b, leaf.a)]:
                distances = [float(np.linalg.norm(tip-points[0])), float(np.linalg.norm(tip-points[-1]))]
                index = int(np.argmin(distances))
                other = points[-1 if index == 0 else 0]
                score = float(np.linalg.norm(hinge-centre)) + distances[index]
                choices.append((score, distances[index], leaf.id, hinge, tip, other))
        expected = SHORT_LEAVES.get(floor, {}).get(handle)
        choices = [choice for choice in choices if expected is None or choice[2] == expected]
        if not choices:
            raise ValueError(f"Missing actual B6 door leaf {floor}/{handle}")
        score, tip_error, leaf_id, hinge, tip, closed = min(choices, key=lambda choice: choice[0])
        if score > .05:
            if expected != leaf_id or tip_error > .002 or not .45 < np.linalg.norm(closed-hinge) < 1.5:
                raise ValueError(f"Unresolved B6 door {floor}/{handle}: {score:.5f}m")
            corrections.append({"arc": handle, "leaf": leaf_id, "circleFitMismatch": round(score, 6),
                                "endpointMismatch": round(tip_error, 6),
                                "basis": "identified B6 partial/short leaf; actual hinge and opposite source arc endpoint retained"})
        doors.append({"id": f"{floor}-door-{handle}", "hinge": geom.coords([hinge])[0], "closedEnd": geom.coords([closed])[0],
                      "openEnd": geom.coords([tip])[0], "sourceEntities": [handle, leaf_id] + duplicate_ids.get(leaf_id, []),
                      "arcFitError": round(fit_error, 6)})
        del available[leaf_id]
    if available:
        raise ValueError("Unpaired B6 door leaves: " + floor + "/" + ",".join(available))
    return doors, corrections


def core_spec(floor, side):
    spec = {**CORE[side], "lanes": dict(CORE[side]["lanes"])}
    if floor == "p01" and side == "east":
        spec.update({"bounds": [50.125303, 10.339404, 57.329303, 16.314404], "run": [11.964403, 14.664404],
                     "lanes": {"left": [50.129304, 51.799303], "centre": [52.059304, 55.399302], "right": [55.659303, 57.329303]}})
    return spec


def measured_rows(data, floor, side, lane):
    spec = core_spec(floor, side)
    xmin, xmax = spec["lanes"][lane]
    ymin, ymax = spec["run"]
    rows = defaultdict(list)
    for line in data["lines"]:
        if line.layer != geom.WEAK or abs(line.a[1]-line.b[1]) > 1e-5:
            continue
        y = float((line.a[1]+line.b[1])/2)
        lo, hi = max(xmin, min(line.a[0], line.b[0])), min(xmax, max(line.a[0], line.b[0]))
        if ymin-.002 <= y <= ymax+.002 and hi-lo > .03:
            rows[round(y, 6)].append((float(lo), float(hi), line.id))
    accepted = []
    for y, pieces in sorted(rows.items()):
        merged = unary_union([LineString([(a, y), (b, y)]) for a, b, _ in pieces])
        # A centre row crossed by the source break has at most a 0.26m gap.
        coverage = merged.length/(xmax-xmin)
        if coverage >= (.90 if lane == "centre" else .995):
            accepted.append((y, sorted({handle for _, _, handle in pieces}), coverage))
    if len(accepted) != 10 or any(abs(b[0]-a[0]-.30) > .002 for a, b in zip(accepted, accepted[1:])):
        raise ValueError(f"B6 {floor}/{side}/{lane}: expected ten measured 0.30m rows, got {[(y,h) for y,h,_ in accepted]}")
    return accepted


def stair_segment(data, floor, side, lane, low, high, owner):
    spec = core_spec(floor, side)
    rows = measured_rows(data, floor, side, lane)
    ascending = spec["mainDirection"] if lane == "centre" else -spec["mainDirection"]
    if ascending < 0:
        rows.reverse()
    xmin, xmax = spec["lanes"][lane]
    edges = [[[xmin, row[0]], [xmax, row[0]]] for row in rows]
    segment = geom.measured_edge_flight(f"{owner}-{side}-{lane}", edges, [h[0] for _, h, _ in rows], low, high, owner, floor)
    segment["sourceEntities"] = sorted({h for _, handles, _ in rows for h in handles})
    segment["edgeSourceEntities"] = [handles for _, handles, _ in rows]
    segment["planBasis"] = "actual B6 horizontal nosing rows; shared long boundary clipped to measured lane, source break gaps bridged only within that row"
    segment["verticalBasis"] = HEIGHT_BASIS
    return segment


def landing(identifier, polygon, floor, key, source, handles, basis):
    return geom.stair_surface(identifier, polygon, floor, key, source, handles, basis)


def mezzanine_landing_shape(floor, side):
    spec=core_spec(floor,side);xmin,_,xmax,_=spec["bounds"]
    if side=="west":
        return box(xmin,.364404 if floor=="p01" else .264402,xmax,spec["run"][0])
    shape=box(xmin,spec["run"][1],xmax,16.314404 if floor=="p01" else 16.034404)
    if floor=="p01":
        # The P01 sides end 0.165m north of the incoming N01 centre start.
        # Bridge only the measured centre lane; a full-width extension would
        # put the mezzanine slab through both final side treads.
        left,right=CORE["east"]["lanes"]["centre"]
        connector=box(left,CORE["east"]["run"][1],right,spec["run"][1])
        shape=shape.union(connector)
    return geom.clean(shape)


def stair_metadata(data):
    routes, observations, shared = [], [], {}
    levels = all_levels()
    for index, floor in enumerate(FLOORS[:-1]):
        for side in CORE:
            spec = core_spec(floor, side);xmin, _, xmax, _ = spec["bounds"]
            low_y, high_y = spec["run"]
            if side == "west":
                main_shape = box(xmin, high_y, xmax, 6.489404)
            else:
                main_shape = box(xmin, 10.159404, xmax, low_y)
            mid_shape=mezzanine_landing_shape(floor,side)
            shared[floor, side, "main"] = landing(f"{floor}-{side}-main-landing", main_shape, floor, floor+".main", floor, [], "main corridor landing bounded by source core/corridor faces")
            if "mezzanine" in LEVELS[floor]:
                shared[floor, side, "mezzanine"] = landing(f"{floor}-{side}-mezz-landing", mid_shape, floor, floor+".mezzanine", floor, [], "source half-level landing; front rooms and glazing retain exact XY; Z estimated")
    for index, floor in enumerate(FLOORS[:-1]):
        for side in CORE:
            if floor != "n06":
                for lane in ("left", "right"):
                    segment = stair_segment(data[floor], floor, side, lane, floor+".main", floor+".mezzanine", floor)
                    routes.append({"id": segment["id"]+"-route", "ownerFloor": floor, "sourceFloor": floor, "coreId": side,
                        "lowerLevelKey": floor+".main", "upperLevelKey": floor+".mezzanine", "segments": [segment],
                        "landings": shared[floor,side,"main"] + shared[floor,side,"mezzanine"], "verticalBasis": HEIGHT_BASIS})
            else:
                observations.append({"floor": floor, "coreId": side, "build": False,
                    "basis": "top-floor side graphics are returning/lower projections, no next front room or proven roof flight"})
            if index:
                previous = FLOORS[index-1]
                segment = stair_segment(data[floor], floor, side, "centre", previous+".mezzanine", floor+".main", floor)
                routes.append({"id": segment["id"]+"-route", "ownerFloor": floor, "sourceFloor": floor, "coreId": side,
                    "lowerLevelKey": previous+".mezzanine", "upperLevelKey": floor+".main", "segments": [segment],
                    "landings": shared[previous,side,"mezzanine"] + shared[floor,side,"main"], "verticalBasis": HEIGHT_BASIS})
            else:
                observations.append({"floor": floor, "coreId": side, "build": False,
                    "basis": "centre projection overlies enclosed basement s120/872 or s122/8EB; use next-floor incoming physical centre once"})
    return {"plans": routes, "levels": levels, "observations": observations}


def exterior_metadata(data, doors):
    by_id = {line.id: line for line in data["n01"]["lines"]}
    if any(handle not in by_id for handle in ENTRY_FRONTS + ["143E", "143B"]):
        raise ValueError("Missing B6 entry stair/landing outline")
    edges = [[by_id[h].a.tolist(), by_id[h].b.tolist()] for h in ENTRY_FRONTS]
    low_key, high_key = "exterior.entry.lower", "n01.mezzanine"
    anchors = {low_key: ENTRY_LOWER}
    segment = geom.measured_edge_flight("b06-entry-flight", edges, ENTRY_FRONTS, low_key, high_key, "n01", "n01")
    segment["verticalBasis"] = "12 actual B6 front edges; lower local -0.60 and 0.175m rises interpreted from IPR 2023 first nose world0.19-0.345m; terrain acceptance pending, not CAD Z"
    end = segment["frontEdgesCad"][-1]
    outer = [by_id["143E"].b, by_id["143B"].b]
    upper = geom.clean(Polygon([end[0], end[1], outer[1], outer[0]]))
    portals = [door for door in doors["n01"] if set(door["sourceEntities"]) & {"12C2", "12E1"}]
    if len(portals) != 2:
        raise ValueError("Missing two actual B6 entrance leaves")
    upper, connectors = geom.connect_landing_to_portals(upper, portals)
    lower = geom.edge_landing(segment, False, .60)
    surfaces = landing("b06-entry-lower", lower, "n01", low_key, "n01", ENTRY_FRONTS[:1], "0.60m lower approach depth estimated; terrain validation pending")
    surfaces += landing("b06-entry-upper", upper, "n01", high_key, "n01", ["12FE", "143E", "143B", "12C2", "12E1"], "measured entry platform and local connections to actual doors")
    route = {"id": "b06-main-entry", "ownerFloor": "n01", "sourceFloor": "n01", "lowerLevelKey": low_key,
        "upperLevelKey": high_key, "segments": [segment], "landings": surfaces, "terrainValidationPending": True,
        "sourceDoorIds": [door["id"] for door in portals], "verticalBasis": segment["verticalBasis"]}
    cut = geom.union([lower, upper, Polygon([edges[0][0], edges[0][1], edges[-1][1], edges[-1][0]])])
    rear=rear_exterior_metadata();anchors.update(rear['anchors'])
    return {"plans": [route]+rear['plans'], "anchors": anchors, "levels": {**all_levels(), **anchors}, "estimates": {},
        "terrainCutouts": rear['terrainCutouts']+[{"id": "b06-entry-terrain", "loops": [geom.coords(list(poly.exterior.coords)[:-1])],
            "bottom": anchors[low_key], "openAbove": level(high_key), "terrainValidationPending": True,
            "coordinateSpace": "CAD XY metres; no origin subtraction or game-axis transform", "provenance": "B6 measured entry flight/platform; elevations and lower approach depth estimated"} for poly in geom.polygons(cut)]}


def rear_exterior_metadata():
    """Two IPR-observed slopes; individual riser count remains an estimate."""
    keys=['exterior.rear.lower','exterior.rear.mid','exterior.rear.upper']
    anchors=dict(zip(keys,[REAR_FOOT_WORLD-B6_PHOTO_ORIGIN_Y,REAR_MID_WORLD-B6_PHOTO_ORIGIN_Y,EAST_TERRACE_TOP]))
    segments=[]
    for i,(a,b) in enumerate(zip(REAR_STAIR_POINTS[::2],REAR_STAIR_POINTS[1::2])):
        a,b=np.asarray(a),np.asarray(b);axis=(b-a)/np.linalg.norm(b-a);normal=np.array([-axis[1],axis[0]])
        edges=[[(p-normal*REAR_STAIR_WIDTH/2).tolist(),(p+normal*REAR_STAIR_WIDTH/2).tolist()] for p in np.linspace(a,b,8)]
        segment=geom.measured_edge_flight(f'b06-rear-flight-{i+1}',edges,REAR_SOURCE_TRIANGLES,keys[i],keys[i+1],'n01','n01')
        segment.update({'sourceFrontsMeasured':False,'modeledRiserCount':8,'visibleIntervals':None,
            'sourceManifestSha256':REAR_IPR_MANIFEST_SHA256,'sourceKind':'IPR2023-reconstruction',
            'planBasis':'IPR 2023 connected ramp/landing trace in original CAD XY frame; 1.50m conservative width interpreted inside noisy 1.697-2.944m source cross sections; individual nosing positions reconstructed, not CAD measured',
            'riserCountInterpretation':'eight rises per observed slope are a construction estimate; neither DXF nor available scan resolves individual noses',
            'verticalBasis':'IPR upper deck world1.715, intermediate landing0.320, actual ground foot-1.0655; subtract explicit pose origin0.6962777093, no change to interior levels'})
        segments.append(segment)
    lower=geom.edge_landing(segments[0],False,.65)
    middle=geom.clean(Polygon([*segments[0]['frontEdgesCad'][-1],*reversed(segments[1]['frontEdgesCad'][0])]))
    surfaces=landing('b06-rear-lower',lower,'n01',keys[0],'n01',REAR_SOURCE_TRIANGLES[-2:],'IPR ground junction; 0.65m approach depth estimated; DMR differs by about0.154m')
    surfaces+=landing('b06-rear-mid',middle,'n01',keys[1],'n01',['1127328:404','1127328:233'],'observed flat intermediate surface, not stair foot')
    route={'id':'b06-rear-entry','ownerFloor':'n01','sourceFloor':'n01','lowerLevelKey':keys[0],'upperLevelKey':keys[2],
        'segments':segments,'landings':surfaces,'upperSupportSolidId':'b06-east-mezz-terrace',
        'terrainValidationPending':True,'sourceManifestSha256':REAR_IPR_MANIFEST_SHA256,
        'sourceDoorIds':['n01-door-4D6C','n01-door-4D81','n01-door-4D8D','n01-door-4DA1','n01-door-4DAE','n01-door-4DC3'],
        'verticalBasis':segments[0]['verticalBasis'],'upperDoorThresholdStatus':'unresolved0.481m model discrepancy; no invented connecting steps'}
    footprints=[lower,middle]+[Polygon([s['frontEdgesCad'][0][0],s['frontEdgesCad'][0][1],s['frontEdgesCad'][-1][1],s['frontEdgesCad'][-1][0]]) for s in segments]
    cut=geom.union(footprints)
    return {'plans':[route],'anchors':anchors,'terrainCutouts':[{'id':'b06-rear-stair-terrain','loops':[geom.coords(list(p.exterior.coords)[:-1])],
        'bottom':anchors[keys[0]],'openAbove':anchors[keys[2]],'terrainValidationPending':True,
        'coordinateSpace':'CAD XY metres; no origin subtraction or game-axis transform',
        'provenance':'only reconstructed physical rear stair/landing footprint; no terrace shadow or surrounding lawn cut; source IPR2023, estimated width/count, local terrain acceptance required'} for p in geom.polygons(cut)]}


def rear_terrace_shape():
    # Outer up-plane envelope from tiles1127328/1127330, joined to the actual
    # CAD backline. D85/D90 with a Z-break is not a measured complete outer edge.
    shape=Polygon([(49.925303,16.284402),(50.760817,17.705821),(55.293123,20.184315),
        (55.895831,20.302740),(57.784540,17.765501),(57.350615,16.953763),(57.503803,16.284402)])
    flight=rear_exterior_metadata()['plans'][0]['segments'][-1]
    a,b=np.asarray(flight['a']),np.asarray(flight['b']);axis=(b-a)/np.linalg.norm(b-a)
    inside=geom.oriented_rectangle(b,b+axis*40,-40,40)
    # A single closed canopy supplies the terminal riser; do not duplicate a
    # stair-landing solid on the same deck or let it overlap the last tread.
    return geom.clean(shape.intersection(inside).union(geom.edge_landing(flight,True,.25)))


def rear_sign():
    return {'id':'b06-cajovna-stoh-sign','a':[55.293123,20.184315],'b':[50.760817,17.705821],
        'bottom':EAST_TERRACE_TOP+.25,'top':EAST_TERRACE_TOP+.95,'lines':['Klub Čajovna','Klub STOH'],
        'basis':'user rear B6 photograph confirms white two-line banner; outer edge follows reconstructed IPR deck envelope, 0.70m panel height and rail-relative placement are estimates, not surveyed signage'}


def mezzanine_region(floor, data):
    if "mezzanine" not in LEVELS[floor]:
        return GeometryCollection()
    front = [room["geometry"] for room in data["rooms"] if room["geometry"].bounds[1] < -.2 and room["geometry"].bounds[2] < 21]
    west = box(12.328804, -7, 19.978803, CORE["west"]["run"][0])
    east = box(50.125303-.25, CORE["east"]["run"][1], 57.329303+.25, 16.6)
    circulation_ids={"s121", "s192", "s193"}
    protected=[room["geometry"] for room in data["rooms"] if room["geometry"] not in front
               and not room["id"].endswith(("92","93")) and room["id"] not in circulation_ids]
    return geom.clean(geom.union([west, east] + front).difference(geom.union(protected)))


def floor_key(floor, point, mezz):
    if floor == "n07":
        return "n07.main"
    return floor + (".mezzanine" if mezz.covers(point) else ".main")


def graphics_mask(floor):
    masks = []
    for side in CORE:
        spec = core_spec(floor, side)
        xmin, xmax = min(q[0] for q in spec["lanes"].values()), max(q[1] for q in spec["lanes"].values())
        ymin, ymax = spec["run"]
        if floor == "n06" and side == "west":ymin = 1.0
        masks.append(box(xmin-.12, ymin-.12, xmax+.12, ymax+.12))
    return geom.union(masks)


def stair_holes(floor):
    if floor == "n07":return GeometryCollection()
    result = []
    for side in CORE:
        spec = core_spec(floor, side)
        xmin, _, xmax, _ = spec["bounds"]
        if side == "west":shape = box(xmin, .364404, xmax, 4.739404)
        else:shape = box(xmin, spec["run"][0], xmax, 16.314404 if floor == "p01" else 16.034404)
        result.append(shape)
    return geom.union(result)


def base_footprint(rooms, wall, openings):
    # Internal stair voids are cut explicitly; this does not add an outer hull.
    return geom.footprint(rooms, wall, openings)


def final_edge_coverage(candidates, lines, solids, tolerance=.002):
    """Audit the finished XY projection; an early fallback warning is not a gap."""
    by_id={line.id:line for line in lines}
    coverage=geom.union([Polygon(solid["loops"][0],solid["loops"][1:]) for solid in solids if solid["role"]=="wall"]).buffer(tolerance)
    remaining,resolved=[],[]
    for candidate in candidates:
        missing=by_id[candidate["entity"]].line.difference(coverage)
        item={**candidate,"remainingLength":round(missing.length,6),"coverageTolerance":tolerance,
              "coverageBasis":"final wall XY projection after junctions/openings; not a vertical clearance assertion"}
        (remaining if missing.length>.002 else resolved).append(item)
    return remaining,resolved


def measured_corner_face(lines, horizontal_id, vertical_id, vertical_probe=.65):
    """A selected B6 L join bounded by two outer and two measured inner runs."""
    by_id={line.id:line for line in lines}
    if horizontal_id not in by_id or vertical_id not in by_id:
        raise ValueError("Missing selected B6 corner edges")
    h,v=by_id[horizontal_id],by_id[vertical_id]
    if h.layer!=geom.STRONG or v.layer!=geom.STRONG or abs(h.a[1]-h.b[1])>.00001 or abs(v.a[0]-v.b[0])>.00001:
        raise ValueError("Changed selected B6 corner orientation")
    x,y=float(v.a[0]),float(h.a[1]);corner=np.array([x,y])
    if min(np.linalg.norm(p-corner) for p in (h.a,h.b))>.002 or min(np.linalg.norm(p-corner) for p in (v.a,v.b))>.002:
        raise ValueError("Selected B6 outer runs do not meet")
    sx=1 if (h.a[0]+h.b[0])/2>x else -1
    sy=1 if (v.a[1]+v.b[1])/2>y else -1
    inner_h=[];inner_v=[]
    for line in lines:
        if line.layer!=geom.STRONG:continue
        if abs(line.a[1]-line.b[1])<1e-5 and min(line.a[0],line.b[0])-.002<=x+sx*.65<=max(line.a[0],line.b[0])+.002:
            width=sy*(line.a[1]-y)
            if .04<width<.65:inner_h.append((float(width),line.id))
        if abs(line.a[0]-line.b[0])<1e-5 and min(line.a[1],line.b[1])-.002<=y+sy*vertical_probe<=max(line.a[1],line.b[1])+.002:
            width=sx*(line.a[0]-x)
            if .04<width<.65:inner_v.append((float(width),line.id))
    if not inner_h or not inner_v:raise ValueError("Selected B6 corner lacks measured inner wall runs")
    height,h_id=max(inner_h);width,v_id=max(inner_v)
    shape=geom.clean(box(min(x,x+sx*width),min(y,y+sy*height),max(x,x+sx*width),max(y,y+sy*height)))
    if shape.area>.25:raise ValueError("Selected B6 corner exceeds conservative join bounds")
    return shape,[horizontal_id,vertical_id,h_id,v_id]


def measured_t_face(lines, outer_id, lower_y, upper_y):
    by_id={line.id:line for line in lines};outer=by_id[outer_id];x=float(outer.a[0])
    branches=[]
    for y in (lower_y,upper_y):
        options=[line for line in lines if line.layer==geom.STRONG and abs(line.a[1]-line.b[1])<1e-5
                 and abs(line.a[1]-y)<.002 and line.length>.65 and .04<x-max(line.a[0],line.b[0])<.65]
        if len(options)!=1:raise ValueError("Ambiguous selected B6 T branch")
        branches.append(options[0])
    inner=[max(line.a[0],line.b[0]) for line in branches]
    if abs(inner[0]-inner[1])>.002:raise ValueError("B6 T branches do not terminate on the same inner face")
    shape=geom.clean(box(min(inner),min(q.a[1] for q in branches),x,max(q.a[1] for q in branches)))
    return shape,[outer_id]+[line.id for line in branches]


def p01_facade_continuation(lines):
    by_id={line.id:line for line in lines};handles=["4A4","683","703","70A","6EA"]
    if any(h not in by_id or by_id[h].layer!=geom.STRONG for h in handles):
        raise ValueError("Missing P01 facade continuation source anchors")
    outer,inner,lower,upper=[by_id[h] for h in ("4A4","683","70A","703")]
    shape=geom.clean(box(inner.a[0],lower.a[1],outer.a[0],upper.a[1]))
    if not .240<shape.area<.247 or abs(outer.a[0]-inner.a[0]-.375)>.002:
        raise ValueError("Changed P01 4A4 facade continuation anchors")
    return shape,handles


def complete_b6_wall_joins(floor, lines, wall, room_union):
    """Only individually identified outer corners/T joins; no broad morphology."""
    candidates=[(*measured_corner_face(lines,h,v,probe),"measured outer L corner") for h,v,probe in CORNER_PAIRS.get(floor,[])]
    if floor in CORNER_PAIRS:
        outer="66C" if floor=="p01" else CORNER_PAIRS[floor][1][1]
        ys=(13.274403,13.374403) if floor=="p01" else (11.884403,12.009403)
        candidates.append((*measured_t_face(lines,outer,*ys),"measured transverse partition T at continuous outer facade"))
    if floor=="p01":
        by_id={line.id:line for line in lines};a,c=by_id["609"],by_id["66C"]
        # This 40mm-high measured strip is below generic pairing's 80mm
        # overlap threshold; it is a real frame/T return, not a guessed wall.
        shape=geom.clean(box(a.a[0],min(a.a[1],a.b[1]),c.a[0],max(a.a[1],a.b[1])))
        candidates.append((shape,["609","60A","66C"],"measured 40mm facade frame return"))
        continuation,handles=p01_facade_continuation(lines)
        candidates.append((continuation,handles,
            "local continuation of the measured375mm exterior facade; no door arc, not a fill of the wider window recess"))
    additions=[];evidence=[];room_core=room_union.buffer(-.003)
    for shape,handles,basis in candidates:
        if shape.intersection(room_core).area>.001:raise ValueError("B6 join intrudes into a source room: "+str(handles))
        gap=geom.clean(shape.difference(wall))
        if gap.is_empty:continue
        additions.append(gap);evidence.append({"kind":"sourceBoundedB6Join","entities":handles,"area":round(gap.area,6),
            "bounds":list(gap.bounds),"basis":basis+"; only existing missing piece added before door/window cuts"})
    return geom.union([wall]+additions),evidence


def retaining_panel(floor,lines):
    if floor!="n01":return None
    by_id={line.id:line for line in lines}
    if any(handle not in by_id for handle in ("1072","1073")):raise ValueError("Missing measured B6 exterior panel")
    shape=geom.parallel_strip(by_id["1072"],by_id["1073"])
    if shape is None or not 1.10<shape.area<1.14:raise ValueError("Changed B6 exterior panel footprint")
    return {"id":"n01-ipr-low-retaining-panel","geometry":geom.clean(shape),"bottom":level("p01.main"),"top":RETAINING_PANEL_TOP,
        "sourceEntities":["1072","1073","1066"],"heightBasis":"IPR Praha 2023 panel cap world -0.441..-0.316m (two near-horizontal triangles,1.348m2); selected local cap-1.05, buried bottom p01.main; interpretation, not CAD Z",
        "photogrammetrySource":"b06-exterior-panel-source.json","sourceManifestSha256":"d556d38d5c32d9d039479e492d7937e2c358df90cf94f7aee232f5e1ba330d93"}


def upper_annex_portals(n06, n05_doors):
    """Preserve actual N05 mezzanine doorways through the overlapping N06 band."""
    by_id={line.id:line for line in n06["lines"]}
    if any(h not in by_id for h in ("970","971")):
        raise ValueError("Missing N06 front boundary for existing N05 portals")
    edges=[by_id[h] for h in ("970","971")]
    if any(edge.layer!=geom.STRONG or abs(edge.a[1]-edge.b[1])>.00001 for edge in edges):
        raise ValueError("Changed N06 annex threshold orientation")
    ymin=min(edge.a[1] for edge in edges)
    ymax=CORE["west"]["bounds"][1]
    if abs(abs(edges[0].a[1]-edges[1].a[1])-.25)>.002:
        raise ValueError("Changed N06 front wall thickness")
    expected={"4D34","4D3E","4D61","4D77"}
    selected=[door for door in n05_doors if set(door["sourceEntities"]) & expected]
    if len(selected)!=4:raise ValueError("Missing one of four actual N05 annex doorways")
    bottom,top=geom.opening_vertical_span("door",level("n05.mezzanine"),ceiling("n05.mezzanine"))
    result=[]
    for door in selected:
        a,c=np.asarray(door["hinge"]),np.asarray(door["closedEnd"])
        if abs(a[1]-c[1])>.002 or not min(ymin,ymax)<a[1]<max(ymin,ymax):
            raise ValueError("N05 door no longer aligns with the N06 threshold band")
        shape=geom.clean(box(min(a[0],c[0]),ymin,max(a[0],c[0]),ymax))
        result.append({"id":"n06-through-"+door["id"],"floor":"n06","sourceFloor":"n05","sourceDoorId":door["id"],
            "sourceEntities":door["sourceEntities"]+["970","971"],"geometry":shape,"bottom":bottom,"top":top,
            "basis":"existing lower mezzanine doorway, same measured X span; remove only overlapping upper wall/slab up to the existing door head; N06 sides and upper lintel retained"})
    return result


def clip_slab_at_portals(shape, bottom, top, portals):
    cuts=[portal["geometry"] for portal in portals if portal["bottom"]<top and portal["top"]>bottom]
    return geom.clean(shape.difference(geom.union(cuts))) if cuts else shape


def exterior_feature(identifier, shape, role, material, bottom, top, handles, basis):
    return {"id":identifier,"floor":"n01","geometry":geom.clean(shape),"role":role,"material":material,
            "bottom":bottom,"top":top,"sourceFloor":"n01","sourceEntities":handles,"basis":basis,
            "photogrammetryBasis":"IPR Praha 2023; source-exteriors images reviewed; vertical dimensions and construction thickness are explicit interpretations"}


def n01_exterior_features(data, doors):
    by_id={line.id:line for line in data["lines"]}
    required={"142A","143C","143D","143E","143B","D85","D90","F63","D83","4D65","10E2","D7C","5E5","28D"}
    if required-set(by_id):raise ValueError("Missing B6 exterior source outline: "+str(sorted(required-set(by_id))))
    features=[]
    canopy=Polygon([by_id["142A"].a,by_id["142A"].b,by_id["143C"].b,by_id["143D"].b])
    if not canopy.is_valid or not 21.8<canopy.area<22.2:raise ValueError("Changed source entry canopy frame")
    features.append(exterior_feature("b06-entry-canopy",canopy,"canopy","roof",ENTRY_CANOPY_TOP-.10,ENTRY_CANOPY_TOP,
        ["142A","143C","143D"],"actual outer CAD entry frame22m2 retained instead of enlarging to the laterally different IPR roof envelope26.607m2; capworld4.45036 and0.10m thickness interpreted, not another floor"))
    for identifier,outer,inner in [("south","143C","143B"),("north","143D","143E")]:
        band=geom.parallel_strip(by_id[outer],by_id[inner],min_width=.02,max_width=.12)
        if band is None:raise ValueError("Missing measured side-frame width")
        features.append(exterior_feature("b06-canopy-"+identifier+"-frame",band,"canopy","metal",ENTRY_CANOPY_TOP-.20,ENTRY_CANOPY_TOP-.10,
            [outer,inner],"two measured longitudinal frame bands only;0.10m beam depth estimated; no inferred repeated posts"))
    # Two collinear front segments are separated by a source drawing break.
    if abs(by_id['4D65'].a[1]-16.284402)>.002:raise ValueError('Changed source rear attachment')
    terrace=rear_terrace_shape()
    features.append(exterior_feature("b06-east-mezz-terrace",terrace,"canopy","concrete",EAST_TERRACE_TOP-.20,EAST_TERRACE_TOP,
        ["D85","D90","F63","D83","4D65","4D66","4D67","4DCF"],
        "IPR2023 up-plane envelope plus CAD backline; D85/D90 is broken drawing line, not complete outer edge; topworld1.715 and0.20m thickness interpreted, same canopy supplies rear terminal riser; 0.4812777m discrepancy to n01.mezzanine unresolved, no invented threshold steps"))
    glazing={"4D6C","4D81","4D8D","4DA1","4DAE","4DC3"}
    for door in doors:
        if set(door["sourceEntities"]) & glazing:
            door.update({"openingClassification":"openable-glazing","fixedGlazing":False,"leafMaterial":"glass",
                         "outsideSupportId":"b06-east-mezz-terrace","outsideSupportTop":EAST_TERRACE_TOP,
                         "outsideStepEstimate":level("n01.mezzanine")-EAST_TERRACE_TOP,
                         "outsideTraversalStatus":"requires-native-jump-validation",
                         "outsideHeightBasis":"unresolved 0.481m model discrepancy; traversal permission tests this model only, not a measured physical threshold",
                         "classificationBasis":"actual CAD opening leaves and IPR openable glazed row above lower concrete terrace; not fixed glass"})
    if sum(bool(set(door["sourceEntities"]) & glazing) for door in doors)!=6:
        raise ValueError("Missing one of six B6 mezzanine glazed leaves")
    for side,frame_id,front_id,arcs in [
        ("west","10E2","5E5",{"22B6","22CB","22D7","22EB"}),
        ("east","D7C","28D",{"2303","2318","2324","2339"})]:
        selected=[door for door in doors if set(door["sourceEntities"]) & arcs]
        if len(selected)!=4:raise ValueError("Missing source corridor-end doors: "+side)
        door_x=float(np.mean([door["hinge"][0] for door in selected]))
        frame=by_id[frame_id];front=by_id[front_id]
        front_x=float(min(front.a[0],front.b[0]) if side=="west" else max(front.a[0],front.b[0]))
        shape=box(min(front_x,door_x),min(frame.a[1],frame.b[1]),max(front_x,door_x),max(frame.a[1],frame.b[1]))
        if not 8<shape.area<10:raise ValueError("Changed corridor-end recess")
        handles=[frame_id,front_id]+sorted(arcs)
        basis="source corridor recess from measured door line to adjacent building front; actual raised portico visible in IPR; main0 top and buried plinth bottom-1 are interpretations, no invented steps"
        features.append(exterior_feature("b06-"+side+"-portico",shape,"slab","floor",-.20,0,handles,basis))
        features.append(exterior_feature("b06-"+side+"-portico-plinth",shape,"slab","concrete",-1,-.20,handles,basis))
    return features


def feature_solids(features, floor):
    result=[]
    for feature in features:
        if feature["floor"]!=floor:continue
        parts=geom.serialize_solids(feature["geometry"],feature["id"],feature["role"],feature["bottom"],feature["top"],feature["material"])
        for part in parts:part["sourceStructure"]={key:value for key,value in feature.items() if key!="geometry"}
        result+=parts
    return result


def reserve_exterior_support(shape, features, floor, height):
    replacements=[item["geometry"] for item in features if item["floor"]==floor and item["role"]=="slab" and abs(item["top"]-height)<1e-6]
    return geom.clean(shape.difference(geom.union(replacements))) if replacements else shape


def buried_chamber(data, envelope):
    room=next((room for room in data["rooms"] if room["sourceEntity"]=="A5A"),None)
    if room is None:raise ValueError("Missing B6 s201 source chamber")
    components=[poly for poly in geom.polygons(envelope) if poly.covers(room["geometry"].representative_point())]
    if len(components)!=1 or components[0].difference(room["geometry"].buffer(.25,join_style=2)).area>.001:
        raise ValueError("S201 is not the isolated source chamber envelope")
    return {"id":"b06-s201-preserve-ground","floor":"p01","sourceEntity":"A5A","role":"buried-chamber",
        "geometry":components[0],"roomGeometry":room["geometry"],"sourceWallEntities":["7DC","7DD","7DE","7DF"],
        "bottom":level("p01.main"),"coverTop":S201_COVER_TOP,"coverThickness":.20,
        "terrainPreservationRequired":True,"coordinateSpace":"CAD XY metres; no origin subtraction or game-axis transform",
        "provenance":"IPR2023 continuous grassy slope, minimum of9 source samples world-1.439; selected coverworld-1.60,0.20m thickness, existing inferred0.10m enclosure retained; nonhabitable, no source entry, not CAD Z"}


def bedroom_at_window(window, rooms):
    a,b=np.asarray(window["a"]),np.asarray(window["b"]);direction=(b-a)/np.linalg.norm(b-a)
    normal=np.array([-direction[1],direction[0]]);mid=(a+b)/2
    matches=[room for room in rooms if room.get("usage")=="bedroom" and
             any(room["geometry"].covers(Point(mid+sign*.45*normal)) for sign in (-1,1))]
    return matches[0] if len(matches)==1 else None


def split_bedroom_window(window, data):
    """A long 3-OKNA symbol spans two rooms; it must not erase their real wall."""
    a,b=np.asarray(window["a"]),np.asarray(window["b"]);length=float(np.linalg.norm(b-a))
    axis=(b-a)/length;normal=np.array([-axis[1],axis[0]]);trace=LineString([a,b])
    strong=[line for line in data["lines"] if line.layer==geom.STRONG]
    edges=[line for line in strong if line.length>1 and abs(np.dot(line.direction,normal))>.999 and line.line.distance(trace)<.06]
    partitions=[]
    for i,first in enumerate(edges):
        for second in edges[i+1:]:
            profile=geom.parallel_strip(first,second,min_width=.07,max_width=.15)
            if profile is None:continue
            intersection=profile.intersection(trace)
            if intersection.is_empty or intersection.length<.07:continue
            ends=[min((line.a,line.b),key=lambda p:Point(p).distance(trace)) for line in (first,second)]
            caps=[line for line in strong if line.length<.16 and line.line.hausdorff_distance(LineString(ends))<.002]
            terminal=LineString(ends)
            frame_ends=[line for line in data["lines"] if line.id in window["sourceEntities"] and
                        line.line.buffer(.002,cap_style=2).covers(terminal)]
            # One original bay omits the short cap stroke, but both real wall
            # faces end on the same measured frame line. Keep that existing
            # paired strip; do not invent a width or extend either face.
            if len(caps)!=1 and not frame_ends:continue
            lo,hi=sorted(float(np.dot(point-a,axis)) for point in ends)
            if lo<.5 or hi>length-.5:continue
            left=bedroom_at_window({"a":a,"b":a+axis*lo},data["rooms"])
            right=bedroom_at_window({"a":a+axis*hi,"b":b},data["rooms"])
            if not left or not right or left["sourceEntity"]==right["sourceEntity"]:continue
            partitions.append({"geometry":profile,"low":lo,"high":hi,
                               "sourceEntities":[first.id,second.id]+[line.id for line in (caps if len(caps)==1 else frame_ends)]})
    if len(partitions)>1:raise ValueError("Ambiguous multi-partition B6 window: "+window["id"])
    spans=[(0,length)] if not partitions else [(0,partitions[0]["low"]),(partitions[0]["high"],length)]
    children=[]
    for index,(low,high) in enumerate(spans):
        child={**window,"a":geom.coords([a+axis*low])[0],"b":geom.coords([a+axis*high])[0],
               "windowPlaneNormalOffset":0.0,
               "sourcePlaneBasis":"a/b are the measured midpoint of the two 3-OKNA frame lines; normalOffset describes surrounding wall depth, not window-plane displacement"}
        if partitions:child.update({"id":window["id"]+f"-part-{index}","parentWindowId":window["id"],
            "partitionSourceEntities":partitions[0]["sourceEntities"],
            "splitBasis":"actual paired 100mm source room partition ending at a measured cap/frame line retained inside the long two-room window symbol; wide projecting pilasters remain separate source construction"})
        room=bedroom_at_window(child,data["rooms"])
        if room:child.update({"roomId":room["id"],"roomSourceEntity":room["sourceEntity"],"paneCount":2,
                             "paneBasis":"two vertical panes per room in user B6 room photograph "+USER_ROOM_PHOTO_SHA256})
        children.append(child)
    return children,geom.union([item["geometry"] for item in partitions])


def opening_descriptors(floor, data, wall, mezz, doors):
    windows, duplicates = geom.windows_from_lines(data["lines"], floor)
    openings,window_descriptors = [],[]
    for kind, descriptions in [("door", doors), ("window", windows)]:
        for item in descriptions:
            a,b = (item["hinge"],item["closedEnd"]) if kind == "door" else (item["a"],item["b"])
            point = Point((np.asarray(a)+b)/2)
            key = floor_key(floor,point,mezz);height=level(key)
            cap = (level("n07.westHeadRoof" if point.x<35 else "n07.eastHeadRoof")-SLAB) if floor=="n07" else ceiling(key)
            bottom,top = geom.opening_vertical_span(kind,height,cap)
            lo,hi,basis=geom.opening_wall_span(a,b,wall,.13 if kind=="door" else .30)
            bridge=geom.oriented_rectangle(a,b,lo,hi,extend=.008)
            item.update({"levelKey":key,"bottom":bottom,"top":top,"depth":round(hi-lo,4),"normalOffset":round((lo+hi)/2,4),
                         "depthBasis":basis,"heightBasis":HEIGHT_BASIS,"ceilingElevation":cap})
            cut=geom.opening_cut(a,b,lo,hi,measured_span=True)
            if kind=="window":
                children,partition=split_bedroom_window(item,data)
                window_descriptors+=children
                cut=geom.clean(cut.difference(partition))
            openings.append({**item,"kind":kind,"bridge":bridge,"cut":cut})
    return openings, window_descriptors, duplicates


def basement_soffits(data, interior):
    masks = []
    for room_id, side in [("872","west"),("8EB","east")]:
        room=next(room for room in data["rooms"] if room["sourceEntity"]==room_id)
        flight=next(plan["segments"][0] for plan in interior["plans"] if plan["id"]==f"n01-{side}-centre-route")
        shape=Polygon([flight["frontEdgesCad"][0][0],flight["frontEdgesCad"][0][1],flight["frontEdgesCad"][-1][1],flight["frontEdgesCad"][-1][0]])
        masks.append({"geometry":shape.intersection(room["geometry"].buffer(.2)),"id":"p01-"+room["id"]+"-soffit",
            "ceilingPlane":geom.stair_soffit_plane({**flight,"a":flight["a"],"b":flight["b"]},levels=interior["levels"]),
            "sourceEntities":[room_id]+flight["sourceEntities"],"room":room})
    return masks


def terrace_soffit_walls(floor, wall, mezz, openings, features):
    """The exterior P01 shell terminates below its actual concrete cover.

    Its former generic next-mezzanine cap projected 0.28m above that roof and
    into a capsule standing on the terrace. Keep the inner wall/door sill and
    all plan XY; only the CAD exterior cover footprint constrains this cap.
    """
    if floor!='p01':return wall,[]
    terrace=next((item for item in features if item['id']=='b06-east-mezz-terrace'),None)
    if terrace is None:return wall,[]
    covered=geom.clean(wall.intersection(terrace['geometry']))
    solids=[]
    for shape,upper in geom.split_zone_geometry(covered,mezz):
        if shape.is_empty:continue
        key='p01.'+('mezzanine' if upper else 'main')
        parts=geom.wall_bands(shape,openings,level(key),min(ceiling(key),terrace['bottom']),
                              'p01-terrace-soffit-'+('mezz' if upper else 'main'))
        for part in parts:
            part['sourceStructure']={'cover':terrace['id'],'sourceEntities':terrace['sourceEntities'],
                'basis':'exterior basement wall under the identified CAD/IPR terrace; cap at actual cover underside, no threshold or plan shift'}
        solids+=parts
    return geom.clean(wall.difference(covered)),solids


def room_floor_finishes(rooms, solids):
    """Only actual same-height floor slabs, never accounting stair polygons."""
    support={}
    for room in rooms:
        height=level(room["levelKey"])
        if height not in support:
            support[height]=geom.union([Polygon(solid["loops"][0],solid["loops"][1:]) for solid in solids
                if solid["role"]=="slab" and solid["material"]=="floor" and abs(solid["top"]-height)<.001])
        shape=geom.clean(Polygon(room["loops"][0],room["loops"][1:]).intersection(support[height]))
        # The two basement corridor accounting areas include the separate
        # measured understair rooms. Keep the CAD records, give their finishes
        # a single owner, and never subtract a room at a different elevation.
        understair={'8F6':'8EB','865':'872'}.get(room.get('sourceEntity'))
        if understair and room.get('usage')=='corridor':
            for other in rooms:
                if other.get('sourceEntity')==understair and other['levelKey']==room['levelKey']:
                    shape=geom.clean(shape.difference(Polygon(other['loops'][0],other['loops'][1:])))
        # Reuse the solid serializer's constrained triangulation and its area /
        # hole checks; discard the temporary volume descriptor entirely.
        room["finishTriangles"]=[triangle for part in geom.serialize_solids(shape,"room-finish","surface",0,1)
                                 for triangle in part["triangles"]]
        room["finishAreaM2"]=round(sum(Polygon(triangle).area for triangle in room["finishTriangles"]),6)
        room["finishBasis"]="source room polygon intersected with actual same-elevation floor slab tops; stair holes, landings, canopy and other levels excluded; CAD XY metres"
        if understair:room['finishBasis']+='; separately identified understair room '+understair+' owns its overlap'


def bathroom_shower_dividers(data):
    """Only the two measured internal T partitions between three source trays."""
    strong=[line for line in data['lines'] if line.layer==geom.STRONG]
    result=[]
    for room in data['rooms']:
        showers=sorted([q for q in room.get('sanitaryFixtures',[]) if q['kind']=='shower'],key=lambda q:q['centerCad'][0])
        if room.get('usage')!='bathroom' or not showers:continue
        if len(showers)!=3:raise ValueError('Changed source shower group '+room['id'])
        sign=showers[0]['facingCad'][1]
        if abs(sign)!=1:raise ValueError('Unsupported source shower orientation')
        front=showers[0]['boundsCad'][3 if sign>0 else 1]
        for index,(left,right) in enumerate(zip(showers,showers[1:])):
            mid=(left['centerCad'][0]+right['centerCad'][0])/2
            bars=[line for line in strong if abs(line.a[1]-line.b[1])<.002 and .50<line.length<.70
                  and abs((line.a[0]+line.b[0])/2-mid)<.20 and .04<(line.a[1]-front)*sign<.20]
            if len(bars)!=1:raise ValueError('Unproven shower T crossbar '+room['id'])
            bar=bars[0];caps=[];back=[]
            for point in (bar.a,bar.b):
                options=[line for line in strong if .09<line.length<.11 and abs(line.a[0]-line.b[0])<.002
                         and min(np.linalg.norm(point-line.a),np.linalg.norm(point-line.b))<.002]
                if len(options)!=1:raise ValueError('Missing measured shower crossbar cap')
                cap=options[0];caps.append(cap);back.append(max((cap.a,cap.b),key=lambda p:np.linalg.norm(point-p)))
            back_y=float(np.mean([p[1] for p in back]))
            stems=[line for line in strong if .80<line.length<1.01 and abs(line.a[0]-line.b[0])<.002
                   and abs(line.a[0]-mid)<.10 and min(abs(line.a[1]-back_y),abs(line.b[1]-back_y))<.002]
            if len(stems)!=2:raise ValueError('Unproven internal shower stem '+room['id'])
            stem=geom.parallel_strip(*stems,min_width=.09,max_width=.11)
            if stem is None:raise ValueError('Invalid source shower stem width')
            shape=geom.clean(Polygon([bar.a,bar.b,back[1],back[0]]).union(stem))
            result.append({'id':room['id']+f'-shower-divider-{index}','geometry':shape,'room':room,
                'sourceEntities':[bar.id]+[q.id for q in caps+stems],
                'photoSha256':USER_BATHROOM_PHOTO_SHA256,'modeledHeight':2.05,
                'basis':'actual internal T crossbar and paired stem only; perimeter/back walls and 0.50m plan gaps unchanged; 2.05m height above room floor interpreted from user bathroom photo, not CAD Z'})
    return result


def capped_shower_walls(floor,data,wall,mezz,openings):
    parts=[];notes=[]
    for divider in bathroom_shower_dividers(data):
        shape=geom.clean(wall.intersection(divider['geometry']));wall=geom.clean(wall.difference(divider['geometry']))
        key=floor_key(floor,divider['room']['geometry'].representative_point(),mezz);bottom=level(key);top=min(ceiling(key),bottom+2.05)
        solids=geom.wall_bands(shape,openings,bottom,top,floor+'-'+divider['id'])
        note={k:v for k,v in divider.items() if k not in ('geometry','room')}|{'levelKey':key,'top':top,'bounds':list(divider['geometry'].bounds)}
        for solid in solids:solid['sourceStructure']=note
        parts+=solids;notes.append(note)
    return wall,parts,notes


def prepare_floor(floor, data, doors, interior, exterior, cross_portals=(), features=()):
    graphics=graphics_mask(floor)
    excluded = {line.id for line in data["lines"] if line.layer==geom.WEAK and graphics.covers(line.line)} if floor!="n07" else set()
    if floor=="n01":excluded |= ENTRY_GRAPHICS | TERRACE_GRAPHICS
    lines=[line for line in data["lines"] if line.id not in excluded]
    if floor=="n07":
        # N07 also draws the broad roof perimeter/parapet in WEAK. Only the
        # two measured head enclosures may be extruded to head-roof height.
        head_domain=data["roomUnion"].buffer(.50,join_style=2)
        lines=[line for line in lines if head_domain.covers(line.line)]
    conflicts=[]
    wall,paired,pairs=geom.pair_walls(lines,data["roomUnion"],conflicts)
    cores=[{"id":side,"bounds":core_spec(floor,side)["bounds"],
            "holeLoops":[geom.coords(list(box(*core_spec(floor,side)["bounds"]).exterior.coords)[:-1])]}
           for side in CORE] if floor!="n07" else []
    wall,boundary,unresolved=geom.inferred_boundary_walls(lines,wall,data["roomUnion"],cores)
    wall,junctions=geom.close_wall_junctions(lines,wall,data["roomUnion"])
    wall,source_joins=complete_b6_wall_joins(floor,lines,wall,data["roomUnion"])
    panel=retaining_panel(floor,lines)
    mezz=mezzanine_region(floor,data)
    openings,windows,duplicates=opening_descriptors(floor,data,wall,mezz,doors)
    wall=geom.union([wall]+[item["bridge"] for item in openings])
    if panel is not None:wall=geom.clean(wall.difference(panel["geometry"]))
    local_portals=[portal for portal in cross_portals if portal["floor"]==floor]
    openings += [{"id":portal["id"],"kind":"cross-floor-door","bridge":GeometryCollection(),"cut":portal["geometry"],
                  "bottom":portal["bottom"],"top":portal["top"]} for portal in local_portals]
    envelope=base_footprint(data["roomUnion"],wall,openings)
    holes=stair_holes(floor)
    solids=[]
    chamber=buried_chamber(data,envelope) if floor=="p01" else None
    if chamber:
        wall=geom.clean(wall.difference(chamber["geometry"]))
        ring=chamber["geometry"].difference(chamber["roomGeometry"])
        solids+=geom.serialize_solids(ring,"p01-s201-buried","wall",chamber["bottom"],chamber["coverTop"]-.20,"concrete")
        solids+=geom.serialize_solids(chamber["geometry"],"p01-s201-cover","slab",chamber["coverTop"]-.20,chamber["coverTop"],"concrete")
    solids+=feature_solids(features,floor)
    wall,under_cover=terrace_soffit_walls(floor,wall,mezz,openings,features)
    solids+=under_cover
    if panel is not None:
        parts=geom.serialize_solids(panel["geometry"],panel["id"],"retaining-wall",panel["bottom"],panel["top"],"concrete")
        for part in parts:part["sourceStructure"]={key:value for key,value in panel.items() if key!="geometry"}
        solids+=parts
    if floor=="p01":
        for mask in basement_soffits(data,interior):
            part=wall.intersection(mask["geometry"]);wall=wall.difference(mask["geometry"])
            for solid in geom.wall_bands(part,openings,level("p01.main"),ceiling("p01.main"),mask["id"]):
                solid["ceilingPlane"]=mask["ceilingPlane"];solid["ceilingSourceEntities"]=mask["sourceEntities"]
                solids.append(solid)
    wall,shower_parts,shower_notes=capped_shower_walls(floor,data,wall,mezz,openings)
    solids+=shower_parts
    for shape,lower in geom.split_zone_geometry(wall,mezz):
        if shape.is_empty:continue
        key=floor+(".mezzanine" if lower else ".main")
        if floor=="n07":
            for side,region in [("west",box(-10,-20,35,40)),("east",box(35,-20,90,40))]:
                solids+=geom.wall_bands(shape.intersection(region),openings,level(key),level("n07."+side+"HeadRoof")-SLAB,floor+"-"+side+"-head")
        else:solids+=geom.wall_bands(shape,openings,level(key),ceiling(key),floor+("-mezz" if lower else ""))
    for handle,column in data["columns"]:
        for shape,lower in geom.split_zone_geometry(column,mezz):
            if shape.is_empty:continue
            key=floor+(".mezzanine" if lower else ".main")
            cap=level("n07.westHeadRoof" if shape.centroid.x<35 else "n07.eastHeadRoof")-SLAB if floor=="n07" else ceiling(key)
            solids+=geom.serialize_solids(shape,floor+"-col-"+handle,"column",level(key),cap,"concrete")
    for cover in data["columnCovers"]:
        for shape,lower in geom.split_zone_geometry(cover["geometry"],mezz):
            if shape.is_empty:continue
            key=floor+(".mezzanine" if lower else ".main")
            cap=level("n07.westHeadRoof" if shape.centroid.x<35 else "n07.eastHeadRoof")-SLAB if floor=="n07" else ceiling(key)
            parts=geom.serialize_solids(shape,floor+"-cover-"+cover["id"],"column-cover",level(key),cap)
            for part in parts:part.update({"sourceColumnId":cover["columnId"],"sourceProfileId":cover["id"]})
            solids+=parts
    if floor!="n07":
        slab=envelope.difference(holes)
        for shape,lower in geom.split_zone_geometry(slab,mezz):
            key=floor+(".mezzanine" if lower else ".main");height=level(key)
            landings=[Polygon(item["loops"][0],item["loops"][1:]) for plan in interior["plans"]+exterior["plans"] for item in plan["landings"]
                      if item["ownerFloor"]==floor and abs(exterior["levels"][item["levelKey"]]-height)<1e-6]
            shape=shape.difference(geom.union(landings))
            shape=clip_slab_at_portals(shape,height-SLAB,height,local_portals)
            shape=reserve_exterior_support(shape,features,floor,height)
            solids+=geom.serialize_solids(shape,floor+("-mezz" if lower else ""),"slab",height-SLAB,height,"floor")
        if floor=="p01":
            for mask in basement_soffits(data,interior):
                room=mask["room"]
                solids+=geom.serialize_solids(room["geometry"].intersection(holes),"p01-"+room["id"],"slab",level("p01.main")-SLAB,level("p01.main"),"floor")
    rooms=[{"id":room["id"],"sourceEntity":room["sourceEntity"],"bounds":list(room["geometry"].bounds),
            **{key:room[key] for key in ("usage","sourceBasis","usageBasis","usageSourceEntities","usagePhotoSha256","sanitaryFixtures") if key in room},
            "levelKey":floor_key(floor,room["geometry"].representative_point(),mezz),
            "loops":[geom.coords(list(poly.exterior.coords)[:-1])]+[geom.coords(list(ring.coords)[:-1]) for ring in poly.interiors]}
           for room in data["rooms"] for poly in geom.polygons(room["geometry"])]
    room_floor_finishes(rooms,solids)
    metadata={"id":floor,"elevation":LEVELS[floor]["main"],"levelElevations":LEVELS[floor],"levelKind":"roof" if floor=="n07" else "occupied-floor",
        "solids":solids,"doors":doors,"windows":windows,"stairCores":cores,"rooms":rooms,"heightRationale":HEIGHT_BASIS,
        "ceilingElevation":ceiling(floor+".main") if floor!="n07" else None,
        "levelCeilings":{key:ceiling(floor+"."+key) for key in LEVELS[floor]} if floor!="n07" else {},
        "levelRegions":[{"levelKey":floor+".mezzanine","loops":[geom.coords(list(poly.exterior.coords)[:-1])]+[geom.coords(list(ring.coords)[:-1]) for ring in poly.interiors]}
                        for poly in geom.polygons(mezz.intersection(envelope))]}
    metadata["crossFloorPortals"]=[{key:value for key,value in portal.items() if key!="geometry"}
                                    | {"loops":[geom.coords(list(poly.exterior.coords)[:-1])]}
                                    for portal in local_portals for poly in geom.polygons(portal["geometry"])]
    metadata["exteriorFeatures"]=[{key:value for key,value in item.items() if key!="geometry"}
                                  | {"loops":[geom.coords(list(poly.exterior.coords)[:-1])]}
                                  for item in features if item["floor"]==floor for poly in geom.polygons(item["geometry"])]
    metadata["terrainPreservationAreas"]=[]
    metadata['showerPartitionCaps']=shower_notes
    if chamber:
        metadata["terrainPreservationAreas"]=[{key:value for key,value in chamber.items() if key not in ("geometry","roomGeometry")}
            | {"loops":[geom.coords(list(chamber["geometry"].exterior.coords)[:-1])]}]
        for room in rooms:
            if room["sourceEntity"]=="A5A":room.update({"spaceKind":"buried-chamber","habitable":False,"accessConfirmed":False,
                "ceilingElevation":chamber["coverTop"]-.20,"heightBasis":chamber["provenance"]})
    remaining,resolved=final_edge_coverage(unresolved,lines,solids)
    audit={"id":floor,"roomCount":len(data["rooms"]),"solidCount":len(solids),"sourceBounds":list(data["roomUnion"].bounds),
           "doorCount":len(doors),"windowCount":len(windows),"wallPairCount":pairs,"unresolvedStrongEdges":remaining,
           "earlyBoundaryCandidates":unresolved,"resolvedByLaterConstruction":resolved,
           "inferredBoundaries":boundary,"wallRoomConflicts":conflicts,"junctionRepairs":junctions,"excludedStairGraphics":sorted(excluded),
           "sourceBoundedJoins":source_joins,"retainingPanel":{key:value for key,value in panel.items() if key!="geometry"} if panel else None,
           "crossFloorPortals":metadata["crossFloorPortals"],
           "exteriorFeatures":metadata["exteriorFeatures"],"terrainPreservationAreas":metadata["terrainPreservationAreas"],"showerPartitionCaps":shower_notes,
           "duplicateWindowEntities":duplicates,"heightBasis":HEIGHT_BASIS}
    return metadata,audit,{"wall":wall,"footprint":envelope,"holes":holes,"rooms":data["rooms"],"openings":openings,"mezz":mezz}


def overlay_title(floor):
    return f"B6 {floor} — measured rooms, constructed walls and openings; stair space (violet), roof perimeter (blue)"


def draw_overlay(floor,drawing,output,roof_outline=None):
    """B6 view: explicit identity and full source roof, not B1's floor legend."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig,ax=plt.subplots(figsize=(16,10))
    if roof_outline is not None:
        for poly in geom.polygons(roof_outline):
            ax.fill(*poly.exterior.xy,color="#dfe9ed",zorder=0)
            ax.plot(*poly.exterior.xy,color="#246a95",linewidth=.9,zorder=1)
    for room in drawing["rooms"]:
        for poly in geom.polygons(room["geometry"]):
            ax.fill(*poly.exterior.xy,color="#f3f4f2",zorder=1)
            centre=poly.representative_point();ax.text(centre.x,centre.y,room["id"],fontsize=5,ha="center",zorder=5)
    for poly in geom.polygons(drawing["wall"]):
        ax.fill(*poly.exterior.xy,color="#3b493d",zorder=2)
        for ring in poly.interiors:ax.fill(*ring.xy,color="#f3f4f2",zorder=2)
        # Source partitions are often only 0.10m; outline the actual retained
        # polygon so they remain distinguishable from room accounting lines.
        ax.plot(*poly.exterior.xy,color="#26362a",linewidth=.35,zorder=3)
        for ring in poly.interiors:ax.plot(*ring.xy,color="#26362a",linewidth=.35,zorder=3)
    for opening in drawing["openings"]:
        visible_opening=opening["cut"] if opening["kind"]=="window" else opening["bridge"]
        for poly in geom.polygons(visible_opening):
            ax.fill(*poly.exterior.xy,color="#e2b477" if opening["kind"]=="door" else "#56b8ce",zorder=4)
    for solid in floor["solids"]:
        if solid["role"] in ("column","column-cover","retaining-wall"):
            ring=np.asarray(solid["loops"][0])
            ax.fill(ring[:,0],ring[:,1],color="#998c76" if solid["role"]=="retaining-wall" else "#28382d",zorder=3)
    for feature in floor.get("exteriorFeatures",[]):
        ring=np.asarray(feature["loops"][0]+[feature["loops"][0][0]])
        ax.plot(ring[:,0],ring[:,1],color="#30779a" if feature["role"]=="canopy" else "#9a7c35",linewidth=.8,zorder=6)
    for area in floor.get("terrainPreservationAreas",[]):
        ring=np.asarray(area["loops"][0]+[area["loops"][0][0]])
        ax.fill(ring[:,0],ring[:,1],color="#8ab083",alpha=.35,zorder=2)
        ax.plot(ring[:,0],ring[:,1],color="#477340",linestyle="--",linewidth=.8,zorder=6)
    for poly in geom.polygons(drawing["holes"]):ax.fill(*poly.exterior.xy,color="#9e84c2",alpha=.22,zorder=4)
    for poly in geom.polygons(drawing["footprint"]):ax.plot(*poly.exterior.xy,color="#64785b",linewidth=.4,zorder=5)
    ax.set_aspect("equal");ax.set_title(overlay_title(floor["id"]))
    ax.set_xlabel("Original B6 CAD x / 1000 [m]");ax.set_ylabel("Original B6 CAD y / 1000 [m]");ax.grid(alpha=.1)
    fig.tight_layout();fig.savefig(output/f"{floor['id']}-overlay.png",dpi=150);plt.close(fig)


def attach_roofs(floors,drawings,roof_source):
    roof=next(f for f in floors if f["id"]=="n07")
    outline=roof_source["roofOutline"]
    annex=outline.intersection(box(12,-7,20,.364404))
    if level("n07.main")==level("n07.annexRoof"):
        roof["solids"]+=geom.serialize_solids(outline,"n07-main-roof","slab",level("n07.main")-SLAB,level("n07.main"),"roof")
    else:
        roof["solids"]+=geom.serialize_solids(outline.difference(annex),"n07-main-roof","slab",level("n07.main")-SLAB,level("n07.main"),"roof")
        roof["solids"]+=geom.serialize_solids(annex,"n07-annex-roof","slab",level("n07.annexRoof")-SLAB,level("n07.annexRoof"),"roof")
    roof["roofOutlineSourceEntity"]=roof_source["roofOutlineEntity"]
    roof["roofHeightBasis"]="B6 n07 closed roof perimeter; IPR 2023 main and front annex roof at same world18.73-18.75m, provisional origin+0.73m; unequal head heights interpreted separately"
    roof["roofHeadFootprint"]=[]
    for side,mask in [("west",box(-10,-20,35,40)),("east",box(35,-20,90,40))]:
        shape=drawings["n07"]["footprint"].intersection(mask);key="n07."+side+"HeadRoof"
        roof["solids"]+=geom.serialize_solids(shape,"n07-"+side+"-head-roof","slab",level(key)-SLAB,level(key),"roof")
        roof["roofHeadFootprint"] += [{"levelKey":key,"loops":[geom.coords(list(p.exterior.coords)[:-1])]} for p in geom.polygons(shape)]


def prepare(source,output,audit_path,overlays=True):
    start_dependencies=dependencies();data=read_sources(source)
    doors,door_audits={},{}
    for floor in FLOORS:
        doors[floor],door_audits[floor]=doors_from_source(data[floor],floor)
        annotate_bedroom_door_pairs(data[floor],doors[floor])
    interior=stair_metadata(data);exterior=exterior_metadata(data,doors)
    cross_portals=upper_annex_portals(data["n06"],doors["n05"])
    features=n01_exterior_features(data["n01"],doors["n01"])
    floors,audits,drawings=[],[],{}
    for floor in FLOORS:
        prepared,audit,drawing=prepare_floor(floor,data[floor],doors[floor],interior,exterior,cross_portals,features)
        floors.append(prepared);audits.append(audit);drawings[floor]=drawing
        audit["doorSourceCorrections"]=door_audits[floor]
        print(f"{floor}: {len(prepared['solids'])} solids, {len(doors[floor])} doors",flush=True)
    attach_roofs(floors,drawings,data["n07"])
    height={"id":HEIGHT_MODEL_ID,"levels":LEVELS,"basis":HEIGHT_BASIS,"cadMeasuredZ":False,"photogrammetryCalibrationPending":True}
    recipe={"schemaVersion":1,"buildingId":"b06","osmId":53929071,"cadOrigin":CAD_ORIGIN,"heightModel":height,
        "generatorDependenciesSha256":start_dependencies,"floors":floors,"roofTransitions":[],"exteriorVoids":[],
        "interiorStairPlans":interior["plans"],"interiorStairObservations":interior["observations"],"interiorStairLevelEstimates":interior["levels"],
        "exteriorStairRoutes":exterior["plans"],"exteriorLevelAnchors":exterior["anchors"],"exteriorLevelEstimates":{},"terrainCutouts":exterior["terrainCutouts"],
        "terrainPreservationAreas":[item for floor in floors for item in floor["terrainPreservationAreas"]],"exteriorSigns":[rear_sign()],
        "sourceProvenance":{"files":[{k:v for k,v in data[f]["provenance"].items() if k!="titleBlock"} for f in FLOORS],
            "scales":{f:data[f]["scale"] for f in FLOORS},"sourceFilesEmbedded":False,"heightBasis":HEIGHT_BASIS,
            "horizontalBasis":"unshifted B6 CAD/1000; common original coordinates; no B1/B2 normalization"}}
    audit={"schemaVersion":1,"buildingId":"b06","status":"prepared-not-native-accepted","generatorDependenciesSha256":start_dependencies,
        "heightModel":height,"floors":audits,"limitations":["No measured interior section; heights pending IPR calibration",
            "Roof heads do not imply accessible invented roof flights","Original CAD is historical and explicitly not newly surveyed",
            "Native model/doorway/stair/terrain acceptance is required; preparation does not prove player reachability"]}
    for floor,audit_floor in zip(floors,audits):audit_floor["solidCount"]=len(floor["solids"])
    if dependencies()!=start_dependencies:raise RuntimeError("B6 generator/helper changed during preparation")
    output.mkdir(parents=True,exist_ok=True)
    if overlays:
        for floor in floors:draw_overlay(floor,drawings[floor["id"]],output,data["n07"]["roofOutline"] if floor["id"]=="n07" else None)
    encoded=json.dumps(recipe,ensure_ascii=False,separators=(",",":"));audit["recipeSha256"]=hashlib.sha256(encoded.encode()).hexdigest()
    (output/"recipe.json").write_text(encoded,encoding="utf8")
    audit_path.parent.mkdir(parents=True,exist_ok=True);audit_path.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    return recipe,audit


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--source",type=Path,required=True)
    parser.add_argument("--output",type=Path,default=ROOT/".cache/cad-buildings-20261024/b06-preparation")
    parser.add_argument("--audit",type=Path,default=ROOT/"docs/reality-pack/cad-buildings/b06/preparation-audit.json")
    parser.add_argument("--no-overlays",action="store_true");args=parser.parse_args()
    prepare(args.source,args.output,args.audit,not args.no_overlays)


if __name__=="__main__":main()
