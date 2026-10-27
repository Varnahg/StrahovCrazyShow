import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { supportingPolygon, area, nearWood, sample, sub, shootFrame, attachmentAudit } from './geometry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.cache/trees-r5-authoring-20261025');
const source = path.join(root, '.cache/trees-pilot-20261025/r4-optimized');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const digest = p => ({ path: path.relative(root, p).replaceAll('\\', '/'), sha256: hash(p), bytes: fs.statSync(p).size });
function sourceFile(relative) {
  // Immutable source inputs belong to an explicit preparation run. Importing
  // constants/helpers must also work in a clean checkout without private cache.
  const checkpoint = read(path.join(source, 'checkpoint.json'));
  const file = path.join(source, relative), entry = checkpoint.entries.find(e => e.path === relative);
  if (!entry || hash(file) !== entry.sha256) throw Error(`R4 immutable hash mismatch: ${relative}`);
  return file;
}

function primitive(file, lod, role) {
  const bytes = fs.readFileSync(file), jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  const node = json.nodes.find(n => n.extras?.lod === lod && n.extras?.role === role);
  const p = json.meshes[node.mesh].primitives[0];
  function data(index) {
    const a = json.accessors[index], v = json.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const stride = { 5126: 4, 5125: 4, 5123: 2 }[a.componentType];
    if (v.byteStride) throw Error('Unexpected interleaved R4 source');
    return Array.from({ length: a.count * size }, (_, i) => a.componentType === 5126 ? binary.readFloatLE(offset + i * stride) : a.componentType === 5123 ? binary.readUInt16LE(offset + i * stride) : binary.readUInt32LE(offset + i * stride));
  }
  return { positions: data(p.attributes.POSITION), indices: data(p.indices), uvs: data(p.attributes.TEXCOORD_0), colors: data(p.attributes.COLOR_0) };
}

function extractRank(mesh, rank) {
  const selected = new Set();
  for (const index of mesh.indices) if (mesh.colors[index * 4 + 3] === rank) selected.add(index);
  const order = [...selected], remap = new Map(order.map((old, i) => [old, i]));
  const positions = order.map(i => [mesh.positions[i * 3], -mesh.positions[i * 3 + 2], mesh.positions[i * 3 + 1]]);
  const uvs = order.map(i => [mesh.uvs[i * 2], 1 - mesh.uvs[i * 2 + 1]]);
  const faces = [];
  for (let i = 0; i < mesh.indices.length; i += 3) if (selected.has(mesh.indices[i])) faces.push(mesh.indices.slice(i, i + 3).map(j => remap.get(j)));
  return { positions, uvs, faces };
}

export const FIR_SUPPORT_ANGLES = {
  'upper-right-spray': [30, 150, 240, 330], 'upper-left-spray': [30, 150, 210, 300],
  'upper-single-twig': [30, 150, 210, 330], 'middle-right-twig': [30, 60, 150, 300],
  'middle-left-twig': [30, 150, 210, 330], 'lower-left-spray': [30, 150, 240, 300],
  'lower-right-spray': [30, 150, 210, 330],
};

export function prepare() {
  fs.mkdirSync(cache, { recursive: true });
  const manifestFile = sourceFile('models/pilot-manifest.json'), manifest = read(manifestFile);
  const componentsFile = path.join(root, 'shared/data/tree-leaf-components.json');
  if (hash(componentsFile) !== '022533e3a97b5fda8d025914e9137dd8b897dc6199a032b7df60737cf13a50a3') throw Error('Component source changed');
  const atlas = read(componentsFile).atlases.find(a => a.id === 'fir_tree_01');
  const conifer = manifest.variants.find(v => v.id === 'own-conifer');
  const coniferMesh = primitive(sourceFile('models/own-conifer.glb'), 0, 'foliage');
  const fir = atlas.parts.map(part => {
    const component = atlas.components.find(c => c.id === part.componentId);
    const polygon = supportingPolygon(component.cutoutHullPixels, FIR_SUPPORT_ANGLES[part.id]);
    const quad = supportingPolygon(component.cutoutHullPixels, []);
    const toUv = points => points.slice().reverse().map(p => [p[0] / atlas.atlasPixels[0], 1 - p[1] / atlas.atlasPixels[1]]);
    const sourcePart = conifer.foliage.componentMetadata.find(p => p.partId === part.id);
    return { ...part, sourcePart, sourceTreeId: conifer.sourceTreeId, sourceRootXZ: conifer.sourceRootXZ, trunkRadius: conifer.trunkRadius,
      sourceGeometry: extractRank(coniferMesh, sourcePart.rank), hullUv: component.cutoutHullUvBlender, polygonUv: toUv(polygon), quadUv: toUv(quad),
      supportingAnglesPixels: FIR_SUPPORT_ANGLES[part.id], baselineTriangles: 12, polygonTriangles: polygon.length - 2, quadTriangles: 2,
      areaRelativeToR4: area(polygon) / area(component.cutoutHullPixels), quadAreaRelativeToR4: area(quad) / area(component.cutoutHullPixels) };
  });
  const broadleaf = manifest.variants.find(v => v.id === 'own-broadleaf');
  const axesFile = path.join(root, '.cache/trees-pilot-20261025/own-broadleaf-axes.json'), axes = read(axesFile);
  const groups = new Map();
  for (const part of broadleaf.foliage.componentMetadata) {
    if (!groups.has(part.rank)) groups.set(part.rank, []);
    groups.get(part.rank).push(part);
  }
  const farRanks = new Set(broadleaf.foliage.lods[2].ranks);
  const chosen = [...groups.entries()].filter(([rank, parts]) => parts.length === 6 && farRanks.has(rank) && axes.axes[parts[0].branchId].depth === 5)
    .sort((a, b) => Math.abs(a[0] - 32768) - Math.abs(b[0] - 32768))[0];
  const [rank, parts] = chosen, branch = axes.axes[parts[0].branchId];
  const glbFile = sourceFile('models/own-broadleaf.glb'), mesh = primitive(glbFile, 0, 'foliage');
  const { positions, uvs, faces } = extractRank(mesh, rank);
  const anchor = parts[0].anchor;
  const frame = shootFrame(positions, anchor, sub(sample(branch, .9).point, sample(branch, .1).point));
  const parent = axes.axes[branch.parent], descendants = axes.axes.filter(b => b.id === parent.id || b.parent === parent.id);
  const descendantIds = new Set(descendants.map(b => b.id));
  const futureParts = broadleaf.foliage.componentMetadata.filter(p => descendantIds.has(p.branchId));
  const wood = [];
  for (const id of ['own-broadleaf', 'own-conifer']) {
    const file = path.join(root, `.cache/trees-pilot-20261025/${id}-axes.json`), input = read(file);
    const variant = manifest.variants.find(v => v.id === id);
    const prior = variant.export.meshes.find(m => m.role === 'wood' && m.name.includes('__lod0__'));
    for (const part of variant.foliage.componentMetadata) {
      const expected = sample(input.axes[part.branchId], part.branchT).point;
      if (Math.hypot(...sub(expected, part.anchor)) > 1e-8) throw Error('Source axes no longer match immutable R4 anchors');
    }
    for (const [candidateId, options] of [['conservative', {}], ['projection075', { deviationPixels: .75, higherOrderSides: 6, terminalRadiusCap: null }]]) {
      const candidate = nearWood(input.axes, options);
      candidate.audit.attachments = attachmentAudit(candidate.branches, variant.foliage.componentMetadata);
      wood.push({ id, candidateId, source: digest(file), sourceRootXZ: input.sourceRootXZ, trunkRadius: input.trunkRadius,
        baselineTriangles: prior.triangles, ...candidate });
    }
  }
  const output = { version: 1, comparisonOnly: true, sourceCheckpoint: digest(path.join(source, 'checkpoint.json')),
    sourceMaster: digest(sourceFile('tree-pilots.blend')), sourceManifest: digest(manifestFile), components: digest(componentsFile),
    sourceGeometry: digest(glbFile), sourceAxes: digest(axesFile), fir,
    shoot: { sourceTreeId: broadleaf.sourceTreeId, sourceRootXZ: broadleaf.sourceRootXZ, trunkRadius: broadleaf.trunkRadius,
      branchId: branch.id, parentId: branch.parent, rank, parts, positions, uvs, faces, frame,
      materialKey: 'LeafSet024-shoot-r5', futureParentSubtree: { parentId: parent.id, branchIds: [...descendantIds],
        photographicParts: futureParts.length, ranks: [...new Set(futureParts.map(p => p.rank))], status: 'plan-only; multiple source rank groups cannot become one seasonal rank without a new contract' } },
    nearWood: wood };
  const outputFile = path.join(cache, 'prepared.json');
  fs.writeFileSync(outputFile, JSON.stringify(output) + '\n');
  const summary = { prepared: digest(outputFile), fir: fir.map(p => ({ id: p.id, polygonTriangles: p.polygonTriangles, areaRatio: p.areaRelativeToR4 })),
    shoot: { rank, branchId: branch.id, parts: parts.length, triangles: faces.length, frame, futureParentSubtree: output.shoot.futureParentSubtree },
    nearWood: wood.map(w => ({ id: w.id, candidateId: w.candidateId, baselineTriangles: w.baselineTriangles, ...w.audit })) };
  fs.writeFileSync(path.join(cache, 'preparation-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepare();
