import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const current = resolve(root, '../webgpu-cpu-profile-20261018/candidate-v2');
const historical = 'C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/.cache/webgpu-migration-checks/define-memo-owner-qa-20261018';
const oldCore = 'C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/.cache/webgpu-hitch-validation-20261017/native-day13-memo-v1/node_modules/@babylonjs/core';
const modules = join(current, 'node_modules'), candidate = join(root, 'candidate/node_modules/@babylonjs/core'), fixture = join(root, 'fixture');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['Materials/materialDefines.js', 'Materials/materialDefines.d.ts', 'Materials/standardMaterial.pure.js', 'Materials/PBR/pbrBaseMaterial.pure.js'];
const inputs = {}, adaptations = [], changes = [], inverses = [];
function write(path, bytes) { fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, bytes, { flag: 'wx' }); }
function read(path) { const bytes = fs.readFileSync(path); inputs[path] = sha(bytes); return bytes; }
function once(text, before, after) { assert.equal(text.split(before).length, 2, before); return text.replace(before, after); }
assert.ok(!fs.existsSync(fixture), 'Preserve earlier assembly');
for (const file of files) {
  const before = read(join(modules, '@babylonjs/core', file)), oldBefore = read(join(historical, 'preimages', file));
  const knownAfter = read(join(oldCore, file));
  let after;
  if (file.startsWith('Materials/materialDefines.')) {
    assert.deepEqual(before, oldBefore, 'Exact unchanged base required for full MaterialDefines transplant');
    after = knownAfter;
    if (file.endsWith('.js')) {
      const marker = 'function canonicalResult(';
      assert.ok(before.toString().includes(marker));
      assert.equal(after.toString().slice(after.toString().indexOf(marker)), before.toString().slice(before.toString().indexOf(marker)), 'Canonicalizer bytes unchanged');
    }
  } else {
    const from = 'const join = defines.toString();', to = 'const join = MaterialDefines._SerializeForEngine(defines, engine);';
    assert.equal(once(oldBefore.toString(), from, to), knownAfter.toString(), 'Old material delta is precisely one callsite');
    after = Buffer.from(once(before.toString(), from, to));
    assert.equal(once(after.toString(), to, from), before.toString(), 'All current material bytes preserved by inverse');
  }
  write(join(candidate, file), after); write(join(root, 'preimages', file), before);
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(before.length, after.length) && before[prefix] === after[prefix]) prefix++;
  while (suffix < Math.min(before.length, after.length) - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const removed = before.subarray(prefix, before.length - suffix), added = after.subarray(prefix, after.length - suffix);
  const restored = Buffer.concat([after.subarray(0, prefix), removed, after.subarray(after.length - suffix)]);
  assert.deepEqual(restored, before, 'Inverse restores entire current source');
  changes.push({ path: '@babylonjs/core/' + file, before: sha(before), originalSha256: sha(before), sha256: sha(after), bytes: after.length });
  inverses.push({ path: file, prefixBytes: prefix, suffixBytes: suffix, removedBase64: removed.toString('base64'), addedBase64: added.toString('base64'), before: sha(before), after: sha(after), restored: sha(restored) });
}
// A private physical core/loaders sandbox is necessary for normal Node package
// resolution to keep one actual class identity. No shared package is modified.
const dependencyFiles = {};
for (const pkg of ['@babylonjs/core', '@babylonjs/loaders']) {
  const from = join(modules, pkg), to = join(fixture, 'node_modules', pkg);
  fs.cpSync(from, to, { recursive: true, dereference: true, errorOnExist: true, force: false });
  function walk(dir, prefix = '') { for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? prefix + '/' + item.name : item.name, path = join(dir, item.name);
    if (item.isDirectory()) walk(path, relative); else dependencyFiles[pkg + '/' + relative] = sha(fs.readFileSync(path));
  } }
  walk(from);
}
for (const change of changes) fs.copyFileSync(join(candidate, change.path.slice('@babylonjs/core/'.length)), join(fixture, 'node_modules', change.path));
for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
  if (entry.name.startsWith('.')) continue;
  const names = entry.name.startsWith('@') ? fs.readdirSync(join(modules, entry.name)).map(name => entry.name + '/' + name) : [entry.name];
  for (const name of names) {
    if (name === '@babylonjs/core' || name === '@babylonjs/loaders') continue;
    const target = join(fixture, 'node_modules', name);
    fs.mkdirSync(dirname(target), { recursive: true }); fs.symlinkSync(fs.realpathSync(join(modules, name)), target, 'junction');
  }
}
// Copy only the recursively imported current TS fixture closure, not an old
// application snapshot. The accepted eighteen assertions remain current bytes.
const require = createRequire(join(modules, 'typescript/package.json'));
const ts = require(join(modules, 'typescript/lib/typescript.js'));
const copied = new Set();
function copySource(relative) {
  if (copied.has(relative)) return; copied.add(relative);
  const source = read(join(current, relative)); write(join(fixture, relative), source);
  if (!/\.[cm]?[jt]sx?$/.test(relative)) return;
  for (const imported of ts.preProcessFile(source.toString(), true, true).importedFiles) {
    if (!imported.fileName.startsWith('.')) continue;
    const absolute = resolve(current, dirname(relative), imported.fileName);
    const found = [absolute, ...['.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts'].map(suffix => absolute + suffix)].find(path => fs.existsSync(path) && fs.statSync(path).isFile());
    assert.ok(found, 'Current local dependency exists: ' + imported.fileName);
    assert.ok(found.startsWith(current + '/') || found.startsWith(current + '\\'));
    copySource(found.slice(current.length + 1).replaceAll('\\', '/'));
  }
}
for (const file of ['tests/material-defines-serialization.test.ts', 'tests/material-defines-wgsl-order.test.ts', 'tests/fixtures/material-defines-order/baseline.json.gz', 'tests/fixtures/material-defines-order/provenance.json', 'tsconfig.json', 'package.json']) copySource(file);
for (const file of ['owner-inspection.mjs', 'owner-inspection.d.mts']) write(join(root, file), read(join(historical, file)));
write(join(root, 'owner.test.mjs'), read(join(historical, 'portable/owner.test.mjs')));
// The portable oracle's exact SHA is still the current MaterialDefines preimage.
write(join(root, 'preimages/Materials/materialDefines.js.oracle'), fs.readFileSync(join(root, 'preimages/Materials/materialDefines.js')));
const scenarioPath = 'tests/fixtures/material-defines-order/scenario.ts';
const beforeScenario = fs.readFileSync(join(fixture, scenarioPath), 'utf8');
let scenario = once(beforeScenario, "import assert from 'node:assert/strict';", "import assert from 'node:assert/strict';\nimport {inspectOwner,holdOwnerForCleanup} from '../../../../owner-inspection.mjs';");
scenario = once(scenario, '    this._isWebGPU = native;', '    this._isWebGPU = native;\n    // Test IO token, not an actual GPU device.\n    (this as any)._device = native ? {lost:new Promise(()=>{})} : undefined;');
scenario = once(scenario, '    result.programs=engine.sources.length;', '    result.memo=inspectOwner(engine);\n    if(process.env.OWNER_MODE==="owner")assert.ok(result.memo?.entries>0,"actual stock adapter owns cached text for this plugin path");\n    result.programs=engine.sources.length;');
scenario = once(scenario, 'engine.dispose();await setImmediate();', 'const checkMemo=holdOwnerForCleanup(engine);engine.dispose();await setImmediate();result.memoCleanup=checkMemo();\n    if(process.env.OWNER_MODE==="owner")assert.deepEqual(result.memoCleanup,{entries:0,units:0,active:false,disposed:true,engine:false,device:false,observers:0});');
fs.writeFileSync(join(fixture, scenarioPath), scenario);
adaptations.push({ path: scenarioPath, before: sha(beforeScenario), after: sha(scenario), scope: 'Exactly the four already accepted device-token/owner-observation/cleanup fixture adaptations; current assertions retained.' });
// Top-level lifecycle tests resolve the same physically merged core as fixture.
fs.symlinkSync(join(fixture, 'node_modules'), join(root, 'node_modules'), 'junction');
for (const [pkgPath, before] of Object.entries(dependencyFiles)) {
  const change = changes.find(change => change.path === pkgPath);
  assert.equal(sha(fs.readFileSync(join(fixture, 'node_modules', pkgPath))), change?.sha256 ?? before, 'No unrelated package drift: ' + pkgPath);
}
write(join(root, 'runtime-changes.json'), JSON.stringify({ changes }, null, 2) + '\n');
write(join(root, 'source-inverse.json'), JSON.stringify({ inverses, exactRoundtrip: true }, null, 2) + '\n');
write(join(root, 'input-manifest.json'), JSON.stringify({ current, historical, oldCore, inputs, currentPackages: dependencyFiles, fixtureCopies: [...copied], adaptations, packageCount: Object.keys(dependencyFiles).length }, null, 2) + '\n');
console.log(JSON.stringify({ changes, copiedSources: copied.size, packages: Object.keys(dependencyFiles).length, inverse: '4/4 exact' }, null, 2));
