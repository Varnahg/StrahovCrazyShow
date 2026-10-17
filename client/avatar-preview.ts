import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { AvatarConfig } from "../shared/types";
import { AvatarPrimitivePool, createAvatarRig } from "./avatar-renderer";
import { createGameEngine, selectRenderBackend } from "./render-engine";
import { RenderHealth, type RenderHealthSnapshot } from "./render-health";
import { SceneTextureDiagnostics } from "./texture-diagnostics";
import { OnDemandRender } from "./on-demand-render";

export type AvatarPreviewState = "loading" | "ready" | "unsupported" | "failed";
export type AvatarPreviewController = {
  update(config: AvatarConfig): void;
  rotate(radians: number): void;
  focus(detail: "body" | "face"): void;
  resetView(): void;
  health(): RenderHealthSnapshot;
  dispose(): void;
};
export type AvatarPreviewOptions = {
  signal?: AbortSignal;
  /** React may select another profile while adapter/textures/shaders initialize. */
  getCurrentConfig?: () => AvatarConfig;
  onState?: (state: AvatarPreviewState, error?: Error) => void;
};
export type PreviewShaderModule = {
  getCompilationInfo(): Promise<{
    messages: readonly { type: string; message: string }[];
  }>;
};
export type AvatarPreviewSurface = {
  update(config: AvatarConfig): void;
  rotate(radians: number): void;
  focus(detail: "body" | "face"): void;
  resetView(): void;
  resize(width: number, height: number): void;
  ready(): boolean;
  render(): void;
  shaderModules(): PreviewShaderModule[];
  dispose(): void;
};
/** Browser/GPU IO boundary used by the lifecycle regressions. */
export type AvatarPreviewRuntime = {
  unsupported(): boolean;
  createEngine(
    canvas: HTMLCanvasElement,
    signal?: AbortSignal,
  ): Promise<AbstractEngine>;
  createSurface(
    engine: AbstractEngine,
    config: AvatarConfig,
    textureError: () => void,
  ): AvatarPreviewSurface;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  visible(): boolean;
  density(): number;
  now(): number;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(handle: number): void;
  observeResize(canvas: HTMLCanvasElement, callback: () => void): () => void;
  observeVisibility(callback: () => void): () => void;
};

function abortError() {
  const error = new Error("Avatar preview initialization cancelled");
  error.name = "AbortError";
  return error;
}

function createSurface(
  engine: AbstractEngine,
  config: AvatarConfig,
  textureError: () => void,
): AvatarPreviewSurface {
  const scene = new Scene(engine);
  let pool: AvatarPrimitivePool | undefined;
  const textures = new SceneTextureDiagnostics(scene, textureError);
  try {
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0, 0, 0, 0);
    const camera = new ArcRotateCamera(
      "avatar preview",
      Math.PI * 0.41,
      1.41,
      3.65,
      new Vector3(0, 0.75, 0),
      scene,
    );
    camera.minZ = 0.05;
    camera.maxZ = 15;
    camera.fov = 0.62;
    const sky = new HemisphericLight(
      "preview ambient",
      new Vector3(0, 1, 0),
      scene,
    );
    sky.intensity = 0.65;
    sky.groundColor = Color3.FromHexString("#61665a");
    const key = new DirectionalLight(
      "preview key",
      new Vector3(-0.5, -0.8, -0.6),
      scene,
    );
    key.intensity = 1.05;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = 1;
    scene.imageProcessingConfiguration.exposure = 1.1;
    pool = new AvatarPrimitivePool(scene);
    const ownedPool = pool;
    let rig = createAvatarRig(scene, config, ownedPool, "preview");
    let detail: "body" | "face" = "body";
    let disposed = false;
    const pose = () => {
      camera.radius = detail === "face" ? 0.9 : 3.65;
      camera.target.set(
        0,
        (detail === "face" ? 1.565 : 0.75 / 1.03) * rig.root.scaling.y,
        0.015,
      );
      camera.beta = detail === "face" ? 1.46 : 1.41;
    };
    pose();
    return {
      update(next) {
        rig.root.dispose(false, false);
        rig = createAvatarRig(scene, next, ownedPool, "preview");
        ownedPool.pruneUnused();
        pose();
      },
      rotate(radians) {
        camera.alpha += radians;
      },
      focus(value) {
        detail = value;
        pose();
      },
      resetView() {
        camera.alpha = Math.PI / 2;
      },
      resize(width, height) {
        engine.setSize(width, height);
      },
      ready: () => scene.isReady() && engine.areAllEffectsReady(),
      render: () => scene.render(),
      shaderModules() {
        const modules = new Set<PreviewShaderModule>();
        for (const mesh of scene.meshes)
          for (const subMesh of mesh.subMeshes ?? []) {
            // Public effect/context access; pinned WebGPU context exposes stages.
            const context = subMesh.effect?.getPipelineContext() as {
              stages?: {
                vertexStage?: { module?: PreviewShaderModule };
                fragmentStage?: { module?: PreviewShaderModule };
              };
            } | null;
            for (const stage of [
              context?.stages?.vertexStage,
              context?.stages?.fragmentStage,
            ])
              if (stage?.module) modules.add(stage.module);
          }
        return [...modules];
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        textures.dispose();
        rig.root.dispose(false, false);
        ownedPool.dispose();
        scene.dispose();
      },
    };
  } catch (error) {
    textures.dispose();
    pool?.dispose();
    scene.dispose();
    throw error;
  }
}

const browserRuntime: AvatarPreviewRuntime = {
  unsupported: () =>
    selectRenderBackend(window.location) !== "webgl2" &&
    !(navigator as Navigator & { gpu?: unknown }).gpu,
  createEngine: (canvas, signal) => createGameEngine(canvas, { signal }),
  createSurface,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  visible: () => !document.hidden,
  density: () => Math.min(1.5, window.devicePixelRatio || 1),
  now: () => performance.now(),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (handle) => window.clearTimeout(handle),
  observeResize(canvas, callback) {
    const observer = new ResizeObserver(callback);
    let resolution: MediaQueryList | undefined;
    const bindResolution = () => {
      resolution = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`,
      );
      resolution.addEventListener("change", changedResolution);
    };
    const changedResolution = () => {
      resolution?.removeEventListener("change", changedResolution);
      bindResolution();
      callback();
    };
    const cleanup = () => {
      observer.disconnect();
      resolution?.removeEventListener("change", changedResolution);
      window.removeEventListener("resize", callback);
    };
    try {
      observer.observe(canvas);
      window.addEventListener("resize", callback);
      bindResolution();
      return cleanup;
    } catch (error) {
      cleanup();
      throw error;
    }
  },
  observeVisibility(callback) {
    document.addEventListener("visibilitychange", callback);
    return () => document.removeEventListener("visibilitychange", callback);
  },
};

type PreviewDevice = {
  pushErrorScope(filter: "validation"): void;
  popErrorScope(): Promise<{ message: string } | null>;
  queue: { onSubmittedWorkDone(): Promise<void> };
};

/** Resolves only after the latest requested avatar has a prepared, submitted,
 * validated frame. The resolved controller owns engine, scene and all listeners. */
export async function createAvatarPreview(
  canvas: HTMLCanvasElement,
  initial: AvatarConfig,
  options: AvatarPreviewOptions = {},
  runtime: AvatarPreviewRuntime = browserRuntime,
): Promise<AvatarPreviewController> {
  const signal = options.signal;
  if (signal?.aborted) throw abortError();
  if (runtime.unsupported()) {
    const error = new Error("WebGPU není v tomto prohlížeči dostupné.");
    error.name = "AvatarPreviewUnsupportedError";
    options.onState?.("unsupported", error);
    throw error;
  }
  const engine = await runtime.createEngine(canvas, signal);
  if (signal?.aborted || canvas.isConnected === false) {
    engine.dispose();
    throw abortError();
  }
  let health: RenderHealth | undefined;
  let surface: AvatarPreviewSurface | undefined;
  let scheduler: OnDemandRender | undefined;
  let disposed = false;
  let failure: Error | undefined;
  let starting = true;
  let state: AvatarPreviewState = "loading";
  let requested = initial;
  let signature = "";
  const cleanups: (() => void)[] = [];
  const moduleChecks = new WeakMap<PreviewShaderModule, Promise<void>>();
  let resolveReady!: (controller: AvatarPreviewController) => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<AvatarPreviewController>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // Construction can fail before this function reaches its await.
  void ready.catch(() => {});
  let budgetTimer: number | undefined;
  let budgetStart: number | undefined;
  let budgetRemaining = 30_000;
  let budgetEpoch = 0;
  const remainingVisibleBudget = () =>
    budgetRemaining -
    (budgetStart === undefined ? 0 : Math.max(0, runtime.now() - budgetStart));
  const pauseBudget = () => {
    budgetEpoch++;
    budgetRemaining = remainingVisibleBudget();
    budgetStart = undefined;
    if (budgetTimer !== undefined) runtime.clearTimer(budgetTimer);
    budgetTimer = undefined;
  };
  const dispose = (reason: unknown = abortError()) => {
    if (disposed) return;
    disposed = true;
    scheduler?.dispose();
    pauseBudget();
    const cleanupErrors: unknown[] = [];
    for (const cleanup of [
      ...cleanups.splice(0),
      () => health?.dispose(),
      () => surface?.dispose(),
      () => { if (!engine.isDisposed) engine.dispose(); },
    ]) {
      try {
        cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (starting)
      rejectReady(
        cleanupErrors.length
          ? new AggregateError(
              [reason, ...cleanupErrors],
              "Preview cleanup failed",
            )
          : reason,
      );
  };
  const fail = (error: unknown) => {
    if (disposed || failure) return;
    failure = error instanceof Error ? error : new Error(String(error));
    state = "failed";
    scheduler?.dispose();
    try { options.onState?.("failed", failure); }
    catch { /* Presentation must not replace the original rejection. */ }
    rejectReady(error);
    // Unwind the owned error scope before disposing, without submitting a
    // failed frame. Falsy thrown values remain the original rejection reason.
    queueMicrotask(() => dispose(error));
  };
  const reportRenderFailure = (error: unknown) => {
    if (disposed || failure) return;
    // Preserve the source reason before onFault formats a UI-facing Error.
    fail(error);
    try { health?.report("render", error); }
    catch { /* The owned ready rejection already preserves the first error. */ }
  };
  const reportDeadline = () =>
    health?.report("pipeline", "Příprava 3D náhledu překročila časový limit.");
  const withinBudget = () => {
    if (state !== "loading" || remainingVisibleBudget() > 0) return true;
    reportDeadline();
    return false;
  };
  const resumeBudget = () => {
    if (
      disposed ||
      state !== "loading" ||
      !runtime.visible() ||
      budgetTimer !== undefined
    )
      return;
    budgetStart = runtime.now();
    const epoch = budgetEpoch;
    budgetTimer = runtime.setTimer(
      () => {
        if (
          !disposed &&
          epoch === budgetEpoch &&
          state === "loading" &&
          runtime.visible()
        )
          reportDeadline();
      },
      Math.max(0, budgetRemaining),
    );
  };
  const loading = () => {
    if (state === "ready") {
      state = "loading";
      budgetRemaining = 30_000;
      options.onState?.("loading");
    }
    resumeBudget();
  };
  const currentConfig = () =>
    starting ? (options.getCurrentConfig?.() ?? requested) : requested;
  const device = engine.isWebGPU
    ? (engine as unknown as { _device?: PreviewDevice })._device
    : undefined;
  const scope = () => {
    if (engine.isWebGPU && !device)
      throw new Error("Preview WebGPU validation device unavailable");
    device?.pushErrorScope("validation");
    return () =>
      device
        ? device.popErrorScope().then((error) => {
            if (error) throw new Error(error.message);
          })
        : Promise.resolve();
  };
  try {
    requested = currentConfig();
    signature = JSON.stringify(requested);
    health = new RenderHealth(engine, "preview", (fault) =>
      fail(new Error(fault.message)),
    );
    if (failure) throw failure;
    const finishSetup = scope();
    try {
      surface = runtime.createSurface(engine, requested, () =>
        health?.report("texture", "Texturu 3D náhledu se nepodařilo načíst."),
      );
    } finally {
      void health
        .track(finishSetup(), "pipeline", "preview resources")
        .catch(fail);
    }
    if (failure) throw failure;
    const ownedSurface = surface;
    const controller: AvatarPreviewController = {
      update(config) {
        if (disposed || failure) return;
        requested = config;
        if (JSON.stringify(config) !== signature) {
          loading();
          scheduler?.request();
        }
      },
      rotate(radians) {
        if (!disposed && !failure) {
          ownedSurface.rotate(radians);
          scheduler?.request();
        }
      },
      focus(detail) {
        if (!disposed && !failure) {
          ownedSurface.focus(detail);
          scheduler?.request();
        }
      },
      resetView() {
        if (!disposed && !failure) {
          ownedSurface.resetView();
          scheduler?.request();
        }
      },
      health: () => {
        const snapshot = health!.snapshot();
        return {
          ...snapshot,
          valid: snapshot.valid && state === "ready",
          phase:
            state === "loading" && snapshot.phase === "ready"
              ? "preparing"
              : snapshot.phase,
        };
      },
      dispose: () => dispose(),
    };
    let width = 0,
      height = 0;
    const canRenderFrame = () => !disposed && !failure && !signal?.aborted && !engine.isDisposed;
    scheduler = new OnDemandRender({
      requestFrame: runtime.requestFrame,
      cancelFrame: runtime.cancelFrame,
      visible: runtime.visible,
      onError: reportRenderFailure,
      async frame() {
        if (disposed || failure) return false;
        if (!withinBudget()) return false;
        const finishValidation = scope();
        let beforeReady = false;
        let begun = false;
        let hasRenderFailure = false;
        let renderFailure: unknown;
        const capture = (error: unknown) => {
          if (!hasRenderFailure) {
            hasRenderFailure = true;
            renderFailure = error;
          }
        };
        try {
          const latest = currentConfig();
          const latestSignature = JSON.stringify(latest);
          if (latestSignature !== signature) {
            ownedSurface.update(latest);
            requested = latest;
            signature = latestSignature;
            loading();
          }
          const bounds = canvas.getBoundingClientRect();
          const density = runtime.density();
          const nextWidth = Math.max(1, Math.round(bounds.width * density)),
            nextHeight = Math.max(1, Math.round(bounds.height * density));
          if (width !== nextWidth || height !== nextHeight) {
            ownedSurface.resize(nextWidth, nextHeight);
            width = nextWidth;
            height = nextHeight;
          }
          if (!canRenderFrame()) throw abortError();
          beforeReady = ownedSurface.ready();
          if (!canRenderFrame()) throw abortError();
          engine.beginFrame();
          begun = true;
          if (!canRenderFrame()) throw abortError();
          ownedSurface.render();
          if (!canRenderFrame()) throw abortError();
        } catch (error) {
          capture(error);
        } finally {
          try {
            if (begun && !hasRenderFailure && canRenderFrame()) engine.endFrame();
          } catch (error) {
            capture(error);
          }
        }
        let validation: Promise<void>;
        try {
          validation = health!.track(finishValidation(), "pipeline", "preview submitted frame");
        } catch (error) {
          capture(error);
          validation = Promise.resolve();
        }
        void validation.catch(() => {});
        if (hasRenderFailure) {
          reportRenderFailure(renderFailure);
          throw renderFailure;
        }
        if (!canRenderFrame()) return false;
        const compilation: Promise<void>[] = [];
        const modules = engine.isWebGPU ? ownedSurface.shaderModules() : [];
        if (engine.isWebGPU)
          for (const module of modules) {
            let check = moduleChecks.get(module);
            if (!check) {
              check = health!.track(
                Promise.resolve()
                  .then(() => module.getCompilationInfo())
                  .then(({ messages }) => {
                    const errors = messages.filter(
                      (message) => message.type === "error",
                    );
                    if (errors.length)
                      throw new Error(
                        errors.map((error) => error.message).join("\n"),
                      );
                  }),
                "shader",
                "preview shader module",
              );
              moduleChecks.set(module, check);
              void check.catch(() => {});
            }
            compilation.push(check);
          }
        const submission = device
          ? health!.track(
              device.queue.onSubmittedWorkDone(),
              "pipeline",
              "preview queue submission",
            )
          : Promise.resolve();
        await Promise.all([validation, submission, ...compilation]);
        if (disposed || failure) return false;
        // A blocking render or a resolved GPU promise can reach this microtask
        // before the overdue timer task. Do not accept after the visible budget.
        if (!withinBudget()) return false;
        if (
          !runtime.visible() ||
          signature !== JSON.stringify(currentConfig()) ||
          !beforeReady ||
          !ownedSurface.ready() ||
          (engine.isWebGPU && !modules.length) ||
          health!.snapshot().pendingOperations
        )
          return true;
        if (starting && !health!.markReady())
          throw new Error(
            "Preview renderer did not reach a healthy ready state",
          );
        pauseBudget();
        if (state !== "ready") {
          state = "ready";
          options.onState?.("ready");
        }
        if (starting) {
          starting = false;
          resolveReady(controller);
        }
        return false;
      },
    });
    const abort = () => dispose(abortError());
    signal?.addEventListener("abort", abort, { once: true });
    cleanups.push(() => signal?.removeEventListener("abort", abort));
    cleanups.push(runtime.observeResize(canvas, () => scheduler?.request()));
    cleanups.push(
      runtime.observeVisibility(() => {
        if (!runtime.visible()) pauseBudget();
        else resumeBudget();
        scheduler?.visibilityChanged();
      }),
    );
    if (signal?.aborted) dispose(abortError());
    else {
      resumeBudget();
      scheduler.request();
    }
    return await ready;
  } catch (error) {
    dispose(error);
    throw error;
  }
}
