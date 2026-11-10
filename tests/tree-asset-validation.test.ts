import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeTreePrototype, decodeTreeRuntimeChunk, readTreeGlb } from "../client/tree-asset-loader";
import type { TreePrototype } from "../shared/tree-asset-types";
// @ts-ignore The existing offline exporter is a native Node ESM module.
import { encodeSeasonalGlb } from "../scripts/tree-seasonal-stream.mjs";

const id = "validation-tree", sourceTreeId = "validation-source";
const asBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const rawBytes = (array: ArrayBufferView) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

/** Small authored GLB, not a copy of the runtime decoder. Separate views let
 * tests change one contract while keeping the rest of the file valid. */
function fixture(wideIndices = false) {
  const chunks: Buffer[] = [], bufferViews: any[] = [], accessors: any[] = [], meshes: any[] = [], nodes: any[] = [];
  let byteLength = 0;
  const append = (data: Float32Array | Uint16Array | Uint32Array, type: "SCALAR" | "VEC2" | "VEC3" | "VEC4", normalized = false) => {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength), padding = Buffer.alloc((4 - bytes.length % 4) % 4);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length });
    chunks.push(bytes, padding); byteLength += bytes.length + padding.length;
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type]!;
    accessors.push({ bufferView: bufferViews.length - 1, componentType: data instanceof Float32Array ? 5126 : data instanceof Uint16Array ? 5123 : 5125,
      count: data.length / components, type, ...(normalized ? { normalized: true } : {}) });
    return accessors.length - 1;
  };
  const authored = ["wood", "foliage"].map(role => {
    const positions = new Float32Array([-0, 0, 0, 1, 0, 0, 0, 1, .000012345]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
    const indices = wideIndices ? new Uint32Array([0, 1, 2]) : new Uint16Array([0, 1, 2]);
    const attributes: Record<string, number> = { POSITION: append(positions, "VEC3"), NORMAL: append(normals, "VEC3"), TEXCOORD_0: append(uvs, "VEC2") };
    if (role === "foliage") attributes.COLOR_0 = append(new Uint16Array([65535, 65535, 65535, 1234, 65535, 65535, 65535, 1234, 65535, 65535, 65535, 1234]), "VEC4", true);
    const name = `${id}__lod1__${role}`, index = append(indices, "SCALAR");
    meshes.push({ name, primitives: [{ attributes, indices: index }] });
    nodes.push({ name, mesh: meshes.length - 1, extras: { role, materialKey: role === "wood" ? "Bark012" : "LeafSet024", lod: 1, archetypeId: id, sourceTreeId } });
    return { positions, normals, uvs, indices };
  });
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0, 1] }], nodes, meshes,
    buffers: [{ byteLength }], bufferViews, accessors };
  const prototype: TreePrototype = { sourceTreeId, family: "deciduous-broadleaf", nominalHeight: 8, nominalCrownDiameter: 4, trunkRadius: .2,
    lods: [0, 1, 2].map(lod => ({ url: `/models/vegetation/validation-lod${lod}.glb`, bytes: 1, sha256: "0".repeat(64), meshNames: [`${id}__lod${lod}__wood`, `${id}__lod${lod}__foliage`] })) };
  const encode = () => { json.buffers[0].byteLength = byteLength; return asBuffer(encodeSeasonalGlb(json, Buffer.concat(chunks))); };
  return { json, prototype, authored, append, encode, wood: meshes[0].primitives[0], foliage: meshes[1].primitives[0] };
}

test("private decode preserves authored bytes and index width without retaining parser state", () => {
  for (const wide of [false, true]) {
    const f = fixture(wide), buffer = f.encode(), before = new Uint8Array(buffer).slice();
    const parts = decodeTreePrototype(buffer, id, f.prototype, 1);
    assert.equal(parts.length, 2);
    for (const [index, part] of parts.entries()) {
      for (const key of ["positions", "normals", "uvs", "indices"] as const)
        assert.deepEqual(rawBytes(part[key]), rawBytes(f.authored[index][key]), key);
      assert.equal(part.indices instanceof Uint32Array, wide);
      assert.equal(part.positions.buffer, buffer, "existing zero-copy source ownership is preserved");
      assert.deepEqual(Object.keys(part).sort(), ["colors", "indices", "lod", "materialKey", "name", "normals", "positions", "role", "uvs"]);
    }
    assert.deepEqual([...parts[1].colors!], [1, 1, 1, Math.fround(1234 / 65535), 1, 1, 1, Math.fround(1234 / 65535), 1, 1, 1, Math.fround(1234 / 65535)]);
    assert.deepEqual(new Uint8Array(buffer), before);
    parts[0].positions[0] = NaN;
    assert.throws(() => decodeTreePrototype(buffer, id, f.prototype, 1), /Nonfinite tree GLB attribute/, "another decode must validate the changed bytes again");
  }
});

test("previously validated accessors still enforce each primitive's expected type and component type", () => {
  const wrongType = fixture();
  wrongType.wood.attributes.NORMAL = wrongType.wood.attributes.TEXCOORD_0;
  assert.throws(() => decodeTreePrototype(wrongType.encode(), id, wrongType.prototype, 1), /Unsupported tree accessor/);
  const wrongComponent = fixture();
  // uint32 has the same byte width, count and shape; only the caller's expected
  // FLOAT contract rejects it after the initial untyped accessor validation.
  wrongComponent.json.accessors[wrongComponent.wood.attributes.NORMAL].componentType = 5125;
  assert.throws(() => decodeTreePrototype(wrongComponent.encode(), id, wrongComponent.prototype, 1), /Unsupported tree accessor/);
  const floatIndices = fixture(true);
  floatIndices.json.accessors[floatIndices.wood.indices].componentType = 5126;
  assert.throws(() => decodeTreePrototype(floatIndices.encode(), id, floatIndices.prototype, 1), /Invalid tree GLB index type/);
});

test("unused attributes retain finite and structural validation before streamed identity checks", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const f = fixture(); f.append(new Float32Array([value]), "SCALAR");
    assert.throws(() => decodeTreePrototype(f.encode(), id, f.prototype, 1), /Nonfinite tree GLB attribute/);
    assert.throws(() => readTreeGlb(f.encode()), /Nonfinite tree GLB attribute/);
  }
  const finite = fixture(); finite.append(new Float32Array([7]), "SCALAR");
  assert.doesNotThrow(() => readTreeGlb(finite.encode()));
  assert.throws(() => decodeTreePrototype(finite.encode(), id, finite.prototype, 1), /unused accessors\/views/);
  const bounds = fixture(), extra = bounds.append(new Float32Array([7]), "SCALAR");
  bounds.json.accessors[extra].count = 2;
  assert.throws(() => decodeTreePrototype(bounds.encode(), id, bounds.prototype, 1), /Invalid tree accessor bounds/);
});

test("validated primitive views do not bypass geometry shape, vertex range or finite checks", () => {
  const shape = fixture(); shape.json.accessors[shape.wood.attributes.NORMAL].count = 2;
  assert.throws(() => decodeTreePrototype(shape.encode(), id, shape.prototype, 1), /Invalid tree geometry shape/);
  const index = fixture(); index.authored[0].indices[2] = 3;
  assert.throws(() => decodeTreePrototype(index.encode(), id, index.prototype, 1), /Tree index outside vertices/);
  for (const field of ["positions", "normals", "uvs"] as const) {
    const f = fixture(); f.authored[0][field][0] = Infinity;
    assert.throws(() => decodeTreePrototype(f.encode(), id, f.prototype, 1), /Nonfinite tree GLB attribute/);
  }
});

test("public readTreeGlb accessor observes later source-byte mutations and returns fresh views", () => {
  const f = fixture(), glb = readTreeGlb(f.encode()), index = f.wood.attributes.POSITION;
  const first = glb.accessor(index, "VEC3", 5126), second = glb.accessor(index, "VEC3", 5126);
  assert.notEqual(first.data, second.data);
  assert.equal(first.data.buffer, second.data.buffer);
  first.data[0] = NaN;
  assert.throws(() => glb.accessor(index, "VEC3", 5126), /Nonfinite tree GLB attribute/);
  first.data[0] = 9;
  assert.equal(glb.accessor(index, "VEC3", 5126).data[0], 9);
});

test("public readTreeGlb accessor rechecks mutable metadata, caller expectations and bounds", () => {
  const f = fixture(), glb = readTreeGlb(f.encode()), index = f.wood.attributes.POSITION;
  glb.accessor(index, "VEC3", 5126);
  const descriptor = glb.json.accessors[index];
  descriptor.normalized = true;
  assert.equal(glb.accessor(index, "VEC3", 5126).normalized, true);
  descriptor.componentType = 5125;
  assert.throws(() => glb.accessor(index, "VEC3", 5126), /Unsupported tree accessor/);
  assert.ok(glb.accessor(index, "VEC3", 5125).data instanceof Uint32Array);
  descriptor.componentType = 5126;
  descriptor.type = "VEC2";
  assert.throws(() => glb.accessor(index, "VEC3", 5126), /Unsupported tree accessor/);
  descriptor.type = "VEC3";
  descriptor.count = 4;
  assert.throws(() => glb.accessor(index, "VEC3", 5126), /Invalid tree accessor bounds/);
  descriptor.count = 3;
  glb.json.bufferViews[descriptor.bufferView].byteLength = 4;
  assert.throws(() => glb.accessor(index, "VEC3", 5126), /Invalid tree accessor bounds/);
});


test("legacy runtime chunks still reject nonfinite vertices without GLB accessor validation", () => {
  const manifest = JSON.parse(readFileSync("public/models/vegetation/runtime/manifest.json", "utf8"));
  const entry = (Object.values(manifest.trees)[0] as Record<string, { url: string }>)["0"];
  const bytes = readFileSync("public" + entry.url), length = bytes.readUInt32LE(0);
  const metadata = JSON.parse(bytes.subarray(4, 4 + length).toString("utf8"));
  assert.ok(decodeTreeRuntimeChunk(asBuffer(bytes)).primitives.length);
  for (const attribute of ["POSITION", "NORMAL", "TEXCOORD_0"]) {
    const buffer = asBuffer(bytes);
    new DataView(buffer).setFloat32(4 + length + metadata.primitives[0].attributes[attribute].byteOffset, NaN, true);
    assert.throws(() => decodeTreeRuntimeChunk(buffer), /Nonfinite tree vertex/);
  }
});
