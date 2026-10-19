import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname, base=join(root,'../webgpu-serializer-schema-qa-20261019/native-clean-f3'), prior=join(root,'../webgpu-routine-profile-20261019/candidate-v1'), out=join(root,'candidate-v1');
const hash=b=>createHash('sha256').update(b).digest('hex'), read=p=>readFileSync(p), json=p=>JSON.parse(read(p));
const bm=json(join(base,'source-manifest.json')),pm=json(join(prior,'source-manifest.json'));
assert.equal(bm.snapshotId,'3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03');
assert.equal(pm.snapshotId,'0ac5b4db9e77fe178f08ab3dd40cfb20f4af7724d61270eb9d5ffd9df2056e06');
for(const m of [bm,pm]) assert.equal(hash(JSON.stringify(m.files)),m.snapshotId);
assert.ok(!existsSync(out));mkdirSync(out);
const files={}, changes=[];
function write(p,b){mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);files[p]=hash(b);}
function donor(p){const b=read(join(prior,p));assert.equal(hash(b),pm.files[p],p);return b;}
for(const[p,sha]of Object.entries(bm.files)){const b=read(join(base,p));assert.equal(hash(b),sha,p);write(p,b);}
// Dokázat, že staré QA přidává jen vyjmenovanou diagnostiku, nikoli starší app runtime.
const lightInverse=JSON.parse(donor('qa-provenance/light-switch-profile/source-inverse.json'));
const routinePatches=JSON.parse(donor('qa-provenance/routine-profile/patches.json'));
let game=donor('client/game.ts').toString();
for(const p of routinePatches.filter(p=>p.path==='client/game.ts').reverse()){
 assert.equal(game.split(p.after).length,2,'unique routine inverse');game=game.replace(p.after,p.before);
}
assert.equal(hash(game),lightInverse.game.after);
for(const p of [...lightInverse.game.edits].reverse()){
 assert.equal(game.split(p.to).length,2,'unique mesh inverse');game=game.replace(p.to,p.from);
}
assert.equal(hash(game),bm.files['client/game.ts'],'F3 Game exact inverse');
let cost=donor('client/render-cost.ts').toString();const c=lightInverse.renderCost;
assert.equal(hash(cost),c.after);assert.ok(cost.startsWith(c.addedImport));assert.ok(cost.endsWith('\n'+c.identity));
cost=cost.slice(c.addedImport.length,-('\n'+c.identity).length);
assert.equal(hash(cost),bm.files['client/render-cost.ts'],'F3 render-cost exact inverse');
const overlay=['client/game.ts','client/render-cost.ts','client/mesh-draw-profile.ts','client/qa-routine-profile.ts','tests/mesh-draw-profile.test.ts','tests/qa-routine-profile.test.ts','tests/game-light-switch-profile.test.ts'];
for(const p of overlay){write(p,donor(p));changes.push({path:p,before:bm.files[p]??null,after:files[p]});}
for(const[p,sha]of Object.entries(pm.files)){
 if(/^(client|shared|server|scripts|tests)\//.test(p)&&bm.files[p]&&!overlay.includes(p))assert.equal(sha,bm.files[p],p+' same runtime');
}
for(const p of ['qa-provenance/light-switch-profile/source-inverse.json','qa-provenance/routine-profile/patches.json','qa-provenance/routine-profile/helper-manifest.json'])write(p,donor(p));
for(const p of ['assets','public','docs','node_modules'])symlinkSync(realpathSync(join(base,p)),join(out,p),'junction');
const materialPath=join(out,'node_modules/@babylonjs/core/Materials/materialDefines.js'),material=read(materialPath);
assert.equal(hash(material),'3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768');
assert.ok(material.toString().includes('defineSchemas.get(this)'));assert.ok(!material.toString().includes('this.toString ==='));
const provenance={base:bm.snapshotId,donor:pm.snapshotId,changes,exactInverse:true,materialDefinesSha:hash(material),dependencies:realpathSync(join(out,'node_modules')),scope:'Existující max8 timer; původní F3 receiver a implementace, žádné memo/static serializer.'};
write('qa-provenance/f3-routine.json',JSON.stringify(provenance,null,2)+'\n');
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({...bm,snapshotId,createdAt:new Date().toISOString(),files},null,2)+'\n');
writeFileSync(join(root,'assembly.json'),JSON.stringify({...provenance,snapshotId,files:Object.keys(files).length},null,2)+'\n');
for(const name of ['validate.mjs','start.ps1','stop.ps1','analyze.mjs','preview.mjs','weather.json']){
 let b=read(join(root,'../webgpu-routine-profile-20261019',name));
 if(/\.(mjs|ps1)$/.test(name))b=Buffer.from(b.toString().replaceAll('webgpu-routine-profile-20261019','webgpu-f3-routine-profile-20261019').replaceAll('webgpu-01a15102-routines','webgpu-01a15102-f3-routines'));
 if(name==='preview.mjs')b=Buffer.from(b.toString().replace("policy:'js-profiling'","policy:'none'"));
 if(name==='start.ps1')b=Buffer.from(b.toString().replace("Invoke-WebRequest -Uri 'http://127.0.0.1:4200/'", "Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4200/'"));
 assert.ok(!existsSync(join(root,name)));writeFileSync(join(root,name),b);
}
writeFileSync(join(root,'protected.mjs'),read(join(root,'../webgpu-serializer-schema-qa-20261019/f3-protected.mjs')));
console.log(JSON.stringify({snapshotId,files:Object.keys(files).length,exactInverse:true,materialDefinesSha:hash(material)}));
