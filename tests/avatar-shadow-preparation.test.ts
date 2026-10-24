import test from "node:test";
import assert from "node:assert/strict";
import {probe,writeReport,withRenderPass} from "./fixtures/avatar-shadow-preparation/probe";
import {setImmediate as turn} from "node:timers/promises";
import {localPreparation} from "./fixtures/avatar-shadow-preparation/local-preparation";

test("OFF update prepares actual own shadow before the first main base frame",async t=>{
  const f=localPreparation(t),pass=f.engine.currentRenderPassId;
  for(let i=0;i<8;i++){f.torch.update(f.rig,f.camera,false,false,"low");await turn();}
  const generator=f.torch.beam.light.getShadowGenerator();assert.ok(generator,"OFF preparation creates the player-owned native generator");
  const map=generator.getShadowMap()!;
  assert.equal(f.engine.currentRenderPassId,pass);assert.equal(f.torch.beam.light.isEnabled(),false);assert.equal(f.torch.beam.light.intensity,0);assert.equal(f.torch.beam.light.shadowEnabled,false);
  for(const mesh of f.rig.skinnedBody!.near){
    const sub=mesh.subMeshes[0] as any;
    assert.equal(sub._drawWrappers?.[f.camera.renderPassId]?.effect??null,null,"no PBR readiness/base render warmed the test");
    assert.ok(sub._drawWrappers?.[map.renderPassId]?.effect,"actual current shadow pass was prepared while OFF");
  }
});

for(const boneTexture of [false,true])for(const targeted of [false,true])test(`actual edit OFF shadow preparation / ${boneTexture?"bone-texture caps":"default Null caps"} / ${targeted?"targeted experiment":"current lazy flow"}`,async()=>{
  const r=await probe(targeted,boneTexture);writeReport(r);
  assert.equal(r.actualEngineIsWebGPU,false);assert.equal(r.miaOn.preset,4);assert.equal(r.beforeFirstOn.preset,1);
  assert.equal(r.edit.oldRootDisposed,true);assert.notEqual(r.edit.oldRoot,r.edit.newRoot);assert.equal(r.edit.sameGenerator,true);
  assert.ok(r.beforeFirstOn.near.every((m:any)=>m.registered&&m.enabled&&m.influencers===4&&!m.shadowDepthWrapper));
  assert.ok(r.beforeFirstOn.near.every((m:any)=>m.submeshes.every((s:any)=>s.main!==null&&s.shadow!==null)),"original production OFF update prepares the new shadow pass without manual observation warming");
  assert.equal(r.beforeFirstOn.torchEnabled,false);
  assert.ok(r.beforeFirstOn.near.every((m:any)=>m.boneTextureRequested===true&&m.boneTextureUsed===boneTexture),"native Skeleton selects only the declared capability branch");
  const oldEffects=new Map<number,any>(r.miaOn.near.flatMap((m:any)=>m.submeshes.map((s:any)=>[s.shadow.id,s.shadow])));
  assert.equal(oldEffects.size,1,"three original near meshes share the native shadow recipe");
  for(const [effectId]of oldEffects){
    const before=r.beforeEditLifecycle.find((e:any)=>e.effectId===effectId),after=r.afterEditLifecycle.find((e:any)=>e.effectId===effectId);
    assert.equal(before.refCount,3);assert.equal(before.cacheSame,true);
    if(after.disposed){assert.equal(after.refCount,0);assert.equal(after.cacheSame,false);}
    else {
      const actualNewReferences=r.beforeFirstOn.near.flatMap((m:any)=>m.submeshes).filter((s:any)=>s.shadow?.id===effectId).length;
      assert.equal(actualNewReferences,3,"only real new-rig shadow slots keep the shared native Effect alive");
      assert.equal(after.refCount,3);assert.equal(after.cacheSame,true);
    }
  }
  const drawn=new Set(r.firstOn.draws.filter((d:any)=>d.pass===r.firstOn.pass).map((d:any)=>d.mesh));
  assert.ok(r.firstOn.near.every((m:any)=>drawn.has(m.id)),"actual first torch pass must draw every own near skinned mesh");
  assert.equal(r.repeatOn.newShadowPrograms,0);
  for(const mesh of r.firstOn.near)for(const sub of mesh.submeshes){
    assert.equal(sub.shadow.keySha,[...oldEffects.values()][0].keySha,"new rig requests the same full native shadow key");
    assert.equal(sub.shadow.disposed,false);assert.equal(sub.shadow.cacheSame,true);
  }
  if(targeted){assert.equal(r.targeted.savedPass,r.targeted.restoredPass);assert.equal(r.targeted.lightEnabledBefore,false);assert.equal(r.targeted.lightEnabledAfter,false);}
  assert.equal(r.firstOn.newShadowPrograms,0,"desired coverage: first torch after the normal OFF edit must require no new native shadow program");
});

test("targeted pass scope restores the original pass and falsy rejection",async()=>{
  const engine={currentRenderPassId:7};
  await assert.rejects(withRenderPass(engine,19,async()=>{assert.equal(engine.currentRenderPassId,19);throw undefined;}),value=>value===undefined);
  assert.equal(engine.currentRenderPassId,7);
});
