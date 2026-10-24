import { Game } from "../../client/game";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { zoneAt } from "../../shared/world";
import { PlayerFlashlight } from "../../client/flashlight";
// @ts-expect-error Pure test-only JavaScript.
import * as replay from "./replay.mjs";
const {
  createReplayCursor,
  createRecordedWeatherPlayer,
  assertRenderedReplayState,
  cleanupReplayGame,
  settleReplayFrame,
} = replay;

const query = new URLSearchParams(location.search);
const id = query.get("scenario") ?? "outdoor-car-20261018";
const speed = Number(query.get("speed") ?? 1);
if (
  !["b6-20261017", "outdoor-car-20261018"].includes(id) ||
  !Number.isFinite(speed) ||
  speed < 1 ||
  speed > 100
)
  throw new Error("Neplatný testový scénář nebo rychlost.");
const scenario = await fetch("/__replay/fixture/" + id).then((r) => {
  if (!r.ok) throw new Error("Scénář se nepodařilo načíst.");
  return r.json();
});
const cursor = createReplayCursor(scenario);
const applyRecordedWeather = createRecordedWeatherPlayer();
const panel = document.createElement("pre");
panel.id = "recorded-walkthrough";
panel.setAttribute("role", "status");
Object.assign(panel.style, {
  position: "fixed",
  zIndex: "10000",
  left: "8px",
  top: "8px",
  maxWidth: "650px",
  whiteSpace: "pre-wrap",
  background: "#102820ed",
  color: "#fff",
  font: "13px monospace",
  padding: "12px",
  pointerEvents: "none",
});
document.body.append(panel);
const report: any = {
  scenario: id,
  source: scenario.source,
  sourceHash: document
    .querySelector('meta[name="replay-source"]')
    ?.getAttribute("content"),
  scope:
    "sampled-render-state / guest / observed effective quality / inferred actor yaw",
  speed,
  status: "waiting",
  renderedSamples: 0,
  processedEvents: 0,
  frames: 0,
  zones: [],
  errors: [],
  negativeControl: query.get("stopAfterFirstSample") === "1",
  omittedLightingOverride: query.get("omitLightingOverride") === "1",
  settingsCheckedFrames: 0,
  maxPositionErrorMetres: 0,
  maxCameraErrorMetres: 0,
  limitations: scenario.limitations,
};
const zones = new Set<string>();
let startedAt = 0,
  latest: any,
  lastState: any,
  lastTextAt = -Infinity,
  finishAt = 0,
  published = false,
  lastFrameAt = 0;
let active: Game | undefined;
let startupDeadline = window.setTimeout(
  () => fail("Timeout před startem testového rendereru."),
  180000,
);
let recordedWeather: any, renderedSky: any, renderedTorch: boolean | undefined;
let restoreSky: (() => void) | undefined;
function show() {
  panel.textContent = `Test ${id} · ${report.status}\n${report.renderedSamples} vzorků · ${report.processedEvents} změn · ${report.frames} snímků\n${Math.round((latest?.atMs ?? 0) / 1000)} / ${Math.round(scenario.durationMs / 1000)} s · rychlost ${speed}×\nPatra/zóny: ${[...zones].join(", ")}\n${report.errors.map((e: any) => e.message).join("\n")}\nPouze renderové přehrání. Řízení, kolize a síť se tímto netestují.`;
  panel.dataset.status = report.status;
}
async function publish() {
  if (published) return;
  published = true;
  clearTimeout(startupDeadline);
  clearInterval(watchdog);
  report.wallDurationMs = startedAt ? performance.now() - startedAt : 0;
  report.zones = [...zones];
  report.completedAtUTC = new Date().toISOString();
  try {
    if (active) {
      report.health = active.renderHealth.snapshot();
      report.renderErrors = active.renderErrorCount;
      report.assetErrors = active.assetLoadErrorCount;
      report.viewport = {
        width: active.canvas.clientWidth,
        height: active.canvas.clientHeight,
      };
      report.renderResolution = {
        width: active.engine.getRenderWidth(),
        height: active.engine.getRenderHeight(),
      };
      report.backend = active.engine.isWebGPU ? "webgpu" : "webgl2";
      report.gpu = active.engine.isWebGPU
        ? (active.engine as any).getInfo?.()
        : (active.engine as any).getGlInfo?.();
    }
  } catch (error) {
    report.status = "failed";
    report.errors.push({ message: "Report snapshot: " + String(error) });
  }
  // Validate after the current endFrame and, on WebGPU, submitted work.
  try {
    if (report.status === "complete") await settleReplayFrame(active);
    else await Promise.resolve();
  } catch (error) {
    report.status = "failed";
    report.errors.push({ message: "Final frame: " + String(error) });
  }
  if (active) {
    report.health = active.renderHealth.snapshot();
    report.renderErrors = active.renderErrorCount;
    report.assetErrors = active.assetLoadErrorCount;
    if (
      report.status === "complete" &&
      (!report.health.valid || report.renderErrors || report.assetErrors)
    ) {
      report.status = "failed";
      report.errors.push({
        message: "Renderer selhal při konečném odevzdání snímku.",
      });
    }
  }
  restoreWrappers();
  try {
    report.cleanup = cleanupReplayGame(active);
  } catch (error) {
    report.status = "failed";
    report.errors.push({ message: "Cleanup: " + String(error) });
  }
  show();
  try {
    const result = await fetch("/__replay/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    if (!result.ok) throw new Error("HTTP " + result.status);
    panel.dataset.saved = "true";
  } catch (error) {
    panel.dataset.saved = "false";
    panel.textContent += "\nUložení reportu selhalo: " + String(error);
  }
}

function fail(error: unknown) {
  if (published || report.status === "failed") return;
  report.errors.push({ message: String(error).slice(0, 2000) });
  report.status = "failed";
  void publish();
}
window.addEventListener("error", (e) => fail(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => fail(e.reason));
document.addEventListener("visibilitychange", () => {
  if (startedAt && !published && document.hidden)
    fail("Test ztratil viditelnost; běh je neplatný.");
});
const watchdog = window.setInterval(() => {
  if (!startedAt || published) return;
  const health = active?.renderHealth.snapshot();
  if (
    !active?.ready ||
    active.disposed ||
    health?.errorCount ||
    performance.now() - lastFrameAt > 15000
  )
    fail("Renderer přestal vytvářet snímky: " + JSON.stringify(health));
  else if (performance.now() - startedAt > scenario.durationMs / speed + 180000)
    fail("Vypršel celkový čas přehrání.");
}, 1000);
show();

const prototype = Game.prototype as any;
const originalStart = prototype.start;
const originalFrame = prototype.frame;
const originalAdvance = prototype.advanceSimulation;
const originalCamera = prototype.updateCameraFollow;
const flashlightPrototype = PlayerFlashlight.prototype as any;
const originalFlashlightUpdate = flashlightPrototype.update;
function restoreWrappers() {
  prototype.start = originalStart;
  prototype.frame = originalFrame;
  prototype.advanceSimulation = originalAdvance;
  prototype.updateCameraFollow = originalCamera;
  flashlightPrototype.update = originalFlashlightUpdate;
  restoreSky?.();
}
flashlightPrototype.update = function (this: PlayerFlashlight, ...args: any[]) {
  if (active && this === (active as any).flashlight) renderedTorch = args[2];
  return originalFlashlightUpdate.apply(this, args);
};
prototype.start = function (this: Game) {
  active = this;
  const sky = (this as any).skyWeather,
    originalSkyUpdate = sky.update;
  sky.update = function (this: unknown, ...args: any[]) {
    renderedSky = args[0];
    return originalSkyUpdate.apply(this, args);
  };
  restoreSky = () => {
    sky.update = originalSkyUpdate;
  };
  clearTimeout(startupDeadline);
  startupDeadline = window.setTimeout(
    () => fail("Timeout startu testového rendereru."),
    180000,
  );
  return originalStart.call(this).catch((error: unknown) => {
    fail(error);
    throw error;
  });
};
prototype.advanceSimulation = function (this: Game, ...args: any[]) {
  const result = originalAdvance.apply(this, args);
  if (this === active && latest?.state && !published) {
    const state = latest.state;
    this.actor.setPosition(state.position);
    this.actor.yaw = state.camera.yaw; // Actor heading was not recorded.
    (this as any).previousPosition.copyFromFloats(
      state.position.x,
      state.position.y,
      state.position.z,
    );
    (this as any).visualOffset.setAll(0);
    (this as any).capturePreviousCarPose();
  }
  return result;
};
prototype.updateCameraFollow = function (this: Game, ...args: any[]) {
  const result = originalCamera.apply(this, args);
  if (this === active && latest?.state && !published) {
    const state = latest.state,
      camera = state.camera;
    this.camera.position.set(camera.x, camera.y, camera.z);
    this.camera.fov = camera.fov;
    this.camera.setTarget(
      camera.firstPerson && !state.vehicle
        ? new Vector3(
            camera.x + Math.sin(camera.yaw),
            camera.y - camera.pitch,
            camera.z + Math.cos(camera.yaw),
          )
        : new Vector3(
            state.position.x,
            state.position.y + (state.vehicle ? 0.7 : 0.6),
            state.position.z,
          ),
    );
  }
  return result;
};
prototype.frame = function (this: Game) {
  if (!this.ready || this.disposed || published)
    return originalFrame.call(this);
  active = this;
  try {
    const now = performance.now();
    if (document.hidden)
      throw new Error("Přehrání začalo nebo pokračovalo ve skryté kartě.");
    if (!startedAt) {
      startedAt = now;
      clearTimeout(startupDeadline);
      report.status = "running";
      report.rendererId = this.renderHealth.rendererId;
      if (
        (query.get("renderBackend")?.startsWith("webgpu") ?? false) !==
        this.engine.isWebGPU
      )
        throw new Error("Požadovaný a skutečný renderer se neshodují.");
    }
    if (now - startedAt > scenario.durationMs / speed + 180000)
      throw new Error("Timeout přehrání; žádné body nebudou přeskočené.");
    if (this.network)
      throw new Error("Renderové přehrání vyžaduje izolovaného hosta.");
    latest = cursor.advance((now - startedAt) * speed);
    const state = latest.state;
    if (state) {
      if (this.actor.vehicle !== state.vehicle)
        this.actor.setVehicle(state.vehicle);
      if (!lastState || lastState.rendering.quality !== state.rendering.quality)
        this.setQuality(state.rendering.quality);
      (this as any).applyRenderQuality(
        state.rendering.quality,
        state.rendering.hardwareScaling,
      );
      if (!report.omittedLightingOverride)
        this.timeOverride = state.lightingInstant;
      recordedWeather = applyRecordedWeather(this, state.weather);
      this.yaw = state.camera.yaw;
      this.pitch = state.camera.pitch;
      (this as any).lastCameraInput = now;
      this.distance = state.camera.distance;
      this.firstPerson = state.camera.firstPerson;
      if (this.flashlightOn !== state.flashlight && !state.vehicle)
        this.toggleFlashlight();
      lastState = state;
    }
    const before = this.scene.getFrameId();
    renderedSky = undefined;
    renderedTorch = undefined;
    const result = originalFrame.call(this);
    if (this.scene.getFrameId() === before)
      throw new Error("Scéna neodevzdala nový snímek.");
    lastFrameAt = performance.now();
    report.frames++;
    if (state) {
      assertRenderedReplayState(
        {
          lightingInstant: renderedSky?.instant,
          quality: renderedSky?.quality,
          weather: renderedSky?.weather,
          hardwareScaling: this.engine.getHardwareScalingLevel(),
          flashlight: (this as any).flashlight ? renderedTorch : false,
        },
        state,
        recordedWeather,
      );
      report.settingsCheckedFrames++;
      const actual = this.actor.position,
        camera = this.camera.globalPosition;
      const positionError = Math.hypot(
        actual.x - state.position.x,
        actual.y - state.position.y,
        actual.z - state.position.z,
      );
      const cameraError = Math.hypot(
        camera.x - state.camera.x,
        camera.y - state.camera.y,
        camera.z - state.camera.z,
      );
      report.maxPositionErrorMetres = Math.max(
        report.maxPositionErrorMetres,
        positionError,
      );
      report.maxCameraErrorMetres = Math.max(
        report.maxCameraErrorMetres,
        cameraError,
      );
      if (positionError > 0.02 || cameraError > 0.02)
        throw new Error("Přehraná poloha/kamera se neshoduje se scénářem.");
    }
    if (latest.milestone?.type === "sample") {
      report.renderedSamples++;
      zones.add(zoneAt(this.actor.position));
    }
    if (latest.milestone?.type === "event") report.processedEvents++;
    if (report.negativeControl && report.renderedSamples === 1)
      this.engine.stopRenderLoop();
    const health = this.renderHealth.snapshot();
    if (
      health.errorCount ||
      ["invalid", "restart-required", "disposed"].includes(health.phase) ||
      this.renderErrorCount ||
      this.assetLoadErrorCount
    )
      throw new Error(
        JSON.stringify({
          health,
          renderErrors: this.renderErrorCount,
          assetErrors: this.assetLoadErrorCount,
        }),
      );
    if (now - lastTextAt > 500) {
      lastTextAt = now;
      show();
    }
    if (latest.done) {
      finishAt ||= now;
      if (now - finishAt >= 500 && health.valid) {
        const expectedZones = new Set(
          scenario.timeline
            .filter((item: any) => item.type === "sample")
            .map((item: any) => item.state.zone),
        );
        if (
          [...expectedZones].some(
            (zone) => typeof zone === "string" && !zones.has(zone),
          )
        )
          throw new Error("Přehrání nepokrylo všechny zaznamenané zóny.");
        report.status = "complete";
        report.elapsedScenarioMs = latest.atMs;
        void publish();
      }
    }
    return result;
  } catch (error) {
    fail(error);
    throw error;
  }
};
window.addEventListener(
  "pagehide",
  () => {
    clearTimeout(startupDeadline);
    clearInterval(watchdog);
    restoreWrappers();
    cleanupReplayGame(active);
  },
  { once: true },
);
await import("../../client/main");
