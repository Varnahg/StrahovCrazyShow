import {readFileSync,writeFileSync,mkdirSync,symlinkSync,realpathSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,base=join(root,'async-production-v3'),out=join(root,'b6-preparation-v1');
const overlay=join(root,'../webgpu-migration-checks/b6-preparation-prototype-20261018/candidate');
const hash=b=>createHash('sha256').update(b).digest('hex');
const expected={'client/game.ts':'e241eab8b0bc2c71f4c6a74c639babb097973ab36779c6ce35e69198f2d59b6b','client/light-preparation.ts':'7818c8a2e0a3160e1a1525f6b138cc992991c9dfcf1f5dfbccfb68ffd432fc29','client/cinematic.ts':'ac54311e673994ff9157c2ed3d1d9df6fdbfd2b96bfce3697ee6c86a771610ae'};
const paths=[...Object.keys(expected),'tests/game-light-preparation.test.ts','tests/light-preparation.test.ts','tests/cinematic.test.ts'];
const manifest=JSON.parse(readFileSync(join(base,'source-manifest.json')));
if(manifest.snapshotId!=='ec2802daf9426f63814054627adf5a18f04cd54eb2da20e800eb1a89feb6c563'||hash(JSON.stringify(manifest.files))!==manifest.snapshotId)throw Error('Baseline identity changed');
if(existsSync(out))throw Error('Preserve existing candidate');
const changes=paths.map(path=>{const bytes=readFileSync(join(overlay,path)),after=hash(bytes);if(expected[path]&&after!==expected[path])throw Error('Runtime freeze changed '+path);return{path,bytes,before:manifest.files[path],after};});
mkdirSync(out);
for(const top of ['assets','public','docs','node_modules'])symlinkSync(realpathSync(join(base,top)),join(out,top),'junction');
const files={...manifest.files};let copied=0;
for(const[path,sha]of Object.entries(manifest.files)){
 if(['assets','public','docs'].some(top=>path.startsWith(top+'/')))continue;
 const bytes=readFileSync(join(base,path));if(hash(bytes)!==sha)throw Error('Baseline drift '+path);
 mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),bytes);copied++;
}
for(const c of changes){mkdirSync(dirname(join(out,c.path)),{recursive:true});writeFileSync(join(out,c.path),c.bytes);files[c.path]=c.after;}
const composition={kind:'unaccepted-b6-coverage-qa-prototype',parentSnapshot:manifest.snapshotId,overlays:changes.map(({bytes,...c})=>c),scope:'Two hidden B6 day stages, camera-only source landing and explicit cinematic spatial refresh. No avatar/actor relocation, new cache, timing/fence intervention or played build mutation.'};
const bytes=Buffer.from(JSON.stringify(composition,null,2)+'\n');writeFileSync(join(out,'source-composition.json'),bytes);files['source-composition.json']=hash(bytes);
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,sourceCommit:'ad9f0c7561494c9cc701cb2575b1e08bb2377f1b',createdAt:new Date().toISOString(),scope:composition.scope,files},null,2)+'\n');
console.log(JSON.stringify({out,snapshotId,copied,overlays:composition.overlays}));
