import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';
const root=dirname(fileURLToPath(import.meta.url)),input=JSON.parse(fs.readFileSync(resolve(root,'input-manifest.json'))),sha=b=>createHash('sha256').update(b).digest('hex'),changes=[];
for(const path of ['warm.test.ts','tests/material-defines-serialization.test.ts','tests/material-defines-wgsl-order.test.ts']){
 const file=resolve(root,'fixture',path),original=fs.readFileSync(file,'utf8');assert.equal(sha(original),input.sourceFiles[path]);const prefix=`import ${JSON.stringify(path.startsWith('tests/')?'../../scope-hooks.mjs':'../scope-hooks.mjs')};\n`,source=prefix+original;
 fs.writeFileSync(file,source);assert.equal(source.slice(prefix.length),original);changes.push({path,originalSha:sha(original),loadedSha:sha(source),adaptation:prefix.trim(),assertionsUnchanged:true});
}
fs.writeFileSync(resolve(root,'fixture-adaptations.json'),JSON.stringify(changes,null,2)+'\n',{flag:'wx'});
