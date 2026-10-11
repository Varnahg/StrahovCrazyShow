/** Independent GLB binary audit, including transformed vertex bounds. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/models/environment/manifest.json'), 'utf8'));
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const c = Array(16).fill(0);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++)
    for (let k = 0; k < 4; k++) c[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return c;
}
function matrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y*y + z*z)) * sx, 2 * (x*y + z*w) * sx, 2 * (x*z - y*w) * sx, 0,
    2 * (x*y - z*w) * sy, (1 - 2 * (x*x + z*z)) * sy, 2 * (y*z + x*w) * sy, 0,
    2 * (x*z + y*w) * sz, 2 * (y*z - x*w) * sz, (1 - 2 * (x*x + y*y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function position(m, [x, y, z]) {
  return [m[0]*x + m[4]*y + m[8]*z + m[12],
          m[1]*x + m[5]*y + m[9]*z + m[13],
          m[2]*x + m[6]*y + m[10]*z + m[14]];
}

const results = [];
const ids = new Set();
for (const asset of manifest.assets) {
  assert(!ids.has(asset.id), 'Duplicate asset ID');
  ids.add(asset.id);
  const file = path.join(root, 'public', asset.url);
  const data = fs.readFileSync(file);
  assert.equal(data.readUInt32LE(0), 0x46546c67, `${asset.id}: GLB magic`);
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const jsonLength = data.readUInt32LE(12);
  assert.equal(data.readUInt32LE(16), 0x4e4f534a);
  const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength;
  assert.equal(data.readUInt32LE(binStart + 4), 0x004e4942);
  const binary = data.subarray(binStart + 8);
  assert.equal(gltf.buffers.length, 1);
  assert.equal(gltf.images?.length ?? 0, 0, 'No embedded images');
  assert.equal(gltf.textures?.length ?? 0, 0, 'No texture allocation');
  assert(!gltf.extensionsRequired?.length, 'No decoder extension required');
  assert.equal(gltf.meshes.length, 1, 'One merged asset mesh');
  const primitives = gltf.meshes.flatMap(mesh => mesh.primitives);
  assert(primitives.length >= 1 && primitives.length <= 3);
  const triangles = primitives.reduce((n, p) => {
    assert.equal(p.mode ?? 4, 4, 'Triangle topology');
    assert.equal(gltf.accessors[p.indices].count % 3, 0);
    return n + gltf.accessors[p.indices].count / 3;
  }, 0);
  assert.equal(triangles, asset.triangleCount);
  assert(triangles <= 1500);
  assert.equal(primitives.length, asset.primitiveCount);
  assert.equal(gltf.materials.length, asset.materialCount);
  assert.equal(data.length, asset.byteLength);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  function visit(index, parent) {
    const node = gltf.nodes[index];
    const transform = multiply(parent, matrix(node));
    if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      assert.equal(accessor.componentType, 5126);
      assert.equal(accessor.type, 'VEC3');
      const view = gltf.bufferViews[accessor.bufferView];
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stride = view.byteStride ?? 12;
      for (let i = 0; i < accessor.count; i++) {
        const vertex = [0, 1, 2].map(axis => binary.readFloatLE(offset + i * stride + axis * 4));
        const p = position(transform, vertex);
        assert(p.every(Number.isFinite));
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], p[axis]);
          max[axis] = Math.max(max[axis], p[axis]);
        }
      }
    }
    for (const child of node.children ?? []) visit(child, transform);
  }
  for (const index of gltf.scenes[gltf.scene ?? 0].nodes) visit(index, identity);
  for (let axis = 0; axis < 3; axis++) {
    assert(Math.abs(min[axis] - asset.bounds.min[axis]) < 0.0001, `${asset.id}: minimum axis ${axis}`);
    assert(Math.abs(max[axis] - asset.bounds.max[axis]) < 0.0001, `${asset.id}: maximum axis ${axis}`);
    assert(Math.abs(max[axis] - min[axis] - asset.dimensions[axis]) < 0.0001);
  }
  assert(Math.abs(min[1]) < 0.0001, `${asset.id}: Y-up supporting surface at zero`);
  assert(fs.statSync(path.join(root, asset.sourceBlend)).size > 50_000, 'Editable Blender source exists');
  for (const box of asset.collisionBoxes) {
    assert.equal(box.center.length, 3);
    assert(box.center.every(Number.isFinite));
    assert(box.dimensions.every(n => Number.isFinite(n) && n > 0));
    assert.equal(box.rotation.length, 3);
  }
  results.push({id: asset.id, triangles, materialPrimitives: primitives.length,
    bytes: data.length, transformedDimensions: max.map((value, i) => +(value - min[i]).toFixed(5)),
    floorY: +min[1].toFixed(6), sha256: crypto.createHash('sha256').update(data).digest('hex')});
}
const report = {schemaVersion: 1, checkedAt: '2026-10-10', checks: [
  'GLB 2 headers and byte lengths', 'One mesh, triangle topology and actual index counts',
  '1–3 material primitives; no textures or decoder extensions',
  'Actual binary positions transformed through glTF node matrices match declared bounds to 0.1 mm',
  'Y-up floor pivot; finite positive collision box dimensions', 'Editable Blender sources exist',
], limitation: 'This is an asset-format audit, not in-game collision, GPU FPS, physical surveying, or proof of the present B6 interior.',
totalTriangles: results.reduce((n, result) => n + result.triangles, 0),
totalBytes: results.reduce((n, result) => n + result.bytes, 0), assets: results};
if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, 'docs/models/environment-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
