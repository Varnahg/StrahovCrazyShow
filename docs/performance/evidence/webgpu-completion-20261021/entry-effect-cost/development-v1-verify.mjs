import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync,execFileSync } from 'node:child_process';
import ts from 'typescript';
import { helperIdentity,sourceFiles,transformUI } from '../../../../../.cache/webgpu-completion-20261021/entry-effect-cost/helper/v18/common.mjs';

// Pouze cílený nový CPU soubor a syntax; nikdy celý corpus/build/install/GPU.
const pub='docs/performance/evidence/webgpu-completion-20261021/entry-effect-cost',own='.cache/webgpu-completion-20261021/entry-effect-cost',helper=own+'/helper/v18';
const before=JSON.parse(fs.readFileSync(pub+'/before.json','utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const file=p=>{const b=fs.readFileSync(p);return{sha256:hash(b),bytes:b.length};};
const additionalNative=['Engines/thinEngine.pure.js','Engines/thinEngine.js','Engines/engine.pure.js','Engines/thinWebGPUEngine.js',
  'Materials/PBR/pbrBaseMaterial.pure.js','Materials/PBR/pbrBaseMaterial.js','Materials/pushMaterial.js','Materials/effect.pure.js'];
const snap=()=>({helper:Object.fromEntries(sourceFiles.map(f=>[f,file(helper+'/'+f)])),
  guards:Object.fromEntries(Object.entries(before.guards).map(([k,g])=>[k,Object.fromEntries(Object.keys(g).map(p=>[p,file(p)]))])),
  nativeABI:Object.fromEntries(additionalNative.map(f=>['node_modules/@babylonjs/core/'+f,file('node_modules/@babylonjs/core/'+f)])),metadata:file(own+'/metadata-normalization.json')});
const initial=snap(),guardDrift=[];
for(const[k,g]of Object.entries(before.guards))for(const[p,x]of Object.entries(g))if(JSON.stringify(x)!==JSON.stringify(initial.guards[k][p]))guardDrift.push({group:k,path:p});
if(guardDrift.length)throw Error('Protected input drift '+JSON.stringify(guardDrift));
fs.writeFileSync(pub+'/execution-before.json',JSON.stringify(initial,null,2)+'\n',{flag:'wx'});
const args=['--import','tsx','--test','--test-concurrency=1','--test-reporter=tap',helper+'/entry-effect-cost.test.mjs'];
const started=new Date().toISOString(),run=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:4*1024*1024});
const output=(run.stdout??'')+(run.stderr??'');fs.writeFileSync(pub+'/targeted-final.tap',output,{flag:'wx'});
const count=kind=>Number([...output.matchAll(new RegExp('^# '+kind+' (\\d+)$','gm'))].at(-1)?.[1]??-1);
const syntax=sourceFiles.filter(f=>f.endsWith('.mjs')).map(f=>{const r=spawnSync(process.execPath,['--check',helper+'/'+f],{encoding:'utf8',windowsHide:true,timeout:10000});return{file:f,status:r.status,stderr:r.stderr};});
const uiBefore=file('client/ui.tsx'),ui=transformUI(fs.readFileSync('client/ui.tsx','utf8'));
const parse=ts.createSourceFile('qa-ui.tsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics;
const after=snap(),identity=await helperIdentity(path.resolve(helper));
const proof={atUTC:new Date().toISOString(),startedAtUTC:started,head:execFileSync('git',['rev-parse','HEAD']).toString().trim(),
  scope:'Cilene CPU/schema/lifecycle overeni jedineho noveho testu; neni cely helper corpus/build/GPU/performance ani main prijeti.',
  command:[process.execPath,...args],cpu:{exitCode:run.status,signal:run.signal,error:run.error?.message??null,tests:count('tests'),pass:count('pass'),fail:count('fail'),skip:count('skipped'),log:file(pub+'/targeted-final.tap')},
  helper:identity,guardDrift,inputStable:JSON.stringify(initial)===JSON.stringify(after),before:initial,after,syntax,
  ui:{sha256:uiBefore.sha256,unchanged:uiBefore.sha256===file('client/ui.tsx').sha256,parseDiagnostics:parse.length},
  notRun:['old-helper-corpus','build','full-project-ts','integration','browser','GPU','install']};
fs.writeFileSync(pub+'/verification.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
if(run.status!==0||proof.cpu.fail!==0||proof.cpu.skip!==0||proof.cpu.pass!==proof.cpu.tests||!proof.inputStable||syntax.some(x=>x.status!==0)||parse.length||!proof.ui.unchanged)throw Error('Targeted validation failed; original log/proof preserved');
console.log(JSON.stringify({helper:identity.sha256,tests:proof.cpu.tests,pass:proof.cpu.pass,syntax:syntax.length,ui:parse.length,stable:proof.inputStable,guardGroups:Object.fromEntries(Object.entries(initial.guards).map(([k,g])=>[k,Object.keys(g).length])),nativeABI:additionalNative.length}));
