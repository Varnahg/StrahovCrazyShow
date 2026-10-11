import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import manifest from "../shared/data/assets/transit-manifest.json";

function triangles(file: string) {
  const bytes = readFileSync(file),
    length = bytes.readUInt32LE(12),
    spec = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8")),
    binary = bytes.subarray(20 + length + 8);
  function accessor(id: number) {
    const a = spec.accessors[id],
      v = spec.bufferViews[a.bufferView],
      width = a.type === "VEC3" ? 3 : 1,
      size = a.componentType === 5123 ? 2 : 4;
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
      stride = v.byteStride ?? width * size;
    return {
      count: a.count,
      get: (row: number, column = 0) =>
        a.componentType === 5126
          ? binary.readFloatLE(start + row * stride + column * size)
          : size === 2
            ? binary.readUInt16LE(start + row * stride)
            : binary.readUInt32LE(start + row * stride),
    };
  }
  let count = 0,
    degenerate = 0;
  for (const mesh of spec.meshes)
    for (const part of mesh.primitives) {
      const p = accessor(part.attributes.POSITION),
        ix = accessor(part.indices);
      assert.equal(ix.count % 3, 0);
      for (let i = 0; i < ix.count; i += 3) {
        const ids = [ix.get(i), ix.get(i + 1), ix.get(i + 2)];
        assert.ok(
          ids.every((id) => Number.isInteger(id) && id >= 0 && id < p.count),
        );
        const [a, b, c] = ids.map((id) => [
          p.get(id, 0),
          p.get(id, 1),
          p.get(id, 2),
        ]);
        const u = b.map((v, j) => v - a[j]),
          v = c.map((w, j) => w - a[j]);
        if (
          [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ].every((value) => Math.abs(value) < 1e-12)
        )
          degenerate++;
        count++;
      }
    }
  return { count, degenerate, spec };
}

test("derived bus LODs and repaired basin contain no collapsed triangles; the licensed original remains immutable", () => {
  const source = readFileSync("public/models/transit/city-bus-source.glb");
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "42fc939d64b8bcfc5329e13356fc984872c18ecb10535da6354f98ea58d3519c",
  );
  assert.equal(
    triangles("public/models/transit/city-bus-source.glb").degenerate,
    161,
    "immutable source defects remain honestly reported",
  );
  const high = triangles("public/models/transit/strahov-city-bus.glb"),
    low = triangles("public/models/transit/strahov-city-bus-low.glb"),
    sink = triangles("public/models/b6/sink.glb");
  assert.equal(high.degenerate, 0);
  assert.equal(low.degenerate, 0);
  assert.equal(sink.degenerate, 0);
  assert.equal(high.count, manifest.triangles);
  assert.equal(low.count, manifest.lowTriangles);
  assert.equal(high.spec.meshes.length, 23);
  assert.equal(low.spec.meshes.length, 15);
  for (const prefix of [
    "DoorFront_",
    "DoorMiddle_",
    "WheelFrontLeft_",
    "WheelFrontRight_",
    "WheelRearLeft_",
    "WheelRearRight_",
  ])
    assert.ok(
      high.spec.nodes.some((node: { name?: string }) =>
        node.name?.startsWith(prefix),
      ),
      `${prefix} must remain independently animated`,
    );
  assert.equal(manifest.geometryRepair.high.attributeBytesUnchanged, true);
  assert.equal(manifest.geometryRepair.low.attributeBytesUnchanged, true);
  assert.equal(manifest.geometryRepair.sourceFileUnchanged, true);
});
