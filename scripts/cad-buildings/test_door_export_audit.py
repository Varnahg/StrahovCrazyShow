"""Small geometry regressions plus read-only validation of the published GLB."""
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import unittest

from door_export_audit import IDENTITY_MATRIX, validate_closed_door_export


def world(point, center, yaw):
    x, y, z = point
    c, s = math.cos(yaw), math.sin(yaw)
    return [center[0]+c*x+s*z, center[1]+y, center[2]-s*x+c*z]


def box_mesh(center, half, pose, yaw):
    vertices = [[center[i]+half[i]*(1 if bits & (1 << i) else -1) for i in range(3)] for bits in range(8)]
    indices = []
    for axis in range(3):
        a, b = [i for i in range(3) if i != axis]
        for side in (0, 1):
            face = [(side << axis) | (x << a) | (y << b) for x, y in [(0, 0), (1, 0), (1, 1), (0, 1)]]
            p, q, r = [vertices[i] for i in face[:3]]
            u, v = [q[i]-p[i] for i in range(3)], [r[i]-p[i] for i in range(3)]
            normal = (u[(axis+1) % 3]*v[(axis+2) % 3]-u[(axis+2) % 3]*v[(axis+1) % 3])
            if normal*(1 if side else -1) < 0:
                face.reverse()
            indices += [face[0], face[1], face[2], face[0], face[2], face[3]]
    return [world(p, pose, yaw) for p in vertices], indices


def fixture(glass=False, width=1., yaw=.37):
    center, hx, hy = [12, 4.0475, -23], width/2, 1.0325
    xyz = lambda p: dict(zip(("x", "y", "z"), world(p, center, yaw)))
    definition = {"id": "b06:test", "buildingId": "b06", "sourceDoorId": "test", "floor": "n02",
                  "closedPose": {"position": dict(zip(("x", "y", "z"), center)), "rotationY": yaw},
                  "hingeModel": xyz((-hx, -hy, 0)), "handleModel": xyz((hx-.12, -.045, 0)),
                  "collider": {"halfExtents": {"x": hx, "y": hy, "z": .05 if glass else .019}},
                  "defaultOpen": False, "openAngle": math.pi/2, "renderPartIds": [], "collisionPartIds": []}
    shapes = {"door-handle": [((hx-.175, -.045, sign*.032), (.055, .0125, .008)) for sign in (-1, 1)]}
    if glass:
        shapes.update({"door-leaf-glass": [((0, 0, 0), (hx-.045, hy-.045, .004))],
                       "door-leaf-gasket": [((0, sign*(hy-.051), 0), (hx-.045, .006, .009)) for sign in (-1, 1)],
                       "door-leaf-frame": [((sign*(hx-.0225), 0, 0), (.0225, hy, .05)) for sign in (-1, 1)]
                           + [((0, sign*(hy-.0225), 0), (hx, .0225, .05)) for sign in (-1, 1)]})
        if width > 1.6:
            shapes["door-leaf-frame"].append(((0, 0, 0), (.018, hy-.045, .0375)))
    else:
        shapes["door-leaf"] = [((0, 0, 0), (hx, hy, .019))]
    parts = []
    for role, boxes in shapes.items():
        part = {"id": "test:"+role, "doorId": definition["id"], "floor": "n02", "role": role,
                "collision": False, "positions": [], "indices": [], "matrixLocal": copy.deepcopy(IDENTITY_MATRIX)}
        for origin, half in boxes:
            positions, indices = box_mesh(origin, half, center, yaw)
            part["indices"] += [i+len(part["positions"]) for i in indices]
            part["positions"] += positions
        parts.append(part)
        definition["renderPartIds"].append(part["id"])
    return [definition], parts


def node_matrix(node):
    if "matrix" in node:
        return [[node["matrix"][4*c+r] for c in range(4)] for r in range(4)]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    scale, translation = node.get("scale", [1, 1, 1]), node.get("translation", [0, 0, 0])
    rotation = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]
    return [[rotation[r][c]*scale[c] for c in range(3)]+[translation[r]] for r in range(3)]+[[0, 0, 0, 1]]


def glb_parts(path, identity):
    raw = path.read_bytes()
    if raw[:4] != b"glTF":
        raise ValueError("Actual GLB bytes are required, not an LFS pointer")
    document = json.loads(raw[20:20+struct.unpack_from("<I", raw, 12)[0]])
    binary = raw[28+struct.unpack_from("<I", raw, 12)[0]:]
    def accessor(index):
        item = document["accessors"][index]
        view = document["bufferViews"][item["bufferView"]]
        count = {"VEC3": 3, "SCALAR": 1}[item["type"]]
        code, size = {5126: ("f", 4), 5125: ("I", 4), 5123: ("H", 2)}[item["componentType"]]
        stride = view.get("byteStride", count*size)
        offset = view.get("byteOffset", 0)+item.get("byteOffset", 0)
        return [list(struct.unpack_from("<"+code*count, binary, offset+i*stride)) for i in range(item["count"])]
    root = next(node for node in document["nodes"] if node.get("name") == identity)
    result = []
    for index, node in enumerate(document["nodes"]):
        if "mesh" not in node:
            continue
        extra = node.get("extras", {})
        part = {"id": node["name"], "doorId": extra.get("doorId"), "floor": extra.get("floorId"),
                "role": extra.get("role"), "collision": extra.get("collision"), "matrixLocal": node_matrix(node)}
        if extra.get("doorId") is not None:
            if index not in root.get("children", []):
                raise ValueError("Moving part is not a direct child of the authored root")
            part.update(positions=[], indices=[])
            for primitive in document["meshes"][node["mesh"]]["primitives"]:
                if primitive.get("mode", 4) != 4:
                    raise ValueError("Unsupported actual GLB primitive")
                vertices = accessor(primitive["attributes"]["POSITION"])
                part["indices"] += [i[0]+len(part["positions"]) for i in accessor(primitive["indices"])]
                part["positions"] += vertices
        result.append(part)
    return result, node_matrix(root)


class DoorExportTests(unittest.TestCase):
    def validate(self, definitions, parts, root=IDENTITY_MATRIX):
        return validate_closed_door_export(definitions, parts, root)

    def test_actual_closed_wood_and_glass_accept_rotated_pose_without_mutation(self):
        for glass in (False, True):
            definitions, parts = fixture(glass)
            before = json.dumps([definitions, parts], sort_keys=True)
            report = self.validate(definitions, parts)
            self.assertEqual(report["doors"], 1)
            self.assertEqual(report["parts"], 4 if glass else 2)
            self.assertEqual(json.dumps([definitions, parts], sort_keys=True), before)

    def test_root_and_object_transforms_are_rejected_even_with_unchanged_vertices(self):
        for root_change in (False, True):
            definitions, parts = fixture()
            matrix = [list(row) for row in IDENTITY_MATRIX]
            matrix[0][3] = 1
            if not root_change:
                parts[1]["matrixLocal"] = matrix
            with self.assertRaisesRegex(ValueError, "unsupported native transform"):
                self.validate(definitions, parts, matrix if root_change else IDENTITY_MATRIX)
        definitions, parts = fixture()
        parts[1]["matrixLocal"] = node_matrix({"rotation": [0, math.sin(.1), 0, math.cos(.1)]})
        with self.assertRaisesRegex(ValueError, "unsupported native transform"):
            self.validate(definitions, parts)

    def test_edit_mode_translation_or_shape_edit_cannot_hide_behind_identity_matrix(self):
        for change in ("translate", "inset-corner", "delete-face", "duplicate-face", "flip-face"):
            definitions, parts = fixture()
            leaf = next(p for p in parts if p["role"] == "door-leaf")
            if change == "translate":
                for point in leaf["positions"]:
                    point[0] += .02
            elif change == "inset-corner":
                leaf["positions"][0][1] += .01
            elif change == "delete-face":
                leaf["indices"] = leaf["indices"][3:]
            elif change == "duplicate-face":
                leaf["indices"][-3:] = leaf["indices"][:3]
            else:
                leaf["indices"][:3] = reversed(leaf["indices"][:3])
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, "test:door-leaf"):
                self.validate(definitions, parts)

    def test_glass_frame_and_pane_are_checked_separately_from_hardware(self):
        for role in ("door-leaf-glass", "door-leaf-frame", "door-leaf-gasket", "door-handle"):
            definitions, parts = fixture(True)
            part = next(p for p in parts if p["role"] == role)
            part["positions"][0][1] += .01
            with self.subTest(role=role), self.assertRaisesRegex(ValueError, "test:"+role):
                self.validate(definitions, parts)

    def test_unchanged_combined_bounds_do_not_allow_hardware_to_mask_a_thinner_leaf(self):
        definitions, parts = fixture(yaw=0)
        bounds = lambda: [(min(p[a] for part in parts for p in part["positions"]), max(p[a] for part in parts for p in part["positions"])) for a in range(3)]
        before = bounds()
        leaf = next(p for p in parts if p["role"] == "door-leaf")
        for point in leaf["positions"]:
            point[2] = -23+(point[2]+23)*.5
        self.assertEqual(bounds(), before)
        with self.assertRaisesRegex(ValueError, "test:door-leaf"):
            self.validate(definitions, parts)

    def test_wide_glazed_leaf_requires_its_actual_middle_frame(self):
        definitions, parts = fixture(True, width=1.8)
        self.assertEqual(self.validate(definitions, parts)["doors"], 1)
        frame = next(p for p in parts if p["role"] == "door-leaf-frame")
        frame["positions"] = frame["positions"][:-8]
        frame["indices"] = frame["indices"][:-36]
        with self.assertRaisesRegex(ValueError, "missing faces"):
            self.validate(definitions, parts)

    def test_stale_hinge_or_handle_metadata_is_rejected(self):
        for field in ("hingeModel", "handleModel"):
            definitions, parts = fixture()
            definitions[0][field]["x"] += .03
            with self.assertRaisesRegex(ValueError, "hinge|handle"):
                self.validate(definitions, parts)

    def test_ownership_and_unsupported_roles_fail_closed(self):
        for change in ("missing", "duplicate", "orphan", "floor", "door", "collision", "role"):
            definitions, parts = fixture()
            if change == "missing":
                parts.pop()
            elif change == "duplicate":
                parts.append(copy.deepcopy(parts[0]))
            elif change == "orphan":
                part = copy.deepcopy(parts[0]);part["id"] = "orphan";parts.append(part)
            else:
                field = {"floor": "floor", "door": "doorId", "collision": "collision", "role": "role"}[change]
                parts[0][field] = True if change == "collision" else "foreign"
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.validate(definitions, parts)

    def test_nonfinite_or_loosened_tolerance_is_rejected(self):
        definitions, parts = fixture()
        parts[1]["positions"][0][0] = float("nan")
        with self.assertRaisesRegex(ValueError, "nonfinite"):
            self.validate(definitions, parts)
        definitions, parts = fixture()
        with self.assertRaisesRegex(ValueError, "tolerance"):
            validate_closed_door_export(definitions, parts, IDENTITY_MATRIX, .001)
        for field, value in (("closedPose", None), ("collider", None), ("floor", None), ("openAngle", float("nan")), ("collisionPartIds", [[]])):
            definitions, parts = fixture()
            definitions[0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.validate(definitions, parts)

    def test_current_actual_glb_and_collision_definitions_match(self):
        root = Path(__file__).resolve().parents[2]
        model_path = Path(os.environ.get("B06_MODEL_PATH", root/"shared/data/cad-buildings/b06.json"))
        glb_path = Path(os.environ.get("B06_GLB_PATH", root/"public/models/cad-buildings/b06.glb"))
        if not model_path.exists() or not glb_path.exists():
            if os.environ.get("B06_DOOR_EXPORT_ACCEPTANCE") == "1":
                self.fail("Current B6 model/GLB missing")
            self.skipTest("Current B6 asset unavailable")
        model = json.loads(model_path.read_text(encoding="utf8"))
        self.assertEqual(hashlib.sha256(glb_path.read_bytes()).hexdigest(), model["glbSha256"])
        parts, matrix = glb_parts(glb_path, model["identity"])
        report = self.validate(model["interactiveDoors"], parts, matrix)
        self.assertEqual(report["doors"], 475)
        self.assertEqual(sum(row["kind"] == "glass" for row in report["results"]), 6)
        self.assertEqual(report["parts"], 962)


if __name__ == "__main__":
    unittest.main()
