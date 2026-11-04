import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { setImmediate as turn } from "node:timers/promises";
import ts from "typescript";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Observable } from "@babylonjs/core/Misc/observable";
import { readGameSource } from "./helpers/game-source";
import { graphicsLifecycleFixture, graphicsFixtureEnvironment, graphicsFixtureMembers } from "./helpers/weather-door-render-fixture";
import { AdaptiveQualityController } from "../client/adaptive-quality";
import { GraphicsTransition, graphicsOperation, type GraphicsClock, type GraphicsTransitionHost } from "../client/graphics-transition";
import { NetworkTimeline } from "../client/network-timeline";
import { paintStartupStage } from "../client/startup-progress";
import { RenderHealth } from "../client/render-health";
import { waitForRenderStartup, type RenderStartupOptions, type RenderStartupHost } from "../client/render-startup";
import { prepareRenderQualities } from "../client/render-quality-preparation";
import { readWebGpuMainPassTiming } from "../client/gpu-diagnostics";
import { movementFromKeys, vehicleCameraCanFollow } from "../shared/controls";
import { canonicalInput, FIXED_DT } from "../shared/netcode";
import { CAD_DOOR_DEFINITIONS } from "../shared/cad-buildings";
import { createRenderPreferences, parseRenderPreferences, resolveVisualSettings, sameRenderPreferences, MANUAL_HARDWARE_SCALING, type GraphicsApplicationState, type RenderPreferences, type EffectiveVisualSettings } from "../shared/render-quality";
import type { Input } from "../shared/types";

const { source, selectMembers } = readGameSource();
const members = selectMembers([
  ...graphicsFixtureMembers, "applyRenderPreferences", "prepareGraphicsConfiguration", "cancelGraphicsApply",
  "applyAdaptiveQuality", "applyRenderQuality", "renderingSnapshot", "setUiModal", "clearHeldInput", "blur",
  "frame", "finishDiagnosticCallback", "advanceSimulation", "updateNetworkPresentation", "resize",
]);
const compiled = ts.transpileModule(`class ApplicationGame { ${members.map(member => member.getText(source)).join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  transformers: { before: [context => input => {
    const visit: ts.Visitor = node => ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword
      ? ts.factory.createIdentifier("testImportMeta") : ts.visitEachChild(node, visit, context);
    return ts.visitNode(input, visit) as ts.SourceFile;
  }] },
}).outputText;
const make = new Script(`env => {
  const { exports, createRenderPreferences, parseRenderPreferences, resolveVisualSettings, sameRenderPreferences, renderBudget,
    GraphicsTransition, graphicsOperation, WebGpuPipelinePreparation, WebGpuShaderPreparation, StartupMaterialReadiness,
    prepareRenderQualities, MANUAL_HARDWARE_SCALING, waitForRenderStartup, arePreparationEffectsReady,
    performance, document, paintStartupStage, sessionDiagnostics, readWebGpuMainPassTiming, vehicleCameraCanFollow,
    canonicalInput, movementFromKeys, FIXED_DT, CAD_DOOR_DEFINITIONS, testImportMeta } = env;
  ${compiled}; return ApplicationGame;
}`).runInThisContext();

/** Only replaces browser time. Game and GraphicsTransition retain their actual deadlines. */
class Clock implements GraphicsClock {
  time = 100;
  serial = 0;
  timers = new Map<number, { at: number; callback(): void }>();
  now = () => this.time;
  visible = () => true;
  observeVisibility = () => () => {};
  setTimer = (callback: () => void, milliseconds: number) => {
    const id = ++this.serial;
    this.timers.set(id, { at: this.time + milliseconds, callback });
    return id;
  };
  clearTimer = (id: unknown) => { this.timers.delete(id as number); };
  advance(milliseconds: number) {
    this.time += milliseconds;
    for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) {
      this.timers.delete(id); timer.callback();
    }
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}

/** Real Game transaction, configuration application and network/frame methods;
 * only GPU submission, scene owners and physics IO are bounded adapters. */
function fixture(t: import("node:test").TestContext, options: { nativeSubmission?: boolean; initialPreferences?: RenderPreferences } = {}) {
  const clock = new Clock(), submitted = deferred(), events: { kind: string; data: any }[] = [];
  const states: GraphicsApplicationState[] = [], sent: Input[] = [], stepped: Input[] = [], predicted: Input[] = [];
  const ownerFlags: { owner: string; value: unknown }[] = [], phases: unknown[] = [];
  const preparations: { timeout: number; mode: string; signal: AbortSignal; effective: EffectiveVisualSettings; finalRestore: boolean }[] = [];
  const submissionGates: RenderStartupOptions[] = [];
  const submissionFrames = new Map<number, () => void>();
  const scopes: { disposed: boolean }[] = [];
  const scheduledFrames = new Map<number, FrameRequestCallback>();
  let animationFrameId = 0;
  let draws = 0, authorities = 0, flushes = 0, ticks = 0, resizeCount = 0, scale = 1, normalPresentation = 0;
  let loop: (() => void) | undefined, gateCalls = 0, failingStatus: string | undefined, healthy = true;
  const timeline = new NetworkTimeline();
  const submissionHost: RenderStartupHost = {
    requestFrame(callback) { const id = ++animationFrameId; submissionFrames.set(id, callback); return id; },
    cancelFrame: id => { submissionFrames.delete(id); }, now: clock.now, visible: clock.visible,
    setTimer: clock.setTimer, clearTimer: clock.clearTimer, observeVisibility: clock.observeVisibility,
  };
  class PreparationAdapter {
    disposed = false;
    constructor() { scopes.push(this); }
    isReady() { return true; }
    prepareFrame() {}
    render(draw: () => void) { draw(); }
    dispose() { this.disposed = true; }
    assertHealthy() {}
  }
  const Game = make({
    ...graphicsFixtureEnvironment, exports: {}, parseRenderPreferences, sameRenderPreferences,
    GraphicsTransition: class extends GraphicsTransition<unknown> {
      constructor(host: GraphicsTransitionHost<unknown>) { super({ ...host, clock }); }
    },
    graphicsOperation, prepareRenderQualities, MANUAL_HARDWARE_SCALING,
    WebGpuPipelinePreparation: PreparationAdapter, WebGpuShaderPreparation: PreparationAdapter, StartupMaterialReadiness: PreparationAdapter,
    waitForRenderStartup: async (gate: RenderStartupOptions) => {
      gateCalls++;
      submissionGates.push(gate);
      if (options.nativeSubmission) return waitForRenderStartup(gate, submissionHost);
      assert.equal(gate.isReady(), true);
      gate.render();
      // A valid submitted frame remains independently held after readiness.
      if (gateCalls === 1 && !failingStatus) await graphicsOperation(submitted.promise, gate.signal!);
    },
    arePreparationEffectsReady: () => true,
    performance: { now: clock.now }, document: { hidden: false, pointerLockElement: null },
    paintStartupStage: (signal: AbortSignal) => paintStartupStage(signal, callback => {
      const id = ++animationFrameId;
      scheduledFrames.set(id, callback);
      queueMicrotask(() => {
        const frame = scheduledFrames.get(id);
        scheduledFrames.delete(id);
        frame?.(clock.time);
      });
      return id;
    }, id => { scheduledFrames.delete(id); }),
    sessionDiagnostics: { isRecording: true, event: (kind: string, data: unknown) => events.push({ kind, data }),
      recordFrame: (frame: unknown) => phases.push(frame) },
    readWebGpuMainPassTiming, vehicleCameraCanFollow, canonicalInput, movementFromKeys, FIXED_DT, CAD_DOOR_DEFINITIONS,
    testImportMeta: { env: { DEV: false } },
  });
  const adaptive = new AdaptiveQualityController({ preferences: options.initialPreferences ?? createRenderPreferences("medium") });
  const game: any = Object.assign(new Game(), {
    ...graphicsLifecycleFixture(), adaptive, ready: true, disposed: false, rendererFailed: false,
    appliedQualityRevision: -1, preparingRenderQuality: false, quality: "medium", uiModal: false,
    keys: new Set<string>(), canvas: { style: { cursor: "" } }, yaw: .3, lastCameraInput: 0,
    renderHealth: { snapshot: () => ({ valid: healthy, errorCount: healthy ? 0 : 1, phase: healthy ? "ready" : "failed" }), report: () => { healthy = false; } },
    onGraphicsState: (state: GraphicsApplicationState) => states.push(state),
    engine: { isWebGPU: true, getDeltaTime: () => 1000 / 60, getHardwareScalingLevel: () => scale,
      setHardwareScalingLevel: (value: number) => { scale = value; }, resize: () => { resizeCount++; },
      runRenderLoop: (callback: () => void) => { assert.equal(loop, undefined, "one preparation render owner"); loop = callback; },
      stopRenderLoop: (callback: () => void) => { if (loop === callback) loop = undefined; } },
    engineInstrumentation: { captureGPUFrameTime: false }, lastGpuCounterAt: -Infinity,
    compilationProfile: { shaderPreparationCompletions: 0 },
    gltfLightBudget: { prepareFrame() {} }, stableLights: { update() {} },
    scene: { isDisposed: false, imageProcessingConfiguration: { isEnabled: true }, objectRenderers: [],
      getActiveMeshes: () => ({ length: 0, data: [] }), render: () => { draws++; } },
    cinematic: { setVisualFeatures: (value: unknown) => ownerFlags.push({ owner: "cinematic", value }) },
    vehicleLighting: { setShadowsEnabled: (value: boolean) => ownerFlags.push({ owner: "car", value }) },
    flashlight: { setShadowsEnabled: (value: boolean) => ownerFlags.push({ owner: "torch", value }) },
    skyWeather: { setCloudsEnabled: (value: boolean) => ownerFlags.push({ owner: "clouds", value }) },
    vegetation: { stats: { pendingTreeLoads: 0 }, async setVisualFeatures(value: unknown) { ownerFlags.push({ owner: "vegetation", value }); } },
    actor: { position: { x: 1, y: 2, z: 3 }, yaw: .3, speed: 0, vehicle: false,
      step: (input: Input) => stepped.push(input), capture: () => ({}) },
    localId: "local", avatars: new Map(), updateWorldPresentation() {}, updateRenderEnvironment() {},
    updateFramePresentation() { normalPresentation++; return { pos: game.actor.position, self: undefined, cameraLight: false, time: 0 }; },
    prepareLightingVariants: async (_render: unknown, readiness: { isReady(): boolean }, options: { timeoutMs: number; signal: AbortSignal; restoreQuality?(): void }) => {
      assert.equal(readiness.isReady(), true);
      const effective = game.getEffectiveVisualSettings();
      preparations.push({ timeout: options.timeoutMs, mode: effective.mode, signal: options.signal, effective, finalRestore: !!options.restoreQuality });
      options.restoreQuality?.();
      return { status: preparations.length === 1 && failingStatus ? failingStatus : "complete", failureStep: null,
        stages: [], elapsedMs: 0, activeElapsedMs: 0, pausedMs: 0 };
    },
    network: true, networkTimeline: timeline, accumulator: 0, seq: 0, doorInputTickBase: 100,
    doorTimeline: { initialized: true, needsResync: false, revisionAt: () => 0 },
    restoreDoorTick() {}, predictionDoorRevisions: new Map(), previousPosition: Vector3.Zero(), capturePreviousCarPose() {},
    prediction: { push: (input: Input) => predicted.push(input) },
    sim: { tick: () => { ticks++; } },
    onBeforeInputFrame() {
      authorities++;
      const ack = Math.floor((clock.time - 100) / (1000 / 60));
      const accepted = timeline.acceptAuthority({ inputEpoch: 1, inputTickBase: 100, tick: 100 + ack, ack, time: 100_000 + ack * (1000 / 60) }, clock.time,
        { vehicle: game.actor.vehicle, yaw: game.yaw });
      assert.equal(accepted.accepted, true);
    },
    onInput: (input: Input) => sent.push(input), onInputFrame: () => { flushes++; },
    handleRendererFailure() { game.rendererFailed = true; },
  });
  let nativeHealth: RenderHealth | undefined;
  if (options.nativeSubmission) {
    Object.assign(game.engine, {
      onEffectErrorObservable: new Observable(), onContextLostObservable: new Observable(),
      onContextRestoredObservable: new Observable(), onDisposeObservable: new Observable(),
      _processFrame() {}, beginFrame() {}, endFrame() {},
      _device: Object.assign(new EventTarget(), {
        lost: new Promise(() => {}), pushErrorScope() {}, popErrorScope: async () => null,
        queue: { onSubmittedWorkDone: () => gateCalls === 1 ? submitted.promise : Promise.resolve() },
      }),
    });
    nativeHealth = new RenderHealth(game.engine, "game");
    assert.equal(nativeHealth.markReady(), true);
    game.renderHealth = nativeHealth;
  }
  game.applyAdaptiveQuality(adaptive.state);
  t.after(() => {
    game.graphicsTransition?.dispose(); submitted.resolve();
    nativeHealth?.dispose();
    assert.equal(clock.timers.size, 0); assert.equal(scheduledFrames.size, 0); assert.equal(submissionFrames.size, 0);
  });
  return { game, adaptive, clock, submitted, events, states, sent, stepped, predicted, phases, preparations, scopes, ownerFlags, submissionGates,
    failPreparation: (status: string) => { failingStatus = status; },
    async submissionFrame() {
      assert.ok(submissionFrames.size > 0, "a submission frame must be scheduled");
      for (const [id, callback] of [...submissionFrames]) { submissionFrames.delete(id); callback(); }
      await turn();
    },
    counts: () => ({ draws, authorities, flushes, ticks, resizeCount, normalPresentation, gateCalls }),
    loop: () => loop,
  };
}

test("actual live Apply keeps ready, authority consumption, neutral network input and flush active without normal scene draws", async t => {
  const f = fixture(t), previous = f.adaptive.preferences;
  const operation = f.game.applyRenderPreferences(createRenderPreferences("ultra"));
  await turn();
  assert.equal(f.game.ready, true);
  assert.equal(f.game.graphicsApplying, true);
  assert.equal(f.game.uiModal, true);
  assert.equal(f.counts().gateCalls, 1);
  assert.equal(f.adaptive.preferences, previous, "readiness alone cannot confirm settings before submission");
  assert.equal(await f.game.applyRenderPreferences(createRenderPreferences("high")), false, "Game rejects concurrent Apply");
  const before = f.counts();
  // Simulate held input arriving again while the overlay is open, after blur.
  for (const key of ["KeyW", "KeyA", "Space", "ShiftLeft"]) f.game.keys.add(key);
  for (const vehicle of [false, true]) {
    f.game.actor.vehicle = vehicle;
    f.clock.advance(20); f.game.frame();
  }
  const after = f.counts();
  assert.equal(after.authorities - before.authorities, 2);
  assert.equal(after.flushes - before.flushes, 2);
  assert.ok(after.ticks > before.ticks);
  assert.ok(f.sent.length > 0);
  assert.equal(f.predicted.length, f.stepped.length);
  assert.equal(after.draws, before.draws, "frame must yield rendering to the preparation owner");
  assert.equal(after.normalPresentation, before.normalPresentation);
  for (const input of [...f.sent, ...f.stepped]) {
    assert.equal(Math.abs(input.x), 0); assert.equal(Math.abs(input.z), 0);
    assert.equal(input.jump, false); assert.equal(input.run, false);
  }
  assert.ok(f.sent.some(input => input.vehicle));
  assert.ok(f.sent.some(input => !input.vehicle));
  assert.equal(f.phases.length, 2);
  for (const frame of f.phases as any[]) assert.deepEqual(frame.phases, { simulation: 0, world: 0, avatarsAndCamera: 0, environment: 0, render: 0, labels: 0 });
  f.submitted.resolve();
  assert.equal(await operation, true, JSON.stringify(f.states));
  assert.equal(f.game.ready, true);
  assert.equal(f.game.graphicsApplying, false);
  assert.equal(f.game.uiModal, false);
  assert.equal(f.adaptive.preferences.mode, "ultra");
  assert.equal(f.game.graphicsSettingsRevision, 1);
  assert.equal(f.loop(), undefined);
  assert.ok(f.scopes.every(scope => scope.disposed));
});

test("actual effective snapshot tracks applied scale/features while requested preferences wait for submission", async t => {
  const f = fixture(t);
  f.game.uiModal = true;
  const operation = f.game.applyRenderPreferences(createRenderPreferences("ultra"));
  await turn();
  const effective = resolveVisualSettings(createRenderPreferences("ultra"));
  const snapshot = f.game.renderingSnapshot;
  for (const key of ["mode", "quality", "hardwareScaling", "renderScale", "features", "budgets"] as const)
    assert.deepEqual(snapshot[key], effective[key]);
  assert.equal(snapshot.graphicsApplying, true);
  assert.equal(snapshot.transitionPhase, "preparing");
  assert.equal(snapshot.settingsRevision, 0);
  assert.equal(f.adaptive.preferences.mode, "medium");
  const request = f.events.find(event => event.kind === "visual-settings-request")!.data;
  assert.equal(request.requested.mode, "ultra");
  assert.equal(request.effective.mode, "medium");
  f.submitted.resolve(); assert.equal(await operation, true, JSON.stringify(f.states));
  assert.equal(f.game.uiModal, true, "Apply restores the menu's previous modal ownership");
  assert.equal(f.game.renderingSnapshot.settingsRevision, 1);
  assert.equal(f.game.renderingSnapshot.transitionPhase, null);
  f.game.resize();
  assert.equal(f.counts().resizeCount, 1);
  assert.equal(f.game.renderingSnapshot.hardwareScaling, 2);
  assert.ok(f.ownerFlags.some(flag => flag.owner === "car" && flag.value === false));
  assert.ok(f.ownerFlags.some(flag => flag.owner === "torch" && flag.value === false));
});

test("actual target deadline restores previous graphics without confirming timed-out preferences", async t => {
  const f = fixture(t), previous = f.adaptive.preferences;
  const operation = f.game.applyRenderPreferences(createRenderPreferences("ultra"));
  await turn(); f.clock.advance(60_000);
  assert.equal(await operation, false);
  assert.equal(f.adaptive.preferences, previous);
  assert.equal(f.game.graphicsSettingsRevision, 0);
  assert.equal(f.game.getEffectiveVisualSettings().mode, "medium", JSON.stringify(f.states));
  assert.equal(f.game.renderingSnapshot.hardwareScaling, 1);
  assert.equal(f.game.ready, true);
  assert.equal(f.game.graphicsApplying, false);
  assert.equal(f.game.uiModal, false);
  assert.deepEqual(f.preparations.map(pass => pass.mode), ["ultra", "medium"]);
  assert.ok(f.preparations.every(pass => pass.timeout <= 60_000));
  assert.ok(f.states.some(state => state.phase === "restoring"));
  assert.equal(f.states.at(-1)?.restartRequired, false);
  assert.match(f.states.at(-1)!.error!, /limit/);
  f.submitted.resolve(); await turn();
  assert.equal(f.adaptive.preferences, previous, "late submitted target cannot publish preferences");
  assert.ok(f.scopes.every(scope => scope.disposed));
  assert.equal(f.loop(), undefined);
});

test("actual non-complete lighting readiness rolls back without submitting the failed target", async t => {
  const f = fixture(t), previous = f.adaptive.preferences;
  f.failPreparation("timeout");
  assert.equal(await f.game.applyRenderPreferences(createRenderPreferences("ultra")), false);
  assert.equal(f.counts().gateCalls, 1, "only restored graphics reaches submission: " + JSON.stringify(f.states));
  assert.equal(f.adaptive.preferences, previous);
  assert.equal(f.game.graphicsSettingsRevision, 0);
  assert.equal(f.game.getEffectiveVisualSettings().mode, "medium");
  assert.match(f.states.at(-1)!.error!, /timeout/);
});

for (const [initial, target] of [["low", "high"], ["high", "ultra"]] as const)
test(`actual WebGL ${initial}-to-${target} failure restores previous scene grade before submission and ignores late completion`, async t => {
  const f = fixture(t, { initialPreferences: createRenderPreferences(initial) }), previous = f.adaptive.preferences;
  f.game.engine.isWebGPU = false;
  const grades: { quality: string; before: boolean }[] = [];
  let ownerQuality: string = initial, restoredDraws = 0;
  f.game.updateRenderEnvironment = () => {
    const config = f.game.scene.imageProcessingConfiguration;
    grades.push({ quality: f.game.quality, before: config.isEnabled });
    // The real cinematic quality transition is covered by its own tests. This
    // owner IO side effect isolates whether Game restores the captured flag.
    if (ownerQuality !== f.game.quality && f.game.quality === "high") config.isEnabled = false;
    ownerQuality = f.game.quality;
  };
  const render = f.game.scene.render;
  f.game.scene.render = () => {
    if (f.game.graphicsState.phase === "restoring") {
      restoredDraws++;
      assert.equal(f.game.scene.imageProcessingConfiguration.isEnabled, true,
        "the completed restored frame must retain the captured grade despite the quality owner's side effect");
    }
    render();
  };
  assert.equal(f.game.scene.imageProcessingConfiguration.isEnabled, true);
  const operation = f.game.applyRenderPreferences(createRenderPreferences(target));
  await turn();
  assert.equal(f.game.scene.imageProcessingConfiguration.isEnabled, target !== "high");
  assert.equal(f.adaptive.preferences, previous);
  assert.equal(f.game.graphicsApplying, true);
  f.clock.advance(60_000);
  assert.equal(await operation, false);
  assert.equal(f.adaptive.preferences, previous);
  assert.equal(f.game.getEffectiveVisualSettings().quality, initial);
  assert.equal(f.game.scene.imageProcessingConfiguration.isEnabled, true);
  const restore = grades.filter(sample => sample.quality === initial);
  assert.ok(restore.length > 0);
  assert.ok(restore.every(sample => sample.before), "the captured grade must precede restored environment/readiness work");
  assert.ok(restoredDraws > 0);
  assert.equal(f.states.at(-1)?.restartRequired, false);
  assert.equal(f.game.graphicsSettingsRevision, 0);
  const callsBeforeLateCompletion = grades.length;
  f.submitted.resolve(); await turn();
  assert.equal(f.game.scene.imageProcessingConfiguration.isEnabled, true);
  assert.equal(grades.length, callsBeforeLateCompletion);
  assert.equal(f.adaptive.preferences, previous);
});

test("actual live manual-to-Auto prepares all three qualities and restores the selected scale/features before submission", async t => {
  const initial: RenderPreferences = { version: 2, mode: "custom", targetFps: 60, quality: "medium", renderScale: .5,
    features: resolveVisualSettings(createRenderPreferences("ultra")).features };
  const f = fixture(t, { initialPreferences: initial }), previous = f.adaptive.preferences;
  const preferences = createRenderPreferences("auto");
  const expected = resolveVisualSettings(preferences, f.adaptive.state);
  const operation = f.game.applyRenderPreferences(preferences);
  await turn();
  assert.deepEqual(f.preparations.map(pass => pass.effective.quality), ["low", "high", "medium"]);
  assert.deepEqual(f.preparations.map(pass => pass.effective.hardwareScaling), [1.3, 1, 1]);
  assert.deepEqual(f.preparations.map(pass => pass.finalRestore), [false, false, true]);
  assert.ok(f.preparations.every(pass => pass.mode === "auto" && pass.timeout > 0 && pass.timeout <= 60_000));
  for (const pass of f.preparations)
    assert.deepEqual(pass.effective.features, resolveVisualSettings(preferences, pass.effective).features);
  assert.equal(f.counts().gateCalls, 1);
  assert.equal(f.adaptive.preferences, previous, "three preparation passes do not confirm requested Auto");
  assert.deepEqual(f.game.getEffectiveVisualSettings(), expected, "final readiness sees the restored scale and Auto effects");
  assert.equal(expected.hardwareScaling, 2);
  assert.equal(expected.features.shadows, true);
  assert.equal(expected.features.groundVegetation, true);
  assert.equal(f.game.graphicsSettingsRevision, 0);
  f.submitted.resolve();
  assert.equal(await operation, true, JSON.stringify(f.states));
  assert.equal(f.adaptive.preferences.mode, "auto");
  assert.deepEqual(f.game.getEffectiveVisualSettings(), expected);
  assert.equal(f.game.graphicsSettingsRevision, 1);
});

for (const mode of ["high", "ultra"] as const) test(`actual ${mode} final readiness preserves required tree/base/error gates`, async t => {
  const f = fixture(t);
  const operation = f.game.applyRenderPreferences(createRenderPreferences(mode));
  await turn();
  assert.equal(f.submissionGates.length, 1);
  const gate = f.submissionGates[0];
  assert.equal(gate.recoverableTimeout, true, "live submission timeout must permit rollback");
  f.game.vegetation.stats.pendingTreeLoads = 3;
  assert.equal(gate.isReady(), mode === "ultra", "only FAR-only can ignore pending detail requests");
  assert.equal(f.game.vegetation.stats.pendingTreeLoads, 3);
  f.game.pendingVisualLoad = true;
  assert.equal(gate.isReady(), false, "FAR-only still waits for the requested base load");
  f.game.pendingVisualLoad = false;
  f.game.vegetation.stats.loadError = "missing requested tree resource";
  assert.throws(() => gate.isReady(), /missing requested tree resource/);
  delete f.game.vegetation.stats.loadError;
  f.game.vegetation.stats.pendingTreeLoads = 0;
  assert.equal(gate.isReady(), true);
  f.submitted.resolve(); assert.equal(await operation, true);
});

test("actual 30s submission timeout leaves RenderHealth usable and Game restores confirmed graphics", async t => {
  const f = fixture(t, { nativeSubmission: true }), previous = f.adaptive.preferences;
  const operation = f.game.applyRenderPreferences(createRenderPreferences("ultra"));
  await turn(); await f.submissionFrame();
  assert.equal(f.submissionGates[0].timeoutMs, 30_000);
  assert.equal(f.submissionGates[0].recoverableTimeout, true);
  assert.equal(f.game.renderHealth.snapshot().phase, "ready");
  f.clock.advance(30_000);
  await turn();
  assert.equal(f.game.renderHealth.snapshot().errorCount, 0, "ordinary settings timeout is not a renderer fault");
  assert.equal(f.game.renderHealth.snapshot().phase, "ready");
  assert.equal(f.counts().gateCalls, 2, "restored configuration reaches its own submission gate");
  assert.equal(f.game.getEffectiveVisualSettings().mode, "medium");
  assert.equal(f.game.graphicsApplying, true);
  assert.equal(f.game.renderingSnapshot.transitionPhase, "restoring");
  await f.submissionFrame();
  assert.equal(await operation, false);
  assert.equal(f.adaptive.preferences, previous);
  assert.equal(f.game.graphicsSettingsRevision, 0);
  assert.equal(f.game.graphicsApplying, false);
  assert.equal(f.game.rendererFailed, false);
  assert.equal(f.states.at(-1)?.restartRequired, false);
  assert.match(f.states.at(-1)!.error!, /visible-time deadline/);
  f.submitted.resolve(); await turn();
  assert.equal(f.adaptive.preferences, previous, "late timed-out submission cannot confirm the target");
  assert.equal(f.game.renderHealth.snapshot().errorCount, 0);
  assert.ok(f.scopes.every(scope => scope.disposed));
});

test("actual submitted-frame gates accept repeated live Apply on an already-ready renderer", async t => {
  const f = fixture(t, { nativeSubmission: true });
  assert.equal(f.game.renderHealth.snapshot().valid, true);
  for (const [index, mode] of ["ultra", "high"].entries()) {
    const operation = f.game.applyRenderPreferences(createRenderPreferences(mode as "ultra" | "high"));
    await turn();
    assert.equal(f.game.graphicsApplying, true);
    assert.equal(f.game.renderHealth.snapshot().phase, "ready");
    if (index === 0) f.submitted.resolve();
    await f.submissionFrame();
    assert.equal(await operation, true, JSON.stringify(f.states));
    assert.equal(f.game.graphicsSettingsRevision, index + 1);
    assert.equal(f.adaptive.preferences.mode, mode);
    assert.equal(f.game.renderHealth.snapshot().valid, true);
    assert.equal(f.game.renderHealth.snapshot().errorCount, 0);
    assert.equal(f.game.rendererFailed, false);
  }
  assert.equal(f.submissionGates.length, 2);
  assert.equal(f.game.renderingSnapshot.hardwareScaling, 1);
  assert.ok(f.scopes.every(scope => scope.disposed));
});

test("actual device fault during live submission remains fatal despite recoverable timeout mode", async t => {
  const f = fixture(t, { nativeSubmission: true }), previous = f.adaptive.preferences;
  const operation = f.game.applyRenderPreferences(createRenderPreferences("ultra"));
  await turn(); await f.submissionFrame();
  f.game.renderHealth.report("device", new Error("device disconnected during settings"));
  assert.equal(await operation, false);
  assert.equal(f.counts().gateCalls, 1, "unusable renderer cannot enter rollback preparation");
  assert.equal(f.adaptive.preferences, previous);
  assert.equal(f.game.graphicsSettingsRevision, 0);
  assert.equal(f.states.at(-1)?.restartRequired, true);
  assert.equal(f.game.rendererFailed, true);
  assert.equal(f.game.renderHealth.snapshot().errorCount, 1);
});

for (const ending of ["completion", "rejection"] as const) test(`late vegetation ${ending} cannot clear or overwrite the latest load state`, async t => {
  const f = fixture(t), first = deferred(), second = deferred();
  let rejectFirst!: (failure: Error) => void;
  let calls = 0;
  f.game.vegetation.setVisualFeatures = () => ++calls === 1
    ? ending === "completion" ? first.promise : new Promise<void>((_resolve, reject) => { rejectFirst = reject; })
    : second.promise;
  const old = f.game.setVegetationFeatures(resolveVisualSettings(createRenderPreferences("high")).features);
  const current = f.game.setVegetationFeatures(resolveVisualSettings(createRenderPreferences("ultra")).features);
  if (ending === "completion") { first.resolve(); await old; }
  else { rejectFirst(new Error("retired load")); await assert.rejects(old, /retired load/); }
  assert.equal(f.game.pendingVisualLoad, true);
  assert.equal(f.game.visualLoadError, undefined);
  assert.deepEqual(f.game.vegetationPolicy, { groundVegetation: false, trees: "far-only" });
  second.resolve(); await current;
  assert.equal(f.game.pendingVisualLoad, false);
});
