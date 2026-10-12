import { createReadStream } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const main = resolve(process.argv[2]);
const manifest = JSON.parse(await readFile(join(import.meta.dirname, 'source-manifest.json'), 'utf8'));
const frozen = manifest.snapshotRoot;
const shaBytes = bytes => createHash('sha256').update(bytes).digest('hex');
async function shaFile(path) { const hash=createHash('sha256'); for await(const bytes of createReadStream(path)) hash.update(bytes); return hash.digest('hex'); }
const entries=Object.entries(manifest.files), mismatches=[];
let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<entries.length){const[file,expected]=entries[cursor++];for(const[label,base]of[['main',main],['frozen',frozen]]){try{const actual=await shaFile(join(base,file));if(actual!==expected)mismatches.push({label,file,expected,actual});}catch(error){mismatches.push({label,file,error:String(error)});}}}}));
const sourceCheck={checkedAt:new Date().toISOString(),sourceSnapshotId:manifest.snapshotId,mainFiles:entries.length,frozenFiles:entries.length,mismatches};
await writeFile(join(import.meta.dirname,'main-source-check.json'),JSON.stringify(sourceCheck,null,2)+'\n');
if(mismatches.length){console.log(JSON.stringify(sourceCheck));process.exit(1);}
const dist=join(frozen,'dist');
const files=['index.html','textures/sky/moon-lroc-2k.jpg',...(await readdir(join(dist,'assets'))).filter(file=>/\.(js|css)$/.test(file)).map(file=>'assets/'+file)];
cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<files.length){const file=files[cursor++],expected=await shaFile(join(dist,file)),installed=await shaFile(join(main,'dist',file));const response=await fetch('http://127.0.0.1:4179/'+file),served=shaBytes(Buffer.from(await response.arrayBuffer()));if(!response.ok||expected!==installed||expected!==served)mismatches.push({file,expected,installed,served,status:response.status});}}));
const health=await(await fetch('http://127.0.0.1:4179/api/health')).json();
const diagnostics=await(await fetch('http://127.0.0.1:4179/api/diagnostics/status',{headers:{Origin:'http://127.0.0.1:4179'}})).json();
const weather=await(await fetch('http://127.0.0.1:4179/api/weather')).json();
const fixtureRemoved=!String(weather.source).includes('Řízené');
const result={checkedAt:new Date().toISOString(),commit:'fbe6ed3',sourceSnapshotId:manifest.snapshotId,preview:'http://127.0.0.1:4179/',apiPort:2570,protocol:10,sourceFilesCompared:entries.length,servedFilesCompared:files.length,mismatches,health,diagnostics,weather,fixtureRemoved,oldBuildPreserved:'.cache/main-dist-backups/building-models-20261012/atmosphere-a-dist',visualCrowdQa:'continuing after explicit user-requested commit/main checkpoint'};
await writeFile(join(import.meta.dirname,'publication.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,weather:undefined,weatherSource:weather.source}));
if(mismatches.length||!health.ok||!fixtureRemoved||diagnostics.sourceSnapshotId!==manifest.snapshotId)process.exitCode=1;
