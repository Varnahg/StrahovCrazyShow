import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const wt = resolve(root, '../../..');
const primary = 'C:/Users/rezac/Documents/GitHub/StrahovCrazyShow';
const native = resolve(wt, '.cache/webgpu-migration/async-native-v2');
const c5 = resolve(wt, '.cache/webgpu-migration/combined-v5');
const deps = resolve(wt, '.cache/webgpu-migration/dependencies-v5');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const nativeManifest = json(resolve(native, 'source-manifest.json'));
const c5Manifest = json(resolve(c5, 'source-manifest.json'));
assert.equal(nativeManifest.snapshotId, 'd7490c5356406aa7c1e1020619fd90e2d3a4a8ec02115194d491e94fa0599047');
assert.equal(c5Manifest.snapshotId, 'c4e22edd3b691fce2827b5132ccbc09ec404a0aa6fd1338925ffddbe8a5be6f5');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(row => row.isDirectory() ? walk(resolve(dir, row.name)) : row.isFile() ? [resolve(dir, row.name)] : []);
const runtime = {};
for (const path of ['client', 'shared'].flatMap(dir => walk(resolve(root, dir))).concat(['package.json', 'tsconfig.json'].map(path => resolve(root, path)))) {
  const name = relative(root, path).replaceAll('\\', '/');
  const sha = hash(path);
  assert.equal(sha, hash(resolve(native, name)), `modified native copy ${name}`);
  assert.equal(sha, nativeManifest.files[name], `unmanifested native copy ${name}`);
  runtime[name] = sha;
}
const assets = {};
for (const path of walk(resolve(root, 'assets'))) {
  const name = relative(root, path).replaceAll('\\', '/');
  const source = `public/models/b6/${name.split('/').at(-1)}`;
  const sha = hash(path);
  assert.equal(sha, hash(resolve(c5, source)), `modified C5 asset ${name}`);
  assert.equal(sha, c5Manifest.files[source], `unmanifested C5 asset ${name}`);
  assets[name] = { source, sha256: sha };
}
const report = json(resolve(root, 'report.json'));
assert.equal(report.passed, true);
assert.equal(report.results.length, 2);
assert.ok(report.results.every(row => row.pass));
for (const [path, sha] of Object.entries(report.sources)) assert.equal(runtime[path], sha);
const core = resolve(deps, 'node_modules/@babylonjs/core');
assert.equal(json(resolve(core, 'package.json')).version, '9.30.0');
const dependencyFiles = ['package.json', 'Engines/nullEngine.js', 'scene.js', 'Meshes/mesh.js', 'Meshes/abstractMesh.js', 'Materials/shadowDepthWrapper.js', 'Lights/Shadows/shadowGenerator.js', 'Materials/PBR/pbrBaseMaterial.js', 'Materials/standardMaterial.js', 'Materials/effect.js', 'Lights/light.js'];
const dependencies = Object.fromEntries(dependencyFiles.map(path => [path, hash(resolve(core, path))]));
const external = {
  benchmark: resolve(wt, '.cache/webgpu-hitch-validation-20261017/async-v2-first-f-benchmark.json'),
  nativeManifest: resolve(native, 'source-manifest.json'),
  c5Manifest: resolve(c5, 'source-manifest.json'),
  dependencyLock: resolve(deps, 'pnpm-lock.yaml'),
  spec: resolve(primary, '_bmad-output/implementation-artifacts/webgpu-migration-20261017/spec-key-31-long-frame-gaps.md'),
  task: resolve(wt, 'docs/agents/tasks/webgpu-b6-variant-proof-20261018.json'),
  handoff: resolve(wt, 'docs/agents/handoffs/webgpu-b6-variant-proof-20261018.md'),
};
const artifacts = Object.fromEntries(readdirSync(root, { withFileTypes: true }).filter(row => row.isFile() && !['manifest.json', 'freeze.log'].includes(row.name)).map(row => [row.name, hash(resolve(root, row.name))]));
const manifest = {
  frozenAt: new Date().toISOString(), task: 'webgpu-b6-variant-proof-20261018', owner: 'webgpu-b6-proof-01a14497',
  scope: 'Cache-only bounded CPU proof; no production changes, GPU, full tests/build/integration or runtime candidate.',
  nativeSnapshot: nativeManifest.snapshotId, c5Snapshot: c5Manifest.snapshotId,
  runtime, assets, dependencies, artifacts,
  external: Object.fromEntries(Object.entries(external).map(([key, path]) => [key, { path: path.replaceAll('\\', '/'), sha256: hash(path) }])),
  validation: { command: 'TSX_DISABLE_CACHE=1 node --import tsx probe.ts; node summarize.mjs', cases: 2, passed: true, startedAt: report.startedAt, endedAt: report.endedAt, wallMs: report.wallMs, cpu: report.cpu, gpu: false, fullSuite: false, typecheck: false },
  limitations: ['NullEngine GLSL frontend only; no WGSL/GPU compilation/performance/image proof', 'Only two original small GLB assets, no full geometry/avatar or all caster pool', 'Explicit sky/IBL/collision IO stubs; inactive celestial shadows do not prove spatial caster restoration', 'CPU instancing capability enabled; PCF falls back to supported POISSON', 'Earlier failed/diagnostic logs retained separately from final PASS', 'No runtime two-stage candidate or shadow cache authorized by this proof'],
};
writeFileSync(resolve(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ manifestSha256: hash(resolve(root, 'manifest.json')), runtimeFiles: Object.keys(runtime).length, probeSha256: artifacts['probe.ts'], reportSha256: artifacts['report.json'], summarySha256: artifacts['summary.json'], handoffSha256: manifest.external.handoff.sha256, passed: true }, null, 2));
