import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,prior=join(root,'../webgpu-routine-profile-20261019'),base=join(prior,'candidate-v1'),memo=join(root,'../webgpu-memo-pilot-20261019/memo'),out=join(root,'candidate-v1');
const hash=b=>createHash('sha256').update(b).digest('hex'),bm=JSON.parse(readFileSync(join(base,'source-manifest.json'))),files={};
assert.equal(bm.snapshotId,'0ac5b4db9e77fe178f08ab3dd40cfb20f4af7724d61270eb9d5ffd9df2056e06');assert.ok(!existsSync(out));
function write(p,b){mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);files[p]=hash(b);}
for(const[p,sha]of Object.entries(bm.files)){const b=readFileSync(join(base,p));assert.equal(hash(b),sha);write(p,b);}
for(const p of ['assets','public','docs'])symlinkSync(realpathSync(join(base,p)),join(out,p),'junction');
symlinkSync(realpathSync(join(memo,'node_modules')),join(out,'node_modules'),'junction');
const patches=[];
function patch(p,before,after){const b=readFileSync(join(out,p));let t=b.toString();assert.equal(t.split(before).length,2,p+' unique');t=t.replace(before,after);write(p,t);assert.equal(hash(Buffer.from(t.replace(after,before))),hash(b),p+' inverse');patches.push({path:p,before,after});}
patch('client/qa-routine-profile.ts','{ id: "MaterialDefines.toString", target: MaterialDefines.prototype, key: "toString" }','{ id: "MaterialDefines._SerializeForEngine", target: MaterialDefines, key: "_SerializeForEngine" }');
patch('tests/qa-routine-profile.test.ts','[MaterialDefines.prototype, "toString"]','[MaterialDefines, "_SerializeForEngine"]');
patch('tests/qa-routine-profile.test.ts','"MaterialDefines.toString"','"MaterialDefines._SerializeForEngine"');
const extra=`\n\ntest("static serializer hook leaves stock toString identity and custom return/throw contract untouched", () => {
  const stock=MaterialDefines.prototype.toString, descriptor=Object.getOwnPropertyDescriptor(MaterialDefines,"_SerializeForEngine");
  const profile=createMaterialRoutineProfile();
  try {
    assert.equal(MaterialDefines.prototype.toString,stock);
    const receiver={toString(...args:unknown[]){assert.equal(this,receiver);assert.equal(args.length,0);return "custom sentinel";}} as unknown as MaterialDefines;
    profile.beginFrame();assert.equal(MaterialDefines._SerializeForEngine(receiver,null as any),"custom sentinel");
    const error=new Error("exact custom throw");receiver.toString=()=>{throw error;};
    assert.throws(()=>MaterialDefines._SerializeForEngine(receiver,null as any),e=>e===error);
    const sample=profile.endFrame();assert.equal(sample.rows.find(x=>x.id==="MaterialDefines._SerializeForEngine")!.calls,2);
    assert.equal(sample.errors,0);assert.equal(MaterialDefines.prototype.toString,stock);
  } finally {assert.deepEqual(profile.dispose(),{errors:0,restoreConflicts:0});}
  assert.deepEqual(Object.getOwnPropertyDescriptor(MaterialDefines,"_SerializeForEngine"),descriptor);assert.equal(MaterialDefines.prototype.toString,stock);
});\n`;
write('tests/qa-routine-profile.test.ts',Buffer.concat([readFileSync(join(out,'tests/qa-routine-profile.test.ts')),Buffer.from(extra)]));
const mm=JSON.parse(readFileSync(join(memo,'source-manifest.json')));
for(const[p,sha]of Object.entries(mm.files).filter(([p])=>p.startsWith('qa-provenance/current-memo/'))){const b=readFileSync(join(memo,p));assert.equal(hash(b),sha);write(p,b);}
write('qa-provenance/memo-routine/patches.json',JSON.stringify(patches,null,2)+'\n');
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({...bm,snapshotId,createdAt:new Date().toISOString(),files},null,2)+'\n');
writeFileSync(join(root,'assembly.json'),JSON.stringify({snapshotId,base:bm.snapshotId,memo:mm.snapshotId,files:Object.keys(files).length,scope:'Same existing bounded timer; static serializer target replaces prototype hook. Private current memo packages only.'},null,2)+'\n');
for(const p of ['validate.mjs','start.ps1','stop.ps1','analyze.mjs','protected.mjs','weather.json']){let b=readFileSync(join(prior,p));if(/\.(mjs|ps1)$/.test(p))b=Buffer.from(b.toString().replaceAll('webgpu-routine-profile-20261019','webgpu-memo-routine-profile-20261019').replaceAll('webgpu-01a15102-routines','webgpu-01a15102-memo-routines'));writeFileSync(join(root,p),b);}
// Correct plain preview used in the uninstrumented pilot; no JS self-profiling policy.
writeFileSync(join(root,'preview.mjs'),readFileSync(join(root,'../webgpu-memo-pilot-20261019/preview.mjs')));
console.log(JSON.stringify({snapshotId,files:Object.keys(files).length}));
