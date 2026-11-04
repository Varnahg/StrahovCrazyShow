import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync,execFileSync } from 'node:child_process';
import { helperIdentity,sourceFiles } from '../../../../../../.cache/webgpu-completion-20261021/entry-effect-cost/helper/v19/common.mjs';

const parent='docs/performance/evidence/webgpu-completion-20261021/entry-effect-cost';
const pub=parent+'/review-fix-v19',own='.cache/webgpu-completion-20261021/entry-effect-cost/review-fix-v19';
const helper='.cache/webgpu-completion-20261021/entry-effect-cost/helper/v19';
const digest=p=>{const b=fs.readFileSync(p);return {sha256:createHash('sha256').update(b).digest('hex'),bytes:b.length};};
const historical=JSON.parse(fs.readFileSync(parent+'/owned-files.json','utf8'));
const previous=JSON.parse(fs.readFileSync(parent+'/complete-inputs/verification.json','utf8'));
const guards={...historical.files,[parent+'/owned-files.json']:digest(parent+'/owned-files.json')};
function collect(o){for(const [p,v] of Object.entries(o)){if(v&&typeof v==='object'&&'sha256' in v&&'bytes' in v)guards[p]=v;else collect(v);}}
collect(previous.after.guards);collect(previous.after.nativeABI);collect(previous.after.archiveDonor);
const initial=JSON.parse(fs.readFileSync(pub+'/before.json','utf8'));
Object.assign(guards,initial.native);
for(const [p,v] of Object.entries(guards))if(JSON.stringify(digest(p))!==JSON.stringify(v))throw Error('Historical/input drift '+p);
for(const name of sourceFiles.filter(n=>n!=='README.md'&&n!=='entry-effect-cost.test.mjs')){
 if(digest(helper+'/'+name).sha256!==digest('.cache/webgpu-completion-20261021/entry-effect-cost/helper/v18/'+name).sha256)throw Error('V19 runtime/copy drift '+name);
}
const snap=()=>({guards:Object.fromEntries(Object.keys(guards).sort().map(p=>[p,digest(p)])),helper:Object.fromEntries(sourceFiles.map(n=>[n,digest(helper+'/'+n)])),verifier:digest(pub+'/verify.mjs')});
const before=snap();fs.writeFileSync(pub+'/execution-before.json',JSON.stringify(before,null,2)+'\n',{flag:'wx'});
const core=helper+'/entry-effect-cost-core.mjs',needle='n.index===4||n.index===5||n.index===8',text=fs.readFileSync(core,'utf8');
if(text.split(needle).length!==2)throw Error('Exact mutation anchor');
const mutant=own+'/standard-ancestor-removed.mjs',loader=own+'/mutation-loader.mjs';
fs.writeFileSync(mutant,text.replace(needle,'n.index===4||n.index===8'),{flag:'wx'});
fs.writeFileSync(loader,`const target=${JSON.stringify(pathToFileURL(path.resolve(core)).href)},mutant=${JSON.stringify(pathToFileURL(path.resolve(mutant)).href)};\nexport async function resolve(specifier,context,next){const r=await next(specifier,context);return r.url===target?{url:mutant,shortCircuit:true}:r;}\n`,{flag:'wx'});
const base=['--import','tsx','--test','--test-concurrency=1','--test-reporter=tap','--test-name-pattern=Standard',helper+'/entry-effect-cost.test.mjs'];
const execute=(name,args)=>{
 const run=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:4*1024*1024,env:{...process.env,TSX_DISABLE_CACHE:'1'}});
 const tap=(run.stdout??'')+(run.stderr??'');fs.writeFileSync(pub+'/'+name+'.tap',tap,{flag:'wx'});
 const count=key=>Number([...tap.matchAll(new RegExp('^# '+key+' (\\d+)$','gm'))].at(-1)?.[1]??-1);
 return {command:[process.execPath,...args],exitCode:run.status,signal:run.signal,error:run.error?.message??null,tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped'),log:digest(pub+'/'+name+'.tap')};
};
const red=execute('standard-ancestor-mutation-red',['--loader',pathToFileURL(path.resolve(loader)).href,...base]);
const green=execute('standard-regressions-green',base);
const syntaxRun=spawnSync(process.execPath,['--check',helper+'/entry-effect-cost.test.mjs'],{encoding:'utf8',windowsHide:true,timeout:10000});
const after=snap(),identity=await helperIdentity(path.resolve(helper));
const proof={atUTC:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD']).toString().trim(),scope:'Test-only V19. Jen dvě nové Standard regrese; ostatních42 nejsou spuštěné. Runtime je beze změn V18. Mutant odstraňuje pouze Standard ancestor association v izolovaném loaderu, nikoli v kandidátu.',helper:identity,red,green,syntax:{status:syntaxRun.status,stderr:syntaxRun.stderr},inputStable:JSON.stringify(before)===JSON.stringify(after),before,after,mutation:{needle,replacement:'n.index===4||n.index===8',source:digest(core),mutant:digest(mutant),loader:digest(loader)},notRun:['old42-tests','helper-corpus','build','GPU','install','integration']};
fs.writeFileSync(pub+'/verification.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
if(red.exitCode!==1||red.fail!==2||red.pass!==0||green.exitCode!==0||green.pass!==2||green.fail!==0||!proof.inputStable||syntaxRun.status!==0)throw Error('Selected regression proof failed; logs preserved');
console.log(JSON.stringify({helper:identity.sha256,red:{pass:red.pass,fail:red.fail,skipped:red.skipped},green:{pass:green.pass,fail:green.fail,skipped:green.skipped},syntax:syntaxRun.status,stable:proof.inputStable,guardFiles:Object.keys(guards).length,proof:digest(pub+'/verification.json')}));
