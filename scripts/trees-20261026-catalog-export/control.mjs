/** Explicit source-boundary control, without killing Blender or partial output. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CACHE,local,read,sha,parseArgs} from './io.mjs';
export function setPause(run,paused){
 if(!/^[a-f0-9]{16}$/.test(run.id)||run.cache!==`${CACHE}/runs/${run.id}`)throw Error('Pause control outside catalogue run');
 const marker=local(run.cache+'/pause.request');
 if(paused){if(!fs.existsSync(marker))fs.writeFileSync(marker,'Pause requested: finish current source and release the heavy window.\n',{flag:'wx'});}
 else if(fs.existsSync(marker)){const target=local(run.cache+'/pause-resumed-'+Date.now()+'.txt');if(path.dirname(target)!==path.dirname(marker))throw Error('Pause archive escaped run');fs.renameSync(marker,target);}
 return {runId:run.id,paused};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const operation=process.argv[2];if(!['--pause','--resume'].includes(operation))throw Error('Use --pause or --resume');const a=parseArgs(operation);if(!a.run?.startsWith(CACHE+'/runs/')||!a.run.endsWith('/run.json'))throw Error('Require task --run');const run=read(a.run);if(run.id!==sha(Buffer.from(JSON.stringify(run.recipe))).slice(0,16))throw Error('Run recipe mismatch');console.log(JSON.stringify(setPause(run,operation==='--pause')));}
