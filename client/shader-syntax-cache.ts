import type { IShaderProcessor } from "@babylonjs/core/Engines/Processors/iShaderProcessor";

export type ShaderSyntaxCacheOptions = {
  enabled?: boolean;
  maxEntries?: number;
  maxTextUnits?: number;
  maxNodes?: number;
  maxOperators?: number;
};
export type ShaderSyntaxCacheLease = {
  setEnabled(enabled: boolean): void;
  reset(): void;
  snapshot(): unknown;
  dispose(): void;
};
/** Inject the pinned native factory; this module can be tested before its installation. */
export type ShaderSyntaxCacheFactory = (processor: IShaderProcessor, options?: ShaderSyntaxCacheOptions) => ShaderSyntaxCacheLease;
export type ShaderSyntaxCacheControlOptions = ShaderSyntaxCacheOptions & { createCache: ShaderSyntaxCacheFactory };
type Host = Record<string, any>;
type Method = (this: any, ...args: any[]) => any;
type Reason = "running" | "webgl" | "unsupported" | "ownership-conflict" | "factory-error" | "observer-error" |
  "cache-error" | "device-lost" | "device-replaced" | "processor-replaced" | "engine-disposed" | "disposed";
const engineOwners = new WeakMap<object, ShaderSyntaxCache>();
const processorOwners = new WeakMap<object, ShaderSyntaxCache>();
const NUMERIC_STATS = ["generation", "requests", "hits", "misses", "evictions", "oversized", "parseErrors",
  "entries", "sourceUnits", "nodeStringUnits", "textUnits", "nodes", "operators", "peakEntries", "peakTextUnits",
  "peakNodes", "peakOperators", "maxEntries", "maxTextUnits", "maxNodes", "maxOperators"] as const;
const OPTIONAL_NUMERIC_STATS = ["unsupported", "probationEntries", "residentEntries", "bypassEntries",
  "deferred", "promotions", "promotionSkips", "bypasses"] as const;
const bump = (n: number) => Math.min(Number.MAX_SAFE_INTEGER, n + 1);

function nativeGetter(host: Host): Method | undefined {
  for (let target: object | null = host; target; target = Object.getPrototypeOf(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, "_getShaderProcessor");
    if (descriptor) return "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value : undefined;
  }
  return undefined;
}
function primitiveStats(value: unknown): Record<string, number | boolean> {
  if (!value || typeof value !== "object") throw new TypeError("Missing syntax cache stats");
  const descriptors = Object.getOwnPropertyDescriptors(value), output: Record<string, number | boolean> = {};
  for (const key of ["enabled", "disposed"] as const) {
    const property = descriptors[key];
    if (!property || !("value" in property) || typeof property.value !== "boolean") throw new TypeError("Invalid cache state");
    output[key] = property.value;
  }
  for (const key of NUMERIC_STATS) {
    const property = descriptors[key];
    if (!property || !("value" in property) || !Number.isSafeInteger(property.value) || property.value < 0)
      throw new TypeError("Invalid syntax cache counter");
    output[key] = property.value;
  }
  for (const key of OPTIONAL_NUMERIC_STATS) {
    const property = descriptors[key];
    if (!property) continue;
    if (!("value" in property) || !Number.isSafeInteger(property.value) || property.value < 0)
      throw new TypeError("Invalid syntax cache admission counter");
    output[key] = property.value;
  }
  return output;
}

/** Game/engine lifetime ownership only. No method, shader, effect or readiness hooks. */
export class ShaderSyntaxCache {
  private engine?: Host;
  private processor?: object;
  private device?: unknown;
  private lease?: ShaderSyntaxCacheLease;
  private detach: (() => void)[] = [];
  private disposed = false;
  private inert = false;
  private supported = false;
  private requestedEnabled: boolean;
  private reason: Reason = "unsupported";
  private stats: Record<string, number | boolean> | null = null;
  private statsCurrent = false;
  private activityKnown = true;
  private cleanupIncomplete = false;
  private errors = { factory: 0, observer: 0, operation: 0, snapshot: 0, cleanup: 0 };

  constructor(engine: object, options: ShaderSyntaxCacheControlOptions) {
    this.requestedEnabled = options.enabled === true;
    const host = engine as Host;
    try {
      if (host.isWebGPU !== true) { this.inert = true; this.reason = "webgl"; return; }
      // Without an acquired lease we cannot assert that another owner is off.
      this.activityKnown = false;
      if (host.isDisposed === true || host._isDisposed === true) { this.disposed = true; this.reason = "engine-disposed"; return; }
      if (host._contextWasLost === true) { this.disposed = true; this.reason = "device-lost"; return; }
      if (engineOwners.has(host)) { this.reason = "ownership-conflict"; return; }
      const get = nativeGetter(host);
      // Babylon 9.30: WGSL enum=1, and the engine returns its own processor.
      const processor = get?.call(host, 1);
      if (!get || !processor || typeof processor !== "object" || processor !== host._shaderProcessorWGSL || typeof options.createCache !== "function") return;
      if (processorOwners.has(processor)) { this.reason = "ownership-conflict"; return; }
      this.engine = host; this.processor = processor; this.device = host._device;
      engineOwners.set(host, this); processorOwners.set(processor, this);
      // Install cleanup before acquiring native ownership. Partial setup rolls back.
      this.observe(host.onDisposeObservable, () => this.retire("engine-disposed"));
      if (this.disposed) return;
      this.observe(host.onContextLostObservable, () => this.retire("device-lost"));
      if (this.disposed) return;
      // The CPU profiler owns _getShaderProcessor. An allocation-free frame
      // identity check coexists with it; actual native loss retires immediately.
      this.observe(host.onBeginFrameObservable, () => this.synchronize());
      if (this.disposed) return;
      try {
        this.lease = options.createCache(processor, { enabled: this.requestedEnabled,
          maxEntries: options.maxEntries, maxTextUnits: options.maxTextUnits, maxNodes: options.maxNodes, maxOperators: options.maxOperators });
        if (!this.lease || ["setEnabled", "reset", "snapshot", "dispose"].some(key => typeof (this.lease as Host)[key] !== "function"))
          throw new TypeError("Unsupported syntax cache lease");
      } catch {
        this.errors.factory = bump(this.errors.factory); this.activityKnown = false;
        this.retire("factory-error"); return;
      }
      // A supplied factory can synchronously retire the engine while acquiring.
      if (this.disposed) { this.releaseLease(); return; }
      this.supported = true; this.reason = "running";
      if (!this.readStats()) this.retire("cache-error");
    } catch {
      this.errors.observer = bump(this.errors.observer);
      this.retire("observer-error");
    }
  }

  private observe(observable: Host | undefined, callback: () => void) {
    if (!observable || typeof observable.add !== "function" || typeof observable.remove !== "function")
      throw new TypeError("Missing engine lifecycle observable");
    const observer = observable.add(callback);
    if (!observer) throw new TypeError("Missing lifecycle observer");
    const detach = () => { if (observable.remove(observer) === false) throw new Error("Observer removal failed"); };
    if (this.disposed) this.cleanup(detach);
    else this.detach.push(detach);
  }
  private readStats(): boolean {
    if (!this.lease) return false;
    try {
      this.stats = primitiveStats(this.lease.snapshot()); this.statsCurrent = true; this.activityKnown = true; return true;
    } catch {
      this.errors.snapshot = bump(this.errors.snapshot); this.statsCurrent = false; this.activityKnown = false; return false;
    }
  }
  private synchronize() {
    if (this.disposed || !this.engine) return;
    try {
      const engine = this.engine;
      if (engine.isDisposed === true || engine._isDisposed === true) this.retire("engine-disposed");
      else if (engine._contextWasLost === true) this.retire("device-lost");
      else if (engine._device !== this.device) this.retire("device-replaced");
      else if (engine._shaderProcessorWGSL !== this.processor) this.retire("processor-replaced");
    } catch {
      this.errors.observer = bump(this.errors.observer); this.retire("observer-error");
    }
  }
  private cleanup(callback: () => void) {
    try { callback(); } catch { this.errors.cleanup = bump(this.errors.cleanup); this.cleanupIncomplete = true; }
  }
  private releaseLease() {
    const lease = this.lease;
    if (lease) {
      let released = false;
      this.cleanup(() => { lease.dispose(); released = true; });
      if (!released) {
        // Best effort to stop retention even if a malformed adapter cannot release.
        this.cleanup(() => lease.setEnabled(false));
        this.cleanup(() => lease.reset());
      }
      this.readStats();
      this.lease = undefined;
    }
  }
  private retire(reason: Reason) {
    if (this.disposed) return;
    this.disposed = true; this.reason = reason;
    this.releaseLease();
    for (const detach of this.detach.splice(0).reverse()) this.cleanup(detach);
    if (this.engine && engineOwners.get(this.engine) === this) engineOwners.delete(this.engine);
    if (this.processor && processorOwners.get(this.processor) === this) processorOwners.delete(this.processor);
    this.engine = undefined; this.processor = undefined; this.device = undefined;
  }

  setEnabled(enabled: boolean): void {
    if (typeof enabled !== "boolean") throw new TypeError("Shader syntax cache enabled must be boolean");
    this.synchronize();
    if (this.disposed) return;
    this.requestedEnabled = enabled;
    if (!this.lease) return;
    try { this.lease.setEnabled(enabled); if (!this.readStats()) this.retire("cache-error"); }
    catch { this.errors.operation = bump(this.errors.operation); this.retire("cache-error"); }
  }
  reset(): void {
    this.synchronize();
    if (this.disposed || !this.lease) return;
    try { this.lease.reset(); if (!this.readStats()) this.retire("cache-error"); }
    catch { this.errors.operation = bump(this.errors.operation); this.retire("cache-error"); }
  }
  snapshot() {
    this.synchronize();
    if (!this.disposed && this.lease) this.readStats();
    return { active: this.activityKnown ? this.stats?.enabled === true && this.stats.disposed !== true : null,
      activityKnown: this.activityKnown, supported: this.supported, requestedEnabled: this.requestedEnabled,
      inert: this.inert, disposed: this.disposed, reason: this.reason, statsCurrent: this.statsCurrent,
      cleanupIncomplete: this.cleanupIncomplete, errors: { ...this.errors }, stats: this.stats ? { ...this.stats } : null };
  }
  dispose(): void { this.retire("disposed"); }
}
