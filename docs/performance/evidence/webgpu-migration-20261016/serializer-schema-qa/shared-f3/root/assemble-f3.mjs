import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
const root=import.meta.dirname,helper=resolve(root,'../webgpu-schema-shared-helper-20261019'),out=join(root,'candidate-v3'),prior=join(root,'candidate-v1'),hash=b=>createHash('sha256').update(b).digest('hex');
const expectedManifest=process.argv[2];assert.match(expectedManifest??'',/^[a-f0-9]{64}$/);assert.ok(!existsSync(out));
const manifestBytes=readFileSync(join(helper,'manifest.json'));assert.equal(hash(manifestBytes),expectedManifest);const helperManifest=JSON.parse(manifestBytes),payload=readFileSync(join(helper,'candidate/Materials/materialDefines.js'));
const payloadSha=hash(payload);assert.equal(helperManifest.files['candidate/Materials/materialDefines.js'],payloadSha);
// Only switch this task's private dependency slot after all own consumers stopped.
for(const port of [4200,2595,2568])await new Promise((ok,fail)=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.on('connect',()=>{socket.destroy();fail(Error('Port still active: '+port));});socket.on('error',error=>{if(error.code==='ECONNREFUSED')ok();else fail(error);});});
const alias=join(root,'dependencies/node_modules/@babylonjs/core/Materials/materialDefines.js'),physical=realpathSync(alias),owned=realpathSync(join(root,'dependencies'))+sep;
assert.ok(physical.toLowerCase().startsWith(owned.toLowerCase()),'Never mutate shared/played packages');const before=readFileSync(physical);assert.equal(hash(before),'e4f6ef0b87f24c9c482705ed1dab46b4853ededb3eb97e040e66c7dab258c3e0');
const baseline=JSON.parse(readFileSync(join(prior,'source-manifest.json')));assert.equal(baseline.snapshotId,'604293f79a2f76d77eb291a617471ee6176b481ad65770d1763bd22ee034bc4c');
for(const[p,sha]of Object.entries(baseline.files))assert.equal(hash(readFileSync(join(prior,p))),sha,p);
mkdirSync(out);const files={};function put(p,b){mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);files[p]=hash(b);}
for(const[p]of Object.entries(baseline.files))put(p,readFileSync(join(prior,p)));
const receipt={atUTC:new Date().toISOString(),physical,fromSha256:hash(before),toSha256:payloadSha,helperManifestSha256:expectedManifest,scope:'Owned private working dependency slot switched F1 to F3, no active service. Existing F1 dist stays compiled F1. Node commands through this shared QA slot now use F3; restore archived F1 payload before any future F1 Node rerun. Shared original/played dependencies not modified.'};
put('qa-provenance/serializer-schema/materialDefines.js.txt',payload);put('qa-provenance/serializer-schema/helper-manifest.json',manifestBytes);put('qa-provenance/serializer-schema/f3-slot-receipt.json',JSON.stringify(receipt,null,2)+'\n');
for(const p of ['assets','public','docs'])symlinkSync(realpathSync(join(prior,p)),join(out,p),'junction');symlinkSync(realpathSync(join(root,'dependencies/node_modules')),join(out,'node_modules'),'junction');
writeFileSync(physical,payload);assert.equal(hash(readFileSync(alias)),payloadSha);const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({...baseline,snapshotId,createdAt:new Date().toISOString(),files},null,2)+'\n');writeFileSync(join(root,'assembly-f3.json'),JSON.stringify({snapshotId,sourceFiles:Object.keys(files).length,payloadSha256:payloadSha,helperManifestSha256:expectedManifest,slot:receipt},null,2)+'\n');console.log(JSON.stringify({snapshotId,files:Object.keys(files).length,payloadSha256:payloadSha}));
