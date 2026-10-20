"""Read-only GLB inventory: exact duplicate mesh definitions, not GPU timing.

Run from the repository root with an explicit GLB and output JSON path. The
destination must be inside this task's evidence directory. No model is modified.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys

source = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve()
owned = Path(__file__).resolve().parent
if not destination.is_relative_to(owned):
    raise ValueError("Output must remain inside the reserved evidence directory")
raw = source.read_bytes()
magic, version, total = struct.unpack_from("<III", raw)
if (magic, version, total) != (0x46546C67, 2, len(raw)):
    raise ValueError("Invalid GLB header")
offset, chunks = 12, {}
while offset < len(raw):
    length, kind = struct.unpack_from("<II", raw, offset)
    offset += 8
    chunks[kind] = raw[offset:offset + length]
    offset += length
document = json.loads(chunks[0x4E4F534A])
binary = chunks[0x004E4942]
components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
widths = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}


def accessor(index):
    descriptor = document["accessors"][index]
    if "sparse" in descriptor:
        raise ValueError("Sparse accessors are outside this exact-byte audit")
    view = document["bufferViews"][descriptor["bufferView"]]
    if view.get("buffer", 0) != 0:
        raise ValueError("External buffers are outside this GLB audit")
    element = components[descriptor["type"]] * widths[descriptor["componentType"]]
    start = view.get("byteOffset", 0) + descriptor.get("byteOffset", 0)
    stride = view.get("byteStride", element)
    packed = b"".join(binary[start + n * stride:start + n * stride + element]
                      for n in range(descriptor["count"]))
    metadata = {k: descriptor.get(k) for k in ("count", "type", "componentType", "normalized")}
    return {"descriptor": metadata, "sha256": hashlib.sha256(packed).hexdigest()}


groups = {}
triangles = primitives = position_elements = 0
for index, mesh in enumerate(document["meshes"]):
    content = []
    for primitive in mesh["primitives"]:
        primitives += 1
        mode = primitive.get("mode", 4)
        count = document["accessors"][primitive["indices"]]["count"]
        if mode == 4:
            triangles += count // 3
        position_elements += document["accessors"][primitive["attributes"]["POSITION"]]["count"]
        content.append({"mode": mode, "material": primitive.get("material"),
                        "attributes": {name: accessor(value) for name, value in sorted(primitive["attributes"].items())},
                        "indices": accessor(primitive["indices"]),
                        "targets": [{name: accessor(value) for name, value in sorted(target.items())}
                                    for target in primitive.get("targets", [])]})
    fingerprint = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
    groups.setdefault(fingerprint, []).append({"index": index, "name": mesh.get("name")})

duplicates = [members for members in groups.values() if len(members) > 1]
result = {
    "inputSha256": hashlib.sha256(raw).hexdigest(),
    "inputBytes": len(raw),
    "meshDefinitions": len(document["meshes"]),
    "exactUniqueMeshDefinitions": len(groups),
    "redundantExactDefinitions": sum(len(group) - 1 for group in duplicates),
    "primitives": primitives,
    "triangles": triangles,
    "positionElements": position_elements,
    "materials": len(document.get("materials", [])),
    "textures": len(document.get("textures", [])),
    "duplicateGroups": duplicates,
    "scope": "Exact primitive attribute/index bytes and material references; node transforms intentionally excluded",
    "limits": ["No geometry modified or deduplicated", "No predicted bytes saved or FPS benefit",
               "Not runtime draw-call measurement", "Bitwise inequality does not prove visually different geometry"]
}
destination.write_bytes((json.dumps(result, indent=2) + "\n").encode())
print(json.dumps({key: value for key, value in result.items() if key != "duplicateGroups"}))
