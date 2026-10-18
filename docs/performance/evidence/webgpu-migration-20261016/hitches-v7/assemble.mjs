import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const base=path.resolve(root,'../../webgpu-hitch-validation-20261017/async-production-v3');
const candidate=path.join(root,'candidate');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'source-manifest.json'),'utf8'));
if(manifest.snapshotId!=='ec2802daf9426f63814054627adf5a18f04cd54eb2da20e800eb1a89feb6c563') throw Error('Unexpected readonly base');
if(fs.existsSync(candidate)) throw Error('Candidate already exists; do not overwrite a reviewed copy');
const copied={};
function copy(relative){
  const input=path.join(base,relative),stat=fs.lstatSync(input);
  if(stat.isSymbolicLink()) throw Error('Unexpected source link '+relative);
  if(stat.isDirectory()){for(const name of fs.readdirSync(input))copy(relative+'/'+name);return;}
  const bytes=fs.readFileSync(input),hash=createHash('sha256').update(bytes).digest('hex');
  if(manifest.files[relative]!==hash) throw Error('Source hash mismatch '+relative);
  const output=path.join(candidate,relative);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes);copied[relative]=hash;
}
for(const dir of ['client','shared'])copy(dir);
for(const file of ['package.json','tsconfig.json','tests/game-light-preparation.test.ts','tests/light-preparation.test.ts','tests/cinematic.test.ts'])copy(file);
fs.symlinkSync(path.resolve(root,'../../webgpu-migration/dependencies-v5/node_modules'),path.join(candidate,'node_modules'),'junction');
fs.writeFileSync(path.join(root,'input-manifest.json'),JSON.stringify({snapshotId:manifest.snapshotId,sourceCommit:manifest.sourceCommit,base,candidate,files:copied},null,2)+'\n');
console.log(JSON.stringify({candidate,files:Object.keys(copied).length,snapshotId:manifest.snapshotId}));
