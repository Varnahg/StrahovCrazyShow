import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),input=JSON.parse(readFileSync(resolve(root,'input-manifest.json'))),stage=resolve(root,'patch-roundtrip');
assert.ok(!existsSync(stage));mkdirSync(stage);const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const oldPatch=resolve(root,'old-core.patch'),newPatch=resolve(root,'candidate/patches/@babylonjs__core@9.30.0.patch');writeFileSync(oldPatch,readFileSync(resolve(input.source,'patches/@babylonjs__core@9.30.0.patch')),{flag:'wx'});
const paths=[...readFileSync(newPatch,'utf8').matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map(m=>{assert.equal(m[1],m[2]);assert.ok(!m[1].includes('..'));return m[1]});assert.equal(new Set(paths).size,6);
const before={};for(const path of paths){const target=resolve(stage,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,readFileSync(resolve(input.packageRoots.core.from,path)),{flag:'wx'});before[path]=hash(target);}
const log=[];function git(args){const result=spawnSync('git',['-c','core.autocrlf=false',...args],{cwd:stage,encoding:'utf8',env:{...process.env,GIT_CEILING_DIRECTORIES:root}});log.push({args,status:result.status,stdout:result.stdout,stderr:result.stderr});assert.equal(result.status,0,JSON.stringify(log.at(-1)));}
git(['apply','--check','--reverse',oldPatch]);git(['apply','--reverse',oldPatch]);
const unpatched=Object.fromEntries(paths.map(p=>[p,hash(resolve(stage,p))]));for(const p of paths)assert.equal(unpatched[p]!==before[p],p!=='Materials/materialHelper.functions.js','old hunk actually reversed: '+p);
git(['apply','--check',newPatch]);git(['apply',newPatch]);
const after=Object.fromEntries(paths.map(p=>[p,hash(resolve(stage,p))]));for(const p of paths)assert.equal(after[p],hash(resolve(input.packageRoots.core.to,p)),'roundtrip QA equality '+p);
writeFileSync(resolve(root,'patch-applicability.json'),JSON.stringify({passed:true,scope:'physical isolated touched files; reverse full old patch then check/apply full new patch',before,unpatched,after,commands:log},null,2)+'\n');console.log(JSON.stringify({passed:true,files:paths.length,helperSha:after['Materials/materialHelper.functions.js']}));
