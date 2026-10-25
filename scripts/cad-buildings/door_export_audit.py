"""Pure validation of the currently authored closed CAD door mesh schema.

No Blender import, mesh mutation, pose inference, or replacement geometry.
The caller supplies evaluated vertices in game/model X,Y,Z metres and original
native object/root matrices. Unsupported edits fail before publication.
"""
from collections import Counter
import math


IDENTITY_MATRIX = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))
_ROLES = {"door-leaf", "door-leaf-frame", "door-leaf-glass", "door-leaf-gasket", "door-handle"}


def _fail(context, message):
    raise ValueError("Native closed door " + context + ": " + message)


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _vector(value, context):
    if not isinstance(value, dict) or not all(_finite(value.get(k)) for k in ("x", "y", "z")):
        _fail(context, "invalid finite XYZ metadata")
    return tuple(float(value[k]) for k in ("x", "y", "z"))


def _identity(matrix, context):
    if (not isinstance(matrix, (list, tuple)) or len(matrix) != 4
            or any(not isinstance(row, (list, tuple)) or len(row) != 4 for row in matrix)
            or any(not _finite(matrix[i][j]) for i in range(4) for j in range(4))):
        _fail(context, "missing/invalid native 4x4 matrix")
    if any(abs(matrix[i][j] - IDENTITY_MATRIX[i][j]) > 1e-8 for i in range(4) for j in range(4)):
        _fail(context, "unsupported native transform; restore the authored root/object pose before export")


def _local(point, center, yaw):
    x, y, z = (point[i] - center[i] for i in range(3))
    c, s = math.cos(yaw), math.sin(yaw)
    return c*x-s*z, y, s*x+c*z


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _box(center, half):
    return tuple(center), tuple(half)


def _triangle_corners(points, box, tolerance):
    """Return corners only for this exact authored cuboid face, not its AABB."""
    center, half = box
    corners = []
    for point in points:
        bits = []
        for axis in range(3):
            delta = point[axis]-center[axis]
            if abs(delta+half[axis]) <= tolerance:
                bits.append(0)
            elif abs(delta-half[axis]) <= tolerance:
                bits.append(1)
            else:
                return None
        corners.append(tuple(bits))
    if len(set(corners)) != 3:
        return None
    planes = [axis for axis in range(3) if len({p[axis] for p in corners}) == 1]
    return (corners, planes[0]) if len(planes) == 1 else None


def _validate_boxes(points, indices, boxes, tolerance, context):
    triangles = [[] for _ in boxes]
    referenced = set()
    for start in range(0, len(indices), 3):
        ids = indices[start:start+3]
        referenced.update(ids)
        actual = [points[i] for i in ids]
        matches = [(i, match) for i, box in enumerate(boxes)
                   if (match := _triangle_corners(actual, box, tolerance)) is not None]
        if len(matches) != 1:
            _fail(context, "actual triangle does not match one supported closed panel/handle box; stale pose or vertex edit")
        index, (corners, axis) = matches[0]
        triangles[index].append((corners, axis))
    if len(referenced) != len(points):
        _fail(context, "unused vertices in a moving part; remove stale geometry explicitly")
    for box_index, faces in enumerate(triangles):
        center, half = boxes[box_index]
        edges, plane_areas, seen = Counter(), Counter(), set()
        for corners, axis in faces:
            key = tuple(sorted(corners))
            if key in seen:
                _fail(context, "duplicate closed panel triangle")
            seen.add(key)
            vertices = [tuple(center[a]+half[a]*(2*p[a]-1) for a in range(3)) for p in corners]
            ab = [vertices[1][a]-vertices[0][a] for a in range(3)]
            ac = [vertices[2][a]-vertices[0][a] for a in range(3)]
            normal = _cross(ab, ac)
            sign = 2*corners[0][axis]-1
            if normal[axis]*sign <= 0:
                _fail(context, "inward or collapsed closed panel face")
            plane_areas[(axis, sign)] += abs(normal[axis])/2
            for a, b in zip(corners, corners[1:]+corners[:1]):
                edges[tuple(sorted((a, b)))] += 1
        if not edges or any(count != 2 for count in edges.values()):
            _fail(context, "closed panel has missing faces or nonmanifold edges")
        for axis in range(3):
            other = [i for i in range(3) if i != axis]
            expected = 4*half[other[0]]*half[other[1]]
            for sign in (-1, 1):
                if abs(plane_areas[(axis, sign)]-expected) > max(1e-10, expected*1e-7):
                    _fail(context, "closed panel face coverage differs from the physical definition")


def _mesh(part, center, yaw, context):
    positions, indices = part.get("positions"), part.get("indices")
    if not isinstance(positions, (list, tuple)) or not positions:
        _fail(context, "missing actual evaluated positions")
    if _finite(positions[0]):
        if len(positions) % 3:
            _fail(context, "invalid flat position length")
        positions = [positions[i:i+3] for i in range(0, len(positions), 3)]
    if any(not isinstance(p, (list, tuple)) or len(p) != 3 or not all(_finite(v) for v in p) for p in positions):
        _fail(context, "nonfinite/invalid actual evaluated vertex")
    if (not isinstance(indices, (list, tuple)) or not indices or len(indices) % 3
            or any(not isinstance(i, int) or isinstance(i, bool) or i < 0 or i >= len(positions) for i in indices)):
        _fail(context, "invalid actual triangle indices")
    return [_local(p, center, yaw) for p in positions], indices


def validate_closed_door_export(definitions, parts, root_matrix=None, tolerance=2e-5):
    """Validate current authored closed geometry; return a small audit report.

    parts: {id, doorId, floor, role, collision, positions, indices, matrixLocal}.
    Positions are *evaluated* game/model XYZ triples (flat XYZ also accepted).
    Matrices are the original native nested 4x4 matrices, before axis conversion.
    Unclaimed static parts may omit geometry, but must retain their role/ID.
    Unsupported moving part types/edits raise actionable ValueError, never guess.
    """
    if not _finite(tolerance) or not 0 < tolerance <= 2e-5:
        _fail("export", "tolerance must be positive and cannot exceed 20 micrometres")
    if not isinstance(definitions, (list, tuple)) or not isinstance(parts, (list, tuple)):
        _fail("export", "definitions and parts must be lists")
    by_part = {}
    for part in parts:
        if not isinstance(part, dict) or not isinstance(part.get("id"), str) or not part["id"] or part["id"] in by_part:
            _fail("export", "duplicate/invalid actual part ID")
        by_part[part["id"]] = part
    if definitions:
        _identity(root_matrix, "root")
    claimed, door_ids, reports = set(), set(), []
    for definition in definitions:
        if not isinstance(definition, dict):
            _fail("definition", "invalid definition")
        door_id = definition.get("id")
        if not isinstance(door_id, str) or not door_id or door_id in door_ids:
            _fail("definition", "duplicate/invalid door ID")
        door_ids.add(door_id)
        if (any(not isinstance(definition.get(key), str) or not definition[key] for key in ("buildingId", "sourceDoorId", "floor"))
                or door_id != definition["buildingId"]+":"+definition["sourceDoorId"]):
            _fail(door_id, "invalid building/source/floor identity")
        pose, collider = definition.get("closedPose"), definition.get("collider")
        if not isinstance(pose, dict) or not isinstance(collider, dict):
            _fail(door_id, "invalid closed pose/collider metadata")
        center = _vector(pose.get("position"), door_id)
        yaw = pose.get("rotationY")
        half = _vector(collider.get("halfExtents"), door_id)
        if not _finite(yaw) or min(half) <= 0 or half[0] < .15 or definition.get("defaultOpen") is not False:
            _fail(door_id, "invalid authored closed box/default state")
        angle = definition.get("openAngle")
        if not _finite(angle) or not 0 < abs(angle) <= math.pi:
            _fail(door_id, "invalid opening angle")
        hinge = _local(_vector(definition.get("hingeModel"), door_id), center, yaw)
        handle = _local(_vector(definition.get("handleModel"), door_id), center, yaw)
        expected_hinge = (-half[0], -half[1], 0)
        expected_handle = (half[0]-.12, -half[1]+.9875, 0)
        if any(abs(a-b) > tolerance for a, b in zip(hinge, expected_hinge)):
            _fail(door_id, "hinge differs from the closed leaf's bottom hinge edge")
        if any(abs(a-b) > tolerance for a, b in zip(handle, expected_handle)):
            _fail(door_id, "handle metadata differs from the supported authored location")
        ids, collision_ids = definition.get("renderPartIds"), definition.get("collisionPartIds")
        if (not isinstance(ids, list) or not ids or any(not isinstance(p, str) for p in ids)
                or len(set(ids)) != len(ids) or claimed.intersection(ids)
                or not isinstance(collision_ids, list) or any(not isinstance(p, str) for p in collision_ids)
                or len(set(collision_ids)) != len(collision_ids)
                or not set(collision_ids).issubset(ids)):
            _fail(door_id, "invalid/duplicate render or collision ownership")
        selected = []
        for part_id in ids:
            part = by_part.get(part_id)
            context = door_id+" / "+part_id
            if not part:
                _fail(context, "missing actual render part")
            if (part.get("doorId") != door_id or part.get("floor") != definition.get("floor")
                    or not isinstance(part.get("collision"), bool)
                    or part["collision"] != (part_id in collision_ids)):
                _fail(context, "door/floor/collision ownership differs from metadata")
            _identity(part.get("matrixLocal"), context)
            selected.append(part)
        claimed.update(ids)
        roles = [part.get("role") for part in selected]
        if any(not isinstance(role, str) for role in roles):
            _fail(door_id, "invalid actual part role")
        glass = "door-leaf-glass" in roles
        required = {"door-leaf-frame", "door-leaf-glass", "door-leaf-gasket", "door-handle"} if glass else {"door-leaf", "door-handle"}
        if set(roles) != required or len(roles) != len(required):
            _fail(door_id, "unsupported closed leaf schema or missing/duplicate body/hardware role")
        if abs(half[2]-(.05 if glass else .019)) > tolerance:
            _fail(door_id, "physical thickness differs from the supported wood/glass leaf")
        hx, hy, hz = half
        boxes = {"door-leaf": [_box((0, 0, 0), half)],
                 "door-handle": [_box((handle[0]-.055, handle[1], sign*.032), (.055, .0125, .008)) for sign in (-1, 1)]}
        if glass:
            if min(hx, hy) <= .057:
                _fail(door_id, "glazed leaf too small for authored frame")
            boxes["door-leaf-glass"] = [_box((0, 0, 0), (hx-.045, hy-.045, .004))]
            boxes["door-leaf-gasket"] = [_box((0, sign*(hy-.051), 0), (hx-.045, .006, .009)) for sign in (-1, 1)]
            boxes["door-leaf-frame"] = ([_box((sign*(hx-.0225), 0, 0), (.0225, hy, .05)) for sign in (-1, 1)]
                + [_box((0, sign*(hy-.0225), 0), (hx, .0225, .05)) for sign in (-1, 1)])
            if 2*hx > 1.6:
                boxes["door-leaf-frame"].append(_box((0, 0, 0), (.018, hy-.045, .0375)))
        triangle_count = 0
        for part in selected:
            context = door_id+" / "+part["id"]
            points, indices = _mesh(part, center, yaw, context)
            _validate_boxes(points, indices, boxes[part["role"]], tolerance, context)
            triangle_count += len(indices)//3
        reports.append({"id": door_id, "kind": "glass" if glass else "wood", "parts": len(selected), "triangles": triangle_count})
    for part in parts:
        if part["id"] not in claimed and (part.get("doorId") is not None or (definitions and part.get("role") in _ROLES)):
            _fail(part["id"], "unclaimed moving door part")
    return {"status": "pass", "doors": len(reports), "parts": len(claimed), "toleranceMetres": tolerance, "results": reports}
