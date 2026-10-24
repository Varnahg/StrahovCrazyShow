import test from "node:test";
import assert from "node:assert/strict";
import {probe,writeProbe} from "./fixtures/receiver-stage-chain/probe";

for(const storage of ["native-null-mono","webgpu-perpass-branch"] as const)test(`original receiver stage chain / ${storage}`,async()=>{
  const report=await probe(storage);writeProbe(report,storage);
  assert.equal(report.actualEngineIsWebGPU,false);assert.equal(report.gameRoutingIsWebGPU,true);
  assert.equal(report.preparation.status,"complete");assert.equal(report.preparation.stages.length,76);
  assert.deepEqual(report.preparation.qualities.map((x:any)=>x.quality),["low","medium","high","medium"]);
  assert.equal(report.factory.targets.length,4);assert.equal(report.factory.targets.filter((x:any)=>x.name==="b6 shared asset sink").length,3);
  assert.equal(report.stages.length,76);assert.equal(report.uniqueStageCount,57);assert.equal(report.replays.length,8);
  assert.equal(report.restored.quality,"medium");assert.equal(report.restored.selection,null);
  for(const family of report.restored.families)for(const instance of family.instances){
    assert.equal(instance.always,false,"owned alwaysSelect flag restored");
    if(family.decl==="b6-prop-source"){assert.equal(instance.attached,false);assert.equal(instance.registered,false);assert.equal(instance.enabled,false);}
  }
  for(const effect of report.effectsAfterDeferred){assert.equal(effect.disposed,false);assert.equal(effect.cacheSame,true);}
  for(const view of report.frontViews){
    const drawn=new Set(view.frames.flatMap((frame:any)=>frame.families.filter((f:any)=>f.batch.some((b:any)=>b.hardware&&b.visibleInstances?.length)).map((f:any)=>f.source)));
    for(const source of view.expectedSources)assert.ok(drawn.has(source),`${storage}/${view.view}/${view.quality}/${view.on}: diagnostic front view must actually draw target source ${source}`);
  }
  for(const view of ["sink-front","road-front"])for(const quality of ["low","medium"]){
    const rows=report.frontViews.filter((r:any)=>r.view===view&&r.quality===quality);
    assert.deepEqual(rows.map((r:any)=>r.on),[false,true,false,true]);
    for(const index of [2,3]){
      assert.equal(rows[index].newPrograms,0,"repeat actual drawn state reuses native GLSL programs");
      const prior=rows[index-2].frames.at(-1),current=rows[index].frames.at(-1);
      for(const id of rows[index].expectedSources){
        const a=prior.families.find((f:any)=>f.source===id),b=current.families.find((f:any)=>f.source===id);
        assert.equal(b.keySha,a.keySha);assert.equal(b.defines,a.defines);assert.equal(b.effectId,a.effectId);assert.equal(b.contextId,a.contextId);
      }
    }
  }
  // A behavioral coverage assertion, not a recipe guessed from the implementation.
  for(const row of report.stages.filter((x:any)=>x.stage.startsWith("vehicle-")))for(const family of row.families){
    assert.ok(family.batch.some((b:any)=>b.hardware&&b.visibleInstances?.length),`${storage}/${row.quality}/${row.stage}/${family.material}: declared receiver must reach original native instance batch`);
  }
});
