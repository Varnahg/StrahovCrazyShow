/** Copy only verified immutable source inputs, never inherited stale metadata. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../../../../..');
const original = join(root, '.cache/webgpu-completion-20261021/validation/helper-runtimes/v9');
const target = join(root, '.cache/webgpu-completion-20261021/preparation-summary/helper/v10');
const { helperIdentity, sha256 } = await import(pathToFileURL(join(original, 'common.mjs')));
const before = await helperIdentity(original);
if (!before.sha256.startsWith('9dc789c8') || Object.keys(before.files).length !== 29) throw new Error('Expected exact29 source v9 seal9dc789c8');
await mkdir(dirname(target), { recursive: true }); await mkdir(target);
for (const [file, expected] of Object.entries(before.files)) {
  const bytes = await readFile(join(original, file)); if (sha256(bytes) !== expected) throw new Error('Original input drift: ' + file);
  await writeFile(join(target, file), bytes, { flag: 'wx' });
}
const copied = await helperIdentity(target), after = await helperIdentity(original);
if (JSON.stringify(before) !== JSON.stringify(copied) || JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Source/copy identity drift');
const protectedPaths = ['client/game.ts', 'client/light-preparation.ts', 'client/render-quality-preparation.ts', 'client/ui.tsx',
  'client/render-startup.ts', 'client/render-health.ts', 'server/index.ts', 'shared/simulation.ts', 'package.json', 'pnpm-lock.yaml',
  'patches/@babylonjs__core@9.30.0.patch', 'node_modules/@babylonjs/core/Meshes/mesh.pure.js',
  'node_modules/@babylonjs/core/Engines/webgpuEngine.pure.js', 'public/models/strahov-compact.glb',
  '.cache/performance-snapshot/webgpu-completion-20261023-candidate-10/client/game.ts',
  '.cache/performance-snapshot/webgpu-completion-20261023-candidate-10/node_modules/@babylonjs/core/Meshes/mesh.pure.js'];
const protectedHashes = Object.fromEntries(await Promise.all(protectedPaths.map(async path => [path, sha256(await readFile(join(root, path)))])));
const value = { capturedAtUTC: new Date().toISOString(), source: original, target, before, copied, after, protectedHashes,
  depth5: resolve(target, '../../../../..') === root, scope: '29 immutable source files copied exactly; no product/native/frozen edits or tests/build/GPU' };
if (!value.depth5) throw new Error('Helper root depth drift');
await writeFile(join(directory, 'before.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ originalSha256: before.sha256, copiedFiles: Object.keys(before.files).length, depth5: value.depth5,
  proofSha256: sha256(await readFile(join(directory, 'before.json'))) }, null, 2));
