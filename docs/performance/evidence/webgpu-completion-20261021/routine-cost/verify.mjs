/** Targeted CPU/syntax proof only; no build, server, browser, GPU or full suite. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { sha256, helperIdentity, transformUI, sourceFiles } from '../measurement/common.mjs';

const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../../../../..');
const measurement = join(directory, '../measurement');
const guards = ['client/game.ts', 'client/ui.tsx', 'client/style.css', 'client/world-renderer.ts', 'client/vegetation.ts',
  'client/active-mesh-candidates.ts', 'client/render-cost.ts', 'client/benchmark-render-profile.ts', 'client/render-engine.ts',
  'client/webgpu-shadow-readiness.ts', 'client/webgpu-pipeline-preparation.ts', 'server/index.ts', 'shared/simulation.ts', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts'];
const pins = ['package.json', 'scene.pure.js', 'Meshes/mesh.pure.js', 'Meshes/transformNode.pure.js', 'Materials/PBR/pbrBaseMaterial.pure.js',
  'Materials/standardMaterial.pure.js', 'Rendering/objectRenderer.js', 'Rendering/renderingGroup.js', 'Misc/observable.js', 'node.js', 'Engines/webgpuEngine.pure.js'];
const hashes = async (files, prefix = root) => Object.fromEntries(await Promise.all(files.map(async file => [file, sha256(await readFile(join(prefix, file)))])));
const sourceBefore = await hashes(guards), pinBefore = await hashes(pins, join(root, 'node_modules/@babylonjs/core'));
const helperBefore = await helperIdentity(measurement);
const frozenDirectory = join(root, '.cache/webgpu-completion-20261021/validation/helper-runtimes/v4');
const frozen = JSON.parse(await readFile(join(frozenDirectory, 'frozen-identity.json')));
const preserved = await hashes(Object.keys(frozen.helperFiles), frozenDirectory);
if (JSON.stringify(preserved) !== JSON.stringify(frozen.helperFiles)) throw new Error('Frozen19 helper inputs changed');

const tests = ['helper.test.mjs', 'clock.test.mjs', 'weather-latency.test.mjs', 'shader-attribution.test.mjs', 'shader-lifetime.test.mjs', 'routine-cost.test.mjs'];
const args = ['--import', 'tsx', '--test', '--test-reporter=tap', ...tests.map(file => join(measurement, file))];
const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true });
const log = (run.stdout ?? '') + (run.stderr ?? ''); await writeFile(join(directory, 'helper-tests.tap'), log);
const syntax = [];
for (const file of sourceFiles.filter(file => file.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', join(measurement, file)], { cwd: root, encoding: 'utf8', windowsHide: true });
  syntax.push({ file, exit: result.status, output: (result.stdout ?? '') + (result.stderr ?? '') });
}
const uiBytes = await readFile(join(root, 'client/ui.tsx'));
if (sha256(uiBytes) !== sourceBefore['client/ui.tsx']) throw new Error('UI changed before exact TSX parse');
const transformed = transformUI(uiBytes.toString('utf8'));
const uiDiagnostics = ts.createSourceFile('qa-ui.tsx', transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics
  .map(value => ({ code: value.code, start: value.start, message: ts.flattenDiagnosticMessageText(value.messageText, '\n') }));
if (sha256(await readFile(join(root, 'client/ui.tsx'))) !== sourceBefore['client/ui.tsx']) throw new Error('UI changed after TSX parse');
const diff = spawnSync('git', ['diff', '--check', '--', 'docs/performance/evidence/webgpu-completion-20261021/measurement',
  'docs/performance/evidence/webgpu-completion-20261021/routine-cost', 'docs/agents/handoffs/webgpu-completion-routine-cost-20261021.md'], { cwd: root, encoding: 'utf8', windowsHide: true });
await writeFile(join(directory, 'syntax.log'), JSON.stringify({ syntax, uiDiagnostics, diff: { exit: diff.status, output: (diff.stdout ?? '') + (diff.stderr ?? '') } }, null, 2) + '\n');
const sourceAfter = await hashes(guards), pinAfter = await hashes(pins, join(root, 'node_modules/@babylonjs/core')), helperAfter = await helperIdentity(measurement);
const sourceStable = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter), pinStable = JSON.stringify(pinBefore) === JSON.stringify(pinAfter);
const helperStable = helperBefore.sha256 === helperAfter.sha256;
const passed = run.status === 0 && /# tests 100\b/.test(log) && /# pass 100\b/.test(log) && /# fail 0\b/.test(log) && syntax.every(item => item.exit === 0) && !uiDiagnostics.length && diff.status === 0 && sourceStable && pinStable && helperStable;
const proof = { capturedAtUTC: new Date().toISOString(), passed, command: [process.execPath, ...args].join(' '), exit: run.status, tests: 100,
  baseline: { helperSha256: frozen.helperSha256, frozenFiles: frozen.helperFiles, preservedVerifiedFiles: Object.keys(preserved).length,
    sourceBuildId: frozen.sourceBuildId, tests: 83, logSha256: sha256(await readFile(join(directory, 'helper-before83.tap'))) },
  sourceBefore, sourceAfter, sourceStable, pinBefore, pinAfter, pinStable, helperBefore, helperAfter, helperStable,
  syntaxChecked: syntax.length, uiBytesSha256: sha256(uiBytes), transformedUiSha256: sha256(transformed), uiDiagnostics,
  logSha256: sha256(await readFile(join(directory, 'helper-tests.tap'))), syntaxLogSha256: sha256(await readFile(join(directory, 'syntax.log'))),
  scope: 'CPU only: actual pinned Scene/Mesh/PBR/Standard/ObjectRenderer on NullEngine and DOM transport fixtures; no build/server/browser/GPU/full suite or FPS claim' };
await writeFile(join(directory, 'verification.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ passed, tests: 100, exit: run.status, helperSha256: helperAfter.sha256, sourceStable, pinStable, helperStable,
  syntaxChecked: syntax.length, uiDiagnostics: uiDiagnostics.length, proofSha256: sha256(await readFile(join(directory, 'verification.json'))) }, null, 2));
if (!passed) process.exitCode = 1;
