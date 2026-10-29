import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import {
  RenderIncidentProfile,
  RENDER_INCIDENT_SCOPE,
} from "../client/render-incident-profile";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
function fixture(t: TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const effects: Effect[] = [];
  let time = 0;
  t.after(() => {
    for (const effect of effects) effect.dispose();
    scene.dispose();
    engine.dispose();
  });
  return {
    engine,
    scene,
    now: () => time,
    at: (value: number) => {
      time = value;
    },
    effect(defines = "") {
      const effect = new Effect(
        {
          vertexSource: "void main(){gl_Position=vec4(0.0);}",
          fragmentSource: "void main(){gl_FragColor=vec4(1.0);}",
        },
        [],
        [],
        [],
        engine,
        defines,
      );
      effects.push(effect);
      return effect;
    },
  };
}

test("incident profile composes phase timings with target identities and shader call CPU, without duplicate target observers", (t) => {
  const { engine, scene, now, at } = fixture(t);
  const outer = new ObjectRenderer("shadow-map", scene);
  const inner = new ObjectRenderer("reflection-map", scene);
  const before = outer.onInitRenderingObservable.observers.length;
  const profile = new RenderIncidentProfile(scene, now);
  t.after(() => profile.dispose());
  assert.equal(outer.onInitRenderingObservable.observers.length, before + 1);
  at(1);
  engine.onBeforeShaderCompilationObservable.notifyObservers(engine);
  at(4);
  engine.onAfterShaderCompilationObservable.notifyObservers(engine);
  profile.beginFrame();
  at(5);
  scene.onBeforeActiveMeshesEvaluationObservable.notifyObservers(scene);
  at(7);
  scene.onAfterActiveMeshesEvaluationObservable.notifyObservers(scene);
  at(10);
  outer.onInitRenderingObservable.notifyObservers(outer);
  at(12);
  inner.onInitRenderingObservable.notifyObservers(inner);
  at(16);
  inner.onFinishRenderingObservable.notifyObservers(inner);
  at(20);
  outer.onFinishRenderingObservable.notifyObservers(outer);
  at(25);
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  at(27);
  engine.onBeforeShaderCompilationObservable.notifyObservers(engine);
  at(32);
  engine.onAfterShaderCompilationObservable.notifyObservers(engine);
  at(35);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  const frame = profile.endFrame();
  assert.deepEqual(frame.cpuMs, {
    activeMeshes: 2,
    mainDraw: 10,
    renderTargets: 14,
    shaderCreation: 5,
  });
  assert.equal(frame.counters.shaderPrograms, 1);
  assert.equal(frame.cumulative.shaderPrograms, 2);
  assert.equal(frame.cumulative.shaderCreationMs, 8);
  assert.deepEqual(frame.details.slowRenderTargets, [
    { name: "shadow-map", renderPassId: outer.renderPassId, cpuMs: 10 },
    { name: "reflection-map", renderPassId: inner.renderPassId, cpuMs: 4 },
  ]);
  assert.match(RENDER_INCIDENT_SCOPE.shaderCreation, /not asynchronous GPU/);
  profile.beginFrame();
  const empty = profile.endFrame();
  assert.equal(empty.cpuMs.shaderCreation, 0);
  assert.equal(empty.cpuMs.renderTargets, 0);
  assert.equal(empty.cumulative.shaderPrograms, 2);
  assert.equal(
    frame.details.slowRenderTargets.length,
    2,
    "previous snapshot is independent of the next frame",
  );
});

test("effect notifications distinguish repeated cached effects and separate submesh bindings from actual variant changes", (t) => {
  const { scene, now, effect } = fixture(t);
  const material = new StandardMaterial("campus-concrete", scene);
  const mesh = new Mesh("fixture", scene);
  mesh.subMeshes = [];
  const firstSlot = new SubMesh(0, 0, 0, 0, 0, mesh);
  const secondSlot = new SubMesh(0, 0, 0, 0, 0, mesh);
  const firstEffect = effect("#define FIRST"),
    secondEffect = effect("#define SECOND");
  const profile = new RenderIncidentProfile(scene, now);
  t.after(() => profile.dispose());
  profile.beginFrame();
  material.onEffectCreatedObservable.notifyObservers({
    effect: firstEffect,
    subMesh: firstSlot,
  });
  material.onEffectCreatedObservable.notifyObservers({
    effect: secondEffect,
    subMesh: secondSlot,
  });
  material.onEffectCreatedObservable.notifyObservers({
    effect: firstEffect,
    subMesh: firstSlot,
  });
  material.onEffectCreatedObservable.notifyObservers({
    effect: secondEffect,
    subMesh: firstSlot,
  });
  const result = profile.endFrame();
  assert.equal(result.counters.materialEffectEvents, 4);
  assert.equal(result.counters.materialEffectChanges, 1);
  assert.equal(
    result.counters.shaderPrograms,
    0,
    "effect notifications alone cannot prove shader compilation",
  );
  assert.equal(result.details.materials.length, 1);
  assert.equal(result.details.materials[0].events, 4);
  assert.equal(
    result.details.materials[0].previousEffectId,
    firstEffect.uniqueId,
  );
  assert.equal(result.details.materials[0].effectId, secondEffect.uniqueId);
  assert.ok(!JSON.stringify(result).includes("#define"));
  assert.ok(!JSON.stringify(result).includes("gl_Position"));
  profile.beginFrame();
  material.onEffectCreatedObservable.notifyObservers({
    effect: firstEffect,
    subMesh: firstSlot,
  });
  assert.equal(profile.endFrame().counters.materialEffectChanges, 1);
  assert.equal(result.details.materials[0].events, 4);
});

test("materials added after construction are tracked incrementally and removed materials cannot reattach through deferred adds", async (t) => {
  const { scene, now, effect } = fixture(t);
  const profile = new RenderIncidentProfile(scene, now);
  t.after(() => profile.dispose());
  const material = new StandardMaterial("late-material", scene),
    compiled = effect();
  material.onEffectCreatedObservable.notifyObservers({
    effect: compiled,
    subMesh: null,
  });
  assert.equal(
    profile.endFrame().cumulative.materialEffectEvents,
    0,
    "deferred addition coverage is explicit, not silently presented as complete",
  );
  await flush();
  material.onEffectCreatedObservable.notifyObservers({
    effect: compiled,
    subMesh: null,
  });
  assert.equal(profile.endFrame().cumulative.materialEffectEvents, 1);
  profile.beginFrame();
  material.onEffectCreatedObservable.notifyObservers({
    effect: compiled,
    subMesh: null,
  });
  scene.removeMaterial(material);
  material.onEffectCreatedObservable.notifyObservers({
    effect: compiled,
    subMesh: null,
  });
  const frame = profile.endFrame();
  assert.equal(frame.counters.materialEffectEvents, 1);
  assert.equal(frame.cumulative.trackedMaterials, 0);
  const removedBeforeNotification = new StandardMaterial(
    "never-observed",
    scene,
  );
  scene.removeMaterial(removedBeforeNotification);
  await flush();
  assert.equal(
    removedBeforeNotification.onEffectCreatedObservable.observers.length,
    0,
  );
  assert.equal(material.onEffectCreatedObservable.observers.length, 0);
  assert.equal(profile.endFrame().cumulative.trackedMaterials, 0);
  material.dispose();
  removedBeforeNotification.dispose();
});

test("details retain at most eight identities/slowest intervals while all event counts and total costs remain exact", (t) => {
  const { scene, now, at, effect } = fixture(t);
  const targets = Array.from(
    { length: 12 },
    (_, index) => new ObjectRenderer(`target-${index}`, scene),
  );
  const materials = Array.from(
    { length: 20 },
    (_, index) =>
      new StandardMaterial(`technical-${index}-` + "x".repeat(300), scene),
  );
  const compiled = effect("#define QUALITY_HIGH");
  const profile = new RenderIncidentProfile(scene, now);
  t.after(() => profile.dispose());
  profile.beginFrame();
  for (const [index, target] of targets.entries()) {
    at(index * 20);
    target.onInitRenderingObservable.notifyObservers(target);
    at(index * 20 + index + 1);
    target.onFinishRenderingObservable.notifyObservers(target);
  }
  for (const material of materials)
    material.onEffectCreatedObservable.notifyObservers({
      effect: compiled,
      subMesh: null,
    });
  const result = profile.endFrame();
  assert.equal(result.cpuMs.renderTargets, 78);
  assert.equal(result.counters.renderTargetIntervals, 12);
  assert.equal(result.counters.renderTargetDetailsOmitted, 4);
  assert.deepEqual(
    result.details.slowRenderTargets.map((detail) => detail.cpuMs),
    [12, 11, 10, 9, 8, 7, 6, 5],
  );
  assert.equal(result.counters.materialEffectEvents, 20);
  assert.equal(result.counters.materialDetailsOmitted, 12);
  assert.equal(result.details.materials.length, 8);
  assert.ok(
    result.details.materials.every((detail) => detail.name.length <= 96),
  );
  result.details.materials[0].events = 1000;
  assert.equal(
    profile.endFrame().details.materials[0].events,
    1,
    "consumer mutation cannot alter the profiler",
  );
});

test("unpaired shader callbacks, excessive nesting and removed target intervals cannot leak into a later frame", (t) => {
  const { engine, scene, now, at } = fixture(t);
  const target = new ObjectRenderer("removed-target", scene);
  const profile = new RenderIncidentProfile(scene, now);
  t.after(() => profile.dispose());
  profile.beginFrame();
  engine.onBeforeShaderCompilationObservable.notifyObservers(engine);
  target.onInitRenderingObservable.notifyObservers(target);
  scene.removeObjectRenderer(target);
  at(50);
  target.onFinishRenderingObservable.notifyObservers(target);
  const incomplete = profile.endFrame();
  assert.equal(incomplete.cpuMs.shaderCreation, 0);
  assert.equal(incomplete.cpuMs.renderTargets, 0);
  assert.equal(incomplete.counters.shaderIntervalsDropped, 1);
  assert.equal(incomplete.details.slowRenderTargets.length, 0);
  profile.beginFrame();
  engine.onAfterShaderCompilationObservable.notifyObservers(engine);
  at(60);
  for (let index = 0; index < 40; index++)
    engine.onBeforeShaderCompilationObservable.notifyObservers(engine);
  at(70);
  for (let index = 0; index < 40; index++)
    engine.onAfterShaderCompilationObservable.notifyObservers(engine);
  const bounded = profile.endFrame();
  assert.equal(bounded.counters.shaderProgramStarts, 40);
  assert.equal(bounded.counters.shaderPrograms, 32);
  assert.equal(bounded.counters.shaderIntervalsDropped, 9);
  assert.equal(
    bounded.cpuMs.shaderCreation,
    320,
    "nested intervals remain inclusive, not a disjoint frame total",
  );
  profile.beginFrame();
  at(80);
  engine.onBeforeShaderCompilationObservable.notifyObservers(engine);
  at(83);
  engine.onAfterShaderCompilationObservable.notifyObservers(engine);
  const recovered = profile.endFrame();
  assert.equal(recovered.cpuMs.shaderCreation, 3);
  assert.equal(recovered.counters.shaderIntervalsDropped, 0);
  target.dispose();
});

test("repeated disposal and scene disposal detach engine, scene, target and material observers even mid-frame", async (t) => {
  const { engine, scene, now, at, effect } = fixture(t);
  const target = new ObjectRenderer("lifecycle", scene);
  const material = new StandardMaterial("lifecycle", scene);
  const compiled = effect();
  const observables = [
    engine.onBeforeShaderCompilationObservable,
    engine.onAfterShaderCompilationObservable,
    scene.onNewMaterialAddedObservable,
    scene.onMaterialRemovedObservable,
    scene.onDisposeObservable,
    scene.onBeforeDrawPhaseObservable,
    scene.onAfterDrawPhaseObservable,
    target.onInitRenderingObservable,
    target.onFinishRenderingObservable,
    material.onEffectCreatedObservable,
  ];
  const originalCounts = observables.map(
    (observable) => observable.observers.length,
  );
  for (let iteration = 0; iteration < 3; iteration++) {
    const profile = new RenderIncidentProfile(scene, now);
    profile.beginFrame();
    at(1);
    engine.onBeforeShaderCompilationObservable.notifyObservers(engine);
    target.onInitRenderingObservable.notifyObservers(target);
    profile.dispose();
    profile.dispose();
    at(10);
    engine.onAfterShaderCompilationObservable.notifyObservers(engine);
    target.onFinishRenderingObservable.notifyObservers(target);
    material.onEffectCreatedObservable.notifyObservers({
      effect: compiled,
      subMesh: null,
    });
    assert.equal(profile.endFrame().counters.shaderPrograms, 0);
    assert.equal(profile.endFrame().cumulative.materialEffectEvents, 0);
    await flush();
    assert.deepEqual(
      observables.map((observable) => observable.observers.length),
      originalCounts,
    );
  }
  const finalProfile = new RenderIncidentProfile(scene, now);
  scene.dispose();
  finalProfile.dispose();
  await flush();
  assert.equal(
    engine.onBeforeShaderCompilationObservable.observers.length,
    originalCounts[0],
  );
  assert.equal(
    engine.onAfterShaderCompilationObservable.observers.length,
    originalCounts[1],
  );
  assert.equal(material.onEffectCreatedObservable.observers.length, 0);
});
