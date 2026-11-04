/** Cooperative startup dispatch for fresh Babylon 9.30 WebGPU contexts only.
 * A native call cannot be preempted; budgetMs stops the NEXT call, not this one.
 * Install after WebGpuCompilationProfile and gate startup with isReady(). */
type Host = Record<string, any>;
type Method = (this: any, ...args: any[]) => any;
type Hook = { target: Host; name: string; own?: PropertyDescriptor; original: Method; wrapper: Method };
type Job = {
  context: Host; args?: any[]; callback?: Method; hook: Hook; resolve(): void; reject(error: unknown): void;
  state: "queued" | "running" | "cancelled" | "complete"; readyCalled: boolean;
};
export type WebGpuShaderPreparationOptions = {
  /** Explicit native-control experiment: install no hooks or observers. */
  enabled?: boolean;
  signal?: AbortSignal;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  now?: () => number;
  budgetMs?: number;
  maxPerFrame?: number;
  /** Bounds queued plus still-running native work, including retired work. */
  maxQueued?: number;
  onError?: (error: unknown) => void;
};
export type WebGpuShaderPreparationSnapshot = {
  active: boolean; inert: boolean; disposed: boolean; faulted: boolean;
  queued: number; pending: number; started: number; completed: number; cancelled: number;
  passthrough: number; frameCount: number; workCpuCount: number; workCpuMs: number; workCpuMaxMs: number;
};
const owners = new WeakMap<object, WebGpuShaderPreparation>();
const increment = (n: number) => Math.min(Number.MAX_SAFE_INTEGER, n + 1);
function method(target: Host, name: string): Method | undefined {
  for (let cursor: object | null = target; cursor; cursor = Object.getPrototypeOf(cursor)) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, name);
    if (descriptor) return "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value : undefined;
  }
  return undefined;
}
function install(target: Host, name: string, make: (original: Method) => Method): Hook {
  const original = method(target, name), own = Object.getOwnPropertyDescriptor(target, name);
  if (!original || own && !own.configurable && (!own.writable || !("value" in own)))
    throw new Error("Cannot own WebGPU shader hook: " + name);
  const wrapper = make(original);
  Object.defineProperty(target, name, own ? { ...own, value: wrapper } : { value: wrapper, writable: true, configurable: true });
  return { target, name, own, original, wrapper };
}
function restore(hook: Hook) {
  if (Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper) return;
  if (hook.own) Object.defineProperty(hook.target, hook.name, hook.own);
  else if (!Reflect.deleteProperty(hook.target, hook.name)) throw new Error("Cannot release shader hook: " + hook.name);
}
function abortError() { return new DOMException("WebGPU startup shader preparation cancelled", "AbortError"); }

export class WebGpuShaderPreparation {
  private engine?: Host;
  private device?: object;
  private hooks: Hook[] = [];
  private detach: (() => void)[] = [];
  private queue: Job[] = [];
  private jobs = new Map<Host, Job>();
  private frame?: number;
  private draining = false;
  private disposed = false;
  private inert: boolean;
  private faulted = false;
  private fault: unknown;
  private pending = 0;
  private started = 0;
  private completed = 0;
  private cancelled = 0;
  private passthrough = 0;
  private frameCount = 0;
  private workCpuCount = 0;
  private workCpuMs = 0;
  private workCpuMaxMs = 0;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;
  private readonly budget: number;
  private readonly perFrame: number;
  private readonly capacity: number;
  private onError?: (error: unknown) => void;

  constructor(engine: object, options: WebGpuShaderPreparationOptions = {}) {
    const host = engine as Host;
    this.inert = options.enabled === false || host.isWebGPU !== true;
    this.requestFrame = options.requestFrame ?? (callback => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? (handle => cancelAnimationFrame(handle));
    this.now = options.now ?? (() => performance.now());
    this.budget = options.budgetMs ?? 4; this.perFrame = options.maxPerFrame ?? 4; this.capacity = options.maxQueued ?? 1024;
    this.onError = options.onError;
    if (options.signal?.aborted) { this.disposed = true; this.onError = undefined; return; }
    if (this.inert) return;
    if (!(this.budget > 0 && Number.isFinite(this.budget)) || !Number.isInteger(this.perFrame) || this.perFrame < 1 || this.perFrame > 64 ||
        !Number.isInteger(this.capacity) || this.capacity < 1 || this.capacity > 4096) throw new Error("Invalid WebGPU shader preparation budget");
    if (owners.has(engine)) throw new Error("WebGPU startup shader preparation already has an owner");
    if (!host._device || !host.onDisposeObservable?.add || !method(host, "_preparePipelineContextAsync") || !method(host, "_deletePipelineContext"))
      throw new Error("WebGPU shader preparation requires the initialized pinned engine");
    this.engine = host; this.device = host._device;
    try {
      const owner = this;
      this.hooks.push(install(host, "_preparePipelineContextAsync", original => function(this: Host, ...args: any[]) {
        if (owner.disposed || this !== host) return original.apply(this, args);
        owner.check();
        // Pinned non-float vertex-layout refresh requires an existing staged
        // context synchronously in the SAME draw. Never defer that path.
        // Lazy GLSL tools resume native compilation outside the RAF budget;
        // preserve that legacy path rather than claiming to schedule it.
        if (args[0]?.stages || args[0]?.shaderProcessingContext?.shaderLanguage === 0 && !host._glslangAndTintAreFullyLoaded) {
          owner.passthrough = increment(owner.passthrough);
          const result = original.apply(this, args);
          void Promise.resolve(result).catch(error => { if (!owner.disposed) owner.fail(error); });
          return result;
        }
        return owner.enqueue(args);
      }));
      this.hooks.push(install(host, "_deletePipelineContext", original => function(this: Host, context: Host, ...args: any[]) {
        if (this === host) owner.retireContext(context);
        return original.call(this, context, ...args);
      }));
      owners.set(host, this);
      const observe = (observable: Host | undefined, callback: () => void) => {
        if (!observable?.add) return;
        const observer = observable.add(callback); this.detach.push(() => observable.remove(observer));
      };
      observe(host.onDisposeObservable, () => this.dispose());
      observe(host.onContextLostObservable, () => this.fail(new Error("WebGPU device lost during shader preparation")));
      observe(host.onContextRestoredObservable, () => this.fail(new Error("WebGPU device restored during shader preparation")));
      if (options.signal) {
        const abort = () => this.dispose(); options.signal.addEventListener("abort", abort, { once: true });
        this.detach.push(() => options.signal!.removeEventListener("abort", abort));
        if (options.signal.aborted) this.dispose();
      }
    } catch (error) { this.dispose(); throw error; }
  }

  private check() {
    if (this.faulted) throw this.fault;
    const engine = this.engine;
    if (!engine || this.disposed || engine.isDisposed === true || engine._isDisposed === true || engine._device !== this.device ||
        this.hooks.some(hook => Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper)) {
      const error = new Error("WebGPU shader preparation ownership or device changed"); this.fail(error); throw error;
    }
  }
  private enqueue(args: any[]): Promise<void> {
    const context = args[0] as Host;
    if (!context || typeof args[10] !== "function" || context.engine !== this.engine || !method(context, "dispose")) {
      const error = new Error("Unsupported WebGPU shader preparation context/callback"); this.fail(error); throw error;
    }
    if (this.jobs.has(context) || this.jobs.size >= this.capacity) {
      const error = new Error(this.jobs.has(context) ? "WebGPU context already awaiting shader preparation" : "WebGPU shader preparation queue overflow");
      this.fail(error); throw error;
    }
    let resolve!: () => void, reject!: (error: unknown) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    // Babylon effect.functions ignores this Promise. An awaiter still sees its
    // rejection, but the native ignored-return path never creates an unhandled one.
    void promise.catch(() => {});
    const owner = this;
    let hook: Hook;
    try { hook = install(context, "dispose", original => function(this: Host, ...values: any[]) {
      if (this === context) owner.retireContext(context);
      return original.apply(this, values);
    }); } catch (error) { this.fail(error); reject(error); return promise; }
    const job: Job = { context, args, callback: args[10], hook, resolve, reject, state: "queued", readyCalled: false };
    args[10] = function(this: unknown, ...values: any[]) {
      if (owner.disposed || job.state === "cancelled") return;
      owner.check();
      if (Object.getOwnPropertyDescriptor(context, "dispose")?.value !== hook.wrapper)
        throw new Error("WebGPU queued context ownership changed");
      if (job.readyCalled) throw new Error("WebGPU preparation callback repeated");
      job.readyCalled = true; job.callback!.apply(this, values);
    };
    this.jobs.set(context, job); this.queue.push(job);
    this.schedule(); return promise;
  }
  private schedule() {
    if (this.disposed || this.draining || this.frame !== undefined || !this.queue.length) return;
    try { this.frame = this.requestFrame(() => this.drain()); }
    catch (error) { this.fail(error); }
  }
  private drain() {
    this.frame = undefined;
    if (this.disposed) return;
    this.draining = true;
    try {
      this.check(); this.frameCount = increment(this.frameCount);
      const start = this.now(); let calls = 0;
      while (this.queue.length && !this.disposed && calls < this.perFrame && (calls === 0 || this.now() - start < this.budget)) {
        const job = this.queue.shift()!;
        this.check();
        if (Object.getOwnPropertyDescriptor(job.context, "dispose")?.value !== job.hook.wrapper)
          throw new Error("WebGPU queued context ownership changed");
        job.state = "running"; this.pending++; this.started = increment(this.started); calls++;
        const at = this.now(); let result: unknown;
        try { result = this.hooks[0].original.apply(this.engine, job.args!); }
        catch (error) { this.finish(job, error, true); continue; }
        finally {
          const elapsed = Math.max(0, this.now() - at);
          this.workCpuCount = increment(this.workCpuCount); this.workCpuMs = Math.min(Number.MAX_VALUE, this.workCpuMs + elapsed);
          this.workCpuMaxMs = Math.max(this.workCpuMaxMs, elapsed); job.args = undefined;
        }
        void Promise.resolve(result).then(() => this.finish(job), error => this.finish(job, error, true)).catch(error => this.fail(error));
      }
    } catch (error) { this.fail(error); }
    finally { this.draining = false; this.schedule(); }
  }
  private finish(job: Job, error?: unknown, failed = false) {
    this.pending = Math.max(0, this.pending - 1);
    if (job.state === "cancelled" || this.disposed) { this.jobs.delete(job.context); return; }
    try {
      this.check();
      if (failed) throw error;
      if (!job.readyCalled) throw new Error("Native WebGPU preparation completed without onReady");
      restore(job.hook); this.jobs.delete(job.context); job.callback = undefined;
      job.state = "complete"; this.completed = increment(this.completed); job.resolve();
    } catch (cause) { this.fail(cause); }
  }
  private retireContext(context: Host) {
    const job = this.jobs.get(context); if (!job || job.state === "cancelled") return;
    try { this.retire(job, abortError()); } catch (error) { this.fail(error); }
  }
  private retire(job: Job, reason: unknown) {
    const queued = job.state === "queued";
    job.state = "cancelled"; job.args = undefined; job.callback = undefined;
    this.cancelled = increment(this.cancelled); job.reject(reason);
    if (queued) { const index = this.queue.indexOf(job); if (index >= 0) this.queue.splice(index, 1); this.jobs.delete(job.context); }
    restore(job.hook);
    if (!this.queue.length && this.frame !== undefined) { this.cancelFrame(this.frame); this.frame = undefined; }
  }
  private fail(error: unknown) {
    if (this.faulted || this.disposed) return;
    this.faulted = true; this.fault = error;
    const notify = this.onError; this.dispose();
    try { notify?.(error); } catch { /* retained fault still propagates through isReady */ }
  }
  isReady(): boolean {
    if (this.faulted) throw this.fault;
    if (this.disposed) return false;
    if (this.inert) return true;
    this.check(); return this.queue.length === 0 && this.pending === 0;
  }
  snapshot(): WebGpuShaderPreparationSnapshot {
    return { active: !this.disposed && !this.inert, inert: this.inert, disposed: this.disposed, faulted: this.faulted,
      queued: this.queue.length, pending: this.pending, started: this.started, completed: this.completed,
      cancelled: this.cancelled, passthrough: this.passthrough, frameCount: this.frameCount,
      workCpuCount: this.workCpuCount, workCpuMs: this.workCpuMs, workCpuMaxMs: this.workCpuMaxMs };
  }
  dispose(): void {
    if (this.disposed) return;
    const notify = this.onError;
    this.disposed = true; this.onError = undefined;
    const errors: unknown[] = [];
    if (this.frame !== undefined) { try { this.cancelFrame(this.frame); } catch (error) { errors.push(error); } this.frame = undefined; }
    for (const detach of this.detach.splice(0)) try { detach(); } catch (error) { errors.push(error); }
    for (const job of [...this.jobs.values()]) if (job.state !== "cancelled") {
      try { this.retire(job, this.faulted ? this.fault : abortError()); } catch (error) { errors.push(error); }
    }
    this.queue.length = 0; this.jobs.clear();
    for (const hook of this.hooks.splice(0).reverse()) try { restore(hook); } catch (error) { errors.push(error); }
    if (this.engine && owners.get(this.engine) === this) owners.delete(this.engine);
    this.engine = this.device = undefined;
    if (errors.length && !this.faulted) {
      this.faulted = true; this.fault = new AggregateError(errors, "Shader preparation cleanup failed");
      try { notify?.(this.fault); } catch { /* isReady retains the cleanup failure */ }
    }
  }
}
