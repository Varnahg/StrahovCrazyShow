import { strict as assert } from "node:assert";
import test, { type TestContext } from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ProductionMeshTrace } from "../client/production-mesh-trace";

class TestButton extends EventTarget {
  readonly style = { cssText: "" };
  readonly dataset: Record<string, string> = {};
  removed = false;
  setAttribute() {}
  remove() { this.removed = true; }
  click() { this.dispatchEvent(new Event("click")); }
}

function browser(t: TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  Object.defineProperties(engine, {
    isWebGPU: { value: true, configurable: true },
    compatibilityMode: { value: true, configurable: true },
    snapshotRendering: { value: false, configurable: true },
  });

  const location = { hash: "#mesh-capture", hostname: "strahov.reomnik.com", protocol: "https:" };
  const button = new TestButton();
  const document = {
    hidden: false,
    focused: true,
    appends: 0,
    hasFocus: () => document.focused,
    createElement: () => button,
    body: { append: () => document.appends++ },
  };
  for (const [key, value] of Object.entries({ window: { location }, document })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }

  let now = 0;
  let drawMs = 0;
  let renders = 0;
  const marks: { name: string; options: PerformanceMeasureOptions }[] = [];
  const cleared: string[] = [];
  t.mock.method(performance, "now", () => now);
  t.mock.method(performance, "measure", (name: string, options: PerformanceMeasureOptions) => {
    marks.push({ name, options });
  });
  t.mock.method(performance, "clearMeasures", (name: string) => cleared.push(name));
  t.mock.method(scene, "render", () => { renders++; now += drawMs; });
  const trace = ProductionMeshTrace.create(scene)!;
  t.after(() => {
    trace.dispose();
    scene.dispose();
    engine.dispose();
  });
  const frame = (start: number, duration: number, previous = 16) => {
    now = start;
    drawMs = duration;
    trace.render(start, previous, { x: 10, y: 1, z: 20 });
  };
  return { scene, engine, location, document, button, trace, frame, marks, cleared, renders: () => renders };
}

test("the capture button is opt-in on the exact supported origins and renderer", (t) => {
  const { scene, engine, location, document, frame, marks, renders } = browser(t);
  assert.equal(document.appends, 0);
  frame(5, 2);
  frame(20, 2);
  assert.equal(renders(), 2);
  assert.equal(document.appends, 1);
  assert.equal(marks.length, 0);

  location.hash = "";
  assert.equal(ProductionMeshTrace.create(scene), undefined);
  location.hash = "#mesh-capture";
  location.hostname = "other.strahov.reomnik.com";
  assert.equal(ProductionMeshTrace.create(scene), undefined);
  location.hostname = "strahov.reomnik.com";
  location.protocol = "http:";
  assert.equal(ProductionMeshTrace.create(scene), undefined);
  location.hostname = "127.0.0.1";
  assert.ok(ProductionMeshTrace.create(scene));
  Object.defineProperty(engine, "compatibilityMode", { value: false });
  assert.equal(ProductionMeshTrace.create(scene), undefined);
});

test("a late next frame exports the preceding mesh report even when its render was quick", (t) => {
  const { frame, button, marks, cleared, document, trace, renders } = browser(t);
  frame(100, 2);
  document.focused = false;
  button.click();
  assert.equal(button.dataset.meshTraceState, "idle");
  document.focused = true;
  button.click();
  assert.equal(button.dataset.meshTraceState, "recording");

  frame(110, 4);
  frame(126, 4);
  frame(142, 4);
  frame(244, 80, 102);
  frame(340, 4, 96);
  button.click();

  assert.equal(renders(), 6);
  assert.equal(button.dataset.meshTraceState, "idle");
  assert.deepEqual(marks.map(({ name }) => name), [
    "Strahov mesh draw #1", "Strahov mesh draw #3", "Strahov mesh draw #4", "Strahov mesh capture",
  ]);
  const [, gap, slowRender, summary] = marks.map(({ options }) => options);
  assert.equal(gap.start, 142);
  assert.equal(gap.duration, 4);
  assert.equal(gap.detail.followingGapMs, 102);
  assert.deepEqual(gap.detail.position, { x: 10, y: 1, z: 20 });
  assert.equal(slowRender.duration, 80);
  assert.equal(summary.detail.captureId, gap.detail.captureId);
  assert.equal(summary.detail.frames, 5);
  assert.equal(summary.detail.slowFrames, 2);
  assert.equal(summary.detail.detailedFrames, 3);
  assert.equal(summary.detail.missingFollowingInterval, 1);
  assert.equal(summary.detail.stopReason, "user");
  assert.deepEqual(cleared, marks.map(({ name }) => name));

  button.click();
  frame(360, 4);
  document.hidden = true;
  frame(380, 3);
  assert.equal(button.dataset.meshTraceState, "idle");
  assert.equal(marks.at(-1)?.options.detail.stopReason, "focus-lost");
  assert.notEqual(marks.at(-1)?.options.detail.captureId, summary.detail.captureId);
  trace.dispose();
  assert.equal(button.removed, true);
  button.click();
  assert.equal(button.dataset.meshTraceState, "idle");
});

test("a capture stops before profiling frames past its wall-time or frame limit", (t) => {
  const { frame, button, marks } = browser(t);
  frame(100, 0);
  button.click();
  frame(110, 3);
  frame(12_100, 3);
  assert.equal(marks.at(-1)?.options.detail.stopReason, "elapsed");
  assert.equal(marks.at(-1)?.options.detail.frames, 1);

  button.click();
  for (let index = 0; index <= 1_800; index++) frame(12_110 + index * 3, 0);
  assert.equal(button.dataset.meshTraceState, "idle");
  assert.equal(marks.at(-1)?.options.detail.stopReason, "frame-limit");
  assert.equal(marks.at(-1)?.options.detail.frames, 1_800);
});
