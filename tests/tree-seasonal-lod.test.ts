import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
// @ts-ignore Offline authoring helper is intentionally native ESM, not client code.
import { area, contains, supportingPolygon, fanTriangles, nearWood, shootFrame, dot, triangleDistance, attachmentAudit } from '../scripts/trees-20261025-r5/geometry.mjs';
// @ts-ignore Offline authoring helper.
import { FIR_SUPPORT_ANGLES } from '../scripts/trees-20261025-r5/prepare.mjs';

test('authoring module imports without private cache while explicit preparation still requires its pinned inputs', () => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(tempRoot, 'tree-r5-import-'));
  try {
    const directory = path.join(fixture, 'scripts', 'trees-20261025-r5');
    fs.mkdirSync(directory, { recursive: true });
    for (const file of ['prepare.mjs', 'geometry.mjs'])
      fs.copyFileSync(path.resolve('scripts/trees-20261025-r5', file), path.join(directory, file));
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { FIR_SUPPORT_ANGLES, prepare } from './scripts/trees-20261025-r5/prepare.mjs';
      assert.equal(Object.keys(FIR_SUPPORT_ANGLES).length, 7);
      assert.deepEqual(FIR_SUPPORT_ANGLES['lower-right-spray'], [30, 150, 210, 330]);
      assert.equal(typeof prepare, 'function');
      assert.equal(fs.existsSync('.cache'), false, 'import must not read or create authoring cache');
      assert.throws(() => prepare(), error => error.code === 'ENOENT' && error.path.endsWith('checkpoint.json'));
      console.log('clean import PASS; missing pinned input rejected');
    `], { cwd: fixture, encoding: 'utf8' });
    assert.match(output, /clean import PASS; missing pinned input rejected/);
  } finally {
    const resolved = fs.realpathSync(fixture);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.ok(path.basename(resolved).startsWith('tree-r5-import-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

function png16(bytes: Buffer) {
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), channels = bytes[25] === 2 ? 3 : 4, pixelBytes = channels * 2, stride = width * pixelBytes;
  assert.equal(bytes[24], 16); assert.ok([2, 6].includes(bytes[25])); assert.equal(bytes[28], 0);
  const chunks: Buffer[] = [];
  for (let i = 8; i < bytes.length;) { const n = bytes.readUInt32BE(i); if (bytes.toString('ascii', i + 4, i + 8) === 'IDAT') chunks.push(bytes.subarray(i + 8, i + 8 + n)); i += 12 + n; }
  const filtered = inflateSync(Buffer.concat(chunks)), raw = Buffer.alloc(height * stride);
  function paeth(a: number, b: number, c: number) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1), filter = filtered[start]; assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= pixelBytes ? raw[i - pixelBytes] : 0, b = y ? raw[i - stride] : 0, c = y && x >= pixelBytes ? raw[i - stride - pixelBytes] : 0;
      raw[i] = (filtered[start + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) & 255;
    }
  }
  return { width, height, raw, channels, pixelBytes, stride, opaque: (x: number, y: number) => raw.readUInt16BE(y * stride + x * pixelBytes) >= 32768 };
}

function firOpacity() {
  const manifest = JSON.parse(fs.readFileSync('shared/data/assets/tree-materials-manifest.json', 'utf8'));
  const map = manifest.assets.find((a: any) => a.id === 'fir_tree_01').maps.opacity;
  const bytes = fs.readFileSync(map.runtimePath);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), map.sha256);
  return png16(bytes);
}

test('adaptive 8facet Fir matches actual 16-bit source alpha; bbox rejects the known foreign fragment', () => {
  const raster = firOpacity();
  const atlas = JSON.parse(fs.readFileSync('shared/data/tree-leaf-components.json', 'utf8')).atlases.find((a: any) => a.id === 'fir_tree_01');
  const quadAdditional: Record<string, number> = {};
  for (const part of atlas.parts) {
    const component = atlas.components.find((c: any) => c.id === part.componentId), hull = component.cutoutHullPixels;
    // Pixel hull orientation is opposite UV; containment uses independent CCW order.
    const signed = hull.reduce((s: number, a: number[], i: number) => { const b = hull[(i + 1) % hull.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0);
    const source = signed < 0 ? [...hull].reverse() : hull;
    const candidate = supportingPolygon(hull, FIR_SUPPORT_ANGLES[part.id]), quad = supportingPolygon(hull, []);
    assert.equal(candidate.length, 8);
    assert.ok(source.every((p: number[]) => contains(candidate, p, 1e-5)));
    const min = [0, 1].map(axis => Math.floor(Math.min(...quad.map((p: number[]) => p[axis]))));
    const max = [0, 1].map(axis => Math.ceil(Math.max(...quad.map((p: number[]) => p[axis]))));
    let added = 0;
    for (let y = min[1]; y < max[1]; y++) for (let x = min[0]; x < max[0]; x++) if (raster.opaque(x, y)) {
      const p = [x + .5, y + .5], original = contains(source, p, 1e-5);
      assert.equal(contains(candidate, p, 1e-5), original, `${part.id} source alpha at ${x},${y}`);
      if (!original) added++;
    }
    quadAdditional[part.id] = added;
  }
  assert.equal(quadAdditional['lower-right-spray'], 7228);
});

test('circumscribed Fir polygons preserve every source hull point and metric UV extent', () => {
  const atlas = JSON.parse(fs.readFileSync('shared/data/tree-leaf-components.json', 'utf8')).atlases.find((a: any) => a.id === 'fir_tree_01');
  for (const part of atlas.parts) {
    const hull = atlas.components.find((c: any) => c.id === part.componentId).cutoutHullUvBlender;
    for (const angles of [[], [0, 45, 90, 135, 180, 225, 270, 315]]) {
      const polygon = supportingPolygon(hull, angles);
      assert.ok(hull.every((p: number[]) => contains(polygon, p)));
      assert.ok(area(polygon) >= area(hull) - 1e-10);
      for (const axis of [0, 1]) for (const extreme of [Math.min, Math.max])
        assert.ok(Math.abs(extreme(...polygon.map((p: number[]) => p[axis])) - extreme(...hull.map((p: number[]) => p[axis]))) < 1e-10);
      const triangles = fanTriangles(polygon);
      const total = triangles.reduce((sum: number, tri: number[]) => sum + area(tri.map(i => polygon[i])), 0);
      assert.ok(Math.abs(total - area(polygon)) < 1e-10);
    }
  }
});

test('near wood preserves curved child junctions, all ancestry, roots, and thin terminal geometry', () => {
  const branches = [
    { id: 0, parent: null, points: [[0, 0, 0], [.01, 0, 1], [0, 0, 2]], radii: [.2, .12, .05] },
    { id: 1, parent: 0, attachmentT: .37, points: [[.0074, 0, .74], [.2, .001, 1], [.4, 0, 1.2]], radii: [.01, .003, .001] },
  ];
  const result = nearWood(branches);
  assert.equal(result.branches.length, branches.length);
  const trunk = result.branches[0], joint = trunk.sourceParameters.indexOf(.37);
  assert.ok(joint >= 0);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(trunk.points[joint][i] - branches[1].points[0][i]) < 1e-12);
  for (let i = 0; i < branches.length; i++) {
    assert.deepEqual(result.branches[i].points[0], branches[i].points[0]);
    assert.deepEqual(result.branches[i].points.at(-1), branches[i].points.at(-1));
    assert.ok(result.branches[i].maximumCurveError <= Math.min(...branches[i].radii) * .5);
  }
  assert.equal(result.audit.diameterCull, false);
});

test('shoot projection is a right-handed orthonormal frame and does not rescale source points', () => {
  const points = [[1, 2, 3], [1.2, 2.3, 3.1], [.95, 2.1, 3.2]];
  const before = JSON.stringify(points), frame = shootFrame(points, points[0], [.2, .8, .5]);
  assert.equal(JSON.stringify(points), before);
  for (const axis of [frame.right, frame.up, frame.normal]) assert.ok(Math.abs(dot(axis, axis) - 1) < 1e-12);
  assert.ok(Math.abs(dot(frame.right, frame.up)) < 1e-12);
  assert.ok(frame.bounds[1][0] > frame.bounds[0][0] && frame.bounds[1][1] > frame.bounds[0][1]);
  assert.ok(frame.paddingMetres > 0);
});

test('attachment check measures the candidate surface and catches a detached source anchor', () => {
  assert.equal(triangleDistance([.25, .25, 2], [0, 0, 0], [1, 0, 0], [0, 1, 0]), 2);
  assert.equal(triangleDistance([2, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]), 1);
  const result = nearWood([{ id: 0, parent: null, depth: 4, points: [[0, 0, 0], [0, 0, 1]], radii: [.01, .01] }],
    { deviationPixels: .75, higherOrderSides: 6, terminalRadiusCap: null });
  const audit = attachmentAudit(result.branches, [
    { branchId: 0, anchor: [0, 0, .5], supportRadius: .01 },
    { branchId: 0, anchor: [1, 0, .5], supportRadius: .01 },
  ]);
  assert.equal(audit.testedSourceAnchors, 2);
  assert.equal(audit.failed, 1);
  assert.ok(audit.maximumDistance > .98);
  assert.ok(result.branches[0].sides <= 6);
  assert.equal(result.audit.terminalRadiusErrorCap, null);
});

function verifiedBytes(file: { path: string; sha256: string; bytes: number }) {
  const bytes = fs.readFileSync(file.path);
  assert.equal(bytes.length, file.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  return bytes;
}

function sampleGlb(file: any) {
  const bytes = verifiedBytes(file), jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()), bin = bytes.subarray(28 + jsonLength);
  assert.equal(json.images?.length ?? 0, 0); assert.equal(json.materials?.length ?? 0, 0);
  function values(index: number) {
    const a = json.accessors[index], view = json.bufferViews[a.bufferView], start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    assert.equal(view.byteStride, undefined);
    const size = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    return Array.from({ length: a.count * size }, (_, i) => a.componentType === 5126 ? bin.readFloatLE(start + 4 * i) : a.componentType === 5123 ? bin.readUInt16LE(start + 2 * i) : bin.readUInt32LE(start + 4 * i));
  }
  function accessorBytes(index: number) {
    const a = json.accessors[index], view = json.bufferViews[a.bufferView], start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const size = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    return bin.subarray(start, start + a.count * size * (a.componentType === 5123 ? 2 : 4));
  }
  return { json, values, accessorBytes };
}

test('native R5 output keeps full source geometry, exact rank, root coordinates and comparison-only contract', () => {
  const report = JSON.parse(fs.readFileSync('shared/data/assets/tree-r5-materials-manifest.json', 'utf8'));
  assert.equal(report.comparisonOnly, true); verifiedBytes(report.nativeMaster); verifiedBytes(report.generator);
  verifiedBytes(report.woodComparison.nativeMaster); verifiedBytes(report.woodComparison.generator);
  assert.equal(report.woodComparison.runtimeExports, false);
  assert.equal(report.woodComparison.candidates.length, 4);
  for (const candidate of report.woodComparison.candidates) {
    assert.equal(candidate.audit.attachments.failed, 0);
    assert.equal(candidate.audit.sourceBranches, candidate.audit.retainedBranches);
    assert.equal(candidate.triangles, candidate.audit.triangleCount);
  }
  assert.equal(report.shoot.parts.length, 6); assert.equal(report.shoot.rank, 32722);
  for (const item of report.fir) {
    const { json, values } = sampleGlb(item.geometry);
    assert.equal(json.nodes.length, 3);
    for (const node of json.nodes) {
      assert.ok(!node.translation && !node.rotation && !node.scale && !node.matrix);
      assert.equal(node.extras.sourceTreeId, item.sourceTreeId);
      assert.deepEqual(node.extras.sourceRootXZ, item.sourceRootXZ);
      assert.equal(node.extras.trunkRadius, item.trunkRadius);
      const p = json.meshes[node.mesh].primitives[0], triangles = values(p.indices).length / 3;
      assert.equal(triangles, node.name.endsWith('__r4') ? 12 : node.name.endsWith('__polygon8') ? 6 : 2);
      const a = json.accessors[p.attributes.COLOR_0]; assert.equal(a.componentType, 5123); assert.equal(a.normalized, true);
      const colors = values(p.attributes.COLOR_0);
      for (let i = 0; i < colors.length; i += 4) assert.deepEqual(colors.slice(i, i + 4), [65535, 65535, 65535, item.source.rank]);
    }
    assert.equal(item.quadAccepted, false);
    assert.ok(item.fitMaximumErrorMetres < 3e-7);
  }
  const source = sampleGlb(report.sourceGeometry), primitive = source.json.meshes[0].primitives[0];
  const sourceIndices = source.values(primitive.indices);
  assert.equal(sourceIndices.length / 3, 24);
  const parent = Array.from({ length: source.json.accessors[primitive.attributes.POSITION].count }, (_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < sourceIndices.length; i += 3) for (let j = 1; j < 3; j++) parent[find(sourceIndices[i + j])] = find(sourceIndices[i]);
  assert.equal(new Set(parent.map((_, i) => find(i))).size, 6, 'all six distinct photographed leaves survive source export');
  const card = sampleGlb(report.cardGeometry), p = card.json.meshes[0].primitives[0];
  assert.equal(card.values(p.indices).length / 3, 2);
  const positions = card.values(p.attributes.POSITION), uv = card.values(p.attributes.TEXCOORD_0), frame = report.shoot.frame;
  for (let i = 0; i < positions.length / 3; i++) {
    const x = frame.bounds[0][0] + uv[i * 2] * (frame.bounds[1][0] - frame.bounds[0][0]);
    const y = frame.bounds[0][1] + (1 - uv[i * 2 + 1]) * (frame.bounds[1][1] - frame.bounds[0][1]);
    const native = frame.anchor.map((v: number, axis: number) => v + frame.right[axis] * x + frame.up[axis] * y);
    const actual = [positions[i * 3], -positions[i * 3 + 2], positions[i * 3 + 1]];
    assert.ok(Math.hypot(...actual.map((v, axis) => v - native[axis])) < 1e-6);
  }
});

test('actual native opacity PNG uses RGB luminance with opaque alpha, not white RGB and cutout alpha', () => {
  const report = JSON.parse(fs.readFileSync('shared/data/assets/tree-r5-materials-manifest.json', 'utf8'));
  for (const map of Object.values(report.maps) as any[]) verifiedBytes(map);
  const opacity = report.maps.opacity;
  assert.equal(opacity.maskChannel, 'RGB-luminance'); assert.equal(opacity.colorSpace, 'linear');
  const image = png16(verifiedBytes(opacity)); assert.equal(image.channels, 3);
  assert.deepEqual([image.width, image.height], opacity.resolution);
  let opaque = 0, minimum = 65535, maximum = 0;
  for (let i = 0; i < image.raw.length; i += 6) {
    const r = image.raw.readUInt16BE(i);
    assert.equal(r, image.raw.readUInt16BE(i + 2)); assert.equal(r, image.raw.readUInt16BE(i + 4));
    minimum = Math.min(minimum, r); maximum = Math.max(maximum, r); if (r >= 32768) opaque++;
  }
  assert.equal(minimum, 0); assert.equal(maximum, 65535);
  assert.equal(opaque, opacity.pixelsAtOrAboveCutoff);
  assert.equal(image.width * image.height - opaque, opacity.pixelsBelowCutoff);
  assert.equal(opacity.minimumDecodedAlpha, 1); assert.equal(opacity.maximumDecodedAlpha, 1);
});

test('two full R5 pilots preserve R4 source identities, untouched foliage/wood LODs and every Fir rank', () => {
  const base = 'public/models/vegetation/seasonal-r5/';
  const report = JSON.parse(fs.readFileSync(base + 'pilot-manifest.json', 'utf8'));
  const contract = JSON.parse(fs.readFileSync(base + 'runtime-contract.json', 'utf8'));
  const original = JSON.parse(fs.readFileSync('public/models/vegetation/seasonal/pilot-manifest.json', 'utf8'));
  assert.equal(contract.version, 2);
  assert.deepEqual(Object.keys(contract.prototypes).sort(), ['own-broadleaf', 'own-conifer']);
  assert.equal(contract.placements.length, 2); verifiedBytes(report.nativeMaster); verifiedBytes(report.generator);
  verifiedBytes(report.postExportVerifier);
  for (const variant of report.variants) {
    const prior = original.variants.find((v: any) => v.id === variant.id), prototype = contract.prototypes[variant.id];
    const next = sampleGlb(variant.export), old = sampleGlb({ ...prior.export, path: 'public/models/vegetation/seasonal/' + prior.export.file });
    assert.equal(next.json.nodes.length, 6);
    const placement = contract.placements.find((p: any) => p.sourceTreeId === variant.sourceTreeId);
    assert.deepEqual(placement.sourceRootXZ, prior.sourceRootXZ);
    assert.equal(prototype.trunkRadius, prior.trunkRadius);
    assert.equal(prototype.lodProfile, 'full-coverage');
    assert.equal(variant.sourcePreservation.midGroupsMatchNear, true);
    assert.equal(variant.sourcePreservation.midGroups, variant.sourcePreservation.nearGroups);
    for (const node of next.json.nodes) {
      const { role, lod, materialKey } = node.extras;
      assert.equal(node.name, `${variant.id}__lod${lod}__${role}`);
      assert.equal(node.extras.archetypeId, variant.id); assert.equal(node.extras.sourceTreeId, prior.sourceTreeId);
      assert.ok(!node.translation && !node.rotation && !node.scale && !node.matrix);
      assert.equal(materialKey, role === 'wood' ? 'Bark012' : variant.kind === 'broadleaf' ? 'LeafSet024' : 'fir_tree_01');
      assert.equal(prototype.lods[lod].url, '/' + variant.export.path.replace(/^public\//, ''));
      assert.equal(prototype.lods[lod].sha256, variant.export.sha256);
      assert.ok(prototype.lods[lod].meshNames.includes(node.name));
      const p = next.json.meshes[node.mesh].primitives[0];
      const oldNode = old.json.nodes.find((n: any) => n.name === node.name), oldP = old.json.meshes[oldNode.mesh].primitives[0];
      if (role === 'wood' && lod === 0) assert.equal(next.json.accessors[p.indices].count / 3, variant.woodProfile.triangleCount);
      if (role === 'wood' && lod > 0 || role === 'foliage' && variant.kind === 'broadleaf' && lod !== 1) {
        assert.deepEqual(next.accessorBytes(p.indices), old.accessorBytes(oldP.indices));
        for (const [semantic, accessor] of Object.entries(p.attributes))
          assert.deepEqual(next.accessorBytes(accessor as number), old.accessorBytes(oldP.attributes[semantic]), `${variant.id}/${lod}/${role}/${semantic}`);
      }
      if (role === 'foliage') {
        const ranks = (mesh: ReturnType<typeof sampleGlb>, primitive: any) => {
          const a = mesh.json.accessors[primitive.attributes.COLOR_0]; assert.equal(a.componentType, 5123); assert.equal(a.normalized, true);
          const colors = mesh.accessorBytes(primitive.attributes.COLOR_0), set = new Set<number>();
          for (let i = 0; i < colors.length; i += 8) set.add(colors.readUInt16LE(i + 6));
          return set;
        };
        const originalRankNode = lod === 1 ? old.json.nodes.find((n: any) => n.extras.lod === 0 && n.extras.role === 'foliage') : oldNode;
        assert.deepEqual(ranks(next, p), ranks(old, old.json.meshes[originalRankNode.mesh].primitives[0]));
        if (variant.kind === 'conifer') assert.equal(next.json.accessors[p.indices].count / 3, variant.foliage[lod].components * 6);
      }
      if (lod === 0 || lod === 2) {
        const proof = variant.sourcePreservation.unchangedLods.find((row: any) => row.lod === lod && row.role === role);
        for (const [semantic, index] of Object.entries({ INDICES: p.indices, ...p.attributes })) {
          const bytes = next.accessorBytes(index as number);
          assert.equal(bytes.length, proof.accessors[semantic].bytes);
          assert.equal(createHash('sha256').update(bytes).digest('hex'), proof.accessors[semantic].sha256);
        }
      }
    }
    const nearNode = next.json.nodes.find((n: any) => n.extras.lod === 0 && n.extras.role === 'foliage');
    const midNode = next.json.nodes.find((n: any) => n.extras.lod === 1 && n.extras.role === 'foliage');
    const near = next.json.meshes[nearNode.mesh].primitives[0], mid = next.json.meshes[midNode.mesh].primitives[0];
    if (variant.kind === 'broadleaf') {
      assert.equal(variant.foliage[1].photographicParts, 82100); assert.equal(variant.foliage[1].triangles, 164200);
      for (const semantic of ['POSITION', 'TEXCOORD_0', 'COLOR_0']) {
        const a = next.accessorBytes(near.attributes[semantic]), b = next.accessorBytes(mid.attributes[semantic]);
        const width = semantic === 'POSITION' ? 12 : 8;
        for (let leaf = 0; leaf < 82100; leaf++) for (const [corner, nearCorner] of [0, 1, 5, 4].entries()) {
          const x = (leaf * 6 + nearCorner) * width, y = (leaf * 4 + corner) * width;
          assert.ok(a.subarray(x, x + width).equals(b.subarray(y, y + width)));
        }
      }
    } else for (const [semantic, index] of Object.entries({ INDICES: near.indices, ...near.attributes }))
      assert.deepEqual(next.accessorBytes(index as number), next.accessorBytes(semantic === 'INDICES' ? mid.indices : mid.attributes[semantic]));
  }
});

test('orthogonal sample keeps every source leaf and reports angular overshoot without accepting it', () => {
  const report = JSON.parse(fs.readFileSync('public/models/vegetation/seasonal-r5/multiplane-v2/comparison-manifest.json', 'utf8'));
  assert.equal(report.accepted, false); assert.equal(report.sourcePhotographicParts, 6); assert.equal(report.source.rank, 32722);
  verifiedBytes(report.nativeMaster); verifiedBytes(report.generator); for (const helper of report.helpers) verifiedBytes(helper);
  assert.equal(report.projectionFrames.length, 3);
  for (const [i, frame] of report.projectionFrames.entries()) {
    for (const axis of ['right', 'up', 'normal']) assert.ok(Math.abs(dot(frame[axis], frame[axis]) - 1) < 1e-12);
    for (let j = i + 1; j < 3; j++) assert.ok(Math.abs(dot(frame.normal, report.projectionFrames[j].normal)) < 1e-12);
  }
  for (const candidate of report.candidates) {
    const asset = sampleGlb(candidate.geometry), p = asset.json.meshes[0].primitives[0];
    assert.equal(candidate.materialCount, 1); assert.equal(asset.json.accessors[p.indices].count / 3, candidate.planes * 2);
    assert.equal(asset.json.nodes[0].extras.materialKey, report.atlas.materialKey);
    const color = asset.accessorBytes(p.attributes.COLOR_0);
    for (let i = 0; i < color.length; i += 8) assert.equal(color.readUInt16LE(i + 6), 32722);
  }
  assert.equal(report.comparisons.length, 15);
  for (const row of report.comparisons) {
    const c = row.coverage;
    assert.equal(c.falsePositivePixels, c.candidatePixels - c.intersectionPixels);
    assert.equal(c.falseNegativePixels, c.sourcePixels - c.intersectionPixels);
    assert.equal(c.unionPixels, c.sourcePixels + c.falsePositivePixels);
    assert.ok(c.falsePositiveBeyondOnePixel <= c.falsePositivePixels && c.falseNegativeBeyondOnePixel <= c.falseNegativePixels);
    if (row.elevationDegrees === 0 && [0, 90].includes(row.yawDegrees)) assert.ok(c.intersectionOverUnion > .99, 'actual projection axes reproduce the source');
  }
  assert.ok(report.worstViews.every((row: any) => row.lowestIou < .7 && row.maximumOvershootBeyondOnePixel > .2));
});

test('orthogonal atlas is native RGB opacity with independent masks in all three tiles', () => {
  const report = JSON.parse(fs.readFileSync('public/models/vegetation/seasonal-r5/multiplane-v2/comparison-manifest.json', 'utf8'));
  for (const map of Object.values(report.atlas.maps) as any[]) verifiedBytes(map);
  const map = report.atlas.maps.opacity, image = png16(verifiedBytes(map));
  assert.equal(map.maskChannel, 'RGB-luminance'); assert.equal(image.channels, 3);
  assert.deepEqual([image.width, image.height], [3072, 1024]);
  const counts = [0, 0, 0];
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 3072; x++) {
    const offset = y * image.stride + x * 6, r = image.raw.readUInt16BE(offset);
    assert.equal(r, image.raw.readUInt16BE(offset + 2)); assert.equal(r, image.raw.readUInt16BE(offset + 4));
    if (r >= 32768) counts[Math.floor(x / 1024)]++;
  }
  assert.deepEqual(counts, map.tiles.map((tile: any) => tile.pixelsAtCutoff));
  assert.ok(counts.every(count => count > 200000 && count < 400000));
});
