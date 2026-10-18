import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),inputs=JSON.parse(fs.readFileSync(path.join(root,'inputs.json'),'utf8')),wt=inputs.wt,hash=b=>createHash('sha256').update(b).digest('hex');
const patch=fs.readFileSync(path.join(wt,'patches/@babylonjs__core@9.30.0.patch'),'utf8');
const touched=[...patch.matchAll(/^diff --git a\/(\S+) b\/\S+/gm)].map(m=>m[1]);assert.equal(new Set(touched).size,touched.length);
// A nested directory in the real worktree makes git apply silently ignore
// package-relative paths. Use an owned isolated repository for this roundtrip.
const roundtrip=path.join(root,'roundtrip-v3');assert.equal(fs.existsSync(roundtrip),false);fs.mkdirSync(roundtrip);
const initialized=spawnSync('git',['init','--quiet'],{cwd:roundtrip,encoding:'utf8'});assert.equal(initialized.status,0,initialized.stderr);
for(const name of touched){fs.mkdirSync(path.dirname(path.join(roundtrip,name)),{recursive:true});fs.copyFileSync(path.join(inputs.oldDependencies,'@babylonjs/core',name),path.join(roundtrip,name));}
const operations=[];function apply(args){const result=spawnSync('git',['-c','core.autocrlf=false','apply',...args],{cwd:roundtrip,encoding:'utf8'});operations.push({args,status:result.status,stdout:result.stdout,stderr:result.stderr});assert.equal(result.status,0,result.stderr);}
apply(['--reverse',path.join(root,'preimages/core.patch')]);
apply([path.join(wt,'patches/@babylonjs__core@9.30.0.patch')]);
const files=touched.map(name=>{const result=hash(fs.readFileSync(path.join(roundtrip,name))),expected=hash(fs.readFileSync(path.join(inputs.newDependencies,'@babylonjs/core',name)));assert.equal(result,expected,name);return{path:name,sha256:result};});
fs.writeFileSync(path.join(root,'patch-roundtrip.json'),JSON.stringify({operations,files,exactNewDependencyMatch:true},null,2)+'\n',{flag:'wx'});
for(const [mode,dependencies] of [['red',inputs.oldDependencies],['green',inputs.newDependencies]]){
 const cwd=path.join(root,mode);assert.equal(fs.existsSync(cwd),false);fs.mkdirSync(cwd);
 for(const name of ['client','shared','package.json','tsconfig.json'])fs.cpSync(path.join(wt,name),path.join(cwd,name),{recursive:true,errorOnExist:true,force:false});
 fs.mkdirSync(path.join(cwd,'tests'));for(const name of ['image-processing-inactive-defines.test.ts','game-authored-light-preparation.test.ts'])fs.copyFileSync(path.join(wt,'tests',name),path.join(cwd,'tests',name));
 fs.symlinkSync(dependencies,path.join(cwd,'node_modules'),'junction');
 const args=[path.join(cwd,'node_modules/tsx/dist/cli.mjs'),'--test','--test-reporter=tap','tests/image-processing-inactive-defines.test.ts','tests/game-authored-light-preparation.test.ts'];
 const startedAt=new Date().toISOString(),result=spawnSync(process.execPath,args,{cwd,env:{...process.env,PROOF_RUN:'native-'+mode,TSX_DISABLE_CACHE:'1'},encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});const log=(result.stdout??'')+(result.stderr??'');
 fs.writeFileSync(path.join(root,mode+'.log'),log,{flag:'wx'});fs.writeFileSync(path.join(root,mode+'.json'),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),args,status:result.status,error:result.error?.message??null,coreImageProcessing:hash(fs.readFileSync(path.join(dependencies,'@babylonjs/core/Materials/imageProcessingConfiguration.pure.js'))),tests:['image-processing-inactive-defines.test.ts','game-authored-light-preparation.test.ts'].map(name=>({path:'tests/'+name,sha256:hash(fs.readFileSync(path.join(cwd,'tests',name)))})),logSha256:hash(log)},null,2)+'\n',{flag:'wx'});
 console.log(mode,log.slice(-1500));if(mode==='red')assert.equal(result.status,1);else assert.equal(result.status,0);
}
