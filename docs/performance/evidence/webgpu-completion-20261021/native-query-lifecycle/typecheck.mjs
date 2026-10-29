/** Semantic check of allocated TS files and the native declaration overlay only. */
import ts from 'typescript';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../../..'),cache=join(root,'.cache/webgpu-completion-native-query-lifecycle-20261021');
const nativeRoot=dirname(fileURLToPath(import.meta.resolve('@babylonjs/core/package.json')));
const baseline=JSON.parse(await readFile(join(cache,'baseline.json'),'utf8')),replacements=new Map();
const key=file=>resolve(file).replaceAll('\\','/').toLowerCase();
for(const file of Object.keys(baseline.native).filter(f=>f.endsWith('.d.ts')))replacements.set(key(join(nativeRoot,file)),await readFile(join(cache,'candidate',file),'utf8'));
const probe=join(cache,'type-probe.ts');
await writeFile(probe,`import {WebGPUEngine} from '@babylonjs/core/Engines/webgpuEngine.pure';\nimport {WebGPUQuerySet} from '@babylonjs/core/Engines/WebGPU/webgpuQuerySet';\ndeclare const engine:WebGPUEngine,query:WebGPUQuerySet;\nengine.onQueryReadErrorObservable.add(({error,source})=>{const e:unknown=error;const s:'timestamp-frame'|'timestamp-pass'|'occlusion'=source;void e;void s;});\nengine._reportQueryReadError('occlusion',false);\nconst retired:boolean=query.isRetired;void retired;\n`);
const files=['client/webgpu-validation.ts','client/render-health.ts','tests/webgpu-validation.test.ts','tests/render-health.test.ts','tests/render-startup.test.ts','tests/startup-preparation-loop.test.ts','tests/webgpu-query-lifecycle.test.ts'].map(f=>join(root,f)).concat(probe);
const options={noEmit:true,strict:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,types:['node','vite/client'],lib:['lib.es2022.d.ts','lib.dom.d.ts','lib.dom.iterable.d.ts'],esModuleInterop:true,allowImportingTsExtensions:true};
const host=ts.createCompilerHost(options),read=host.readFile.bind(host);host.readFile=file=>replacements.get(key(file))??read(file);
const program=ts.createProgram(files,options,host),diagnostics=ts.getPreEmitDiagnostics(program);
const log=ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'});
await writeFile(join(dirname(fileURLToPath(import.meta.url)),'types.log'),log);
console.log(JSON.stringify({diagnostics:diagnostics.length,rootFiles:files.length,nativeDeclarationOverlays:replacements.size}));process.exitCode=diagnostics.length?1:0;
