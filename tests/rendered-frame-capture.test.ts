import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Observable } from "@babylonjs/core/Misc/observable";
import type { EventState } from "@babylonjs/core/Misc/observable";
import { RenderedFrameCapture } from "../client/rendered-frame-capture";
import { FEEDBACK_LIMITS, type FeedbackFrame } from "../shared/feedback";

class Clock {
  value = 100;
  private next = 1;
  readonly jobs = new Map<number, { at: number; callback(): void }>();

  setTimeout = (callback: () => void, delay: number) => {
    const id = this.next++;
    this.jobs.set(id, { at: this.value + delay, callback });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.jobs.delete(id as number);
  };
  advance(ms: number) {
    const end = this.value + ms;
    for (;;) {
      const job = [...this.jobs.entries()]
        .filter(([, value]) => value.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!job) break;
      this.value = job[1].at;
      this.jobs.delete(job[0]);
      job[1].callback();
    }
    this.value = end;
  }
}

class Canvas {
  width = 0;
  height = 0;
  contextAvailable = true;
  copyThrows = false;
  encodeThrows = false;
  onContext = () => {};
  onDraw = () => {};
  readonly draws: unknown[][] = [];
  readonly encodes: {
    callback: BlobCallback;
    type?: string;
    quality?: number;
  }[] = [];

  getContext() {
    this.onContext();
    return this.contextAvailable
      ? {
          drawImage: (...args: unknown[]) => {
            if (this.copyThrows) throw new Error("copy failed");
            this.draws.push(args);
            this.onDraw();
          },
        }
      : null;
  }
  toBlob(callback: BlobCallback, type?: string, quality?: number) {
    if (this.encodeThrows) throw new Error("origin is not clean");
    this.encodes.push({ callback, type, quality });
  }
  finish(blob: Blob | null = image()) {
    assert.equal(
      this.encodes.length,
      1,
      "exactly one encode per requested frame",
    );
    this.encodes[0].callback(blob);
  }
}

const image = (type = "image/webp") => new Blob(["encoded frame"], { type });
function frame(overrides: Partial<FeedbackFrame> = {}): FeedbackFrame {
  return {
    frameId: 1,
    renderedAtUTC: "2026-10-20T20:00:00.000Z",
    renderCompletedAtMs: 99,
    position: { x: 1, y: 2, z: 3 },
    camera: { x: 4, y: 5, z: 6, yaw: 0.4, pitch: 0.1 },
    renderWidth: 3840,
    renderHeight: 2160,
    cssWidth: 1280,
    cssHeight: 720,
    quality: "high",
    backend: "webgl2",
    ...overrides,
  };
}

/** Fake IO proves queue, attribution and lifecycle only, never GPU pixels. */
function fixture(t: TestContext) {
  const clock = new Clock();
  const observable = new Observable<AbstractEngine>();
  const canvases: Canvas[] = [];
  const state = {
    source: { width: 3840, height: 2160 } as HTMLCanvasElement | null,
    frame: frame() as FeedbackFrame | null,
    readThrows: false,
    onFrameRead: () => {},
    configureCanvas: (_canvas: Canvas) => {},
  };
  const engine = {
    onEndFrameObservable: observable,
    getRenderingCanvas: () => state.source,
  };
  const capture = new RenderedFrameCapture({
    engine,
    frame: () => {
      state.onFrameRead();
      if (state.readThrows) throw new Error("no completed render");
      return state.frame;
    },
    environment: {
      createCanvas: () => {
        const canvas = new Canvas();
        state.configureCanvas(canvas);
        canvases.push(canvas);
        return canvas as unknown as HTMLCanvasElement;
      },
      now: () => clock.value,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    },
  });
  const endFrame = () => observable.notifyObservers(engine as AbstractEngine);
  const render = (overrides: Partial<FeedbackFrame> = {}) => {
    clock.advance(16);
    state.frame = frame({
      frameId: (state.frame?.frameId ?? 0) + 1,
      renderCompletedAtMs: clock.value,
      renderWidth: state.source!.width,
      renderHeight: state.source!.height,
      ...overrides,
    });
    endFrame();
    return state.frame;
  };
  t.after(() => capture.dispose());
  return {
    clock,
    observable,
    canvases,
    state,
    engine,
    capture,
    render,
    endFrame,
  };
}

test("idle allocates/copies nothing; request copies only the first new end-frame and freezes its metadata", async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 8; i++) f.endFrame();
  assert.equal(f.observable.hasObservers(), false);
  assert.equal(f.canvases.length, 0);
  const pending = f.capture.capture();
  assert.equal(
    f.canvases.length,
    0,
    "request itself must not read the old canvas",
  );
  f.endFrame();
  assert.equal(
    f.canvases.length,
    0,
    "endFrame alone does not prove a new scene render",
  );
  const rendered = f.render({ backend: "webgpu", quality: "medium" });
  const expected = structuredClone(rendered);
  const canvas = f.canvases[0];
  assert.deepEqual([canvas.width, canvas.height], [1920, 1080]);
  assert.deepEqual(canvas.draws[0], [
    f.state.source,
    0,
    0,
    3840,
    2160,
    0,
    0,
    1920,
    1080,
  ]);
  assert.equal(canvas.encodes[0].type, "image/webp");
  assert.equal(canvas.encodes[0].quality, 0.9);
  assert.equal(f.observable.hasObservers(), false);
  rendered.position.x = 1000;
  rendered.camera.yaw = 8;
  rendered.cssWidth = 500;
  f.render();
  const png = image("image/png");
  canvas.finish(png);
  const result = await pending;
  assert.equal(result.image, png);
  assert.deepEqual(result.capture, {
    state: "ready",
    requestedAtMs: 100,
    capturedAtMs: 116,
    width: 1920,
    height: 1080,
    mimeType: "image/png",
    frame: expected,
  });
  assert.equal(f.canvases.length, 1);
  assert.equal(canvas.draws.length, 1);
  assert.deepEqual([canvas.width, canvas.height, f.clock.jobs.size], [0, 0, 0]);
});

test("stale ids, times, future metadata and resized-but-unrendered buffers are skipped", async (t) => {
  const f = fixture(t);
  const pending = f.capture.capture();
  f.endFrame();
  f.state.frame = null;
  f.endFrame();
  f.state.frame = frame({ frameId: 2, renderCompletedAtMs: 90 });
  f.endFrame();
  f.state.frame = frame({ frameId: 3, renderCompletedAtMs: 200 });
  f.endFrame();
  f.state.source!.width = 1920;
  f.state.frame = frame({ frameId: 4, renderCompletedAtMs: 100 });
  f.endFrame();
  assert.equal(f.canvases.length, 0);
  const actual = f.render();
  f.canvases[0].finish();
  assert.deepEqual((await pending).capture.frame, actual);
});

test("dimensions come from the copied frame after a resize; portrait is bounded without upscaling", async (t) => {
  const f = fixture(t);
  for (const [width, height, expected] of [
    [2160, 3840, [1080, 1920]],
    [640, 480, [640, 480]],
    [3840, 3840, [1920, 1920]],
    [32768, 1, [1920, 1]],
  ] as const) {
    const pending = f.capture.capture();
    f.state.source!.width = width;
    f.state.source!.height = height;
    f.render();
    const canvas = f.canvases.at(-1)!;
    assert.deepEqual([canvas.width, canvas.height], expected);
    assert.ok(canvas.width * canvas.height <= FEEDBACK_LIMITS.imagePixels);
    canvas.finish();
    const result = await pending;
    assert.deepEqual(
      [result.capture.frame!.renderWidth, result.capture.frame!.renderHeight],
      [width, height],
    );
    assert.deepEqual([result.capture.width, result.capture.height], expected);
  }
});

test("missing view settles immediately and loss of view while waiting removes the observer", async (t) => {
  const f = fixture(t);
  const source = f.state.source;
  f.state.source = null;
  assert.equal((await f.capture.capture()).capture.reason, "no-view");
  assert.equal(f.observable.hasObservers(), false);
  assert.equal(f.clock.jobs.size, 0);
  f.state.source = source;
  const pending = f.capture.capture();
  f.state.source = null;
  f.endFrame();
  assert.equal((await pending).capture.reason, "no-view");
  assert.equal(f.observable.hasObservers(), false);
  assert.equal(f.canvases.length, 0);
  assert.equal(f.clock.jobs.size, 0);
});

test("stopped loop times out; loop with no successful new render reports no-frame", async (t) => {
  const f = fixture(t);
  const stopped = f.capture.capture();
  f.clock.advance(2499);
  assert.equal(f.observable.hasObservers(), true);
  f.clock.advance(1);
  assert.equal((await stopped).capture.reason, "timeout");
  const failed = f.capture.capture();
  f.state.readThrows = true;
  f.endFrame();
  f.clock.advance(2500);
  assert.equal((await failed).capture.reason, "no-frame");
  assert.equal(f.observable.hasObservers(), false);
  assert.equal(f.clock.jobs.size, 0);
  assert.equal(f.canvases.length, 0);
});

test("PNG fallback and actual JPEG/WebP MIME are kept; bad/empty/oversized results have no image", async (t) => {
  const f = fixture(t);
  for (const blob of [
    image("image/webp"),
    image("image/png"),
    image("image/jpeg"),
    null,
    new Blob([], { type: "image/png" }),
    image("image/gif"),
    image(""),
    new Blob([new Uint8Array(FEEDBACK_LIMITS.imageBytes + 1)], {
      type: "image/png",
    }),
  ]) {
    const pending = f.capture.capture();
    f.render();
    const canvas = f.canvases.at(-1)!;
    canvas.finish(blob);
    const result = await pending;
    if (
      blob &&
      blob.size > 0 &&
      blob.size <= FEEDBACK_LIMITS.imageBytes &&
      ["image/png", "image/webp", "image/jpeg"].includes(blob.type)
    ) {
      assert.equal(result.capture.state, "ready");
      assert.equal(result.capture.mimeType, blob.type);
      assert.equal(result.image, blob);
    } else {
      assert.equal(result.capture.reason, "encoding");
      assert.equal(result.image, null);
    }
    assert.equal(
      canvas.encodes.length,
      1,
      "do not retry with another native encode",
    );
    assert.equal(f.clock.jobs.size, 0);
  }
});

test("copy/context/encoder exceptions settle without changing the source canvas", async (t) => {
  const f = fixture(t);
  for (const mode of ["context", "copy", "encode"] as const) {
    f.state.configureCanvas = (canvas) => {
      canvas.contextAvailable = mode !== "context";
      canvas.copyThrows = mode === "copy";
      canvas.encodeThrows = mode === "encode";
    };
    const pending = f.capture.capture();
    f.render();
    assert.equal((await pending).capture.reason, "encoding");
    assert.deepEqual(
      [f.state.source!.width, f.state.source!.height],
      [3840, 2160],
    );
    assert.equal(f.clock.jobs.size, 0);
    assert.equal(f.observable.hasObservers(), false);
    const canvas = f.canvases.at(-1)!;
    assert.deepEqual([canvas.width, canvas.height], [0, 0]);
  }
});

test("concurrent requests are bounded while waiting and encoding", async (t) => {
  const f = fixture(t);
  const pending = f.capture.capture();
  for (let i = 0; i < 30; i++)
    assert.equal((await f.capture.capture()).capture.reason, "busy");
  assert.equal(f.observable.observers.length, 1);
  f.render();
  for (let i = 0; i < 30; i++)
    assert.equal((await f.capture.capture()).capture.reason, "busy");
  assert.equal(f.canvases.length, 1);
  f.canvases[0].finish();
  assert.equal((await pending).capture.state, "ready");
});

test("abort before copy removes timer/observer; even a saved stale observer cannot capture a later draft", async (t) => {
  const f = fixture(t);
  const controller = new AbortController();
  const pending = f.capture.capture(controller.signal);
  const oldObserver = f.observable.observers[0];
  controller.abort();
  assert.equal((await pending).capture.reason, "cancelled");
  assert.equal(f.observable.hasObservers(), false);
  assert.equal(f.clock.jobs.size, 0);
  assert.equal(
    (await f.capture.capture(controller.signal)).capture.reason,
    "cancelled",
  );
  const next = f.capture.capture();
  oldObserver.callback(f.engine as AbstractEngine, {} as EventState);
  assert.equal(f.canvases.length, 0);
  f.render();
  f.canvases[0].finish();
  assert.equal((await next).capture.state, "ready");
});

test("abort during encode settles now and keeps one encoder slot until its late callback", async (t) => {
  const f = fixture(t);
  const controller = new AbortController();
  const pending = f.capture.capture(controller.signal);
  f.render();
  const oldCanvas = f.canvases[0];
  controller.abort();
  const result = await pending;
  assert.equal(result.capture.reason, "cancelled");
  assert.equal(result.image, null);
  assert.deepEqual([oldCanvas.width, oldCanvas.height], [0, 0]);
  assert.equal((await f.capture.capture()).capture.reason, "busy");
  oldCanvas.finish();
  const next = f.capture.capture();
  f.render();
  const newCanvas = f.canvases[1];
  oldCanvas.finish(image("image/png"));
  assert.deepEqual([newCanvas.width, newCanvas.height], [1920, 1080]);
  assert.equal(
    f.clock.jobs.size,
    1,
    "old completion must not clear new encoder timeout",
  );
  newCanvas.finish();
  assert.equal((await next).capture.state, "ready");
  assert.equal(result.capture.state, "unavailable");
});

test("hard encoder timeout releases a hung operation; its eventual callback cannot touch the next canvas", async (t) => {
  const f = fixture(t);
  const first = f.capture.capture();
  f.render();
  const oldCanvas = f.canvases[0];
  f.clock.advance(5000);
  assert.equal((await first).capture.reason, "timeout");
  assert.deepEqual([oldCanvas.width, oldCanvas.height], [0, 0]);
  const next = f.capture.capture();
  f.render();
  const newCanvas = f.canvases[1];
  oldCanvas.finish();
  assert.deepEqual([newCanvas.width, newCanvas.height], [1920, 1080]);
  assert.equal(f.clock.jobs.size, 1);
  newCanvas.finish();
  assert.equal((await next).capture.state, "ready");
});

test("cancelled hung encode also expires, and dispose is idempotent before/after copying", async (t) => {
  const f = fixture(t);
  const controller = new AbortController();
  const pending = f.capture.capture(controller.signal);
  f.render();
  controller.abort();
  assert.equal((await pending).capture.reason, "cancelled");
  f.clock.advance(5000);
  const next = f.capture.capture();
  f.capture.dispose();
  f.capture.dispose();
  assert.equal((await next).capture.reason, "cancelled");
  assert.equal((await f.capture.capture()).capture.reason, "cancelled");
  assert.equal(f.observable.hasObservers(), false);
  assert.equal(f.clock.jobs.size, 0);
  f.endFrame();
  assert.equal(f.canvases.length, 1);

  const duringEncode = fixture(t);
  const encoding = duringEncode.capture.capture();
  duringEncode.render();
  duringEncode.capture.dispose();
  assert.equal((await encoding).capture.reason, "cancelled");
  assert.deepEqual(
    [duringEncode.canvases[0].width, duringEncode.canvases[0].height],
    [0, 0],
  );
  duringEncode.canvases[0].finish();
  assert.equal(duringEncode.clock.jobs.size, 0);
});

test("synchronous disposal from frame or canvas callbacks never starts a later encode", async (t) => {
  for (const stage of [
    "request-frame",
    "end-frame",
    "create",
    "context",
    "copy",
  ] as const) {
    const f = fixture(t);
    if (stage === "request-frame")
      f.state.onFrameRead = () => f.capture.dispose();
    const pending = f.capture.capture();
    if (stage === "end-frame") f.state.onFrameRead = () => f.capture.dispose();
    if (stage === "create") f.state.configureCanvas = () => f.capture.dispose();
    if (stage === "context")
      f.state.configureCanvas = (canvas) => {
        canvas.onContext = () => f.capture.dispose();
      };
    if (stage === "copy")
      f.state.configureCanvas = (canvas) => {
        canvas.onDraw = () => f.capture.dispose();
      };
    f.render();
    assert.equal((await pending).capture.reason, "cancelled", stage);
    assert.equal(f.observable.hasObservers(), false, stage);
    assert.equal(f.clock.jobs.size, 0, stage);
    for (const canvas of f.canvases) {
      assert.equal(canvas.encodes.length, 0, stage);
      assert.deepEqual([canvas.width, canvas.height], [0, 0], stage);
    }
  }
});

test("a reentrant frame callback can reserve only one request", async (t) => {
  const f = fixture(t);
  let inner: ReturnType<RenderedFrameCapture["capture"]> | undefined;
  f.state.onFrameRead = () => {
    f.state.onFrameRead = () => {};
    inner = f.capture.capture();
  };
  const outer = await f.capture.capture();
  assert.equal(outer.capture.reason, "busy");
  assert.equal(f.observable.observers.length, 1);
  f.render();
  f.canvases[0].finish();
  assert.equal((await inner!).capture.state, "ready");
  assert.equal(f.clock.jobs.size, 0);
});

test("Game dispose/rejoin shares one encoder lock until the old native callback", async (t) => {
  const oldGame = fixture(t);
  const newGame = fixture(t);
  const oldRequest = oldGame.capture.capture();
  oldGame.render();
  oldGame.capture.dispose();
  assert.equal((await oldRequest).capture.reason, "cancelled");
  assert.equal((await newGame.capture.capture()).capture.reason, "busy");
  assert.equal(newGame.canvases.length, 0);
  assert.equal(newGame.observable.hasObservers(), false);
  oldGame.canvases[0].finish();
  const next = newGame.capture.capture();
  newGame.render();
  oldGame.canvases[0].finish(image("image/png"));
  const thirdGame = fixture(t);
  assert.equal((await thirdGame.capture.capture()).capture.reason, "busy");
  assert.deepEqual(
    [newGame.canvases[0].width, newGame.canvases[0].height],
    [1920, 1080],
  );
  newGame.canvases[0].finish();
  assert.equal((await next).capture.state, "ready");
});

test("old Game hard timeout releases only its lock; a late native result cannot unlock a new Game", async (t) => {
  const oldGame = fixture(t);
  const newGame = fixture(t);
  const oldRequest = oldGame.capture.capture();
  oldGame.render();
  oldGame.capture.dispose();
  assert.equal((await oldRequest).capture.reason, "cancelled");
  oldGame.clock.advance(5000);
  const next = newGame.capture.capture();
  newGame.render();
  oldGame.canvases[0].finish();
  assert.deepEqual(
    [newGame.canvases[0].width, newGame.canvases[0].height],
    [1920, 1080],
  );
  const thirdGame = fixture(t);
  assert.equal((await thirdGame.capture.capture()).capture.reason, "busy");
  assert.equal(newGame.clock.jobs.size, 1);
  newGame.canvases[0].finish();
  assert.equal((await next).capture.state, "ready");
});

test("two waiting Game instances still copy and encode at most one bitmap", async (t) => {
  const firstGame = fixture(t);
  const secondGame = fixture(t);
  const first = firstGame.capture.capture();
  const second = secondGame.capture.capture();
  firstGame.render();
  secondGame.render();
  assert.equal((await second).capture.reason, "busy");
  assert.equal(secondGame.canvases.length, 0);
  assert.equal(secondGame.observable.hasObservers(), false);
  firstGame.canvases[0].finish();
  assert.equal((await first).capture.state, "ready");
});
