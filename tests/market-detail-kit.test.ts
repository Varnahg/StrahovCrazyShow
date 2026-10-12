import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import kit from "../shared/data/market-detail-kit.json";

type Geometry = (typeof kit.kits.flue.near.parts)[number]["geometry"];
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const vec = (values: number[], index: number) => Vector3.FromArray(values, index * 3);

test("market kit geometry has valid outward triangles and keeps the original solid footprint", () => {
  assert.equal(kit.source.osmWay, "7645350");
  assert.equal(kit.source.photoArchived, false);
  assert.equal(kit.placement.outwardOffset, -.3);
  assert.equal(kit.placement.alongFraction, .18);
  for (const [quality, lod] of Object.entries(kit.kits.flue)) {
    assert.equal(lod.materialCount, 2);
    let triangles = 0;
    let lowest = Infinity, highest = -Infinity;
    for (const { geometry: g } of lod.parts) {
      assert.equal(g.positions.length, g.normals.length);
      assert.equal(g.uvs.length / 2, g.positions.length / 3);
      assert.ok([...g.positions, ...g.normals, ...g.uvs].every(Number.isFinite));
      for (let i = 0; i < g.positions.length / 3; i++) {
        const p = vec(g.positions, i), n = vec(g.normals, i);
        lowest = Math.min(lowest, p.y); highest = Math.max(highest, p.y);
        assert.ok(p.z + kit.placement.outwardOffset < 0, `${quality}: detail leaves footprint`);
        assert.ok(Math.abs(n.length() - 1) < 2e-6);
      }
      for (let i = 0; i < g.indices.length; i += 3) {
        const ids = g.indices.slice(i, i + 3);
        assert.ok(ids.every((id) => Number.isInteger(id) && id >= 0 && id < g.positions.length / 3));
        const [a, b, c] = ids.map((id) => vec(g.positions, id));
        const face = Vector3.Cross(b.subtract(a), c.subtract(a));
        assert.ok(face.lengthSquared() > 1e-16, `${quality}: collapsed triangle`);
        const averageNormal = ids.reduce((sum, id) => sum.addInPlace(vec(g.normals, id)), Vector3.Zero());
        assert.ok(Vector3.Dot(face, averageNormal) >= -1e-9, `${quality}: inverted face`);
      }
      triangles += g.indices.length / 3;
    }
    assert.equal(triangles, lod.triangles);
    assert.ok(Math.abs(lowest) < 1e-6 && Math.abs(highest - 5.4) < 1e-6);
  }
  assert.ok(kit.kits.flue.far.triangles < kit.kits.flue.near.triangles);
  assert.ok(kit.kits.flue.near.triangles < kit.highest.triangles);
});

function readGlb(path: string) {
  const buffer = readFileSync(path);
  assert.equal(buffer.readUInt32LE(0), 0x46546c67);
  const length = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + length).toString());
  const binary = buffer.subarray(28 + length);
  const accessor = (id: number): number[] => {
    const a = json.accessors[id], b = json.bufferViews[a.bufferView];
    const components = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    const size = ({ 5121: 1, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>)[a.componentType];
    assert.ok(components && size);
    const result = [];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < components; c++) {
      const offset = (a.byteOffset ?? 0) + (b.byteOffset ?? 0) + i * (b.byteStride ?? components * size) + c * size;
      result.push(a.componentType === 5126 ? binary.readFloatLE(offset) : a.componentType === 5125 ? binary.readUInt32LE(offset) : a.componentType === 5123 ? binary.readUInt16LE(offset) : binary.readUInt8(offset));
    }
    return result;
  };
  return { json, accessor };
}

function triangles(g: Pick<Geometry, "positions" | "indices">) {
  const result = [];
  for (let i = 0; i < g.indices.length; i += 3) {
    const v = g.indices.slice(i, i + 3).map((id) => g.positions.slice(id * 3, id * 3 + 3).map((p) => Math.round(p * 1e4)).join(","));
    result.push([0, 1, 2].map((offset) => [...v.slice(offset), ...v.slice(0, offset)].join("/")).sort()[0]);
  }
  return result.sort();
}

test("portable GLBs contain the actual Blender triangles consumed by the runtime batches", () => {
  for (const lod of Object.values(kit.kits.flue)) {
    const path = "public" + lod.glb.url;
    assert.equal(hash(path), lod.glb.sha256);
    const { json, accessor } = readGlb(path);
    assert.equal(json.images, undefined, "the reference photograph must never become a runtime texture");
    const roles: Record<string, Pick<Geometry, "positions" | "indices">> = {};
    function visit(id: number, parent: Matrix) {
      const node = json.nodes[id];
      const local = node.matrix ? Matrix.FromArray(node.matrix) : Matrix.Compose(Vector3.FromArray(node.scale ?? [1, 1, 1]), Quaternion.FromArray(node.rotation ?? [0, 0, 0, 1]), Vector3.FromArray(node.translation ?? [0, 0, 0]));
      const world = local.multiply(parent);
      if (node.mesh !== undefined) {
        assert.equal(node.extras.sourceId, kit.source.id);
        for (const primitive of json.meshes[node.mesh].primitives) {
          const role = node.extras.materialRole;
          const output = roles[role] ??= { positions: [], indices: [] };
          const positions = accessor(primitive.attributes.POSITION);
          const offset = output.positions.length / 3;
          for (let i = 0; i < positions.length / 3; i++) output.positions.push(...Vector3.TransformCoordinates(vec(positions, i), world).asArray());
          output.indices.push(...accessor(primitive.indices).map((index) => index + offset));
          assert.equal(json.materials[primitive.material].name, role);
        }
      }
      for (const child of node.children ?? []) visit(child, world);
    }
    for (const id of json.scenes[json.scene ?? 0].nodes) visit(id, Matrix.Identity());
    for (const part of lod.parts) assert.deepEqual(triangles(roles[part.materialRole]), triangles(part.geometry), part.materialRole);
  }
});

test("highest editable market source and native reopen evidence match the delivered files", () => {
  const audit = JSON.parse(readFileSync("docs/building-modeling-20261012/references/market-kit-blender-audit.json", "utf8"));
  assert.equal(audit.status, "passed");
  assert.equal(audit.gpuRender, false);
  assert.equal(audit.retainedEditableModifiers, true);
  assert.equal(audit.reopenedHighestObjects, kit.highest.objects);
  assert.equal(audit.reopenedHighestTriangles, kit.highest.triangles);
  assert.equal(hash(kit.highest.blend), kit.highest.sha256);
  assert.equal(hash("assets/blender/market-detail-kit/highest-geometry.json"), audit.highestGeometrySha256);
  assert.equal(hash("shared/data/market-detail-kit.json"), audit.dataSha256);
});
