/** Independent packed-GLB proof before publishing the full-coverage profile. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const base = 'public/models/vegetation/seasonal-r5/';
const frozen = '.cache/trees-r5-bake-20261025/full-pilots/checkpoint/files/';
const report = JSON.parse(fs.readFileSync(base + 'pilot-manifest.json', 'utf8'));
const original = JSON.parse(fs.readFileSync(frozen + base + 'pilot-manifest.json', 'utf8'));
function glb(file) {
  const bytes = fs.readFileSync(file), length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length).toString()), bin = bytes.subarray(28 + length);
  function accessor(index) {
    const a = json.accessors[index], view = json.bufferViews[a.bufferView], offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    assert.equal(view.byteStride, undefined);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type] * (a.componentType === 5123 ? 2 : 4);
    return { definition: a, width, bytes: bin.subarray(offset, offset + a.count * width) };
  }
  function mesh(lod, role) { const node = json.nodes.find(n => n.extras.lod === lod && n.extras.role === role); return json.meshes[node.mesh].primitives[0]; }
  return { json, accessor, mesh, bytes };
}
function ranks(asset, primitive) {
  const color = asset.accessor(primitive.attributes.COLOR_0);
  assert.equal(color.definition.componentType, 5123); assert.equal(color.definition.normalized, true);
  const result = new Set();
  for (let i = 0; i < color.bytes.length; i += 8) result.add(color.bytes.readUInt16LE(i + 6));
  assert.ok(!result.has(0) && !result.has(65535));
  const indices = asset.accessor(primitive.indices), size = indices.width, read = i => size === 2 ? indices.bytes.readUInt16LE(i * size) : indices.bytes.readUInt32LE(i * size);
  let prior = 0;
  for (let i = 0; i < indices.definition.count; i += 3) {
    const r = [0, 1, 2].map(j => color.bytes.readUInt16LE(read(i + j) * 8 + 6));
    assert.equal(r[0], r[1]); assert.equal(r[0], r[2]); assert.ok(r[0] >= prior); prior = r[0];
  }
  return result;
}
for (const variant of report.variants) {
  const prior = original.variants.find(v => v.id === variant.id), old = glb(frozen + prior.export.path), current = glb(variant.export.path);
  assert.equal(hash(old.bytes), prior.export.sha256); assert.equal(hash(current.bytes), variant.export.sha256);
  const preserved = [];
  for (const lod of [0, 2]) for (const role of ['wood', 'foliage']) {
    const a = old.mesh(lod, role), b = current.mesh(lod, role), entries = {};
    for (const [semantic, index] of Object.entries({ INDICES: b.indices, ...b.attributes })) {
      const actual = current.accessor(index), source = old.accessor(semantic === 'INDICES' ? a.indices : a.attributes[semantic]);
      assert.deepEqual(actual.bytes, source.bytes, `${variant.id}/${lod}/${role}/${semantic}`);
      assert.equal(actual.definition.componentType, source.definition.componentType); assert.equal(actual.definition.type, source.definition.type);
      entries[semantic] = { sha256: hash(source.bytes), bytes: source.bytes.length };
    }
    preserved.push({ lod, role, accessors: entries });
  }
  const near = current.mesh(0, 'foliage'), mid = current.mesh(1, 'foliage');
  assert.deepEqual(ranks(current, mid), ranks(current, near));
  if (variant.kind === 'broadleaf') {
    const nearPosition = current.accessor(near.attributes.POSITION), midPosition = current.accessor(mid.attributes.POSITION);
    const count = nearPosition.definition.count / 6; assert.equal(count, 82100); assert.equal(midPosition.definition.count, count * 4);
    for (const semantic of ['POSITION', 'TEXCOORD_0', 'COLOR_0']) {
      const a = current.accessor(near.attributes[semantic]), b = current.accessor(mid.attributes[semantic]); assert.equal(a.width, b.width);
      for (let leaf = 0; leaf < count; leaf++) for (const [corner, nearCorner] of [0, 1, 5, 4].entries()) {
        const x = (leaf * 6 + nearCorner) * a.width, y = (leaf * 4 + corner) * b.width;
        assert.ok(a.bytes.subarray(x, x + a.width).equals(b.bytes.subarray(y, y + b.width)), `${semantic} leaf${leaf} corner${corner}`);
      }
    }
  } else {
    for (const [semantic, index] of Object.entries({ INDICES: near.indices, ...near.attributes }))
      assert.deepEqual(current.accessor(index).bytes, current.accessor(semantic === 'INDICES' ? mid.indices : mid.attributes[semantic]).bytes);
  }
  variant.sourcePreservation = { frozenExport: { ...prior.export, path: frozen + prior.export.path }, unchangedLods: preserved, midGroupsMatchNear: true,
    nearGroups: ranks(current, near).size, midGroups: ranks(current, mid).size,
    midExactPositionUvRankSource: variant.kind === 'broadleaf' ? 'all near leaf corners 0,1,5,4' : 'all near FirA raw attributes and indices' };
}
const verifier = fs.readFileSync('scripts/trees-20261025-r5/validate_coverage.mjs');
report.postExportVerifier = { path: 'scripts/trees-20261025-r5/validate_coverage.mjs', bytes: verifier.length, sha256: hash(verifier) };
fs.writeFileSync(base + 'pilot-manifest.json', JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync('.cache/trees-r5-bake-20261025/full-coverage-mid/report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.variants.map(v => ({ id: v.id, sourcePreservation: v.sourcePreservation, export: v.export })), null, 2));
