import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
const root=import.meta.dirname,prior=join(root,'../webgpu-routine-profile-20261019');
for(const p of ['preview.mjs','protected.mjs'])writeFileSync(join(root,p),readFileSync(join(prior,p),'utf8').replaceAll('webgpu-routine-profile-20261019','webgpu-memo-pilot-20261019'));
copyFileSync(join(prior,'weather.json'),join(root,'weather.json'));
