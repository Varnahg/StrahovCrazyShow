import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),input=JSON.parse(readFileSync(resolve(root,'input-manifest.json'))),stage=resolve(root,'patch-roundtrip');
assert.ok(!existsSync(stage));mkdirSync(stage);const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const oldPatch=resolve(root,'old-core.patch'),newPatch=resolve(root,'candidate/patches/@babylonjs__core@9.30.0.patch');writeFileSync(oldPatch,readFileSync(resolve(input.source,'patches/@babylonjs__core@9.30.0.patch')),{flag:'wx'});
const paths=[...readFileSync(newPatch,'utf8').matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map(m=>{assert.equal(m[1],m[2]);assert.ok(!m[1].includes('..'));return m[1];});assert.equal(new Set(paths).size,7);
const before={};for(const p of paths){const target=resolve(stage,p);assert.ok(target.startsWith(stage+'\\'));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,readFileSync(resolve(input.packageRoots.core.from,p)),{flag:'wx'});before[p]=hash(target);}
const commands=[];function git(args){const r=spawnSync('git',['-c','core.autocrlf=false',...args],{cwd:stage,encoding:'utf8',env:{...process.env,GIT_CEILING_DIRECTORIES:root}});commands.push({args,status:r.status,stdout:r.stdout,stderr:r.stderr});assert.equal(r.status,0,JSON.stringify(commands.at(-1)));}
git(['apply','--check','--reverse',oldPatch]);git(['apply','--reverse',oldPatch]);
const unpatched=Object.fromEntries(paths.map(p=>[p,hash(resolve(stage,p))]));for(const p of paths)assert.equal(unpatched[p]!==before[p],p!=='Materials/materialDefines.js','full old patch reversed '+p);
git(['apply','--check',newPatch]);git(['apply',newPatch]);
const after=Object.fromEntries(paths.map(p=>[p,hash(resolve(stage,p))]));for(const p of paths)assert.equal(after[p],hash(resolve(input.packageRoots.core.to,p)),'roundtrip exact QA bytes '+p);
writeFileSync(resolve(root,'patch-applicability.json'),JSON.stringify({passed:true,scope:'physical isolated seven touched files; reverse full original patch to pinned 9.30.0 then check/apply full extended patch',before,unpatched,after,commands},null,2)+'\n');console.log(JSON.stringify({passed:true,files:paths.length,materialDefinesSha:after['Materials/materialDefines.js']}));
