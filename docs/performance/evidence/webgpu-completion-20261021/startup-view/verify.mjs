/** Scoped CPU/TS/transform evidence; no build/server/browser/GPU/full suite. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { sha256, transformUI } from '../measurement/common.mjs';
const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../../../../..');
const tests = ['startup-preparation-view', 'game-webgpu-startup', 'game-render-engine', 'game-light-lifecycle', 'room-callbacks',
  'game-authored-light-preparation', 'game-light-preparation', 'game-low-vehicle-preparation', 'game-preparation-scheduler', 'game-preparation-baseline', 'game-quality-preparation', 'render-startup'].map(name => 'tests/' + name + '.test.ts');
const sources = ['client/game.ts', 'client/ui.tsx', 'client/startup-preparation-view.ts', 'client/render-startup.ts', ...tests];
const untouched = ['client/authority-buffer.ts', 'client/network-timeline.ts', 'client/light-preparation.ts', 'client/render-quality-preparation.ts',
  'client/render-health.ts', 'client/render-engine.ts', 'shared/simulation.ts', 'shared/input-timeline.ts', 'server/index.ts', 'package.json', 'tsconfig.json',
  'docs/performance/evidence/webgpu-completion-20261021/measurement/common.mjs', 'docs/performance/evidence/webgpu-completion-20261021/measurement/qa-overlay.mjs'];
const pins = ['@babylonjs/core/package.json', '@babylonjs/core/scene.pure.js', '@babylonjs/core/Meshes/mesh.pure.js', '@babylonjs/core/Meshes/transformNode.pure.js', '@babylonjs/core/Engines/webgpuEngine.pure.js'];
const hashes = async (files, prefix = root) => Object.fromEntries(await Promise.all(files.map(async file => [file, sha256(await readFile(join(prefix, file)))])));
const before = await hashes(sources), untouchedBefore = await hashes(untouched), pinBefore = await hashes(pins, join(root, 'node_modules'));
// This legacy optional report would otherwise write outside the claimed paths.
delete process.env.PROOF_RUN;
const args = ['--import', 'tsx', '--test', '--test-reporter=tap', ...tests];
const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, windowsHide: true });
await writeFile(join(directory, 'targeted-tests.tap'), (result.stdout ?? '') + (result.stderr ?? ''));
const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram({ rootNames: sources.map(file => join(root, file)), options: { ...parsed.options, noEmit: true, incremental: false } });
const own = new Set(sources.map(file => resolve(root, file).toLowerCase()));
const diagnostics = ts.getPreEmitDiagnostics(program).map(item => ({ file: item.file?.fileName, code: item.code,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : null,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'), scoped: !item.file || own.has(resolve(item.file.fileName).toLowerCase()) }));
const ui = await readFile(join(root, 'client/ui.tsx'), 'utf8');
if (sha256(ui) !== before['client/ui.tsx']) throw new Error('UI changed immediately before exact transform/parse');
const transformed = transformUI(ui);
const uiDiagnostics = ts.createSourceFile('ui-qa.tsx', transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.map(item => item.code);
if (sha256(await readFile(join(root, 'client/ui.tsx'))) !== before['client/ui.tsx']) throw new Error('UI changed after transform/parse');
const diff = spawnSync('git', ['diff', '--check', '--', ...sources, 'docs/performance/evidence/webgpu-completion-20261021/startup-view',
  'docs/agents/handoffs/webgpu-completion-startup-view-20261021.md'], { cwd: root, encoding: 'utf8', windowsHide: true });
await writeFile(join(directory, 'scoped-typescript.json'), JSON.stringify({ roots: sources, diagnostics, uiDiagnostics,
  diff: { exit: diff.status, output: (diff.stdout ?? '') + (diff.stderr ?? '') } }, null, 2) + '\n');
const after = await hashes(sources), untouchedAfter = await hashes(untouched), pinAfter = await hashes(pins, join(root, 'node_modules'));
const stable = JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(untouchedBefore) === JSON.stringify(untouchedAfter) && JSON.stringify(pinBefore) === JSON.stringify(pinAfter);
const testLog = await readFile(join(directory, 'targeted-tests.tap')), passed = result.status === 0 && diagnostics.length === 0 && !uiDiagnostics.length && diff.status === 0 && stable;
const proof = { capturedAtUTC: new Date().toISOString(), passed, command: [process.execPath, ...args].join(' '), testExit: result.status,
  tests: Number(testLog.toString().match(/# tests (\d+)/)?.[1]), before, after, untouchedBefore, untouchedAfter, pinBefore, pinAfter, stable,
  diagnostics, uiDiagnostics, transformBefore: sha256(ui), transformAfter: sha256(transformed), logSha256: sha256(testLog),
  typescriptSha256: sha256(await readFile(join(directory, 'scoped-typescript.json'))),
  scope: 'Targeted CPU/null-device actual Game/UI/AuthorityBuffer/RenderHealth/pinned Scene and explicit revalidation; no GPU/image/FPS/fullsuite/build/integration evidence' };
await writeFile(join(directory, 'verification.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ passed, testExit: result.status, tests: proof.tests, scopedDiagnostics: diagnostics.filter(item => item.scoped).length,
  otherDiagnostics: diagnostics.filter(item => !item.scoped).length, uiDiagnostics: uiDiagnostics.length, stable,
  proofSha256: sha256(await readFile(join(directory, 'verification.json'))) }, null, 2));
if (!passed) process.exitCode = 1;
