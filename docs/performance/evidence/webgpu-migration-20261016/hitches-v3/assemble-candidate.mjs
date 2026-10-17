import {readFileSync,writeFileSync,mkdirSync,symlinkSync,realpathSync,existsSync,readdirSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
const root=import.meta.dirname, repo=join(root,'../..');
const base=join(root,'gpu-fence-pending'), out=join(root,'torch-receivers-v1');
const revision='d82eb6342541c7216d395b9d8fe5c89c4b02beeb';
const hash=b=>createHash('sha256').update(b).digest('hex');
const text=b=>b.toString('utf8').replaceAll('\r\n','\n');
const manifest=JSON.parse(readFileSync(join(base,'source-manifest.json')));
if(manifest.snapshotId!=='3cf48f74ff65aac859d5fa8869abd8da775cee66f85d2df5ff5ac4428d54507b'||hash(JSON.stringify(manifest.files))!==manifest.snapshotId)throw Error('Unexpected frozen base');
if(existsSync(out))throw Error('Preserve existing QA candidate');
const modules=realpathSync(join(base,'node_modules'));
const metadata=JSON.parse(readFileSync(join(root,'metadata-before-native-build.json')));
const depState=()=>({files:Object.fromEntries(Object.keys(metadata.files).map(p=>[p,hash(readFileSync(join(modules,p)))])),entries:readdirSync(modules).sort(),viteTempMtime:statSync(join(modules,'.vite-temp')).mtimeMs});
const before=depState();
mkdirSync(out);
for(const top of ['assets','public','docs','node_modules'])symlinkSync(realpathSync(join(base,top)),join(out,top),'junction');
const files={...manifest.files};let copied=0;
for(const[path,expected]of Object.entries(manifest.files)){
  if(['assets','public','docs'].some(p=>path.startsWith(p+'/')))continue;
  const bytes=readFileSync(join(base,path));if(hash(bytes)!==expected)throw Error('QA baseline code drift: '+path);
  mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),bytes);copied++;
}
const overlayPaths=['client/game.ts','client/light-receivers.ts','client/vehicle-lighting.ts','client/stable-light-state.ts','tests/game-diagnostics.test.ts','tests/game-light-lifecycle.test.ts','tests/game-webgpu-startup.test.ts','tests/light-receivers.test.ts','tests/stable-light-state.test.ts','tests/vehicle-lighting.test.ts','tests/flashlight.test.ts'];
const overlays=[];
const mergeRoot=join(root,'torch-receivers-v1-merge-inputs');mkdirSync(mergeRoot);
for(const path of overlayPaths){
  const next=readFileSync(join(repo,path)), current=existsSync(join(base,path))?readFileSync(join(base,path)):null;
  let result=next, method='new source';
  if(current){
    const original=execFileSync('git',['show',revision+':'+path],{cwd:repo,maxBuffer:4*1024*1024});
    if(text(current)===text(original))method='common base after CRLF normalization';
    else if(path==='client/game.ts'){
      const native=text(next), originalText=text(original), currentText=text(current);
      const helperStart=native.indexOf('  private prepareSceneLightState() {');
      const helperEnd=native.indexOf('  private prepareLighting(',helperStart);
      if(helperStart<0||helperEnd<helperStart||currentText.includes('private prepareSceneLightState'))throw Error('Unexpected Game helper boundary');
      const helper=native.slice(helperStart,helperEnd);
      const expected=originalText.replace('        this.gltfLightBudget.prepareFrame();\n        this.stableLights.update();','        this.prepareSceneLightState();').replace('    this.gltfLightBudget.prepareFrame();\n    this.stableLights.update();','    this.prepareSceneLightState();').replace('  private prepareLighting(',helper+'  private prepareLighting(');
      if(expected!==native)throw Error('Unreviewed native Game change');
      let adapted=currentText;
      for(const spaces of ['        ','    ']){
        const pair=spaces+'this.gltfLightBudget?.prepareFrame();\n'+spaces+'this.stableLights?.update();';
        if(adapted.split(pair).length!==2)throw Error('Ambiguous C5 controller pair');
        adapted=adapted.replace(pair,spaces+'this.prepareSceneLightState();');
      }
      const combinedHelper=helper.replace('this.gltfLightBudget.prepareFrame()','this.gltfLightBudget?.prepareFrame()').replace('this.stableLights.markMeshesDirty(','this.stableLights?.markMeshesDirty(').replace('this.stableLights.update()','this.stableLights?.update()');
      if(adapted.split('  private prepareLighting(').length!==2)throw Error('Ambiguous C5 helper insertion');
      result=Buffer.from(adapted.replace('  private prepareLighting(',combinedHelper+'  private prepareLighting('));
      method='reviewed two-site adapter retaining C5 renderer-failure, preload-visual, optional-controller and phase-profiling behavior';
    }
    else if(path==='tests/game-diagnostics.test.ts'||path==='tests/game-webgpu-startup.test.ts'){
      const anchor=path.includes('game-diagnostics')?'      "frame",':'      "start",';
      const needle='      "prepareSceneLightState",';
      if(text(next).replace(needle+'\n','')!==text(original))throw Error('Unexpected root fixture delta: '+path);
      const fixture=text(current);if(fixture.includes(needle)||fixture.split(anchor).length!==2)throw Error('Ambiguous actual-method fixture insertion');
      result=Buffer.from(fixture.replace(anchor,anchor+'\n'+needle));method='preserve QA fixture and add actual pre-draw method; normalize CRLF';
    }else{
      const stem=path.replaceAll('/','_'), a=join(mergeRoot,stem+'.qa'), b=join(mergeRoot,stem+'.base'), c=join(mergeRoot,stem+'.native');
      writeFileSync(a,text(current));writeFileSync(b,text(original));writeFileSync(c,text(next));
      const merged=spawnSync('git',['merge-file','-p','--',a,b,c],{cwd:repo,maxBuffer:8*1024*1024});
      if(merged.status!==0){
        if(path!=='tests/game-light-lifecycle.test.ts')throw Error('Review three-way conflict before building: '+path);
        let conflicts=0;
        const resolved=merged.stdout.toString().replace(/^<<<<<<<[^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>>[^\n]*\n/gm,(_whole,_qa,native)=>{
          if(!native.includes('prepareSceneLightState')&&!native.includes('${before.getText(source)}'))throw Error('Unreviewed lifecycle fixture conflict');
          conflicts++;return native;
        });
        if(conflicts<1||conflicts>3||/^(<<<<<<<|=======|>>>>>>>)/m.test(resolved))throw Error('Unexpected lifecycle fixture conflicts');
        result=Buffer.from(resolved);method='reviewed lifecycle fixture adaptation: shared-gate AST lookup works through C5 diagnostic try/finally; preserve all other merged cases';
      }else{result=merged.stdout;method='clean three-way preserving combined and QA deltas; normalize CRLF';}
    }
  }
  if(path==='tests/game-light-lifecycle.test.ts'){
    const fixture=text(result), anchor='      frameLifecycleProfile: undefined,';
    if(fixture.split(anchor).length!==2||fixture.includes('pendingGpuCompletionFence:'))throw Error('Unexpected QA disposal fixture');
    result=Buffer.from(fixture.replace(anchor,anchor+'\n      pendingGpuCompletionFence: undefined,'));
    method+='; QA disposal fixture explicitly has no pending fence token';
  }
  mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),result);
  files[path]=hash(result);overlays.push({path,before:current?hash(current):null,nativeWorkingSha256:hash(next),after:files[path],method});
}
const composition={kind:'unaccepted-runtime-receiver-candidate-on-isolated-qa',baseSnapshot:manifest.snapshotId,baseNativeRevision:revision,overlays,scope:'Same C5 scene and corrected fence/timestamp-OFF QA as baseline. Only explicitly owned receiver/order/Game/test deltas are added; no played files changed. Shared assets/docs retain prior immutable hashes.'};
const compositionBytes=JSON.stringify(composition,null,2)+'\n';writeFileSync(join(out,'source-composition.json'),compositionBytes);files['source-composition.json']=hash(compositionBytes);
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,sourceCommit:revision,createdAt:new Date().toISOString(),scope:composition.scope,files},null,2)+'\n');
const targets=['tests/light-receivers.test.ts','tests/vehicle-lighting.test.ts','tests/flashlight.test.ts','tests/stable-light-state.test.ts','tests/game-light-lifecycle.test.ts','tests/game-diagnostics.test.ts','tests/game-webgpu-startup.test.ts'];
const results=[];
for(const[name,args]of [['targeted',['--import','tsx','--test',...targets]],['types',['./node_modules/typescript/bin/tsc','--noEmit']],['build',['./node_modules/vite/bin/vite.js','build','--configLoader','native']]]){
  const startedAt=new Date().toISOString();const result=spawnSync(process.execPath,args,{cwd:out,env:{...process.env,VITE_SOURCE_SNAPSHOT_ID:snapshotId,TSX_DISABLE_CACHE:'1'},encoding:'utf8',maxBuffer:16*1024*1024});
  const log=`torch-receivers-v1-${name}.log`;writeFileSync(join(root,log),(result.stdout||'')+(result.stderr||''));
  results.push({name,startedAt,finishedAt:new Date().toISOString(),exitCode:result.status,command:['node',...args].join(' '),log,sha256:hash(readFileSync(join(root,log)))});
  if(result.status!==0)throw Error(name+' failed; preserve candidate and inspect log');
}
for(const[path,expected]of Object.entries(files))if(!['assets','public','docs'].some(p=>path.startsWith(p+'/'))&&hash(readFileSync(join(out,path)))!==expected)throw Error('Candidate drift: '+path);
if(JSON.stringify(before)!==JSON.stringify(depState()))throw Error('Shared dependency metadata changed');
const validation={atUTC:new Date().toISOString(),snapshotId,copiedCodeFiles:copied,newCodeFiles:2,results,sharedMetadataUnchanged:true,scope:'Targeted/fullTS/build only for GPU hypothesis test. Full suite/integration and final acceptance remain pending.'};writeFileSync(join(root,'torch-receivers-v1-validation.json'),JSON.stringify(validation,null,2)+'\n');console.log(JSON.stringify(validation));
