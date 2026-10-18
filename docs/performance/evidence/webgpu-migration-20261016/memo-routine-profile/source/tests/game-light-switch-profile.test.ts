import { createMaterialRoutineProfile } from "../client/qa-routine-profile";
import test, {type TestContext} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {Scene} from "@babylonjs/core/scene";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {FreeCamera} from "@babylonjs/core/Cameras/freeCamera";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {StableLightState} from "../client/stable-light-state";
import {MeshDrawProfile, MESH_DRAW_PROFILE_SCOPE} from "../client/mesh-draw-profile";
import {BenchmarkRenderProfile, BENCHMARK_RENDER_CPU_SCOPE} from "../client/benchmark-render-profile";
import {SessionDiagnostics, type DiagnosticsEnvironment} from "../client/session-diagnostics";
import {validateDiagnosticsBatch, diagnosticsByteLength, MAX_DIAGNOSTICS_RECORD_BYTES} from "../shared/session-diagnostics";
import "../client/render-shaders";

const source=readFileSync(new URL("../client/game.ts",import.meta.url),"utf8");
const tree=ts.createSourceFile("game.ts",source,ts.ScriptTarget.Latest,true);
const gameClass=tree.statements.find((n):n is ts.ClassDeclaration=>ts.isClassDeclaration(n)&&n.name?.text==="Game")!;
const method=(name:string)=>gameClass.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(tree)===name)!;
const flush=()=>new Promise<void>(r=>setTimeout(r,0));
function fixture(t:TestContext){
  const engine=new NullEngine(),scene=new Scene(engine),camera=new FreeCamera("camera",new Vector3(0,1,-5),scene);
  camera.setTarget(Vector3.Zero());const material=new StandardMaterial("receiver",scene),mesh=MeshBuilder.CreateBox("receiver mesh",{},scene);mesh.material=material;
  new HemisphericLight("sky",Vector3.Up(),scene);const point=new PointLight("vehicle",Vector3.Up(),scene);point.setEnabled(false);
  const stable=new StableLightState(scene);stable.update();scene.render();scene.render();
  const profiles:(MeshDrawProfile & {closed:boolean})[]=[];
  class OwnedProfile extends MeshDrawProfile {closed=false;constructor(s:Scene){assert.equal(s,scene);super(s);profiles.push(this);}override dispose(){this.closed=true;super.dispose();}}
  let recording=true,now=0,eventFailure=false;const events:{kind:string;data:any}[]=[],order:string[]=[];
  const routineProfiles:ReturnType<typeof createMaterialRoutineProfile>[]=[];
  const noop=()=>{},disposable=()=>({dispose:noop});
  const globals={createMaterialRoutineProfile:()=>{const p=createMaterialRoutineProfile();routineProfiles.push(p);return p;},performance:{now:()=>now},innerWidth:100,innerHeight:50,structuredClone,MeshDrawProfile:OwnedProfile,MESH_DRAW_PROFILE_SCOPE,BenchmarkRenderProfile,BENCHMARK_RENDER_CPU_SCOPE,
    sessionDiagnostics:{get isRecording(){return recording;},event:(kind:string,data:any)=>{if(eventFailure&&kind.startsWith("light-switch"))throw new Error("logger unavailable");events.push({kind,data});}},
    window:{removeEventListener:noop},document:{removeEventListener:noop,pointerLockElement:null,exitPointerLock:noop},snapshotBenchmarkDiagnostics:(d:any)=>d,getRendererInfo:()=>({}),PARKING_SLOTS:[],captureModelReview:()=>({}),captureRenderCostInventory:()=>({})};
  const methods=["stopRoutineProfile","startBenchmark","beginLightSwitchFrame","endLightSwitchFrame","stopLightSwitchProfile","handleRendererFailure","dispose"].map(n=>method(n).getText(tree)).join("\n");
  const Subject=vm.runInNewContext(ts.transpileModule(`class Subject {${methods}};Subject`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,globals);
  const game:any=Object.assign(new Subject(),{ready:true,disposed:false,rendererFailed:false,engine:{isWebGPU:true,getRenderWidth:()=>100,getRenderHeight:()=>50,stopRenderLoop:noop,dispose:noop},scene,camera,
    compilationProfile:{snapshot:()=>({})},renderHealth:{rendererId:1,snapshot:()=>({valid:true,generation:1}),dispose:noop},startupAbort:new AbortController(),avatars:new Map(),actor:{position:{x:0,y:0,z:0},vehicle:false},yaw:0,pitch:0,quality:"low",adaptive:{state:{quality:"low"}},
    renderErrorCount:0,assetLoadErrorCount:0,canvas:{removeEventListener:noop},disposeStartupAssets:noop,resetDiagnosticContext:noop,blur:noop,notice:noop,
    stableLights:stable,gltfLightBudget:{prepareFrame:()=>order.push("budget"),dispose:noop},enabledMeshCandidates:disposable(),labels:disposable(),contactShadows:disposable(),instrumentation:{dispose:noop,drawCallsCounter:{current:0}},engineInstrumentation:disposable(),skyWeather:disposable(),avatarPool:disposable()});
  const update=stable.update.bind(stable);stable.update=()=>{order.push("stable");update();};
  const render=scene.render.bind(scene);scene.render=()=>{order.push("render");render();};
  const frame=method("frame").getText(tree),start=frame.indexOf("    this.benchmark?.profile.beginFrame();"),end=frame.indexOf("    const renderEnded = performance.now();",start);
  assert.ok(start>=0&&end>start);const drawBody=frame.slice(start,end);
  // Exact native draw block: actual StableLightState and Scene.render, no copied
  // scheduling algorithm. Physics/avatar/HUD outside this boundary are not run.
  const draw=vm.runInNewContext(ts.transpileModule(`(function(){${drawBody}})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,globals);
  const completions:ts.IfStatement[]=[];const find=(n:ts.Node)=>{if(ts.isIfStatement(n)&&n.expression.getText(tree)==="performance.now() - b.start >= 10000")completions.push(n);ts.forEachChild(n,find);};find(method("frame"));assert.equal(completions.length,1);
  const completion=completions[0].thenStatement.getText(tree).replaceAll("import.meta.env.VITE_SOURCE_SNAPSHOT_ID",'"test-snapshot"');
  const finish=vm.runInNewContext(ts.transpileModule(`(function(){const b=this.benchmark,pos=this.actor.position,mainPassTiming={ms:null,scope:"main-render-pass-only"};${completion}})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,globals);
  const observerCount=()=>mesh.onBeforeRenderObservable.observers.length,baseline=observerCount();
  t.after(()=>{game.stopLightSwitchProfile(game.benchmark?.lightSwitch,"test-cleanup");game.benchmark?.profile.dispose();stable.dispose();scene.dispose();engine.dispose();});
  return {game,scene,mesh,material,point,profiles,routineProfiles,events,order,baseline,observerCount,draw:()=>draw.call(game),finish:()=>{now=10000;game.benchmark.frames=[16];finish.call(game);},record:(v:boolean)=>{recording=v;},failEvents:()=>{eventFailure=true;},samples:()=>events.filter(e=>e.kind==="light-switch-mesh-sample")};
}

test("actual native draw samples final membership/vehicle once, idle and unchanged frames do not sample",async t=>{
  const x=fixture(t);for(let i=0;i<3;i++){x.draw();await flush();}assert.equal(x.profiles.length,0);assert.equal(x.game.startBenchmark(),true);x.draw();
  assert.equal(x.samples().length,1);assert.equal(x.samples()[0].data.timing.reason,"initial");assert.ok(x.samples()[0].data.timing.completed.calls>0);
  const begin=x.profiles[0].beginFrame.bind(x.profiles[0]);x.profiles[0].beginFrame=(reason)=>{x.order.push("sample");begin(reason);};x.order.length=0;
  x.game.actor.vehicle=true;x.point.setEnabled(true);const before=x.game.stableLights.stats.revisions;x.draw();
  assert.deepEqual(x.order,["budget","stable","sample","render"]);const event=x.samples()[1].data;
  assert.equal(event.timing.reason,"vehicle-entry+light-revision");assert.equal(event.vehicleBefore,false);assert.equal(event.vehicle,true);assert.equal(event.revisionBefore,before);assert.equal(event.revision,before+1);assert.equal(event.enabledLights,2);
  x.draw();assert.equal(x.samples().length,2);x.game.actor.vehicle=false;x.draw();assert.equal(x.samples().length,2);
  x.game.actor.vehicle=true;x.draw();assert.equal(x.samples()[2].data.timing.reason,"vehicle-entry");
});

test("eight attempts detach observers; later changed baselines count omissions only once",async t=>{
  const x=fixture(t);x.game.startBenchmark();x.draw();for(let i=0;i<7;i++){x.point.setEnabled(!x.point.isEnabled());x.draw();}
  const state=x.game.benchmark.lightSwitch;assert.equal(state.attempts,8);assert.equal(state.samples,8);assert.equal(x.profiles[0].closed,true);assert.equal(state.meshDraw,undefined);
  await flush();assert.equal(x.observerCount(),x.baseline);x.point.setEnabled(!x.point.isEnabled());x.draw();x.draw();assert.equal(state.omitted,1);
  x.game.actor.vehicle=true;x.draw();x.draw();assert.equal(state.omitted,2);assert.equal(x.samples().length,8);x.game.stopLightSwitchProfile(state,"done");
  const summary=x.events.at(-1)!.data;assert.equal(summary.omitted,2);assert.equal(summary.samples,8);assert.equal(summary.errors,0);
});

test("gating keeps ordinary/WebGL/nonlocal and retired games without mesh observers",t=>{
  const x=fixture(t);x.record(false);x.game.startBenchmark();x.draw();x.record(true);x.game.engine.isWebGPU=false;x.game.startBenchmark();x.draw();assert.equal(x.profiles.length,0);
  x.game.engine.isWebGPU=true;for(const key of ["disposed","rendererFailed"]){x.game[key]=true;assert.equal(x.game.startBenchmark(),false);x.game[key]=false;}x.game.ready=false;assert.equal(x.game.startBenchmark(),false);assert.equal(x.profiles.length,0);
});

test("restart and actual benchmark completion close old ownership before callback/restart",async t=>{
  const x=fixture(t);x.game.startBenchmark();const old=x.game.benchmark.lightSwitch;x.draw();x.game.startBenchmark();assert.equal(old.closed,true);x.game.stopLightSwitchProfile(old,"stale");assert.equal(x.profiles[1].closed,false);
  let callbacks=0;x.game.onBenchmark=(value:any)=>{callbacks++;assert.equal(value.frames,1);assert.equal(value.frameIntervalsMs[0],16);assert.equal(x.profiles[1].closed,true);x.game.startBenchmark();};x.finish();assert.equal(callbacks,1);assert.equal(x.profiles[2].closed,false);
  x.record(false);x.draw();assert.equal(x.profiles[2].closed,true);await flush();assert.equal(x.observerCount(),x.baseline);
});

for(const end of ["fault","dispose"] as const)test(`actual native ${end} closes observer window once`,async t=>{
  const x=fixture(t);x.game.startBenchmark();x.draw();const state=x.game.benchmark.lightSwitch;
  if(end==="fault"){x.game.handleRendererFailure("fault");x.game.handleRendererFailure("repeat");}else{x.game.dispose();x.game.dispose();}
  assert.equal(state.closed,true);assert.equal(x.profiles[0].closed,true);assert.equal(x.events.filter(e=>e.kind==="light-switch-mesh-summary").length,1);await flush();assert.equal(x.observerCount(),x.baseline);
});

test("diagnostic start/end/export/cleanup errors cannot prevent draw or replace original renderer error",t=>{
  for(const stage of ["begin","end","event","render"]){
    const x=fixture(t);x.game.startBenchmark();const state=x.game.benchmark.lightSwitch,p=x.profiles[0],failure=new Error("original renderer error");
    if(stage==="begin")p.beginFrame=()=>{throw new Error("begin");};
    if(stage==="end")p.endFrame=()=>{throw new Error("end");};
    if(stage==="event")x.failEvents();
    if(stage==="render"){
      x.scene.render=()=>{throw failure;};const dispose=p.dispose.bind(p);p.dispose=()=>{dispose();throw new Error("cleanup");};x.failEvents();
      assert.throws(()=>x.draw(),error=>error===failure);
    }else{assert.doesNotThrow(()=>x.draw());assert.equal(x.order.filter(k=>k==="render").length,1);}
    assert.equal(state.closed,true);assert.ok(state.errors>=1);assert.equal(p.closed,true);
  }
});

test("all eight separate actual samples survive native recorder sanitization/collector limits",async t=>{
  const x=fixture(t);const posts:any[]=[];let now=100;const env:DiagnosticsEnvironment={hostname:"localhost",now:()=>now,wallNow:()=>1_700_000_000_000+now,makeSessionId:()=>"0b8c490b-1740-4aba-8a1c-f36d0b28108a",setInterval:()=>1,clearInterval:()=>{},fetch:(async(url,init)=>{
    if(String(url).endsWith("/status"))return new Response(JSON.stringify({enabled:true,schemaVersion:1,sourceId:"abc",source:{gitHead:"test",dirty:true}}));
    const batch=JSON.parse(String(init?.body));assert.ok(validateDiagnosticsBatch(batch));posts.push(batch);return new Response(JSON.stringify({saved:true,sessionId:batch.sessionId,batchId:batch.batchId,savedAt:new Date().toISOString()}));
  }) as typeof fetch};const recorder=new SessionDiagnostics(env);recorder.start();await recorder.flush();
  const unusual="token=a "+"🌳\u0001".repeat(40);x.mesh.name=unusual;x.mesh.metadata={sourcePack:unusual};x.material.name=unusual;
  // Real profile top-eight dimensions, actual render and eight distinct events.
  for(let i=0;i<8;i++){const m=MeshBuilder.CreateBox("receiver"+i+" "+unusual,{},x.scene);m.position.x=(i-4)*0.15;m.metadata={sourcePack:String(i)+" "+unusual};const mat=new StandardMaterial(String(i)+" "+unusual,x.scene);m.material=mat;}
  for(let i=0;i<3;i++){x.scene.render();await flush();}x.game.startBenchmark();x.draw();for(let i=0;i<7;i++){x.point.setEnabled(!x.point.isEnabled());x.draw();}x.game.stopLightSwitchProfile(x.game.benchmark.lightSwitch,"end");
  // VM extraction creates another realm's Object prototype; production Game and
  // recorder share one realm. Normalize only this test adapter's JSON boundary.
  const exported=x.events.filter(e=>e.kind.startsWith("light-switch"));assert.equal(exported.length,9);for(const e of exported)recorder.event(e.kind,JSON.parse(JSON.stringify(e.data)));now+=2000;await recorder.flush();
  const records=posts.flatMap(p=>p.records).filter(r=>r.kind.startsWith("light-switch"));assert.equal(records.length,9);assert.equal(recorder.status().dropped,0);
  for(const r of records){assert.ok(diagnosticsByteLength(r)<MAX_DIAGNOSTICS_RECORD_BYTES);assert.equal(JSON.stringify(r).includes("token=a"),false);}
  const sample=records.find(r=>r.kind==="light-switch-mesh-sample");assert.equal(sample.data.timing.topMeshes.length,8);assert.equal(sample.data.timing.topMaterials.length,8);assert.equal(sample.data.timing.topSources.length,8);assert.equal(sample.data.callTiming.rows.length,8);assert.ok("abandoned" in sample.data.timing.counts);assert.ok("meshes" in sample.data.timing.omitted);recorder.dispose();
});


test("actual Game sample includes eight selected routines and callback sees restored prototype",t=>{const x=fixture(t),original=StandardMaterial.prototype.isReadyForSubMesh;x.game.startBenchmark();assert.notEqual(StandardMaterial.prototype.isReadyForSubMesh,original);x.draw();const sample=x.samples()[0].data.callTiming;assert.equal(sample.rows.length,8);assert.equal(sample.errors,0);assert.equal(sample.depthSkipped,0);assert.ok(sample.rows.find((r:any)=>r.id==="StandardMaterial.isReadyForSubMesh").calls>0);x.game.onBenchmark=()=>assert.equal(StandardMaterial.prototype.isReadyForSubMesh,original);x.finish();assert.equal(StandardMaterial.prototype.isReadyForSubMesh,original);});
test("actual Game eight-sample retirement and stale restart preserve new prototype owner",t=>{const x=fixture(t),original=StandardMaterial.prototype.isReadyForSubMesh;x.game.startBenchmark();const old=x.game.benchmark.lightSwitch;x.game.startBenchmark();const current=StandardMaterial.prototype.isReadyForSubMesh;x.game.stopLightSwitchProfile(old,"stale");assert.equal(StandardMaterial.prototype.isReadyForSubMesh,current);x.draw();for(let i=0;i<7;i++){x.point.setEnabled(!x.point.isEnabled());x.draw();}assert.equal(x.game.benchmark.lightSwitch.routines,undefined);assert.equal(StandardMaterial.prototype.isReadyForSubMesh,original);assert.deepEqual(x.game.benchmark.lightSwitch.routineCleanup,{errors:0,restoreConflicts:0});});
test("actual Game original render exception restores selected routine methods",t=>{const x=fixture(t),original=StandardMaterial.prototype.isReadyForSubMesh;x.game.startBenchmark();const error=new Error("original draw");x.scene.render=()=>{throw error;};assert.throws(()=>x.draw(),e=>e===error);assert.equal(StandardMaterial.prototype.isReadyForSubMesh,original);assert.equal(x.game.benchmark.lightSwitch.routines,undefined);});
