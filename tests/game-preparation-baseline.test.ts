import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {prepareRenderQualities} from '../client/render-quality-preparation';
import {MANUAL_HARDWARE_SCALING} from '../shared/render-quality';

const methods=()=>{
  const source=fs.readFileSync(new URL('../client/game.ts',import.meta.url),'utf8');
  const tree=ts.createSourceFile('game.ts',source,ts.ScriptTarget.Latest,true);
  const game=tree.statements.find((node):node is ts.ClassDeclaration=>ts.isClassDeclaration(node)&&node.name?.text==='Game')!;
  return ['prepareLighting','applyRenderQuality','preparationPosition'].map(name=>game.members.find(n=>n.name?.getText(tree)===name)!.getText(tree));
};
const result=(status='complete',active=0)=>({status,failureStep:null,stages:[],elapsedMs:active,activeElapsedMs:active,pausedMs:0});
function fixture(initial='medium') {
  let clock=0,scale=1,environment:(()=>void)|undefined,passAction:((index:number,options:any)=>void)|undefined;
  const source=`class Subject { ${methods().join('\n')} }; Subject`;
  const Subject=vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,
    {prepareRenderQualities,MANUAL_HARDWARE_SCALING,performance:{now:()=>clock}});
  const requested={quality:initial,hardwareScaling:1.17,revision:7},pos=Object.freeze({x:1,y:2,z:3}),self=Object.freeze({id:'local'}),camera=Object.freeze({identity:'unchanged'}),weather=Object.freeze({rain:.1});
  const samples:any[]=[],passes:any[]=[],applies:string[]=[];
  const game:any=Object.assign(new Subject(),{
    disposed:false,rendererFailed:false,scene:{isDisposed:false},quality:initial,adaptive:{state:requested},
    engine:{isWebGPU:true,getHardwareScalingLevel:()=>scale,setHardwareScalingLevel:(value:number)=>{scale=value;}},
    actor:Object.freeze({position:pos,vehicle:false}),avatars:new Map([['local',self]]),localId:'local',camera,weather,timeOverride:12345,flashlightOn:true,
    setCarQuality:(quality:string)=>applies.push(quality),
    updateRenderEnvironment(this:any,...args:any[]){samples.push({args,quality:this.quality,scale,requested:this.adaptive.state,locked:this.preparingRenderQuality,weather:this.weather,time:this.timeOverride,flashlight:this.flashlightOn});environment?.();},
    async prepareLightingVariants(_render:()=>void,_pipelines:unknown,options:any){
      passes.push({quality:this.quality,timeout:options?.timeoutMs,final:!!options?.restoreQuality});
      passAction?.(passes.length-1,options);options?.restoreQuality?.();return result();
    },
  });
  return {game,requested,pos,self,camera,weather,samples,passes,applies,get scale(){return scale;},advance:(ms:number)=>{clock+=ms;},onEnvironment:(fn:()=>void)=>{environment=fn;},onPass:(fn:(index:number,options:any)=>void)=>{passAction=fn;},run:()=>game.prepareLighting(()=>{})};
}

{
  test(`native Game: one requested-state sync before temporary qualities, original order and restore`,async()=>{
    for(const initial of ['low','medium','high']){
      const f=fixture(initial);const out=await f.run();
      assert.equal(out.status,'complete');assert.equal(f.samples.length,1);
      const seed=f.samples[0];assert.equal(seed.quality,initial);assert.equal(seed.scale,f.requested.hardwareScaling);assert.equal(seed.requested,f.requested);assert.equal(seed.locked,true);
      assert.equal(seed.weather,f.weather);assert.equal(seed.time,12345);assert.equal(seed.flashlight,true);
      assert.equal(seed.args[0],f.pos);assert.equal(seed.args[1],f.self);assert.deepEqual(seed.args.slice(2),[false,0,0]);
      assert.deepEqual(f.passes.map(p=>p.quality),[...['low','medium','high'].filter(q=>q!==initial),initial]);
      assert.deepEqual(f.passes.map(p=>p.final),[false,false,true]);
      assert.equal(f.game.quality,initial);assert.equal(f.scale,f.requested.hardwareScaling);assert.equal(f.game.adaptive.state,f.requested);assert.equal(f.game.appliedQualityRevision,7);assert.equal(f.game.preparingRenderQuality,false);assert.equal(f.game.camera,f.camera);assert.equal(f.game.actor.position,f.pos);
    }
  });
  test(`native Game: existing WebGL path returns directly without environment sync`,()=>{
    const f=fixture();f.game.engine.isWebGPU=false;const operation=Promise.resolve(result());let calls=0;
    f.game.prepareLightingVariants=()=>{calls++;return operation;};assert.equal(f.run(),operation);assert.equal(calls,1);assert.equal(f.samples.length,0);assert.equal(f.applies.length,0);
  });
  test(`native Game: synchronization cost belongs to original first 30s and global active budget`,async()=>{
    const f=fixture();f.onEnvironment(()=>f.advance(125));const out=await f.run();
    assert.equal(out.status,'complete');assert.equal(f.passes[0].timeout,29875);assert.equal(out.activeElapsedMs,125);assert.equal(out.qualities[0].activeElapsedMs,125);
    const timeout=fixture();timeout.onEnvironment(()=>timeout.advance(30000));assert.equal((await timeout.run()).status,'timeout');assert.equal(timeout.passes.length,0);assert.equal(timeout.game.preparingRenderQuality,false);assert.equal(timeout.game.quality,'medium');
    const global=fixture();global.onEnvironment(()=>global.advance(100));global.onPass(()=>global.advance(29000));const bounded=await global.run();assert.equal(bounded.status,'complete');assert.equal(bounded.activeElapsedMs,87100);assert.equal(bounded.qualities[0].activeElapsedMs,29100);assert.equal(bounded.qualities[1].activeElapsedMs,29000);assert.equal(bounded.qualities[2].activeElapsedMs,29000);
  });
  test(`native Game: latest quality/scaling/time request survives seed and final restoration`,async()=>{
    const f=fixture();const latest={quality:'high',hardwareScaling:1.4,revision:9};
    f.onEnvironment(()=>{f.game.adaptive.state=latest;f.game.timeOverride=98765;});
    assert.equal((await f.run()).status,'complete');assert.equal(f.samples.length,1);assert.equal(f.game.adaptive.state,latest);assert.equal(f.game.quality,'high');assert.equal(f.scale,1.4);assert.equal(f.game.appliedQualityRevision,9);assert.equal(f.game.timeOverride,98765);
  });
  test(`native Game: original thrown value propagates and finally restores latest request`,async()=>{
    const f=fixture();const failure={owned:'failure'},latest={quality:'low',hardwareScaling:1.3,revision:11};
    f.onEnvironment(()=>{f.game.adaptive.state=latest;throw failure;});
    await assert.rejects(f.run(),error=>error===failure);assert.equal(f.passes.length,0);assert.equal(f.game.preparingRenderQuality,false);assert.equal(f.game.quality,'low');assert.equal(f.scale,1.3);assert.equal(f.game.appliedQualityRevision,11);
  });
  test(`native Game: retirement during synchronization prevents temporary pass or further writes`,async()=>{
    for(const terminal of ['disposed','rendererFailed','scene']){
      const f=fixture();f.onEnvironment(()=>{if(terminal==='scene')f.game.scene.isDisposed=true;else f.game[terminal]=true;});
      assert.equal((await f.run()).status,'disposed');assert.equal(f.samples.length,1);assert.equal(f.passes.length,0);assert.deepEqual(f.applies,['medium']);
    }
  });
  test(`native Game: inner cancellation stops the matrix and restores requested state once`,async()=>{
    const f=fixture();f.game.prepareLightingVariants=async()=>result('disposed');
    assert.equal((await f.run()).status,'disposed');assert.equal(f.samples.length,1);assert.equal(f.game.preparingRenderQuality,false);assert.equal(f.game.quality,'medium');assert.equal(f.scale,f.requested.hardwareScaling);
  });
}
