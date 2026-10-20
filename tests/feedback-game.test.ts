import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { Observable } from "@babylonjs/core/Misc/observable";
import {
  RenderedFrameCapture,
  type RenderedFrameCaptureOptions,
} from "../client/rendered-frame-capture";

function actualCaptureMethod(implementation?: unknown) {
  const source = ts.createSourceFile(
    "game.ts",
    readFileSync(new URL("../client/game.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let method: ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isMethodDeclaration(node) &&
      node.name.getText(source) === "captureFeedback"
    )
      method = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(method);
  let owners = 0;
  const calls: unknown[] = [];
  let frame: (() => unknown) | undefined;
  class Capture {
    constructor(options: { engine: unknown; frame: () => unknown }) {
      owners++;
      frame = options.frame;
    }
    capture(signal: unknown) {
      calls.push(signal);
      return Promise.resolve({
        capture: { state: "unavailable" },
        image: null,
      });
    }
  }
  const js = ts.transpileModule(
    "const method = {" + method.getText(source) + "}.captureFeedback; method;",
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  return {
    method: new Script(js).runInNewContext({
      RenderedFrameCapture: implementation ?? Capture,
      performance: { timeOrigin: 0 },
    }),
    owners: () => owners,
    calls,
    frame: () => frame?.() as any,
  };
}
test("Game feedback does not allocate a capture or invent a frame before readiness/after failure", async () => {
  const m = actualCaptureMethod();
  for (const state of [
    { ready: false },
    { ready: true, disposed: true },
    { ready: true, rendererFailed: true },
  ]) {
    const result = await m.method.call(state);
    assert.equal(result.capture.state, "unavailable");
    assert.equal(result.image, null);
  }
  assert.equal(m.owners(), 0);
});
test("Game feedback reuses one copy owner and projects the actual render camera without rendering again", async () => {
  const m = actualCaptureMethod();
  let renders = 0;
  const state = {
    ready: true,
    disposed: false,
    rendererFailed: false,
    feedbackFrameId: 7,
    feedbackRenderCompletedAtMs: 100,
    engine: {
      isWebGPU: true,
      compatibilityMode: false,
      getRenderWidth: () => 1600,
      getRenderHeight: () => 900,
    },
    scene: { render: () => renders++ },
    canvas: { clientWidth: 1280, clientHeight: 720 },
    quality: "medium",
    localId: "guest",
    avatars: new Map([["guest", { root: { position: { x: 1, y: 2, z: 3 } } }]]),
    actor: { position: { x: 100, y: 200, z: 300 } },
    camera: {
      globalPosition: { x: 4, y: 5, z: 6 },
      rotation: { x: 0.2, y: 0.4 },
    },
  };
  await m.method.call(state);
  await m.method.call(state);
  assert.equal(m.owners(), 1);
  assert.equal(m.calls.length, 2);
  const frame = m.frame();
  assert.deepEqual(JSON.parse(JSON.stringify(frame.position)), {
    x: 1,
    y: 2,
    z: 3,
  });
  assert.equal(frame.camera.x, 4);
  assert.equal(frame.camera.yaw, 0.4);
  assert.equal(frame.frameId, 7);
  assert.equal(frame.renderCompletedAtMs, 100);
  assert.equal(frame.backend, "webgpu-fast");
  assert.equal(frame.renderWidth, 1600);
  assert.equal(frame.cssWidth, 1280);
  assert.equal(renders, 0);
  state.disposed = true;
  assert.equal(m.frame(), null);
});

test("ordinary Game render phase advances the real capture, while a thrown render never advances its identity", async () => {
  const source = ts.createSourceFile(
    "game.ts",
    readFileSync(new URL("../client/game.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let frame: ts.MethodDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === "frame")
      frame = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(frame?.body);
  const statements = [...frame.body.statements];
  const begin = statements.findIndex(
    (statement) => statement.getText(source) === "this.scene.render();",
  );
  const end = statements.findIndex(
    (statement, index) =>
      index > begin &&
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (declaration) => declaration.name.getText(source) === "engineWork",
      ),
  );
  assert.ok(
    begin >= 0 && end > begin,
    "actual ordinary render phase must be identifiable",
  );
  let now = 100,
    draws = 0,
    renders = 0;
  const js = ts.transpileModule(
    "(function renderPhase(){" +
      statements
        .slice(begin, end)
        .map((statement) => statement.getText(source))
        .join("\n") +
      "})",
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText;
  const renderPhase = new Script(js).runInNewContext({
    performance: { now: () => now },
  });
  const observable = new Observable<any>();
  const sourceCanvas = { width: 32, height: 24 } as HTMLCanvasElement;
  class Capture extends RenderedFrameCapture {
    constructor(options: RenderedFrameCaptureOptions) {
      super({
        ...options,
        environment: {
          now: () => now,
          createCanvas: () =>
            ({
              width: 0,
              height: 0,
              getContext: () => ({ drawImage: () => draws++ }),
              toBlob: (callback: BlobCallback) =>
                callback(new Blob(["frame bytes"], { type: "image/webp" })),
            }) as unknown as HTMLCanvasElement,
        },
      });
    }
  }
  const method = actualCaptureMethod(Capture).method;
  const state = {
    ready: true,
    disposed: false,
    rendererFailed: false,
    feedbackFrameId: 0,
    feedbackRenderCompletedAtMs: 0,
    engine: {
      isWebGPU: false,
      onEndFrameObservable: observable,
      getRenderingCanvas: () => sourceCanvas,
      getRenderWidth: () => 32,
      getRenderHeight: () => 24,
    },
    scene: {
      render: () => {
        renders++;
        now++;
      },
    },
    canvas: { clientWidth: 32, clientHeight: 24 },
    quality: "medium",
    localId: "guest",
    avatars: new Map(),
    actor: { position: { x: 1, y: 2, z: 3 } },
    camera: {
      globalPosition: { x: 4, y: 5, z: 6 },
      rotation: { x: 0.2, y: 0.4 },
    },
    feedbackCapture: undefined as RenderedFrameCapture | undefined,
  };
  try {
    const pending = method.call(state);
    observable.notifyObservers(state.engine);
    assert.equal(
      draws,
      0,
      "an endFrame without an ordinary render is not a fresh image",
    );
    renderPhase.call(state);
    observable.notifyObservers(state.engine);
    const captured = await pending;
    assert.equal(captured.capture.state, "ready");
    assert.equal(captured.capture.frame.frameId, 1);
    assert.equal(captured.capture.frame.renderCompletedAtMs, 101);
    assert.equal(captured.capture.frame.camera.x, 4);
    assert.equal(await captured.image.text(), "frame bytes");
    assert.equal(renders, 1);
    assert.equal(draws, 1);
    const controller = new AbortController();
    const failed = method.call(state, controller.signal);
    state.scene.render = () => {
      throw new Error("render failed");
    };
    assert.throws(() => renderPhase.call(state), /render failed/);
    observable.notifyObservers(state.engine);
    assert.equal(state.feedbackFrameId, 1);
    assert.equal(state.feedbackRenderCompletedAtMs, 101);
    assert.equal(draws, 1);
    controller.abort();
    assert.equal((await failed).capture.state, "unavailable");
  } finally {
    state.feedbackCapture?.dispose();
  }
});
