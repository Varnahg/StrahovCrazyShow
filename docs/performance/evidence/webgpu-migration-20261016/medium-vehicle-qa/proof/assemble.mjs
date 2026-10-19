import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,realpathSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,base=resolve(root,'../webgpu-garment-init-qa-20261019/snapshot'),helper=resolve(root,'../webgpu-medium-vehicle-helper-20261019'),out=join(root,'snapshot');
const hash=b=>createHash('sha256').update(b).digest('hex');
const raw=readFileSync(join(helper,'manifest.json'));assert.equal(hash(raw),'b7f2ddfb9c7230972b0411b254fb11f2e44923c874f70659630e0cceefd322d2');
const h=JSON.parse(raw),m=JSON.parse(readFileSync(join(base,'source-manifest.json')));
assert.equal(m.snapshotId,h.baseSource);assert.equal(hash(JSON.stringify(m.files)),m.snapshotId);assert.equal(h.runtimeInverseExact,true);assert.ok(!existsSync(out));
mkdirSync(out,{recursive:true});const files={...m.files};
function put(p,b){mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);files[p]=hash(b);}
for(const[p,sha]of Object.entries(m.files)){const b=readFileSync(join(base,p));assert.equal(hash(b),sha,p);put(p,b);}
for(const[p,sha]of Object.entries(h.files)){assert.equal(m.files[p],h.preimages[p],p);const b=readFileSync(join(helper,'candidate',p));assert.equal(hash(b),sha,p);put(p,b);}
for(const p of ['assets','public','docs','node_modules'])symlinkSync(realpathSync(join(base,p)),join(out,p),'junction');
for(const[p,sha]of Object.entries(h.dependencyWitnesses))assert.equal(hash(readFileSync(join(out,'node_modules/@babylonjs/core',p))),sha,p);
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,base:m.snapshotId,files},null,2)+'\n');
writeFileSync(join(root,'assembly.json'),JSON.stringify({snapshotId,files:Object.keys(files).length,base:m.snapshotId,changes:Object.keys(h.files),helperManifest:hash(raw),scope:'Production vehicle quality preparation; no diagnostic overlay, install or SDK mutation.'},null,2)+'\n');
for(const name of ['start.ps1','stop.ps1','preview.mjs','weather.json','collect.mjs','gpu-state.mjs']){
let t=readFileSync(resolve(root,'../webgpu-garment-init-qa-20261019',name),'utf8').replaceAll('webgpu-garment-init-qa-20261019','webgpu-medium-vehicle-qa-20261019').replaceAll('webgpu-01a15102-garment-init-qa','webgpu-01a15102-medium-vehicle-qa');writeFileSync(join(root,name),t);
}
let validation=readFileSync(resolve(root,'../webgpu-garment-init-qa-20261019/validate.mjs'),'utf8').replace("'tests/student-garment-init.test.ts','tests/student-garments.test.ts'","'tests/game-low-vehicle-preparation.test.ts','tests/game-light-preparation.test.ts','tests/game-quality-preparation.test.ts','tests/light-preparation.test.ts','tests/render-quality-preparation.test.ts','tests/authored-light-preparation.test.ts','tests/vehicle-lighting.test.ts','tests/game-authored-light-preparation.test.ts'");writeFileSync(join(root,'validate.mjs'),validation);
const protocol=JSON.parse(readFileSync(resolve(root,'../webgpu-garment-init-qa-20261019/protocol.json')));protocol.source=snapshotId;protocol.scope='Plain clean production Medium/High vehicle preparation candidate; initial pilot, not final matched FPS acceptance.';writeFileSync(join(root,'protocol.json'),JSON.stringify(protocol,null,2)+'\n');
console.log(JSON.stringify({snapshotId,files:Object.keys(files).length,changes:Object.keys(h.files)}));
