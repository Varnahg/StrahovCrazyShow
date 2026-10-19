import test, {type TestContext} from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Light } from "@babylonjs/core/Lights/light";
import { GltfLightBudget } from "../client/gltf-light-budget";
import { CarReceiverLeaseLight } from "../client/qa-receiver-lease";
import { ReceiverLeaseInputs } from "../client/qa-receiver-lease-inputs";

function fixture(t:TestContext) {
  const engine=new NullEngine(),scene=new Scene(engine),sky=new HemisphericLight("sky",Vector3.Up(),scene);
  const light=new CarReceiverLeaseLight("car",Vector3.Zero(),Vector3.Forward(),0.8,2,scene);
  light.range=32;light.falloffType=Light.FALLOFF_STANDARD;light.metadata={simulatedVehicleLight:true};
  light.setEnabled(false);light.configureStockVehicleLease({kind:"vehicle",range:32,movementReserveMetres:8});
  const material=new StandardMaterial("known",scene),near=MeshBuilder.CreateBox("near",{},scene),far=MeshBuilder.CreateBox("far",{},scene);
  for(const mesh of [near,far]){mesh.material=material;mesh.metadata={artStatic:true};}
  near.position.z=5;far.position.z=90;near.computeWorldMatrix(true);far.computeWorldMatrix(true);
  const actualBudget=new GltfLightBudget(scene),budget={stats:{...actualBudget.stats}};
  const inputs=new ReceiverLeaseInputs(scene,light,budget);
  t.after(()=>{inputs.dispose();actualBudget.dispose();scene.dispose();engine.dispose();});
  return{engine,scene,sky,light,material,near,far,budget,inputs};
}

test("observed material replacement restores a far custom receiver before the next draw",t=>{
  const x=fixture(t);assert.equal(x.light.canAffectMesh(x.far),true,"policy starts off through prewarm");
  x.inputs.prepareFrame("low");x.light.setEnabled(true);x.inputs.prepareFrame("low");
  assert.equal(x.light.canAffectMesh(x.far),false);assert.equal(x.light.canAffectMesh(x.near),true);
  const custom=new ShaderMaterial("custom",x.scene,{vertex:"default",fragment:"default"},{});
  x.far.material=custom;x.inputs.prepareFrame("low");
  assert.equal(x.light.canAffectMesh(x.far),true,"unknown custom material keeps original membership");
  assert.ok(x.inputs.stats.materialInvalidations>0);assert.ok(x.far.lightSources.includes(x.light));
  x.far.material=x.material;x.inputs.prepareFrame("low");assert.equal(x.light.canAffectMesh(x.far),false);
});

test("loader and invalid-cap gates suspend the lease without limiting prewarm coverage",t=>{
  const x=fixture(t);x.inputs.prepareFrame("low");x.light.setEnabled(true);x.inputs.prepareFrame("low");
  assert.equal(x.light.canAffectMesh(x.far),false);
  x.budget.stats.loaderStarts++;x.budget.stats.activeLoaders=1;x.inputs.prepareFrame("low");
  assert.equal(x.light.canAffectMesh(x.far),true);assert.ok(x.far.lightSources.includes(x.light));
  x.budget.stats.activeLoaders=0;x.inputs.prepareFrame("low");assert.equal(x.light.canAffectMesh(x.far),false);
  x.budget.stats.invalidBudgetVisits++;x.inputs.prepareFrame("low");assert.equal(x.light.canAffectMesh(x.far),true);
  x.inputs.prepareFrame("low");assert.equal(x.light.canAffectMesh(x.far),false,"stable valid next gate can rebuild");
  x.inputs.prepareFrame("high",true);assert.equal(x.light.canAffectMesh(x.far),true,"full preparation bypass");
});

test("same-count topology changes and other light membership invalidate before drawing, dispose restores stock",async t=>{
  const x=fixture(t);x.inputs.prepareFrame("low");x.light.setEnabled(true);x.inputs.prepareFrame("low");
  x.sky.setEnabled(false);x.inputs.prepareFrame("low");assert.ok(x.inputs.stats.lightInvalidations>0);
  x.scene.removeMesh(x.far);const replacement=MeshBuilder.CreateBox("replacement",{},x.scene);
  replacement.position.z=90;replacement.material=x.material;replacement.metadata={artStatic:true};replacement.computeWorldMatrix(true);
  await new Promise(resolve=>setTimeout(resolve,0));x.inputs.prepareFrame("low");
  assert.ok(x.inputs.stats.topologyInvalidations>0);assert.equal(x.light.canAffectMesh(replacement),false);
  x.inputs.dispose();x.inputs.dispose();assert.equal(x.light.canAffectMesh(replacement),true);
  const before={...x.inputs.stats};replacement.material=new StandardMaterial("after-dispose",x.scene);x.sky.setEnabled(true);
  assert.deepEqual(x.inputs.stats,before,"disposed coordinator retains no active callbacks");
});
