import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),wt=path.resolve(root,'../..'),candidate=path.join(root,'candidate');
const inputs=JSON.parse(fs.readFileSync(path.join(root,'inputs.json'),'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const record=(folder,name)=>{const bytes=fs.readFileSync(path.join(folder,name));return{path:name,sha256:hash(bytes),bytes:bytes.length};};
const write=(name,data)=>fs.writeFileSync(path.join(root,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const changes=[];
for(const input of inputs.inputFiles){const actual=record(candidate,input.path);if(actual.sha256!==input.sha256)changes.push({...actual,originalSha256:input.sha256});}
for(const change of inputs.changes.filter(x=>x.originalSha256===null))changes.push({...record(candidate,change.path),originalSha256:null});
assert.deepEqual(changes.map(x=>x.path).sort(),inputs.changes.map(x=>x.path).sort());
for(const name of ['client/webgpu-compilation-profile.ts','client/render-incident-profile.ts','tests/webgpu-compilation-profile.test.ts','tests/render-incident-profile.test.ts'])assert.equal(record(candidate,name).sha256,inputs.reviewedPins[name]);
const edits=JSON.parse(fs.readFileSync(path.join(root,'game-edits.json'),'utf8'));
let inverse=fs.readFileSync(path.join(candidate,'client/game.ts'),'utf8');for(const {from,to} of [...edits.edits].reverse()){assert.equal(inverse.split(to).length,2);inverse=inverse.replace(to,from);}
assert.equal(hash(inverse),edits.before);assert.equal(inverse,fs.readFileSync(path.join(inputs.base,'client/game.ts'),'utf8'));
const require=createRequire(path.join(candidate,'package.json')),ts=require('typescript');
function methods(text){const tree=ts.createSourceFile('game.ts',text,ts.ScriptTarget.Latest,true),declaration=tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='Game');return Object.fromEntries(declaration.members.filter(n=>n.name).map(n=>[n.name.getText(tree),n.getText(tree)]));}
const original=methods(inverse),current=methods(fs.readFileSync(path.join(candidate,'client/game.ts'),'utf8'));
const protectedMethods=['start','prepareLighting','prepareLightingVariants','updateRenderEnvironment','applyRenderQuality','updateWorldPresentation'];
const methodParity=protectedMethods.map(name=>{assert.equal(current[name],original[name],name);return{name,sha256:hash(current[name])};});
const protectedHelpers=['authored-light-preparation.ts','light-preparation.ts','render-quality-preparation.ts','strict-material-preparation.ts','webgpu-pipeline-preparation.ts'];
const helperParity=protectedHelpers.map(name=>{const file='client/'+name,value=record(candidate,file);assert.equal(value.sha256,record(inputs.base,file).sha256);return value;});
const test='tests/webgpu-program-attribution.test.ts',adapted=fs.readFileSync(path.join(candidate,test),'utf8').replace('import { BenchmarkRenderProfile, BENCHMARK_RENDER_CPU_SCOPE } from "../client/benchmark-render-profile";\n','');
const reviewedTest=fs.readFileSync(path.join(inputs.reviewed,test),'utf8');
assert.equal(adapted.slice(0,adapted.indexOf('const nativeSource=')).trimEnd(),reviewedTest.slice(0,reviewedTest.indexOf('test("actual Game benchmark method')).trimEnd());
write('source-parity.json',{baseSnapshot:inputs.baseSnapshot,copiedFiles:inputs.inputFiles.length,changes,gameInverseExact:true,methodParity,helperParity,unchangedAttributionTestsPrefix:true,nativeBenchmarkProfilerUnchanged:record(candidate,'client/benchmark-render-profile.ts').sha256});
let diff='';const empty=path.join(root,'empty.txt');fs.writeFileSync(empty,'',{flag:'wx'});
for(const item of changes){const before=item.originalSha256?path.join(root,'preimages',item.path.replaceAll('/','__')):empty;const result=spawnSync('git',['diff','--no-index','--',before,path.join(candidate,item.path)],{encoding:'utf8'});assert.equal(result.status,1);diff+=result.stdout;}
fs.writeFileSync(path.join(root,'owned.diff'),diff,{flag:'wx'});
const dependencyFiles=['@babylonjs/core/Materials/standardMaterial.pure.js','@babylonjs/core/Materials/standardMaterial.pure.d.ts','@babylonjs/core/Materials/effect.pure.js','@babylonjs/core/Engines/webgpuEngine.pure.js','@babylonjs/core/Misc/observable.pure.js'];
const dependencyPins=dependencyFiles.map(name=>record(path.join(candidate,'node_modules'),name));
write('summary.json',{validation:{passed:61,failed:0,skipped:0,durationMs:3604.8572,log:'run-02.log'},priorRun:{pass:57,fail:4,cause:'Fixture expected synchronous physical Observable removal; pinned remove disables immediately and defers array removal through setTimeout. Runtime unchanged; final test waits timer turn.'},gameLifecycle:['explicit benchmark with local recording and WebGPU; profileEnvironment not required','native BenchmarkRenderProfile retained','restart/stale stop','actual native completion block disposes before result callback and immediate restart','actual native handleRendererFailure and dispose','initialization exception cleanup'],limitations:['Existing incident has additional idle phase observables and shader/material counters inside the benchmark; this capture is not clean FPS acceptance.','No startup or preparation changes, C5 preload or mesh-draw/raw-frame instrumentation.','No full TypeScript/build/GPU performed by leaf.']});
const handoff='docs/agents/handoffs/webgpu-native-attribution-20261018.md';
fs.writeFileSync(path.join(wt,handoff),`# Předání nativní benchmarkové atribuce

- Task webgpu-native-attribution-20261018, owner webgpu-native-attribution-01a14497-child, příjemce root. WT beze změny runtime; veškerý kód je ve vlastní .cache/webgpu-native-attribution-20261018/candidate/ nad frozen native777a1bbb3552b800947cf62adcf6db141c72d3d72600fbfcbeeca42d287e05f6.
- Změněné přesně3runtime+3tests: ${changes.map(c=>c.path).join(', ')}. Dva profiler moduly a jejich dvě testové sady byte-exact reviewed V2. Native Game pouze export callback, field stop a explicitní benchmark-local observer s ukončením při restart/end/fault/dispose.
- Gate je sessionDiagnostics.isRecording && engine.isWebGPU; existující recorder omezuje recording na lokálníhost. profileEnvironment není nutný a startup nedostává jeho inventář/environment/raw-RAF hooky. Native BenchmarkRenderProfile a výpočty frame/result se nepřebírají z C5. Incident uvnitř10sbenchmarku má vlastní neaktivníphaseobservers a shader/materialcounters; přiznanáinstrumentačnírežie, nikoliFPSA/B.
- Celý Game inverse vrací přesný předobraz. Source-parity.json dokládá unchanged start, prepareLighting, prepareLightingVariants, updateRenderEnvironment, applyRenderQuality, updateWorldPresentation a5přípravnýchhelperů. Žádná změna rendererfactory/devicefeatures/časování, světel, avatarů, cache ani limitů.
- Finalrun02:61/61PASS,0skip,3.605s, exit0. Původní54testů předGamečástí zachované;7nativníchpřípadů ověřuje skutečnýstart/fault/dispose a exactbenchmarkcompletionblock sIOdiagnosticadaptery, reálnéScene/Materialobservables a původníBenchmarkRenderProfile. Ověřeno ukončení předresultcallbackem, okamžitýrestart, stale-stop, gatedabsence a zachovánípůvodníinitializationexception.
- Run01 57PASS/4FAIL: test chybně požadoval okamžité fyzické odstranění Observable; pinnedremove214–222 používá timerturn. Final čeká skutečnýtimerturn a ověřuje původní početobserverů. Runtime běhemopravytestů nezměněný; oba běhy/sources zachované.
- Dependencies pouze readonly junction původního freshinstallu. Žádný install/fullsuite/fullTS/build/GPU/browser/server/commit. Vlastníprocesy skončily; claim se uvolní po předání. Root provede plnýTS/build a jediný skutečný sběr.
`,{flag:'wx'});
const artifacts=['analysis.md','assemble.mjs','run.mjs','finalize.mjs','inputs.json','game-edits.json','source-parity.json','owned.diff','summary.json','run-01.json','run-01.log','run-02.json','run-02.log'];
write('manifest.json',{task:'webgpu-native-attribution-20261018',createdAt:new Date().toISOString(),base:inputs.base,baseSnapshot:inputs.baseSnapshot,candidate,changedPaths:changes,artifacts:artifacts.map(name=>record(root,name)),dependencyPins,handoff:record(wt,handoff),validation:{pass:61,fail:0,skip:0,fullTypecheck:false,build:false,GPU:false}});
console.log(JSON.stringify({manifest:record(root,'manifest.json'),handoff:record(wt,handoff),changedPaths:changes,methodParity}));
