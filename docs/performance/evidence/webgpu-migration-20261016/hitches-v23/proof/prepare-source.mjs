import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),native=resolve(root,'../define-order-native-20261018/candidate'),warm=resolve(root,'../material-switch-cost-proof-20261018'),deps=resolve(root,'../define-order-qa-20261018/dependencies/node_modules');
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(fs.readFileSync(resolve(root,'../define-order-native-20261018/manifest.json'))),'a3b0d5fe839c5ecdc6fc116427191040008ebc3ebaf1bddf9abbe954503ca5d8');
const originalFiles=JSON.parse(fs.readFileSync(resolve(root,'../define-order-native-20261018/source-manifest.json'))).sources,files={};
const targets=['baseline','candidate'];for(const target of targets)fs.mkdirSync(resolve(root,target),{recursive:true});
function writeAll(path,bytes){for(const target of targets){const out=resolve(root,target,path);fs.mkdirSync(dirname(out),{recursive:true});fs.writeFileSync(out,bytes,{flag:'wx'});}}
function copy(path,recurse=true){if(files[path])return;const from=resolve(native,path),bytes=fs.readFileSync(from);assert.equal(hash(bytes),originalFiles[path].sha256,path);files[path]={sha256:hash(bytes),bytes:bytes.length};writeAll(path,bytes);if(!recurse||!path.endsWith('.ts')&&!path.endsWith('.tsx'))return;for(const m of bytes.toString().matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+)["']/g)){const stem=resolve(dirname(from),m[1]),found=[stem,stem+'.ts',stem+'.tsx',stem+'.json',resolve(stem,'index.ts')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(found){const rel=relative(native,found).replaceAll('\\','/');assert.ok(!rel.startsWith('../'));copy(rel);}}}
for(const path of ['tests/material-defines-serialization.test.ts','tests/material-defines-wgsl-order.test.ts','client/stable-light-state.ts','client/gltf-light-budget.ts','client/cinematic-art.ts'])copy(path);
for(const path of ['tests/fixtures/material-defines-order/baseline.json.gz','tests/fixtures/material-defines-order/provenance.json','package.json','tsconfig.json','pnpm-workspace.yaml','pnpm-lock.yaml','patches/@babylonjs__core@9.30.0.patch'])copy(path,false);
let proof=fs.readFileSync(resolve(warm,'proof.test.ts'),'utf8');assert.equal(hash(proof),'55a496df3f93e14124f459334c98b1b482c0d51de16b0ec2a2da25003b59e824');
const needle='../../webgpu-hitch-validation-20261017/define-order-v6/client/';assert.equal(proof.split(needle).length,4);proof=proof.replaceAll(needle,'./client/');
assert.equal(proof.split('new URL("report.json",import.meta.url)').length,2);proof=proof.replace('new URL("report.json",import.meta.url)','new URL(process.env.WARM_REPORT ?? "report.json",import.meta.url)');writeAll('warm.test.ts',proof);
for(const file of ['native-engine.ts','trace.ts','input-manifest.json'])writeAll(file,fs.readFileSync(resolve(warm,file)));
fs.symlinkSync(deps,resolve(root,'baseline/node_modules'),'junction');
fs.writeFileSync(resolve(root,'source-inputs.json'),JSON.stringify({createdAt:new Date().toISOString(),source:native,sourceManifestSha256:hash(fs.readFileSync(resolve(root,'../define-order-native-20261018/source-manifest.json'))),files,warmAdaptations:['three relative imports point to identical copied local closure','report destination accepts WARM_REPORT'],warmSourceSha256:hash(proof),baselineDependencies:deps},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({files:Object.keys(files).length,bytes:Object.values(files).reduce((n,f)=>n+f.bytes,0),warmSha:hash(proof)}));
