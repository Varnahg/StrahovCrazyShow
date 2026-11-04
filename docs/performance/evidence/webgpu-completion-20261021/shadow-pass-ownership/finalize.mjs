import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(directory, '../../../../..');
const cache = path.join(root, '.cache/webgpu-shadow-pass-ownership-20261023');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name)));
const base = JSON.parse(fs.readFileSync(path.join(cache, 'baseline.json')));
const cpu = read('final-broader-green.json'), types = read('typescript.json'), patch = read('patch-proof.json');
assert.equal(cpu.exit, 0); assert.equal(cpu.counts.pass, 201); assert.equal(cpu.counts.fail, 0); assert.equal(cpu.stable, true);
assert.equal(cpu.logSha256, hash(path.join(directory, 'final-broader-green.tap')));
assert.equal(types.diagnostics.length, 0); assert.equal(types.declarationDrift.length, 0);
assert.equal(types.logSha256, hash(path.join(directory, 'types.log')));
const provenance = 'tests/fixtures/webgpu-shadow-sharing/provenance.json';
for (const [file, expected] of Object.entries(cpu.after.source)) if (file !== provenance) assert.equal(hash(path.join(root, file)), expected, file);
for (const [file, expected] of Object.entries(cpu.after.tests)) assert.equal(hash(path.join(root, file)), expected, file);
const compare = (prefix, expected) => {
  const actual = Object.fromEntries(Object.keys(expected).map(file => [file, hash(path.join(prefix, file))]));
  assert.deepEqual(actual, expected); return actual;
};
const snapshot = () => ({ source: Object.fromEntries(Object.keys(cpu.after.source).map(file => [file, hash(path.join(root, file))])),
  tests: compare(root, cpu.after.tests), protected: compare(root, base.protected), historical: compare(root, base.historical),
  freshNative: compare(base.core, base.native), installedNative: compare(base.rootCore, base.installed),
  candidate: compare(path.join(cache, 'candidate'), cpu.after.candidate), usedNative: Object.fromEntries(Object.entries(cpu.usedNative.modules).map(([file, expected]) => {
    const actual = hash(path.join(file.replaceAll('\\', '/') === 'Materials/shadowDepthWrapper.js' ? path.join(cache, 'candidate') : base.core, file));
    assert.equal(actual, expected, file); return [file, actual];
  })), typedNative: Object.fromEntries(Object.entries(types.readonlySource10DeclarationFiles).map(([file, expected]) => {
    const actual = hash(path.join(file.replaceAll('\\', '/') === types.candidateDeclaration ? path.join(cache, 'candidate') : base.core, file));
    assert.equal(actual, expected, file); return [file, actual];
  })) });
const before = snapshot();
const oldModule = fs.readFileSync(path.join(cache, 'native-before/Materials/shadowDepthWrapper.js'), 'utf8');
const nextModule = fs.readFileSync(path.join(cache, 'candidate/Materials/shadowDepthWrapper.js'), 'utf8');
const tokenHelper = source => source.slice(source.indexOf('    _getDepthProgramToken('), source.indexOf('    /**', source.indexOf('    _getDepthProgramToken(')));
const shaderRecipe = source => source.slice(source.indexOf('        const uniforms ='), source.indexOf('        if (this._depthTokens) {', source.indexOf('        const nextEffect =')));
assert.ok(tokenHelper(oldModule).length > 1000); assert.equal(tokenHelper(nextModule), tokenHelper(oldModule));
assert.ok(shaderRecipe(oldModule).length > 3000); assert.equal(shaderRecipe(nextModule), shaderRecipe(oldModule));
assert.equal(patch.patchSha256, hash(path.join(root, 'patches/@babylonjs__core@9.30.0.patch')));
assert.equal(patch.lockSha256, hash(path.join(root, 'pnpm-lock.yaml')));
for (const ext of ['js', 'd.ts']) assert.equal(hash(path.join(cache, 'candidate/Materials/shadowDepthWrapper.' + ext)), hash(path.join(directory, 'candidate-shadowDepthWrapper.' + ext + '.txt')));
const syntaxFiles = ['tests/fixtures/webgpu-shadow-sharing/loader.mjs', 'tests/fixtures/webgpu-shadow-sharing/fixture.mjs',
  'tests/fixtures/webgpu-shadow-sharing/shadow-share.test.mjs', 'tests/fixtures/webgpu-shadow-sharing/pass-ownership.test.mjs',
  ...['verify.mjs', 'typecheck.mjs', 'patch-proof.mjs', 'finalize.mjs'].map(file => path.relative(root, path.join(directory, file))),
  path.relative(root, path.join(cache, 'candidate/Materials/shadowDepthWrapper.js'))];
const syntax = syntaxFiles.map(file => {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr); return { file, sha256: hash(path.join(root, file)), status: result.status };
});
const diff = spawnSync('git', ['diff', '--check', '--', ...Object.keys(before.source), path.relative(root, directory)], { cwd: root, encoding: 'utf8', windowsHide: true });
assert.equal(diff.status, 0, diff.stdout + diff.stderr);
const after = snapshot(); assert.deepEqual(before, after);
const proof = { schema: 1, task: 'webgpu-completion-shadow-pass-ownership-20261023', completedUTC: new Date().toISOString(),
  scope: 'CPU only, own native copy. No installed/frozen writes, install/build/server/fullsuite/GPU or performance/pixel claim.',
  cpu: { roots: cpu.tests, counts: cpu.counts, proofSha256: hash(path.join(directory, 'final-broader-green.json')), tapSha256: cpu.logSha256, stable: cpu.stable },
  semanticTypeScript: { roots: types.roots.length, diagnostics: 0, declarationFiles: Object.keys(types.readonlySource10DeclarationFiles).length, drift: 0,
    proofSha256: hash(path.join(directory, 'typescript.json')), logSha256: types.logSha256 },
  syntax, diffCheckStatus: diff.status,
  patch: { proofSha256: hash(path.join(directory, 'patch-proof.json')), patchSha256: patch.patchSha256, lockSha256: patch.lockSha256,
    oldSections: patch.oldSections, newSections: patch.newSections, preservedSections: Object.keys(patch.preserved).length, lockReferences: 6 },
  unchangedNativeRecipes: { tokenHelperByteExact: true, shaderRecipeByteExact: true },
  metadataOnlyAfterCpu: { file: provenance, cpuHash: cpu.after.source[provenance], finalHash: before.source[provenance],
    reason: 'Nonexecuted provenance now identifies predecessor19 plus new14 portable cases and current accepted module. No runtime/test byte changed.' },
  before, after, stable: true };
fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ verificationSha256: hash(path.join(directory, 'verification.json')), tests: cpu.counts, types: 0,
  syntax: syntax.length, protected: Object.keys(before.protected).length, historical: Object.keys(before.historical).length,
  fresh: Object.keys(before.freshNative).length, installed: Object.keys(before.installedNative).length, usedNative: Object.keys(before.usedNative).length, stable: true }));
