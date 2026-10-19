import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=import.meta.dirname,record=JSON.parse(readFileSync(join(root,'../../docs/performance/evidence/webgpu-migration-20261016/image-processing-user-build-4199/build-identity.json'))),hash=b=>createHash('sha256').update(b).digest('hex');
const phase=process.argv[2];assert.ok(['before','after'].includes(phase));
const code={};for(const[p,sha]of Object.entries(record.deliveredCode)){code[p]=hash(readFileSync(join(record.ownSnapshot,'dist',p)));assert.equal(code[p],sha,p);}
const r=await fetch('http://127.0.0.1:4199/');assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),code['index.html']);
const summary={atUTC:new Date().toISOString(),source:record.snapshotId,url:'http://127.0.0.1:4199/?renderBackend=webgpu',code,servedHtml:code['index.html']};
if(phase==='after')assert.deepEqual(code,JSON.parse(readFileSync(join(root,'f3-protected-before.json'))).code);
writeFileSync(join(root,'f3-protected-'+phase+'.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({phase,source:record.snapshotId,files:Object.keys(code).length,servedHtmlMatches:true}));
