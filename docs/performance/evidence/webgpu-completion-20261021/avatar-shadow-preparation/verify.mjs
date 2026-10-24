import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const prefix='docs/performance/evidence/webgpu-completion-20261021/avatar-shadow-preparation',root=process.cwd(),sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=JSON.parse(fs.readFileSync(prefix+'/before.json'));
const own=['client/flashlight.ts','client/vehicle-lighting.ts','tests/avatar-shadow-preparation.test.ts','tests/fixtures/avatar-shadow-preparation/probe.ts','tests/fixtures/avatar-shadow-preparation/local-preparation.ts','tests/flashlight.test.ts','tests/vehicle-lighting.test.ts'];
const history=JSON.parse(fs.readFileSync(before.historical332.manifest)).files;
const preserved=JSON.parse(fs.readFileSync('docs/performance/evidence/webgpu-completion-20261021/avatar-shadow-probe/root-preserved-source.json')).saved;
const expectedHistory=Object.fromEntries(Object.entries(history).filter(([p])=>!own.includes(p)).map(([p,v])=>[p,v.sha256]));
const snapshot=()=>({own:Object.fromEntries(own.map(p=>[p,sha(p)])),protectedSources:Object.fromEntries(Object.keys(before.protectedSources).map(p=>[p,sha(p)])),native39:Object.fromEntries(Object.keys(before.native.files).map(p=>[p,sha('node_modules/'+p)])),helper36:Object.fromEntries(Object.keys(before.helper36).map(p=>[p,sha(p)])),source14:Object.fromEntries(Object.keys(before.source14.files).map(p=>[p,sha(before.source14.prefix+'/'+p)])),historical332:Object.fromEntries(Object.keys(expectedHistory).map(p=>[p,sha(p)])),preserved332:Object.fromEntries(preserved.map(f=>[f.preservedPath,sha(f.preservedPath)])),historicalManifest:sha(before.historical332.manifest),nativeMap:sha(before.native.path),source14Manifest:sha(before.source14.prefix+'/manifest.json')});
const drift=(a,b)=>Object.keys(b).filter(p=>a[p]!==b[p]);
const start=snapshot();
const proof={atUTC:new Date().toISOString(),scope:'Targeted CPU/source acceptance only; no GPU/image/performance/default/main claim',before:start,baselineDrift:{protectedSources:drift(start.protectedSources,before.protectedSources),native39:drift(start.native39,before.native.files),helper36:drift(start.helper36,before.helper36),source14:drift(start.source14,Object.fromEntries(Object.entries(before.source14.files).map(([p,f])=>[p,f.sha256]))),historical332:drift(start.historical332,expectedHistory),preserved332:drift(start.preserved332,Object.fromEntries(preserved.map(f=>[f.preservedPath,f.sha256]))),historicalManifest:start.historicalManifest!==before.historical332.manifestSha256,nativeMap:start.nativeMap!==before.native.sha256,source14Manifest:start.source14Manifest!==before.source14.manifestSha256}};
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile).config,options=ts.convertCompilerOptionsFromJson(config.compilerOptions,root).options;
const program=ts.createProgram(own,options),diagnostics=ts.getPreEmitDiagnostics(program);
proof.types={roots:own,allTransitiveDiagnostics:diagnostics.length,diagnostics:diagnostics.map(d=>({file:d.file?path.relative(root,d.file.fileName).replaceAll('\\','/'):null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}))};
proof.syntax=own.map(p=>({path:p,diagnostics:ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:options,fileName:p,reportDiagnostics:true}).diagnostics?.length??0}));
if(diagnostics.length===0){
  const dir='.cache/webgpu-avatar-shadow-preparation-20261024/final';fs.mkdirSync(dir,{recursive:true});
  const args=['--import','tsx','--test','--test-concurrency=1','--test-reporter=tap','tests/avatar-shadow-preparation.test.ts','tests/flashlight.test.ts','tests/vehicle-lighting.test.ts','tests/game-authored-light-preparation.test.ts'];
  const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',env:{...process.env,AVATAR_SHADOW_REPORT_DIR:dir},timeout:120000});
  fs.writeFileSync(prefix+'/final.tap',run.stdout+run.stderr,{flag:'wx'});
  proof.cpu={command:[process.execPath,...args],exitCode:run.status,signal:run.signal,error:run.error?.message??null,log:prefix+'/final.tap',logSha256:sha(prefix+'/final.tap')};
  for(const bone of ['default-null','bone-texture'])for(const mode of ['lazy','targeted']){const f=`${bone}-${mode}.json`;if(fs.existsSync(dir+'/'+f))fs.copyFileSync(dir+'/'+f,prefix+'/'+f,fs.constants.COPYFILE_EXCL);}
}
proof.after=snapshot();proof.executionInputDrift=JSON.stringify(proof.before)!==JSON.stringify(proof.after);
const result=diagnostics.length?'types-development.json':'verification.json';fs.writeFileSync(prefix+'/'+result,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({result,baselineDrift:proof.baselineDrift,types:proof.types,syntax:proof.syntax,cpu:proof.cpu,executionInputDrift:proof.executionInputDrift}));
