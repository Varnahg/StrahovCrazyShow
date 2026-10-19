import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{dirname,join,resolve}from'node:path';import{fileURLToPath}from'node:url';
const root=dirname(fileURLToPath(import.meta.url)),repo=resolve(root,'../..'),memoProof=resolve(root,'../webgpu-memo-current-proof-20261019'),old='C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/.cache/webgpu-migration-checks/define-memo-owner-qa-20261018',serializer='C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/.cache/webgpu-migration-checks/define-serializer-qa-20261018';
const sha=b=>createHash('sha256').update(b).digest('hex'),inputs={};function copy(from,to){const b=fs.readFileSync(from);inputs[from]=sha(b);fs.mkdirSync(dirname(to),{recursive:true});fs.writeFileSync(to,b,{flag:'wx'});}
const fixture=join(root,'fixture');
function tree(from,to){for(const e of fs.readdirSync(from,{withFileTypes:true})){if(e.name==='node_modules')continue;const a=join(from,e.name),b=join(to,e.name);if(e.isDirectory())tree(a,b);else if(e.isFile())copy(a,b);}}
tree(join(memoProof,'fixture'),fixture);
fs.symlinkSync(fs.realpathSync(join(root,'node_modules')),join(fixture,'node_modules'),'junction');
for(const p of ['owner-inspection.mjs','owner-inspection.d.mts'])copy(join(old,p),join(root,p));
for(const p of ['warm.test.ts','native-engine.ts','trace.ts'])copy(join(old,'candidate',p),join(fixture,p));
copy(join(serializer,'actual-blocks.json'),join(root,'actual-blocks.json'));
copy(join(root,'input-manifest.json'),join(fixture,'input-manifest.json'));
fs.writeFileSync(join(root,'proof-inputs.json'),JSON.stringify({inputs,scope:'Current memo-proof TS/test/plugin closure and unchanged accepted warm/trace/native-engine fixture. No timed source adaptation; standard/PBR defaults are those of current reference packages, not old normalized baseline values.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({copied:Object.keys(inputs).length}));
