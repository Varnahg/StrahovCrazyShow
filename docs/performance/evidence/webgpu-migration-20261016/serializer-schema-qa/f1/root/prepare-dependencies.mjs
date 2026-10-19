import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync,realpathSync,symlinkSync,cpSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,base=realpathSync(join(root,'../webgpu-memo-pilot-20261019/reference/node_modules')),target=resolve(root,'dependencies/node_modules'),helper=join(root,'../webgpu-serializer-schema-helper-20261019'),hash=b=>createHash('sha256').update(b).digest('hex');
assert.ok(target.startsWith(resolve(root)+'/')||target.startsWith(resolve(root)+'\\'));assert.ok(!existsSync(target),'Preserve existing private packages');mkdirSync(target,{recursive:true});
for(const name of readdirSync(base))if(name!=='@babylonjs')symlinkSync(realpathSync(join(base,name)),join(target,name),'junction');
mkdirSync(join(target,'@babylonjs'));const before={};
function scan(dir,prefix,map){for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name),key=prefix+'/'+entry.name;if(entry.isDirectory())scan(p,key,map);else{assert.ok(entry.isFile(),'No nested package symlink '+key);map[key]=hash(readFileSync(p));}}}
for(const name of readdirSync(join(base,'@babylonjs'))){const source=realpathSync(join(base,'@babylonjs',name));scan(source,'@babylonjs/'+name,before);cpSync(source,join(target,'@babylonjs',name),{recursive:true,errorOnExist:true,force:false});}
const copied={};scan(join(target,'@babylonjs'),'@babylonjs',copied);assert.deepEqual(copied,before);
const input=JSON.parse(readFileSync(join(helper,'input-manifest.json'))),relative='@babylonjs/core/Materials/materialDefines.js',payload=readFileSync(join(helper,'candidate/Materials/materialDefines.js'));assert.equal(before[relative],input.beforeSha256);assert.equal(hash(payload),input.afterSha256);writeFileSync(join(target,relative),payload);
const after={};scan(join(target,'@babylonjs'),'@babylonjs',after);for(const[p,sha]of Object.entries(before))assert.equal(after[p],p===relative?input.afterSha256:sha,p);
const sourceAfter={};for(const name of readdirSync(join(base,'@babylonjs')))scan(realpathSync(join(base,'@babylonjs',name)),'@babylonjs/'+name,sourceAfter);assert.deepEqual(sourceAfter,before,'Original package bytes unchanged');
writeFileSync(join(root,'dependency-before.json'),JSON.stringify(before,null,2)+'\n');writeFileSync(join(root,'dependency-after.json'),JSON.stringify(after,null,2)+'\n');writeFileSync(join(root,'dependency-receipt.json'),JSON.stringify({base,target,files:Object.keys(before).length,changes:[{path:relative,before:input.beforeSha256,after:input.afterSha256}],sourceUnchanged:true,scope:'Physical private Babylon packages, readonly other packages. Exactly one JS module changed; no production patch/lock installation claim.'},null,2)+'\n');console.log(JSON.stringify({files:Object.keys(before).length,changes:1,sourceUnchanged:true}));
