import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { B6_LAYOUT, B6_ROOM_AREAS } from "../shared/b6-interior";
import { B6_STAIR_MESHES } from "../shared/b6-stairs";
import { B6_BOXES } from "../shared/world";
import { createB6BoxFaceParts } from "../client/b6-reality";
import { verifyBuildingArchiveAttributes } from "./building-archive-transfer";
const folder = path.resolve("public/models/buildings");
const manifest = JSON.parse(
  readFileSync(path.join(folder, "manifest.json"), "utf8"),
);
const source = JSON.parse(
  readFileSync("assets/blender/buildings/source-plan.json", "utf8"),
);
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const textureHashes = new Map<string, string>();
const authoredTextureHash = (url: string) => {
  let hash = textureHashes.get(url);
  if (!hash) {
    hash = sha(readFileSync(path.resolve("public", url.slice(1))));
    textureHashes.set(url, hash);
  }
  return hash;
};
assert.equal(
  sha(readFileSync("assets/blender/buildings/source-plan.json")),
  manifest.sourcePlanSha256,
);
for (const [file, hash] of Object.entries(manifest.sourceHashes))
  assert.equal(sha(readFileSync(file)), hash, file);
if (source.partialUpdate) {
  for (const model of source.models) {
    if (model.identity.sourceId === source.partialUpdate.sourceId) continue;
    assert.equal(
      createHash("sha256").update(JSON.stringify(model)).digest("hex"),
      source.partialUpdate.retainedModelGeometryHashes[model.identity.key],
      `Unselected source geometry changed: ${model.identity.key}`,
    );
  }
}
const b6 = source.models.find(
  (model: any) => model.identity.sourceId === "53929071",
);
assert.deepEqual(
  b6.b6Layout.floorLevels,
  B6_LAYOUT.floorLevels,
  "B6 archive floor contract must match its current shared model",
);
assert.deepEqual(
  b6.b6Layout.modelRoomCountsByLevel,
  Object.fromEntries(
    B6_LAYOUT.floorLevels.map((level) => [
      level,
      B6_ROOM_AREAS.filter(
        (area) => area.level === level && area.kind === "bedroom",
      ).length,
    ]),
  ),
  "B6 archive room counts must be derived model counts, not a locked historical inventory",
);
const sourceStairParts = b6.parts.filter(
  (part: any) => part.sourcePack === "b6-photo-stairs",
);
const boxParts = b6.parts.filter(
  (part: any) => part.sourcePack === "b6-interior-schematic",
);
const expectedFaces = B6_BOXES.flatMap((box, index) =>
  box.kind === "glass" && box.role !== "exterior-entry"
    ? []
    : createB6BoxFaceParts(box).map((part) => `${index}:${part.surface}`),
);
const actualFaces: string[] = [];
let maxBoxSourceError = 0;
for (const part of boxParts) {
  assert.equal(
    part.sourceMetadata?.canonicalBoxFaces,
    true,
    "Archive must use the runtime face factory, not recreate complete boxes",
  );
  const expected: number[] = [];
  for (const face of part.sourceMetadata.sourceFaces) {
    actualFaces.push(`${face.boxIndex}:${face.surface}`);
    const geometry = createB6BoxFaceParts(B6_BOXES[face.boxIndex]).find(
      (p) => p.surface === face.surface,
    )!;
    assert.ok(
      geometry,
      "Archived box face must exist in canonical runtime geometry",
    );
    expected.push(...geometry.data.positions);
  }
  assert.equal(part.positions.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    const axis = i % 3,
      origin = [b6.origin.x, b6.origin.y, b6.origin.z][axis];
    maxBoxSourceError = Math.max(
      maxBoxSourceError,
      Math.abs(part.positions[i] + origin - expected[i]),
    );
  }
}
assert.deepEqual(
  actualFaces.sort(),
  expectedFaces.sort(),
  "Each canonical B6 box face is archived exactly once",
);
assert.ok(
  maxBoxSourceError < 1e-5,
  `B6 runtime/archive box positions differ by ${maxBoxSourceError}m`,
);
const archivedStairIds = sourceStairParts.flatMap(
  (part: any) => part.sourceMetadata.stairIds,
);
assert.deepEqual(
  [...archivedStairIds].sort(),
  B6_STAIR_MESHES.map((stair) => stair.id).sort(),
  "All source stair parts must be archived once despite per-floor material batching",
);
let maxStairSourceError = 0;
for (const part of sourceStairParts) {
  const sourcePositions: number[] = [],
    sourceIndices: number[] = [];
  for (const id of part.sourceMetadata.stairIds) {
    const stair = B6_STAIR_MESHES.find((item) => item.id === id)!;
    const offset = sourcePositions.length / 3;
    sourcePositions.push(...stair.positions);
    sourceIndices.push(...stair.indices.map((index) => index + offset));
  }
  assert.deepEqual(
    part.indices,
    sourceIndices,
    "Changed stair triangle topology",
  );
  assert.equal(part.positions.length, sourcePositions.length);
  for (let i = 0; i < sourcePositions.length; i += 3) {
    const expected = [
      sourcePositions[i] - b6.origin.x,
      sourcePositions[i + 1] + B6_LAYOUT.foundationOffset - b6.origin.y,
      sourcePositions[i + 2] - b6.origin.z,
    ];
    for (let axis = 0; axis < 3; axis++) {
      const error = Math.abs(part.positions[i + axis] - expected[axis]);
      maxStairSourceError = Math.max(maxStairSourceError, error);
      assert.ok(
        error < 0.00004,
        "Foundation offset applied twice or stair moved",
      );
    }
  }
}
let triangles = 0,
  vertices = 0,
  maxBoundsError = 0,
  zeroAreaTriangles = 0;
const rows = [];
const attributes = {
  vertices: 0,
  coloredVertices: 0,
  maxNormalError: 0,
  maxColorError: 0,
  maxUvError: 0,
};
for (const model of manifest.models) {
  const expected = source.models.find(
    (m: any) => m.identity.key === model.identity.key,
  );
  assert.ok(expected, `${model.id}: missing canonical source model`);
  const bytes = readFileSync(path.resolve("public", model.url.slice(1)));
  assert.equal(bytes.length, model.bytes);
  assert.equal(sha(bytes), model.sha256);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
  const binary = bytes.subarray(20 + length + 8);
  const root = json.scenes[json.scene ?? 0].nodes;
  assert.equal(root.length, 1, model.id);
  assert.equal(json.nodes[root[0]].extras.assetKey, model.identity.key);
  for (const node of json.nodes) {
    assert.equal(
      node.extras.assetKey,
      model.identity.key,
      `${model.id}: foreign object`,
    );
    assert.ok(
      !node.translation && !node.rotation && !node.scale && !node.matrix,
      `${model.id}: local archive geometry must not contain hidden transforms`,
    );
  }
  for (const view of json.bufferViews)
    assert.ok(
      view.getBuffer === undefined &&
        (view.byteOffset ?? 0) + view.byteLength <= binary.length,
    );
  const accessor = (id: number): number[][] => {
    const a = json.accessors[id],
      v = json.bufferViews[a.bufferView];
    const width: { [key: string]: number } = {
      SCALAR: 1,
      VEC2: 2,
      VEC3: 3,
      VEC4: 4,
    };
    const components = width[a.type],
      size =
        a.componentType === 5126 || a.componentType === 5125
          ? 4
          : a.componentType === 5123
            ? 2
            : 1;
    const stride = v.byteStride ?? components * size,
      start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
      result = [];
    for (let i = 0; i < a.count; i++) {
      const row = [];
      for (let j = 0; j < components; j++) {
        const at = start + i * stride + j * size;
        const n =
          a.componentType === 5126
            ? binary.readFloatLE(at)
            : a.componentType === 5125
              ? binary.readUInt32LE(at)
              : a.componentType === 5123
                ? binary.readUInt16LE(at)
                : binary.readUInt8(at);
        assert.ok(Number.isFinite(n), model.id);
        assert.ok(
          !a.normalized || a.componentType === 5121 || a.componentType === 5123,
          "Unsupported normalized accessor",
        );
        row.push(
          a.normalized ? n / (a.componentType === 5121 ? 255 : 65535) : n,
        );
      }
      result.push(row);
    }
    return result;
  };
  let count = 0;
  const bounds = [
    Infinity,
    -Infinity,
    Infinity,
    -Infinity,
    Infinity,
    -Infinity,
  ];
  const matchedSourceParts = new Set<string>();
  for (let meshIndex = 0; meshIndex < json.meshes.length; meshIndex++) {
    const mesh = json.meshes[meshIndex];
    const sourcePartName = json.nodes.find(
      (node: any) => node.mesh === meshIndex,
    )?.extras?.sourcePartName;
    const sourcePart = expected.parts.find(
      (part: any) => part.name === sourcePartName,
    );
    if (source.schemaVersion >= 2) {
      assert.ok(
        sourcePart,
        `${model.id}: missing full source part identity for ${mesh.name}`,
      );
      assert.ok(
        !matchedSourceParts.has(sourcePartName),
        `${model.id}: duplicate source part ${sourcePartName}`,
      );
      matchedSourceParts.add(sourcePartName);
      assert.equal(
        mesh.primitives.reduce(
          (sum: number, primitive: any) =>
            sum + json.accessors[primitive.indices].count,
          0,
        ),
        sourcePart.indices.length,
        `${model.id}: changed source part triangle count`,
      );
    }
    for (const primitive of mesh.primitives) {
      const positions = accessor(primitive.attributes.POSITION),
        indices = accessor(primitive.indices).flat();
      assert.equal(indices.length % 3, 0);
      assert.ok(indices.every((i) => i >= 0 && i < positions.length));
      if (source.schemaVersion >= 2) {
        assert.ok(
          primitive.attributes.NORMAL !== undefined,
          `${model.id}: lost authored normals`,
        );
        const normalAccessor = json.accessors[primitive.attributes.NORMAL];
        assert.equal(normalAccessor.type, "VEC3");
        assert.equal(normalAccessor.componentType, 5126);
        assert.ok(!normalAccessor.normalized);
        assert.equal(normalAccessor.count, positions.length);
        assert.equal(
          primitive.attributes.TANGENT,
          undefined,
          `${model.id}: tangents must not retain quantized shading normals`,
        );
        assert.equal(
          primitive.attributes._SOURCE_NORMAL,
          undefined,
          `${model.id}: helper attribute must become canonical NORMAL`,
        );
        const checked = verifyBuildingArchiveAttributes(sourcePart, {
          positions,
          normals: accessor(primitive.attributes.NORMAL),
          uvs:
            primitive.attributes.TEXCOORD_0 === undefined
              ? undefined
              : accessor(primitive.attributes.TEXCOORD_0),
          colors:
            primitive.attributes.COLOR_0 === undefined
              ? undefined
              : accessor(primitive.attributes.COLOR_0),
        });
        attributes.vertices += checked.vertices;
        attributes.coloredVertices += checked.coloredVertices;
        attributes.maxNormalError = Math.max(
          attributes.maxNormalError,
          checked.maxNormalError,
        );
        attributes.maxColorError = Math.max(
          attributes.maxColorError,
          checked.maxColorError,
        );
        attributes.maxUvError = Math.max(
          attributes.maxUvError,
          checked.maxUvError,
        );
        const material = json.materials[primitive.material],
          canonical = sourcePart.material;
        for (const [sourceUrl, textureInfo, channel] of [
          [
            canonical.authoredTexture,
            material.pbrMetallicRoughness?.baseColorTexture,
            "colour",
          ],
          [canonical.authoredNormalTexture, material.normalTexture, "normal"],
        ] as const) {
          if (!sourceUrl) continue;
          assert.ok(
            textureInfo,
            `${model.id}: lost authored ${channel} texture on ${sourcePart.name}`,
          );
          const uri = json.images[json.textures[textureInfo.index].source].uri;
          assert.equal(
            path.parse(uri).name,
            authoredTextureHash(sourceUrl),
            `${model.id}: changed authored ${channel} texture bytes`,
          );
        }
        if (canonical.authoredNormalTexture)
          assert.ok(
            Math.abs(
              (material.normalTexture.scale ?? 1) -
                canonical.authoredNormalStrength,
            ) < 1e-6,
            `${model.id}: changed authored normal strength`,
          );
        if (sourcePart.colors.length) {
          assert.deepEqual(
            material.pbrMetallicRoughness.baseColorFactor,
            [
              ...canonical.color,
              canonical.portableEntryGlass ? canonical.alpha : 1,
            ],
            `${model.id}: changed vertex-coloured material factor`,
          );
        }
      }
      for (const p of positions)
        for (let axis = 0; axis < 3; axis++) {
          bounds[axis * 2] = Math.min(bounds[axis * 2], p[axis]);
          bounds[axis * 2 + 1] = Math.max(bounds[axis * 2 + 1], p[axis]);
        }
      for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = indices.slice(i, i + 3).map((j) => positions[j]);
        const u = b.map((v, j) => v - a[j]),
          v = c.map((w, j) => w - a[j]);
        const area2 = Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        );
        if (area2 < 1e-12) zeroAreaTriangles++;
      }
      vertices += positions.length;
      count += indices.length / 3;
    }
  }
  if (source.schemaVersion >= 2)
    assert.equal(
      matchedSourceParts.size,
      expected.parts.length,
      `${model.id}: missing source part`,
    );
  const original = [
    Infinity,
    -Infinity,
    Infinity,
    -Infinity,
    Infinity,
    -Infinity,
  ];
  for (const part of expected.parts)
    for (let i = 0; i < part.positions.length; i++) {
      const axis = i % 3,
        p = part.positions[i];
      original[axis * 2] = Math.min(original[axis * 2], p);
      original[axis * 2 + 1] = Math.max(original[axis * 2 + 1], p);
    }
  const error = Math.max(...bounds.map((b, i) => Math.abs(b - original[i])));
  assert.ok(error < 0.00004, `${model.id}: export displacement ${error}m`);
  maxBoundsError = Math.max(maxBoundsError, error);
  assert.equal(
    count,
    model.triangles,
    `${model.id}: source triangles must be retained`,
  );
  for (const image of json.images ?? []) {
    assert.ok(image.uri?.startsWith("textures/") && !image.uri.includes(".."));
    const texture = readFileSync(path.join(folder, image.uri));
    assert.equal(path.parse(image.uri).name, sha(texture));
  }
  triangles += count;
  rows.push({
    id: model.id,
    parts: json.meshes.length,
    triangles: count,
    boundsErrorMetres: error,
  });
}
assert.equal(manifest.models.length, source.models.length);
assert.equal(
  zeroAreaTriangles,
  0,
  "Authored building exports must not contain zero-area triangles",
);
const report = {
  status: "passed",
  models: manifest.models.length,
  vertices,
  triangles,
  zeroAreaTriangles,
  attributes: source.schemaVersion >= 2 ? attributes : undefined,
  maxBoundsErrorMetres: maxBoundsError,
  b6StairMeshParts: sourceStairParts.length,
  b6StairSourceMaxErrorMetres: maxStairSourceError,
  b6CanonicalBoxFaces: actualFaces.length,
  b6BoxSourceMaxErrorMetres: maxBoxSourceError,
  b6ModelRoomCountsByLevel: b6.b6Layout.modelRoomCountsByLevel,
  geometryBytes: manifest.models.reduce((s: number, m: any) => s + m.bytes, 0),
  sharedTextureBytes: manifest.textures.reduce(
    (s: number, t: any) => s + t.bytes,
    0,
  ),
  sharedTextures: manifest.textures.length,
  checks: [
    "per-building root and source identity",
    "no foreign source nodes or hidden transforms",
    "finite geometry and valid indices",
    "source triangle counts retained",
    "all world bounds within 40 micrometres",
    "byte-identical texture sharing and GLB SHA/length",
    "current source hashes",
    ...(source.schemaVersion >= 2
      ? [
          "source normals, UV seams and vertex tints retained through Blender/glTF",
          "full source part identities and canonical vertex-coloured material factors",
        ]
      : []),
    "B6 floor/model-room contract from current shared data",
    "every stair source triangle retained with foundation offset once",
    "every canonical box face retained once; no reconstructed coplanar outer shell",
  ],
  rows,
};
writeFileSync(
  "docs/reality-pack/separate-assets/building-export-audit.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, rows: undefined }));
