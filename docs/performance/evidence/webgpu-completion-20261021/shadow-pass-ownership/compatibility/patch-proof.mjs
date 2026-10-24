import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const directory = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(directory, '../../../../../..');
const cache = path.join(root, '.cache/webgpu-shadow-pass-ownership-20261023/compatibility');
const baseline = JSON.parse(fs.readFileSync(path.join(cache, 'baseline.json')));
const label = process.argv[2];
assert.match(label ?? '', /^[a-z0-9-]{1,48}$/);
const work = path.join(cache, label); fs.mkdirSync(work);
const original = path.join(work, 'original'), forward = path.join(work, 'forward');
const oldPatchPath = path.join(cache, 'before/patches/@babylonjs__core@9.30.0.patch');
const patchPath = path.join(root, 'patches/@babylonjs__core@9.30.0.patch');
const oldPatch = fs.readFileSync(oldPatchPath, 'utf8'), oldLock = fs.readFileSync(path.join(cache, 'before/pnpm-lock.yaml'), 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hash = file => sha(fs.readFileSync(file));
assert.equal(hash(oldPatchPath), baseline.original['patches/@babylonjs__core@9.30.0.patch']);
const sections = source => new Map(source.split(/(?=^diff --git )/m).filter(Boolean).map(section => {
  const file = /^diff --git a\/(.+) b\//.exec(section)?.[1]; assert.ok(file); return [file, section];
}));
const oldSections = sections(oldPatch), commands = [];
const run = (args, expected = 0) => {
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  commands.push({ args, status: result.status, stderr: result.stderr });
  assert.equal(result.status, expected, result.stderr); return result.stdout;
};
for (const relative of Object.keys(baseline.native)) {
  const target = path.join(original, relative); fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(baseline.core, relative), target);
}
run(['apply', '--unsafe-paths', '--directory=' + original, '--reverse', oldPatchPath]);
const changed = ['Materials/shadowDepthWrapper.js', 'Materials/shadowDepthWrapper.d.ts'];
const additions = new Map();
for (const relative of changed) {
  const result = run(['diff', '--no-index', '--no-ext-diff', path.join(original, relative), path.join(cache, 'candidate', relative)], 1);
  additions.set(relative, result.replace(/^diff --git .+$/m, `diff --git a/${relative} b/${relative}`)
    .replace(/^--- .+$/m, `--- a/${relative}`).replace(/^\+\+\+ .+$/m, `+++ b/${relative}`));
}
let next = '';
for (const [relative, section] of oldSections) next += additions.get(relative) ?? section;
for (const [relative, section] of additions) if (!oldSections.has(relative)) next += section;
const newSections = sections(next);
const preserved = Object.fromEntries([...oldSections].filter(([relative]) => !changed.includes(relative)).map(([relative, section]) => {
  assert.equal(newSections.get(relative), section); return [relative, sha(section)];
}));
fs.writeFileSync(patchPath, next);
const previousHash = hash(oldPatchPath), nextHash = hash(patchPath);
assert.equal(oldLock.split(previousHash).length - 1, 6);
const nextLock = oldLock.replaceAll(previousHash, nextHash); fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), nextLock);
assert.equal(nextLock.replaceAll(nextHash, previousHash), oldLock);
fs.cpSync(original, forward, { recursive: true });
run(['apply', '--unsafe-paths', '--directory=' + forward, '--check', patchPath]);
run(['apply', '--unsafe-paths', '--directory=' + forward, patchPath]);
const applied = {};
for (const relative of newSections.keys()) {
  const expected = path.join(cache, 'candidate', relative);
  assert.equal(hash(path.join(forward, relative)), hash(expected)); applied[relative] = hash(expected);
}
run(['apply', '--unsafe-paths', '--directory=' + forward, '--reverse', patchPath]);
const inverse = {};
for (const relative of Object.keys(baseline.native)) {
  assert.equal(hash(path.join(forward, relative)), hash(path.join(original, relative)));
  inverse[relative] = hash(path.join(original, relative));
}
const proof = { scope: 'Only own copied native trees. No install or installed/frozen dependency writes.',
  previousPatchSha256: previousHash, patchSha256: nextHash, lockSha256: hash(path.join(root, 'pnpm-lock.yaml')),
  oldSections: oldSections.size, newSections: newSections.size, changed, preserved,
  oldUnchangedSectionsByteExact: true, lockReferences: 6, lockInverseByteExact: true,
  fullForwardByteExact: applied, fullReverseByteExact: inverse, commands };
fs.writeFileSync(path.join(directory, 'patch-proof.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ patchSha256: nextHash, lockSha256: proof.lockSha256, oldSections: oldSections.size,
  newSections: newSections.size, preserved: Object.keys(preserved).length, forward: Object.keys(applied).length,
  reverse: Object.keys(inverse).length, lockReferences: 6 }));
