import type { Scene } from "@babylonjs/core/scene";
import { DenseMeshDrawProfile, type DenseMeshDrawFrame } from "./dense-mesh-draw-profile";

const CAPTURE_MS = 12_000;
const FRAME_LIMIT = 1_800;
const SLOW_FRAME_MS = 50;
const DETAIL_LIMIT = 250;
const BUILD_ID = import.meta.env?.VITE_CLIENT_BUILD_ID ?? "development-unidentified";

type Position = { x: number; y: number; z: number };
type StopReason = "elapsed" | "frame-limit" | "focus-lost" | "user" | "scene-dispose";
type Frame = {
  index: number;
  frameStarted: number;
  priorFrameMs: number;
  profileStarted: number;
  renderStarted: number;
  renderEnded: number;
  profileFinalizeMs: number;
  previousReportMs: number;
  position: Position;
  mesh: DenseMeshDrawFrame;
};
type Capture = {
  id: string;
  started: number;
  profile: DenseMeshDrawProfile;
  previous?: Frame;
  frames: number;
  detailedFrames: number;
  slowFrames: number;
  omittedDetails: number;
  outputErrors: number;
  missingFollowingInterval: number;
  drawHooksUnavailable: number;
  incompletePhaseFrames: number;
  drawCalls: number;
  meshCalls: number;
  recordedCalls: number;
  droppedCalls: number;
  failedCalls: number;
  nestedCalls: number;
  selectedCalls: number;
  boundCalls: number;
  renderFailures: number;
  maxRenderMs: number;
  maxFollowingFrameMs: number;
  maxProfileSetupMs: number;
  maxProfileFinalizeMs: number;
  maxPreviousReportMs: number;
};

function measure(name: string, start: number, duration: number, detail: object) {
  performance.measure(name, { start, duration, detail });
  // Exported Blink trace data is separate from the page's Performance buffer.
  performance.clearMeasures(name);
}

export class ProductionMeshTrace {
  private button?: HTMLButtonElement;
  private capture?: Capture;
  private disposed = false;

  static create(scene: Scene): ProductionMeshTrace | undefined {
    if (typeof window === "undefined") return;
    const { hash, hostname, protocol } = window.location;
    if (hash !== "#mesh-capture") return;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
    if (!local && (hostname !== "strahov.reomnik.com" || protocol !== "https:")) return;
    const engine = scene.getEngine();
    if (engine.isWebGPU && engine.compatibilityMode && !engine.snapshotRendering) {
      return new ProductionMeshTrace(scene);
    }
  }

  private constructor(private readonly scene: Scene) {}

  private addButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Zahájit měření meshů (max. 12 s)";
    button.style.cssText = "position:fixed;right:1rem;bottom:5rem;z-index:1000;" +
      "color:white;background:#202a37;border:1px solid #8292a6;border-radius:6px;padding:.6rem .8rem;cursor:pointer";
    button.addEventListener("click", this.toggle);
    button.dataset.meshTraceState = "idle";
    button.setAttribute("aria-pressed", "false");
    document.body.append(button);
    this.button = button;
  }

  private toggle = () => {
    if (this.capture) {
      this.stop("user");
      return;
    }
    if (!this.button || document.hidden || !document.hasFocus()) return;

    const profile = new DenseMeshDrawProfile(this.scene);
    this.capture = {
      id: crypto.randomUUID(),
      started: performance.now(),
      profile,
      frames: 0,
      detailedFrames: 0,
      slowFrames: 0,
      omittedDetails: 0,
      outputErrors: 0,
      missingFollowingInterval: 0,
      drawHooksUnavailable: 0,
      incompletePhaseFrames: 0,
      drawCalls: 0,
      meshCalls: 0,
      recordedCalls: 0,
      droppedCalls: 0,
      failedCalls: 0,
      nestedCalls: 0,
      selectedCalls: 0,
      boundCalls: 0,
      renderFailures: 0,
      maxRenderMs: 0,
      maxFollowingFrameMs: 0,
      maxProfileSetupMs: 0,
      maxProfileFinalizeMs: 0,
      maxPreviousReportMs: 0,
    };
    this.button.dataset.meshTraceState = "recording";
    this.button.textContent = "Ukončit měření meshů";
    this.button.setAttribute("aria-pressed", "true");
  };

  private finalizePrevious(capture: Capture, nextFrameStarted?: number) {
    const frame = capture.previous;
    if (!frame) return;
    capture.previous = undefined;

    const renderMs = frame.renderEnded - frame.renderStarted;
    const followingGapMs = nextFrameStarted === undefined ? null : nextFrameStarted - frame.frameStarted;
    if (followingGapMs === null) capture.missingFollowingInterval++;
    else capture.maxFollowingFrameMs = Math.max(capture.maxFollowingFrameMs, followingGapMs);
    capture.maxRenderMs = Math.max(capture.maxRenderMs, renderMs);

    const slow = renderMs >= SLOW_FRAME_MS || (followingGapMs ?? 0) >= SLOW_FRAME_MS;
    if (slow) capture.slowFrames++;
    if (!slow && frame.index !== 1) return;
    if (capture.detailedFrames === DETAIL_LIMIT) {
      capture.omittedDetails++;
      return;
    }

    try {
      measure(`Strahov mesh draw #${frame.index}`, frame.renderStarted, renderMs, {
        schema: 1,
        captureId: capture.id,
        buildId: BUILD_ID,
        timeOrigin: performance.timeOrigin,
        index: frame.index,
        frameStarted: frame.frameStarted,
        priorFrameMs: frame.priorFrameMs,
        followingGapMs,
        profileStarted: frame.profileStarted,
        renderStarted: frame.renderStarted,
        profileFinalizeMs: frame.profileFinalizeMs,
        previousReportMs: frame.previousReportMs,
        position: frame.position,
        mesh: capture.profile.summarize(frame.mesh),
      });
      capture.detailedFrames++;
    } catch {
      capture.outputErrors++;
    }
  }

  private stop(reason: StopReason) {
    const capture = this.capture;
    if (!capture) return;
    this.capture = undefined;
    this.finalizePrevious(capture);
    capture.profile.dispose();

    const { id, started, profile: _profile, previous: _previous, ...counts } = capture;
    try {
      measure("Strahov mesh capture", started, performance.now() - started, {
        schema: 1,
        captureId: id,
        buildId: BUILD_ID,
        stopReason: reason,
        timeOrigin: performance.timeOrigin,
        startTime: started,
        captureLimitMs: CAPTURE_MS,
        frameLimit: FRAME_LIMIT,
        detailLimit: DETAIL_LIMIT,
        slowFrameMs: SLOW_FRAME_MS,
        ...counts,
      });
    } catch {
      capture.outputErrors++;
    }
    if (this.button) {
      const incomplete = capture.outputErrors || !capture.detailedFrames || capture.omittedDetails ||
        capture.drawHooksUnavailable || capture.incompletePhaseFrames || capture.droppedCalls || capture.renderFailures;
      this.button.dataset.meshTraceState = "idle";
      this.button.textContent = incomplete
        ? "Měření neúplné · spustit znovu"
        : "Měření ukončeno · spustit znovu";
      this.button.setAttribute("aria-pressed", "false");
    }
  }

  render(frameStarted: number, priorFrameMs: number, position: Position) {
    if (this.disposed) return;
    if (!this.button) this.addButton();

    const capture = this.capture;
    if (!capture) {
      this.scene.render();
      return;
    }
    const foreground = !document.hidden && document.hasFocus();
    const previousReportStarted = performance.now();
    this.finalizePrevious(capture, foreground ? frameStarted : undefined);
    const stopReason = !foreground ? "focus-lost"
      : frameStarted >= capture.started + CAPTURE_MS ? "elapsed"
      : capture.frames === FRAME_LIMIT ? "frame-limit" : null;
    if (stopReason) {
      this.stop(stopReason);
      this.scene.render();
      return;
    }

    const profileStarted = performance.now();
    const previousReportMs = profileStarted - previousReportStarted;
    capture.profile.beginFrame(profileStarted);
    const renderStarted = performance.now();
    let renderEnded: number | undefined;
    let mesh: DenseMeshDrawFrame;
    try {
      this.scene.render();
      renderEnded = performance.now();
    } catch (error) {
      capture.renderFailures++;
      throw error;
    } finally {
      mesh = capture.profile.endFrame();
    }
    const profileFinalizeMs = performance.now() - renderEnded;
    capture.frames++;
    capture.drawHooksUnavailable += Number(!mesh.meshHookIntact || !mesh.materialHookIntact || !mesh.bindHookIntact || !mesh.drawHooksIntact);
    capture.incompletePhaseFrames += Number(mesh.phaseCount === 0 || mesh.incompletePhases > 0);
    capture.drawCalls += mesh.drawCalls;
    capture.meshCalls += mesh.meshCalls;
    capture.recordedCalls += mesh.recordedCalls;
    capture.droppedCalls += mesh.droppedCalls;
    capture.failedCalls += mesh.failedCalls;
    capture.nestedCalls += mesh.nestedCalls;
    capture.selectedCalls += mesh.selectedCalls;
    capture.boundCalls += mesh.boundCalls;
    capture.maxProfileSetupMs = Math.max(capture.maxProfileSetupMs, renderStarted - profileStarted);
    capture.maxProfileFinalizeMs = Math.max(capture.maxProfileFinalizeMs, profileFinalizeMs);
    capture.maxPreviousReportMs = Math.max(capture.maxPreviousReportMs, previousReportMs);
    capture.previous = {
      index: capture.frames, frameStarted, priorFrameMs, profileStarted, renderStarted,
      renderEnded, profileFinalizeMs, previousReportMs,
      position: { x: position.x, y: position.y, z: position.z }, mesh,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop("scene-dispose");
    this.button?.removeEventListener("click", this.toggle);
    this.button?.remove();
    this.button = undefined;
  }
}
