import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const root=import.meta.dirname,base=join(root,'../webgpu-cpu-profile-20261018');
for(const name of ['preview.mjs','start.ps1','stop.ps1','protected.mjs']){
 let text=readFileSync(join(base,name),'utf8').replaceAll('candidate-v2','candidate-v1').replaceAll('webgpu-cpu-profile-20261018','webgpu-routine-profile-20261019').replaceAll('webgpu-01a15102-cpu','webgpu-01a15102-routines');
 if(name==='preview.mjs'){const line=" if(url.pathname==='/')res.setHeader('Document-Policy','js-profiling');";assert.equal(text.split(line).length,2);text=text.replace(line,' // Plain QA document: no JS self-profiling policy.');}
 if(name==='start.ps1')text=text.replace(" -and $html.Headers['Document-Policy'] -eq 'js-profiling'",'');
 assert.ok(!existsSync(join(root,name)));writeFileSync(join(root,name),text);
}
copyFileSync(join(base,'weather.json'),join(root,'weather.json'));
