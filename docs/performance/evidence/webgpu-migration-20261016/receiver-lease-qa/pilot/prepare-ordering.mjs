import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,repo=join(root,'../..'),out=join(root,'candidate-v1'),commit='18701037dd3d8faae9b7bd1807ecfbf23e18aec4',hash=b=>createHash('sha256').update(b).digest('hex'),changes=[];
for(const path of ['client/stable-light-state.ts','tests/stable-light-state.test.ts']){
  const before=execFileSync('git',['show',commit+'^:'+path],{cwd:repo}),after=execFileSync('git',['show',commit+':'+path],{cwd:repo});
  assert.equal(hash(readFileSync(join(out,path))),hash(before),path+' exact current baseline');
  writeFileSync(join(out,path),after);changes.push({path,before:hash(before),after:hash(after),sourceCommit:commit,scope:'Only prior exact explicit pendingMeshes input and its regression tests; the rejected receiver scanner is not reused.'});
}
mkdirSync(join(out,'qa-provenance/receiver-lease'),{recursive:true});writeFileSync(join(out,'qa-provenance/receiver-lease/ordering.json'),JSON.stringify(changes,null,2)+'\n');console.log(JSON.stringify(changes));
