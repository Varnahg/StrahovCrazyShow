import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,helper=join(root,'../webgpu-schema-shared-helper-20261019'),proof=join(root,'f2-proof-v2'),run=JSON.parse(readFileSync(join(proof,'f2-runs.json'))),hash=b=>createHash('sha256').update(b).digest('hex');
for(const[p,expected]of Object.entries(run.sources)){const b=readFileSync(join(helper,p));assert.equal(hash(b),expected,p);const out=join(proof,'frozen-inputs',p);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,b,{flag:'wx'});}
console.log(JSON.stringify({files:Object.keys(run.sources).length,frozen:true}));
