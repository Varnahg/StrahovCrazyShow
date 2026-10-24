import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';

const root=process.cwd(),prefix='docs/performance/evidence/webgpu-completion-20261021/receiver-stage-chain';
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const own=['tests/receiver-stage-chain.test.ts','tests/fixtures/receiver-stage-chain/production.ts','tests/fixtures/receiver-stage-chain/probe.ts'];
const before=JSON.parse(fs.readFileSync(`${prefix}/before.json`));
const selectedInputs=[...own,'shared/b6-interior.ts','shared/data/assets/b6-manifest.json','shared/data/assets/environment-manifest.json','shared/road-details.ts','client/world-asset-identity.ts','public/models/b6/sink.glb'];
const snapshot=()=>({own:Object.fromEntries(own.map(p=>[p,sha(p)])),selectedInputs:Object.fromEntries(selectedInputs.map(p=>[p,sha(p)])),sources:Object.fromEntries(Object.keys(before.sources).map(p=>[p,sha(p)])),native39:Object.fromEntries(Object.keys(before.nativeGuard.files).map(p=>[p,sha('node_modules/'+p)])),helper36:Object.fromEntries(Object.keys(before.helper36).map(p=>[p,sha(p)])),nativeMap:sha(before.nativeGuard.path),actual:sha(before.actual.path)});
const drift=(actual,expected)=>Object.keys(expected).filter(p=>actual[p]!==expected[p]);
const start=snapshot();
const proof={capturedAtUTC:new Date().toISOString(),scope:'Finite CPU/GLSL fixture only; expected desired-coverage RED is preserved, not product acceptance',before:start,baselineDrift:{sources:drift(start.sources,before.sources),native39:drift(start.native39,before.nativeGuard.files),helper36:drift(start.helper36,before.helper36),nativeMap:start.nativeMap!==before.nativeGuard.sha256,actual:start.actual!==before.actual.sha256}};
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile).config;
const options=ts.convertCompilerOptionsFromJson(config.compilerOptions,root).options;
const program=ts.createProgram(own,options);
const diagnostics=ts.getPreEmitDiagnostics(program);
const format=d=>({file:d.file?path.relative(root,d.file.fileName).replaceAll('\\','/'):null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')});
proof.types={roots:own,allTransitiveDiagnostics:diagnostics.length,ownDiagnostics:diagnostics.filter(d=>!d.file||own.some(p=>path.resolve(p)===path.resolve(d.file.fileName))).map(format),note:'Only these three roots are checked, not the whole project; transitive diagnostics reported separately.'};
proof.syntax=own.map(p=>({path:p,diagnostics:ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:options,reportDiagnostics:true,fileName:p}).diagnostics?.length??0}));
if(process.argv.includes('--cpu')){
  const dir='.cache/webgpu-receiver-stage-chain-20261024/final';fs.mkdirSync(dir,{recursive:true});
  const args=['--import','tsx','--test','--test-reporter=tap',own[0]];
  const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',env:{...process.env,RECEIVER_CHAIN_REPORT_DIR:dir},timeout:60000});
  const log=run.stdout+run.stderr;fs.writeFileSync(`${prefix}/final.tap`,log,{flag:'wx'});
  proof.cpu={command:[process.execPath,...args],status:run.status,signal:run.signal,error:run.error?.message??null,log:`${prefix}/final.tap`,logSha256:sha(`${prefix}/final.tap`),expectedCoverageRed:run.status===1&&/# fail 2\b/.test(log)&&/declared receiver must reach original native instance batch/.test(log)};
  for(const mode of ['native-null-mono','webgpu-perpass-branch']){
    const source=`${dir}/${mode}.json`,target=`${prefix}/${mode}.json`;fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  }
}
proof.after=snapshot();proof.executionInputDrift=JSON.stringify(proof.before)!==JSON.stringify(proof.after);
const result=process.argv.includes('--cpu')?'verification.json':'types-development.json';
fs.writeFileSync(`${prefix}/${result}`,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({result,baselineDrift:proof.baselineDrift,types:proof.types,syntax:proof.syntax,cpu:proof.cpu,executionInputDrift:proof.executionInputDrift}));
