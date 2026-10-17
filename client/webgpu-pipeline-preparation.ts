/** Startup-only adapter for the pinned Babylon 9.30 WebGPU draw/cache path.
 * It never installs a pipeline from a Promise callback: the next real cache
 * miss consumes the completed result and Babylon performs its normal insert.
 * The owner must keep its loading cover until two complete ready draws pass. */
type Method = (this: any, ...args: any[]) => any;
type Host = Record<string, any>;
type Hook = { target: Host; name: string; original: Method; own?: PropertyDescriptor; wrapper: Method };
type Identity = {
  cache: Host; effect: Host; context: Host; stages: Host; processing: unknown;
  vertex: unknown; fragment: unknown; vertexModule: unknown; fragmentModule: unknown;
  vertexEntry: unknown; fragmentEntry: unknown; device: Host;
};
type Entry = { token?: object; identity?: Identity; pending: boolean; pipeline?: unknown };

export type WebGpuPipelinePreparationOptions = {
  signal?: AbortSignal;
  /** Called once after an incomplete hidden frame, including retired entries.
   * Reset owned scene ObjectRenderer refresh counters so once-only RTTs retry. */
  retryIncompleteFrame?: () => void;
  /** Bounds outstanding work AND completed results, not just pending Promises. */
  maxEntries?: number;
};
const owners = new WeakMap<object, WebGpuPipelinePreparation>();

function method(target: Host, name: string): Method | undefined {
  for (let cursor: object | null = target; cursor; cursor = Object.getPrototypeOf(cursor)) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, name);
    if (descriptor) return "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value : undefined;
  }
  return undefined;
}
function identity(cache: Host, effect: Host, device: Host): Identity | undefined {
  const context = effect?._pipelineContext, stages = context?.stages;
  if (!context || !stages?.vertexStage?.module || effect.isDisposed === true) return;
  return { cache, effect, context, stages, processing: context.shaderProcessingContext,
    vertex: stages.vertexStage, fragment: stages.fragmentStage,
    vertexModule: stages.vertexStage.module, fragmentModule: stages.fragmentStage?.module,
    vertexEntry: stages.vertexStage.entryPoint, fragmentEntry: stages.fragmentStage?.entryPoint, device };
}
function sameIdentity(a: Identity, b: Identity | undefined): boolean {
  return !!b && a.cache === b.cache && a.effect === b.effect && a.context === b.context &&
    a.stages === b.stages && a.processing === b.processing && a.vertex === b.vertex &&
    a.fragment === b.fragment && a.vertexModule === b.vertexModule && a.fragmentModule === b.fragmentModule &&
    a.vertexEntry === b.vertexEntry && a.fragmentEntry === b.fragmentEntry && a.device === b.device;
}

export class WebGpuPipelinePreparation {
  private engine?: Host;
  private device?: Host;
  private mainCache?: Host;
  private clear?: Host;
  private clearCache?: Host;
  private hooks: Hook[] = [];
  private dependencies: { target: Host; name: string; value: Method }[] = [];
  private detach: (() => void)[] = [];
  private entries = new Map<object, Map<Host, Entry>>();
  private work = new Set<Entry>();
  private readonly pendingSignal = {};
  private readonly limit: number;
  private retry?: () => void;
  private active = false;
  private inert = false;
  private disposed = false;
  private rendering = false;
  private boundary?: Host;
  private incomplete = false;
  private lastComplete = false;
  private completionSerial = 0;
  private provenSerial = -1;
  private hasFault = false;
  private fault: unknown;

  constructor(engine: object, options: WebGpuPipelinePreparationOptions = {}) {
    this.limit = Math.min(64, Math.max(1, Math.floor(options.maxEntries ?? 64) || 1));
    this.retry = options.retryIncompleteFrame;
    const host = engine as Host;
    this.inert = host.isWebGPU !== true || host.compatibilityMode !== true || host.snapshotRendering !== false;
    if (options.signal?.aborted) { this.disposed = true; return; }
    if (this.inert) return;
    if (owners.has(engine)) throw new Error("WebGPU startup pipeline preparation already has an owner.");
    this.engine = host; this.device = host._device; this.mainCache = host._cacheRenderPipeline;
    this.clear = host._clearQuad; this.clearCache = this.clear?._cacheRenderPipeline;
    if (!this.device || typeof this.device.createRenderPipelineAsync !== "function" ||
        !this.mainCache || !this.clear || !this.clearCache || !host.onDisposeObservable?.add)
      throw new Error("WebGPU startup pipeline preparation requires the initialized pinned engine.");
    try {
      this.installBoundary(host, "_draw", this.mainCache);
      this.installBoundary(this.clear, "clear", this.clearCache);
      for (const cache of new Set([this.mainCache, this.clearCache])) {
        if (cache._device !== this.device || !method(cache, "_buildRenderPipelineDescriptor") ||
            !method(cache, "getRenderPipeline") || !cache._parameter)
          throw new Error("Unsupported WebGPU startup pipeline cache.");
        for (const name of ["getRenderPipeline", "_buildRenderPipelineDescriptor"])
          this.dependencies.push({ target: cache, name, value: method(cache, name)! });
        this.install(cache, "_createRenderPipeline", (original) => {
          const owner = this;
          return function (this: Host, effect: Host, topology: unknown, samples: number) {
            if (!owner.active || !owner.rendering || owner.boundary !== cache || this !== cache || cache.disabled)
              return original.call(this, effect, topology, samples);
            owner.check();
            return owner.prepare(cache, effect, topology, samples);
          };
        });
      }
      this.active = true;
      owners.set(host, this);
      const observer = host.onDisposeObservable.add(() => this.dispose());
      this.detach.push(() => host.onDisposeObservable.remove(observer));
      if (options.signal) {
        const abort = () => this.dispose();
        options.signal.addEventListener("abort", abort, { once: true });
        this.detach.push(() => options.signal!.removeEventListener("abort", abort));
        if (options.signal.aborted) this.dispose();
      }
    } catch (error) { this.dispose(); throw error; }
  }

  private install(target: Host, name: string, wrap: (original: Method) => Method) {
    const original = method(target, name), own = Object.getOwnPropertyDescriptor(target, name);
    if (!original || (own && !own.configurable && (!('value' in own) || !own.writable)))
      throw new Error("Cannot own WebGPU startup hook: " + name);
    const wrapper = wrap(original);
    Object.defineProperty(target, name, own ? { ...own, value: wrapper } :
      { value: wrapper, writable: true, configurable: true, enumerable: false });
    this.hooks.push({ target, name, original, own, wrapper });
  }

  private installBoundary(target: Host, name: string, cache: Host) {
    this.install(target, name, (original) => {
      const owner = this;
      return function (this: Host, ...args: unknown[]) {
        if (!owner.active || !owner.rendering || this !== target || (name === "clear" && !args[0]))
          return original.apply(this, args);
        owner.check();
        const previous = owner.boundary;
        owner.boundary = cache;
        try { return original.apply(this, args); }
        catch (error) { if (error !== owner.pendingSignal) throw error; }
        finally { owner.boundary = previous; }
      };
    });
  }

  /** Ownership changes are terminal for this startup adapter, never an excuse
   * to publish an old device/context result into a replacement cache. */
  private check() {
    if (this.hasFault) throw this.fault;
    const e = this.engine;
    if (!this.active || !e || e.isDisposed === true || e._isDisposed === true ||
        e.compatibilityMode !== true || e.snapshotRendering !== false || e._device !== this.device ||
        e._cacheRenderPipeline !== this.mainCache || e._clearQuad !== this.clear ||
        this.clear?._cacheRenderPipeline !== this.clearCache ||
        this.mainCache?._device !== this.device || this.clearCache?._device !== this.device ||
        this.dependencies.some((item) => method(item.target, item.name) !== item.value) ||
        this.hooks.some((hook) => Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper)) {
      const error = new Error("WebGPU startup pipeline ownership or device changed.");
      this.fail(error); throw error;
    }
  }

  private retire(entry: Entry) {
    const bucket = entry.token && this.entries.get(entry.token);
    if (bucket && entry.identity && bucket.get(entry.identity.cache) === entry) {
      bucket.delete(entry.identity.cache);
      if (!bucket.size) this.entries.delete(entry.token!);
    }
    entry.token = undefined; entry.identity = undefined; entry.pipeline = undefined;
    if (!entry.pending) this.work.delete(entry);
  }

  private prune() {
    for (const entry of this.records()) {
      const own = entry.identity!;
      if (own.cache.disabled || !sameIdentity(own, identity(own.cache, own.effect, this.device!))) {
        this.retire(entry); this.completionSerial++; this.lastComplete = false; this.incomplete = true;
      }
    }
  }

  private *records(): Generator<Entry> {
    for (const bucket of this.entries.values()) yield* bucket.values();
  }

  private prepare(cache: Host, effect: Host, topology: unknown, samples: number): unknown {
    // _createRenderPipeline is entered only after native lookup set this token.
    const token: unknown = cache._parameter.token;
    if (!token || typeof token !== "object") {
      const error = new Error("WebGPU startup cache miss has no native token.");
      this.fail(error); throw error;
    }
    const current = identity(cache, effect, this.device!);
    if (!current) {
      const error = new Error("WebGPU startup draw has no live shader stages.");
      this.fail(error); throw error;
    }
    let entry = this.entries.get(token)?.get(cache);
    if (entry && !sameIdentity(entry.identity!, current)) { this.retire(entry); entry = undefined; }
    if (entry?.pipeline !== undefined) {
      const pipeline = entry.pipeline;
      this.retire(entry);
      return pipeline; // Original getRenderPipeline owns insertion and counters.
    }
    this.incomplete = true;
    if (entry || this.work.size >= this.limit) throw this.pendingSignal;
    const descriptor = cache._buildRenderPipelineDescriptor(effect, topology, samples);
    this.check();
    // Native non-float vertex checks may reprocess an Effect during construction.
    if (cache.disabled || cache._parameter.token !== token ||
        !sameIdentity(current, identity(cache, effect, this.device!))) throw this.pendingSignal;
    entry = { token, identity: current, pending: true };
    let bucket = this.entries.get(token);
    if (!bucket) this.entries.set(token, bucket = new Map());
    bucket.set(cache, entry); this.work.add(entry);
    try {
      // Existing compilation profiling/RenderHealth observes this original API.
      // Do not track/report the same Promise for a second time here.
      const promise = this.device!.createRenderPipelineAsync(descriptor);
      const owned = entry;
      void Promise.resolve(promise).then((pipeline: unknown) => {
        owned.pending = false;
        if (!this.active) { this.work.delete(owned); return; }
        this.completionSerial++; this.lastComplete = false;
        if (!owned.identity) { this.work.delete(owned); return; }
        this.check();
        const own = owned.identity;
        if (!sameIdentity(own, identity(own.cache, own.effect, this.device!))) {
          this.retire(owned); return;
        }
        if (pipeline == null) throw new Error("WebGPU async pipeline returned no pipeline.");
        owned.pipeline = pipeline;
      }, (error: unknown) => {
        owned.pending = false;
        if (this.active && owned.identity) this.fail(error);
        else this.work.delete(owned);
      }).catch((error: unknown) => { if (this.active) this.fail(error); });
    } catch (error) {
      entry.pending = false; this.retire(entry); this.fail(error); throw error;
    }
    throw this.pendingSignal;
  }

  render(callback: () => void): boolean {
    if (this.hasFault) throw this.fault;
    if (this.disposed) return false;
    if (this.inert) { callback(); return true; }
    this.check();
    if (this.rendering) throw new Error("Nested startup preparation render is unsupported.");
    this.incomplete = false; this.lastComplete = false;
    this.prune();
    let ready = false;
    for (const entry of this.records()) if (entry.pipeline !== undefined) { ready = true; break; }
    // An earlier skipped once-only RTT must actually get another draw attempt.
    // A complete forced retry also proves a remaining ready result is currently
    // inactive; it can be retired, never installed as speculative coverage.
    if (ready) this.retry?.();
    const serial = this.completionSerial;
    this.rendering = true;
    try {
      callback();
      if (this.disposed) return false;
      this.check(); this.prune();
      this.lastComplete = !this.incomplete;
      // Ready results not requested by the forced retry may be discarded even
      // when another miss made the frame incomplete. Otherwise a full bounded
      // set of inactive results could starve newly visible pipelines forever.
      // Discarding is not acceptance: pending/misses/serial still gate readiness.
      if (ready && this.retry)
        for (const entry of this.records()) if (!entry.pending) this.retire(entry);
      if (this.lastComplete && serial === this.completionSerial && !this.pending()) {
        if (!this.entries.size) this.provenSerial = serial;
      }
    } finally { this.rendering = false; this.boundary = undefined; }
    if (!this.lastComplete) this.retry?.();
    return this.lastComplete;
  }

  isReady(): boolean {
    if (this.hasFault) throw this.fault;
    if (this.disposed) return false;
    if (this.inert) return true;
    this.check(); this.prune();
    return this.lastComplete && this.provenSerial === this.completionSerial && this.work.size === 0;
  }

  private pending(): boolean {
    for (const entry of this.work) if (entry.pending) return true;
    return false;
  }

  private fail(error: unknown) {
    if (!this.hasFault) { this.hasFault = true; this.fault = error; }
    this.dispose();
  }

  dispose(): void {
    // A pending GPU Promise still closes over this helper until settlement.
    // Release the callback's scene/Game owner even on an idempotent cleanup.
    this.retry = undefined;
    if (this.disposed) return;
    this.disposed = true; this.active = false; this.lastComplete = false;
    const errors: unknown[] = [];
    for (const detach of this.detach.splice(0)) { try { detach(); } catch (error) { errors.push(error); } }
    for (const hook of this.hooks.splice(0).reverse()) {
      try {
        const current = Object.getOwnPropertyDescriptor(hook.target, hook.name);
        if (current?.value !== hook.wrapper) continue;
        // A later owner can harden our descriptor without changing its value.
        // Leave that inactive forwarding wrapper and continue ALL other cleanup.
        if (!current.configurable && (!current.writable || !hook.own))
          throw new Error("WebGPU startup hook was hardened before cleanup: " + hook.name);
        if (hook.own) Object.defineProperty(hook.target, hook.name, hook.own);
        else if (!Reflect.deleteProperty(hook.target, hook.name))
          throw new Error("Cannot remove WebGPU startup hook: " + hook.name);
      } catch (error) { errors.push(error); }
    }
    for (const entry of this.records()) this.retire(entry);
    this.entries.clear(); this.work.clear();
    this.dependencies.length = 0;
    if (this.engine && owners.get(this.engine) === this) owners.delete(this.engine);
    this.engine = this.device = this.mainCache = this.clear = this.clearCache = undefined;
    // Preserve an earlier device/render error's identity; otherwise make cleanup
    // failure visible through the same render/isReady failure channel. Observable
    // or AbortSignal disposal itself must not create an unhandled exception.
    if (errors.length && !this.hasFault) {
      this.hasFault = true;
      this.fault = new AggregateError(errors, "WebGPU startup pipeline cleanup failed.");
    }
  }
}
