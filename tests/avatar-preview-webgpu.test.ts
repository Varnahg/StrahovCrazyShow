import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.pure";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { DEFAULT_AVATAR } from "../shared/types";
import { WebGpuInitializationError } from "../client/render-fallback";
import {
  createAvatarPreview,
  type AvatarPreviewRuntime,
  type AvatarPreviewState,
  type AvatarPreviewController,
} from "../client/avatar-preview";

function pinnedEndFrame(onFlush: () => void, onSubmit: () => void) {
  const noop = () => {}, encoder = () => ({ finish: () => ({}) });
  const state = {
    _endCurrentRenderPass: noop, _debugPopBeforeEndOfEncoder: noop,
    _debugPushAfterStartOfEncoder: noop, _snapshotRendering: { endFrame: noop },
    _timestampQuery: { endFrame: noop, startFrame: noop },
    _uploadEncoder: encoder(), _renderEncoder: encoder(), _commandBuffers: [],
    _device: { queue: { submit: onSubmit }, createCommandEncoder: encoder },
    _uploadEncoderDescriptor: {}, _renderEncoderDescriptor: {},
    _debugMarkersEncoderGroups: [], _debugMarkersPassGroups: [],
    _textureHelper: { destroyDeferredTextures: noop, setCommandEncoder: noop },
    _bufferManager: { destroyDeferredBuffers: noop }, _bundleList: { reset: noop },
    countersLastFrame: {}, _counters: {}, _frameId: 0, frameId: 0,
    _cacheRenderPipeline: { endFrame: noop }, _cacheBindGroups: { endFrame: noop },
    onEndFrameObservable: { notifyObservers: noop },
    flushFramebuffer(fromEnd?: boolean) {
      onFlush();
      return WebGPUEngine.prototype.flushFramebuffer.call(this as unknown as WebGPUEngine, fromEnd);
    },
  };
  return () => WebGPUEngine.prototype.endFrame.call(state as unknown as WebGPUEngine);
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const settle = async () => {
  for (let i = 0; i < 24; i++) await Promise.resolve();
};
const A = { ...DEFAULT_AVATAR, preset: 0 },
  B = { ...DEFAULT_AVATAR, preset: 1 },
  C = { ...DEFAULT_AVATAR, preset: 4 };

function fixture(t: TestContext) {
  const engine = new NullEngine();
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
  const queued = new Map<number, () => void>(),
    timers = new Map<number, () => void>();
  const calls: string[] = [],
    profiles: number[] = [],
    sizes: number[][] = [],
    states: AvatarPreviewState[] = [];
  let visible = true,
    density = 1,
    clock = 0,
    next = 0,
    surfaceReady = true;
  let visibility: (() => void) | undefined, resize: (() => void) | undefined;
  let validation:
    ReturnType<typeof deferred<{ message: string } | null>> | undefined;
  let submission: ReturnType<typeof deferred<void>> | undefined;
  let compilation:
    | ReturnType<
        typeof deferred<{ messages: { type: string; message: string }[] }>
      >
    | undefined;
  let creates = 0,
    disposals = 0,
    surfaceDisposals = 0,
    checks = 0,
    detached = 0;
  class Device extends EventTarget {
    readonly lost = new Promise<{ reason: string; message: string }>(() => {});
    pushErrorScope() {
      calls.push("push");
    }
    popErrorScope() {
      calls.push("pop");
      const pending = validation;
      validation = undefined;
      return pending?.promise ?? Promise.resolve(null);
    }
    queue = {
      onSubmittedWorkDone: () => {
        calls.push("submit-check");
        const pending = submission;
        submission = undefined;
        return pending?.promise ?? Promise.resolve();
      },
    };
  }
  const device = new Device();
  (engine as unknown as { _device: Device })._device = device;
  engine.beginFrame = () => {
    calls.push("begin");
  };
  const submitFrame = pinnedEndFrame(() => calls.push("flush"), () => calls.push("gpu-submit"));
  engine.endFrame = () => {
    calls.push("end");
    submitFrame();
  };
  const nativeDispose = engine.dispose.bind(engine);
  engine.dispose = () => {
    disposals++;
    nativeDispose();
  };
  t.after(() => {
    if (!engine.isDisposed) nativeDispose();
  });
  const canvas = {
    isConnected: true,
    getBoundingClientRect: () => ({ width: 200, height: 300 }),
  } as unknown as HTMLCanvasElement;
  const module = {
    getCompilationInfo: () => {
      checks++;
      return compilation?.promise ?? Promise.resolve({ messages: [] });
    },
  };
  const surface = {
    update(config: typeof A) {
      profiles.push(config.preset);
      calls.push("profile");
    },
    rotate() {
      calls.push("rotate");
    },
    focus() {
      calls.push("focus");
    },
    resetView() {
      calls.push("reset");
    },
    resize(width: number, height: number) {
      sizes.push([width, height]);
    },
    ready: () => surfaceReady,
    render() {
      calls.push("render");
    },
    shaderModules: () => [module],
    dispose() {
      surfaceDisposals++;
      calls.push("surface-dispose");
    },
  };
  const runtime: AvatarPreviewRuntime = {
    unsupported: () => false,
    createEngine: async () => {
      creates++;
      return engine;
    },
    createSurface: (_engine, config) => {
      profiles.push(config.preset);
      return surface;
    },
    requestFrame(callback) {
      queued.set(++next, callback);
      return next;
    },
    cancelFrame(handle) {
      queued.delete(handle);
    },
    visible: () => visible,
    density: () => density,
    now: () => clock,
    setTimer(callback) {
      timers.set(++next, callback);
      return next;
    },
    clearTimer(handle) {
      timers.delete(handle);
    },
    observeResize(_canvas, callback) {
      resize = callback;
      return () => {
        resize = undefined;
        detached++;
      };
    },
    observeVisibility(callback) {
      visibility = callback;
      return () => {
        visibility = undefined;
        detached++;
      };
    },
  };
  const abort = new AbortController();
  const start = (getCurrentConfig?: () => typeof A) => {
    const result = createAvatarPreview(
      canvas,
      A,
      {
        signal: abort.signal,
        getCurrentConfig,
        onState: (state) => states.push(state),
      },
      runtime,
    );
    void result.catch(() => {});
    return result;
  };
  return {
    engine,
    device,
    canvas,
    runtime,
    surface,
    module,
    abort,
    start,
    queued,
    timers,
    calls,
    profiles,
    sizes,
    states,
    stats: () => ({ creates, disposals, surfaceDisposals, checks, detached }),
    ready(value: boolean) {
      surfaceReady = value;
    },
    visible(value: boolean) {
      visible = value;
      visibility?.();
    },
    density(value: number) {
      density = value;
      resize?.();
    },
    advance(value: number) {
      clock += value;
    },
    validation(value: ReturnType<typeof deferred<{ message: string } | null>>) {
      validation = value;
    },
    submission(value: ReturnType<typeof deferred<void>>) {
      submission = value;
    },
    compilation(
      value: ReturnType<
        typeof deferred<{ messages: { type: string; message: string }[] }>
      >,
    ) {
      compilation = value;
    },
    async frame() {
      const entry = queued.entries().next().value;
      assert.ok(entry, "a render was requested");
      queued.delete(entry[0]);
      entry[1]();
      await settle();
    },
  };
}

test("preview ready follows begin/render/end, submitted work and shader compilation info", async (t) => {
  const f = fixture(t),
    submitted = deferred<void>(),
    compiled = deferred<{ messages: { type: string; message: string }[] }>();
  let ready = false;
  const result = f.start().then((controller) => {
    ready = true;
    return controller;
  });
  await settle();
  f.submission(submitted);
  f.compilation(compiled);
  await f.frame();
  assert.deepEqual(
    f.calls.filter((value) =>
      ["begin", "render", "end", "submit-check"].includes(value),
    ),
    ["begin", "render", "end", "submit-check"],
  );
  assert.equal(ready, false);
  assert.equal(f.calls.filter((call) => call === "flush").length, 1);
  assert.equal(f.calls.filter((call) => call === "gpu-submit").length, 1);
  submitted.resolve();
  await settle();
  assert.equal(
    ready,
    false,
    "queue completion alone does not validate a shader",
  );
  compiled.resolve({ messages: [] });
  await settle();
  const controller = await result;
  assert.equal(controller.health().purpose, "preview");
  assert.equal(controller.health().valid, true);
  assert.equal(f.queued.size, 0);
  assert.equal(f.timers.size, 0);
  controller.rotate(0.2);
  controller.focus("face");
  controller.resetView();
  assert.equal(f.queued.size, 1);
  await f.frame();
  assert.equal(f.stats().checks, 1, "unchanged modules are checked once");
  assert.equal(
    f.sizes.length,
    1,
    "unchanged dimensions do not resize the engine",
  );
  controller.dispose();
  controller.dispose();
  assert.equal(f.stats().disposals, 1);
  assert.equal(f.stats().surfaceDisposals, 1);
  assert.equal(f.stats().detached, 2);
});

test("the last profile selected during engine initialization and submission wins", async (t) => {
  const f = fixture(t),
    initialized = deferred<AbstractEngine>(),
    validation = deferred<{ message: string } | null>();
  f.runtime.createEngine = () => initialized.promise;
  let current = A,
    resolved = false;
  const result = f
    .start(() => current)
    .then((controller) => {
      resolved = true;
      return controller;
    });
  current = B;
  initialized.resolve(f.engine);
  await settle();
  assert.deepEqual(f.profiles, [B.preset]);
  f.validation(validation);
  await f.frame();
  current = C;
  validation.resolve(null);
  await settle();
  assert.equal(resolved, false);
  assert.equal(f.queued.size, 1);
  await f.frame();
  const controller = await result;
  assert.deepEqual(f.profiles, [B.preset, C.preset]);
  controller.update(A);
  controller.update(B);
  assert.equal(controller.health().valid, false);
  await f.frame();
  assert.deepEqual(f.profiles, [B.preset, C.preset, B.preset]);
  controller.dispose();
});

test("abort before init creates nothing and a late initialized engine is disposed", async (t) => {
  const early = fixture(t);
  early.abort.abort();
  await assert.rejects(early.start(), { name: "AbortError" });
  assert.equal(early.stats().creates, 0);
  const late = fixture(t),
    initialized = deferred<AbstractEngine>();
  late.runtime.createEngine = () => initialized.promise;
  const result = late.start();
  late.abort.abort();
  initialized.resolve(late.engine);
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(late.stats().disposals, 1);
  assert.equal(late.profiles.length, 0);
});

test("abort after init or during pending submission clears owners and ignores late completion", async (t) => {
  for (const duringSubmission of [false, true]) {
    const f = fixture(t),
      pending = deferred<void>();
    const result = f.start();
    await settle();
    if (duringSubmission) {
      f.submission(pending);
      await f.frame();
    }
    f.abort.abort();
    await assert.rejects(result, { name: "AbortError" });
    pending.resolve();
    await settle();
    assert.equal(f.stats().disposals, 1);
    assert.equal(f.stats().surfaceDisposals, 1);
    assert.equal(f.queued.size, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.states.includes("ready"), false);
  }
});

test("surface constructor failure and detached canvas release the initialized engine", async (t) => {
  const f = fixture(t);
  f.runtime.createSurface = () => {
    throw new Error("rig construction failed");
  };
  await assert.rejects(f.start(), /rig construction failed/);
  assert.equal(f.stats().disposals, 1);
  const detached = fixture(t);
  Object.assign(detached.canvas, { isConnected: false });
  await assert.rejects(detached.start(), { name: "AbortError" });
  assert.equal(detached.stats().disposals, 1);
  assert.equal(detached.profiles.length, 0);
});

test("native scope and module errors reject preparation without marking ready", async (t) => {
  for (const kind of ["validation", "shader"] as const) {
    const f = fixture(t),
      result = f.start();
    await settle();
    if (kind === "validation") {
      const pending = deferred<{ message: string } | null>();
      pending.resolve({ message: "bad pipeline" });
      f.validation(pending);
    } else {
      const pending = deferred<{
        messages: { type: string; message: string }[];
      }>();
      pending.resolve({ messages: [{ type: "error", message: "bad shader" }] });
      f.compilation(pending);
    }
    await f.frame();
    await assert.rejects(result, /bad pipeline|bad shader/);
    await settle();
    assert.equal(f.states.includes("ready"), false);
    assert.equal(f.stats().disposals, 1);
    assert.equal(f.queued.size, 0);
  }
});

test("render failure skips pinned end/flush/submit and never leaves a live preview", async (t) => {
  const f = fixture(t),
    result = f.start();
  await settle();
  f.surface.render = () => {
    f.calls.push("render");
    throw new Error("draw failed");
  };
  await f.frame();
  await assert.rejects(result, /draw failed/);
  await settle();
  assert.deepEqual(
    f.calls.filter((x) => ["begin", "render", "end", "flush", "gpu-submit"].includes(x)),
    ["begin", "render"],
  );
  assert.equal(f.stats().disposals, 1);
});

test("preview rejects truthy and falsy render failures before never-settling GPU work and consumes late scope rejection", async (t) => {
  for (const failure of [undefined, null, 0, false, new Error("source render")]) {
    const f = fixture(t), scope = deferred<{ message: string } | null>();
    let settled = false, reason: unknown;
    const result = f.start();
    void result.catch((error) => { settled = true; reason = error; });
    await settle();
    const beforePops = f.calls.filter((call) => call === "pop").length;
    f.validation(scope);
    f.submission(deferred<void>());
    f.compilation(deferred<{ messages: { type: string; message: string }[] }>());
    f.surface.render = () => { f.calls.push("render"); throw failure; };
    await f.frame();
    assert.equal(settled, true, "render error must not await GPU completion");
    assert.equal(reason, failure);
    assert.equal(f.calls.filter((call) => call === "pop").length, beforePops + 1);
    assert.equal(f.calls.includes("gpu-submit"), false);
    assert.equal(f.calls.includes("submit-check"), false);
    assert.equal(f.stats().checks, 0);
    scope.reject(new Error("late scope rejection"));
    await settle();
    assert.equal(f.stats().disposals, 1);
  }
});

test("preview preserves source error before throwing scope cleanup and state observers", async (t) => {
  const f = fixture(t), original = new Error("original draw");
  const result = createAvatarPreview(f.canvas, A, {
    signal: f.abort.signal,
    onState(state) { if (state === "failed") throw new Error("observer failed"); },
  }, f.runtime);
  let settled = false, reason: unknown;
  void result.catch((error) => { settled = true; reason = error; });
  await settle();
  const pop = f.device.popErrorScope.bind(f.device);
  f.device.popErrorScope = () => { pop(); throw new Error("scope failed"); };
  f.surface.render = () => { throw original; };
  f.surface.dispose = () => { throw new Error("surface cleanup failed"); };
  await f.frame();
  assert.equal(settled, true);
  assert.equal(reason, original);
  assert.equal(f.calls.includes("gpu-submit"), false);
  assert.equal(f.stats().disposals, 1);
});

for (const retirement of ["abort", "engine-dispose"] as const)
test(`preview ${retirement} inside render closes its scope without submitting the disposed owner`, async (t) => {
  const f = fixture(t), result = f.start();
  const rejected = assert.rejects(result, { name: "AbortError" });
  await settle();
  const beforePops = f.calls.filter((call) => call === "pop").length;
  f.surface.render = () => {
    if (retirement === "abort") f.abort.abort();
    else f.engine.dispose();
  };
  await f.frame(); await rejected;
  assert.equal(f.calls.includes("end"), false);
  assert.equal(f.calls.includes("gpu-submit"), false);
  assert.equal(f.calls.includes("submit-check"), false);
  assert.equal(f.calls.filter((call) => call === "pop").length, beforePops + 1);
  assert.equal(f.stats().disposals, 1);
});

test("hidden preparation pauses budget and RAF, then resumes with current DPR", async (t) => {
  const f = fixture(t),
    result = f.start();
  await settle();
  f.ready(false);
  const staleTimer = f.timers.values().next().value!;
  f.advance(5000);
  f.visible(false);
  f.advance(60_000);
  assert.equal(f.queued.size, 0);
  assert.equal(f.timers.size, 0);
  staleTimer();
  await settle();
  assert.equal(f.stats().disposals, 0);
  f.density(1.5);
  f.ready(true);
  f.visible(true);
  await f.frame();
  const controller = await result;
  assert.deepEqual(f.sizes, [[300, 450]]);
  controller.dispose();
});

test("unsupported is distinct from device failure and never constructs a surface", async (t) => {
  const unsupported = fixture(t);
  unsupported.runtime.unsupported = () => true;
  await assert.rejects(unsupported.start(), {
    name: "AvatarPreviewUnsupportedError",
  });
  assert.deepEqual(unsupported.states, ["unsupported"]);
  assert.equal(unsupported.stats().creates, 0);
  const failed = fixture(t);
  failed.runtime.createEngine = async () => {
    throw new Error("device refused");
  };
  await assert.rejects(failed.start(), /device refused/);
  assert.equal(failed.profiles.length, 0);
});

test("scene readiness needs a prepared frame after the progress render", async (t) => {
  const f = fixture(t);
  f.ready(false);
  let resolved = false;
  const result = f.start().then((controller) => {
    resolved = true;
    return controller;
  });
  await settle();
  f.surface.render = () => {
    f.calls.push("render");
    f.ready(true);
  };
  await f.frame();
  assert.equal(resolved, false);
  assert.equal(f.queued.size, 1);
  await f.frame();
  const controller = await result;
  assert.equal(f.calls.filter((call) => call === "end").length, 2);
  controller.dispose();
});

test("a lost preview generation cannot become ready when its pending GPU work finishes", async (t) => {
  const f = fixture(t),
    pending = deferred<void>(),
    result = f.start();
  await settle();
  f.submission(pending);
  await f.frame();
  f.engine.onContextLostObservable.notifyObservers(f.engine);
  await assert.rejects(result, /zařízení/);
  pending.resolve();
  await settle();
  f.engine.onContextRestoredObservable.notifyObservers(f.engine);
  await settle();
  assert.equal(f.states.includes("ready"), false);
  assert.equal(f.stats().disposals, 1);
  assert.equal(f.queued.size, 0);
});

test("visible preparation has a bounded deadline and cleans a never-ready scene", async (t) => {
  const f = fixture(t);
  f.ready(false);
  const result = f.start();
  await settle();
  await f.frame();
  const expire = f.timers.values().next().value!;
  assert.ok(expire);
  expire();
  await assert.rejects(result, /časový limit/);
  await settle();
  assert.equal(f.stats().disposals, 1);
  assert.equal(f.queued.size, 0);
  assert.equal(f.timers.size, 0);
});

for (const stage of ["before-frame", "render", "submission"] as const)
  test(`visible deadline is checked without dispatching the late timer after ${stage}`, async (t) => {
    const f = fixture(t);
    const result = f.start();
    await settle();
    const pending = deferred<void>();
    if (stage === "before-frame") f.advance(30_001);
    if (stage === "render")
      f.surface.render = () => {
        f.calls.push("render");
        f.advance(30_001);
      };
    if (stage === "submission") f.submission(pending);
    await f.frame();
    if (stage === "submission") {
      f.advance(30_001);
      pending.resolve();
      await settle();
    }
    // Browser microtasks run before the overdue timer task. Do not invoke it:
    // acceptance itself must inspect elapsed visible time.
    await assert.rejects(result, /časový limit/);
    await settle();
    assert.equal(f.states.includes("ready"), false);
    assert.equal(f.stats().disposals, 1);
    assert.equal(
      f.calls.filter((call) => call === "end").length,
      stage === "before-frame" ? 0 : 1,
    );
    assert.equal(f.queued.size, 0);
    assert.equal(f.timers.size, 0);
  });

test("a throwing latest-profile getter still releases its initialized engine", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.start(() => {
      throw new Error("profile reader failed");
    }),
    /profile reader failed/,
  );
  assert.equal(f.stats().disposals, 1);
  assert.equal(f.profiles.length, 0);
});

// Execute the actual editor effect; replace only the lazy import and preview IO.
const editor = ts.createSourceFile(
  "avatar-editor.tsx",
  readFileSync(new URL("../client/avatar-editor.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let effect: ts.ArrowFunction | undefined;
function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(editor) === "useEffect" &&
    ts.isArrowFunction(node.arguments[0]) &&
    node.arguments[0].getText(editor).includes('import("./avatar-preview")')
  )
    effect = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(editor);
assert.ok(effect);
const effectJs = ts.transpileModule(`(${effect.getText(editor)})()`, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
  transformers: {
    before: [
      (context) => (source) => {
        const replace: ts.Visitor = (node) =>
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? ts.factory.createCallExpression(
                ts.factory.createIdentifier("loadPreview"),
                undefined,
                [],
              )
            : ts.visitEachChild(node, replace, context);
        return ts.visitNode(source, replace) as ts.SourceFile;
      },
    ],
  },
}).outputText;
function editorFixture() {
  const module = deferred<{
    createAvatarPreview: (...args: any[]) => Promise<AvatarPreviewController>;
  }>();
  const environment = {
    AbortController,
    Error,
    canvas: { current: {} as object },
    preview: { current: null as AvatarPreviewController | null },
    previewGeneration: { current: 0 },
    currentAvatar: { current: A },
    states: [] as AvatarPreviewState[],
    errors: [] as string[],
    setPreviewStatus(value: AvatarPreviewState) {
      environment.states.push(value);
    },
    setPreviewError(value: string) {
      environment.errors.push(value);
    },
    setRendererSelection() {},
    setRendererGeneration() { throw new Error("retired editor must not request a new canvas"); },
    requestWebGlFallback() { throw new Error("retired editor must not request fallback"); },
    WebGpuInitializationError,
    window: { location: { hostname: "example.com", search: "" } },
    pointer: { current: null },
    loadPreview: () => module.promise,
  };
  const cleanup = new Script(effectJs).runInContext(
    createContext(environment),
  ) as () => void;
  return { environment, module, cleanup };
}

test("editor cancels a late import and never substitutes a different canvas", async () => {
  const f = editorFixture();
  let calls = 0;
  f.cleanup();
  f.environment.canvas.current = {};
  f.module.resolve({
    createAvatarPreview: async () => {
      calls++;
      return {} as AvatarPreviewController;
    },
  });
  await settle();
  assert.equal(calls, 0);
  assert.deepEqual(f.environment.states, ["loading"]);
});

test("editor disposes late controller without clearing a newer preview owner", async () => {
  const f = editorFixture(),
    created = deferred<AvatarPreviewController>();
  const canvas = f.environment.canvas.current;
  let disposed = 0;
  f.module.resolve({
    createAvatarPreview: async (target, _initial, options) => {
      assert.equal(target, canvas);
      assert.equal(options.signal.aborted, false);
      f.environment.currentAvatar.current = B;
      assert.equal(options.getCurrentConfig(), B);
      return created.promise;
    },
  });
  await settle();
  f.cleanup();
  const newer = {} as AvatarPreviewController;
  f.environment.preview.current = newer;
  created.resolve({
    dispose: () => {
      disposed++;
    },
  } as AvatarPreviewController);
  await settle();
  assert.equal(disposed, 1);
  assert.equal(f.environment.preview.current, newer);
  assert.equal(f.environment.states.includes("ready"), false);
});
