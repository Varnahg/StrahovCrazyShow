import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { fixture } from "./tests/fixture";

const descriptor = Object.getOwnPropertyDescriptor(MaterialDefines.prototype, "toString")!;
let calls = 0;
Object.defineProperty(MaterialDefines.prototype, "toString", { ...descriptor, value: function(this: MaterialDefines) { calls++; return Reflect.apply(descriptor.value, this, []); } });
async function run(lease: boolean) {
  const f = fixture(lease);
  try {
    for (let i=0;i<160;i++) { const mesh=f.box("fixture"+i,(i%16)*10,i%2===0); mesh.position.z=Math.floor(i/16)*1.2; }
    await f.warm();
    const preparationStarted=performance.now();f.policy?.prepareStaticReceivers();const eligibilityPreparationMs=performance.now()-preparationStarted;
    f.policy?.setPolicyEnabled(true);
    const programsAfterWarm=f.engine.programs;
    const stages: {reason:string;gateMs:number;frameCpuMs:number;serializers:number;programs:number;stats:unknown}[]=[];
    for (const [reason,x] of [["activation",0],["lease-boundary1",8.1],["lease-boundary2",16.2]] as const) {
      calls=0;const started=performance.now();f.light.position.x=x;
      if(reason==="activation")f.light.setEnabled(true);
      f.gate();const gated=performance.now();f.scene.render();const ended=performance.now();
      stages.push({reason,gateMs:gated-started,frameCpuMs:ended-started,serializers:calls,programs:f.engine.programs-programsAfterWarm,stats:f.policy?{...f.policy.receiverStats}:null});
    }
    const before=f.policy?{...f.policy.receiverStats}:null;
    const started=performance.now();for(let i=0;i<200;i++){f.light.position.x=16.2+i/100;f.gate();}const steadyGateMs=performance.now()-started;
    if(f.policy){assert.equal(f.policy.receiverStats.fullMeshVisits,before!.fullMeshVisits);assert.equal(f.policy.receiverStats.recordVisits,before!.recordVisits);}
    assert.ok(stages.every(stage=>stage.programs===0),"This replay requires original global ON/OFF preparation");
    return {lease,meshes:160,eligibilityPreparationMs,stages,steady:{gates:200,totalGateMs:steadyGateMs,perGateMs:steadyGateMs/200,fullMeshVisitsDelta:f.policy?f.policy.receiverStats.fullMeshVisits-before!.fullMeshVisits:0,recordVisitsDelta:f.policy?f.policy.receiverStats.recordVisits-before!.recordVisits:0},scope:"Single short CPU/NullEngine WGSL replay, instrumented serializer counts; no statistical/GPU/FPS inference"};
  } finally {f.dispose();}
}
try {
  const reference=await run(false),lease=await run(true);
  assert.ok(lease.stages[0].serializers<reference.stages[0].serializers);
  const report={reference,lease,limitations:["Whole conservative static eligibility and bounds require explicit mutation invalidation","Movement boundaries add membership work absent in stock; report those costs, not only activation savings","Original global prewarm is preserved and all replay stages add zero programs; this does not prove production completeness"]};
  if(!process.env.LEASE_REPLAY_REPORT)throw new Error("Explicit output path required");
  writeFileSync(process.env.LEASE_REPLAY_REPORT,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify(report));
} finally {Object.defineProperty(MaterialDefines.prototype,"toString",descriptor);}
