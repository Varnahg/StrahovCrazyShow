import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const out=import.meta.dirname,repo=resolve(out,'../../../..'),recipient='C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020';
const hash=b=>createHash('sha256').update(b).digest('hex');
function git(cwd,args,allowed=[0]){const r=spawnSync('git',args,{cwd,encoding:null,maxBuffer:10e6});assert(allowed.includes(r.status),String(r.stderr));return r;}
const expected=JSON.parse(readFileSync(join(repo,'.cache/client-threading-grass-worker-validation-20261019/combined/source-manifest.json')));
assert.equal(expected.snapshotId,'f893fb5b44f87bef01a78d66c764ce256062c292eda796544b15703ad8d21da4');
const paths=Object.keys(expected.overlay),tracked=paths.filter(p=>git(repo,['ls-files','--error-unmatch','--',p],[0,1]).status===0),added=paths.filter(p=>!tracked.includes(p));
assert.equal(paths.length,7);assert.equal(tracked.length,3);assert.equal(added.length,4);
const baseCommit=git(repo,['rev-parse','HEAD']).stdout.toString().trim(),files={},artifacts={};
function save(relative,bytes){const p=join(out,relative);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,bytes);assert.equal(hash(readFileSync(p)),hash(bytes));artifacts[relative]={sha256:hash(bytes),bytes:bytes.length};}
for(const p of paths){const bytes=readFileSync(join(repo,p));assert.equal(hash(bytes),expected.overlay[p],p);save('working/'+p,bytes);let before=null;if(tracked.includes(p)){const b=git(repo,['show',baseCommit+':'+p]).stdout;save('base/'+p,b);before=hash(b);}files[p]={beforeSha256:before,afterSha256:hash(bytes),bytes:bytes.length,status:before?'modified':'added'};}
const parts=[git(repo,['diff','--binary','--full-index','--no-ext-diff','HEAD','--',...tracked]).stdout];
for(const p of added){const r=git(repo,['diff','--no-index','--binary','--full-index','--','/dev/null',p],[1]);assert(r.stdout.toString().includes('+++ b/'+p));parts.push(r.stdout);}
const patch=Buffer.concat(parts);save('worker-prototype.patch',patch);
const patchNames=[...patch.toString().matchAll(/^\+\+\+ b\/(.+)$/gm)].map(m=>m[1].trim()).sort();assert.deepEqual(patchNames,[...paths].sort());
const recipientHead=git(recipient,['rev-parse','HEAD']).stdout.toString().trim(),recipientStatus=git(recipient,['status','--porcelain=v1','-z']).stdout;
const recipientFiles=Object.fromEntries(paths.map(p=>[p,existsSync(join(recipient,p))?hash(readFileSync(join(recipient,p))):null]));
const check=git(recipient,['apply','--check','--',join(out,'worker-prototype.patch')],[0,1,128]);
assert.equal(hash(git(recipient,['status','--porcelain=v1','-z']).stdout),hash(recipientStatus),'Recipient status changed');
for(const[p,sha]of Object.entries(recipientFiles))assert.equal(existsSync(join(recipient,p))?hash(readFileSync(join(recipient,p))):null,sha,p);
save('patch-check.json',Buffer.from(JSON.stringify({recipient,recipientHead,checkedAt:new Date().toISOString(),exitCode:check.status,stdout:check.stdout.toString(),stderr:check.stderr.toString(),recipientFiles,scope:'Read-only git apply --check, no patch applied and no tests rerun.'},null,2)+'\n'));
for(const stage of ['test','types','build','integration'])for(const kind of ['clean','combined'])for(const ext of ['json','log'])save('validation/'+kind+'-'+stage+'.'+ext,readFileSync(join(repo,'.cache/client-threading-grass-worker-validation-20261019/logs',kind+'-'+stage+'.'+ext)));
for(const name of ['targeted.json','targeted.log','types.json','types.log'])save('validation/unit-v2-'+name,readFileSync(join(repo,'.cache/client-threading-cpu-profile-20261019/worker-unit-v2-logs',name)));
save('validation/summary.json',readFileSync(join(repo,'.cache/client-threading-grass-worker-validation-20261019/validation.json')));
save('provenance/prototype-spec.md',readFileSync(join(out,'../spec.md')));
save('provenance/shutdown-handoff.md',readFileSync(join(repo,'docs/agents/handoffs/client-threading-grass-worker-validation-20261019.md')));
const result={createdAt:new Date().toISOString(),senderThread:'01a15535-be83-7be2-94c5-595287555490',senderOwner:'threading-01a15535-grass-acceptance',recipientOwner:'refactor-01a15658-audit',recipientThread:'01a15658-1415-7d41-9efe-6d3be9dd9f34',sourceWorktree:repo,baseCommit,prototypeRuntimeCommit:null,testedCombinedSource:expected.snapshotId,files,artifacts,patchCheckExitCode:check.status,scope:'Custody transfer of exact uncommitted experimental WIP, not acceptance or authorization to enable/ship worker. No other dirty paths included.'};
writeFileSync(join(out,'manifest.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files:paths.length,patchSha256:hash(patch),patchCheckExitCode:check.status,recipientHead,manifestSha256:hash(readFileSync(join(out,'manifest.json')))}));
