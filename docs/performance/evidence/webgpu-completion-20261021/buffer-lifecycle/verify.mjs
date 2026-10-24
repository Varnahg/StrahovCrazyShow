/** CPU-only proof for this allocated helper task; never builds or starts a server. */
import { readFile,writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname,resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { helperIdentity,sourceFiles,sha256,transformUI } from '../measurement/common.mjs';
const directory=dirname(fileURLToPath(import.meta.url)),root=resolve(directory,'../../../../..'),measurement=join(directory,'../measurement');
const require=createRequire(join(root,'package.json'));
const files=['helper.test.mjs','clock.test.mjs','weather-latency.test.mjs','shader-attribution.test.mjs','shader-lifetime.test.mjs','routine-cost.test.mjs','buffer-lifecycle.test.mjs'];
const app=['client/ui.tsx','client/game.ts','client/render-health.ts','client/webgpu-validation.ts','client/rendered-frame-capture.ts','client/webgpu-shadow-readiness.ts','client/render-engine.ts','client/style.css'];
const harness=await readFile(join(measurement,'harness.mjs'),'utf8');
const pinned=[...harness.slice(harness.indexOf('const files = ['),harness.indexOf('const dependencies = {}')).matchAll(/'(@babylonjs\/core\/[^']+)'/g)].map(value=>value[1]);
const selected=async()=>Object.fromEntries(await Promise.all([...app,...pinned].map(async name=>[name,sha256(await readFile(name.startsWith('@')?require.resolve(name):join(root,name)))])));
const frozen=async version=>{
  const folder=join(root,'.cache/webgpu-completion-20261021/validation/helper-runtimes',version),bytes=await readFile(join(folder,'frozen-identity.json')),identity=JSON.parse(bytes);
  const actual={};for(const [file,expected]of Object.entries(identity.helperFiles)){actual[file]=sha256(await readFile(join(folder,file)));assert.equal(actual[file],expected,version+' '+file);}
  return{identitySha256:sha256(bytes),helperSha256:identity.helperSha256,files:actual};
};
const before=await helperIdentity(measurement),selectedBefore=await selected(),frozenBefore={v4:await frozen('v4'),v5:await frozen('v5')};
const copies={};for(const [local,original]of [['baseline3673-identity.json','frozen-identity.json'],['baseline100-verification.json','verification.json']]){
  const copied=await readFile(join(directory,local)),source=await readFile(join(root,'.cache/webgpu-completion-20261021/validation/helper-runtimes/v5',original));assert.ok(copied.equals(source),local+' verbatim');copies[local]=sha256(copied);
}
assert.equal(JSON.parse(await readFile(require.resolve('@babylonjs/core/package.json'),'utf8')).version,'9.30.0');
const args=['--import','tsx','--test','--test-reporter=tap',...files.map(file=>join(measurement,file))];
const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024}),log=run.stdout+(run.stderr?'\nSTDERR\n'+run.stderr:'');
await writeFile(join(directory,'cpu119.tap'),log);
assert.equal(run.status,0,log);const pass=Number(/^# pass (\d+)$/m.exec(log)?.[1]),tests=Number(/^# tests (\d+)$/m.exec(log)?.[1]),fail=Number(/^# fail (\d+)$/m.exec(log)?.[1]);assert.equal(pass,119);assert.equal(tests,119);assert.equal(fail,0);
const syntax=[];for(const file of sourceFiles.filter(name=>name.endsWith('.mjs'))){const result=spawnSync(process.execPath,['--check',join(measurement,file)],{cwd:root,encoding:'utf8'});syntax.push({file,exitCode:result.status});assert.equal(result.status,0,result.stderr);}
const originalUI=await readFile(join(root,'client/ui.tsx'),'utf8'),transformed=transformUI(originalUI),parse=ts.createSourceFile('qa-ui.tsx',transformed,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics;assert.equal(parse.length,0);
const after=await helperIdentity(measurement),selectedAfter=await selected(),frozenAfter={v4:await frozen('v4'),v5:await frozen('v5')};assert.deepEqual(before,after);assert.deepEqual(selectedBefore,selectedAfter);assert.deepEqual(frozenBefore,frozenAfter);
const diff=spawnSync('git',['diff','--check','--','docs/performance/evidence/webgpu-completion-20261021/measurement/','docs/performance/evidence/webgpu-completion-20261021/buffer-lifecycle/','docs/agents/handoffs/webgpu-completion-buffer-lifecycle-20261021.md'],{cwd:root,encoding:'utf8'});assert.equal(diff.status,0,diff.stdout+diff.stderr);
const proof={schemaVersion:1,checkedAtUTC:new Date().toISOString(),scope:'CPU-only QA diagnostic. Actual pinned native matrix/update/buffer manager/refcount/deferred destroy/NCM draw algorithms with fake terminal GPU IO; actual Game AST onFault/RenderHealth/validation event chain, metadata/DOM/transport/clock regressions. No build/server/GPU or performance/actual-owner claim.',node:process.version,command:[process.execPath,...args].join(' '),exitCode:run.status,tests,pass,fail,skipped:Number(/^# skipped (\d+)$/m.exec(log)?.[1]),log:'cpu119.tap',logSha256:sha256(log),helperSha256:after.sha256,helperFiles:after.files,helperSourceStable:true,selectedSourceBefore:selectedBefore,selectedSourceAfter:selectedAfter,selectedSourceStable:true,frozenBefore,frozenAfter,frozenStable:true,baselineVerbatim:copies,pinnedVersion:'9.30.0',syntax,uiParseDiagnostics:parse.length,transformedUI:{before:sha256(originalUI),after:sha256(transformed)},maximalFixtureTraceBytes:Number(/maximal scalar trace bytes=(\d+)/.exec(log)?.[1]),diffCheckExit:diff.status};
await writeFile(join(directory,'verification.json'),JSON.stringify(proof,null,2)+'\n');
process.stdout.write(JSON.stringify({pass,tests,syntax:syntax.length,selected:Object.keys(selectedAfter).length,helperSha256:after.sha256,logSha256:proof.logSha256,maximalFixtureTraceBytes:proof.maximalFixtureTraceBytes})+'\n');
