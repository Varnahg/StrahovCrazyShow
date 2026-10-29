import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
const target='C:/Users/rezac/.codex/worktrees/playtest-diary/StrahovCrazyShow';
const commit='960cb6ff4c233dc57ed5f3a4bfa8ae7ed9a702c6';
const output=path.dirname(import.meta.filename);
const names=['prepare-light-variants-20261016','profile-night-flashlight-20261015','stabilize-light-variants-20261015'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const records=[];
for(const name of names){
 const relative='docs/agents/tasks/'+name+'.json';
 const absolute=path.resolve(target,relative);
 if(cp.execFileSync('git',['-C',target,'ls-files','--',relative]).length)throw Error('Bootstrap is tracked: '+relative);
 const original=fs.readFileSync(absolute);
 const committed=cp.execFileSync('git',['-C',target,'show',commit+':'+relative]);
 fs.writeFileSync(path.join(output,name+'.bootstrap.json'),original,{flag:'wx'});
 fs.writeFileSync(path.join(output,name+'.committed.json'),committed,{flag:'wx'});
 records.push({relative,absolute,bootstrapSha256:sha(original),committedSha256:sha(committed),byteIdentical:original.equals(committed),jsonEquivalent:JSON.stringify(JSON.parse(original))===JSON.stringify(JSON.parse(committed))});
}
const result={verifiedAt:new Date().toISOString(),target,commit,records};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result,null,2));
