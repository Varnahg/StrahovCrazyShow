import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,prior=join(root,'../webgpu-memo-pilot-20261019'),base=join(prior,'reference'),out=join(root,'reference'),hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(readFileSync(join(root,'seed-manifest.json')));
assert.ok(!existsSync(out));mkdirSync(out);
for(const[p,sha]of Object.entries(manifest.files)){const b=readFileSync(join(base,p));assert.equal(hash(b),sha);mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);}
for(const p of ['assets','public','docs','node_modules','dist'])symlinkSync(realpathSync(join(base,p)),join(out,p),'junction');
writeFileSync(join(out,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
for(const p of ['start.ps1','stop.ps1','gpu-state.mjs','collect.mjs']){
  let t=readFileSync(join(prior,p),'utf8').replaceAll('webgpu-memo-pilot-20261019','webgpu-receiver-lease-qa-20261019').replaceAll('webgpu-01a15102-memo-pilot','webgpu-01a15102-receiver-lease');
  t=t.replaceAll("'reference','memo'","'reference','candidate-v1'");
  if(p==='collect.mjs')t=t.replace("Uninstrumented native current serializer pilot; raw app telemetry retained. One run alone is not acceptance.","Uninstrumented current receiver lease pilot; one bounded summary event, no detailed timer or sampler. Raw app telemetry retained; not full acceptance.");
  writeFileSync(join(root,p),t);
}
console.log('Prepared independent reference and three interleaved first-drive runs; no service started.');
