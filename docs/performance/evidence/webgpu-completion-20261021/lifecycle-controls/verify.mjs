/** Explicit lightweight QA helper verification; never build/server/browser/GPU. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { helperIdentity, sha256, transformUI, sourceFiles } from '../measurement/common.mjs';
const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../../../../..'), helper = join(directory, '../measurement');
const baseline = process.argv[2] === 'baseline', label = baseline ? 'baseline' : 'verification';
const names = ['helper', 'clock', 'weather-latency', 'shader-attribution', 'shader-lifetime', 'routine-cost', 'buffer-lifecycle'];
if (!baseline) names.push('lifecycle-controls');
const tests = names.map(name => join(helper, name + '.test.mjs'));
const protectedPaths = ['client/game.ts', 'client/ui.tsx', 'client/render-startup.ts', 'client/render-health.ts', 'client/render-engine.ts',
  'client/webgpu-validation.ts', 'server/index.ts', 'shared/simulation.ts', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts',
  'patches/@babylonjs__core@9.30.0.patch', 'node_modules/@babylonjs/core/Meshes/mesh.pure.js',
  'node_modules/@babylonjs/core/Engines/webgpuEngine.pure.js', 'public/models/strahov-compact.glb'];
const hashes = async (files, prefix = root) => Object.fromEntries(await Promise.all(files.map(async file => [file, sha256(await readFile(join(prefix, file)))])));
const frozen = join(root, '.cache/webgpu-completion-20261021/validation/helper-runtimes/v6');
const frozenIdentity = JSON.parse(await readFile(join(frozen, 'frozen-identity.json'), 'utf8'));
const capture = async () => ({ helper: await helperIdentity(helper), protected: await hashes(protectedPaths),
  frozen: await hashes(Object.keys(frozenIdentity.helperFiles), frozen) });
const before = await capture();
if (JSON.stringify(before.frozen) !== JSON.stringify(frozenIdentity.helperFiles)) throw new Error('Frozen helperv6 differs');
await writeFile(join(directory, label + '-before.json'), JSON.stringify(before, null, 2) + '\n');
const args = ['--import', 'tsx', '--test', '--test-reporter=tap', ...tests];
const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
const log = (result.stdout ?? '') + (result.stderr ?? ''); await writeFile(join(directory, label + '.tap'), log);
const syntax = [];
for (const file of sourceFiles.filter(name => name.endsWith('.mjs'))) {
  const checked = spawnSync(process.execPath, ['--check', join(helper, file)], { cwd: root, encoding: 'utf8', windowsHide: true });
  syntax.push({ file, exit: checked.status, output: (checked.stdout ?? '') + (checked.stderr ?? '') });
}
const ui = await readFile(join(root, 'client/ui.tsx'), 'utf8');
if (sha256(ui) !== before.protected['client/ui.tsx']) throw new Error('UI preimage changed');
const transformed = transformUI(ui), parse = ts.createSourceFile('qa.tsx', transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics;
const after = await capture();
const stable = JSON.stringify(before) === JSON.stringify(after);
const diff = spawnSync('git', ['diff', '--check', '--', ...sourceFiles.map(file => join(helper, file)), directory,
  join(root, 'docs/agents/handoffs/webgpu-completion-lifecycle-controls-20261021.md')], { cwd: root, encoding: 'utf8', windowsHide: true });
const proof = { capturedAtUTC: new Date().toISOString(), scope: 'QA helper CPU/syntax/TSX only; no GPU/build/server/install/full project suite',
  command: [process.execPath, ...args].join(' '), exit: result.status, tests: Number(log.match(/# tests (\d+)/)?.[1]),
  before, after, stable, syntax, uiDiagnostics: parse.map(value => value.code), transform: { before: sha256(ui), after: sha256(transformed) },
  diff: { exit: diff.status, output: (diff.stdout ?? '') + (diff.stderr ?? '') }, logSha256: sha256(log) };
proof.passed = result.status === 0 && stable && syntax.every(value => value.exit === 0) && parse.length === 0 && diff.status === 0;
await writeFile(join(directory, label + '.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ passed: proof.passed, tests: proof.tests, helperSha256: after.helper.sha256, stable,
  proofSha256: sha256(await readFile(join(directory, label + '.json'))) }, null, 2));
if (!proof.passed) process.exitCode = 1;
