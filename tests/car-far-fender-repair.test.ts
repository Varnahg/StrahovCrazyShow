import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseGlb } from "../scripts/car-glb-reader.mjs";
import {
  createFarLipRecipe,
  repairFarBytes,
  EXPECTED_FAR_SHA,
} from "../scripts/repair-car-far.mjs";

const root = "assets/blender/vehicles/innerscene-hatchback/";
const current = readFileSync("public/models/vehicles/campus-hatchback-far.glb");
const near = readFileSync("public/models/vehicles/campus-hatchback-near.glb");
const original = readFileSync(root + "original-source.glb");
const archived = parseGlb(readFileSync(root + "lod-baseline-j/far.glb"));
const recipe = createFarLipRecipe(near, original);
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
type Glb = ReturnType<typeof parseGlb>;
const paint = (g: Glb) =>
  g.json.meshes[g.json.nodes.find((n: any) => n.name === "Body:paint").mesh]
    .primitives[0];

test("source-ring repair reproduces the exact published far bytes and rejects different checkpoints", () => {
  const input = originalFixture();
  assert.equal(hash(input), EXPECTED_FAR_SHA);
  const result = repairFarBytes(input, recipe);
  assert.deepEqual(result.bytes, current);
  assert.equal(result.audit.triangles, 9277);
  assert.equal(result.audit.parts, 26);
  assert.equal(result.audit.unchangedViews.length, 106);
  assert.throws(() => repairFarBytes(current, recipe), /Unreviewed far input/);
  const corrupt = structuredClone(recipe);
  corrupt.positions[0][0] = NaN;
  assert.throws(() => repairFarBytes(input, corrupt), /source corner payload/);
  const changed = Buffer.from(original);
  changed[100] ^= 1;
  assert.throws(() => createFarLipRecipe(near, changed), /checkpoint changed/);
});

test("only the identified isolated lip is replaced; retained paint corners and all source UV/normal samples are exact", () => {
  const after = parseGlb(current),
    p = paint(after),
    old = paint(archived);
  const pos = after.accessor(p.attributes.POSITION),
    oldPos = archived.accessor(old.attributes.POSITION);
  for (const key of ["POSITION", "NORMAL", "TEXCOORD_0"])
    assert.deepEqual(
      after.accessor(p.attributes[key]).slice(0, oldPos.length),
      archived.accessor(old.attributes[key]),
    );
  const oldIndices = archived.accessor(old.indices).flat(),
    actual = after.accessor(p.indices).flat();
  assert.deepEqual(
    actual.slice(0, (1815 - 129) * 3),
    oldIndices.filter((_, i) => i < 830 * 3 || i >= 959 * 3),
  );
  assert.deepEqual(pos.slice(oldPos.length), recipe.positions);
  assert.deepEqual(
    after.accessor(p.attributes.NORMAL).slice(oldPos.length),
    recipe.normals,
  );
  assert.deepEqual(
    after.accessor(p.attributes.TEXCOORD_0).slice(oldPos.length),
    recipe.uv,
  );
  const removed = new Set(oldIndices.slice(830 * 3, 959 * 3));
  assert.ok(
    oldIndices.every(
      (id, i) => (i >= 830 * 3 && i < 959 * 3) || !removed.has(id),
    ),
  );
  assert.deepEqual(after.json.nodes, archived.json.nodes);
  assert.deepEqual(after.json.materials, archived.json.materials);
});

test("the rebuilt original eight-point profile has a closed, consistently wound boundary including source end caps", () => {
  const edges = new Map<string, [number, number]>(),
    vertices = new Set<string>();
  const ids = recipe.positions.map((p) => p.join(","));
  for (let t = 0; t < recipe.indices.length; t += 3) {
    const face = recipe.indices.slice(t, t + 3),
      [a, b, c] = face.map((i) => recipe.positions[i]);
    const n = cross(sub(b, a), sub(c, a));
    assert.ok(Math.hypot(...n) > 1e-12);
    assert.ok(
      dot(
        n,
        face.reduce(
          (v, i) => v.map((x, k) => x + recipe.normals[i][k]),
          [0, 0, 0],
        ),
      ) > 0,
    );
    for (let k = 0; k < 3; k++) {
      const a = ids[face[k]],
        b = ids[face[(k + 1) % 3]],
        key = a < b ? a + "|" + b : b + "|" + a;
      const entry = edges.get(key) ?? [0, 0];
      entry[0]++;
      entry[1] += a < b ? 1 : -1;
      edges.set(key, entry);
      vertices.add(a);
    }
  }
  assert.equal(recipe.indices.length / 3, 204);
  assert.equal(vertices.size, 104);
  assert.equal(vertices.size - edges.size + 204, 2);
  assert.ok(
    [...edges.values()].every(
      ([count, winding]) => count === 2 && winding === 0,
    ),
  );
  assert.deepEqual(
    recipe.retainedRings,
    Array.from({ length: 13 }, (_, i) => i * 4),
  );
});

test("the exact source-backed hole witness rejects the two-face diagonal and is restored from both sides", () => {
  const before = originalFixture(),
    broken = Buffer.from(before);
  [829, 826, 830, 829].forEach((value, i) =>
    broken.writeUInt16LE(value, [290414, 290416, 290418, 290420][i]),
  );
  const centre = [-0.9770194441080093, 0.4643803536891937, -1.3968712240457535];
  const reference = triangles(parseGlb(near)),
    fixed = triangles(parseGlb(current)),
    failed = triangles(parseGlb(broken));
  for (const sign of [-1, 1]) {
    const dir = [sign, 0, 0],
      origin = centre.map((v, i) => v - dir[i] * 0.15);
    const sourceHit = firstHit(reference, origin, dir),
      hit = firstHit(fixed, origin, dir);
    assert.ok(sourceHit !== null && hit !== null);
    assert.equal(firstHit(failed, origin, dir), null);
    assert.ok(Math.abs(hit - sourceHit) < 0.0035);
  }
});

const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + v * b[i], 0);
function triangles(g: Glb) {
  const p = paint(g),
    pos = g.accessor(p.attributes.POSITION),
    ix = g.accessor(p.indices).flat();
  return Array.from({ length: ix.length / 3 }, (_, i) =>
    ix.slice(i * 3, i * 3 + 3).map((j) => pos[j]),
  );
}
function firstHit(triangles: number[][][], origin: number[], dir: number[]) {
  let hit: number | null = null;
  for (const [a, b, c] of triangles) {
    const e1 = sub(b, a),
      e2 = sub(c, a),
      p = cross(dir, e2),
      det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(origin, a),
      u = dot(s, p) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1),
      v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) continue;
    const t = dot(e2, q) / det;
    if (t >= 0 && t <= 0.3 && (hit === null || t < hit)) hit = t;
  }
  return hit;
}

/** Recover the independent SHA-guarded K fixture from archived J paint and
 * current unchanged wheels. No duplicate binary fixture or cache dependency. */
function originalFixture() {
  const g = parseGlb(current),
    target = paint(g),
    source = paint(archived),
    replacements = new Map<number, Buffer>();
  for (const key of ["POSITION", "NORMAL", "TEXCOORD_0", "indices"]) {
    const id = key === "indices" ? target.indices : target.attributes[key],
      sid = key === "indices" ? source.indices : source.attributes[key];
    const a = g.json.accessors[id],
      rows = archived.accessor(sid),
      size = a.componentType === 5123 ? 2 : 4,
      values = rows.flat(),
      bytes = Buffer.alloc(values.length * size);
    values.forEach((v, i) =>
      size === 2
        ? bytes.writeUInt16LE(v, i * size)
        : bytes.writeFloatLE(v, i * size),
    );
    a.count = rows.length;
    if (a.min)
      a.min = a.min.map((_: number, i: number) =>
        Math.min(...rows.map((r) => r[i])),
      );
    if (a.max)
      a.max = a.max.map((_: number, i: number) =>
        Math.max(...rows.map((r) => r[i])),
      );
    replacements.set(a.bufferView, bytes);
  }
  const chunks: Buffer[] = [];
  let offset = 0;
  for (let i = 0; i < g.json.bufferViews.length; i++) {
    const v = g.json.bufferViews[i],
      bytes =
        replacements.get(i) ??
        g.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength),
      pad = -offset & 3;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      offset += pad;
    }
    v.byteOffset = offset;
    v.byteLength = bytes.length;
    chunks.push(bytes);
    offset += bytes.length;
  }
  g.json.buffers = [{ byteLength: offset }];
  let json = Buffer.from(JSON.stringify(g.json)),
    bin = Buffer.concat(chunks);
  json = Buffer.concat([json, Buffer.alloc(-json.length & 3, 32)]);
  bin = Buffer.concat([bin, Buffer.alloc(-bin.length & 3)]);
  const head = Buffer.alloc(20),
    bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(28 + json.length + bin.length, 8);
  head.writeUInt32LE(json.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  bh.writeUInt32LE(bin.length);
  bh.writeUInt32LE(0x004e4942, 4);
  const result = Buffer.concat([head, json, bh, bin]);
  assert.equal(hash(result), EXPECTED_FAR_SHA);
  return result;
}
