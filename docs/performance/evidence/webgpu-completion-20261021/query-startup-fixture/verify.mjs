/** Only allocated targeted CPU/semantic checks; dependencies and frozen trees are read only. */
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
const directory=dirname(fileURLToPath(import.meta.url)),root=resolve(directory,'../../../../..'),cache=join(root,'.cache/webgpu-completion-query-startup-fixture-20261021');
const core=await realpath(join(root,'.cache/performance-snapshot/webgpu-completion-20261021-candidate-7/node_modules/@babylonjs/core'));
const installed=dirname(fileURLToPath(import.meta.resolve('@babylonjs/core/package.json'))),hash=x=>createHash('sha256').update(x).digest('hex');
const files=['tests/game-webgpu-startup.test.ts','tests/avatar-preview-webgpu.test.ts'];
const prior=JSON.parse(await readFile(join(root,'docs/performance/evidence/webgpu-completion-20261021/native-query-lifecycle/verification.json'),'utf8'));
const pins=Object.keys(prior.freshBefore),digest=async(paths,base)=>Object.fromEntries(await Promise.all(paths.map(async f=>[f,hash(await readFile(join(base,f)))])));
await mkdir(cache,{recursive:true});
const sourceBefore=await digest(files,root),freshBefore=await digest(pins,core),installedBefore=await digest(pins,installed);
for(const [file,expected]of Object.entries(prior.candidateAfter))assert.equal(freshBefore[file],expected,file+' installed reviewed candidate');
assert.equal(freshBefore['Meshes/mesh.pure.js'],'7ceb79d2f4eaa72665e5084ffc6e752bbbb93dd84a7f97801c9cf2431afa459a');
const loader=join(cache,'source7-import.mjs');
await writeFile(loader,`import {registerHooks} from 'node:module';\nconst core=${JSON.stringify(pathToFileURL(core+'/').href)};\nregisterHooks({resolve(specifier,context,next){if(specifier.startsWith('@babylonjs/core/')){let relative=specifier.slice('@babylonjs/core/'.length);if(!relative.endsWith('.js')&&!relative.endsWith('.json'))relative+='.js';return next(new URL(relative,core).href,context);}return next(specifier,context);}});\n`);
const run=args=>{const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});return {args,exit:r.status,log:r.stdout+(r.stderr?'\nSTDERR\n'+r.stderr:'')};};
const args=['--import',pathToFileURL(loader).href,'--import','tsx','--test','--test-reporter=tap',...files],result=run(args),red=process.argv.includes('--red');
await writeFile(join(directory,red?'red.tap':'green.tap'),result.log);assert.equal(result.exit,red?1:0,result.log.slice(-10000));
const summary={command:[process.execPath,...args].join(' '),exit:result.exit,tests:Number(/^# tests (\d+)$/m.exec(result.log)?.[1]),pass:Number(/^# pass (\d+)$/m.exec(result.log)?.[1]),fail:Number(/^# fail (\d+)$/m.exec(result.log)?.[1]),cancelled:Number(/^# cancelled (\d+)$/m.exec(result.log)?.[1]),logSha256:hash(result.log)};
if(red){for(const file of files)await writeFile(join(cache,file.replaceAll('/','__')),await readFile(join(root,file)));await writeFile(join(directory,'red.json'),JSON.stringify({summary,sourceBefore,freshBefore},null,2)+'\n');console.log(JSON.stringify(summary));}
else{
  const options={noEmit:true,strict:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node','vite/client'],lib:['lib.es2022.d.ts','lib.dom.d.ts','lib.dom.iterable.d.ts'],esModuleInterop:true,allowImportingTsExtensions:true,resolveJsonModule:true,baseUrl:root,paths:{'@babylonjs/core/*':[core.replaceAll('\\','/')+'/*']}};
  const program=ts.createProgram(files.map(f=>join(root,f)),options),diagnostics=ts.getPreEmitDiagnostics(program),log=ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'});
  await writeFile(join(directory,'types.log'),log);assert.equal(diagnostics.length,0,log);
  const diff=spawnSync('git',['diff','--check','--',...files],{cwd:root,encoding:'utf8'});assert.equal(diff.status,0,diff.stdout+diff.stderr);
  const sourceAfter=await digest(files,root),freshAfter=await digest(pins,core),installedAfter=await digest(pins,installed);assert.deepEqual(sourceAfter,sourceBefore);assert.deepEqual(freshAfter,freshBefore);assert.deepEqual(installedAfter,installedBefore);
  const original='.cache/webgpu-completion-20261021/validation/candidate7-targeted.log';
  const proof={checkedAtUTC:new Date().toISOString(),summary,types:{diagnostics:0,rootFiles:2,nativeDependencyPaths:core,logSha256:hash(log)},sourceBefore,sourceAfter,freshBefore,freshAfter,installedBefore,installedAfter,allNativeTreesUnchanged:true,diffCheck:0,originalRootRed:{path:original,sha256:hash(await readFile(join(root,original))),tests:278,pass:274,fail:4},red:JSON.parse(await readFile(join(directory,'red.json'),'utf8'))};
  await writeFile(join(directory,'verification.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({summary,types:proof.types,verificationSha256:hash(await readFile(join(directory,'verification.json')))}));
}
