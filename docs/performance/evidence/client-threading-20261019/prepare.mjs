import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const root = import.meta.dirname;
const donor = 'C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow/.cache/webgpu-medium-vehicle-user-build-20261019';
const base = join(donor, 'snapshot'), snapshot = join(root, 'snapshot');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = readFileSync(join(base,'source-manifest.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.snapshotId, '65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60');
assert.equal(hash(JSON.stringify(manifest.files)), manifest.snapshotId);
assert(!existsSync(snapshot), 'Preserve existing snapshot');
mkdirSync(snapshot,{recursive:true});
for (const [file, expected] of Object.entries(manifest.files)) {
  const bytes = readFileSync(join(base,file));
  assert.equal(hash(bytes),expected,file);
  mkdirSync(dirname(join(snapshot,file)),{recursive:true});
  writeFileSync(join(snapshot,file),bytes);
}
for (const folder of ['assets','public','docs','node_modules','dist']) {
  assert(!existsSync(join(snapshot,folder)), 'Cannot overwrite copied source folder '+folder);
  symlinkSync(realpathSync(join(base,folder)),join(snapshot,folder),'junction');
}
writeFileSync(join(snapshot,'source-manifest.json'),manifestBytes);
const identity = JSON.parse(readFileSync(join(donor,'build-identity.json')));
for (const [file, expected] of Object.entries(identity.deliveredCode)) assert.equal(hash(readFileSync(join(snapshot,'dist',file))),expected,file);
for (const name of ['start.ps1','stop.ps1','preview.mjs','verify.mjs']) {
  const code = readFileSync(join(donor,name),'utf8')
    .replaceAll('webgpu-medium-vehicle-user-build-20261019','client-threading-lab-20261019')
    .replaceAll('webgpu-01a15102-medium-vehicle-user','threading-01a15535-lab')
    .replaceAll('4203','4204').replaceAll('2598','2599')
    .replaceAll('4204/?renderBackend=webgpu', '4204/?renderBackend=webgpu&profileEnvironment=1')
    .replaceAll('služby F3 user4204', 'služby CPU lab4204');
  writeFileSync(join(root,name),code);
}
writeFileSync(join(root,'build-identity.json'),JSON.stringify({...identity,createdUTC:new Date().toISOString(),snapshot,base,distCopied:false,distReadonly:true,url:'http://127.0.0.1:4204/?renderBackend=webgpu&profileEnvironment=1',apiPort:2599,scope:'Decision profile only. Byte-exact source/test and readonly production dist/assets/dependencies from preserved4203. Separate API/log cwd; existing bounded environment profiler; not performance acceptance.'},null,2)+'\n');
console.log(JSON.stringify({source:manifest.snapshotId,sourceFiles:Object.keys(manifest.files).length,codeFiles:Object.keys(identity.deliveredCode).length,snapshot}));
