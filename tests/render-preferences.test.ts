import test from "node:test";
import assert from "node:assert/strict";
import { createRenderPreferences, parseRenderPreferences, resolveVisualSettings, toCustomRenderPreferences, sameRenderPreferences, RENDER_BUDGETS, MANUAL_HARDWARE_SCALING } from "../shared/render-quality";
import { AdaptiveQualityController } from "../client/adaptive-quality";

test("legacy preferences preserve mode, goal and existing preset budgets", () => {
  for (const mode of ["auto", "low", "medium", "high"] as const) {
    const preferences = parseRenderPreferences({ mode, targetFps: 144 });
    assert.deepEqual(preferences, { version: 2, mode, targetFps: 144 });
    const effective = resolveVisualSettings(preferences);
    const quality = mode === "auto" ? "medium" : mode;
    assert.equal(effective.quality, quality);
    assert.equal(effective.budgets, RENDER_BUDGETS[quality]);
    assert.equal(effective.hardwareScaling, mode === "auto" ? 1 : MANUAL_HARDWARE_SCALING[quality]);
    assert.equal(effective.features.shadows, true);
    assert.equal(effective.features.postProcesses, quality !== "low");
  }
});

test("Ultra resolves to low budgets, exactly half dimensions and disabled optional features", () => {
  const state = resolveVisualSettings(createRenderPreferences("ultra"));
  assert.equal(state.mode, "ultra"); assert.equal(state.quality, "low");
  assert.equal(state.hardwareScaling, 2); assert.equal(state.renderScale, .5);
  assert.equal(state.budgets, RENDER_BUDGETS.low);
  assert.deepEqual(state.features, { shadows: false, clouds: false, groundVegetation: false, trees: "far-only", postProcesses: false });
});

test("custom snapshots actual automatic detail and scale without sharing mutable preferences", () => {
  const effective = resolveVisualSettings(createRenderPreferences("auto", 120), { quality: "low", hardwareScaling: 1.65 });
  const custom = toCustomRenderPreferences(effective);
  assert.equal(custom.quality, "low"); assert.equal(custom.renderScale, 1 / 1.65); assert.equal(custom.targetFps, 120);
  assert.notEqual(custom.features, effective.features); assert.ok(Object.isFrozen(custom.features));
  assert.deepEqual(resolveVisualSettings(custom), { ...effective, mode: "custom" });
  assert.ok(sameRenderPreferences(custom, parseRenderPreferences(JSON.parse(JSON.stringify(custom)))));
});

test("custom effects are independent from base quality and presets reset them", () => {
  const base = toCustomRenderPreferences(resolveVisualSettings(createRenderPreferences("low")));
  const custom = parseRenderPreferences({ ...base, features: { ...base.features, postProcesses: true, clouds: false } });
  const resolved = resolveVisualSettings(custom);
  assert.equal(resolved.quality, "low"); assert.equal(resolved.features.clouds, false);
  assert.equal(resolved.budgets.postProcesses, true); assert.equal(RENDER_BUDGETS.low.postProcesses, false);
  assert.equal(resolveVisualSettings(createRenderPreferences("low")).features.clouds, true);
  assert.equal(sameRenderPreferences(base, custom), false);
});

test("invalid or future persisted values fall back safely without invoking getters", () => {
  for (const input of [null, [], 3, { version: 99, mode: "ultra" }, { version: 2, mode: "unknown" }])
    assert.equal(parseRenderPreferences(input).mode, "auto");
  const good = toCustomRenderPreferences(resolveVisualSettings(createRenderPreferences("ultra")));
  for (const scale of [.49, 1.01, NaN, Infinity, "0.5", null])
    assert.equal(parseRenderPreferences({ ...good, renderScale: scale }).mode, "auto");
  assert.equal(parseRenderPreferences({ ...good, features: { ...good.features, shadows: "false" } }).mode, "auto");
  let reads = 0;
  const object = Object.defineProperty({}, "mode", { get() { reads++; throw Error("getter invoked"); } });
  assert.equal(parseRenderPreferences(object).mode, "auto"); assert.equal(reads, 0);
  assert.equal(parseRenderPreferences({ mode: "invalid", targetFps: 120 }).targetFps, 120);
});

test("ultra and custom stay manual despite sustained slow or fast frames", () => {
  for (const preferences of [createRenderPreferences("ultra"), toCustomRenderPreferences(resolveVisualSettings(createRenderPreferences("medium")))]) {
    const controller = new AdaptiveQualityController({ preferences });
    const initial = controller.state;
    for (let nowMs = 0; nowMs < 100000; nowMs += 40) controller.update({ nowMs, frameMs: 40, visible: true });
    assert.equal(controller.state.quality, initial.quality);
    assert.equal(controller.state.hardwareScaling, initial.hardwareScaling);
    assert.deepEqual(controller.state.features, initial.features);
    assert.equal(controller.state.revision, initial.revision);
  }
});

test("manual conversion freezes current auto state and selecting a preset replaces overrides", () => {
  const controller = new AdaptiveQualityController({ initialQuality: "high" });
  for (let nowMs = 0; nowMs < 30000; nowMs += 50) controller.update({ nowMs, frameMs: 50, visible: true });
  const previous = controller.state;
  controller.setMode("custom");
  assert.equal(controller.state.quality, previous.quality); assert.equal(controller.state.hardwareScaling, previous.hardwareScaling);
  controller.setPreferences(createRenderPreferences("ultra"));
  assert.equal(controller.state.renderScale, .5); assert.equal(controller.state.features.shadows, false);
  const revision = controller.state.revision;
  controller.setPreferences(createRenderPreferences("ultra")); assert.equal(controller.state.revision, revision);
  controller.setTargetFps(144); assert.equal(controller.preferences.targetFps, 144); assert.equal(controller.state.mode, "ultra");
  controller.setMode("high"); assert.equal(controller.state.quality, "high"); assert.equal(controller.state.renderScale, 1); assert.equal(controller.state.features.shadows, true);
});
