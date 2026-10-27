/** Explicit, pinned 44-leaf B5 source probe. Import performs no IO.
 * Run only in the coordinator's agreed CPU window; never creates bitmap/GLB. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readSeasonalGlb, seasonalAccessorBytes } from '../tree-seasonal-stream.mjs';
import { buildRankClusterPlan } from './rank-clusters.mjs';

export const B5_SOURCE_PINS = Object.freeze({
  geometry: { path: 'public/models/vegetation/seasonal-r5/own-broadleaf.glb', bytes: 49399036, sha256: '9113d99327c52fc7de197cf8857b562a8ad25fa375db39905299a4722b433df7' },
  originalGeometry: { path: '.cache/trees-pilot-20261025/r4-optimized/models/own-broadleaf.glb', bytes: 43910924, sha256: '814af0881a54f5f82d101f29161be28e654320f1c09b1d71279981fa72b55d6e' },
  metadata: { path: '.cache/trees-pilot-20261025/r4-optimized/models/pilot-manifest.json', bytes: 61059816, sha256: '8dc3f4554dc729d7baa67a54a5c78e7d524b0888d8ebdbe60fbae5ccf283f2f6' },
  axes: { path: '.cache/trees-pilot-20261025/own-broadleaf-axes.json', bytes: 2664919, sha256: '0351435a583ad136e09ad93a99bb2e997c48a67e36c99ca80eaa5e5b042147a8' },
  atlas: { path: 'shared/data/tree-leaf-components.json', sha256: '022533e3a97b5fda8d025914e9137dd8b897dc6199a032b7df60737cf13a50a3' },
});
export const B5_SAMPLE_BRANCHES = Object.freeze([4118, 4119, 4120]);
export const B5_SAMPLE_RANKS = Object.freeze([1069, 7034, 10847, 24933, 28922, 32722, 36376, 55396, 57879]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function pinned(root, descriptor) {
  const target = path.resolve(root, descriptor.path);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw Error('Source escaped project root');
  const bytes = fs.readFileSync(target);
  if ((descriptor.bytes !== undefined && bytes.length !== descriptor.bytes) || sha(bytes) !== descriptor.sha256) throw Error(`Pinned source changed: ${descriptor.path}`);
  return bytes;
}

function primitive(glb, lod) {
  const nodes = glb.json.nodes.filter(node => node.name === `own-broadleaf__lod${lod}__foliage` && node.extras?.archetypeId === 'own-broadleaf' && node.extras?.sourceTreeId === 'ipr-crown-014' && node.extras?.lod === lod && node.extras?.role === 'foliage');
  if (nodes.length !== 1 || nodes[0].matrix || nodes[0].translation || nodes[0].rotation || nodes[0].scale) throw Error('Expected exact root-local B5 foliage node');
  const mesh = glb.json.meshes[nodes[0].mesh];
  if (mesh?.primitives?.length !== 1) throw Error('Expected one B5 foliage primitive');
  return mesh.primitives[0];
}

function attribute(glb, index, type, components) {
  const definition = glb.json.accessors[index], bytes = seasonalAccessorBytes(glb, index);
  if (!definition || definition.componentType !== type || definition.type !== components) throw Error('Unexpected B5 accessor type');
  // Copy into a suitably aligned owner, independent of Node Buffer slab offsets.
  const copy = Uint8Array.from(bytes).buffer;
  return type === 5126 ? new Float32Array(copy) : type === 5123 ? new Uint16Array(copy) : new Uint32Array(copy);
}

/** Only selected source ranks are compacted. The map back to the original
 * accessor vertices/triangles is retained, including the coordinate conversion. */
export function extractRankSubset({ positions, uvs, indices, colors }, selectedRanks) {
  if (!positions.length || positions.length % 3 || uvs.length !== positions.length / 3 * 2 || colors.length !== positions.length / 3 * 4 || indices.length % 3) throw Error('Invalid subset attribute shape');
  const wanted = new Set(selectedRanks), sourceTriangles = [], sourceVertices = [], remap = new Map(), selectedIndices = [];
  if (!wanted.size || wanted.size !== selectedRanks.length || [...wanted].some(rank => !Number.isSafeInteger(rank) || rank < 1 || rank > 65534)) throw Error('Invalid selected ranks');
  for (let at = 0; at < indices.length; at += 3) {
    const triangle = [indices[at], indices[at + 1], indices[at + 2]];
    if (triangle.some(index => !Number.isSafeInteger(index) || index < 0 || index >= positions.length / 3)) throw Error('Subset index outside vertices');
    const rank = colors[triangle[0] * 4 + 3];
    if (triangle.some(index => colors[index * 4 + 3] !== rank)) throw Error('Subset triangle crosses ranks');
    if (!wanted.has(rank)) continue;
    sourceTriangles.push(at / 3);
    for (const index of triangle) {
      if (!remap.has(index)) { remap.set(index, sourceVertices.length); sourceVertices.push(index); }
      selectedIndices.push(remap.get(index));
    }
  }
  const selectedPositions = [], selectedUvs = [], ranks = [];
  for (const index of sourceVertices) {
    if (![0, 1, 2].every(channel => colors[index * 4 + channel] === 65535)) throw Error('Unexpected source rank RGB');
    const p = positions.subarray(index * 3, index * 3 + 3), uv = uvs.subarray(index * 2, index * 2 + 2);
    selectedPositions.push(p[0], -p[2], p[1]); selectedUvs.push(uv[0], 1 - uv[1]); ranks.push(colors[index * 4 + 3]);
  }
  if (new Set(ranks).size !== wanted.size) throw Error('Selected source rank is absent');
  return { geometry: { positions: selectedPositions, uvs: selectedUvs, indices: selectedIndices, ranks },
    sourceVertices, sourceTriangles, coordinateConversion: { positions: '[x,-z,y] glTF Y-up to Blender Z-up', uv: '[u,1-v] glTF to Blender UV' } };
}

export function prepareB5FarSample({ root = process.cwd() } = {}) {
  const current = readSeasonalGlb(pinned(root, B5_SOURCE_PINS.geometry));
  const original = readSeasonalGlb(pinned(root, B5_SOURCE_PINS.originalGeometry));
  const near = primitive(current, 0), oldNear = primitive(original, 0), mid = primitive(current, 1);
  const unchanged = {};
  for (const [semantic, index] of Object.entries({ INDICES: near.indices, ...near.attributes })) {
    const bytes = seasonalAccessorBytes(current, index), old = seasonalAccessorBytes(original, semantic === 'INDICES' ? oldNear.indices : oldNear.attributes[semantic]);
    if (!bytes.equals(old)) throw Error(`R5 near diverged from metadata's R4 geometry: ${semantic}`);
    unchanged[semantic] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  const metadata = JSON.parse(pinned(root, B5_SOURCE_PINS.metadata)), axes = JSON.parse(pinned(root, B5_SOURCE_PINS.axes));
  const atlas = JSON.parse(pinned(root, B5_SOURCE_PINS.atlas)).atlases.find(item => item.id === 'LeafSet024');
  const source = metadata.variants.find(variant => variant.id === 'own-broadleaf');
  if (source?.sourceTreeId !== 'ipr-crown-014' || axes.sourceTreeId !== source.sourceTreeId || JSON.stringify(axes.sourceRootXZ) !== JSON.stringify(source.sourceRootXZ) || axes.trunkRadius !== source.trunkRadius) throw Error('B5 source root/identity/radius mismatch');
  const parts = source.foliage.componentMetadata.map((part, index) => ({ ...part, sourcePartIndex: index })).filter(part => B5_SAMPLE_BRANCHES.includes(part.branchId));
  const ranks = [...new Set(parts.map(part => part.rank))].sort((a, b) => a - b);
  if (parts.length !== 44 || JSON.stringify(ranks) !== JSON.stringify(B5_SAMPLE_RANKS)) throw Error('Pinned B5 subtree inventory changed');
  const color = current.json.accessors[mid.attributes.COLOR_0];
  if (color.normalized !== true) throw Error('Expected normalized uint16 source ranks');
  const indexType = current.json.accessors[mid.indices]?.componentType;
  if (![5123, 5125].includes(indexType)) throw Error('Unexpected B5 index type');
  const subset = extractRankSubset({ positions: attribute(current, mid.attributes.POSITION, 5126, 'VEC3'), uvs: attribute(current, mid.attributes.TEXCOORD_0, 5126, 'VEC2'),
    colors: attribute(current, mid.attributes.COLOR_0, 5123, 'VEC4'), indices: attribute(current, mid.indices, indexType, 'SCALAR') }, B5_SAMPLE_RANKS);
  const plan = buildRankClusterPlan({ source: { sourceTreeId: source.sourceTreeId, prototypeId: source.id, sourceRootXZ: source.sourceRootXZ, trunkRadius: source.trunkRadius,
    coordinateSpace: 'root-local-blender-z-up', geometrySha256: B5_SOURCE_PINS.geometry.sha256, metadataSha256: B5_SOURCE_PINS.metadata.sha256,
    axesSha256: B5_SOURCE_PINS.axes.sha256, sourceLod: 1, sourceBranchIds: [...B5_SAMPLE_BRANCHES] }, geometry: subset.geometry, parts, branches: axes.axes, atlas });
  if (plan.coverage.photographicParts !== 44 || plan.coverage.rankGroups !== 9 || plan.coverage.sourceTriangles !== 88) throw Error('Unexpected full-MID subtree coverage');
  return { ...plan, inputPins: B5_SOURCE_PINS, unchangedR4NearAccessors: unchanged,
    sourceMapping: { originalVertexIndices: subset.sourceVertices, originalTriangleIndices: subset.sourceTriangles, ...subset.coordinateConversion,
      accessorIndices: { POSITION: mid.attributes.POSITION, TEXCOORD_0: mid.attributes.TEXCOORD_0, COLOR_0: mid.attributes.COLOR_0, INDICES: mid.indices } } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--sample') throw Error('Explicit coordinated probe required: node scripts/trees-20261026-far/prepare.mjs --sample');
  const plan = prepareB5FarSample(), bytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
  if (bytes.length > 1024 * 1024) throw Error('Small source probe exceeded one MiB; no output written');
  const output = '.cache/trees-far-clusters-20261026/b5-subtree-4118.json';
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ output, bytes: bytes.length, sha256: sha(bytes), coverage: plan.coverage }, null, 2));
}
