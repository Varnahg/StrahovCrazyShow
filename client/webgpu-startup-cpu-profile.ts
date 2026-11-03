/** Opt-in CPU observation only. Never changes shader text, returns, callbacks or readiness. */
type Host = Record<string, any>;
type Method = (this: any, ...args: any[]) => any;
type Hook = { target: Host; name: string; original: Method; own?: PropertyDescriptor; wrapper: Method };
type Availability = "installed" | "unavailable" | "ownership-conflict" | "lost" | "disposed";
type Metric = { calls: number; returned: number; thrown: number; timingSamples: number; cpuTotalMs: number; cpuMaxMs: number };
const PROCESSOR_METHODS = ["initializeShaders", "preProcessShaderCode", "preProcessor", "postProcessor", "finalizeShaders"] as const;
type ProcessorMethod = typeof PROCESSOR_METHODS[number];
type ChildMetric = Metric & { outsideTrackedSpan: number; nestedCalls: number; interruptedCalls: number };
type ChildFrame = { phase: ProcessorMethod; generation: number; started?: number };
type Duration = { samples: number; totalMs: number; maxMs: number };
type Span = { context: object; generation: number; epoch: number; started?: number; ambiguous: boolean; call: object | null };
export type WebGpuStartupCpuProfileOptions = { now?: () => number; maxPending?: number };
const owners = new WeakMap<object, WebGpuStartupCpuProfile>();
const processorOwners = new WeakMap<object, WebGpuStartupCpuProfile>();
const bump = (n: number) => Math.min(Number.MAX_SAFE_INTEGER, n + 1);
const metric = (): Metric => ({ calls: 0, returned: 0, thrown: 0, timingSamples: 0, cpuTotalMs: 0, cpuMaxMs: 0 });
const duration = (): Duration => ({ samples: 0, totalMs: 0, maxMs: 0 });
function add(target: Duration, elapsed: number) {
  target.samples = bump(target.samples); target.totalMs = Math.min(Number.MAX_VALUE, target.totalMs + elapsed);
  target.maxMs = Math.max(target.maxMs, elapsed);
}
function method(target: Host, name: string): Method | undefined {
  for (let object: object | null = target; object; object = Object.getPrototypeOf(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    if (descriptor) return "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value : undefined;
  }
  return undefined;
}
function install(target: Host, name: string, wrap: (original: Method) => Method): Hook | undefined {
  const own = Object.getOwnPropertyDescriptor(target, name), original = method(target, name);
  if (!original || own && !own.configurable && (!("value" in own) || !own.writable)) return;
  const wrapper = wrap(original);
  Object.defineProperty(target, name, own ? { ...own, value: wrapper } : { value: wrapper, writable: true, configurable: true });
  return { target, name, original, own, wrapper };
}
function restore(hook: Hook) {
  if (Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper) return;
  if (hook.own) Object.defineProperty(hook.target, hook.name, hook.own);
  else if (!Reflect.deleteProperty(hook.target, hook.name)) throw new Error("Profiler hook was hardened");
}
const scope = Object.freeze({
  createEffect: "Inclusive synchronous caller wall time until return/throw; nested calls overlap. Return values are never inspected or observed as Promises.",
  wgsl: "Engine-owned WGSL initializeShaders entry through matching finalizeShaders return/throw. Includes intervening synchronous processing and callbacks; nested in createEffect when invoked there. Never add parent and child totals.",
  processorMethods: "Inclusive synchronous native method bodies until return/throw; no return-value inspection. Child calls can overlap and can run outside a tracked pair. Unavailable methods are omissions, not observed zero cost. Never add children to pair/createEffect totals. Pair minus child totals is not automatically parser CPU: includes, conversion, callbacks and observer overhead remain unclassified.",
  crossing: "A single queued microtask marker detects the pinned processing path crossing a microtask boundary. Crossed spans are latency, not CPU. Ambiguous/reentrant/missing-context spans are excluded from CPU. This is not a thread-running or GPU metric.",
  coverage: "Only this engine createEffect and its current _shaderProcessorWGSL are observed. Custom processors and unmatched/incomplete processing are explicit omissions. Counters are cumulative; generation changes invalidate direct same-generation comparisons.",
  overhead: "Clock reads, bounded bookkeeping and existing nested observers remain included. No shader strings, hashes, per-call logs or large objects are retained in snapshots.",
});

export class WebGpuStartupCpuProfile {
  private engine?: Host;
  private processor?: Host;
  private device?: unknown;
  private active = false;
  private disposed = false;
  private inert = false;
  private suspended = false;
  private generation = 1;
  private epoch = 0;
  private marker?: object;
  private engineHooks: Hook[] = [];
  private processorHooks: Hook[] = [];
  private detach: (() => void)[] = [];
  private pending = new Map<object, Span>();
  private currentCall: object | null = null;
  private readonly now: () => number;
  private readonly limit: number;
  private effect: Metric = metric();
  private children = Object.fromEntries(PROCESSOR_METHODS.map(name => [name,
    { ...metric(), outsideTrackedSpan: 0, nestedCalls: 0, interruptedCalls: 0 }])) as Record<ProcessorMethod, ChildMetric>;
  private childDepth = 0;
  private syncCpu = duration();
  private crossedLatency = duration();
  private ambiguousLatency = duration();
  private counts = { initialized: 0, finalized: 0, matched: 0, initializeThrown: 0, finalizeThrown: 0,
    unmatchedFinalize: 0, invalidContext: 0, replacedContext: 0, capacityOmitted: 0, retired: 0,
    reentrantCreateEffect: 0, interruptedCreateEffect: 0, invalidSpans: 0, observerErrors: 0, invalidClocks: 0, generationChanges: 0, ownershipChanges: 0, pendingPeak: 0 };
  private hooks: Record<string, Availability> = { createEffect: "unavailable", getShaderProcessor: "unavailable",
    ...Object.fromEntries(PROCESSOR_METHODS.map(name => [name, "unavailable" as const])) };
  private lastGenerationReason: "device" | "lost" | "restored" | "processor" | null = null;

  constructor(engine: object, options: WebGpuStartupCpuProfileOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    this.limit = Math.min(256, Math.max(1, Math.floor(options.maxPending ?? 64) || 1));
    const host = engine as Host;
    try {
      if (host.isWebGPU !== true) { this.inert = true; return; }
      if (owners.has(engine)) { this.inert = true; this.hooks.createEffect = "ownership-conflict"; return; }
      this.engine = host; this.device = host._device; this.active = true; owners.set(host, this);
      const owner = this;
      const create = install(host, "createEffect", original => function(this: Host, ...args: any[]) {
        if (this !== host || !owner.usable()) return original.apply(this, args);
        const call = {}, parent = owner.currentCall; owner.currentCall = call;
        owner.effect.calls = bump(owner.effect.calls);
        if (parent) owner.counts.reentrantCreateEffect = bump(owner.counts.reentrantCreateEffect);
        const started = owner.clock(), generation = owner.generation; let failed = false;
        try { return original.apply(this, args); }
        catch (error) { failed = true; throw error; }
        finally {
          owner.currentCall = owner.active ? parent : null;
          owner.safe(() => {
            if (failed) owner.effect.thrown = bump(owner.effect.thrown); else owner.effect.returned = bump(owner.effect.returned);
            if (generation !== owner.generation) { owner.counts.interruptedCreateEffect = bump(owner.counts.interruptedCreateEffect); return; }
            const elapsed = owner.elapsed(started);
            if (elapsed !== undefined) {
              owner.effect.timingSamples = bump(owner.effect.timingSamples);
              owner.effect.cpuTotalMs = Math.min(Number.MAX_VALUE, owner.effect.cpuTotalMs + elapsed);
              owner.effect.cpuMaxMs = Math.max(owner.effect.cpuMaxMs, elapsed);
            }
            if (failed) for (const span of owner.pending.values()) if (span.call === call) owner.retire(span);
          });
        }
      });
      if (create) { this.engineHooks.push(create); this.hooks.createEffect = "installed"; }
      const get = install(host, "_getShaderProcessor", original => function(this: Host, ...args: any[]) {
        const result = original.apply(this, args);
        if (this === host && owner.active) owner.safe(() => { owner.sync(); });
        return result;
      });
      if (get) { this.engineHooks.push(get); this.hooks.getShaderProcessor = "installed"; }
      const observe = (observable: Host | undefined, callback: () => void) => {
        if (!observable?.add) return;
        const observer = observable.add(callback); this.detach.push(() => observable.remove(observer));
      };
      observe(host.onDisposeObservable, () => this.dispose());
      observe(host.onContextLostObservable, () => this.safe(() => { this.changeGeneration("lost"); this.suspended = true; }));
      observe(host.onContextRestoredObservable, () => this.safe(() => {
        this.changeGeneration("restored"); this.device = host._device; this.suspended = false; this.bindProcessor();
      }));
      this.bindProcessor();
    } catch {
      this.counts.observerErrors = bump(this.counts.observerErrors);
      // Roll back a partly installed observer even if failure preceded the
      // engine-disposal subscription. Diagnostics must not strand ownership.
      this.dispose();
    }
  }

  private safe(callback: () => void) {
    try { callback(); } catch { this.counts.observerErrors = bump(this.counts.observerErrors); }
  }
  private clock(): number | undefined {
    try { const value = this.now(); if (Number.isFinite(value)) return value; }
    catch { this.counts.observerErrors = bump(this.counts.observerErrors); }
    this.counts.invalidClocks = bump(this.counts.invalidClocks); return;
  }
  private elapsed(start: number | undefined): number | undefined {
    const end = this.clock();
    if (start === undefined || end === undefined) return;
    const elapsed = end - start;
    if (!Number.isFinite(elapsed) || elapsed < 0) { this.counts.invalidClocks = bump(this.counts.invalidClocks); return; }
    return elapsed;
  }
  private usable(): boolean {
    if (!this.active) return false;
    try { this.sync(); return this.active && !this.suspended; }
    catch { this.counts.observerErrors = bump(this.counts.observerErrors); return false; }
  }
  private sync() {
    const engine = this.engine;
    if (!this.active || !engine) return;
    if (engine.isDisposed === true || engine._isDisposed === true) { this.dispose(); return; }
    if (this.engineHooks.some(hook => Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper)) {
      this.counts.ownershipChanges = bump(this.counts.ownershipChanges);
      for (const hook of this.engineHooks) if (Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper)
        this.hooks[hook.name === "createEffect" ? "createEffect" : "getShaderProcessor"] = "lost";
      this.dispose(); return;
    }
    if (engine._device !== this.device) { this.changeGeneration("device"); this.device = engine._device; }
    this.bindProcessor();
  }
  private changeGeneration(reason: NonNullable<typeof this.lastGenerationReason>) {
    this.generation = bump(this.generation); this.epoch = bump(this.epoch); this.marker = undefined;
    this.counts.generationChanges = bump(this.counts.generationChanges); this.lastGenerationReason = reason;
    for (const span of this.pending.values()) this.retire(span);
  }
  private retire(span: Span) {
    if (this.pending.get(span.context) !== span) return;
    this.pending.delete(span.context); this.counts.retired = bump(this.counts.retired);
  }
  private bindProcessor() {
    if (!this.active || !this.engine) return;
    const next = this.engine._shaderProcessorWGSL;
    if (next === this.processor) {
      if (this.processorHooks.some(hook => Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper)) {
        this.counts.ownershipChanges = bump(this.counts.ownershipChanges);
        for (const hook of this.processorHooks) if (Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper)
          this.hooks[hook.name] = "lost";
        this.dispose();
      }
      return;
    }
    if (this.processor) this.changeGeneration("processor");
    for (const hook of this.processorHooks.splice(0).reverse()) this.safe(() => restore(hook));
    if (this.processor && processorOwners.get(this.processor) === this) processorOwners.delete(this.processor);
    this.processor = undefined;
    for (const name of PROCESSOR_METHODS) this.hooks[name] = "unavailable";
    if (!next || typeof next !== "object") return;
    if (processorOwners.has(next)) {
      for (const name of PROCESSOR_METHODS) if (method(next, name)) this.hooks[name] = "ownership-conflict";
      return;
    }
    if (!method(next, "initializeShaders") || !method(next, "finalizeShaders")) return;
    const owner = this;
    const initialize = install(next, "initializeShaders", original => function(this: Host, ...args: any[]) {
      if (this !== next || !owner.usable() || owner.processor !== next) return original.apply(this, args);
      let span: Span | undefined; owner.safe(() => { span = owner.begin(args[0]); });
      let child: ChildFrame | undefined, failed = false;
      owner.safe(() => { child = owner.beginChild("initializeShaders", args[0]); });
      try { return original.apply(this, args); }
      catch (error) { failed = true; owner.safe(() => { owner.counts.initializeThrown = bump(owner.counts.initializeThrown); if (span) owner.retire(span); }); throw error; }
      finally { owner.safe(() => owner.endChild(child, failed)); }
    });
    if (!initialize) return;
    this.processorHooks.push(initialize);
    const finalize = install(next, "finalizeShaders", original => function(this: Host, ...args: any[]) {
      if (this !== next || !owner.usable() || owner.processor !== next) return original.apply(this, args);
      const span = owner.pending.get(args[2]); let failed = false;
      owner.counts.finalized = bump(owner.counts.finalized);
      let child: ChildFrame | undefined;
      owner.safe(() => { child = owner.beginChild("finalizeShaders", args[2]); });
      try { return original.apply(this, args); }
      catch (error) { failed = true; throw error; }
      finally { owner.safe(() => owner.endChild(child, failed)); owner.safe(() => owner.end(span, args[2], failed)); }
    });
    if (!finalize) { this.safe(() => restore(initialize)); this.processorHooks.length = 0; return; }
    this.processorHooks.push(finalize); this.processor = next; processorOwners.set(next, this);
    this.hooks.initializeShaders = this.hooks.finalizeShaders = "installed";
    for (const name of ["preProcessShaderCode", "preProcessor", "postProcessor"] as const) {
      // Do not create a synthetic preProcessor: pinned WGSL has none, and its
      // absence controls the native ProcessShaderConversion branch.
      const hook = install(next, name, original => function(this: Host, ...args: any[]) {
        if (this !== next || !owner.usable() || owner.processor !== next) return original.apply(this, args);
        let child: ChildFrame | undefined, failed = false;
        owner.safe(() => { child = owner.beginChild(name, name === "preProcessShaderCode"
          ? next._webgpuProcessingContext : args[name === "preProcessor" ? 4 : 3]); });
        try { return original.apply(this, args); }
        catch (error) { failed = true; throw error; }
        finally { owner.safe(() => owner.endChild(child, failed)); }
      });
      if (hook) { this.processorHooks.push(hook); this.hooks[name] = "installed"; }
    }
  }
  private beginChild(phase: ProcessorMethod, context: unknown): ChildFrame {
    const sample = this.children[phase]; sample.calls = bump(sample.calls);
    const span = context && typeof context === "object" ? this.pending.get(context) : undefined;
    if (!span || span.generation !== this.generation) sample.outsideTrackedSpan = bump(sample.outsideTrackedSpan);
    if (this.childDepth) sample.nestedCalls = bump(sample.nestedCalls);
    this.childDepth++;
    return { phase, generation: this.generation, started: this.clock() };
  }
  private endChild(frame: ChildFrame | undefined, failed: boolean) {
    if (!frame) return;
    this.childDepth = Math.max(0, this.childDepth - 1);
    const sample = this.children[frame.phase];
    if (failed) sample.thrown = bump(sample.thrown); else sample.returned = bump(sample.returned);
    if (frame.generation !== this.generation) { sample.interruptedCalls = bump(sample.interruptedCalls); return; }
    const elapsed = this.elapsed(frame.started);
    if (elapsed === undefined) return;
    sample.timingSamples = bump(sample.timingSamples);
    sample.cpuTotalMs = Math.min(Number.MAX_VALUE, sample.cpuTotalMs + elapsed);
    sample.cpuMaxMs = Math.max(sample.cpuMaxMs, elapsed);
  }
  private begin(context: unknown): Span | undefined {
    this.counts.initialized = bump(this.counts.initialized);
    if (!context || typeof context !== "object") { this.counts.invalidContext = bump(this.counts.invalidContext); return; }
    const prior = this.pending.get(context);
    const overlapping = this.pending.size > 0;
    for (const span of this.pending.values()) span.ambiguous = true;
    if (prior) { this.counts.replacedContext = bump(this.counts.replacedContext); this.retire(prior); }
    if (this.pending.size >= this.limit) { this.counts.capacityOmitted = bump(this.counts.capacityOmitted); return; }
    const span: Span = { context, generation: this.generation, epoch: this.epoch, started: this.clock(), ambiguous: overlapping,
      call: this.currentCall };
    this.pending.set(context, span); this.counts.pendingPeak = Math.max(this.counts.pendingPeak, this.pending.size);
    if (!this.marker) {
      const token = {}; this.marker = token;
      try { queueMicrotask(() => {
        if (!this.active || this.marker !== token) return;
        this.marker = undefined; this.epoch = bump(this.epoch);
      }); } catch {
        this.marker = undefined; span.ambiguous = true; this.counts.observerErrors = bump(this.counts.observerErrors);
      }
    }
    return span;
  }
  private end(span: Span | undefined, context: unknown, failed: boolean) {
    if (!this.active) return;
    if (failed) this.counts.finalizeThrown = bump(this.counts.finalizeThrown);
    if (!span || span.context !== context || span.generation !== this.generation || this.pending.get(span.context) !== span) {
      this.counts.unmatchedFinalize = bump(this.counts.unmatchedFinalize); return;
    }
    this.pending.delete(span.context); this.counts.matched = bump(this.counts.matched);
    const elapsed = this.elapsed(span.started);
    if (elapsed === undefined) { this.counts.invalidSpans = bump(this.counts.invalidSpans); return; }
    if (this.processor?._webgpuProcessingContext !== context) span.ambiguous = true;
    if (span.ambiguous) add(this.ambiguousLatency, elapsed);
    else if (span.epoch !== this.epoch) add(this.crossedLatency, elapsed);
    else add(this.syncCpu, elapsed);
  }
  snapshot() {
    return { active: this.active, inert: this.inert, disposed: this.disposed, suspended: this.suspended,
      generation: this.generation, lastGenerationReason: this.lastGenerationReason, scope,
      createEffect: { ...this.effect }, wgslProcessing: { syncCpu: { ...this.syncCpu }, crossedMicrotaskLatency: { ...this.crossedLatency },
        ambiguousLatency: { ...this.ambiguousLatency }, pending: this.pending.size, limit: this.limit },
      processorMethods: Object.fromEntries(PROCESSOR_METHODS.map(name => [name, { ...this.children[name] }])) as Record<ProcessorMethod, ChildMetric>,
      counts: { ...this.counts }, hooks: { ...this.hooks } };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.active = false; this.marker = undefined;
    for (const span of this.pending.values()) this.retire(span);
    for (const detach of this.detach.splice(0)) this.safe(detach);
    for (const hook of [...this.processorHooks.splice(0), ...this.engineHooks.splice(0)].reverse()) this.safe(() => restore(hook));
    if (this.processor && processorOwners.get(this.processor) === this) processorOwners.delete(this.processor);
    if (this.engine && owners.get(this.engine) === this) owners.delete(this.engine);
    this.processor = this.engine = undefined; this.device = undefined; this.currentCall = null;
    for (const key of Object.keys(this.hooks)) if (this.hooks[key] === "installed") this.hooks[key] = "disposed";
  }
}
