import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,lstatSync,realpathSync,rmdirSync,symlinkSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const root=resolve(import.meta.dirname),receipt=JSON.parse(readFileSync(join(root,'dependency-receipt.json'))),target=receipt.target,hash=b=>createHash('sha256').update(b).digest('hex'),changes=[];
for(const name of ['core','loaders']){
 const alias=resolve(target,'@babylonjs',name),copy=resolve(target,'@babylonjs','.ignored_'+name);
 assert.ok(alias.startsWith(root+'\\')||alias.startsWith(root+'/'));assert.ok(copy.startsWith(root+'\\')||copy.startsWith(root+'/'));
 assert.equal(lstatSync(alias).isSymbolicLink(),true,'Unlink only our junction, never a directory tree');assert.equal(lstatSync(copy).isSymbolicLink(),false,'Original physical private copy retained');
 const beforeTarget=realpathSync(alias);rmdirSync(alias);symlinkSync(copy,alias,'junction');assert.equal(realpathSync(alias),copy);changes.push({alias,beforeTarget,restoredPrivateTarget:copy});
}
const core=realpathSync(join(target,'@babylonjs/core')),loader=realpathSync(join(target,'@babylonjs/loaders'));
assert.equal(createRequire(join(loader,'package.json')).resolve('@babylonjs/core/Materials/materialDefines.js'),join(core,'Materials/materialDefines.js'));
const before=JSON.parse(readFileSync(join(root,'dependency-before.json'))),after=JSON.parse(readFileSync(join(root,'dependency-after.json'))),keys=Object.keys(before),sourceDifferences=[],privateDifferences=[];
for(let i=0;i<keys.length;i+=64)await Promise.all(keys.slice(i,i+64).map(async p=>{const [a,b]=await Promise.all([readFile(join(receipt.base,p)),readFile(join(target,p))]);if(hash(a)!==before[p])sourceDifferences.push(p);if(hash(b)!==after[p])privateDifferences.push(p);}));
const result={atUTC:new Date().toISOString(),scope:'pnpm11 verifyDepsBeforeRun auto-install attempt failed before tests and relinked private Babylon aliases. Restore only owned junctions to retained physical .ignored copies; no deletion/copy mutation of original packages.',changes,files:keys.length,sourceDifferences,privateDifferences,preventRepeat:'Use pnpm --config.verify-deps-before-run=false for this private QA shim; verify actual runtime source before and after.'};
writeFileSync(join(root,'pnpm-link-repair.json'),JSON.stringify(result,null,2)+'\n');assert.deepEqual(sourceDifferences,[],'Original package bytes');assert.deepEqual(privateDifferences,[],'Actual private one-file candidate bytes');console.log(JSON.stringify({files:keys.length,sourceUnchanged:true,privateCandidateRestored:true,changes:changes.length}));
