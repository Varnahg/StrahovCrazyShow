import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
const root=import.meta.dirname;
for(const name of ['start.ps1','stop.ps1','collect.mjs']){
 let source=readFileSync(join(root,name),'utf8').replaceAll('candidate-v1','candidate-v3').replaceAll("'a1','m1','a2','a3','m2','a4','m3'","'f3a1','f3b1','f3a2','f3b2','f3a3'").replaceAll("'runs/'","'runs-f3/'").replaceAll("'runs',run","'runs-f3',run");
 if(name==='start.ps1')source=source.replace("$sourceRoot=Join-Path $PSScriptRoot $Source",`$sourceRoot=Join-Path $PSScriptRoot $Source
if($Source -eq 'candidate-v3') {
 $assembly=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'assembly-f3.json') | ConvertFrom-Json
 $payload=Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $sourceRoot 'node_modules/@babylonjs/core/Materials/materialDefines.js')
 if($payload.Hash.ToLowerInvariant() -ne $assembly.payloadSha256) { throw 'F3 working dependency slot mismatch.' }
 if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist-manifest-f3.json'))) { throw 'F3 build not finalized.' }
}`);
 const target=join(root,'f3-'+name);assert.ok(!existsSync(target));writeFileSync(target,source);
}
console.log('F3 own service/collection scripts prepared, no services started.');
