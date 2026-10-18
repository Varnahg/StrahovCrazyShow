import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),pure=resolve(root,'../define-serializer-qa-20261018'),deps=resolve(root,'../define-order-qa-20261018/dependencies/node_modules');
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(p),write=(p,b)=>{const out=resolve(root,p);fs.mkdirSync(dirname(out),{recursive:true});fs.writeFileSync(out,b,{flag:'wx'});};
assert.equal(sha(read(resolve(pure,'manifest.json'))),'f3ca7da09c745b34511097c5126d08c33e0a5b6619dafda28ae1ff6641b62197');
const sourceInputs=JSON.parse(read(resolve(pure,'source-inputs.json'))),sourceFiles={};
for(const [path,item]of Object.entries(sourceInputs.files)){const bytes=read(resolve(pure,'baseline',path));assert.equal(sha(bytes),item.sha256,path);write('fixture/'+path,bytes);sourceFiles[path]=sha(bytes);}
for(const path of ['warm.test.ts','trace.ts','native-engine.ts','input-manifest.json']){const bytes=read(resolve(pure,'baseline',path));write('fixture/'+path,bytes);sourceFiles[path]=sha(bytes);}
// No measured warm behavior is changed: only destination / test-owner hooks
// are supplied by process preload, not by rewriting fixture assertions.
assert.equal(sourceFiles['warm.test.ts'],sourceInputs.warmSourceSha256);
fs.symlinkSync(deps,resolve(root,'node_modules'),'junction');fs.symlinkSync(deps,resolve(root,'fixture/node_modules'),'junction');write('package.json','{"type":"module"}\n');
const physical=fs.realpathSync(resolve(deps,'@babylonjs/core/Materials/materialDefines.js')),original=read(physical).toString();
assert.equal(sha(original),'43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4');
write('reference.js',original);
const raw=original.replace('return canonicalResult(result);','return result;');assert.notEqual(raw,original);
const rawClass=raw.slice(0,raw.indexOf('// Project QA:')).replace('export class MaterialDefines','class RawMaterialDefines');
write('reference-harness.mjs',original+'\n'+rawClass+'\nexport { canonicalResult, RawMaterialDefines };\n');
const fixtureBytes=read(resolve(root,'fixture/tests/fixtures/material-defines-order/baseline.json.gz')),plain=gunzipSync(fixtureBytes,{maxOutputLength:9709634});
assert.equal(sha(plain),'355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f');
const baseline=JSON.parse(plain),blocks=[];
for(const [kind,branches]of Object.entries(baseline))if(branches.baseline?.states)for(const [index,state]of branches.baseline.states.entries())blocks.push({kind,index,label:state.label,text:state.defines,values:state.values,canonical:branches.canonical.states[index].defines});
assert.equal(blocks.length,50);assert.equal(new Set(blocks.map(b=>b.kind)).size,10);
write('mixed-blocks.json',JSON.stringify({sourceSha256:sha(plain),scope:'Complete fifty baseline states only; captured fixture order, not production raw access trace. Canonical states used only as exact expected output.',blocks},null,2)+'\n');
const boilerplate=`\nimport { DefineMemo } from ${JSON.stringify(pathToFileURL(resolve(root,'memo-owner.mjs')).href)};\nlet __owner = null;\nexport function __beginOwner() { if (__owner) throw Error('Nested proof owner'); return (__owner = new DefineMemo(canonicalResult)); }\nexport function __endOwner(owner) { if (__owner !== owner) throw Error('Lost proof owner'); __owner = null; owner.dispose(); }\nexport function __ownerActive() { return __owner !== null; }\nexport { canonicalResult as __reference };\nfunction __memoResult(raw) { return __owner ? __owner.convert(raw) : canonicalResult(raw); }\n`;
const memo=original.replace('return canonicalResult(result);','return __memoResult(result);');
assert.equal(memo.replace('return __memoResult(result);','return canonicalResult(result);'),original,'only post-loop return differs');
write('modules/reference.mjs',original+boilerplate);write('modules/memo.mjs',memo+boilerplate);
// Capture only in a separate untimed process. Preserve sequence, unlike the
// earlier deduplicated corpus. Bound names, text and number of observations.
const capture=original.replace('function canonicalResult(text) {','function canonicalResult(text) {\n    globalThis.__memoRawCapture?.(text);');
write('modules/capture.mjs',capture+boilerplate);
write('input-manifest.json',JSON.stringify({createdAt:new Date().toISOString(),pureManifestSha:sha(read(resolve(pure,'manifest.json'))),warmManifestSha:'7a25099dad279c07ef5cf203004802438fe657db392bb209a7dc1a91ec1dda23',physical,dependencies:deps,originalSha:sha(original),sourceFiles,baselineSha:sha(plain),mixedInventorySha:sha(read(resolve(root,'../../webgpu-hitch-validation-20261017/mixed-define-fixture-corpus.json'))),modules:Object.fromEntries(['reference','memo','capture'].map(v=>[v,sha(read(resolve(root,'modules/'+v+'.mjs')))])),adaptations:['exact frozen baseline source closure','post-loop return only for memo','test-only explicit owner exports; no shipping module','separate bounded untimed raw capture']},null,2)+'\n');
console.log(JSON.stringify({files:Object.keys(sourceFiles).length,blocks:blocks.length,physical}));
