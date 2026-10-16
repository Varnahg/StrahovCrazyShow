type Method = (this: unknown, ...args: unknown[]) => unknown;
type Observer = { remove(defer?: boolean): void };
type Observable = { add(callback: () => void): Observer | null };
type FrameHost = {
  requestAnimationFrame(callback: (timestamp: number) => void): number;
  cancelAnimationFrame(handle: number): void;
};

export type FrameLifecycleEngine = {
  readonly isWebGPU: boolean;
  readonly onDisposeObservable: Observable;
  readonly onContextRestoredObservable?: Observable;
  getHostWindow?(): FrameHost | null;
};
export type FrameLifecycleOptions = {
  now?: () => number;
  slowCallMs?: number;
  onSlowCall?: (event: {
    phase: FrameLifecyclePhase;
    label: string;
    cpuMs: number;
    generation: number;
    frameId: number | null;
  }) => void;
  /** CPU test injection. Normally the probe uses this engine's host window. */
  rawFrame?: {
    request(callback: (timestamp: number) => void): number;
    cancel(handle: number): void;
  };
};

export const FRAME_LIFECYCLE_PHASES = [
  "processFrame",
  "beginFrame",
  "renderFrame",
  "endFrame",
  "queueFrame",
  "flush",
  "endCurrentPass",
  "timestampStart",
  "timestampEnd",
  "timestampPassEnd",
  "destroyTextures",
  "destroyBuffers",
  "createEncoder",
  "encoderFinish",
  "beginRenderPass",
  "passEnd",
  "currentTexture",
  "writeBuffer",
  "writeTexture",
  "copyExternalImage",
] as const;
export type FrameLifecyclePhase = (typeof FRAME_LIFECYCLE_PHASES)[number];

const scope = Object.freeze({
  cpu: "Inclusive synchronous CPU wall calls, including nested work; never sum parent and child phases. Not GPU execution time.",
  async:
    "Async completion is unobserved. Return values are never inspected for then or given settlement handlers; original Promise rejection handling stays with the caller. Returned/thrown count only synchronous call outcomes.",
  cadence:
    "Concurrent raw host RAF, engine _processFrame and render-loop callback intervals are distinct; none is a gameplay FPS benchmark.",
  recent:
    "Cadence quantiles describe only the latest 128 valid intervals; count/total/max cover this engine generation or raw-probe epoch. Compare deltas only within matching owners/epochs.",
});
type Metric = {
  calls: number;
  returned: number;
  thrown: number;
  timingSamples: number;
  cpuTotalMs: number;
  cpuMaxMs: number;
  asyncCompletion: "unobserved";
};
type Hook = {
  phase?: FrameLifecyclePhase;
  installed: number;
  missed: number;
  reason: string | null;
};
type Binding = {
  name: string;
  hook: string;
  own?: PropertyDescriptor;
  wrapper: Method;
  lost?: boolean;
};
type Resource = { ref: WeakRef<object>; bindings: Binding[] };

const engineOwners = new WeakSet<object>();
const deviceOwners = new WeakMap<object, WebGpuFrameLifecycleProfile>();
const resourceLimit = 512;
const isObject = (value: unknown): value is object =>
  value !== null && (typeof value === "object" || typeof value === "function");
const field = (target: object, name: string): unknown =>
  (target as Record<string, unknown>)[name];
const metric = (): Metric => ({
  calls: 0,
  returned: 0,
  thrown: 0,
  timingSamples: 0,
  cpuTotalMs: 0,
  cpuMaxMs: 0,
  asyncCompletion: "unobserved",
});
const metrics = () =>
  Object.fromEntries(
    FRAME_LIFECYCLE_PHASES.map((p) => [p, metric()]),
  ) as Record<FrameLifecyclePhase, Metric>;

class Intervals {
  count = 0;
  totalMs = 0;
  maxMs = 0;
  private values = new Float64Array(128);
  add(value: number) {
    if (!Number.isFinite(value) || value < 0) return;
    this.values[this.count % this.values.length] = value;
    this.count++;
    this.totalMs += value;
    this.maxMs = Math.max(this.maxMs, value);
  }
  snapshot() {
    if (!this.count) return null;
    const values = this.values
      .slice(0, Math.min(this.count, this.values.length))
      .sort();
    return {
      count: this.count,
      totalMs: this.totalMs,
      maxMs: this.maxMs,
      recentSamples: values.length,
      recentP50Ms: values[Math.floor((values.length - 1) * 0.5)],
      recentP95Ms: values[Math.floor((values.length - 1) * 0.95)],
    };
  }
}

/** Explicit diagnostic owner. No global prototypes, render policy or GPU waits.
 * Transient methods live in a WeakMap; the bounded restore inventory has only
 * WeakRefs, and finish/end promptly remove completed resources from it. */
export class WebGpuFrameLifecycleProfile {
  private active: boolean;
  private generation = 1;
  private metrics = metrics();
  private hooks: Record<string, Hook> = {};
  private engineBindings: Binding[] = [];
  private targetBindings: { target: object; bindings: Binding[] }[] = [];
  private observers: Observer[] = [];
  private device?: object;
  private context?: object;
  private resources = new WeakMap<object, Resource>();
  private resourceRefs = new Set<WeakRef<object>>();
  private resourcePeak = 0;
  private resourceMisses = 0;
  private reporting = false;
  private readingClock = false;
  private observerErrors = 0;
  private invalidClocks = 0;
  private rawProvider?: FrameLifecycleOptions["rawFrame"];
  private rawHost?: FrameHost;
  private rawHandle?: number;
  private rawEpoch = 0;
  private rawAvailability = "unavailable";
  private rawDeliveryCompatible = false;
  private rawCallbacks = 0;
  private previousRaw?: number;
  private previousProcess?: number;
  private previousRender?: number;
  private previousEngineTimestamp?: number;
  private queuedAt?: number;
  private rawIntervals = new Intervals();
  private rawDelivery = new Intervals();
  private processIntervals = new Intervals();
  private renderIntervals = new Intervals();
  private engineTimestampIntervals = new Intervals();
  private queueWait = new Intervals();
  private skippedByCap = 0;
  private readonly now: () => number;

  constructor(
    private readonly engine: FrameLifecycleEngine,
    private readonly options: FrameLifecycleOptions = {},
  ) {
    this.active = engine.isWebGPU;
    this.now = options.now ?? (() => performance.now());
    this.initResourceHooks();
    if (!this.active) return;
    if (engineOwners.has(engine))
      throw new Error(
        "This engine already has a frame lifecycle profile owner.",
      );
    engineOwners.add(engine);
    this.subscribe(engine.onDisposeObservable, "lifecycle.dispose", () =>
      this.dispose(),
    );
    if (this.active)
      this.subscribe(
        engine.onContextRestoredObservable,
        "lifecycle.restore",
        () => this.bindTargets(true),
      );
    if (!this.active) {
      this.detachObservers();
      return;
    }
    for (const [name, phase] of [
      ["_processFrame", "processFrame"],
      ["beginFrame", "beginFrame"],
      ["_renderFrame", "renderFrame"],
      ["endFrame", "endFrame"],
      ["_queueNewFrameForRenderLoop", "queueFrame"],
      ["flushFramebuffer", "flush"],
      ["_endCurrentRenderPass", "endCurrentPass"],
    ] as const)
      this.install(engine, name, `engine.${name}`, phase, this.engineBindings, {
        before: (args) => {
          if (phase === "processFrame") {
            if (
              this.read(engine, "_device") !== this.device ||
              this.read(engine, "_context") !== this.context
            )
              this.bindTargets();
            if (
              !this.options.rawFrame &&
              this.host() !== (this.rawHost ?? null)
            )
              this.startRaw();
            const now = this.clock();
            if (this.previousProcess !== undefined)
              this.processIntervals.add(now - this.previousProcess);
            this.previousProcess = Number.isFinite(now) ? now : undefined;
            if (this.queuedAt !== undefined)
              this.queueWait.add(now - this.queuedAt);
            this.queuedAt = undefined;
            const timestamp = args[0];
            if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
              if (this.previousEngineTimestamp !== undefined)
                this.engineTimestampIntervals.add(
                  timestamp - this.previousEngineTimestamp,
                );
              this.previousEngineTimestamp = timestamp;
            }
          } else if (phase === "renderFrame") {
            const now = this.clock();
            if (this.previousRender !== undefined)
              this.renderIntervals.add(now - this.previousRender);
            this.previousRender = Number.isFinite(now) ? now : undefined;
          } else if (phase === "queueFrame") {
            const now = this.clock();
            this.queuedAt = Number.isFinite(now) ? now : undefined;
          }
        },
      });
    this.install(
      engine,
      "_isOverFrameTime",
      "engine._isOverFrameTime",
      undefined,
      this.engineBindings,
      {
        after: (result) => {
          if (result === true) this.skippedByCap++;
        },
      },
    );
    this.install(
      engine,
      "_initializeLimits",
      "engine._initializeLimits",
      undefined,
      this.engineBindings,
      {
        after: () => this.bindTargets(),
      },
    );
    this.bindTargets();
    this.startRaw();
  }

  private valid(generation: number) {
    return this.active && this.generation === generation;
  }
  private subscribe(
    observable: Observable | undefined,
    name: string,
    callback: () => void,
  ) {
    if (!observable) {
      this.missing(name, undefined, "unavailable");
      return;
    }
    try {
      const observer = observable.add(callback);
      if (observer) {
        this.observers.push(observer);
        this.hook(name).installed++;
      } else this.missing(name, undefined, "subscription-declined");
    } catch {
      this.observerErrors++;
      this.missing(name, undefined, "subscription-failed");
    }
  }
  private safe(callback: () => void) {
    try {
      callback();
    } catch {
      this.observerErrors++;
    }
  }
  private read(target: object, name: string) {
    try {
      return field(target, name);
    } catch {
      this.observerErrors++;
      return undefined;
    }
  }
  private clock() {
    if (this.readingClock) {
      this.invalidClocks++;
      return NaN;
    }
    this.readingClock = true;
    try {
      const value = this.now();
      if (!Number.isFinite(value) || value < 0) {
        this.invalidClocks++;
        return NaN;
      }
      return value;
    } catch {
      this.invalidClocks++;
      return NaN;
    } finally {
      this.readingClock = false;
    }
  }
  private hook(name: string, phase?: FrameLifecyclePhase) {
    return (this.hooks[name] ??= {
      phase,
      installed: 0,
      missed: 0,
      reason: null,
    });
  }
  private missing(
    name: string,
    phase: FrameLifecyclePhase | undefined,
    reason: string,
  ) {
    const hook = this.hook(name, phase);
    hook.missed++;
    hook.reason = reason;
  }
  private label(descriptor: unknown, fallback: string) {
    if (isObject(descriptor)) {
      try {
        const value = Object.getOwnPropertyDescriptor(
          descriptor,
          "label",
        )?.value;
        if (typeof value === "string") return value.slice(0, 160);
      } catch {
        this.observerErrors++;
      }
    }
    return fallback;
  }

  private install(
    target: object,
    name: string,
    hookName: string,
    phase: FrameLifecyclePhase | undefined,
    bindings: Binding[],
    operations: {
      before?: (args: unknown[]) => void;
      after?: (result: unknown, args: unknown[]) => void;
      label?: string;
      resource?: WeakRef<object>;
      terminal?: boolean;
    } = {},
  ) {
    const original = this.read(target, name);
    if (typeof original !== "function") {
      this.missing(hookName, phase, "unavailable");
      return;
    }
    let own: PropertyDescriptor | undefined;
    try {
      own = Object.getOwnPropertyDescriptor(target, name);
    } catch {
      this.missing(hookName, phase, "descriptor-unavailable");
      return;
    }
    const owner = this;
    const resource = operations.resource;
    // Never close over a strong transient target; its original descriptors live
    // only in the WeakMap value, not the weak restore inventory.
    const persistentTarget = resource ? undefined : target;
    const wrapper: Method = function (...args) {
      const receiver = resource ? resource.deref() : persistentTarget;
      if (!owner.active || owner.reporting || this !== receiver)
        return Reflect.apply(original, this, args);
      if (operations.before) owner.safe(() => operations.before!(args));
      const generation = owner.generation;
      const frameId = owner.number(owner.engine, "frameId");
      const measured = phase ? owner.metrics[phase] : undefined;
      if (measured) measured.calls++;
      const started = measured ? owner.clock() : NaN;
      let result: unknown;
      let failed = false;
      try {
        result = Reflect.apply(original, this, args);
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        if (measured) {
          // A returned Promise is only a synchronous return here. Inspecting or
          // observing it would change rejection ownership after this owner dies.
          if (failed) measured.thrown++;
          else measured.returned++;
          const elapsed = owner.clock() - started;
          if (Number.isFinite(elapsed) && elapsed >= 0) {
            measured.timingSamples++;
            measured.cpuTotalMs += elapsed;
            measured.cpuMaxMs = Math.max(measured.cpuMaxMs, elapsed);
            owner.slow(
              phase!,
              operations.label ?? hookName,
              elapsed,
              generation,
              frameId,
            );
          } else owner.invalidClocks++;
        }
      }
      if (owner.valid(generation)) {
        if (operations.after) owner.safe(() => operations.after!(result, args));
        if (operations.terminal && resource) owner.releaseResource(resource);
      }
      return result;
    };
    try {
      Object.defineProperty(
        target,
        name,
        own && "value" in own
          ? { ...own, value: wrapper }
          : {
              configurable: true,
              writable: true,
              enumerable: own?.enumerable ?? false,
              value: wrapper,
            },
      );
      bindings.push({ name, hook: hookName, own, wrapper });
      this.hook(hookName, phase).installed++;
    } catch {
      this.missing(hookName, phase, "unwrappable");
    }
  }

  private slow(
    phase: FrameLifecyclePhase,
    label: string,
    cpuMs: number,
    generation: number,
    frameId: number | null,
  ) {
    const requested = this.options.slowCallMs;
    const threshold =
      requested !== undefined && Number.isFinite(requested) && requested >= 0
        ? requested
        : 25;
    if (
      !this.valid(generation) ||
      cpuMs < threshold ||
      !this.options.onSlowCall ||
      this.reporting
    )
      return;
    this.reporting = true;
    try {
      this.options.onSlowCall({
        phase,
        label: label.slice(0, 160),
        cpuMs,
        generation,
        frameId,
      });
    } catch {
      this.observerErrors++;
    } finally {
      this.reporting = false;
    }
  }

  private target(target: object) {
    const bindings: Binding[] = [];
    this.targetBindings.push({ target, bindings });
    return bindings;
  }
  private initResourceHooks() {
    for (const [name, phase] of [
      ["encoder.finish", "encoderFinish"],
      ["encoder.beginRenderPass", "beginRenderPass"],
      ["pass.end", "passEnd"],
    ] as const)
      this.hook(name, phase);
  }
  private bindTargets(force = false) {
    if (!this.active) return;
    const device = this.read(this.engine, "_device");
    const context = this.read(this.engine, "_context");
    if (
      !force &&
      device === this.device &&
      context === this.context &&
      this.targetBindings.length
    )
      return;
    const changed = !!this.device || !!this.context;
    this.detachTargets();
    if (changed) {
      this.generation++;
      this.metrics = metrics();
      this.resourcePeak = this.resourceMisses = 0;
      this.hooks = Object.fromEntries(
        Object.entries(this.hooks)
          .filter(
            ([name]) =>
              name.startsWith("engine.") || name.startsWith("lifecycle."),
          )
          .map(([name, hook]) => [name, { ...hook }]),
      );
      this.initResourceHooks();
      this.resetCadence();
    }
    this.device = isObject(device) ? device : undefined;
    this.context = isObject(context) ? context : undefined;
    for (const [fieldName, methods] of [
      [
        "_timestampQuery",
        [
          ["startFrame", "timestampStart"],
          ["endFrame", "timestampEnd"],
          ["endPass", "timestampPassEnd"],
        ],
      ],
      ["_textureHelper", [["destroyDeferredTextures", "destroyTextures"]]],
      ["_bufferManager", [["destroyDeferredBuffers", "destroyBuffers"]]],
    ] as const) {
      const target = this.read(this.engine, fieldName);
      for (const [name, phase] of methods) {
        if (isObject(target))
          this.install(
            target,
            name,
            `${fieldName}.${name}`,
            phase,
            this.target(target),
          );
        else this.missing(`${fieldName}.${name}`, phase, "not-created");
      }
    }
    if (this.context)
      this.install(
        this.context,
        "getCurrentTexture",
        "context.getCurrentTexture",
        "currentTexture",
        this.target(this.context),
      );
    else
      this.missing(
        "context.getCurrentTexture",
        "currentTexture",
        "not-created",
      );
    if (this.device) {
      const owner = deviceOwners.get(this.device);
      if (owner && owner !== this) {
        this.missing(
          "device.createCommandEncoder",
          "createEncoder",
          "ownership-conflict",
        );
      } else {
        deviceOwners.set(this.device, this);
        this.install(
          this.device,
          "createCommandEncoder",
          "device.createCommandEncoder",
          "createEncoder",
          this.target(this.device),
          {
            after: (result, args) => {
              if (isObject(result))
                this.attachEncoder(
                  result,
                  this.label(args[0], "command encoder"),
                );
            },
          },
        );
        const queue = this.read(this.device, "queue");
        for (const [name, phase] of [
          ["writeBuffer", "writeBuffer"],
          ["writeTexture", "writeTexture"],
          ["copyExternalImageToTexture", "copyExternalImage"],
        ] as const) {
          if (isObject(queue))
            this.install(
              queue,
              name,
              `queue.${name}`,
              phase,
              this.target(queue),
            );
          else this.missing(`queue.${name}`, phase, "not-created");
        }
        for (const [name, label] of [
          ["_uploadEncoder", "existing upload encoder"],
          ["_renderEncoder", "existing render encoder"],
        ]) {
          const encoder = this.read(this.engine, name);
          if (isObject(encoder)) this.attachEncoder(encoder, label);
        }
        const pass = this.read(this.engine, "_currentRenderPass");
        if (isObject(pass)) this.attachPass(pass, "existing render pass");
      }
    } else
      this.missing(
        "device.createCommandEncoder",
        "createEncoder",
        "not-created",
      );
    if (changed) this.startRaw();
  }

  private resource(target: object) {
    const existing = this.resources.get(target);
    if (existing) return undefined;
    this.pruneResources();
    if (this.resourceRefs.size >= resourceLimit) {
      this.resourceMisses++;
      return undefined;
    }
    const record = { ref: new WeakRef(target), bindings: [] as Binding[] };
    this.resources.set(target, record);
    this.resourceRefs.add(record.ref);
    this.resourcePeak = Math.max(this.resourcePeak, this.resourceRefs.size);
    return record;
  }
  private attachEncoder(encoder: object, label: string) {
    if (this.resources.has(encoder)) return;
    const record = this.resource(encoder);
    if (!record) {
      this.missing("encoder.finish", "encoderFinish", "resource-limit");
      this.missing(
        "encoder.beginRenderPass",
        "beginRenderPass",
        "resource-limit",
      );
      return;
    }
    this.install(
      encoder,
      "finish",
      "encoder.finish",
      "encoderFinish",
      record.bindings,
      { resource: record.ref, terminal: true, label },
    );
    this.install(
      encoder,
      "beginRenderPass",
      "encoder.beginRenderPass",
      "beginRenderPass",
      record.bindings,
      {
        resource: record.ref,
        label,
        after: (result, args) => {
          if (isObject(result))
            this.attachPass(result, this.label(args[0], "render pass"));
        },
      },
    );
  }
  private attachPass(pass: object, label: string) {
    if (this.resources.has(pass)) return;
    const record = this.resource(pass);
    if (!record) {
      this.missing("pass.end", "passEnd", "resource-limit");
      return;
    }
    this.install(pass, "end", "pass.end", "passEnd", record.bindings, {
      resource: record.ref,
      terminal: true,
      label,
    });
  }
  private pruneResources() {
    for (const ref of this.resourceRefs)
      if (!ref.deref()) this.resourceRefs.delete(ref);
  }
  private releaseResource(ref: WeakRef<object>) {
    const target = ref.deref();
    if (target) {
      const record = this.resources.get(target);
      if (record) this.restore(target, record.bindings);
      this.resources.delete(target);
    }
    this.resourceRefs.delete(ref);
  }
  private restore(target: object, bindings: Binding[]) {
    for (let index = bindings.length - 1; index >= 0; index--) {
      const binding = bindings[index];
      const { name, own, wrapper } = binding;
      this.safe(() => {
        if (Object.getOwnPropertyDescriptor(target, name)?.value !== wrapper) {
          this.lost(binding);
          return;
        }
        if (own) Object.defineProperty(target, name, own);
        else if (!Reflect.deleteProperty(target, name))
          throw new Error("Cannot restore owned method");
      });
    }
    bindings.length = 0;
  }
  private lost(binding: Binding) {
    if (binding.lost) return;
    binding.lost = true;
    this.missing(
      binding.hook,
      this.hooks[binding.hook]?.phase,
      "ownership-lost",
    );
  }
  private audit(target: object, bindings: Binding[]) {
    for (const binding of bindings)
      this.safe(() => {
        if (
          Object.getOwnPropertyDescriptor(target, binding.name)?.value !==
          binding.wrapper
        )
          this.lost(binding);
      });
  }
  private detachTargets() {
    for (const ref of this.resourceRefs) this.releaseResource(ref);
    this.resources = new WeakMap();
    for (let index = this.targetBindings.length - 1; index >= 0; index--) {
      const entry = this.targetBindings[index];
      this.restore(entry.target, entry.bindings);
    }
    this.targetBindings.length = 0;
    if (this.device && deviceOwners.get(this.device) === this)
      deviceOwners.delete(this.device);
  }

  private resetCadence() {
    this.rawCallbacks = this.skippedByCap = 0;
    this.previousRaw =
      this.previousProcess =
      this.previousRender =
      this.previousEngineTimestamp =
      this.queuedAt =
        undefined;
    this.rawIntervals = new Intervals();
    this.rawDelivery = new Intervals();
    this.processIntervals = new Intervals();
    this.renderIntervals = new Intervals();
    this.engineTimestampIntervals = new Intervals();
    this.queueWait = new Intervals();
  }
  private startRaw() {
    this.stopRaw();
    if (!this.active) return;
    this.previousRaw = undefined;
    this.rawCallbacks = 0;
    this.rawIntervals = new Intervals();
    this.rawDelivery = new Intervals();
    const host = this.host();
    this.rawHost = host ?? undefined;
    this.rawDeliveryCompatible =
      !!this.options.now ||
      !!this.options.rawFrame ||
      (typeof window !== "undefined" && host === window);
    const provider =
      this.options.rawFrame ??
      (host && {
        request: (callback: (timestamp: number) => void) =>
          host.requestAnimationFrame(callback),
        cancel: (handle: number) => host.cancelAnimationFrame(handle),
      });
    if (!provider) {
      this.rawAvailability = "unavailable";
      return;
    }
    this.rawProvider = provider;
    const epoch = this.rawEpoch;
    const generation = this.generation;
    const queue = () => {
      if (!this.valid(generation) || epoch !== this.rawEpoch) return;
      let returned = false;
      let synchronous = false;
      let handle: number;
      try {
        handle = provider.request((timestamp) => {
          if (!returned) {
            synchronous = true;
            return;
          }
          if (!this.valid(generation) || epoch !== this.rawEpoch) return;
          this.rawHandle = undefined;
          this.rawCallbacks++;
          const now = this.rawDeliveryCompatible ? this.clock() : NaN;
          if (Number.isFinite(timestamp) && timestamp >= 0) {
            if (this.previousRaw !== undefined)
              this.rawIntervals.add(timestamp - this.previousRaw);
            this.previousRaw = timestamp;
            if (this.rawDeliveryCompatible)
              this.rawDelivery.add(now - timestamp);
          } else this.invalidClocks++;
          queue();
        });
      } catch {
        this.rawAvailability = "request-failed";
        this.observerErrors++;
        return;
      }
      returned = true;
      if (synchronous || !this.valid(generation) || epoch !== this.rawEpoch) {
        this.safe(() => provider.cancel(handle));
        if (synchronous)
          this.rawAvailability = "synchronous-provider-unsupported";
        return;
      }
      this.rawHandle = handle;
      this.rawAvailability = "observing";
    };
    queue();
  }
  private stopRaw() {
    this.rawEpoch++;
    const handle = this.rawHandle;
    this.rawHandle = undefined;
    if (handle !== undefined && this.rawProvider)
      this.safe(() => this.rawProvider!.cancel(handle));
    this.rawProvider = undefined;
    this.rawHost = undefined;
  }
  private host(): FrameHost | null {
    try {
      const host = this.engine.getHostWindow?.();
      return host &&
        typeof host.requestAnimationFrame === "function" &&
        typeof host.cancelAnimationFrame === "function"
        ? host
        : null;
    } catch {
      this.observerErrors++;
      return null;
    }
  }
  private number(target: object, name: string) {
    const value = this.read(target, name);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  private boolean(target: object, name: string) {
    const value = this.read(target, name);
    return typeof value === "boolean" ? value : null;
  }
  private runtimeState() {
    const host = this.host();
    let timerQueryCapability: boolean | null = null;
    let timestampQueryFeature: boolean | null = null;
    this.safe(() => {
      const getCaps = this.read(this.engine, "getCaps");
      if (typeof getCaps === "function") {
        const caps = Reflect.apply(getCaps, this.engine, []);
        if (isObject(caps) && this.read(caps, "timerQuery") !== undefined)
          timerQueryCapability = !!this.read(caps, "timerQuery");
      }
      const features = this.device && this.read(this.device, "features");
      const has = isObject(features) && this.read(features, "has");
      if (typeof has === "function")
        timestampQueryFeature = !!Reflect.apply(has, features, [
          "timestamp-query",
        ]);
    });
    const loops = this.read(this.engine, "_activeRenderLoops");
    return {
      frameId: this.number(this.engine, "frameId"),
      maxFPS: this.number(this.engine, "maxFPS"),
      maxFPSDefined: this.read(this.engine, "maxFPS") !== undefined,
      activeRenderLoops: Array.isArray(loops) ? loops.length : null,
      customRequester: !!this.read(
        this.engine,
        "customAnimationFrameRequester",
      ),
      contextLost: this.boolean(this.engine, "_contextWasLost"),
      skipFrameRender: this.boolean(this.engine, "skipFrameRender"),
      windowIsBackground: this.boolean(this.engine, "_windowIsBackground"),
      renderEvenInBackground: this.boolean(
        this.engine,
        "renderEvenInBackground",
      ),
      hostWindowAvailable: !!host,
      hostWindowIsGlobal:
        typeof window === "undefined" ? null : host === window,
      rawProbeUsesCurrentHost: this.options.rawFrame
        ? null
        : !!host && host === this.rawHost,
      enableGPUTimingMeasurements: this.boolean(
        this.engine,
        "enableGPUTimingMeasurements",
      ),
      timerQueryCapability,
      timestampQueryFeature,
    };
  }

  snapshot() {
    this.pruneResources();
    this.audit(this.engine, this.engineBindings);
    for (const entry of this.targetBindings)
      this.audit(entry.target, entry.bindings);
    for (const ref of this.resourceRefs) {
      const target = ref.deref();
      const resource = target && this.resources.get(target);
      if (target && resource) this.audit(target, resource.bindings);
    }
    const phases = {} as Record<FrameLifecyclePhase, Metric | null>;
    for (const phase of FRAME_LIFECYCLE_PHASES)
      phases[phase] = Object.values(this.hooks).some(
        (h) => h.phase === phase && h.installed > 0,
      )
        ? { ...this.metrics[phase] }
        : null;
    const hooks = Object.fromEntries(
      Object.entries(this.hooks).map(([name, hook]) => [
        name,
        {
          availability: hook.installed
            ? hook.missed
              ? "partial"
              : "installed"
            : (hook.reason ?? "not-created"),
          observedObjects: hook.installed,
          missedObjects: hook.missed,
          reason: hook.reason,
        },
      ]),
    );
    return {
      active: this.active,
      generation: this.generation,
      scope,
      phases,
      hooks,
      runtime: this.runtimeState(),
      observerErrors: this.observerErrors,
      invalidClocks: this.invalidClocks,
      resources: {
        tracked: this.resourceRefs.size,
        peak: this.resourcePeak,
        limit: resourceLimit,
        missed: this.resourceMisses,
      },
      rawRaf: {
        availability: this.active ? this.rawAvailability : "stopped",
        epoch: this.rawEpoch,
        source: this.options.rawFrame ? "injected" : "engine-host",
        deliveryClock: this.rawDeliveryCompatible
          ? "same-window-or-explicit-injection"
          : "origin-unverified",
        callbacks: this.rawCallbacks,
        intervals: this.rawIntervals.snapshot(),
        deliveryDelay: this.rawDelivery.snapshot(),
      },
      engineCadence: {
        processIntervals: this.processIntervals.snapshot(),
        renderCallbackIntervals: this.renderIntervals.snapshot(),
        timestampIntervals: this.engineTimestampIntervals.snapshot(),
        queueToProcess: this.queueWait.snapshot(),
        skippedByMaxFPS: this.skippedByCap,
      },
    };
  }
  private detachObservers() {
    for (const observer of this.observers)
      this.safe(() => observer.remove(true));
    this.observers.length = 0;
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    this.stopRaw();
    this.detachTargets();
    this.restore(this.engine, this.engineBindings);
    this.detachObservers();
    engineOwners.delete(this.engine);
  }
}
