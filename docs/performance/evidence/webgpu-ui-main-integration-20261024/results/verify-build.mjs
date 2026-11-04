import fs from 'node:fs';
import crypto from 'node:crypto';
const out='.cache/webgpu-ui-main-integration-20261024/';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files={};
function walk(p){for(const entry of fs.readdirSync(p,{withFileTypes:true})){const f=p+'/'+entry.name;if(entry.isDirectory())walk(f);else if(entry.isFile())files[f.slice(5)]=hash(fs.readFileSync(f));}}
walk('dist');
const served={};
for(const p of Object.keys(files).filter(p=>p==='index.html'||p.startsWith('assets/'))){const response=await fetch('http://127.0.0.1:2598/'+(p==='index.html'?'':p));if(!response.ok)throw Error('HTTP '+response.status+' '+p);const sha=hash(Buffer.from(await response.arrayBuffer()));if(sha!==files[p])throw Error('HTTP hash mismatch '+p);served[p]=sha;}
const proof={atUTC:new Date().toISOString(),url:'http://127.0.0.1:2598/',sourceSnapshotId:JSON.parse(fs.readFileSync(out+'source-before.json')).sourceSnapshotId,buildId:hash(Buffer.from(JSON.stringify(files))),files,served,servedFiles:Object.keys(served).length};
fs.writeFileSync(out+'build-http.json',JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({buildId:proof.buildId,files:Object.keys(files).length,servedFiles:proof.servedFiles}));
