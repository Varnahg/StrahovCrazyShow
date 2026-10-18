import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),input=JSON.parse(fs.readFileSync(path.join(root,'input-manifest.json')));
const mode=process.argv[2],label=process.argv[3];
assert.ok(['red','targeted','related','types'].includes(mode));assert.match(label??'',/^[a-z0-9-]+$/);
const hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=p=>hash(fs.readFileSync(p));
const runtime=['client/game.ts','client/light-preparation.ts','client/webgpu-compilation-profile.ts'];
let cwd=input.candidate;
if(mode==='red'){
  cwd=path.join(root,label+'-source');assert.ok(!fs.existsSync(cwd));
  for(const file of Object.keys(input.sources)){
    const source=path.join(runtime.includes(file)?input.base:input.candidate,file),target=path.join(cwd,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,fs.readFileSync(source),{flag:'wx'});
    if(runtime.includes(file))assert.equal(fileHash(target),input.sources[file].sha256,file);
  }
  fs.symlinkSync(input.dependencies,path.join(cwd,'node_modules'),'junction');
}
const tests=mode==='related'?input.related:input.target;
const tracked=[...runtime,...input.target,...input.related];
const sources=Object.fromEntries(tracked.map(file=>[file,fileHash(path.join(cwd,file))]));
const log=path.join(root,label+'.log'),fd=fs.openSync(log,'wx'),startedAt=new Date().toISOString();
const args=mode==='types'?[path.join(root,'types.mjs')]:['--import','tsx','--test','--test-concurrency=1',...tests];
const env={...process.env,TSX_DISABLE_CACHE:'1'};
for(const key of Object.keys(env))if(/^GAME_.*SOURCE$/.test(key))delete env[key];
const result=spawnSync(process.execPath,args,{cwd,env,stdio:['ignore',fd,fd]});fs.closeSync(fd);
for(const[file,sha]of Object.entries(sources))assert.equal(fileHash(path.join(cwd,file)),sha,'source changed during '+label);
const text=fs.readFileSync(log,'utf8'),count=name=>Number(text.match(new RegExp('ℹ '+name+' (\\d+)'))?.[1]??0);
const record={mode,label,startedAt,finishedAt:new Date().toISOString(),cwd,command:[process.execPath,...args],exitCode:result.status,signal:result.signal,error:result.error?.message,sources,log,logSha256:fileHash(log),tests:mode==='types'?null:{total:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped')}};
fs.writeFileSync(path.join(root,label+'-run.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(record));console.log(text.split(/\r?\n/).filter(line=>/^✖|error TS|\{"files"/.test(line)).slice(0,20).join('\n'));
process.exitCode=result.status??1;
