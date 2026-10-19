import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,base=join(root,'../webgpu-memo-pilot-20261019/reference'),out=join(root,'candidate-v1'),hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=readFileSync(join(base,'source-manifest.json')),manifest=JSON.parse(bytes);
assert.equal(manifest.snapshotId,'909ebf8a019b26aff5561a0aaba97b976a26d033746da85ae958c6f4034589a5');assert.equal(hash(JSON.stringify(manifest.files)),manifest.snapshotId);assert.ok(!existsSync(out));mkdirSync(out);
for(const[p,sha]of Object.entries(manifest.files)){const b=readFileSync(join(base,p));assert.equal(hash(b),sha,p);mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);}
for(const p of ['assets','public','docs','node_modules'])symlinkSync(realpathSync(join(base,p)),join(out,p),'junction');
writeFileSync(join(root,'seed-manifest.json'),bytes);
writeFileSync(join(root,'seed-result.json'),JSON.stringify({base:manifest.snapshotId,files:Object.keys(manifest.files).length,sourceManifestSha256:hash(bytes),scope:'Source seed only, not an executable prepared candidate. No memo vendor changes; readonly current accepted native packages.'},null,2)+'\n');
console.log(JSON.stringify({base:manifest.snapshotId,files:Object.keys(manifest.files).length}));
