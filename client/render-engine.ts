import { Engine } from "@babylonjs/core/Engines/engine";
import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.pure.js";
import { _CommonDispose } from "@babylonjs/core/Engines/engine.common.js";
import { PREFERRED_GPU_POWER } from "./gpu-diagnostics";

export type RenderBackend = "webgl2" | "webgpu" | "webgpu-fast";

/** The migration renders native WGSL. Reject an overlooked GLSL material
 * before Babylon can download or synchronously run a translation toolchain. */
export function requireNativeWebGpuShaders(engine: {
  prepareGlslangAndTintAsync(): Promise<void>;
}) {
  engine.prepareGlslangAndTintAsync = async () => {
    throw new Error("WebGPU vyžaduje nativní WGSL materiál; překlad GLSL není povolen.");
  };
}

export function selectRenderBackend(location: {
  hostname: string;
  search: string;
}): RenderBackend {
  const values = new URLSearchParams(location.search).getAll("renderBackend");
  if (values.length > 1)
    throw new Error("renderBackend smí být v adrese pouze jednou.");
  const backend = values[0] ?? "webgl2";
  if (backend !== "webgl2" && backend !== "webgpu" && backend !== "webgpu-fast")
    throw new Error("Neznámý renderBackend: " + backend);
  if (
    backend !== "webgl2" &&
    !["localhost", "127.0.0.1", "[::1]", "::1"].includes(
      location.hostname.toLowerCase(),
    )
  )
    throw new Error(
      "Experiment WebGPU je dostupný pouze na místním loopbacku.",
    );
  return backend;
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
        await prepared.initialize();
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
      throw error;
    }
  })();
  try {
    return await (aborted ? Promise.race([operation, aborted]) : operation);
  } finally {
    if (abortListener) signal!.removeEventListener("abort", abortListener);
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
      throw new Error(
        "WebGPU není v tomto prohlížeči dostupné; fallback se nepoužije.",
      );
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

/** The caller owns the resolved engine and must dispose it if Game construction
 * fails or the UI is unmounted after resolution. No backend silently falls back. */
export function createGameEngine(
  canvas: HTMLCanvasElement,
  options: { signal?: AbortSignal } = {},
): Promise<AbstractEngine> {
  return initializeRenderEngine(
    canvas,
    selectRenderBackend(window.location),
    runtime,
    options.signal,
  );
}
