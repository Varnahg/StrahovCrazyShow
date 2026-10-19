import test from "node:test";
import assert from "node:assert/strict";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Animation } from "@babylonjs/core/Animations/animation";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { fixture } from "./fixture";

test("default bypass preserves global prewarm; OFF→ON and two movement boundaries readmit before range entry", async t => {
  const f = fixture(); t.after(f.dispose);
  const near = f.box("near", 2), far = f.box("first boundary", 45, true), second = f.box("second boundary", 55);
  await f.warm(); assert.equal(f.policy!.receiverStats.fullMeshVisits, 0);
  f.light.setEnabled(true); await f.render();
  assert.ok(far.lightSources.includes(f.light)); assert.ok(second.lightSources.includes(f.light));
  f.light.setEnabled(false); await f.render();
  f.policy!.prepareStaticReceivers();
  const capturedVisits=f.policy!.receiverStats.fullMeshVisits;
  f.policy!.setPolicyEnabled(true); f.light.setEnabled(true); f.gate();
  assert.equal(f.policy!.receiverStats.fullMeshVisits,capturedVisits);
  assert.throws(()=>f.policy!.prepareStaticReceivers(),/explicit policy bypass/);
  assert.ok(near.lightSources.includes(f.light)); assert.ok(!far.lightSources.includes(f.light)); assert.ok(!second.lightSources.includes(f.light));
  assert.equal(f.policy!.receiverStats.refreshes, 1);
  const visits = f.policy!.receiverStats.fullMeshVisits, records = f.policy!.receiverStats.recordVisits;
  for (let i = 0; i < 200; i++) { f.light.position.x = i / 30; f.gate(); }
  assert.equal(f.policy!.receiverStats.fullMeshVisits, visits); assert.equal(f.policy!.receiverStats.recordVisits, records);
  f.light.position.x = 8.1; f.gate(); assert.ok(far.lightSources.includes(f.light)); assert.ok(!second.lightSources.includes(f.light));
  f.light.position.x = 16.2; f.gate(); assert.ok(second.lightSources.includes(f.light));
  assert.equal(f.policy!.receiverStats.refreshes, 3); assert.equal(f.policy!.receiverStats.rebuilds, 1);
  assert.equal(f.policy!.receiverStats.fullMeshVisits, visits);
  assert.equal(far.lightSources[0], f.light); assert.equal(second.lightSources[0], f.light); // ordering handoff consumed.
});

test("readmission reuses globally prewarmed actual PBR/Standard effects/defines with no new program", async t => {
  const f = fixture(); t.after(f.dispose); const meshes = [f.box("pbr", 45, true), f.box("standard", 55)];
  f.light.setEnabled(true); await f.render(); await f.render();
  const on = meshes.map(mesh => ({ effect: mesh.subMeshes[0].effect, defines: mesh.subMeshes[0].effect!.defines }));
  f.light.setEnabled(false); await f.render();
  f.policy!.setPolicyEnabled(true); f.light.setEnabled(true); await f.render();
  assert.ok(meshes.every(mesh => !mesh.lightSources.includes(f.light)));
  const programs = f.engine.programs;
  for (const x of [8.1, 16.2]) { f.light.position.x = x; await f.render(); }
  meshes.forEach((mesh, i) => { assert.equal(mesh.subMeshes[0].effect, on[i].effect); assert.equal(mesh.subMeshes[0].effect!.defines, on[i].defines); assert.ok(mesh.subMeshes[0].effect!.isReady()); });
  assert.equal(f.engine.programs, programs);
});

test("whole bounds, counterfactual cap, external masks/lists and unknown/deformed/instances retain native behavior", t => {
  const f = fixture(); t.after(f.dispose);
  const large = f.box("large intersects lease", 60, false, 50), cap = f.box("cap", 100), wind = f.box("wind", 100), unknown = f.box("unknown", 100), source = f.box("instance source", 100);
  (cap.material as StandardMaterial).maxSimultaneousLights = 1;
  wind.metadata.windDeformed = true; unknown.metadata = {}; source.createInstance("instance");
  const externallyExcluded = f.box("external exclusion", 100); const exclusions = [externallyExcluded]; f.light.excludedMeshes = exclusions;
  const masked = f.box("masked", 100); masked.layerMask = 2; f.light.includeOnlyWithLayerMask = 1;
  for (const mesh of [large,cap,wind,unknown,source,externallyExcluded]) mesh.layerMask = 1;
  f.policy!.setPolicyEnabled(true); f.light.setEnabled(true); f.gate();
  for (const mesh of [large, cap, wind, unknown, source]) assert.ok(mesh.lightSources.includes(f.light), mesh.name);
  assert.ok(!externallyExcluded.lightSources.includes(f.light)); assert.ok(!masked.lightSources.includes(f.light));
  assert.equal(f.light.excludedMeshes, exclusions); assert.equal(exclusions.length, 1); assert.equal(exclusions[0], externallyExcluded);
});

test("explicit caps/lights invalidation prevents promotion; material/frozen changes rebuild before draw", t => {
  const f = fixture(); t.after(f.dispose); const far = f.box("far", 100);
  f.policy!.setPolicyEnabled(true); f.light.setEnabled(true); f.gate(); assert.ok(!far.lightSources.includes(f.light));
  (far.material as StandardMaterial).maxSimultaneousLights = 1;
  f.policy!.invalidate("caps"); f.gate(); assert.ok(far.lightSources.includes(f.light));
  (far.material as StandardMaterial).maxSimultaneousLights = 4; f.policy!.invalidate("caps"); f.gate(); assert.ok(!far.lightSources.includes(f.light));
  const extras = [0,1,2].map(i => new PointLight("extra"+i, Vector3.Zero(), f.scene));
  f.policy!.invalidate("light-membership"); f.gate(); assert.ok(far.lightSources.includes(f.light));
  extras.forEach(light => light.setEnabled(false)); f.policy!.invalidate("light-membership"); f.gate(); assert.ok(!far.lightSources.includes(f.light));
  far.material!.freeze(); f.policy!.invalidate("material"); f.gate(); assert.ok(far.lightSources.includes(f.light));
  far.material!.unfreeze(); f.policy!.invalidate("material"); f.gate(); assert.ok(!far.lightSources.includes(f.light));
});

test("explicit bounds/geometry/animation/topology invalidation updates cached proof; movement alone does not rescan", t => {
  const f = fixture(); t.after(f.dispose); const far = f.box("far", 100);
  f.policy!.setPolicyEnabled(true); f.light.setEnabled(true); f.gate(); assert.ok(!far.lightSources.includes(f.light));
  far.position.x = 1; f.policy!.invalidate("bounds-transform"); f.gate(); assert.ok(far.lightSources.includes(f.light));
  far.position.x = 100; f.policy!.invalidate("bounds-transform"); f.gate(); assert.ok(!far.lightSources.includes(f.light));
  far.animations.push(new Animation("move", "position.x", 30, Animation.ANIMATIONTYPE_FLOAT));
  f.policy!.invalidate("animation-deformation"); f.gate(); assert.ok(far.lightSources.includes(f.light));
  far.animations.length = 0; f.policy!.invalidate("animation-deformation"); f.gate(); assert.ok(!far.lightSources.includes(f.light));
  const added = f.box("added", 100); f.policy!.invalidate("topology"); f.gate(); assert.ok(!added.lightSources.includes(f.light));
  added.thinInstanceSetBuffer("matrix", new Float32Array(Matrix.Identity().asArray()), 16);
  assert.equal(added.hasThinInstances, true);
  f.policy!.invalidate("geometry"); f.gate(); assert.ok(added.lightSources.includes(f.light));
});

test("the policy is not a readiness provider: omitting original ON prewarm still creates programs", async t => {
  const f = fixture(); t.after(f.dispose); f.box("near", 1, true); await f.render(); await f.render();
  const before = f.engine.programs;
  f.policy!.setPolicyEnabled(true); f.light.setEnabled(true); await f.render(); await f.render();
  assert.ok(f.engine.programs > before, "Caller must preserve and prove the original complete prewarm separately");
});

test("OFF does not scan; bypass restores original membership; detached/disposed ownership is released", t => {
  const f = fixture(); t.after(f.dispose); const far = f.box("far", 100);
  f.policy!.setPolicyEnabled(true); f.light.setEnabled(true); f.gate(); const visits = f.policy!.receiverStats.fullMeshVisits;
  f.light.setEnabled(false); for (let i=0;i<20;i++) f.gate();
  assert.equal(f.policy!.receiverStats.fullMeshVisits, visits); assert.ok(!far.lightSources.includes(f.light));
  f.light.setEnabled(true); f.gate(); f.policy!.setPolicyEnabled(false); f.gate(); assert.ok(far.lightSources.includes(f.light));
  f.policy!.setPolicyEnabled(true); f.gate(); assert.ok(!far.lightSources.includes(f.light));
  f.scene.removeMesh(far); assert.ok(far.lightSources.includes(f.light));
  f.scene.addMesh(far); f.policy!.invalidate("topology"); f.gate(); assert.ok(!far.lightSources.includes(f.light));
  far.dispose(); f.gate(); f.light.dispose(); f.policy!.dispose();
  assert.deepEqual(f.policy!.prepareReceivers(), []);
});

test("masks/lists/config invalidations and unsupported light mode fail open without changing stock properties", t => {
  const f = fixture(); t.after(f.dispose); const far = f.box("far", 100);
  f.policy!.setPolicyEnabled(true); f.light.setEnabled(true); f.gate(); assert.ok(!far.lightSources.includes(f.light));
  const lists = [far]; f.light.includedOnlyMeshes = lists; f.policy!.invalidate("masks-lists"); f.gate();
  assert.equal(f.light.includedOnlyMeshes, lists); assert.ok(!far.lightSources.includes(f.light));
  f.light.range = 24; f.policy!.invalidate("light-configuration"); f.gate(); assert.ok(far.lightSources.includes(f.light)); assert.equal(f.light.range, 24);
  assert.throws(() => f.policy!.configureStockVehicleLease({kind:"vehicle",range:32,movementReserveMetres:0}), TypeError);
});

test("receiver policy does not mute intensity, shadow mode or the independent caster list", t => {
  const f=fixture();t.after(f.dispose);const near=f.box("near",2),far=f.box("far",100);
  f.light.intensity=1.6;f.light.shadowEnabled=true;
  const shadow=new ShadowGenerator(128,f.light);const casters=[near,far];shadow.getShadowMap()!.renderList=casters;
  f.policy!.setPolicyEnabled(true);f.light.setEnabled(true);f.gate();
  assert.equal(f.light.intensity,1.6);assert.equal(f.light.shadowEnabled,true);assert.equal(shadow.getShadowMap()!.renderList,casters);
  assert.ok(casters.includes(far));assert.ok(!far.lightSources.includes(f.light));
  f.light.setEnabled(false);f.gate();assert.equal(f.light.shadowEnabled,true);assert.equal(f.light.intensity,1.6);
});

test("material replacement is an explicit rebuild event and unknown subclasses remain native", t => {
  const f=fixture();t.after(f.dispose);const far=f.box("far",100);
  f.policy!.setPolicyEnabled(true);f.light.setEnabled(true);f.gate();assert.ok(!far.lightSources.includes(f.light));
  class UnknownMaterial extends StandardMaterial {}
  const previous=far.material;far.material=new UnknownMaterial("unknown",f.scene);
  f.policy!.invalidate("material");f.gate();assert.ok(far.lightSources.includes(f.light));
  far.material=previous;f.policy!.invalidate("material");f.gate();assert.ok(!far.lightSources.includes(f.light));
});
