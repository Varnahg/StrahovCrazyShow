import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import {
  ImageProcessingPostProcess,
  type ImageProcessingPostProcessOptions,
} from "@babylonjs/core/PostProcesses/imageProcessingPostProcess";
import { ThinImageProcessingPostProcess } from "@babylonjs/core/PostProcesses/thinImageProcessingPostProcess";
import "@babylonjs/core/Shaders/pass.fragment";
import "@babylonjs/core/Shaders/postprocess.vertex";

// Observe real public camera calls; do not replace their behavior or read the
// private camera chain. Each test owns an isolated engine/effect cache.
class Camera extends FreeCamera {
  readonly attached = new Set<PostProcess>();
  override attachPostProcess(
    ...args: Parameters<FreeCamera["attachPostProcess"]>
  ) {
    const index = super.attachPostProcess(...args);
    if (index >= 0) this.attached.add(args[0]);
    return index;
  }
  override detachPostProcess(pass: PostProcess) {
    super.detachPostProcess(pass);
    this.attached.delete(pass);
  }
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function fixture(t: TestContext) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const cameraA = new Camera("A", Vector3.Zero(), scene);
  const cameraB = new Camera("B", Vector3.Zero(), scene);
  scene.activeCamera = cameraA;
  const config = new ImageProcessingConfiguration();
  const passes = new Set<PostProcess>(),
    borrowed = new Set<EffectWrapper>();
  const originalCreate = engine.createEffect;
  let createCalls = 0;
  engine.createEffect = function (
    ...args: Parameters<NullEngine["createEffect"]>
  ) {
    createCalls++;
    return Reflect.apply(originalCreate, this, args) as Effect;
  };
  const releaseWrapper = (wrapper: EffectWrapper) => {
    borrowed.delete(wrapper);
    wrapper.dispose();
  };
  t.after(() => {
    for (const pass of passes) pass.dispose();
    for (const wrapper of borrowed) releaseWrapper(wrapper);
    // A red constructor may throw before returning its internally leaked Thin
    // instance. This fixture owns the config and clears it only AFTER assertions.
    config.onUpdateParameters.clear();
    scene.dispose();
    engine.dispose();
  });
  const keep = <T extends PostProcess>(pass: T) => {
    passes.add(pass);
    // Explicit releases leave the teardown ledger before any reentrant call.
    pass.onDisposeObservable.addOnce(() => passes.delete(pass));
    return pass;
  };
  const keepWrapper = <T extends EffectWrapper>(wrapper: T) => {
    borrowed.add(wrapper);
    return wrapper;
  };
  return {
    engine,
    scene,
    cameraA,
    cameraB,
    config,
    keep,
    keepWrapper,
    releaseWrapper,
    createCalls: () => createCalls,
  };
}
function configSentinel(t: TestContext, config: ImageProcessingConfiguration) {
  let calls = 0;
  const observer = config.onUpdateParameters.add(() => calls++);
  t.after(() => config.onUpdateParameters.remove(observer));
  return { observer, calls: () => calls };
}
async function effectOf(pass: PostProcess): Promise<Effect> {
  const current = pass.getEffect();
  if (current) return current;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pass.onEffectCreatedObservable.remove(observer);
      reject(new Error("Real NullEngine effect was not created"));
    }, 2000);
    const observer = pass.onEffectCreatedObservable.addOnce((effect) => {
      clearTimeout(timeout);
      resolve(effect);
    });
  });
}
function trackDisposal<T extends { dispose(...args: any[]): unknown }>(
  object: T,
) {
  const original = object.dispose;
  let calls = 0;
  object.dispose = function (this: T, ...args: Parameters<T["dispose"]>) {
    calls++;
    return Reflect.apply(original, this, args);
  } as T["dispose"];
  return () => calls;
}

for (const kind of ["numeric", "object", "explicit-undefined"] as const) {
  test(`${kind} options own one real Thin lifecycle and cannot react after disposal`, async (t) => {
    const { engine, config, keep, createCalls } = fixture(t);
    const options: number | ImageProcessingPostProcessOptions =
      kind === "numeric"
        ? 1
        : kind === "object"
          ? { size: 1 }
          : { size: 1, effectWrapper: undefined, temperature: 5000, tint: -8 };
    const pass = keep(
      new ImageProcessingPostProcess(
        "owned",
        options,
        null,
        undefined,
        engine,
        false,
        0,
        config,
      ),
    );
    assert.equal(
      pass.imageProcessingConfiguration,
      config,
      "actual IP wrapper survives the options spread",
    );
    if (kind === "explicit-undefined") {
      assert.equal(config.whiteBalanceEnabled, true);
      assert.equal(config.temperature, 5000);
      assert.equal(config.tint, -8);
    }
    const effect = await effectOf(pass),
      disposals = trackDisposal(effect);
    assert.equal(config.onUpdateParameters.observers.length, 1);
    let callbackState: unknown;
    pass.onDisposeObservable.addOnce(() => {
      callbackState = {
        effectDisposals: disposals(),
        configHasObservers: config.onUpdateParameters.hasObservers(),
        post: config.applyByPostProcess,
      };
    });
    pass.dispose();
    await tick();
    assert.equal(
      config.onUpdateParameters.observers.length,
      0,
      "owned config observer is actually removed",
    );
    assert.deepEqual(callbackState, {
      effectDisposals: 1,
      configHasObservers: false,
      post: false,
    });
    assert.equal(disposals(), 1);
    const creations = createCalls();
    config.exposure = 1.37;
    await tick();
    assert.equal(
      createCalls(),
      creations,
      "absence of events must not hide a live createEffect callback",
    );
    pass.dispose();
    assert.equal(
      disposals(),
      1,
      "double dispose does not release an owned effect twice",
    );
  });
}

test("an own effect is released before onDispose reentrancy, without skipping later camera detaches", async (t) => {
  const { engine, cameraA, cameraB, config, keep } = fixture(t);
  const pass = keep(
    new ImageProcessingPostProcess(
      "two cameras",
      1,
      cameraA,
      undefined,
      engine,
      false,
      0,
      config,
    ),
  );
  cameraB.attachPostProcess(pass);
  const disposals = trackDisposal(await effectOf(pass));
  pass.onDisposeObservable.addOnce(() => pass.dispose(cameraA));
  pass.dispose(cameraA);
  assert.equal(disposals(), 1);
  assert.equal(cameraA.attached.has(pass), false);
  assert.equal(cameraB.attached.has(pass), true);
  // The old disposed PP no longer owns a configuration another owner may reuse.
  config.applyByPostProcess = true;
  pass.dispose(cameraB);
  await tick();
  assert.equal(cameraB.attached.has(pass), false);
  assert.equal(disposals(), 1);
  assert.equal(config.applyByPostProcess, true);
  assert.equal(config.onUpdateParameters.observers.length, 0);
});

test("owned configuration replacement detaches the old callback and releases only the current one", async (t) => {
  const { engine, config: original, keep, createCalls } = fixture(t);
  const sentinelA = configSentinel(t, original);
  const pass = keep(
    new ImageProcessingPostProcess(
      "replace owned",
      1,
      null,
      undefined,
      engine,
      false,
      0,
      original,
    ),
  );
  await effectOf(pass);
  const replacement = new ImageProcessingConfiguration();
  const sentinelB = configSentinel(t, replacement);
  pass.imageProcessingConfiguration = replacement;
  await tick();
  assert.deepEqual(original.onUpdateParameters.observers, [sentinelA.observer]);
  assert.equal(replacement.onUpdateParameters.observers.length, 2);
  assert.ok(
    replacement.onUpdateParameters.observers.includes(sentinelB.observer),
  );
  const creations = createCalls();
  const notificationsA = sentinelA.calls();
  original.exposure = 1.27;
  await tick();
  assert.equal(createCalls(), creations);
  assert.equal(
    sentinelA.calls(),
    notificationsA + 1,
    "old foreign subscriber remains live",
  );
  const disposals = trackDisposal(await effectOf(pass));
  pass.dispose();
  await tick();
  assert.deepEqual(original.onUpdateParameters.observers, [sentinelA.observer]);
  assert.deepEqual(replacement.onUpdateParameters.observers, [
    sentinelB.observer,
  ]);
  assert.equal(replacement.applyByPostProcess, false);
  assert.equal(disposals(), 1);
  const after = createCalls();
  const notificationsB = sentinelB.calls();
  replacement.exposure = 1.4;
  await tick();
  assert.equal(createCalls(), after);
  assert.equal(
    sentinelB.calls(),
    notificationsB + 1,
    "dispose removes only the Thin callback",
  );
});

test("borrowed Thin retains configuration, effect and caller event subscribers until its owner disposes", async (t) => {
  const {
    engine,
    cameraA,
    config,
    keep,
    keepWrapper,
    releaseWrapper,
    createCalls,
  } = fixture(t);
  const wrapper = keepWrapper(
    new ThinImageProcessingPostProcess("external", engine, {
      imageProcessingConfiguration: config,
    }),
  );
  const wrapperDisposals = trackDisposal(wrapper);
  const pass = keep(
    new ImageProcessingPostProcess(
      "borrowed",
      { size: 1, effectWrapper: wrapper },
      cameraA,
      undefined,
      engine,
    ),
  );
  await effectOf(pass);
  let observed = 0;
  const observer = wrapper.onEffectCreatedObservable.add(() => observed++);
  pass.dispose(cameraA);
  await tick();
  assert.equal(wrapperDisposals(), 0);
  assert.equal(config.applyByPostProcess, true);
  assert.equal(config.onUpdateParameters.observers.length, 1);
  assert.ok(wrapper.onEffectCreatedObservable.observers.includes(observer));
  const before = createCalls();
  // EffectWrapper replays its last event at subscribe time. Only a later
  // increase proves that this listener survives borrower disposal.
  const observedBeforeExposure = observed;
  config.exposure = 1.31;
  await tick();
  assert.ok(createCalls() > before, "caller-owned wrapper is still functional");
  assert.ok(
    observed > observedBeforeExposure,
    "borrower teardown cannot clear caller event delivery",
  );
  releaseWrapper(wrapper);
  await tick();
  assert.equal(wrapperDisposals(), 1);
  assert.equal(config.applyByPostProcess, false);
  assert.equal(config.onUpdateParameters.observers.length, 0);
});

test("two postprocesses sharing a supplied Thin do not disable or unsubscribe the remaining owner", async (t) => {
  const {
    engine,
    cameraA,
    cameraB,
    config,
    keep,
    keepWrapper,
    releaseWrapper,
  } = fixture(t);
  const wrapper = keepWrapper(
    new ThinImageProcessingPostProcess("shared", engine, {
      imageProcessingConfiguration: config,
    }),
  );
  const disposals = trackDisposal(wrapper);
  const first = keep(
    new ImageProcessingPostProcess(
      "first borrower",
      { size: 1, effectWrapper: wrapper },
      cameraA,
      undefined,
      engine,
    ),
  );
  const second = keep(
    new ImageProcessingPostProcess(
      "second borrower",
      { size: 1, effectWrapper: wrapper },
      cameraB,
      undefined,
      engine,
    ),
  );
  await effectOf(second);
  assert.equal(
    first.onEffectCreatedObservable,
    wrapper.onEffectCreatedObservable,
  );
  assert.equal(
    second.onEffectCreatedObservable,
    wrapper.onEffectCreatedObservable,
  );
  let events = 0;
  const listener = second.onEffectCreatedObservable.add(() => events++);
  first.dispose(cameraA);
  assert.equal(disposals(), 0);
  assert.equal(config.applyByPostProcess, true);
  assert.ok(cameraB.attached.has(second));
  await tick();
  const eventsBeforeExposure = events;
  config.exposure = 1.19;
  await tick();
  assert.ok(
    events > eventsBeforeExposure,
    "the new exposure emits beyond subscribe-time replay",
  );
  assert.ok(wrapper.onEffectCreatedObservable.observers.includes(listener));
  second.dispose(cameraB);
  assert.equal(disposals(), 0);
  assert.equal(config.applyByPostProcess, true);
  releaseWrapper(wrapper);
  await tick();
  assert.equal(disposals(), 1);
  assert.equal(config.onUpdateParameters.observers.length, 0);
});

test("borrowed configuration replacement remains controlled by the wrapper's caller after PP disposal", async (t) => {
  const {
    engine,
    cameraA,
    config: oldConfig,
    keep,
    keepWrapper,
    releaseWrapper,
  } = fixture(t);
  const sentinelA = configSentinel(t, oldConfig);
  const wrapper = keepWrapper(
    new ThinImageProcessingPostProcess("replace borrowed", engine, {
      imageProcessingConfiguration: oldConfig,
    }),
  );
  const disposals = trackDisposal(wrapper);
  const pass = keep(
    new ImageProcessingPostProcess(
      "borrower",
      { size: 1, effectWrapper: wrapper },
      cameraA,
      undefined,
      engine,
    ),
  );
  await effectOf(pass);
  const replacement = new ImageProcessingConfiguration();
  const sentinelB = configSentinel(t, replacement);
  pass.imageProcessingConfiguration = replacement;
  await tick();
  assert.deepEqual(oldConfig.onUpdateParameters.observers, [
    sentinelA.observer,
  ]);
  assert.equal(replacement.onUpdateParameters.observers.length, 2);
  assert.ok(
    replacement.onUpdateParameters.observers.includes(sentinelB.observer),
  );
  pass.dispose();
  assert.equal(wrapper.imageProcessingConfiguration, replacement);
  assert.equal(replacement.applyByPostProcess, true);
  assert.equal(disposals(), 0);
  assert.equal(
    replacement.onUpdateParameters.observers.length,
    2,
    "borrower does not remove either config subscriber",
  );
  releaseWrapper(wrapper);
  await tick();
  assert.deepEqual(oldConfig.onUpdateParameters.observers, [
    sentinelA.observer,
  ]);
  assert.deepEqual(replacement.onUpdateParameters.observers, [
    sentinelB.observer,
  ]);
  assert.equal(replacement.applyByPostProcess, false);
});

test("plain base PostProcess still clears events and releases its own EffectWrapper", async (t) => {
  const { engine, cameraA, keep } = fixture(t);
  const pass = keep(
    new PostProcess("base owned", "pass", { size: 1, engine, camera: cameraA }),
  );
  const disposals = trackDisposal(await effectOf(pass));
  pass.onEffectCreatedObservable.add(() => {});
  pass.dispose();
  assert.equal(disposals(), 1);
  assert.equal(pass.onEffectCreatedObservable.hasObservers(), false);
  assert.equal(cameraA.attached.has(pass), false);
});

test("plain base PostProcess leaves borrowed wrapper subscribers and lifecycle with the caller", async (t) => {
  const { engine, cameraA, keep, keepWrapper, releaseWrapper } = fixture(t);
  const wrapper = keepWrapper(
    new EffectWrapper({
      name: "base external",
      engine,
      fragmentShader: "pass",
      useShaderStore: true,
      useAsPostProcess: true,
    }),
  );
  const disposals = trackDisposal(wrapper);
  const pass = keep(
    new PostProcess("base borrower", "pass", {
      size: 1,
      engine,
      camera: cameraA,
      effectWrapper: wrapper,
    }),
  );
  await effectOf(pass);
  let events = 0;
  const listener = wrapper.onEffectCreatedObservable.add(() => events++);
  pass.dispose();
  assert.equal(disposals(), 0);
  assert.equal(cameraA.attached.has(pass), false);
  assert.equal(
    pass.onEffectCreatedObservable,
    wrapper.onEffectCreatedObservable,
  );
  assert.ok(wrapper.onEffectCreatedObservable.observers.includes(listener));
  const eventsBeforeUpdate = events;
  wrapper.updateEffect("#define OWNERSHIP_TEST");
  await tick();
  assert.ok(
    events > eventsBeforeUpdate,
    "actual updateEffect must emit beyond subscribe-time replay",
  );
  releaseWrapper(wrapper);
  assert.equal(disposals(), 1);
});
