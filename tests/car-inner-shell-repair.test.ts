import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseGlb } from "../scripts/car-glb-reader.mjs";
import {
  repairNearBytes,
  REPAIR,
  boundary,
  sha,
  EXPECTED_NEAR_SHA,
} from "../scripts/repair-car-near.mjs";

test("the candidate changes only the six index entries and keeps all attribute/PBR/image/node bytes intact", () => {
  const before = originalFixture(),
    { bytes: after, audit } = repairNearBytes(before);
  assert.equal(before.length, after.length);
  assert.deepEqual(parseGlb(before).json, parseGlb(after).json);
  const allowed = new Set(audit.permittedByteOffsets);
  for (let i = 0; i < before.length; i++)
    if (!allowed.has(i)) assert.equal(before[i], after[i]);
  assert.equal(audit.maximumVertexDisplacementMetres, 0);
  assert.equal(audit.replacementFaces.length, 2);
  assert.ok(
    audit.replacementFaces.every((f) => f.area > 1e-12 && f.normalDot > 0.999),
  );
});

test("the planar repair preserves directed outer boundary, mesh extent and source UV continuity", () => {
  const input = originalFixture(),
    before = parseGlb(input),
    after = parseGlb(repairNearBytes(input).bytes),
    p = before.json.meshes[0].primitives[0];
  const positions = before.accessor(p.attributes.POSITION),
    uv = before.accessor(p.attributes.TEXCOORD_0);
  assert.deepEqual(
    boundary(REPAIR.before, positions),
    boundary(REPAIR.after, positions),
  );
  assert.equal(boundary(REPAIR.after, positions).length, 4);
  assert.deepEqual(uv[25955], uv[25956]);
  assert.deepEqual(uv[27921], uv[27922]);
  for (const accessor of Object.values(p.attributes) as number[])
    assert.deepEqual(before.accessor(accessor), after.accessor(accessor));
  const old = before.accessor(p.indices).flat(),
    patched = after.accessor(p.indices).flat();
  assert.equal(old.length, patched.length);
  assert.equal(old.filter((id, i) => id !== patched[i]).length, 6);
});

test("different or already modified near assets fail closed instead of applying hardcoded indices blindly", () => {
  const input = originalFixture(),
    changed = Buffer.from(input);
  changed[100] ^= 1;
  assert.throws(() => repairNearBytes(changed), /reviewed source checkpoint/);
  assert.throws(
    () => repairNearBytes(repairNearBytes(input).bytes),
    /reviewed source checkpoint/,
  );
});

/** Reconstruct the reviewed before file from the accepted export using the
 * explicitly documented six UINT16 index entries; verify the independent
 * historical SHA so these tests never bless arbitrary before geometry. */
function originalFixture() {
  const current = fs.readFileSync(
    "public/models/vehicles/campus-hatchback-near.glb",
  );
  if (sha(current) === EXPECTED_NEAR_SHA) return current;
  assert.equal(
    sha(current),
    "7491240d9c5acc10375a394bc9b56a02f314da749dfb63e397506d90ae33c853",
  );
  const before = Buffer.from(current),
    original = [25955, 27830, 27921, 25956, 27922, 27927];
  original.forEach((value, i) => before.writeUInt16LE(value, 1403440 + i * 2));
  assert.equal(sha(before), EXPECTED_NEAR_SHA);
  return before;
}
