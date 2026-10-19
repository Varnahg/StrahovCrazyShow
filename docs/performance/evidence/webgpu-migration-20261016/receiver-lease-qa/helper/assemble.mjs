import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)), repo=resolve(root,'../..'), current=resolve(root,'../webgpu-memo-pilot-20261019/reference');
const sha=b=>createHash('sha256').update(b).digest('hex'), inputs={};
function write(path,bytes){fs.mkdirSync(dirname(path),{recursive:true});fs.writeFileSync(path,bytes,{flag:'wx'});}
function read(path){const b=fs.readFileSync(path);inputs[path]=sha(b);return b;}
function git(path){const r=spawnSync('git',['show','18701037dd3d8faae9b7bd1807ecfbf23e18aec4:'+path],{cwd:repo,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
write(join(root,'reference/light-receivers.ts'),git('client/light-receivers.ts'));
const oldStable=git('client/stable-light-state.ts'), start=oldStable.indexOf('  /** Queue membership changes'), end=oldStable.indexOf('  private signature(',start);
assert.ok(start>=0&&end>start);
const currentStable=read(join(current,'client/stable-light-state.ts')).toString();
assert.equal(currentStable.split('  private signature(').length,2);
const stable=currentStable.replace('  private signature(',oldStable.slice(start,end)+'  private signature(');
write(join(root,'client/qa-stable-light-state.ts'),stable);
assert.equal(stable.replace(oldStable.slice(start,end),''),currentStable);
fs.symlinkSync(fs.realpathSync(join(current,'node_modules')),join(root,'node_modules'),'junction');
const require=createRequire(join(root,'node_modules/typescript/package.json')),ts=require(join(root,'node_modules/typescript/lib/typescript.js')),copied=new Set();
function copy(path){if(copied.has(path))return;copied.add(path);const b=read(join(current,path));write(join(root,path),b);if(!/\.[jt]sx?$/.test(path))return;
for(const item of ts.preProcessFile(b.toString(),true,true).importedFiles){if(!item.fileName.startsWith('.'))continue;const base=resolve(current,dirname(path),item.fileName);const found=[base,...['.ts','.tsx','.json','/index.ts'].map(ext=>base+ext)].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());assert.ok(found,item.fileName);copy(found.slice(current.length+1).replaceAll('\\','/'));}}
copy('client/cinematic-art.ts');copy('tsconfig.json');copy('package.json');
// The production vehicle class is a read-only input, not modified or integrated.
read(join(current,'client/vehicle-lighting.ts'));read(join(current,'client/stable-light-state.ts'));
const vendorPaths=['Lights/light.js','Lights/spotLight.pure.js','Meshes/abstractMesh.pure.js','Materials/materialHelper.functions.js','Materials/materialDefines.js','ShadersWGSL/ShadersInclude/pbrDirectLightingFalloffFunctions.js','ShadersWGSL/ShadersInclude/lightsFragmentFunctions.js'];
for(const path of vendorPaths)read(join(current,'node_modules/@babylonjs/core',path));
write(join(root,'input-manifest.json'),JSON.stringify({current,inputs,referenceCommit:'18701037dd3d8faae9b7bd1807ecfbf23e18aec4',referenceSourceSha:sha(git('client/light-receivers.ts')),copied:[...copied],orderingAdaptation:{before:sha(currentStable),after:sha(stable),inverse:true,scope:'Only exact prior markMeshesDirty method inserted in copied current StableLightState; no shared runtime edit.'}},null,2)+'\n');
console.log(JSON.stringify({copied:copied.size,orderingInverse:true,inputs:Object.keys(inputs).length}));
