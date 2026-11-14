import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const prototypeId = "catalog-ipr-b6-south-conifer";
export const modelDir = "/models/vegetation/seasonal-catalog/8b60d5845e72d3b0/ipr-b6-south-conifer";
export const manifestUrl = "/models/vegetation/seasonal-catalog/17d138291328bad0/runtime-contract.json";
export const originalHashes = [
  "4dbb0b36efe5a31d757090834d9a6c6521d3e2ebcb008e561d97d9a1ff76969e",
  "923f6335421d4a7f84ecb53eeab1a21cc8550775dea498b3444e0bcf2d2a47f2",
];
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function readGlb(raw) {
  assert.equal(raw.toString("ascii", 0, 4), "glTF");
  assert.equal(raw.readUInt32LE(4), 2);
  assert.equal(raw.readUInt32LE(8), raw.length);
  const endJson = 20 + raw.readUInt32LE(12);
  assert.equal(raw.readUInt32LE(16), 0x4e4f534a);
  assert.equal(raw.readUInt32LE(endJson + 4), 0x004e4942);
  assert.equal(raw.readUInt32LE(endJson), raw.length - endJson - 8);
  const doc = JSON.parse(raw.subarray(20, endJson));
  const bin = raw.subarray(endJson + 8);
  const accessor = (index) => {
    const a = doc.accessors[index];
    const view = doc.bufferViews[a.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const ArrayType = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
    assert.ok(width && ArrayType && view.buffer === 0 && !view.byteStride && !a.sparse);
    const length = a.count * width * ArrayType.BYTES_PER_ELEMENT;
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    assert.ok(length <= view.byteLength - (a.byteOffset ?? 0) && offset + length <= bin.length);
    const bytes = bin.subarray(offset, offset + length);
    const data = new ArrayType(bytes.buffer, bytes.byteOffset, a.count * width);
    return { data, width, bytes, count: a.count };
  };
  return { doc, bin, accessor };
}

const triangleArea = (uv, a, b, c) =>
  (uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1]) -
  (uv[b * 2 + 1] - uv[a * 2 + 1]) * (uv[c * 2] - uv[a * 2]);

function cornerFan(ring, area, sign) {
  for (let i = 0; i < ring.length; i++) {
    const ordered = [...ring.slice(i), ...ring.slice(0, i)];
    if (ordered.slice(1, -1).every((v, j) => sign * area(ordered[0], v, ordered[j + 2]) > 1e-10))
      return ordered;
  }
  throw new Error("Karta nemá platný triangulovaný obrys");
}

function proveCard(centre, ring, positions, normals, uv, colours, proof) {
  const area = (a, b, c) => triangleArea(uv, a, b, c);
  const sign = Math.sign(area(centre, ring[0], ring[1]));
  const all = [centre, ...ring];
  assert.equal(new Set(all).size, all.length);
  const rank = colours[centre * 4 + 3];
  for (const v of all) {
    assert.equal(colours[v * 4 + 3], rank);
    assert.ok(colours.subarray(v * 4, v * 4 + 3).every((c) => c === 65535));
  }
  for (let i = 0; i < ring.length; i++) {
    const next = ring[(i + 1) % ring.length];
    assert.ok(sign * area(centre, ring[i], next) > 1e-10);
    assert.ok(sign * area(ring[i], next, ring[(i + 2) % ring.length]) >= -1e-10);
  }
  const a = ring[0];
  let b, c, basisArea = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const det = area(a, ring[i], ring[j]);
      if (Math.abs(det) > Math.abs(basisArea)) {
        [b, c, basisArea] = [ring[i], ring[j], det];
      }
    }
  }
  assert.ok(basisArea);
  let minY = Infinity, maxY = -Infinity;
  const normalLength = Math.hypot(...normals.subarray(a * 3, a * 3 + 3));
  for (const v of all) {
    const w = area(a, v, c) / basisArea;
    const z = area(a, b, v) / basisArea;
    const residual = (data) => Math.hypot(...[0, 1, 2].map((k) =>
      data[3 * v + k] - ((1 - w - z) * data[3 * a + k] + w * data[3 * b + k] + z * data[3 * c + k])));
    proof.positionResidual = Math.max(proof.positionResidual, residual(positions));
    proof.normalResidual = Math.max(proof.normalResidual, residual(normals));
    const projection = [0, 1, 2].reduce((s, k) => s + normals[3 * a + k] * normals[3 * v + k], 0) / normalLength;
    proof.minNormalProjection = Math.min(proof.minNormalProjection, projection);
    minY = Math.min(minY, positions[3 * v + 1]);
    maxY = Math.max(maxY, positions[3 * v + 1]);
  }
  proof.maxCardHeightSpan = Math.max(proof.maxCardHeightSpan, maxY - minY);
  return cornerFan(ring, area, sign);
}

function packGlb(doc, bin) {
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + bin.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binHeader, bin]);
}

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  return { min, max };
}

export function reduceFoliage(raw, lod) {
  assert.ok(lod === 0 || lod === 1);
  assert.equal(sha256(raw), originalHashes[lod]);
  const { doc, accessor } = readGlb(raw);
  const node = doc.nodes.find(({ extras }) => extras.role === "foliage");
  assert.equal(node.name, `${prototypeId}__lod${lod}__foliage`);
  const p = doc.meshes[node.mesh].primitives[0];
  const { POSITION, NORMAL, TEXCOORD_0, COLOR_0 } = p.attributes;
  const source = accessor(p.indices).data;
  const positions = accessor(POSITION).data;
  const normals = accessor(NORMAL).data;
  const uv = accessor(TEXCOORD_0).data;
  const colours = accessor(COLOR_0).data;
  const count = positions.length / 3;
  const cards = 12_258;
  const sides = 12;
  assert.equal(source.length, cards * sides * 3);
  assert.equal(count, cards * (sides + 1));
  const proof = { cards, positionResidual: 0, normalResidual: 0, minNormalProjection: 1, maxCardHeightSpan: 0 };
  const indices = new Uint32Array(cards * (sides - 2) * 3);
  const owned = new Uint8Array(count);
  let written = 0;
  for (let offset = 0; offset < source.length; offset += sides * 3) {
    const centre = source[offset];
    const ring = Array.from({ length: sides }, (_, i) => source[offset + i * 3 + 1]);
    for (let i = 0; i < sides; i++) {
      assert.equal(source[offset + i * 3], centre);
      assert.equal(source[offset + i * 3 + 2], ring[(i + 1) % sides]);
    }
    for (const v of [centre, ...ring]) {
      assert.ok(v < count && !owned[v], "Vrchol je sdílen mezi kartami");
      owned[v] = 1;
    }
    const corners = proveCard(centre, ring, positions, normals, uv, colours, proof);
    for (let i = 1; i < sides - 1; i++) {
      indices[written++] = corners[0];
      indices[written++] = corners[i];
      indices[written++] = corners[i + 1];
    }
  }
  // Dva konvexní interpolanty téhož afinního pole se liší nejvýše 2× reziduum.
  const positionBoundMetres = 2 * proof.positionResidual;
  const normalAngleBoundDegrees = 2 * Math.asin(proof.normalResidual / proof.minNormalProjection) * 180 / Math.PI;
  // Zbytek lineární interpolace smoothstep: max |f''| × (rozsah y)^2 / 8.
  // Dva triangulované povrchy, max rychlost 16 m/s a společný gust do 0,77.
  const windOffset = 16 * 0.77 * 0.008;
  const windSlope = windOffset * 1.5 / 8.5;
  const windBoundMetres = positionBoundMetres * (1 + windSlope) +
    windOffset * (6 / 8.5 ** 2) * proof.maxCardHeightSpan ** 2 / 4;
  assert.ok(positionBoundMetres <= 5e-6 && normalAngleBoundDegrees <= 0.55 && windBoundMetres <= 5e-4);
  const used = new Uint8Array(count);
  for (const index of indices) used[index] = 1;
  const retained = Array.from(used.keys()).filter((index) => used[index]);
  assert.equal(retained.length, count - cards);
  const remap = new Uint32Array(count);
  retained.forEach((old, next) => { remap[old] = next; });
  const replacements = new Map();
  for (const i of Object.values(p.attributes)) {
    const original = accessor(i);
    const row = original.bytes.length / original.count;
    const bytes = Buffer.alloc(retained.length * row);
    retained.forEach((old, next) => original.bytes.copy(bytes, next * row, old * row, (old + 1) * row));
    replacements.set(i, { bytes, count: retained.length });
  }
  assert.deepEqual(bounds(new Float32Array(replacements.get(POSITION).bytes.buffer)), bounds(positions));
  const mapped = indices.map((index) => remap[index]);
  replacements.set(p.indices, { bytes: Buffer.from(mapped.buffer), count: mapped.length });
  const views = [];
  const chunks = [];
  let offset = 0;
  for (let i = 0; i < doc.accessors.length; i++) {
    const a = doc.accessors[i];
    const replacement = replacements.get(i);
    const bytes = replacement?.bytes ?? accessor(i).bytes;
    assert.equal(a.bufferView, i);
    views.push({ ...doc.bufferViews[i], byteOffset: offset, byteLength: bytes.length });
    const padding = Buffer.alloc((4 - bytes.length % 4) % 4);
    chunks.push(bytes, padding);
    offset += bytes.length + padding.length;
  }
  for (const [i, value] of replacements) doc.accessors[i].count = value.count;
  doc.bufferViews = views;
  doc.buffers[0].byteLength = offset;
  const candidate = packGlb(doc, Buffer.concat(chunks));
  return { candidate, proof: { ...proof, positionBoundMetres, normalAngleBoundDegrees, windBoundMetres,
    removedTriangles: source.length / 3 - indices.length / 3, removedVertices: count - retained.length } };
}

export function makeCandidate() {
  const manifest = JSON.parse(readFileSync("public" + manifestUrl));
  const prototype = manifest.prototypes[prototypeId];
  const outputs = originalHashes.map((_, lod) => {
    const inputUrl = `${modelDir}/lod${lod}.glb`;
    const raw = readFileSync("public" + inputUrl);
    const { candidate, proof } = reduceFoliage(raw, lod);
    const output = { ...prototype.lods[lod], url: `${modelDir}/lod${lod}-fan-v1.glb`,
      bytes: candidate.length, sha256: sha256(candidate) };
    prototype.lods[lod] = output;
    return { inputUrl, inputBytes: raw.length, inputSha256: originalHashes[lod], output, candidate, proof };
  });
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  const descriptor = { url: manifestUrl, bytes: manifestBytes.length, sha256: sha256(manifestBytes) };
  return { outputs, manifestBytes, descriptor };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 1 && args[0] === "--dry-run" ||
    args.length === 2 && args[0] === "--output", "Použití: --dry-run | --output EXISTUJÍCÍ_ADRESÁŘ");
  const { outputs, manifestBytes, descriptor } = makeCandidate();
  const receipt = { node: process.version, descriptor, lods: outputs.map(({ candidate, ...row }) => row) };
  if (args[0] === "--output") {
    for (const [lod, item] of outputs.entries())
      writeFileSync(join(args[1], `lod${lod}-fan-v1.glb`), item.candidate, { flag: "wx" });
    writeFileSync(join(args[1], "runtime-contract.json"), manifestBytes, { flag: "wx" });
    writeFileSync(join(args[1], "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify(receipt, null, 2));
}
