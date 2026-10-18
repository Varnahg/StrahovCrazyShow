import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),wt=path.resolve(root,'../../..');
const base=path.join(wt,'.cache/webgpu-hitch-validation-20261017/define-order-native-v1');
const qa=path.join(wt,'.cache/webgpu-migration-checks/define-order-qa-20261018');
const candidate=path.join(root,'candidate'),hash=b=>createHash('sha256').update(b).digest('hex');
assert.ok(!fs.existsSync(candidate),'fresh owned candidate');
const manifestBytes=fs.readFileSync(path.join(base,'source-manifest.json')),manifest=JSON.parse(manifestBytes);
assert.equal(manifest.snapshotId,'2a3dba44ea28dbeffa5324fe22c35011b1e333c4233bb99ed487ee7e057d3584');
assert.equal(hash(fs.readFileSync(path.join(qa,'manifest.json'))),'37b2d5e1c31f62d4f4d0cdebaaf3063cd1ad8f3e64156ddf58a2a99563fbb228');
const target=['tests/game-light-preparation.test.ts','tests/light-preparation.test.ts','tests/webgpu-compilation-profile.test.ts'];
const related=['tests/game-render-engine.test.ts','tests/game-light-lifecycle.test.ts','tests/game-webgpu-startup.test.ts','tests/render-startup.test.ts','tests/webgpu-pipeline-preparation.test.ts'];
const files=Object.keys(manifest.files).filter(f=>/^(client|shared)\//.test(f)||target.includes(f)||related.includes(f)||/^tests\/fixtures\//.test(f)||['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json'].includes(f));
const sources={};
for(const file of files){const from=path.join(base,file),bytes=fs.readFileSync(from),expected=manifest.files[file].sha256??manifest.files[file];assert.equal(hash(bytes),expected,file);sources[file]={sha256:hash(bytes),bytes:bytes.length};}
for(const file of files){const to=path.join(candidate,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,fs.readFileSync(path.join(base,file)),{flag:'wx'});}
const dependencies=path.join(qa,'dependencies/node_modules');
assert.equal(hash(fs.readFileSync(path.join(dependencies,'@babylonjs/core/Materials/materialDefines.js'))),'43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4');
fs.symlinkSync(dependencies,path.join(candidate,'node_modules'),'junction');
const record={task:'webgpu-native-day-coverage-qa-20261018',createdAt:new Date().toISOString(),base,baseSnapshotId:manifest.snapshotId,sourceManifestSha256:hash(manifestBytes),candidate,dependencies,qaManifestSha256:hash(fs.readFileSync(path.join(qa,'manifest.json'))),dependencyManifestSha256:hash(fs.readFileSync(path.join(qa,'dependency-manifest.json'))),target,related,sources};
fs.writeFileSync(path.join(root,'input-manifest.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:files.length,bytes:Object.values(sources).reduce((n,x)=>n+x.bytes,0),baseSnapshotId:manifest.snapshotId,candidate}));
