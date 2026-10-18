import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = path => { const bytes = fs.readFileSync(path); return { sha256: hash(bytes), bytes: bytes.length }; };
const read = path => JSON.parse(fs.readFileSync(resolve(root, path), 'utf8'));
const original = read('review-v1/manifest.json');
assert.equal(entry(resolve(root, 'review-v1/manifest.json')).sha256, '364ae602b493919f2759fd3d9802e9418487922cacb1eedd7caed33d005b1d47');
for (const path of ['report.md', 'source-evidence.json']) assert.equal(entry(resolve(root, 'review-v1', path)).sha256, original.artifacts[path].sha256);
assert.equal(entry(resolve(root, 'review-v1/handoff.md')).sha256, original.handoff.sha256);
const unchanged = {};
for (const [path, expected] of Object.entries(original.artifacts)) {
  if (path === 'report.md' || path === 'source-evidence.json') continue;
  const actual = entry(resolve(root, path)); assert.deepEqual(actual, expected); unchanged[path] = actual;
}
const evidence = read('review-v1/source-evidence.json');
const depManifest = JSON.parse(fs.readFileSync(evidence.dependencyManifest.path, 'utf8'));
assert.equal(entry(evidence.dependencyManifest.path).sha256, evidence.dependencyManifest.sha256);
const correctedPaths = [
  ['Engines/webgpuEngine.js', 'Engines/webgpuEngine.pure.js'],
  ['Meshes/subMesh.js', 'Meshes/subMesh.pure.js'],
  ['Materials/materialPluginManager.js', 'Materials/materialPluginManager.pure.js'],
  ['Materials/materialPluginBase.js', 'Materials/materialPluginBase.pure.js'],
  ['Engines/WebGPU/webgpuShaderProcessorsWGSL.js', 'Engines/WebGPU/webgpuShaderProcessorsWGSL.pure.js'],
];
const corrections = [];
for (const [wrapper, implementation] of correctedPaths) {
  assert.ok(evidence.dependencies['core/' + wrapper]);
  const actual = entry(resolve(original.dependencyRoot, '@babylonjs/core', implementation));
  assert.equal(actual.sha256, depManifest.output['core/' + implementation]);
  corrections.push({ wrapper, wrapperSha256: evidence.dependencies['core/' + wrapper].sha256, implementation, ...actual });
  delete evidence.dependencies['core/' + wrapper];
  evidence.dependencies['core/' + implementation] = actual;
}
evidence.evidenceVersion = 2;
evidence.amendedAt = new Date().toISOString();
evidence.amendment = { reason: 'Read-only review: primary implementation paths and measured observer overhead description', corrections, measurementNote: 'nativeCreateEffectInclusive includes native call plus post-call hit/miss classification, count and ownership check; only pre-call Set creation lies outside that timer. trace.ts and raw measurements are unchanged.' };
fs.writeFileSync(resolve(root, 'source-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
const artifacts = {};
function collect(folder, prefix = '') {
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!prefix && ['node_modules', 'manifest.json', 'manifest-v2.json'].includes(item.name)) continue;
    const path = prefix + item.name;
    if (item.isFile()) artifacts[path] = entry(resolve(folder, item.name));
    else if (item.isDirectory()) collect(resolve(folder, item.name), path + '/');
  }
}
collect(root);
const manifest = { ...original, evidenceVersion: 2, frozenAt: new Date().toISOString(), historicalV1: { manifest: 'review-v1/manifest.json', sha256: entry(resolve(root, 'review-v1/manifest.json')).sha256, overrides: { 'report.md': 'review-v1/report.md', 'source-evidence.json': 'review-v1/source-evidence.json', handoff: 'review-v1/handoff.md' }, note: 'Original manifest bytes and historical report/source-evidence/handoff preserved. All other original artifacts remain at their original paths unchanged.' }, amendment: { evidenceOnly: true, measuredSourceAndRawUnchanged: unchanged, noTestsTypecheckOrRemeasurement: true, dependencyReads: corrections.map(c => c.implementation) }, artifacts, handoff: { path: original.handoff.path, ...entry(original.handoff.path) } };
const bytes = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(resolve(root, 'manifest-v2.json'), bytes, { flag: 'wx' });
fs.writeFileSync(resolve(root, 'manifest.json'), bytes);
console.log(JSON.stringify({ manifest: resolve(root, 'manifest-v2.json'), ...entry(resolve(root, 'manifest-v2.json')), handoff: manifest.handoff, corrections, preservedOriginalArtifacts: Object.keys(unchanged).length }, null, 2));
