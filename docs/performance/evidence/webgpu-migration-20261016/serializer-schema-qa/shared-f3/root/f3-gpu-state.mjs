import assert from 'node:assert/strict';
import {writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const[run,phase]=process.argv.slice(2);assert.ok(['f3a1','f3b1','f3a2','f3b2','f3a3','f3a4'].includes(run));assert.ok(['before','after'].includes(phase));const file=join(import.meta.dirname,'runs-f3',run,'gpu-'+phase+'.json');assert.ok(!existsSync(file));
const args=['--query-gpu=timestamp,name,driver_version,temperature.gpu,clocks.current.graphics,clocks.current.memory,utilization.gpu,pstate','--format=csv,noheader,nounits'],r=spawnSync('C:/WINDOWS/system32/nvidia-smi.exe',args,{encoding:'utf8'});const record={atUTC:new Date().toISOString(),args,exitCode:r.status,csv:r.stdout?.trim()??null,error:r.stderr?.trim()??null,scope:'Host NVIDIA driver snapshot; not per-page GPU time or a fixed-clock guarantee.'};writeFileSync(file,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
