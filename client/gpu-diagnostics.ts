/** A WebGL preference is a browser hint, never proof that a particular adapter was selected. */
export const PREFERRED_GPU_POWER = "high-performance" as const;
export const GPU_SETTINGS_HELP_URL =
  "https://support.microsoft.com/en-us/windows/hardware/display-graphics/optimizations-for-windowed-games-in-windows-11";
export const DISPLAY_REFRESH_HELP_URL =
  "https://support.microsoft.com/en-us/windows/hardware/display-graphics/change-the-refresh-rate-on-your-monitor-in-windows";

export type GpuClassification =
  "integrated" | "dedicated" | "software" | "unknown";
export type GpuPowerPreference =
  "default" | "high-performance" | "low-power" | "unknown";
export type GpuContextDiagnostics = {
  requestedAntialias: boolean | null;
  actualAntialias: boolean | null;
  defaultFramebuffer: boolean | null;
  /** Actual default framebuffer samples, never MAX_SAMPLES or pipeline MSAA. */
  sampleBuffers: number | null;
  samples: number | null;
};
export type GpuDiagnostics = {
  renderer: string;
  vendor: string;
  version: string;
  webglVersion: number | null;
  classification: GpuClassification;
  classificationLabel: string;
  requestedPowerPreference: GpuPowerPreference;
  warnings: string[];
  context: GpuContextDiagnostics;
};

/** Kept structural so tests can exercise unavailable or privacy-masked browser information. */
export type GpuDiagnosticEngine = {
  getGlInfo(): { renderer?: string; vendor?: string; version?: string };
  getCreationOptions?(): unknown;
  readonly webGLVersion?: number;
  getRenderingCanvas?(): HTMLCanvasElement | null;
};

/** Read once outside timed rendering. Never bind a framebuffer or recreate the
 * context to obtain diagnostics; an offscreen binding stays unreported. */
export function readGpuContextDiagnostics(
  engine: GpuDiagnosticEngine,
): GpuContextDiagnostics {
  const result: GpuContextDiagnostics = {
    requestedAntialias: null,
    actualAntialias: null,
    defaultFramebuffer: null,
    sampleBuffers: null,
    samples: null,
  };
  try {
    const options = engine.getCreationOptions?.() as
      { antialias?: unknown } | undefined;
    if (typeof options?.antialias === "boolean")
      result.requestedAntialias = options.antialias;
    if (engine.webGLVersion !== 1 && engine.webGLVersion !== 2) return result;
    const canvas = engine.getRenderingCanvas?.();
    const gl = canvas?.getContext(
      engine.webGLVersion === 2 ? "webgl2" : "webgl",
    ) as WebGLRenderingContext | null;
    if (!gl || gl.isContextLost()) return result;
    result.actualAntialias = gl.getContextAttributes()?.antialias ?? null;
    result.defaultFramebuffer =
      gl.getParameter(gl.FRAMEBUFFER_BINDING) === null;
    if (result.defaultFramebuffer) {
      const count = (value: unknown) =>
        typeof value === "number" && Number.isInteger(value) && value >= 0
          ? value
          : null;
      result.sampleBuffers = count(gl.getParameter(gl.SAMPLE_BUFFERS));
      result.samples = count(gl.getParameter(gl.SAMPLES));
    }
  } catch {
    // Lost or restricted context metadata must not prevent playing.
  }
  return result;
}

const CLASSIFICATION_LABELS: Record<GpuClassification, string> = {
  integrated: "Integrovaná grafika",
  dedicated: "Samostatná grafika",
  software: "Softwarové vykreslování",
  unknown: "Typ grafiky nelze určit",
};

/** Conservative identification from the current context's renderer, not from installed GPUs. */
export function classifyGpu(renderer: string): GpuClassification {
  if (
    /swiftshader|llvmpipe|softpipe|software (?:rasterizer|renderer)|basic render driver|gdi generic|\bwarp\b/i.test(
      renderer,
    )
  )
    return "software";
  if (
    /\bgeforce\b|\bquadro\b|\btesla\b|nvidia\s+rtx\b|radeon\s+(?:\(tm\)\s+)?rx\s*\d|radeon\s+pro\s+(?:wx?\s*\d)|\bfirepro\b|intel.*\barc\s*\(?[ab]\d{3}\b|intel.*\biris\b.*\bxe\b.*\bmax\b/i.test(
      renderer,
    )
  )
    return "dedicated";
  if (/intel.*(?:\buhd\b|\bhd graphics\b|\biris\b)/i.test(renderer))
    return "integrated";
  // Generic ANGLE, AMD Radeon Graphics, Apple unified memory, and masked names stay unknown.
  return "unknown";
}

function powerPreference(options: unknown): GpuPowerPreference {
  if (!options || typeof options !== "object") return "unknown";
  const preference = (options as { powerPreference?: unknown }).powerPreference;
  return preference === "default" ||
    preference === "high-performance" ||
    preference === "low-power"
    ? preference
    : "unknown";
}

/** Read once at context creation/restoration; do not poll WebGL driver queries per frame. */
export function readGpuDiagnostics(
  engine: GpuDiagnosticEngine,
): GpuDiagnostics {
  let renderer = "Nezveřejněno prohlížečem",
    vendor = "Nezveřejněno prohlížečem",
    version = "Neznámá";
  let requestedPowerPreference: GpuPowerPreference = "unknown";
  try {
    const info = engine.getGlInfo();
    renderer = info.renderer?.trim() || renderer;
    vendor = info.vendor?.trim() || vendor;
    version = info.version?.trim() || version;
  } catch {
    // A lost context or privacy restriction must not prevent launching the game.
  }
  try {
    requestedPowerPreference = powerPreference(engine.getCreationOptions?.());
  } catch {
    // Engine diagnostics are optional; absence is not evidence of a default adapter.
  }
  const classification = classifyGpu(renderer);
  const warnings: string[] = [];
  if (classification === "integrated")
    warnings.push(
      "Hra nyní používá integrovanou grafiku. Pokud máš i samostatnou kartu, nastav pro tento prohlížeč nebo aplikaci ve Windows vysoký výkon a aplikaci znovu spusť.",
    );
  if (classification === "software")
    warnings.push(
      "Hra nyní vykresluje softwarově. Zkontroluj hardwarovou akceleraci prohlížeče a ovladač grafiky.",
    );
  if (classification === "unknown")
    warnings.push(
      "Prohlížeč neposkytl jednoznačný název grafiky. Výběr karty ověř v jeho diagnostice nebo ve Správci úloh.",
    );
  if (requestedPowerPreference === "low-power")
    warnings.push(
      "Tento vykreslovací kontext požádal prohlížeč o úspornou grafiku.",
    );
  return {
    renderer,
    vendor,
    version,
    webglVersion: Number.isFinite(engine.webGLVersion)
      ? engine.webGLVersion!
      : null,
    classification,
    classificationLabel: CLASSIFICATION_LABELS[classification],
    requestedPowerPreference,
    warnings,
    context: readGpuContextDiagnostics(engine),
  };
}
