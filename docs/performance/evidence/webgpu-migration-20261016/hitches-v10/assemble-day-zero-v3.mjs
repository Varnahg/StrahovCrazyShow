import {readFileSync,writeFileSync,mkdirSync,symlinkSync,realpathSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,base=join(root,'b6-coverage-v2'),out=join(root,'day-zero-v3');
const leaf=join(root,'../webgpu-migration-checks/day-zero-prototype-20261018'),overlay=join(leaf,'candidate');
const hash=b=>createHash('sha256').update(b).digest('hex'),recordBytes=readFileSync(join(leaf,'overlay-record.json'));
if(hash(recordBytes)!=='681d529fb62d0794b5c4085396a8eca24a23638dcf919b340379e64ffe8930f9')throw Error('Leaf freeze changed');
const record=JSON.parse(recordBytes),manifest=JSON.parse(readFileSync(join(base,'source-manifest.json')));
const paths=['client/game.ts','client/light-preparation.ts','client/webgpu-compilation-profile.ts','tests/game-light-preparation.test.ts','tests/light-preparation.test.ts','tests/webgpu-compilation-profile.test.ts'];
if(manifest.snapshotId!=='36431c878f1c0c151af4bc259918a108dee60b15d1d294ecb7e6e40ee12ad42b'||record.baseSnapshotId!==manifest.snapshotId||hash(JSON.stringify(manifest.files))!==manifest.snapshotId)throw Error('Parent identity changed');
if(record.changes.length!==paths.length||record.changes.some(c=>!paths.includes(c.path)))throw Error('Unexpected overlay scope');
if(existsSync(out))throw Error('Preserve candidate');
const changes=record.changes.map(c=>{const bytes=readFileSync(join(overlay,c.path));if(hash(bytes)!==c.sha256||(manifest.files[c.path]??null)!==c.originalSha256)throw Error('Overlay/base drift '+c.path);return{...c,bytes};});
mkdirSync(out);for(const top of ['assets','public','docs','node_modules'])symlinkSync(realpathSync(join(base,top)),join(out,top),'junction');
const files={...manifest.files};let copied=0;
for(const[path,sha]of Object.entries(manifest.files)){
 if(['assets','public','docs'].some(top=>path.startsWith(top+'/')))continue;
 const bytes=readFileSync(join(base,path));if(hash(bytes)!==sha)throw Error('Base drift '+path);
 mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),bytes);copied++;
}
for(const c of changes){mkdirSync(dirname(join(out,c.path)),{recursive:true});writeFileSync(join(out,c.path),c.bytes);files[c.path]=c.sha256;}
const composition={kind:'unaccepted-day-zero-qa',parentSnapshot:manifest.snapshotId,leafManifestSha256:hash(recordBytes),overlays:record.changes,scope:'Add day mapped POINT0 off/on to the existing POINT1 and clipped B6 coverage. Explicit bounded inventory stage cap21/default16; no actor/avatar relocation or cache. Original deadlines/readiness retained.'};
const bytes=Buffer.from(JSON.stringify(composition,null,2)+'\n');writeFileSync(join(out,'source-composition.json'),bytes);files['source-composition.json']=hash(bytes);
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,sourceCommit:'655f9375073122c33da68b7e5090f3b3096e1225',createdAt:new Date().toISOString(),scope:composition.scope,files},null,2)+'\n');
console.log(JSON.stringify({out,snapshotId,copied,overlays:record.changes.length}));
