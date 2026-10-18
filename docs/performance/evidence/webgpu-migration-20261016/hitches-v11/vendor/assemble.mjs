import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,realpathSync,lstatSync,statSync,existsSync,symlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),source=resolve(wt,'.cache/webgpu-hitch-validation-20261017/day-zero-v3'),v5=resolve(wt,'.cache/webgpu-migration/dependencies-v5/node_modules');
const candidate=resolve(root,'candidate'),modules=resolve(root,'dependencies/node_modules');
assert.ok(!existsSync(candidate)&&!existsSync(modules),'new isolated output required');mkdirSync(candidate,{recursive:true});mkdirSync(modules,{recursive:true});
const sha=buffer=>createHash('sha256').update(buffer).digest('hex'),hash=path=>sha(readFileSync(path));
const normalize=p=>p.replaceAll('\\','/');
function write(path,data){assert.ok(resolve(path).startsWith(root+'\\')||normalize(resolve(path)).startsWith(normalize(root)+'/'));mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data,{flag:'wx'});assert.equal(lstatSync(path).isSymbolicLink(),false);assert.equal(statSync(path).nlink,1);}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const path=join(dir,e.name);assert.equal(e.isSymbolicLink(),false,'package input contains nested link '+path);return e.isDirectory()?walk(path):e.isFile()?[path]:[]});}
const inputs={},outputs={},packageRoots={};
for(const name of ['core','loaders']){
  const from=realpathSync(resolve(v5,'@babylonjs',name)),to=resolve(modules,'@babylonjs',name);packageRoots[name]={from:normalize(from),to:normalize(to)};
  for(const path of walk(from)){const rel=normalize(relative(from,path)),key=name+'/'+rel,data=readFileSync(path),out=resolve(to,rel);inputs[key]=sha(data);write(out,data);outputs[key]=hash(out);assert.equal(outputs[key],inputs[key]);assert.notEqual(realpathSync(path),realpathSync(out));}
}
// No dependency metadata, executable .bin, store or writable tooling cache is
// linked. Read-only package junctions are individual non-Babylon packages.
const links={};function link(name,from){const to=resolve(modules,name);mkdirSync(dirname(to),{recursive:true});symlinkSync(realpathSync(from),to,'junction');links[name]=normalize(realpathSync(from));}
for(const entry of readdirSync(v5,{withFileTypes:true})){
  if(entry.name.startsWith('.')||entry.name==='@babylonjs')continue;
  if(entry.name.startsWith('@'))for(const child of readdirSync(resolve(v5,entry.name),{withFileTypes:true}))link(entry.name+'/'+child.name,resolve(v5,entry.name,child.name));
  else link(entry.name,resolve(v5,entry.name));
}
link('babylonjs-gltf2interface',resolve(v5,'.pnpm/node_modules/babylonjs-gltf2interface'));
symlinkSync(modules,resolve(candidate,'node_modules'),'junction');
const inputManifest=JSON.parse(readFileSync(resolve(source,'source-manifest.json')));assert.equal(inputManifest.snapshotId,'0e15522126720f08e892de60685df25f5d20c313c562c952151de7d94d9f964a');
const copied={};function copySource(path,recurse=true){if(copied[path])return;const from=resolve(source,path),data=readFileSync(from);assert.equal(sha(data),inputManifest.files[path],path);write(resolve(candidate,path),data);copied[path]=sha(data);if(!recurse||path.endsWith('.json'))return;for(const m of data.toString().matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+)["']/g)){const stem=resolve(dirname(from),m[1]);const target=[stem,stem+'.ts',stem+'.tsx',stem+'.json',resolve(stem,'index.ts')].find(p=>existsSync(p)&&statSync(p).isFile());if(target){const rel=normalize(relative(source,target));assert.ok(!rel.startsWith('../'));copySource(rel,true);}}}
const tests=['babylon-image-processing-ownership','image-processing-value-updates','webgpu-shadow-freshness','webgpu-shadow-depth-wrapper','stable-light-state','gltf-light-budget','sky-reflection','window-sky-reflection','render-shadow-includes'].map(n=>'tests/'+n+'.test.ts');
for(const path of tests)copySource(path);
copySource('client/strict-material-preparation.ts');
for(const path of ['package.json','pnpm-workspace.yaml','pnpm-lock.yaml','tsconfig.json','patches/@babylonjs__core@9.30.0.patch'])copySource(path,false);
// All current non-test bytes stay unchanged for a RED test first. apply.mjs
// subsequently writes only the helper, existing patch append and six lock hashes.
write(resolve(root,'input-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),sourceSnapshotId:inputManifest.snapshotId,source,packageRoots,inputs,outputs,links,copied,tests},null,2)+'\n');
console.log(JSON.stringify({packageFiles:Object.keys(inputs).length,sourceFiles:Object.keys(copied).length,packageRoots,tests,candidate,modules}));
