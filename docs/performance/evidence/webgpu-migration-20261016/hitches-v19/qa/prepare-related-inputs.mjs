import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,statSync,lstatSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),input=JSON.parse(readFileSync(resolve(root,'input-manifest.json'))),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),assets={};
for(const suffix of ['near','medium','far']){const path='public/models/vehicles/campus-hatchback-'+suffix+'.glb',source=resolve(input.source,path),output=resolve(root,'candidate',path),before=hash(source);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,readFileSync(source),{flag:'wx'});assert.equal(lstatSync(output).isSymbolicLink(),false);assert.equal(statSync(output).nlink,1);assert.equal(hash(output),before);assert.equal(hash(source),before);assets[path]={source,output,bytes:statSync(output).size,inputSha256:before,outputSha256:hash(output),inputAfterSha256:hash(source)};}
for(const file of ['related-final.log','related-run.json'])copyFileSync(resolve(root,file),resolve(root,file.replace('related-','related-first-')));
writeFileSync(resolve(root,'test-assets.json'),JSON.stringify({authorizedBy:'root explicit 2026-10-18 scope extension',assets,totalBytes:Object.values(assets).reduce((n,a)=>n+a.bytes,0)},null,2)+'\n');console.log(JSON.stringify({files:Object.keys(assets).length,totalBytes:Object.values(assets).reduce((n,a)=>n+a.bytes,0)}));
