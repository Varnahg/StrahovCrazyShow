import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { helperIdentity, sha256, transformUI, sourceFiles } from '../../../../../.cache/webgpu-completion-20261021/startup-stage-export/helper/v17/common.mjs';

// Read-only source/syntax guard. This script never installs/builds/runs tests.
const root=process.cwd(),pub='docs/performance/evidence/webgpu-completion-20261021/startup-stage-export';
const own='.cache/webgpu-completion-20261021/startup-stage-export',helper=own+'/helper/v17';
const before=JSON.parse(await readFile(join(root,pub,'before.json'),'utf8'));
const hash=async path=>sha256(await readFile(resolve(root,path)));
const groups={old36:before.old36,productionInputs:before.productionInputs,
  native39:Object.fromEntries(Object.entries(before.native).map(([p,h])=>['node_modules/'+p,h])),
  source14:Object.fromEntries(Object.entries(before.source14).map(([p,h])=>[before.source14Prefix+'/'+p,h])),author334:before.author334};
const after={},mismatches=[];
for(const[group,files]of Object.entries(groups)){
  after[group]={};for(const[path,expected]of Object.entries(files)){
    const bytes=await readFile(resolve(root,path)),value={sha256:sha256(bytes),bytes:bytes.length};after[group][path]=value;
    if(value.sha256!==(typeof expected==='string'?expected:expected.sha256)||(typeof expected==='object'&&value.bytes!==expected.bytes))mismatches.push({group,path,expected,current:value});
  }
}
const identity=await helperIdentity(resolve(root,helper));assert.equal(Object.keys(identity.files).length,36);
assert.deepEqual((await readdir(resolve(root,helper))).sort(),[...sourceFiles].sort());
const changes=[],unchanged=[],diffs=[];
for(const[file,previous]of Object.entries(before.copied36)){
  const current=identity.files[file];if(current===previous)unchanged.push(file);else{
    changes.push({file,beforeSha256:previous,afterSha256:current});
    const diff=spawnSync('git',['diff','--no-index','--',join('.cache/webgpu-completion-20261021/pipeline-owner/helper/v16',file),join(helper,file)],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
    assert.ok(diff.status===0||diff.status===1,diff.stderr);diffs.push(diff.stdout);
  }
}
const syntax=[];
for(const file of sourceFiles.filter(p=>p.endsWith('.mjs'))){
  const result=spawnSync(process.execPath,['--check',resolve(root,helper,file)],{encoding:'utf8',windowsHide:true});
  syntax.push({file,status:result.status,stdout:result.stdout,stderr:result.stderr});assert.equal(result.status,0,file);
}
const uiBefore=await hash('client/ui.tsx'),ui=transformUI(await readFile(resolve(root,'client/ui.tsx'),'utf8'));
const uiDiagnostics=ts.createSourceFile('transformed-ui.tsx',ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics;
assert.equal(uiDiagnostics.length,0);assert.equal(await hash('client/ui.tsx'),uiBefore);
assert.equal(ui.split('await observeStartup(g, startupCanvas, () => g.start());').length,2);
const metadata=JSON.parse(await readFile(resolve(root,own,'metadata-normalization.json'),'utf8'));
assert.equal(metadata.changes.length,6); // Four edits plus the two exact historical comparison guards.
const logs={};for(const file of (await readdir(resolve(root,own))).filter(p=>p.endsWith('.tap'))){const bytes=await readFile(resolve(root,own,file));const text=bytes.toString();logs[file]={sha256:sha256(bytes),bytes:bytes.length,tests:Number(text.match(/^# tests (\d+)$/m)?.[1]),pass:Number(text.match(/^# pass (\d+)$/m)?.[1]),fail:Number(text.match(/^# fail (\d+)$/m)?.[1]),skip:Number(text.match(/^# skipped (\d+)$/m)?.[1]),durationMs:Number(text.match(/^# duration_ms ([\d.]+)$/m)?.[1])};}
const final=logs['all-tests-final.tap'];assert.ok(final&&final.fail===0&&final.pass===final.tests&&final.skip===0,'Final complete helper corpus must pass');
const output={atUTC:new Date().toISOString(),scope:'CPU helper contracts and read-only selected source guards; no actual browser/GPU/performance acceptance',
  command:'node --import tsx --expose-gc --test --test-concurrency=1 --test-reporter=tap '+helper+'/*.test.mjs',
  beforeSha256:await hash(pub+'/before.json'),helper:identity,changed:changes,unchanged,groups:after,mismatches,
  syntax,uiParseDiagnostics:uiDiagnostics.length,uiSha256:uiBefore,logs,metadataNormalizationSha256:await hash(own+'/metadata-normalization.json')};
await writeFile(resolve(root,pub,'helper.patch'),diffs.join('\n'));await writeFile(resolve(root,pub,'verification.json'),JSON.stringify(output,null,2)+'\n');
assert.deepEqual(mismatches,[],'Protected source drift');console.log(JSON.stringify({helper:identity.sha256,changed:changes.length,unchanged:unchanged.length,guards:Object.fromEntries(Object.entries(after).map(([k,v])=>[k,Object.keys(v).length])),mismatches,syntax:syntax.length,ui:uiDiagnostics.length,final}));
