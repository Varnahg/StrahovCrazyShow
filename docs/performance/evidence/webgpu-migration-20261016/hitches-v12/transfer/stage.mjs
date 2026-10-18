import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync,symlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),candidate=resolve(root,'candidate'),qa=resolve(root,'../inactive-light-defines-qa-20261018');
assert.ok(!existsSync(candidate));mkdirSync(candidate);
const hash=buffer=>createHash('sha256').update(buffer).digest('hex'),qaManifest=JSON.parse(readFileSync(resolve(qa,'manifest.json')));assert.equal(hash(readFileSync(resolve(qa,'manifest.json'))),'1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac');
symlinkSync(qaManifest.dependencies.root,resolve(candidate,'node_modules'),'junction');
const sources={};function copy(path,recurse=true){if(sources[path])return;const data=readFileSync(resolve(wt,path));mkdirSync(dirname(resolve(candidate,path)),{recursive:true});writeFileSync(resolve(candidate,path),data,{flag:'wx'});sources[path]=hash(data);if(!recurse||path.endsWith('.json'))return;for(const m of data.toString().matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+)["']/g)){const stem=resolve(wt,dirname(path),m[1]);const source=[stem,stem+'.ts',stem+'.tsx',stem+'.json',resolve(stem,'index.ts')].find(p=>existsSync(p)&&statSync(p).isFile());if(source){const rel=relative(wt,source).replaceAll('\\','/');assert.ok(!rel.startsWith('../'));copy(rel);}}}
for(const path of ['tests/inactive-light-defines-helper.test.ts','tests/inactive-light-defines-history.test.ts'])copy(path);
for(const path of ['package.json','tsconfig.json','pnpm-workspace.yaml','pnpm-lock.yaml','patches/@babylonjs__core@9.30.0.patch'])copy(path,false);
writeFileSync(resolve(root,'source-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),dependencyManifest:resolve(qa,'manifest.json'),dependencyManifestSha:'1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac',dependencyRoot:qaManifest.dependencies.root,sources},null,2)+'\n');console.log(JSON.stringify({sourceFiles:Object.keys(sources).length,candidate,dependencyRoot:qaManifest.dependencies.root}));
