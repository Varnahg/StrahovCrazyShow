import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type {
  Effect,
  IEffectCreationOptions,
} from "@babylonjs/core/Materials/effect";
import { arePreparationEffectsReady } from "../client/strict-material-preparation";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

type CacheEngine = { _compiledEffects: Record<string, Effect> };
const cache = (engine: NullEngine) =>
  (engine as unknown as CacheEngine)._compiledEffects;

async function materialFixture(t: TestContext, kind: "standard" | "pbr") {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera("preparation camera", new Vector3(0, 2, -4), scene);
  new HemisphericLight("variant light", Vector3.Up(), scene);
  const mesh = MeshBuilder.CreateBox("actual material user", {}, scene);
  const material =
    kind === "standard"
      ? new StandardMaterial(kind, scene)
      : new PBRMaterial(kind, scene);
  mesh.material = material;
  // Exercise the pinned WebGPU cache insertion, using NullEngine only for the
  // driver backend. No WebGPU engine/device or shader compiler is created.
  engine.createEffect = WebGPUEngine.prototype.createEffect;
  engine.areAllEffectsReady = WebGPUEngine.prototype.areAllEffectsReady;
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  await material.forceCompilationAsync(mesh);
  scene.incrementRenderId();
  assert.equal(
    material.isReadyForSubMesh(mesh, mesh.subMeshes[0], false),
    true,
  );
  const oldEffect = mesh.subMeshes[0].effect!;
  assert.ok(oldEffect?.isReady());
  const pending = deferred();
  const originalCreate = engine.createEffect;
  let preparationCalls = 0;
  const originalPrepare = engine._preparePipelineContextAsync;
  engine._preparePipelineContextAsync = function (this: NullEngine, ...args) {
    preparationCalls++;
    return Reflect.apply(originalPrepare, this, args);
  };
  engine.createEffect = function (
    this: NullEngine,
    baseName,
    attributesNamesOrOptions,
    ...rest
  ) {
    const options = attributesNamesOrOptions as IEffectCreationOptions;
    assert.ok(Array.isArray(options.attributes));
    return Reflect.apply(originalCreate, this, [
      baseName,
      {
        ...options,
        extraInitializationsAsync: async () => {
          await pending.promise;
          await options.extraInitializationsAsync?.();
        },
      },
      ...rest,
    ]);
  } as typeof engine.createEffect;
  t.after(() => pending.resolve());
  // Only the read-only guard uses WebGPU mode. Materials retain their original
  // GLSL recipe and the NullEngine backend still performs no GPU compilation.
  const ready = () => {
    const target = engine as unknown as { _isWebGPU: boolean };
    const previous = target._isWebGPU;
    target._isWebGPU = true;
    try {
      return arePreparationEffectsReady(engine);
    } finally {
      target._isWebGPU = previous;
    }
  };
  return {
    engine,
    scene,
    mesh,
    material,
    oldEffect,
    pending,
    ready,
    preparationCalls: () => preparationCalls,
  };
}

for (const kind of ["standard", "pbr"] as const)
  test(`actual ${kind} hot-swap cannot hide a cached replacement awaiting its real extra initializer`, async (t) => {
    const f = await materialFixture(t, kind);
    assert.equal(f.ready(), true);
    const before = new Set(Object.values(cache(f.engine)));
    f.material.disableLighting = true;
    f.scene.incrementRenderId();
    assert.equal(f.material.allowShaderHotSwapping, true);
    assert.equal(
      f.material.isReadyForSubMesh(f.mesh, f.mesh.subMeshes[0], false),
      true,
      "the actual material reports its still-ready old effect",
    );
    assert.equal(f.mesh.subMeshes[0].effect, f.oldEffect);
    const replacements = Object.values(cache(f.engine)).filter(
      (effect) => !before.has(effect),
    );
    assert.equal(replacements.length, 1);
    const replacement = replacements[0];
    assert.equal(replacement.isReady(), false);
    assert.equal(
      f.preparationCalls(),
      0,
      "initializer precedes the tracked engine preparation hook",
    );
    assert.equal(
      f.engine.areAllEffectsReady(),
      true,
      "pinned WebGPU public method misses this pending effect",
    );
    const originalCache = cache(f.engine);
    const identities = Object.values(originalCache);
    assert.equal(
      f.ready(),
      false,
      "new stage must wait for its requested effect, not the old bound one",
    );
    assert.equal(cache(f.engine), originalCache);
    assert.deepEqual(Object.values(originalCache), identities);
    assert.equal(
      f.material.allowShaderHotSwapping,
      true,
      "guard never changes material policy",
    );
    f.pending.resolve();
    for (let i = 0; i < 16 && !replacement.isReady(); i++) await setImmediate();
    assert.equal(replacement.isReady(), true);
    assert.equal(f.preparationCalls(), 1);
    assert.equal(f.ready(), true);
    f.scene.incrementRenderId();
    assert.equal(
      f.material.isReadyForSubMesh(f.mesh, f.mesh.subMeshes[0], false),
      true,
    );
    assert.equal(f.mesh.subMeshes[0].effect, replacement);
  });

function fakeEngine() {
  const engine = {
    isWebGPU: true,
    isDisposed: false,
    areAllEffectsReady() {
      throw new Error("WebGPU stub must not be trusted");
    },
    _compiledEffects: {} as Record<string, unknown>,
  };
  const effect = () => ({
    isDisposed: false,
    getEngine: () => engine,
    isReady: () => true,
  });
  return { engine, effect };
}

test("WebGL delegates the existing method with its receiver and original exception", () => {
  let calls = 0;
  const failure = new Error("original readiness failure");
  const engine = {
    isWebGPU: false,
    isDisposed: false,
    areAllEffectsReady() {
      assert.equal(this, engine);
      calls++;
      if (calls === 3) throw failure;
      return calls === 2;
    },
  };
  assert.equal(arePreparationEffectsReady(engine), false);
  assert.equal(arePreparationEffectsReady(engine), true);
  assert.throws(
    () => arePreparationEffectsReady(engine),
    (error) => error === failure,
  );
  engine.isDisposed = true;
  assert.equal(arePreparationEffectsReady(engine), false);
  assert.equal(calls, 3);
});

test("missing or malformed pinned cache contracts never report ready", () => {
  const { engine } = fakeEngine();
  for (const invalid of [undefined, null, [], new Map(), true, 1, "cache"])
    assert.equal(
      arePreparationEffectsReady({
        ...engine,
        _compiledEffects: invalid,
      } as unknown as typeof engine),
      false,
    );
  assert.equal(
    arePreparationEffectsReady(engine),
    true,
    "empty valid map matches all-effects semantics",
  );
  engine._compiledEffects = Object.create(null);
  assert.equal(arePreparationEffectsReady(engine), true);
});

test("every entry must be live, ready and owned by this engine; owners remain independent", () => {
  const first = fakeEngine(),
    second = fakeEngine();
  first.engine._compiledEffects.a = first.effect();
  second.engine._compiledEffects.b = second.effect();
  assert.equal(arePreparationEffectsReady(first.engine), true);
  assert.equal(arePreparationEffectsReady(second.engine), true);
  for (const invalid of [
    null,
    {},
    { isDisposed: false, isReady: () => true },
    second.effect(),
    { ...first.effect(), isDisposed: true },
    { ...first.effect(), isReady: () => false },
  ]) {
    first.engine._compiledEffects.bad = invalid;
    assert.equal(arePreparationEffectsReady(first.engine), false);
    assert.equal(arePreparationEffectsReady(second.engine), true);
  }
  delete first.engine._compiledEffects.bad;
  assert.equal(arePreparationEffectsReady(first.engine), true);
  first.engine.isDisposed = true;
  assert.equal(arePreparationEffectsReady(first.engine), false);
});

test("cache/entry replacement, insertion, removal and disposal during readiness fail the current observation", () => {
  for (const mutation of [
    "cache",
    "replace",
    "insert",
    "remove",
    "dispose-engine",
    "dispose-effect",
    "change-owner",
  ] as const) {
    const { engine, effect } = fakeEngine();
    const item = effect();
    engine._compiledEffects.a = item;
    item.isReady = () => {
      if (mutation === "cache") engine._compiledEffects = {};
      if (mutation === "replace") engine._compiledEffects.a = effect();
      if (mutation === "insert")
        engine._compiledEffects.b = { ...effect(), isReady: () => false };
      if (mutation === "remove") delete engine._compiledEffects.a;
      if (mutation === "dispose-engine") engine.isDisposed = true;
      if (mutation === "dispose-effect") item.isDisposed = true;
      if (mutation === "change-owner")
        item.getEngine = () => fakeEngine().engine;
      return true;
    };
    assert.equal(arePreparationEffectsReady(engine), false, mutation);
  }
});

test("a real readiness exception propagates without changing cached effects or attaching Promise handlers", () => {
  const { engine, effect } = fakeEngine();
  const failure = new Error("readiness failed");
  const item = effect();
  engine._compiledEffects.a = item;
  item.isReady = () => {
    throw failure;
  };
  assert.throws(
    () => arePreparationEffectsReady(engine),
    (error) => error === failure,
  );
  assert.equal(engine._compiledEffects.a, item);
});

test("a nonboolean readiness result cannot be mistaken for ready or inspected as a Promise", () => {
  const { engine, effect } = fakeEngine();
  let thenReads = 0;
  const thenable = {
    get then() {
      thenReads++;
      throw new Error("must not inspect then");
    },
  };
  engine._compiledEffects.a = { ...effect(), isReady: () => thenable };
  assert.equal(arePreparationEffectsReady(engine), false);
  assert.equal(thenReads, 0);
});

// Real engine types remain accepted without a Game-side private-field cast.
const acceptsAbstractEngine = (engine: AbstractEngine) =>
  arePreparationEffectsReady(engine);
const acceptsWebGpuEngine = (engine: WebGPUEngine) =>
  arePreparationEffectsReady(engine);
void acceptsAbstractEngine;
void acceptsWebGpuEngine;
