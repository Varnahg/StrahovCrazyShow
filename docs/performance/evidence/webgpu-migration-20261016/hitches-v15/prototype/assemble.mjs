import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(root,'../../webgpu-hitch-validation-20261017/inactive-light-v4'),candidate=path.join(root,'candidate');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'source-manifest.json'),'utf8'));
assert.equal(manifest.snapshotId,'bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0');
assert.equal(fs.existsSync(candidate),false,'preserve any existing candidate');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),copied={};let bytesCopied=0;
function copy(relative){const input=path.join(base,relative),stat=fs.lstatSync(input);assert.equal(stat.isSymbolicLink(),false,relative);if(stat.isDirectory()){for(const name of fs.readdirSync(input))copy(relative+'/'+name);return;}const bytes=fs.readFileSync(input),sha=hash(bytes);assert.equal(sha,manifest.files[relative],relative);const output=path.join(candidate,relative);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes);copied[relative]=sha;bytesCopied+=bytes.length;}
for(const dir of ['client','shared','tests'])copy(dir);
for(const file of ['package.json','tsconfig.json'])copy(file);
const dependencies=path.resolve(root,'../inactive-light-defines-qa-20261018/dependencies/node_modules');fs.symlinkSync(dependencies,path.join(candidate,'node_modules'),'junction');
fs.writeFileSync(path.join(root,'input-manifest.json'),JSON.stringify({snapshotId:manifest.snapshotId,base,candidate,dependencies,files:copied,bytesCopied},null,2)+'\n');
console.log(JSON.stringify({files:Object.keys(copied).length,bytesCopied,candidate}));
