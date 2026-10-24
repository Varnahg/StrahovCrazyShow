import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../../../..');
const cache=path.join(root,'.cache/webgpu-leaf-shadow-preparation-20261023');
const base=JSON.parse(fs.readFileSync(path.join(cache,'baseline.json'))),label=process.argv[2];
if(!/^[a-z0-9-]{1,48}$/.test(label??''))throw Error('Invalid proof label');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const digests=(names,prefix=root)=>Object.fromEntries(names.map(name=>[name,fs.existsSync(path.join(prefix,name))?hash(path.join(prefix,name)):null]));
const snapshot=()=>({source:digests(base.files),tests:digests(process.argv.slice(3).length?process.argv.slice(3):base.files.filter(name=>name.startsWith('tests/'))),protected:digests(base.protectedPaths),historical:digests(Object.keys(base.historical)),freshNative:digests(Object.keys(base.native),base.core),installedNative:digests(Object.keys(base.installed),base.rootCore)});
const before=snapshot(),env={...process.env};
for(const key of ['PROOF_RUN','GAME_QUALITY_SOURCE','GAME_VEHICLE_SOURCE','GAME_PREPARATION_SOURCE'])delete env[key];
const tests=process.argv.slice(3).length?process.argv.slice(3):base.files.filter(name=>name.startsWith('tests/'));
const loader=pathToFileURL(path.join(cache,'native-loader.mjs'));loader.searchParams.set('run',label);
const args=['--import',loader.href,'--import','tsx','--test','--test-concurrency=2','--test-reporter=tap',...tests];
const startedUTC=new Date().toISOString(),result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',maxBuffer:20*1024*1024,windowsHide:true});
const log=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,label+'.tap'),log);
const after=snapshot(),nativeReports=fs.readdirSync(cache).filter(name=>name.startsWith('native-'+label+'-')&&name.endsWith('.json'));
const native=new Map(),nativeDrift=[];
for(const name of nativeReports){const report=JSON.parse(fs.readFileSync(path.join(cache,name)));if(!report.stable)nativeDrift.push(name);for(const [file,digest]of Object.entries(report.before)){if(native.has(file)&&native.get(file)!==digest)nativeDrift.push(file);native.set(file,digest);}}
const proof={label,startedUTC,completedUTC:new Date().toISOString(),command:[process.execPath,...args].join(' '),tests:tests.length,
  exit:result.status,counts:Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(name=>[name,Number(log.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1])])),
  before,after,stable:JSON.stringify(before)===JSON.stringify(after),usedNative:{modules:Object.fromEntries([...native].sort()),reports:nativeReports,drift:nativeDrift},logSha256:hash(path.join(directory,label+'.tap')),
  scope:'Light targeted CPU actual Game/Scene/controllers, terminal NullEngine IO only; explicit read-only source10 Babylon JS bytes at installed module identities. No GPU/build/install/fullsuite.'};
fs.writeFileSync(path.join(directory,label+'.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({label,exit:result.status,counts:proof.counts,stable:proof.stable,usedNative:native.size,nativeDrift:nativeDrift.length,logSha256:proof.logSha256}));
process.exitCode=result.status??1;
