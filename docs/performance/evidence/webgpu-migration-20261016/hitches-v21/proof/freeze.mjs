import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url)), wt = resolve(root, '../../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = path => { const bytes = fs.readFileSync(path); return { sha256: hash(bytes), bytes: bytes.length }; };
const input = JSON.parse(fs.readFileSync(resolve(root, 'input-manifest.json')));
const qa = resolve(root, '../define-order-qa-20261018');
assert.equal(entry(resolve(qa, 'manifest.json')).sha256, '37b2d5e1c31f62d4f4d0cdebaaf3063cd1ad8f3e64156ddf58a2a99563fbb228');
assert.equal(entry(resolve(qa, 'dependency-manifest.json')).sha256, '3e17ecf7339436c13929edb3706955c1f33f1ee13f3401f14d433da273df7970');
const dep = JSON.parse(fs.readFileSync(resolve(qa, 'dependency-manifest.json')));
const sourceFiles = {};
for (const [path, expected] of Object.entries(input.sources)) { const record = entry(resolve(input.base, path)); assert.equal(record.sha256, expected); sourceFiles[path] = record; }
assert.equal(entry(resolve(root, 'native-engine.ts')).sha256, input.nativeEngineFileSha256);
const dependencies = {};
for (const path of ['package.json', 'Materials/materialDefines.js', 'Materials/material.pure.js', 'Materials/materialPluginManager.js', 'Materials/materialPluginBase.js', 'Materials/materialHelper.functions.js', 'Materials/PBR/pbrBaseMaterial.pure.js', 'Materials/standardMaterial.pure.js', 'Materials/uniformBuffer.js', 'Materials/drawWrapper.js', 'Materials/effect.pure.js', 'Meshes/subMesh.js', 'Meshes/mesh.pure.js', 'Lights/light.js', 'Engines/webgpuEngine.js', 'Engines/nullEngine.pure.js', 'Engines/WebGPU/webgpuDrawContext.js', 'Engines/WebGPU/webgpuShaderProcessorsWGSL.js', 'Engines/WebGPU/webgpuShaderProcessingContext.js', 'Engines/WebGPU/webgpuPipelineContext.js']) {
  const record = entry(resolve(input.dependencies, '@babylonjs/core', path)); assert.equal(record.sha256, dep.output['core/' + path]); dependencies['core/' + path] = record;
}
const evidence = { frozenAt: new Date().toISOString(), sourceFiles, dependencies, productionEvidence: { path: 'docs/performance/evidence/webgpu-migration-20261016/hitches-v19/README.md', ...entry(resolve(wt, 'docs/performance/evidence/webgpu-migration-20261016/hitches-v19/README.md')) }, dependencyManifest: { path: resolve(qa, 'dependency-manifest.json'), ...entry(resolve(qa, 'dependency-manifest.json')) }, scope: 'Referenced primary methods verified against frozen manifest. No sweep/mutation of all shared dependencies.' };
fs.writeFileSync(resolve(root, 'source-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
const runs = JSON.parse(fs.readFileSync(resolve(root, 'final-runs.json'))).runs;
for (const run of runs) { assert.equal(run.status, 0); for (const [path, expected] of Object.entries(run.sources)) assert.equal(entry(resolve(root, path)).sha256, expected); assert.equal(entry(resolve(root, run.log)).sha256, run.logSha256); if (run.report) assert.equal(entry(resolve(root, run.report)).sha256, run.reportSha256); }
const artifacts = {};
for (const item of fs.readdirSync(root, { withFileTypes: true })) if (item.isFile() && item.name !== 'manifest.json') artifacts[item.name] = entry(resolve(root, item.name));
const handoff = 'docs/agents/handoffs/webgpu-material-switch-cost-proof-20261018.md';
const manifest = { schemaVersion: 1, task: 'webgpu-material-switch-cost-proof-20261018', owner: 'webgpu-material-switch-proof-01a14497', frozenAt: new Date().toISOString(), root, baseSnapshotId: input.baseSnapshotId, base: input.base, dependencyRoot: input.dependencies, dependencyManifestSha256: evidence.dependencyManifest.sha256, nodeModulesRealPath: fs.realpathSync(resolve(root, 'node_modules')), productionChanges: [], artifacts, handoff: { path: resolve(wt, handoff), ...entry(resolve(wt, handoff)) }, results: { targeted: '3 independent processes, each 5/5 PASS', scopedTypes: '2963 files / 0 errors', gpu: 'not run', fullSuiteBuildIntegration: 'not run; outside scope' }, processState: 'all owned test/typecheck child processes completed before CPU window release; no ports', limits: JSON.parse(fs.readFileSync(resolve(root, 'report-run-07.json'))).limits };
fs.writeFileSync(resolve(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ manifest: resolve(root, 'manifest.json'), ...entry(resolve(root, 'manifest.json')), handoff: manifest.handoff, artifacts: Object.keys(artifacts).length, primaryDependencyFiles: Object.keys(dependencies).length }, null, 2));
