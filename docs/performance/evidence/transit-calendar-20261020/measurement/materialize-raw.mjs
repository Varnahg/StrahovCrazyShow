import {readFile,open,lstat,link,unlink,readdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=dirname(fileURLToPath(import.meta.url));
if(process.argv.length>3 || (process.argv[2]!==undefined && process.argv[2]!=='--verify'))throw Error('Usage: materialize-raw.mjs [--verify]');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await readFile(join(directory,'raw-archives.json'),'utf8'));
const receipt=JSON.parse(await readFile(join(directory,'external-acceptance.json'),'utf8'));
if(manifest.schemaVersion!==1 || !Array.isArray(manifest.files) || manifest.files.length!==2)throw Error('Unsupported archive manifest');
const verified=[],materialized=[];
const stagePrefix=(name,hash)=>'.raw-stage-'+name+'-'+hash.slice(0,12)+'-';
async function removeStage(file){
 try{await unlink(file);}catch(error){if(error.code!=='ENOENT')throw error;}
}
async function existingRaw(target,name,expected){
 let stat;
 try{stat=await lstat(target,{bigint:true});}catch(error){if(error.code==='ENOENT')return false;throw error;}
 if(!stat.isFile() || stat.isSymbolicLink() || sha(await readFile(target))!==expected)
  throw Error('Preserve differing or linked existing raw: '+name);
 if(stat.nlink!==1n){
  // Recover only this helper's interrupted publish links, never other aliases.
  const prefix=stagePrefix(name,expected);
  for(const file of await readdir(directory)){
   if(!file.startsWith(prefix) || !/^[a-f0-9-]{36}\.tmp$/.test(file.slice(prefix.length)))continue;
   const stage=join(directory,file);
   let candidate;
   try{candidate=await lstat(stage,{bigint:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}
   if(candidate.isFile() && !candidate.isSymbolicLink() && candidate.dev===stat.dev && candidate.ino===stat.ino)
    await removeStage(stage);
  }
  stat=await lstat(target,{bigint:true});
 }
 if(stat.nlink!==1n)throw Error('Preserve externally linked existing raw: '+name);
 return true;
}
async function publishRaw(target,name,expected,raw){
 const stage=join(directory,stagePrefix(name,expected)+randomUUID()+'.tmp');
 const handle=await open(stage,'wx',0o600);
 try{
  try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
  try{await link(stage,target);return true;}
  catch(error){if(error.code!=='EEXIST' || !await existingRaw(target,name,expected))throw error;return false;}
 }finally{await removeStage(stage);}
}
for(const name of ['baseline','candidate']){
 const entry=manifest.files.find(item=>item.name===name);
 const expected=receipt.evidence.find(item=>item.id===name);
 if(!entry || !expected || entry.rawSha256!==expected.sha256)throw Error('Archive/acceptance binding differs: '+name);
 const packed=await readFile(join(directory,name+'.json.gz'));
 if(sha(packed)!==entry.gzipSha256)throw Error('Archive bytes differ: '+name);
 const raw=gunzipSync(packed);
 if(raw.length!==entry.rawBytes || sha(raw)!==expected.sha256)throw Error('Original raw bytes differ: '+name);
 verified.push(name);
 if(process.argv[2]==='--verify')continue;
 const target=join(directory,name+'.json');
 if(!await existingRaw(target,name,expected.sha256) && await publishRaw(target,name,expected.sha256,raw))materialized.push(name);
}
console.log(JSON.stringify({verified,materialized,originalBytesPreserved:true}));
