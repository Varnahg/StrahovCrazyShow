import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,realpathSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname, base=resolve(root,'../client-threading-validation-20261019/combined'),target=join(root,'snapshot');
const bytes=readFileSync(join(base,'source-manifest.json')), manifest=JSON.parse(bytes);
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(manifest.snapshotId,'1fbc05af4154cafb1fd6834748d86dde6d10c539d5431c3fda6323b430ba5752');
assert.equal(hash(JSON.stringify(manifest.files)),manifest.snapshotId);assert(!existsSync(target),'Preserve existing profile snapshot');
mkdirSync(target,{recursive:true});
for(const[p,sha]of Object.entries(manifest.files)){const b=readFileSync(join(base,p));assert.equal(hash(b),sha,p);mkdirSync(dirname(join(target,p)),{recursive:true});writeFileSync(join(target,p),b);}
for(const folder of ['assets','public','docs','node_modules']){assert(!existsSync(join(target,folder)));symlinkSync(realpathSync(join(base,folder)),join(target,folder),'junction');}
writeFileSync(join(root,'base-source-manifest.json'),bytes);
writeFileSync(join(root,'base-identity.json'),JSON.stringify({base:manifest.snapshotId,target,sourceFiles:Object.keys(manifest.files).length,readonlyDependencies:realpathSync(join(target,'node_modules')),scope:'Base copy only; profiler overlay and new source manifest not yet applied. Do not serve as finalized candidate.'},null,2)+'\n');
mkdirSync(join(root,'logs'),{recursive:true});mkdirSync(join(root,'tmp'),{recursive:true});
console.log(JSON.stringify({base:manifest.snapshotId,sourceFiles:Object.keys(manifest.files).length,target}));
