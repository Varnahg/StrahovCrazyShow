import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
// Obnova pouze vlastních39 helper vstupů z veřejné kopie. Cizí donor ani
// snapshot/dependencies se nezapisují; rozdílný existující soubor je chyba.
const pub='docs/performance/evidence/webgpu-completion-20261021/entry-effect-cost',target='.cache/webgpu-completion-20261021/entry-effect-cost/helper/v18';
if(!fs.existsSync('AGENTS.md')||!fs.existsSync('package.json'))throw Error('Run from the project root');
const input=JSON.parse(fs.readFileSync(pub+'/portable-sources.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(input.helper!=='v18'||Object.keys(input.files).length!==39)throw Error('Expected exact39 V18 sources');
if(input.proof!=='complete-inputs/verification.json')throw Error('Unexpected proof path');
const proof=JSON.parse(fs.readFileSync(pub+'/'+input.proof,'utf8'));
if(input.helperSha256!==proof.helper.sha256||Object.keys(input.files).sort().join(',')!==Object.keys(proof.helper.files).sort().join(','))throw Error('Source/proof identity differs');
let created=0;
for(const[name,x]of Object.entries(input.files)){
  if(name==='.'||name==='..'||name.includes('/')||name.includes('\\')||!/^[-A-Za-z0-9.]+$/.test(name))throw Error('Invalid source path');
  const bytes=fs.readFileSync(pub+'/sources/'+name);if(hash(bytes)!==x.sha256||bytes.length!==x.bytes)throw Error('Archive drift '+name);
  if(x.sha256!==proof.helper.files[name])throw Error('Source/proof bytes differ '+name);
  const p=path.join(target,name);if(fs.existsSync(p)){if(hash(fs.readFileSync(p))!==x.sha256)throw Error('Existing source differs '+p);continue;}
  fs.mkdirSync(target,{recursive:true});fs.writeFileSync(p,bytes,{flag:'wx'});created++;
}
console.log(JSON.stringify({verified:Object.keys(input.files).length,created,target,dependencies:'Not installed or changed'}));
