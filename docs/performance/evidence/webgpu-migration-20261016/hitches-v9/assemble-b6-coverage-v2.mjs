import {readFileSync,writeFileSync,mkdirSync,symlinkSync,realpathSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,base=join(root,'b6-preparation-v1'),out=join(root,'b6-coverage-v2');
const leaf=join(root,'../webgpu-migration-checks/b6-coverage-completion-prototype-20261018'),overlay=join(leaf,'candidate');
const hash=b=>createHash('sha256').update(b).digest('hex'),recordBytes=readFileSync(join(leaf,'overlay-record.json'));
if(hash(recordBytes)!=='8b20233b973720717e13f50f665f5ae99d9b3ebcfddb7f31fb7c1c94340e44ee')throw Error('Leaf freeze changed');
const record=JSON.parse(recordBytes),manifest=JSON.parse(readFileSync(join(base,'source-manifest.json')));
const paths=['client/camera-look.ts','client/camera-orbit.ts','client/game.ts','client/light-preparation.ts','client/webgpu-compilation-profile.ts','tests/camera-orbit.test.ts','tests/fixtures/camera-follow-before-orbit.ts.txt','tests/game-light-preparation.test.ts','tests/light-preparation.test.ts','tests/webgpu-compilation-profile.test.ts'];
if(manifest.snapshotId!=='a94ea6ced62b1aa5a3e7c5f94aa4884cce83f30bb5063cda2e4e126507f4eb78'||record.baseSnapshotId!==manifest.snapshotId||hash(JSON.stringify(manifest.files))!==manifest.snapshotId)throw Error('Parent identity changed');
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
const composition={kind:'unaccepted-b6-coverage-completion-qa',parentSnapshot:manifest.snapshotId,leafManifestSha256:hash(recordBytes),overlays:record.changes,scope:'Day mapped POINT1 off/on and source-derived clipped B6 orbit, shared pure camera geometry, explicit bounded inventory stage cap20/default16. No actor/avatar relocation or new cache; original deadlines and readiness preserved.'};
const bytes=Buffer.from(JSON.stringify(composition,null,2)+'\n');writeFileSync(join(out,'source-composition.json'),bytes);files['source-composition.json']=hash(bytes);
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,sourceCommit:'ec74bdafa3989ccaf10d2b4955c36abe86711636',createdAt:new Date().toISOString(),scope:composition.scope,files},null,2)+'\n');
console.log(JSON.stringify({out,snapshotId,copied,overlays:record.changes.length}));
