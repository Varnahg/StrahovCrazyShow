import assert from "node:assert/strict";
import { test } from "node:test";
import { AdaptiveQualityController, type AdaptiveFrameInput, type AdaptiveQualityOptions } from "../client/adaptive-quality";
import { RENDER_BUDGETS, isRenderQualityMode, isRenderTargetFps } from "../shared/render-quality";
import { analysePresentationIntervals, measurePresentationRate } from "../client/presentation-rate";

function harness(options: AdaptiveQualityOptions = {}) {
  const controller = new AdaptiveQualityController(options);
  let nowMs = 0;
  controller.update({ nowMs, frameMs: 1000 / 60, visible: true });
  return {
    controller,
    get nowMs() { return nowMs; },
    run(durationMs: number, frameMs: number, values: Partial<AdaptiveFrameInput> = {}) {
      const end = nowMs + durationMs;
      while (nowMs + frameMs <= end + 1e-7) {
        nowMs += frameMs;
        controller.update({ nowMs, frameMs, visible: true, ...values });
      }
      return controller.state;
    },
    frame(frameMs: number, values: Partial<AdaptiveFrameInput> = {}) {
      nowMs += frameMs;
      return controller.update({ nowMs, frameMs, visible: true, ...values });
    },
  };
}

test("startup shaders do not immediately lower quality; sustained overload does", () => {
  const h = harness();
  const warm = h.run(7500, 100);
  assert.equal(warm.quality, "medium");
  assert.equal(warm.hardwareScaling, 1);
  assert.equal(warm.revision, 0);
  const overloaded = h.run(6000, 100);
  assert.ok(overloaded.hardwareScaling > 1);
  assert.equal(overloaded.reason, "sustained-slow");
  assert.ok(overloaded.statistics!.averageFps < 11);
});

test("a single long frame and moderate timing jitter do not cause degradation", () => {
  const h = harness({ initialQuality: "high" });
  h.run(10000, 1000 / 60);
  h.frame(150);
  for (let i = 0; i < 600; i++) h.frame(i % 2 ? 16 : 17.3333333333);
  assert.equal(h.controller.state.hardwareScaling, 1);
  assert.equal(h.controller.state.quality, "high");
});

test("slow frames use real elapsed windows at 60 and 144 FPS goals", () => {
  const a = harness({ targetFps: 60 }), b = harness({ targetFps: 144 });
  a.run(20000, 1000 / 40);
  b.run(20000, 1000 / 96);
  assert.ok(Math.abs(a.controller.state.revision - b.controller.state.revision) <= 1);
  assert.ok(a.controller.state.hardwareScaling >= 1.2);
  assert.ok(b.controller.state.hardwareScaling >= 1.2);
});

test("continuous GPU overload reaches a bounded floor, preserving world budgets", () => {
  const h = harness({ initialQuality: "high" });
  const state = h.run(100000, 1000 / 20, { cpuFrameMs: 5, gpuFrameMs: 40 });
  assert.equal(state.quality, "low");
  assert.equal(state.hardwareScaling, 2);
  assert.equal(state.renderScale, 0.5);
  assert.equal(state.reason, "minimum-quality");
  assert.equal(state.budgets.architectureDetailMetres, 55);
  assert.equal(state.budgets.avatarMediumMetres, 36);
  const revision = state.revision;
  assert.equal(h.run(20000, 50).revision, revision);
});

test("measured CPU limit lowers scene detail before reducing pixels", () => {
  const h = harness({ initialQuality: "high" });
  const state = h.run(15000, 1000 / 30, { cpuFrameMs: 28, gpuFrameMs: 7 });
  assert.ok(state.quality === "medium" || state.quality === "low");
  assert.equal(state.hardwareScaling, 1);
  assert.equal(state.reason, "cpu-bound");
  assert.ok(state.statistics!.averageCpuFrameMs! > state.statistics!.averageGpuFrameMs!);
});

test("without an actual GPU timing query, RAF and CPU durations cannot prove CPU bound", () => {
  const h = harness();
  const state = h.run(15000, 1000 / 30, { cpuFrameMs: 28 });
  assert.equal(state.quality, "medium");
  assert.ok(state.hardwareScaling > 1);
  assert.equal(state.statistics!.averageGpuFrameMs, null);
  assert.equal(state.reason, "sustained-slow");
});

test("manual quality remains fixed even at low FPS and switching back resumes adaptation", () => {
  const h = harness({ mode: "high" });
  const fixed = h.run(60000, 100);
  assert.equal(fixed.quality, "high");
  assert.equal(fixed.hardwareScaling, 1);
  assert.equal(fixed.reason, "manual");
  assert.equal(fixed.statistics!.averageFps, 10);
  h.controller.setMode("auto");
  assert.ok(h.run(10000, 100).hardwareScaling > 1);
  h.controller.setMode("low");
  assert.equal(h.controller.state.hardwareScaling, 1.3);
  assert.equal(h.controller.state.quality, "low");
});

test("hidden tabs and fixed-condition benchmarks cannot poison quality history", () => {
  const h = harness({ initialQuality: "high" });
  h.run(12000, 1000 / 60);
  const revision = h.controller.state.revision;
  assert.equal(h.run(60000, 100, { visible: false }).reason, "hidden");
  h.run(2500, 100);
  assert.equal(h.controller.state.revision, revision);
  assert.equal(h.run(30000, 100, { suspended: true }).reason, "suspended");
  h.run(2500, 100);
  assert.equal(h.controller.state.revision, revision);
  assert.ok(h.run(5000, 100).revision > revision);
});

test("long tab gaps and invalid clock samples reset or leave measurements unchanged", () => {
  const h = harness();
  h.run(11000, 1000 / 60);
  const state = h.controller.state;
  assert.equal(h.controller.update({ nowMs: NaN, frameMs: 16, visible: true }), state);
  assert.equal(h.controller.update({ nowMs: h.nowMs - 1, frameMs: 16, visible: true }), state);
  assert.equal(h.controller.update({ nowMs: h.nowMs + 1, frameMs: -1, visible: true }), state);
  h.frame(5000);
  assert.equal(h.controller.state.reason, "warmup");
  assert.equal(h.run(2500, 100).revision, state.revision);
});

test("recovery waits for sustained healthy presentation and failed probes back off", () => {
  const h = harness();
  h.run(14000, 1000 / 30);
  const degraded = h.controller.state.hardwareScaling;
  assert.ok(degraded > 1);
  h.run(8000, 1000 / 60);
  assert.equal(h.controller.state.hardwareScaling, degraded);
  h.run(7000, 1000 / 60);
  const probed = h.controller.state.hardwareScaling;
  assert.ok(probed < degraded);
  for (let i = 0; i < 240 && h.controller.state.hardwareScaling !== degraded; i++) h.frame(1000 / 30);
  assert.equal(h.controller.state.hardwareScaling, degraded, "failed recovery restores the known state");
  const revision = h.controller.state.revision;
  h.run(25000, 1000 / 60);
  assert.equal(h.controller.state.revision, revision, "no repeated up/down quality oscillation");
});

test("targets do not impose a 60 FPS cap and only an independent ceiling limits the goal", () => {
  const h = harness({ initialQuality: "high", targetFps: 60 });
  h.run(15000, 1000 / 144);
  assert.ok(Math.abs(h.controller.state.statistics!.averageFps - 144) < 1e-6);
  assert.equal(h.controller.state.effectiveTargetFps, 60);
  h.controller.setTargetFps(144);
  assert.equal(h.controller.state.effectiveTargetFps, 144);
  h.controller.setPresentationHz(60);
  assert.equal(h.controller.state.targetFps, 144);
  assert.equal(h.controller.state.effectiveTargetFps, 60);
  h.run(20000, 1000 / 60);
  assert.equal(h.controller.state.hardwareScaling, 1);
  h.controller.setPresentationHz(null);
  assert.equal(h.controller.state.effectiveTargetFps, 144);
});

test("limited scaling still permits lower scene detail; presets and validators are explicit", () => {
  const h = harness({ initialQuality: "high", maxHardwareScaling: 1.1 });
  const state = h.run(60000, 50);
  assert.equal(state.hardwareScaling, 1.1);
  assert.equal(state.quality, "low");
  for (const key of ["low", "medium", "high"] as const) {
    assert.ok(Object.isFrozen(RENDER_BUDGETS[key]));
    assert.ok(RENDER_BUDGETS[key].architectureDetailMetres > RENDER_BUDGETS[key].grassRangeMetres);
  }
  assert.ok(isRenderQualityMode("auto"));
  assert.ok(!isRenderQualityMode("ultra"));
  assert.ok(isRenderTargetFps(144));
  assert.ok(!isRenderTargetFps(30));
});

test("idle presentation cadence recognizes 60 and 144 Hz without deriving a ceiling from the game", () => {
  for (const hz of [60, 120, 144, 240]) {
    const result = analysePresentationIntervals(Array.from({ length: 150 }, (_, i) => 1000 / hz + (i % 2 ? 0.1 : -0.1)));
    assert.ok(result.reliable);
    assert.ok(Math.abs(result.observedBrowserHz! - hz) < hz * 0.03);
    assert.equal(result.reason, "ok");
  }
  const jitter = analysePresentationIntervals(Array.from({ length: 150 }, (_, i) => i % 3 ? 16.7 : 33.4));
  assert.equal(jitter.reliable, false);
  assert.equal(jitter.observedBrowserHz, null);
  assert.equal(jitter.reason, "unstable-cadence");
  assert.equal(analysePresentationIntervals([16.7, NaN, 0, -10]).reliable, false);
});

test("presentation preflight never starts timers without a browser", async () => {
  const result = await measurePresentationRate();
  assert.equal(result.reason, "unsupported");
  assert.equal(result.observedBrowserHz, null);
});
