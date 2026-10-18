import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),candidate=resolve(root,'candidate'),qa=resolve(root,'../define-order-qa-20261018'),transfer=JSON.parse(fs.readFileSync(resolve(root,'transfer.json')));
assert.equal(fs.existsSync(candidate),false);fs.mkdirSync(candidate);const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),sources={};
function copy(p,recurse=true){if(sources[p])return;const from=resolve(wt,p),to=resolve(candidate,p),data=fs.readFileSync(from);fs.mkdirSync(dirname(to),{recursive:true});fs.writeFileSync(to,data,{flag:'wx'});sources[p]={sha256:hash(from),bytes:data.length};assert.equal(hash(to),sources[p].sha256);if(!recurse||!p.endsWith('.ts')&&!p.endsWith('.tsx'))return;for(const m of data.toString().matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+)["']/g)){const stem=resolve(dirname(from),m[1]),target=[stem,stem+'.ts',stem+'.tsx',stem+'.json',resolve(stem,'index.ts')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(target){const rel=relative(wt,target).replaceAll('\\','/');assert.ok(!rel.startsWith('../'));copy(rel,true);}}}
const qaInput=JSON.parse(fs.readFileSync(resolve(qa,'input-manifest.json'))),targeted=['tests/material-defines-serialization.test.ts','tests/material-defines-wgsl-order.test.ts'];
for(const p of [...targeted,...qaInput.relatedTests,...Object.keys(transfer.files)])copy(p);
for(const p of ['package.json','pnpm-workspace.yaml','tsconfig.json'])copy(p,false);
for(const suffix of ['near','medium','far'])copy('public/models/vehicles/campus-hatchback-'+suffix+'.glb',false);
const dependencies=resolve(qa,'dependencies/node_modules');fs.symlinkSync(dependencies,resolve(candidate,'node_modules'),'junction');
assert.equal(hash(resolve(qa,'manifest.json')),transfer.qaManifestSha);assert.equal(hash(resolve(dependencies,'@babylonjs/core/Materials/materialDefines.js')),'43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4');
fs.writeFileSync(resolve(root,'source-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),wt,candidate,dependencies,qaManifestSha:transfer.qaManifestSha,qaDependencyManifestSha:hash(resolve(qa,'dependency-manifest.json')),targeted,related:qaInput.relatedTests,sources},null,2)+'\n');console.log(JSON.stringify({sources:Object.keys(sources).length,bytes:Object.values(sources).reduce((n,s)=>n+s.bytes,0),candidate,dependencies}));
