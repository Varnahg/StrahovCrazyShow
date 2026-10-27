import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const CACHE='.cache/trees-catalog-export-20261026';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function local(relative){const p=path.resolve(ROOT,relative);if(!p.startsWith(ROOT+path.sep))throw Error('Path outside workspace');return p;}
export const read=relative=>JSON.parse(fs.readFileSync(local(relative),'utf8'));
export function info(relative){const bytes=fs.readFileSync(local(relative));return{path:relative.replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)};}
export function pinned(pin){const b=fs.readFileSync(local(pin.path));if(b.length!==pin.bytes||sha(b)!==pin.sha256)throw Error('Changed pinned input '+pin.path);return b;}
export function writeImmutable(relative,bytes){
 const p=local(relative);if(![CACHE+'/', 'assets/blender/vegetation/seasonal-catalog/', 'public/models/vegetation/seasonal-catalog/'].some(prefix=>p.startsWith(path.resolve(ROOT,prefix)+path.sep)))throw Error('Output outside catalogue task');
 fs.mkdirSync(path.dirname(p),{recursive:true});if(fs.existsSync(p)){if(!fs.readFileSync(p).equals(bytes))throw Error('Existing output differs: '+relative);return info(relative);}
 const staging=p+'.partial';if(fs.existsSync(staging)){if(!fs.readFileSync(staging).equals(bytes))throw Error('Interrupted output differs: '+relative);}else fs.writeFileSync(staging,bytes,{flag:'wx'});fs.renameSync(staging,p);return info(relative);
}
export const writeJson=(p,value)=>writeImmutable(p,Buffer.from(JSON.stringify(value,null,2)+'\n'));
export function loadRun(relative,{verifyCode=true}={}){if(!relative.startsWith(CACHE+'/runs/')||!relative.endsWith('/run.json'))throw Error('Expected task run manifest');const run=read(relative);if(run.version!==1||run.id!==sha(Buffer.from(JSON.stringify(run.recipe))).slice(0,16))throw Error('Run recipe mismatch');
 if(run.cache!==`${CACHE}/runs/${run.id}`||run.native!==`assets/blender/vegetation/seasonal-catalog/${run.id}`||run.public!==`public/models/vegetation/seasonal-catalog/${run.id}`)throw Error('Run output scope mismatch');
 for(const pin of run.recipe.inputs)pinned(pin);if(verifyCode)for(const pin of run.recipe.code)pinned(pin);
 const source=run.recipe.inputs.find(p=>p.path==='.cache/trees-catalog-20261026/source-plan.json');if(!source||JSON.stringify(run.catalog)!==JSON.stringify(JSON.parse(pinned(source))))throw Error('Run catalogue differs from pinned source plan');return run;}
export function verifiedCompletion(run,id){
 const file=`${run.cache}/${id}/complete.json`;if(!fs.existsSync(local(file)))return;
 const result=read(file);if(result.runId!==run.id||result.sourceTreeId!==id||result.reopened!==true)throw Error('Invalid source completion');
 for(const pin of [result.native,result.materialLibrary,...(result.dependencies??[]),...result.lods].filter(Boolean))pinned(pin);
 if(result.farClusterEvidence)pinned(result.farClusterEvidence.file);return result;
}
export function selectedRows(run,id){const rows=run.catalog.placements;if(id==='all')return rows;const row=rows.find(p=>p.sourceTreeId===id);if(!row)throw Error('Unknown source ID');return[row];}
export const prototypeId=row=>row.sourceTreeId==='ipr-crown-014'?'own-broadleaf':row.sourceTreeId==='ipr-b6-north-conifer'?'own-conifer':'catalog-'+row.sourceTreeId;
export const asset=(p)=>{const i=info(p);return {url:'/'+i.path.replace(/^public\//,''),bytes:i.bytes,sha256:i.sha256};};
export function parseArgs(action){const args=process.argv.slice(2);if(args[0]!==action)throw Error(`Expected ${action}`);const values=Object.fromEntries(args.slice(1).map(a=>{const i=a.indexOf('=');if(!a.startsWith('--')||i<3)throw Error('Use explicit --key=value');return[a.slice(2,i),a.slice(i+1)];}));return values;}
