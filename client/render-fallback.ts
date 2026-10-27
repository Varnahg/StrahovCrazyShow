export type RenderBackend = "webgl2" | "webgpu" | "webgpu-fast";
export type RenderFallbackReason = "unavailable" | "initialization-failed";
export type RenderFallbackInfo = Readonly<{ backend: "webgl2"; reason: RenderFallbackReason }>;
export type RenderBackendSelection = Readonly<{
  requested: RenderBackend;
  backend: RenderBackend;
  automatic: boolean;
  fallbackReason: RenderFallbackReason | null;
}>;
type BackendLocation = Pick<Location, "hostname" | "search">;

/** Výslovná URL zůstává striktní; automatická preference je WebGPU CM. */
export function selectRenderBackend(location: BackendLocation): RenderBackend {
  const values = new URLSearchParams(location.search).getAll("renderBackend");
  if (values.length > 1) throw new Error("renderBackend smí být v adrese pouze jednou.");
  const backend = values[0] ?? "webgpu";
  if (backend !== "webgl2" && backend !== "webgpu" && backend !== "webgpu-fast")
    throw new Error("Neznámý renderBackend: " + backend);
  if (backend === "webgpu-fast" &&
      !["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname.toLowerCase()))
    throw new Error("Experiment webgpu-fast je dostupný pouze na místním loopbacku.");
  return backend;
}

/** Vzniká jen na inicializační hranici, až když skončil úklid starého enginu.
 * Chyby scény, shaderů, assetů a importu nejsou tento typ. */
export class WebGpuInitializationError extends Error {
  constructor(
    readonly backend: "webgpu" | "webgpu-fast",
    readonly reason: RenderFallbackReason,
    cause?: unknown,
  ) {
    super(reason === "unavailable"
      ? "WebGPU není v tomto prohlížeči dostupné."
      : "Inicializace WebGPU byla odmítnuta.", { cause });
    this.name = "WebGpuInitializationError";
  }
}

/** Pouze preference budoucích pokusů v této stránce. Žádné subscriptions,
 * změny zdravé existující scény, localStorage ani trvalý blacklist zařízení. */
export class RenderFallbackSession {
  private fallback: RenderFallbackInfo | null = null;
  private readonly consumed = new WeakSet<WebGpuInitializationError>();

  select(location: BackendLocation): RenderBackendSelection {
    const requested = selectRenderBackend(location);
    const automatic = !new URLSearchParams(location.search).has("renderBackend");
    const fallback = automatic ? this.fallback : null;
    return Object.freeze({ requested, backend: fallback?.backend ?? requested,
      automatic, fallbackReason: fallback?.reason ?? null });
  }

  request(error: unknown, location: BackendLocation, signal?: AbortSignal): RenderFallbackInfo | null {
    if (signal?.aborted || !(error instanceof WebGpuInitializationError) ||
        error.backend !== "webgpu" || this.consumed.has(error)) return null;
    let selection: RenderBackendSelection;
    try { selection = this.select(location); }
    catch { return null; } // Změněná/neplatná URL nenahradí původní chybu.
    if (!selection.automatic) return null;
    this.consumed.add(error);
    // I souběžný starší WebGPU pokus smí získat vlastní nový canvas. Už běžící
    // WebGL2 pokus však tento typ chyby nevytvoří, proto se cyklus neopakuje.
    this.fallback ??= Object.freeze({ backend: "webgl2", reason: error.reason });
    return this.fallback;
  }
}

const pageSession = new RenderFallbackSession();
export const getRenderBackendSelection = (location: BackendLocation) => pageSession.select(location);
/** Volající musí po přijatém výsledku nahradit canvas; nikdy neopakuje jiný
 * contextType na původním canvasu, i kdyby už byl engine zrušený. */
export const requestWebGlFallback = (error: unknown, location: BackendLocation, signal?: AbortSignal) =>
  pageSession.request(error, location, signal);
