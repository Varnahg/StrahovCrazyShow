import { Engine } from "@babylonjs/core/Engines/engine";
import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.pure.js";
import { _CommonDispose } from "@babylonjs/core/Engines/engine.common.js";
import { PREFERRED_GPU_POWER } from "./gpu-diagnostics";
import { getRenderBackendSelection, WebGpuInitializationError,
  type RenderBackend, type RenderBackendSelection } from "./render-fallback";
export { selectRenderBackend, type RenderBackend } from "./render-fallback";

/** The migration renders native WGSL. Reject an overlooked GLSL material
 * before Babylon can download or synchronously run a translation toolchain. */
export function requireNativeWebGpuShaders(engine: {
  prepareGlslangAndTintAsync(): Promise<void>;
}) {
  engine.prepareGlslangAndTintAsync = async () => {
    throw new Error("WebGPU vyžaduje nativní WGSL materiál; překlad GLSL není povolen.");
  };
}

type ManagedEngine = {
  dispose(): void;
  readonly webGLVersion?: number;
  readonly isWebGPU: boolean;
  compatibilityMode: boolean;
  snapshotRendering: boolean;
};

/** Separates engine lifetime from browser/GPU IO; the same path is exercised
 * with deferred initializers in the CPU cancellation/error regressions. */
export type RenderEngineRuntime<T extends ManagedEngine> = {
  createWebGL(canvas: HTMLCanvasElement): T;
  createWebGPU(
    canvas: HTMLCanvasElement,
    signal?: AbortSignal,
  ): Promise<{
    engine: T;
    initialize(): Promise<void>;
    dispose?(): void;
  }>;
};

function abortError() {
  const error = new Error("Vytvoření rendereru bylo zrušeno.");
  error.name = "AbortError";
  return error;
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

/** Cancellation settles promptly, but an in-flight WebGPU initialization must
 * finish before disposal: initAsync can allocate more resources after awaiting
 * the adapter/device. Its observed operation always performs that late cleanup. */
export async function initializeRenderEngine<T extends ManagedEngine>(
  canvas: HTMLCanvasElement,
  backend: RenderBackend,
  runtime: RenderEngineRuntime<T>,
  signal?: AbortSignal,
): Promise<T> {
  checkAbort(signal);
  let abortListener: (() => void) | undefined;
  const aborted = signal
    ? new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(abortError());
        signal.addEventListener("abort", abortListener, { once: true });
      })
    : undefined;
  const operation = (async () => {
    let owned: T | undefined;
    let dispose: (() => void) | undefined;
    let initializingWebGpu = false;
    try {
      checkAbort(signal);
      if (backend === "webgl2") {
        owned = runtime.createWebGL(canvas);
        if (owned.isWebGPU || owned.webGLVersion !== 2)
          throw new Error(
            "Požadovaný WebGL2 kontext není dostupný; fallback se nepoužije.",
          );
      } else {
        const prepared = await runtime.createWebGPU(canvas, signal);
        owned = prepared.engine;
        dispose = prepared.dispose;
        checkAbort(signal);
        initializingWebGpu = true;
        await prepared.initialize();
        initializingWebGpu = false;
        checkAbort(signal);
        if (!owned.isWebGPU)
          throw new Error("Požadovaný WebGPU kontext nebyl vytvořen.");
        owned.compatibilityMode = backend !== "webgpu-fast";
        owned.snapshotRendering = false;
      }
      checkAbort(signal);
      return owned;
    } catch (error) {
      try {
        if (dispose) dispose();
        else owned?.dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Renderer selhal při inicializaci i úklidu.",
        );
      }
      if (backend !== "webgl2" && !signal?.aborted &&
          !(error instanceof Error && error.name === "AbortError") &&
          (initializingWebGpu || error instanceof WebGpuInitializationError)) {
        if (error instanceof WebGpuInitializationError && error.backend === backend) throw error;
        throw new WebGpuInitializationError(backend,
          error instanceof WebGpuInitializationError ? error.reason : "initialization-failed", error);
      }
      throw error;
    }
  })();
  try {
    return await (aborted ? Promise.race([operation, aborted]) : operation);
  } finally {
    if (abortListener) signal!.removeEventListener("abort", abortListener);
  }
}

const selections = new WeakMap<object, RenderBackendSelection>();
/** Metadata popisují skutečný pokus; souběžný fallback jiného preview je nezmění. */
export const getRenderEngineSelection = (engine: object): RenderBackendSelection | undefined => selections.get(engine);

export async function initializeSelectedRenderEngine<T extends ManagedEngine>(
  canvas: HTMLCanvasElement, selection: RenderBackendSelection,
  runtime: RenderEngineRuntime<T>, signal?: AbortSignal,
): Promise<T> {
  const engine = await initializeRenderEngine(canvas, selection.backend, runtime, signal);
  try {
    checkAbort(signal);
    selections.set(engine, Object.freeze({ ...selection }));
    return engine;
  } catch (error) {
    try { engine.dispose(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], "Renderer selhal při předání i úklidu."); }
    throw error;
  }
}

/** Babylon 9.30's public WebGPU dispose assumes initAsync finished. This narrow
 * failure path is only for an engine with no Game/Scene yet. It mirrors that
 * pinned cleanup with optional resources and always removes common/base owners. */
export function disposeFailedWebGpuInitialization(
  engine: AbstractEngine,
  canvas: HTMLCanvasElement,
) {
  if (engine.scenes.length)
    throw new Error("Částečný úklid WebGPU nesmí vlastnit herní scénu.");
  const partial = engine as unknown as {
    _isDisposed: boolean;
    _timestampQuery?: { dispose(): void };
    _mainTexture?: { destroy(): void };
    _depthTexture?: { destroy(): void };
    _textureHelper?: { destroyDeferredTextures(): void };
    _bufferManager?: { destroyDeferredBuffers(): void };
    _device?: { destroy(): void };
  };
  partial._isDisposed = true;
  const errors: unknown[] = [];
  for (const cleanup of [
    () => engine.hideLoadingUI?.(),
    () => partial._timestampQuery?.dispose(),
    () => partial._mainTexture?.destroy(),
    () => partial._depthTexture?.destroy(),
    () => partial._textureHelper?.destroyDeferredTextures(),
    () => partial._bufferManager?.destroyDeferredBuffers(),
    () => partial._device?.destroy(),
    () => _CommonDispose(engine, canvas),
    () => AbstractEngine.prototype.dispose.call(engine),
  ]) {
    try {
      cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Neúplný úklid WebGPU inicializace.");
}

const runtime: RenderEngineRuntime<AbstractEngine> = {
  createWebGL: (canvas) =>
    new Engine(
      canvas,
      true,
      {
        stencil: true,
        preserveDrawingBuffer: false,
        powerPreference: PREFERRED_GPU_POWER,
      },
      false,
    ),
  async createWebGPU(canvas, signal) {
    if (
      typeof navigator === "undefined" ||
      !(navigator as Navigator & { gpu?: unknown }).gpu
    )
      throw new WebGpuInitializationError("webgpu", "unavailable");
    const { WebGPUEngine } =
      await import("@babylonjs/core/Engines/webgpuEngine");
    checkAbort(signal);
    const engine = new WebGPUEngine(canvas, {
      antialias: true,
      stencil: true,
      adaptToDeviceRatio: false,
      powerPreference: PREFERRED_GPU_POWER,
      // RenderHealth owns device.lost and requires a new prepared renderer.
      // Babylon's automatic restore could allocate a device after UI teardown.
      doNotHandleContextLost: true,
      // Babylon intersects this list with adapter support before requestDevice.
      deviceDescriptor: { requiredFeatures: ["timestamp-query"] },
    });
    requireNativeWebGpuShaders(engine);
    let initialized = false;
    return {
      engine,
      async initialize() {
        await engine.initAsync();
        initialized = true;
        // The legacy whole-frame counter can report 0 when writeTimestamp is
        // unavailable. Only the explicitly scoped per-pass path is enabled.
        engine.enableGPUTimingMeasurements = !!engine.getCaps().timerQuery;
      },
      dispose() {
        if (initialized) engine.dispose();
        else disposeFailedWebGpuInitialization(engine, canvas);
      },
    };
  },
};

/** Jeden pokus pro jeden canvas. Po typed init failure rozhoduje vlastník UI
 * o nové canvas generaci; samotná factory nikdy nepřepíná contextType. */
export function createGameEngine(
  canvas: HTMLCanvasElement,
  options: { signal?: AbortSignal } = {},
): Promise<AbstractEngine> {
  return initializeSelectedRenderEngine(
    canvas,
    getRenderBackendSelection(window.location),
    runtime,
    options.signal,
  );
}
