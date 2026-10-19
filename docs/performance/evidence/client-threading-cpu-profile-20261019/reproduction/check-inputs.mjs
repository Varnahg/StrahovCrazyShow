import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{join,resolve}from'node:path';
import{createHash}from'node:crypto';
const root=import.meta.dirname, target=join(root,'snapshot'), hash=b=>createHash('sha256').update(b).digest('hex');
const checks=JSON.parse(readFileSync(resolve(root,'../client-threading-cpu-helper-20261019/validation.json'))).dependenciesAfter;
const material=JSON.parse(readFileSync(resolve(root,'../client-threading-character-material-init-20261019/manifest.json'))).dependencies.coreSourceSha256;
for(const[p,s]of Object.entries(material))checks['node_modules/@babylonjs/core/'+p]=s;
const actual={};for(const[p,s]of Object.entries(checks)){actual[p]=hash(readFileSync(join(target,p)));assert.equal(actual[p],s,p);}
const m=JSON.parse(readFileSync(join(target,'source-manifest.json')));
for(const[p,s]of Object.entries(m.files))assert.equal(hash(readFileSync(join(target,p))),s,p);
writeFileSync(join(root,'inputs-verified.json'),JSON.stringify({at:new Date().toISOString(),source:m.snapshotId,sourceFiles:Object.keys(m.files).length,dependencies:actual,note:'pnpm exec emitted dependency-check/install status Already up to date. All pinned runtime SHA and source/lock SHA remain exact. Subsequent commands use direct Node tool entrypoints, avoiding package-manager checks.'},null,2)+'\n');
console.log(JSON.stringify({source:m.snapshotId,files:Object.keys(m.files).length,pinnedFiles:Object.keys(actual).length,unchanged:true}));
