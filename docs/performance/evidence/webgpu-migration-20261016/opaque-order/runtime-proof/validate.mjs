import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url)),repo=resolve(root,'../..'),id=process.argv[2],cwd=resolve(root,'validation-'+id),base=resolve(repo,'.cache/webgpu-hitch-validation-20261017/quality-combined-v1'),sha=b=>createHash('sha256').update(b).digest('hex');
assert.match(id??'',/^\d+$/);
assert.ok(!fs.existsSync(cwd),'fresh validation copy');
const inputs={};
function copy(path,recurse=true){if(inputs[path])return;const b=fs.readFileSync(resolve(repo,path));fs.mkdirSync(dirname(resolve(cwd,path)),{recursive:true});fs.writeFileSync(resolve(cwd,path),b,{flag:'wx'});inputs[path]={sha256:sha(b),bytes:b.length};if(!recurse||path.endsWith('.json'))return;for(const m of b.toString().matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+)["']/g)){const stem=resolve(dirname(resolve(repo,path)),m[1]),p=[stem,stem+'.ts',stem+'.tsx',stem+'.json',resolve(stem,'index.ts')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(p){const rel=relative(repo,p).replaceAll('\\','/');assert.ok(!rel.startsWith('../'));copy(rel);}}}
const paths=['client/opaque-sort.ts','client/art-lighting.ts','tests/opaque-sort.test.ts'],related=['tests/art-lighting-budget.test.ts','tests/art-lighting-maintenance.test.ts'];
for(const p of [...paths,...related])copy(p);
for(const p of ['package.json','tsconfig.json'])copy(p,false);
fs.symlinkSync(fs.realpathSync(resolve(base,'node_modules')),resolve(cwd,'node_modules'),'junction');
fs.writeFileSync(resolve(root,'validation-inputs-'+id+'.json'),JSON.stringify({inputs,dependencies:fs.realpathSync(resolve(cwd,'node_modules')),core:fs.realpathSync(resolve(cwd,'node_modules/@babylonjs/core'))},null,2)+'\n',{flag:'wx'});
function run(name,args){const startedAt=new Date().toISOString(),result=spawnSync(process.execPath,[resolve(cwd,'node_modules/tsx/dist/cli.mjs'),...args],{cwd,env:{...process.env,TSX_DISABLE_CACHE:'1'},encoding:'utf8',timeout:60000,maxBuffer:3*1024*1024}),text=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(resolve(root,name+'-'+id+'.log'),text,{flag:'wx'});fs.writeFileSync(resolve(root,name+'-'+id+'.json'),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),cwd,args,status:result.status,error:result.error?.message??null,logSha256:sha(text)},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({name,status:result.status}));return{...result,text};}
const target=resolve(cwd,'client/art-lighting.ts'),current=fs.readFileSync(target);
let red;
try{fs.copyFileSync(resolve(root,'preimages/client/art-lighting.ts'),target);red=run('baseline-red',['--test','--test-reporter=tap','--test-name-pattern=actual ArtLighting','tests/opaque-sort.test.ts']);}finally{fs.writeFileSync(target,current);}
assert.equal(red.status,1,'old initializer must fail GPU branch');
assert.match(red.text,/# fail 1\b/);
const green=run('targeted',['--test','--test-reporter=tap','tests/opaque-sort.test.ts']);if(green.status!==0){console.log(green.text);process.exit(1);}
const rel=run('related',['--test','--test-reporter=tap',...related]);if(rel.status!==0){console.log(rel.text);process.exit(1);}
const ts=(await import(pathToFileURL(resolve(cwd,'node_modules/typescript/lib/typescript.js')).href)).default;
const c=ts.readConfigFile(resolve(cwd,'tsconfig.json'),ts.sys.readFile);assert.equal(c.error,undefined);
const options=ts.parseJsonConfigFileContent(c.config,ts.sys,cwd).options,program=ts.createProgram([...paths,...related].map(p=>resolve(cwd,p)),{...options,noEmit:true}),errors=ts.getPreEmitDiagnostics(program),text=ts.formatDiagnostics(errors,{getCurrentDirectory:()=>cwd,getCanonicalFileName:p=>p,getNewLine:()=> '\n'})+'\n'+JSON.stringify({files:program.getSourceFiles().length,errors:errors.length})+'\n';fs.writeFileSync(resolve(root,'types-'+id+'.log'),text,{flag:'wx'});console.log(text);assert.equal(errors.length,0);
for(const [p,r]of Object.entries(inputs)){assert.equal(sha(fs.readFileSync(resolve(cwd,p))),r.sha256,p+' validation copy invariant');assert.equal(sha(fs.readFileSync(resolve(repo,p))),r.sha256,p+' native input invariant');}
console.log('All copied inputs unchanged; no dependency writes or install.');
