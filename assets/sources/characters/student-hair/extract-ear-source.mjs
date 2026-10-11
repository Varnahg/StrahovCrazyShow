/** Read the immutable Blender source directly; no Blender process or rendering.
 * node assets/sources/characters/student-hair/extract-ear-source.mjs --output <audit.json>
 * With no --output argument the audit is emitted to stdout, without writing files.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const sourcePath = resolve(root, 'assets/sources/characters/blender-human-base/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend');
const runtimePath = resolve(root, 'client/data/skinned-character-geometry.json');
const metadata = JSON.parse(readFileSync(resolve(root, 'assets/sources/characters/blender-human-base/source.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = readFileSync(sourcePath);
assert.equal(sha(sourceBytes), metadata.blendSha256, 'Immutable anatomy source changed');

// Blender stores concatenated Zstandard frames. Node decodes one frame at a
// time, so read each frame/block boundary and skip the final seek-table frame.
function decompressFrames(bytes) {
  const frames = [];
  for (let offset = 0; offset < bytes.length;) {
    const start = offset, magic = bytes.readUInt32LE(offset);
    if ((magic & 0xfffffff0) === 0x184d2a50) {
      offset += 8 + bytes.readUInt32LE(offset + 4);
      continue;
    }
    assert.equal(magic, 0xfd2fb528, 'Unexpected Zstandard frame');
    const flag = bytes[offset + 4], singleSegment = (flag >> 5) & 1;
    offset += 5 + (singleSegment ? 0 : 1) + [0, 1, 2, 4][flag & 3];
    offset += (flag >> 6) === 0 ? singleSegment : [0, 2, 4, 8][flag >> 6];
    let last = false;
    while (!last) {
      const block = bytes.readUIntLE(offset, 3), type = (block >> 1) & 3;
      assert.notEqual(type, 3, 'Reserved Zstandard block type');
      last = Boolean(block & 1);
      offset += 3 + (type === 1 ? 1 : block >>> 3);
    }
    if (flag & 4) offset += 4;
    frames.push(zstdDecompressSync(bytes.subarray(start, offset)));
  }
  return Buffer.concat(frames);
}

const blend = decompressFrames(sourceBytes);
assert.equal(blend.subarray(0, 12).toString(), 'BLENDER-v402', 'Expected the pinned 64-bit little-endian source');
const blocks = [];
for (let offset = 12; offset + 24 <= blend.length;) {
  const code = blend.subarray(offset, offset + 4).toString();
  const length = blend.readUInt32LE(offset + 4);
  blocks.push({ code, length, pointer: blend.readBigUInt64LE(offset + 8), schema: blend.readUInt32LE(offset + 16), offset: offset + 24 });
  offset += 24 + length;
  if (code === 'ENDB') break;
}
assert.equal(blocks.at(-1).code, 'ENDB');
const byPointer = new Map(blocks.map(block => [block.pointer, block]));
let cursor = blocks.find(block => block.code === 'DNA1').offset;
const uint16 = () => { const value = blend.readUInt16LE(cursor); cursor += 2; return value; };
const uint32 = () => { const value = blend.readUInt32LE(cursor); cursor += 4; return value; };
const textAt = (offset, length) => blend.subarray(offset, offset + length).toString().split('\0')[0];
const tag = expected => { assert.equal(blend.subarray(cursor, cursor + 4).toString(), expected); cursor += 4; };
const strings = () => Array.from({ length: uint32() }, () => {
  const end = blend.indexOf(0, cursor), value = blend.subarray(cursor, end).toString(); cursor = end + 1; return value;
});
const align = () => { cursor = (cursor + 3) & ~3; };
tag('SDNA'); tag('NAME'); const names = strings(); align();
tag('TYPE'); const types = strings(); align();
tag('TLEN'); const sizes = types.map(() => uint16()); align(); tag('STRC');
const structures = Array.from({ length: uint32() }, () => {
  const type = uint16(), count = uint16(), fields = [];
  let offset = 0;
  for (let index = 0; index < count; index++) {
    const fieldType = uint16(), name = names[uint16()];
    const elements = [...name.matchAll(/\[(\d+)\]/g)].reduce((product, match) => product * Number(match[1]), 1);
    const length = (name.includes('*') ? 8 : sizes[fieldType]) * elements;
    fields.push({ name, offset }); offset += length;
  }
  assert.equal(offset, sizes[type], `DNA explicit padding: ${types[type]}`);
  return { name: types[type], size: sizes[type], fields };
});
const schemas = Object.fromEntries(structures.map(schema => [schema.name, schema]));
const field = (schema, name) => schemas[schema].fields.find(item => item.name === name).offset;
const dereference = offset => {
  const block = byPointer.get(blend.readBigUInt64LE(offset));
  assert.ok(block, `Missing source block at ${offset}`); return block;
};
const objectName = 'GEO-body_male_realistic';
const object = blocks.find(block => structures[block.schema]?.name === 'Object' && textAt(block.offset + field('ID', 'name[66]'), 66) === `OB${objectName}`);
assert.ok(object, 'Original male source object missing');
const mesh = dereference(object.offset + field('Object', '*data'));
const count = name => blend.readInt32LE(mesh.offset + field('Mesh', name));
function attribute(domain, name) {
  const data = mesh.offset + field('Mesh', domain);
  const layers = dereference(data + field('CustomData', '*layers'));
  const length = blend.readInt32LE(data + field('CustomData', 'totlayer'));
  for (let index = 0; index < length; index++) {
    const offset = layers.offset + index * schemas.CustomDataLayer.size;
    if (textAt(offset + field('CustomDataLayer', 'name[68]'), 68) === name) return dereference(offset + field('CustomDataLayer', '*data'));
  }
  throw new Error(`Source attribute ${domain}/${name} missing`);
}
const positions = attribute('vdata', 'position'), cornerVertices = attribute('ldata', '.corner_vert');
const faceSets = attribute('pdata', '.sculpt_face_set');
const polygonOffsets = dereference(mesh.offset + field('Mesh', '*poly_offset_indices'));
const sourcePoints = Array.from({ length: count('totvert') }, (_, index) => [0, 1, 2].map(axis => blend.readFloatLE(positions.offset + index * 12 + axis * 4)));
const sourceFaces = Array.from({ length: count('totpoly') }, (_, index) => {
  const start = blend.readInt32LE(polygonOffsets.offset + index * 4), end = blend.readInt32LE(polygonOffsets.offset + (index + 1) * 4);
  return { index, faceSet: blend.readInt32LE(faceSets.offset + index * 4), vertices: Array.from({ length: end - start }, (_, corner) => blend.readInt32LE(cornerVertices.offset + (start + corner) * 4)) };
});
const runtimeBytes = readFileSync(runtimePath), runtime = JSON.parse(runtimeBytes);
const head = runtime.head.positions;
const runtimePoints = Array.from({ length: head.length / 3 }, (_, index) => [head[index * 3] * .184, head[index * 3 + 1] * .235, head[index * 3 + 2] * .195]);
const headLocal = ([x, y, z]) => [x, z - 1.565, -y - .012];
function hull(points) {
  const ordered = [...new Map(points.map(point => [point.join(','), point])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = sequence => { const result = []; for (const point of sequence) { while (result.length > 1 && cross(result.at(-2), result.at(-1), point) <= 0) result.pop(); result.push(point); } return result.slice(0, -1); };
  return [...half(ordered), ...half([...ordered].reverse())];
}
const ears = [4, 5].map(faceSet => {
  const side = faceSet === 4 ? 1 : -1;
  const faces = sourceFaces.filter(face => face.faceSet === faceSet);
  const sourceVertexIndices = [...new Set(faces.flatMap(face => face.vertices))].sort((a, b) => a - b);
  const pointsSourceBlenderMetres = sourceVertexIndices.map(index => sourcePoints[index]);
  const pointsHeadLocalMetres = pointsSourceBlenderMetres.map(headLocal);
  const matches = pointsHeadLocalMetres.map(point => {
    let distance = Infinity, runtimeVertexIndex = -1;
    runtimePoints.forEach((candidate, index) => { const delta = Math.hypot(...point.map((value, axis) => value - candidate[axis])); if (delta < distance) { distance = delta; runtimeVertexIndex = index; } });
    assert.ok(distance < 3e-8, 'Source ear vertex differs from runtime normalized head');
    return { runtimeVertexIndex, distanceMetres: distance };
  });
  const oldHull = hull(runtimePoints.filter(([x, y, z]) => x * side > .08 && -.055 < y && y < .05 && -.09 < z && z < .05).map(point => point.slice(1)));
  const insideOldHull = ([, y, z]) => oldHull.every((a, index) => {
    const b = oldHull[(index + 1) % oldHull.length], dy = b[0] - a[0], dz = b[1] - a[1];
    return (-dz * (y - a[0]) + dy * (z - a[1])) / Math.hypot(dy, dz) + .0025 >= -1e-7;
  });
  const outsideOldMask = pointsHeadLocalMetres.flatMap((point, index) => insideOldHull(point) ? [] : [sourceVertexIndices[index]]);
  const indexMap = new Map(sourceVertexIndices.map((sourceIndex, index) => [sourceIndex, index]));
  return {
    side, faceSet, sourceVertexIndices, pointsSourceBlenderMetres, pointsHeadLocalMetres,
    sourcePolygonIndices: faces.map(face => face.index), polygons: faces.map(face => face.vertices.map(index => indexMap.get(index))),
    runtimeMatches: matches,
    maximumRuntimeVertexErrorMetres: Math.max(...matches.map(match => match.distanceMetres)),
    outlineYZ: hull(pointsHeadLocalMetres.map(point => point.slice(1))),
    oldMaskExcludedSourceVertexIndices: outsideOldMask,
    oldMaskMaximumForwardZMetres: Math.max(...oldHull.map(point => point[1])),
    sourceMaximumForwardZMetres: Math.max(...pointsHeadLocalMetres.map(point => point[2]))
  };
});
const audit = {
  schema: 1, sourcePath: relative(root, sourcePath).replaceAll('\\', '/'), sourceSha256: sha(sourceBytes),
  sourceUrl: metadata.url, sourceRetrievedAt: metadata.retrievedAt, sourceLicense: metadata.license,
  sourceObject: objectName, sourceMeshDatablock: textAt(mesh.offset + field('ID', 'name[66]'), 66).slice(2),
  sourceAttribute: '.sculpt_face_set', sourceFaceSetInterpretation: 'Sets 4 and 5 are the paired auricles, identified by their complete source topology and lateral head position; source sets have numeric IDs, not anatomical text labels.',
  runtimePath: relative(root, runtimePath).replaceAll('\\', '/'), runtimeSha256: sha(runtimeBytes),
  transform: { sourceBlenderToHeadLocalMetres: '[x, z - 1.565, -y - 0.012]', runtimeHeadNormalizedToMetres: '[x * 0.184, y * 0.235, z * 0.195]', reference: 'scripts/create-skinned-characters.py: head_mesh.from_pydata and export_geometry' },
  baselineMask: { reference: '.cache/hair-realism-study/fit_constraints.py: ear_prisms', selection: 'x * side > 0.08 && -0.055 < y < 0.05 && -0.09 < z < 0.05', marginMetres: .0025, lateralPlaneMetres: .055 },
  verification: { sourceVertexCount: ears.reduce((sum, ear) => sum + ear.sourceVertexIndices.length, 0), maximumRuntimeVertexErrorMetres: Math.max(...ears.map(ear => ear.maximumRuntimeVertexErrorMetres)), excludedByOldMaskCount: ears.reduce((sum, ear) => sum + ear.oldMaskExcludedSourceVertexIndices.length, 0), rendererUsed: false, sourceFilesModified: false },
  ears
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1) {
  assert.ok(process.argv[outputIndex + 1], '--output requires a path');
  writeFileSync(resolve(process.argv[outputIndex + 1]), JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify(audit.verification));
} else console.log(JSON.stringify(audit, null, 2));
