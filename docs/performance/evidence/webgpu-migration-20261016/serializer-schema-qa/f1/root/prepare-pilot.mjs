import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,symlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,prior=join(root,'../webgpu-receiver-lease-qa-20261019'),base=join(root,'../webgpu-memo-pilot-20261019/reference'),out=join(root,'reference'),hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(readFileSync(join(base,'source-manifest.json')));
assert.ok(!existsSync(out));mkdirSync(out);for(const[p,sha]of Object.entries(manifest.files)){const b=readFileSync(join(base,p));assert.equal(hash(b),sha);mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);}
for(const p of ['assets','public','docs','node_modules','dist'])symlinkSync(realpathSync(join(base,p)),join(out,p),'junction');writeFileSync(join(out,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
for(const p of ['start.ps1','stop.ps1','preview.mjs','weather.json','protected.mjs','gpu-state.mjs','collect.mjs']){let t=readFileSync(join(prior,p),'utf8').replaceAll('webgpu-receiver-lease-qa-20261019','webgpu-serializer-schema-qa-20261019').replaceAll('webgpu-01a15102-receiver-lease','webgpu-01a15102-schema');if(p==='collect.mjs')t=t.replace('Uninstrumented current receiver lease pilot; one bounded summary event, no detailed timer or sampler. Raw app telemetry retained; not full acceptance.','Uninstrumented current serializer schema pilot; no detailed timer or sampler. Exact one private vendor JS change; raw telemetry retained, not full migration acceptance.');writeFileSync(join(root,p),t);}
console.log('Independent control and own pilot services prepared; no processes started.');
