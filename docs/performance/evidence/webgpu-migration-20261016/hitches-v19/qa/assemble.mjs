import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,realpathSync,lstatSync,statSync,existsSync,symlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),source=resolve(wt,'.cache/webgpu-hitch-validation-20261017/inactive-light-v4'),prior=resolve(root,'../inactive-light-defines-qa-20261018/dependencies/node_modules');
const candidate=resolve(root,'candidate'),modules=resolve(root,'dependencies/node_modules'),proof=resolve(root,'../define-order-proof-20261018');
assert.ok(!existsSync(candidate)&&!existsSync(modules));mkdirSync(candidate,{recursive:true});mkdirSync(modules,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex'),hash=p=>sha(readFileSync(p)),normalize=p=>p.replaceAll('\\','/');
assert.equal(hash(resolve(proof,'manifest.json')),'96eb1c7cc96c2a97d3c6eccc03d6c82714dcf5401a3b6b234b959ff4a50af355');
assert.equal(hash(resolve(proof,'canonical-result.ts')),'b4892c57e483f6b4a06ff97c59c1378cb9682cb17f3be2acb942644c28883dc2');
function write(p,data){assert.ok(normalize(resolve(p)).startsWith(normalize(root)+'/'));mkdirSync(dirname(p),{recursive:true});writeFileSync(p,data,{flag:'wx'});assert.equal(lstatSync(p).isSymbolicLink(),false);assert.equal(statSync(p).nlink,1);}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=join(dir,e.name);assert.equal(e.isSymbolicLink(),false,'nested package link '+p);return e.isDirectory()?walk(p):e.isFile()?[p]:[];});}
const inputs={},packageRoots={};
for(const name of ['core','loaders']){const from=realpathSync(resolve(prior,'@babylonjs',name)),to=resolve(modules,'@babylonjs',name);packageRoots[name]={from:normalize(from),to:normalize(to)};for(const p of walk(from)){const rel=normalize(relative(from,p)),data=readFileSync(p),out=resolve(to,rel);inputs[name+'/'+rel]=sha(data);write(out,data);assert.equal(hash(out),inputs[name+'/'+rel]);assert.notEqual(realpathSync(out),realpathSync(p));}}
const links={};function link(name,from){const to=resolve(modules,name);mkdirSync(dirname(to),{recursive:true});symlinkSync(realpathSync(from),to,'junction');links[name]=normalize(realpathSync(from));}
for(const e of readdirSync(prior,{withFileTypes:true})){if(e.name.startsWith('.')||e.name==='@babylonjs')continue;if(e.name.startsWith('@'))for(const child of readdirSync(resolve(prior,e.name),{withFileTypes:true}))link(e.name+'/'+child.name,resolve(prior,e.name,child.name));else link(e.name,resolve(prior,e.name));}
symlinkSync(modules,resolve(candidate,'node_modules'),'junction');
const manifest=JSON.parse(readFileSync(resolve(source,'source-manifest.json')));assert.equal(manifest.snapshotId,'bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0');
const copied={};function copySource(p,recurse=true){if(copied[p])return;const from=resolve(source,p),bytes=readFileSync(from);assert.equal(sha(bytes),manifest.files[p],p);write(resolve(candidate,p),bytes);copied[p]=sha(bytes);if(!recurse||p.endsWith('.json'))return;for(const m of bytes.toString().matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+)["']/g)){const stem=resolve(dirname(from),m[1]),target=[stem,stem+'.ts',stem+'.tsx',stem+'.json',resolve(stem,'index.ts')].find(p=>existsSync(p)&&statSync(p).isFile());if(target){const rel=normalize(relative(source,target));assert.ok(!rel.startsWith('../'));copySource(rel,true);}}}
const relatedTests=['babylon-image-processing-ownership','image-processing-value-updates','webgpu-shadow-freshness','webgpu-shadow-depth-wrapper','stable-light-state','gltf-light-budget','sky-reflection','window-sky-reflection','render-shadow-includes','wgsl-surface-materials','wgsl-avatar-car','wgsl-vegetation','inactive-light-defines-helper','inactive-light-defines-history'].map(n=>'tests/'+n+'.test.ts');
for(const p of relatedTests)copySource(p);
for(const p of ['client/strict-material-preparation.ts','client/photogrammetry-lighting.ts','client/cinematic-art.ts','client/tree-wind.ts','client/car-paint-instances.ts','client/photo-grass-wind.ts','client/grass-material.ts','client/avatar-hair.ts'])copySource(p);
for(const p of ['package.json','pnpm-workspace.yaml','pnpm-lock.yaml','tsconfig.json','patches/@babylonjs__core@9.30.0.patch'])copySource(p,false);
for(const p of ['manifest.json','canonical-result.ts','proof.test.ts','report.json','proof-mirror-red.test.ts','report-mirror-red.json','run-mirror-red.log','run-09-final.log'])write(resolve(root,'accepted-proof',p),readFileSync(resolve(proof,p)));
write(resolve(root,'input-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),sourceSnapshotId:manifest.snapshotId,source,packageRoots,inputs,links,copied,relatedTests,acceptedProofManifestSha:hash(resolve(proof,'manifest.json'))},null,2)+'\n');
console.log(JSON.stringify({packageFiles:Object.keys(inputs).length,sourceFiles:Object.keys(copied).length,candidate,modules}));
