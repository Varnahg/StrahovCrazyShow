// Root only: run after actual heavy-validation handoff/claim. No browser/GPU.
import {readFile,writeFile,mkdir,readdir,open} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [helperInput,outputInput,expected]=process.argv.slice(2);
const root=process.cwd(),helper=resolve(helperInput??''),output=resolve(outputInput??'');
const allowed=[join(root,'.cache/webgpu-completion-20261021/startup-stage-routines/helper/'),join(root,'.cache/webgpu-completion-20261021/entry-effect-cost/helper/')];
const validation=join(root,'.cache/webgpu-completion-20261021/validation')+sep;
if(!allowed.some(p=>helper.startsWith(p))||!output.startsWith(validation)||!/^[a-f0-9]{64}$/.test(expected??''))throw Error('Explicit owned helper/output/hash required');
const common=await import(pathToFileURL(join(helper,'common.mjs')).href);
const before=await common.helperIdentity(helper);if(before.sha256!==expected)throw Error('Unexpected helper bytes');
await mkdir(output);
const files=(await readdir(helper)).filter(x=>x.endsWith('.test.mjs')).sort();
if(files.length<14)throw Error('Incomplete helper corpus');
const sha=b=>createHash('sha256').update(b).digest('hex');
const inputs=[];for(const file of files)inputs.push({file,sha256:sha(await readFile(join(helper,file)))});
const args=['--import','tsx','--test','--test-concurrency=1','--test-reporter=tap',...files.map(x=>join(helper,x))];
const startedAtUTC=new Date().toISOString(),started=performance.now(),log=join(output,'corpus.tap');
const fd=await open(log,'wx');let result;
try{result=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,LINEAR_API_KEY:'',TSX_DISABLE_CACHE:'1'},stdio:['ignore',fd.fd,fd.fd],timeout:180000});}
finally{await fd.close();}
const bytes=await readFile(log),text=bytes.toString('utf8');
const last=label=>{const rows=[...text.matchAll(new RegExp('^# '+label+' (\\d+)\\r?$','gm'))];return rows.length?Number(rows.at(-1)[1]):null;};
const after=await common.helperIdentity(helper);
const proof={schemaVersion:1,startedAtUTC,completedAtUTC:new Date().toISOString(),durationMs:performance.now()-started,node:process.version,helper,helperBefore:before.sha256,helperAfter:after.sha256,files:inputs,command:[process.execPath,...args],environment:{linearCredentialCleared:true,tsxCacheDisabled:true},exitCode:result.status,error:result.error?{code:result.error.code,message:result.error.message}:null,tests:last('tests'),pass:last('pass'),fail:last('fail'),skip:last('skipped'),logSha256:sha(bytes),scope:'Entire own QA helper test corpus, including copied historical assertions; not production whole-suite/build/GPU/performance.'};
await writeFile(join(output,'verification.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,...Object.fromEntries(['helperBefore','helperAfter','exitCode','tests','pass','fail','skip','durationMs','error'].map(k=>[k,proof[k]]))}));
if(result.status!==0||after.sha256!==expected||proof.fail!==0||proof.skip!==0||proof.tests===null||proof.pass!==proof.tests)process.exitCode=1;
