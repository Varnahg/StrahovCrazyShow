import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";
import { BenchmarkRenderProfile } from "../client/benchmark-render-profile";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  let time = 0;
  return {
    scene,
    now: () => time,
    at: (value: number) => {
      time = value;
    },
  };
}

test("CPU profile accumulates repeated targets and scene phases, without including the frame tail", (t) => {
  const { scene, now, at } = fixture(t);
  const shadow = new ObjectRenderer("shadow", scene);
  const reflection = new ObjectRenderer("reflection", scene);
  const profile = new BenchmarkRenderProfile(scene, now);
  t.after(() => profile.dispose());
  profile.beginFrame();
  at(1);
  scene.onBeforeActiveMeshesEvaluationObservable.notifyObservers(scene);
  at(3);
  scene.onAfterActiveMeshesEvaluationObservable.notifyObservers(scene);
  at(4);
  scene.onBeforeActiveMeshesEvaluationObservable.notifyObservers(scene);
  at(7);
  scene.onAfterActiveMeshesEvaluationObservable.notifyObservers(scene);
  at(8);
  shadow.onInitRenderingObservable.notifyObservers(shadow);
  at(12);
  shadow.onFinishRenderingObservable.notifyObservers(shadow);
  at(13);
  reflection.onInitRenderingObservable.notifyObservers(reflection);
  at(19);
  reflection.onFinishRenderingObservable.notifyObservers(reflection);
  at(20);
  shadow.onInitRenderingObservable.notifyObservers(shadow);
  at(23);
  shadow.onFinishRenderingObservable.notifyObservers(shadow);
  at(25);
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  at(32);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  at(80);
  scene.onAfterRenderObservable.notifyObservers(scene);
  assert.deepEqual(profile.endFrame(), {
    activeMeshes: 5,
    renderTargets: 13,
    mainDraw: 7,
  });
  profile.beginFrame();
  assert.deepEqual(profile.endFrame(), {
    activeMeshes: 0,
    renderTargets: 0,
    mainDraw: 0,
  });
});

test("nested target intervals remain inclusive and targets created or removed during a run are owned", async (t) => {
  const { scene, now, at } = fixture(t);
  const profile = new BenchmarkRenderProfile(scene, now);
  t.after(() => profile.dispose());
  // New target notification is deferred by Babylon; beginFrame must catch it.
  const outer = new ObjectRenderer("outer", scene);
  const inner = new ObjectRenderer("inner", scene);
  profile.beginFrame();
  at(2);
  outer.onInitRenderingObservable.notifyObservers(outer);
  at(4);
  inner.onInitRenderingObservable.notifyObservers(inner);
  at(7);
  inner.onFinishRenderingObservable.notifyObservers(inner);
  at(10);
  outer.onFinishRenderingObservable.notifyObservers(outer);
  assert.equal(
    profile.endFrame().renderTargets,
    11,
    "8 + nested 3, deliberately not a disjoint frame budget",
  );
  profile.beginFrame();
  at(12);
  outer.onInitRenderingObservable.notifyObservers(outer);
  scene.removeObjectRenderer(outer);
  at(25);
  outer.onFinishRenderingObservable.notifyObservers(outer);
  assert.equal(
    profile.endFrame().renderTargets,
    0,
    "removed incomplete interval is dropped",
  );
  await flush();
  assert.equal(outer.onInitRenderingObservable.observers.length, 0);
  assert.equal(outer.onFinishRenderingObservable.observers.length, 0);
  const late = new ObjectRenderer("during-frame", scene);
  await flush();
  profile.beginFrame();
  at(30);
  late.onInitRenderingObservable.notifyObservers(late);
  at(35);
  late.onFinishRenderingObservable.notifyObservers(late);
  assert.equal(profile.endFrame().renderTargets, 5);
  outer.dispose();
});

test("repeated benchmark lifetimes and scene disposal detach every observer without accumulation", async (t) => {
  const { scene, now, at } = fixture(t);
  const shadow = new ObjectRenderer("shadow", scene);
  const observables = [
    scene.onBeforeDrawPhaseObservable,
    scene.onAfterDrawPhaseObservable,
    scene.onBeforeActiveMeshesEvaluationObservable,
    scene.onAfterActiveMeshesEvaluationObservable,
    scene.onNewObjectRendererAddedObservable,
    scene.onObjectRendererRemovedObservable,
    scene.onDisposeObservable,
    shadow.onInitRenderingObservable,
    shadow.onFinishRenderingObservable,
  ];
  const originalCounts = observables.map(
    (observable) => observable.observers.length,
  );
  for (let i = 0; i < 4; i++) {
    const profile = new BenchmarkRenderProfile(scene, now);
    profile.beginFrame();
    at(100);
    shadow.onInitRenderingObservable.notifyObservers(shadow);
    at(104);
    shadow.onFinishRenderingObservable.notifyObservers(shadow);
    assert.equal(profile.endFrame().renderTargets, 4);
    profile.dispose();
    profile.dispose();
    await flush();
    assert.deepEqual(
      observables.map((observable) => observable.observers.length),
      originalCounts,
    );
  }
  const profile = new BenchmarkRenderProfile(scene, now);
  scene.dispose();
  profile.dispose();
  await flush();
  assert.ok(
    observables.every((observable) => observable.observers.length === 0),
  );
});
