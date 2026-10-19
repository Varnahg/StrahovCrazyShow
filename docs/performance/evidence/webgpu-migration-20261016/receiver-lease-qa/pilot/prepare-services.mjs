import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=import.meta.dirname,prior=join(root,'../webgpu-memo-routine-profile-20261019');
for(const p of ['preview.mjs','start.ps1','stop.ps1','protected.mjs','weather.json']){
  let b=readFileSync(join(prior,p));
  if(/\.(mjs|ps1)$/.test(p))b=Buffer.from(b.toString().replaceAll('webgpu-memo-routine-profile-20261019','webgpu-receiver-lease-qa-20261019').replaceAll('webgpu-01a15102-memo-routines','webgpu-01a15102-receiver-lease'));
  writeFileSync(join(root,p),b);
}
console.log('Prepared owned preview scripts only; no services started.');
