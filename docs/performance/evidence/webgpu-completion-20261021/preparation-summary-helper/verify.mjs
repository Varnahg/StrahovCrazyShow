/** Focused CPU proof; all persistent outputs are in this owned evidence prefix. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../../../../..');
const target = join(root, '.cache/webgpu-completion-20261021/preparation-summary/helper/v10');
const original = join(root, '.cache/webgpu-completion-20261021/validation/helper-runtimes/v9');
const before = JSON.parse(await readFile(join(directory, 'before.json'), 'utf8'));
const { helperIdentity, sha256, transformUI } = await import(pathToFileURL(join(target, 'common.mjs')));
const { helperIdentity: originalHelperIdentity } = await import(pathToFileURL(join(original, 'common.mjs')));
const originalIdentity = await originalHelperIdentity(original), helperBefore = await helperIdentity(target);
assert.deepEqual(originalIdentity, before.before); assert.equal(resolve(target, '../../../../..'), root);
const protectedBefore = {};
for (const [path, expected] of Object.entries(before.protectedHashes)) {
  protectedBefore[path] = sha256(await readFile(join(root, path))); assert.equal(protectedBefore[path], expected, 'Protected input: ' + path);
}
const changed = ['startup-observer.mjs', 'qa-overlay.mjs', 'common.mjs', 'README.md'];
for (const [file, expected] of Object.entries(before.before.files)) {
  if (!changed.includes(file)) assert.equal(helperBefore.files[file], expected, 'Unchanged copied source: ' + file);
}
const observer = await readFile(join(target, 'startup-observer.mjs'));
const originalObserver = await readFile(join(original, 'startup-observer.mjs'));
assert.deepEqual(observer.subarray(0, originalObserver.length), originalObserver);
assert.equal(observer.subarray(originalObserver.length).toString(), await readFile(join(directory, 'summary-addition.mjs'), 'utf8'));
let overlay = await readFile(join(target, 'qa-overlay.mjs'), 'utf8');
function reverse(from, to) { assert.equal(overlay.split(from).length, 2, 'Exact-once reverse anchor'); overlay = overlay.replace(from, to); }
reverse('import { observeOperation, observePreparationResult }', 'import { observeOperation }');
reverse('clockOwner, latencyOwner, preparationOwner, attributionWindow', 'clockOwner, latencyOwner, attributionWindow');
reverse('    lifecycleOwner?.dispose(); preparationOwner?.dispose();', '    lifecycleOwner?.dispose();');
reverse('    clockOwner = owner;\n    preparationOwner = observePreparationResult(game, { signal: clockAbort.signal, startupSignal: game.startupAbort?.signal,\n      isCurrent: () => !disposed && gameRef === game, onObserverError: noteError });\n    return start();', '    clockOwner = owner;\n    return start();');
reverse('      latencyOwner?.dispose(); preparationOwner?.dispose();\n      if(outcome', '      latencyOwner?.dispose();\n      if(outcome');
reverse('startupLatency: latencyOwner?.snapshot() ?? null, shaderAttribution: null,\n        preparationSummary: preparationOwner?.snapshot() ?? { available: false, reason: \'not-installed\' },', 'startupLatency: latencyOwner?.snapshot() ?? null, shaderAttribution: null,');
assert.equal(overlay, await readFile(join(original, 'qa-overlay.mjs'), 'utf8'));
const common = await readFile(join(target, 'common.mjs'), 'utf8');
assert.equal(common.replace("'depth-inputs.test.mjs', 'preparation-summary.test.mjs', 'README.md'", "'depth-inputs.test.mjs', 'README.md'"), await readFile(join(original, 'common.mjs'), 'utf8'));
const readme = await readFile(join(target, 'README.md')), originalReadme = await readFile(join(original, 'README.md'));
assert.deepEqual(readme.subarray(readme.length - originalReadme.length), originalReadme);
const focusedCommand = ['--test', '--test-reporter=tap', join(target, 'preparation-summary.test.mjs')];
const inheritedCommand = ['--test', '--test-reporter=tap', '--test-name-pattern=startup terminal capture precedes original UI teardown|observer faults never replace startup failure', join(target, 'helper.test.mjs')];
function run(args, logName) {
  const output = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 60000 });
  const log = '$ node ' + args.join(' ') + '\n' + output.stdout + output.stderr;
  return { output, log, logName, sha256: sha256(log) };
}
const focused = run(focusedCommand, 'focused.tap'), inherited = run(inheritedCommand, 'original-observer.tap');
await writeFile(join(directory, focused.logName), focused.log); await writeFile(join(directory, inherited.logName), inherited.log);
assert.equal(focused.output.status, 0, focused.log); assert.equal(inherited.output.status, 0, inherited.log);
assert.match(focused.log, /# pass 59\b/); assert.match(focused.log, /# fail 0\b/);
assert.match(inherited.log, /# pass 2\b/); assert.match(inherited.log, /# fail 0\b/);
const syntax = [];
for (const file of Object.keys(helperBefore.files).filter(file => file.endsWith('.mjs'))) {
  const source = await readFile(join(target, file), 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const checked = spawnSync(process.execPath, ['--check', join(target, file)], { cwd: root, encoding: 'utf8', timeout: 10000 });
  syntax.push({ file, parseDiagnostics: parsed.parseDiagnostics.length, nodeStatus: checked.status, output: checked.stdout + checked.stderr });
}
const uiPath = join(root, 'client/ui.tsx'), uiBytes = await readFile(uiPath), uiBefore = sha256(uiBytes);
const transformed = transformUI(uiBytes.toString()); assert.equal(sha256(await readFile(uiPath)), uiBefore, 'UI bytes before parse');
const uiParseDiagnostics = ts.createSourceFile('qa-ui.tsx', transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length;
assert.equal(sha256(await readFile(uiPath)), uiBefore, 'UI bytes after parse'); assert.equal(uiParseDiagnostics, 0);
assert.equal(syntax.length, 29); for (const row of syntax) { assert.equal(row.parseDiagnostics, 0); assert.equal(row.nodeStatus, 0, row.output); }
const syntaxLog = JSON.stringify({ scope: 'JS syntax/parse only; no semantic full-project TS/build', syntax, uiBefore, uiParseDiagnostics }, null, 2) + '\n';
await writeFile(join(directory, 'syntax.json'), syntaxLog);
const helperAfter = await helperIdentity(target), originalAfter = await originalHelperIdentity(original);
assert.deepEqual(helperBefore, helperAfter); assert.deepEqual(originalIdentity, originalAfter);
const protectedAfter = {};
for (const [path, expected] of Object.entries(protectedBefore)) {
  protectedAfter[path] = sha256(await readFile(join(root, path))); assert.equal(protectedAfter[path], expected, 'Protected input after: ' + path);
}
const proof = { schemaVersion: 1, capturedAtUTC: new Date().toISOString(), metadata: 'ac0626e7',
  beforeProofSha256: sha256(await readFile(join(directory, 'before.json'))), originalBefore: originalIdentity, originalAfter,
  helperBefore, helperAfter, protectedBefore, protectedAfter, changedOriginalInputs: changed, added: ['preparation-summary.test.mjs'],
  exactObserverPrefix: true, exactOverlayReverse: true, exactCommonReverse: true, exactReadmeSuffix: true, depth5: true,
  testResults: { focused: { pass: 59, fail: 0, skipped: 0, log: focused.logName, sha256: focused.sha256 },
    originalObserver: { pass: 2, fail: 0, log: inherited.logName, sha256: inherited.sha256 } },
  syntax: { jsCount: syntax.length, nodeFailures: 0, parseDiagnostics: 0, uiParseDiagnostics, log: 'syntax.json', sha256: sha256(syntaxLog) },
  scope: 'CPU result/descriptor/native-Promise/actual-overlay scalar IO contracts only; no actual Game GPU/build/server/visibility/performance acceptance.' };
await writeFile(join(directory, 'verification.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ helperSha256: helperAfter.sha256, helperFiles: Object.keys(helperAfter.files).length,
  focusedPass: 59, originalPass: 2, syntaxCount: syntax.length, uiParseDiagnostics,
  originalSha256: originalAfter.sha256, protectedFiles: Object.keys(protectedAfter).length,
  verificationSha256: sha256(await readFile(join(directory, 'verification.json'))) }, null, 2));
