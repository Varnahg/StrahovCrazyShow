/**
 * Dedicated server with read-only timer instrumentation. Does not edit game source.
 * node --import tsx docs/optimization-study/evidence/network-server-probe.mts .cache/optimization-study-snapshot 2568 output.json 90
 * Stops its OWN process after the supplied lifetime in seconds; never kills another server.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';
const sourceRoot=resolve(process.argv[2]||'.cache/optimization-study-snapshot');
const port=process.argv[3]||'2568';
const output=process.argv[4]||'docs/optimization-study/evidence/network-server-timers.json';
const seconds=Number(process.argv[5]||90);
if(port==='2567')throw new Error('Dedicated audit port required.');
process.env.PORT=port;
const original=globalThis.setInterval;
const timers:{requestedMs:number;starts:number[];durations:number[]}[]=[];
globalThis.setInterval=((callback:any,ms:any,...args:any[])=>{
  if(typeof ms!=='number'||Math.abs(ms-1000/30)>.01)return original(callback,ms,...args);
  const timer={requestedMs:ms,starts:[] as number[],durations:[] as number[]};timers.push(timer);
  return original(()=>{const start=performance.now();timer.starts.push(start);try{callback(...args);}finally{timer.durations.push(performance.now()-start);}},ms);
}) as typeof setInterval;
const quant=(a:number[],p:number)=>a.length?[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)]:null;
let stopped=false;
const finish=()=>{
  if(stopped)return;stopped=true;
  const summary={capturedAt:new Date().toISOString(),sourceRoot,port,node:process.version,platform:process.platform,instrumentation:'Wrapped only global setInterval callbacks requested at 1000/30 ms. Each duration includes Colyseus clock.tick() and game simulation callback. No changed game timestep, no additional timer resolution request. Whole-run statistics include startup/idle and the staged bot test.',sourceHashes:JSON.parse(readFileSync(resolve(sourceRoot,'source-hashes.json'),'utf8')),timers:timers.map(t=>{const gaps=t.starts.slice(1).map((v,i)=>v-t.starts[i]);return{requestedMs:t.requestedMs,callbacks:t.starts.length,observedHz:1000*(t.starts.length-1)/(t.starts.at(-1)!-t.starts[0]),gapMedianMs:quant(gaps,.5),gapP95Ms:quant(gaps,.95),gapMaxMs:Math.max(...gaps),callbackDurationMedianMs:quant(t.durations,.5),callbackDurationP95Ms:quant(t.durations,.95),callbackDurationMaxMs:Math.max(...t.durations)}})};
  writeFileSync(output,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({timerProbe:summary.timers}));process.exit(0);
};
process.on('SIGINT',finish);process.on('SIGTERM',finish);
setTimeout(finish,seconds*1000);
await import(pathToFileURL(resolve(sourceRoot,'server/index.ts')).href);
