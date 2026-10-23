import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../../../../..');
const cache=path.join(root,'.cache/webgpu-completion-car-preparation-20261023/quality-order');
const base=JSON.parse(fs.readFileSync(path.join(cache,'baseline.json')));
const read=name=>fs.readFileSync(path.join(root,name));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const cpu=JSON.parse(fs.readFileSync(path.join(directory,'final-broader-green.json')));
const digests=(names,prefix=root)=>Object.fromEntries(names.map(name=>[name,hash(fs.readFileSync(path.join(prefix,name)))]));
const snapshot=()=>({source:digests(base.files),tests:digests(Object.keys(cpu.after.tests)),protected:digests(base.protectedPaths),
  historical:digests(Object.keys(base.historical)),native:digests(Object.keys(base.native),base.core),installed:digests(Object.keys(base.installed),base.rootCore),
  usedNative:digests(Object.keys(cpu.usedNative.modules),base.core)});
const startedUTC=new Date().toISOString(),before=snapshot();
assert(cpu.exit===0&&cpu.counts.tests===272&&cpu.counts.pass===272&&cpu.counts.fail===0&&cpu.stable,'No complete272 CPU proof');
assert(JSON.stringify(before.source)===JSON.stringify(cpu.after.source),'Source drift after CPU');
assert(hash(fs.readFileSync(path.join(directory,'final-broader-green.tap')))===cpu.logSha256,'TAP drift');
assert(JSON.stringify(before.protected)===JSON.stringify(base.protected),'Protected input drift');
assert(JSON.stringify(before.historical)===JSON.stringify(base.historical),'Historical sealed artifact drift');
assert(JSON.stringify(before.native)===JSON.stringify(base.native)&&JSON.stringify(before.installed)===JSON.stringify(base.installed),'Native sentinel drift');
assert(JSON.stringify(before.usedNative)===JSON.stringify(cpu.usedNative.modules)&&cpu.usedNative.drift.length===0,'Actual loaded native module drift');
const name='client/render-quality-preparation.ts',current=read(name).toString(),original=fs.readFileSync(path.join(cache,'before',name),'utf8');
const start=current.indexOf('  // Prepare shared work progressively'),end=current.indexOf('  const stages:');
const oldStart=original.indexOf('  const order = QUALITIES.filter('),oldEnd=original.indexOf('  const stages:');
assert(start>=0&&end>start&&oldStart>=0&&oldEnd>oldStart,'Runtime inverse anchors');
assert(hash(current.slice(0,start)+original.slice(oldStart,oldEnd)+current.slice(end))===base.original[name],'Runtime changed outside initial order');
const typeResult=spawnSync(process.execPath,[path.join(directory,'typecheck.mjs')],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024,windowsHide:true});
assert(typeResult.status===0,typeResult.stdout+typeResult.stderr);
const syntax=[];
for(const name of fs.readdirSync(directory).filter(name=>name.endsWith('.mjs'))){const result=spawnSync(process.execPath,['--check',path.join(directory,name)],{cwd:root,encoding:'utf8',windowsHide:true});assert(result.status===0,result.stderr);syntax.push({name,exit:result.status});}
const loaderResult=spawnSync(process.execPath,['--check',path.join(cache,'native-loader.mjs')],{cwd:root,encoding:'utf8',windowsHide:true});assert(loaderResult.status===0,loaderResult.stderr);
const diff=spawnSync('git',['diff','--check','--',...base.files],{cwd:root,encoding:'utf8',windowsHide:true});assert(diff.status===0,diff.stdout+diff.stderr);
const after=snapshot();assert(JSON.stringify(before)===JSON.stringify(after),'Inputs changed during final proof');
const types=JSON.parse(fs.readFileSync(path.join(directory,'typescript.json')));
const proof={startedUTC,completedUTC:new Date().toISOString(),scope:'CPU/semantic TypeScript only. Exact source9 read-only native JS and declarations; terminal NullEngine IO. GPU startup benefit, first-entry hitch, fullsuite/build/install/main not claimed.',
  before,after,stable:true,cpu:{...cpu.counts,roots:cpu.tests,startedUTC:cpu.startedUTC,completedUTC:cpu.completedUTC,logSha256:cpu.logSha256,usedNativeModules:Object.keys(cpu.usedNative.modules).length,nativeDrift:cpu.usedNative.drift},
  types:{roots:types.roots.length,diagnostics:types.diagnostics.length,declarations:Object.keys(types.readonlySource9DeclarationFiles).length,declarationDrift:types.declarationDrift,proofSha256:hash(fs.readFileSync(path.join(directory,'typescript.json'))),logSha256:hash(fs.readFileSync(path.join(directory,'types.log')))},
  syntax,loaderSyntax:loaderResult.status,diff:diff.status,runtimeOrderOnlyInverse:true,
  historical:{sealedArtifacts:Object.keys(base.historical).length,sourceReferences:'Original historical manifest retains source references for its old checkpoint; the current7 task source/test files are separately authorized changes, not claimed byte-unchanged.'},
  previous:{red:hash(fs.readFileSync(path.join(directory,'red-progressive-complete.json'))),firstBroader269:hash(fs.readFileSync(path.join(directory,'final-targeted.json'))),scopeTransfer:hash(fs.readFileSync(path.join(directory,'SCOPE-TRANSFER.json')))}};
fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({proofSha256:hash(fs.readFileSync(path.join(directory,'verification.json'))),cpu:proof.cpu,types:proof.types,stable:proof.stable,runtime:after.source[name]}));
