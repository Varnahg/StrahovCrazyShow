/** Pure B5 source identification and bake planning. No files, random state,
 * bitmaps, mesh generation or runtime mutation. Inputs are Blender Z-up/UV. */
import { sample, dot, sub, cross, length, unit } from '../trees-20261025-r5/geometry.mjs';

const UV_EPSILON = 1e-6;
const POSITION_EPSILON = 2e-5; // Float32 positions exported at ~14 m, not double-precision source axes.
const vector = (value, size, label) => {
  if (!Array.isArray(value) || value.length !== size || !value.every(Number.isFinite)) throw Error(`Invalid ${label}`);
  return value;
};
const integer = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(`Invalid ${label}`);
  return value;
};
const bounds = points => [0, 1].map(side => points[0].map((_, axis) => points.reduce((n, p) => side ? Math.max(n, p[axis]) : Math.min(n, p[axis]), side ? -Infinity : Infinity)));
const point = (array, index, size) => Array.from({ length: size }, (_, axis) => array[index * size + axis]);
const near = (a, b, tolerance) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= tolerance);

function photoParts(atlas) {
  if (atlas?.id !== 'LeafSet024' || !near(vector(atlas.atlasMetres, 2, 'atlas scale'), [.4, .4], 1e-12)) throw Error('Expected calibrated LeafSet024 source');
  const result = new Map();
  for (const part of atlas.parts ?? []) {
    if (typeof part.id !== 'string' || result.has(part.id)) throw Error('Duplicate/invalid photographic part');
    const component = atlas.components?.find(c => c.id === part.componentId);
    if (!component?.cutoutHullUvBlender?.length) throw Error('Missing source photographic hull');
    const hull = component.cutoutHullUvBlender.map(uv => vector(uv, 2, 'hull UV'));
    if (hull.flat().some(value => value < 0 || value > 1)) throw Error('Source UV outside atlas');
    const [lo, hi] = bounds(hull), attachment = vector(part.attachmentUvBlender, 2, 'attachment UV'), tip = vector(part.axisTipUvBlender, 2, 'axis UV');
    if (hi[0] <= lo[0] || hi[1] <= lo[1] || length(sub(tip, attachment)) < 1e-8) throw Error('Degenerate photographic part');
    const expected = [lo[1], (lo[1] + hi[1]) / 2, hi[1]].flatMap(y => [lo[0], hi[0]].map(x => [x, y]));
    result.set(part.id, { id: part.id, attachment, tip, expectedNear: expected, expectedMid: expected.filter((_, i) => ![2, 3].includes(i)) });
  }
  if (!result.size) throw Error('Missing photographic parts');
  return result;
}

function sourceBranches(branches) {
  const byId = new Map();
  for (const branch of branches) {
    integer(branch.id, 0, 0x7fffffff, 'branch ID');
    if (byId.has(branch.id) || !Array.isArray(branch.points) || branch.points.length < 2 || branch.radii?.length !== branch.points.length) throw Error('Invalid/duplicate source branch');
    branch.points.forEach(p => vector(p, 3, 'branch point'));
    if (!branch.radii.every(radius => Number.isFinite(radius) && radius > 0)) throw Error('Invalid branch radius');
    if (length(sub(branch.points.at(-1), branch.points[0])) < 1e-10) throw Error('Degenerate branch direction');
    byId.set(branch.id, branch);
  }
  return byId;
}

function connectedLeaves(geometry) {
  const { positions, uvs, indices, ranks } = geometry;
  if (!positions?.length || positions.length % 3 || positions.length > 6_000_000 || uvs?.length !== positions.length / 3 * 2 || ranks?.length !== positions.length / 3 || !indices?.length || indices.length % 3 || indices.length > 12_000_000) throw Error('Invalid/oversized foliage attribute shape');
  for (const array of [positions, uvs]) for (const value of array) if (!Number.isFinite(value)) throw Error('Nonfinite foliage attribute');
  for (const value of uvs) if (value < 0 || value > 1) throw Error('Foliage UV outside atlas');
  for (const rank of ranks) integer(rank, 1, 65534, 'raw component rank');
  const count = ranks.length, parent = Uint32Array.from({ length: count }, (_, i) => i), used = new Uint8Array(count);
  const root = index => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  for (let at = 0; at < indices.length; at += 3) {
    const triangle = [indices[at], indices[at + 1], indices[at + 2]];
    triangle.forEach(index => integer(index, 0, count - 1, 'foliage index'));
    if (new Set(triangle).size !== 3 || triangle.some(index => ranks[index] !== ranks[triangle[0]])) throw Error('Degenerate/mixed-rank triangle');
    for (const index of triangle) { used[index] = 1; parent[root(index)] = root(triangle[0]); }
  }
  const components = new Map();
  for (let i = 0; i < count; i++) {
    if (!used[i]) throw Error('Unreferenced foliage vertex');
    const key = root(i); if (!components.has(key)) components.set(key, { rank: ranks[i], vertices: [], triangles: [] });
    components.get(key).vertices.push(i);
  }
  for (let at = 0; at < indices.length; at += 3) components.get(root(indices[at])).triangles.push(at / 3);
  return [...components.values()];
}

function matchesUv(actual, expected) {
  return actual.length === expected.length && expected.every(uv => actual.filter(value => near(value, uv, UV_EPSILON)).length === 1);
}

function componentNormal(component, geometry) {
  const sum = [0, 0, 0];
  for (const triangle of component.triangles) {
    const [a, b, c] = [0, 1, 2].map(corner => point(geometry.positions, geometry.indices[triangle * 3 + corner], 3));
    const n = cross(sub(b, a), sub(c, a));
    if (length(n) < 1e-12) throw Error('Zero-area leaf triangle');
    for (let axis = 0; axis < 3; axis++) sum[axis] += n[axis];
  }
  if (length(sum) < 1e-12) throw Error('Inconsistent leaf winding');
  return unit(sum);
}

function metricResidual(component, record, photographic, geometry) {
  const axis = unit(sub(photographic.tip, photographic.attachment)), physicalLength = length(sub(photographic.tip, photographic.attachment)) * .4;
  let maximum = 0;
  for (const index of component.vertices) {
    const uv = point(geometry.uvs, index, 2), delta = sub(uv, photographic.attachment).map(value => value * .4);
    const y = dot(delta, axis), bend = .015 * physicalLength * Math.sin(Math.PI * Math.max(0, Math.min(1, y / physicalLength)));
    const expected = Math.sqrt(dot(delta, delta) + bend * bend), actual = length(sub(point(geometry.positions, index, 3), record.anchor));
    maximum = Math.max(maximum, Math.abs(actual - expected));
  }
  if (maximum > POSITION_EPSILON) throw Error('Leaf metric/anchor distance mismatch');
  return maximum;
}

function planeFor(components, geometry, branch) {
  const first = components[0], reference = first.normal, sum = [0, 0, 0];
  for (const component of components) for (let axis = 0; axis < 3; axis++) sum[axis] += component.normal[axis] * (dot(component.normal, reference) < 0 ? -1 : 1);
  const normal = unit(sum), tangent = unit(sub(sample(branch, .9).point, sample(branch, .1).point));
  let up = sub(tangent, normal.map(value => value * dot(tangent, normal)));
  if (length(up) < 1e-6) {
    const seed = Math.abs(normal[2]) < .9 ? [0, 0, 1] : [0, 1, 0];
    up = sub(seed, normal.map(value => value * dot(seed, normal)));
  }
  up = unit(up); const right = unit(cross(up, normal)), anchor = [...first.anchor];
  const projections = components.flatMap(component => component.sourceVertices.map(index => {
    const relative = sub(point(geometry.positions, index, 3), anchor); return [dot(relative, right), dot(relative, up), dot(relative, normal)];
  }));
  const [lo, hi] = bounds(projections), padding = Math.max(hi[0] - lo[0], hi[1] - lo[1]) * .025;
  return { sourcePartIndices: components.map(c => c.sourcePartIndex), anchor, right, up, normal,
    bounds: [[lo[0] - padding, lo[1] - padding], [hi[0] + padding, hi[1] + padding]], depthRange: [lo[2], hi[2]], paddingMetres: padding };
}

function partition(components, splitAngleDegrees) {
  if (components.length < 2) return [components];
  let best = -1, seeds = [0, 1];
  for (let a = 0; a < components.length; a++) for (let b = a + 1; b < components.length; b++) {
    const distance = 1 - Math.abs(dot(components[a].normal, components[b].normal));
    if (distance > best + 1e-12) { best = distance; seeds = [a, b]; }
  }
  if (best <= 1 - Math.cos(splitAngleDegrees * Math.PI / 180)) return [components];
  const result = [[], []];
  for (const component of components) {
    const distances = seeds.map(index => 1 - Math.abs(dot(component.normal, components[index].normal)));
    result[distances[1] < distances[0] ? 1 : 0].push(component);
  }
  return result.filter(group => group.length).sort((a, b) => a[0].sourcePartIndex - b[0].sourcePartIndex);
}

/** Identifies each disconnected photographed leaf by rank + unique UV footprint.
 * No metadata is assigned from vertex order. sourcePartIndex is a row in the
 * caller's pinned componentMetadata, never a new world/source-tree identity. */
export function buildRankClusterPlan({ source, geometry, parts, branches, atlas }, { splitAngleDegrees = 35 } = {}) {
  if (source?.coordinateSpace !== 'root-local-blender-z-up' || typeof source.sourceTreeId !== 'string' || typeof source.geometrySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.geometrySha256) || typeof source.metadataSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.metadataSha256)) throw Error('Explicit pinned source identity/coordinate space required');
  vector(source.sourceRootXZ, 2, 'source root');
  if (!Number.isFinite(source.trunkRadius) || source.trunkRadius <= 0 || !Number.isFinite(splitAngleDegrees) || splitAngleDegrees < 0 || splitAngleDegrees > 90) throw Error('Invalid radius/split angle');
  const photographs = photoParts(atlas), byBranch = sourceBranches(branches), metadata = new Map(), rowIds = new Set();
  if (!Array.isArray(parts) || !parts.length) throw Error('Missing component metadata');
  for (const part of parts) {
    integer(part.sourcePartIndex, 0, 0x7fffffff, 'metadata row'); integer(part.rank, 1, 65534, 'metadata rank');
    const key = `${part.rank}:${part.partId}`, branch = byBranch.get(part.branchId);
    if (rowIds.has(part.sourcePartIndex) || metadata.has(key)) throw Error('Ambiguous/duplicate component metadata');
    if (!branch || !photographs.has(part.partId)) throw Error('Missing source branch/photographic part');
    vector(part.anchor, 3, 'source anchor');
    if (!Number.isFinite(part.branchT) || part.branchT < 0 || part.branchT > 1) throw Error('Invalid branch parameter');
    const expected = sample(branch, part.branchT);
    if (!near(expected.point, part.anchor, 1e-8) || !Number.isFinite(part.supportRadius) || Math.abs(expected.radius - part.supportRadius) > 1e-8) throw Error('Source branch anchor/radius mismatch');
    metadata.set(key, part); rowIds.add(part.sourcePartIndex);
  }
  const leaves = connectedLeaves(geometry), used = new Set(), groups = new Map();
  for (const leaf of leaves) {
    if (![4, 6].includes(leaf.vertices.length) || leaf.triangles.length !== (leaf.vertices.length === 4 ? 2 : 4)) throw Error('Unsupported source leaf topology');
    const uv = leaf.vertices.map(index => point(geometry.uvs, index, 2));
    const matches = [...photographs.values()].filter(part => matchesUv(uv, leaf.vertices.length === 4 ? part.expectedMid : part.expectedNear));
    if (matches.length !== 1) throw Error('Missing/ambiguous UV photographic footprint');
    const photographic = matches[0], record = metadata.get(`${leaf.rank}:${photographic.id}`);
    if (!record || used.has(record.sourcePartIndex)) throw Error('Missing/duplicate geometry-to-metadata component');
    used.add(record.sourcePartIndex);
    const component = { sourcePartIndex: record.sourcePartIndex, rank: leaf.rank, partId: record.partId, branchId: record.branchId, branchT: record.branchT,
      anchor: [...record.anchor], supportRadius: record.supportRadius, sourceVertices: leaf.vertices, sourceTriangles: leaf.triangles,
      uvBounds: bounds(uv), positionBounds: bounds(leaf.vertices.map(index => point(geometry.positions, index, 3))),
      normal: componentNormal(leaf, geometry), maximumMetricResidualMetres: metricResidual(leaf, record, photographic, geometry) };
    if (!groups.has(leaf.rank)) groups.set(leaf.rank, []); groups.get(leaf.rank).push(component);
  }
  if (used.size !== parts.length) throw Error('Source metadata contains missing physical components');
  const result = [...groups].sort((a, b) => a[0] - b[0]).map(([rank, components]) => {
    components.sort((a, b) => a.sourcePartIndex - b.sourcePartIndex);
    if (components.length > 6 || new Set(components.map(c => c.branchId)).size !== 1) throw Error('Source rank is not one bounded branch group');
    const branch = byBranch.get(components[0].branchId), split = partition(components, splitAngleDegrees);
    return { rank, branchId: branch.id, parentId: branch.parent, components,
      onePlane: [planeFor(components, geometry, branch)], splitPlanes: split.map(members => planeFor(members, geometry, branch)) };
  });
  const planes = result.reduce((sum, group) => sum + group.splitPlanes.length, 0);
  return { version: 1, comparisonOnly: true, source: structuredClone(source), splitAngleDegrees,
    groups: result, coverage: { photographicParts: leaves.length, metadataParts: parts.length, rankGroups: result.length,
      sourceVertices: geometry.ranks.length, sourceTriangles: geometry.indices.length / 3, onePlaneCount: result.length, splitPlaneCount: planes,
      onePlaneTriangles: result.length * 2, splitPlaneTriangles: planes * 2,
      seasonPartCounts: Object.fromEntries([0, .25, .5, .75, 1].map(amount => [amount, result.filter(group => group.rank <= Math.floor(amount * 65535)).reduce((sum, group) => sum + group.components.length, 0)])) },
    limitations: ['Projection frames only: no bitmap, alpha/mip coverage, silhouette, GPU or runtime acceptance.',
      'Metric residual checks scale and anchor distance, not the leaf orientation or roll.',
      'Source vertices, triangles, UV and anchors are referenced unchanged; proposed planes never duplicate a physical component.'] };
}
