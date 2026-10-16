import type { RenderOperationKind } from "./render-health";

type ProfileObserver = { remove(defer?: boolean): void };
type ProfileObservable = { add(callback: () => void): ProfileObserver };
type FaultChannel = "shader" | "pipeline" | "render";
type Method = (this: unknown, ...args: unknown[]) => unknown;

export type CompilationProfileEngine = {
  readonly isWebGPU: boolean;
  readonly _device?: object;
  readonly countersLastFrame?: Record<string, number>;
  readonly onDisposeObservable: ProfileObservable;
  readonly onContextRestoredObservable: ProfileObservable;
};

export type CompilationProfileOptions = {
  now?: () => number;
  slowCallMs?: number;
  onSlowCall?: (event: {
    phase: CompilationPhase;
    label: string;
    cpuMs: number;
    generation: number;
  }) => void;
  onError?: (channel: FaultChannel, error: unknown, label: string) => void;
  /** Returns an observed branch, not a replacement for the caller's promise.
   * Forward kind unchanged: only compilation-info diagnostics may overlap stages. */
  track?: <T>(
    promise: Promise<T>,
    channel: "shader" | "pipeline",
    label: string,
    kind: RenderOperationKind,
  ) => Promise<T>;
};

export const COMPILATION_PHASES = [
  "glslToSpirv",
  "spirvToWgsl",
  "compilerLoad",
  "shaderPreparation",
  "shaderModule",
  "shaderValidation",
  "syncPipeline",
  "asyncPipeline",
  "submit",
] as const;
export type CompilationPhase = (typeof COMPILATION_PHASES)[number];
type Metric = {
  calls: number;
  completed: number;
  failures: number;
  pending: number;
  cpuTotalMs: number;
  cpuMaxMs: number;
  asyncTotalMs: number;
  asyncMaxMs: number;
};
type Availability =
  "installed" | "unavailable" | "not-created" | "ownership-conflict";
const createMetric = (): Metric => ({
  calls: 0,
  completed: 0,
  failures: 0,
  pending: 0,
  cpuTotalMs: 0,
  cpuMaxMs: 0,
  asyncTotalMs: 0,
  asyncMaxMs: 0,
});
const createMetrics = () =>
  Object.fromEntries(
    COMPILATION_PHASES.map((phase) => [phase, createMetric()]),
  ) as Record<CompilationPhase, Metric>;
const owners = new WeakSet<object>();
const deviceOwners = new WeakMap<object, WebGpuCompilationProfile>();
const BUNDLE_KEYS = [
  "numEnableEffects",
  "numEnableDrawWrapper",
  "numBundleCreationNonCompatMode",
  "numBundleReuseNonCompatMode",
] as const;
const CACHE_KEYS = [
  "NumCacheHitWithoutHash",
  "NumCacheHitWithHash",
  "NumCacheMiss",
  "NumPipelineCreationLastFrame",
] as const;
const HOOKS = [
  "engine._initializeLimits",
  "engine._compileRawShaderToSpirV",
  "engine.prepareGlslangAndTintAsync",
  "engine._preparePipelineContextAsync",
  "engine._createPipelineStageDescriptor",
  "tint.convertSpirV2WGSL",
  "device.createShaderModule",
  "device.createRenderPipeline",
  "device.createRenderPipelineAsync",
  "queue.submit",
  "module.getCompilationInfo",
] as const;

const field = (object: object, name: string): unknown =>
  (object as Record<string, unknown>)[name];
const labelOf = (value: unknown, fallback: string) =>
  typeof value === "string" ? value.slice(0, 160) : fallback;

/** Observes only this engine's methods and device; does not create, prewarm or
 * replace pipelines. CPU API-call durations are not GPU execution times. */
export class WebGpuCompilationProfile {
  private active = true;
  private generation = 1;
  private metrics = createMetrics();
  private hooks: Record<string, Availability> = {};
  private observerErrors = 0;
  private device?: object;
  private tint?: object;
  private engineCleanups: (() => void)[] = [];
  private deviceCleanups: (() => void)[] = [];
  private tintCleanups: (() => void)[] = [];
  private lifecycleCleanups: (() => void)[] = [];
  private readonly now: () => number;
  readonly attachedAfterDeviceCreation: boolean;

  constructor(
    private readonly engine: CompilationProfileEngine,
    private readonly options: CompilationProfileOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.attachedAfterDeviceCreation = !!engine._device;
    this.hooks = Object.fromEntries(
      HOOKS.map((name) => [
        name,
        engine.isWebGPU ? "not-created" : "unavailable",
      ]),
    );
    if (!engine.isWebGPU) return;
    if (owners.has(engine))
      throw new Error(
        "This WebGPU engine already has a compilation profile owner.",
      );
    owners.add(engine);
    const disposed = engine.onDisposeObservable.add(() => this.dispose());
    const restored = engine.onContextRestoredObservable.add(() =>
      this.bindDevice(),
    );
    this.lifecycleCleanups.push(
      () => disposed.remove(true),
      () => restored.remove(true),
    );
    if (!this.active) {
      this.detach(this.lifecycleCleanups);
      return;
    }
    this.install(
      engine,
      "_initializeLimits",
      "engine._initializeLimits",
      undefined,
      this.engineCleanups,
      () => this.bindDevice(),
    );
    this.install(
      engine,
      "_compileRawShaderToSpirV",
      "engine._compileRawShaderToSpirV",
      "glslToSpirv",
      this.engineCleanups,
    );
    this.install(
      engine,
      "prepareGlslangAndTintAsync",
      "engine.prepareGlslangAndTintAsync",
      "compilerLoad",
      this.engineCleanups,
      undefined,
      () => this.bindTint(),
    );
    // The compiler-load promise may resume Babylon before an external health
    // branch settles. Bind immediately before the real Tint call as well.
    this.install(
      engine,
      "_createPipelineStageDescriptor",
      "engine._createPipelineStageDescriptor",
      undefined,
      this.engineCleanups,
      () => this.bindTint(),
    );
    this.install(
      engine,
      "_preparePipelineContextAsync",
      "engine._preparePipelineContextAsync",
      "shaderPreparation",
      this.engineCleanups,
    );
    this.bindDevice();
    this.bindTint();
  }

  private valid(generation: number) {
    return this.active && this.generation === generation;
  }
  private safe(callback: () => void) {
    try {
      callback();
    } catch {
      this.observerErrors++;
    }
  }
  private fault(channel: FaultChannel, error: unknown, label: string) {
    this.safe(() => this.options.onError?.(channel, error, label));
  }
  private channel(phase: CompilationPhase): FaultChannel {
    return phase === "submit"
      ? "render"
      : phase === "syncPipeline" || phase === "asyncPipeline"
        ? "pipeline"
        : "shader";
  }
  private label(phase: CompilationPhase, args: unknown[]) {
    try {
      if (phase === "glslToSpirv") return labelOf(args[1], phase);
      const first = args[0];
      if (first && typeof first === "object")
        return labelOf(
          Object.getOwnPropertyDescriptor(
            first,
            phase === "shaderPreparation" ? "_name" : "label",
          )?.value,
          phase,
        );
    } catch {
      this.observerErrors++;
    }
    return phase;
  }

  private observe(
    operation: Promise<unknown>,
    phase: CompilationPhase,
    metric: Metric,
    generation: number,
    started: number,
    label: string,
    onResolved?: () => void,
  ) {
    metric.pending++;
    let externalTracking = false;
    if (this.options.track) {
      try {
        const tracked = this.options.track(
          operation,
          this.channel(phase) as "shader" | "pipeline",
          label,
          phase === "shaderValidation" ? "shader-validation" : "preparation",
        );
        void tracked.catch(() => {});
        externalTracking = true;
      } catch {
        this.observerErrors++;
      }
    }
    // Observe the original operation for timing; the health branch above has a
    // separate rejection handler. Neither replaces the caller's return value.
    void operation
      .then(
        () => {
          if (!this.valid(generation)) return;
          metric.pending--;
          metric.completed++;
          const elapsed = Math.max(0, this.now() - started);
          metric.asyncTotalMs += elapsed;
          metric.asyncMaxMs = Math.max(metric.asyncMaxMs, elapsed);
          if (onResolved) this.safe(onResolved);
        },
        (error: unknown) => {
          if (!this.valid(generation)) return;
          metric.pending--;
          metric.completed++;
          metric.failures++;
          const elapsed = Math.max(0, this.now() - started);
          metric.asyncTotalMs += elapsed;
          metric.asyncMaxMs = Math.max(metric.asyncMaxMs, elapsed);
          if (!externalTracking) this.fault(this.channel(phase), error, label);
        },
      )
      .catch(() => {
        if (this.valid(generation)) this.observerErrors++;
      });
  }

  private install(
    target: object,
    methodName: string,
    hook: string,
    phase: CompilationPhase | undefined,
    cleanups: (() => void)[],
    before?: () => void,
    onResolved?: () => void,
  ) {
    const original = field(target, methodName);
    if (typeof original !== "function") {
      this.hooks[hook] = "unavailable";
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(target, methodName);
    const owner = this;
    const wrapper: Method = function (...args) {
      if (!owner.active) return Reflect.apply(original, this, args);
      if (before) owner.safe(before);
      if (!phase) return Reflect.apply(original, this, args);
      const generation = owner.generation;
      const metric = owner.metrics[phase];
      const label = owner.label(phase, args);
      metric.calls++;
      const started = owner.now();
      let result: unknown;
      let failed = false;
      let failure: unknown;
      try {
        result = Reflect.apply(original, this, args);
      } catch (error) {
        failed = true;
        failure = error;
        throw error;
      } finally {
        const elapsed = Math.max(0, owner.now() - started);
        metric.cpuTotalMs += elapsed;
        metric.cpuMaxMs = Math.max(metric.cpuMaxMs, elapsed);
        if (failed) {
          metric.completed++;
          metric.failures++;
          if (owner.valid(generation))
            owner.fault(owner.channel(phase), failure, label);
        }
        owner.slowCall(phase, label, elapsed, generation);
      }
      owner.safe(() => {
        if (result && typeof field(result as object, "then") === "function")
          owner.observe(
            result as Promise<unknown>,
            phase,
            metric,
            generation,
            started,
            label,
            onResolved,
          );
        else {
          metric.completed++;
          if (onResolved) onResolved();
          if (phase === "shaderModule" && result && typeof result === "object")
            owner.inspectShader(result, label);
        }
      });
      return result;
    };
    try {
      Object.defineProperty(target, methodName, {
        value: wrapper,
        writable: true,
        configurable: descriptor?.configurable ?? true,
        enumerable: descriptor?.enumerable ?? false,
      });
      this.hooks[hook] = "installed";
      cleanups.push(() => {
        if (
          Object.getOwnPropertyDescriptor(target, methodName)?.value !== wrapper
        )
          return;
        if (descriptor) Object.defineProperty(target, methodName, descriptor);
        else Reflect.deleteProperty(target, methodName);
      });
    } catch {
      this.hooks[hook] = "unavailable";
    }
  }

  private slowCall(
    phase: CompilationPhase,
    label: string,
    cpuMs: number,
    generation: number,
  ) {
    if (
      this.valid(generation) &&
      cpuMs >= Math.max(0, this.options.slowCallMs ?? 25)
    )
      this.safe(() =>
        this.options.onSlowCall?.({ phase, label, cpuMs, generation }),
      );
  }

  private inspectShader(module: object, label: string) {
    const getInfo = field(module, "getCompilationInfo");
    if (typeof getInfo !== "function") {
      this.hooks["module.getCompilationInfo"] = "unavailable";
      return;
    }
    this.hooks["module.getCompilationInfo"] = "installed";
    const generation = this.generation;
    const metric = this.metrics.shaderValidation;
    const started = this.now();
    metric.calls++;
    let result: unknown;
    let failed = false;
    let failure: unknown;
    try {
      result = Reflect.apply(getInfo, module, []);
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      const elapsed = Math.max(0, this.now() - started);
      metric.cpuTotalMs += elapsed;
      metric.cpuMaxMs = Math.max(metric.cpuMaxMs, elapsed);
      this.slowCall("shaderValidation", label, elapsed, generation);
    }
    if (failed) {
      metric.completed++;
      metric.failures++;
      this.fault("shader", failure, label);
      return;
    }
    const validated = Promise.resolve(result).then((info: unknown) => {
      if (!this.valid(generation)) return info;
      const messages =
        info && typeof info === "object" ? field(info, "messages") : undefined;
      if (!Array.isArray(messages))
        throw new Error(
          "Shader compilation information did not provide messages.",
        );
      const errors = messages.filter((message) => message?.type === "error");
      if (errors.length)
        throw new Error(
          errors
            .slice(0, 5)
            .map(
              (error) =>
                `${error.lineNum ?? "?"}:${error.linePos ?? "?"} ${String(error.message).slice(0, 500)}`,
            )
            .join("\n"),
        );
      return info;
    });
    this.observe(
      validated,
      "shaderValidation",
      metric,
      generation,
      started,
      label,
    );
  }

  private bindDevice() {
    if (!this.active || !this.engine.isWebGPU) return;
    const next = this.engine._device;
    if (next && next === this.device) return;
    const hadDevice = !!this.device;
    this.detach(this.deviceCleanups);
    if (this.device && deviceOwners.get(this.device) === this)
      deviceOwners.delete(this.device);
    this.device = undefined;
    if (hadDevice) {
      this.generation++;
      this.metrics = createMetrics();
    }
    this.hooks["module.getCompilationInfo"] = "not-created";
    if (!next) {
      for (const name of [
        "createShaderModule",
        "createRenderPipeline",
        "createRenderPipelineAsync",
      ])
        this.hooks[`device.${name}`] = "not-created";
      this.hooks["queue.submit"] = "not-created";
      return;
    }
    if (deviceOwners.has(next)) {
      for (const name of [
        "createShaderModule",
        "createRenderPipeline",
        "createRenderPipelineAsync",
      ])
        this.hooks[`device.${name}`] = "ownership-conflict";
      this.hooks["queue.submit"] = "ownership-conflict";
      return;
    }
    this.device = next;
    deviceOwners.set(next, this);
    this.install(
      next,
      "createShaderModule",
      "device.createShaderModule",
      "shaderModule",
      this.deviceCleanups,
    );
    this.install(
      next,
      "createRenderPipeline",
      "device.createRenderPipeline",
      "syncPipeline",
      this.deviceCleanups,
    );
    this.install(
      next,
      "createRenderPipelineAsync",
      "device.createRenderPipelineAsync",
      "asyncPipeline",
      this.deviceCleanups,
    );
    const queue = field(next, "queue");
    if (queue && typeof queue === "object")
      this.install(
        queue,
        "submit",
        "queue.submit",
        "submit",
        this.deviceCleanups,
      );
    else this.hooks["queue.submit"] = "unavailable";
  }

  private bindTint() {
    if (!this.active) return;
    const value = field(this.engine, "_tintWASM");
    const next = value && typeof value === "object" ? value : undefined;
    if (next && next === this.tint) return;
    this.detach(this.tintCleanups);
    this.tint = next;
    if (next)
      this.install(
        next,
        "convertSpirV2WGSL",
        "tint.convertSpirV2WGSL",
        "spirvToWgsl",
        this.tintCleanups,
      );
    else this.hooks["tint.convertSpirV2WGSL"] = "not-created";
  }

  snapshot() {
    const finite = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    const cache = field(this.engine, "_cacheRenderPipeline");
    const constructor =
      cache && typeof cache === "object"
        ? field(cache, "constructor")
        : undefined;
    return {
      active: this.active,
      backend: this.engine.isWebGPU ? "webgpu" : "other",
      generation: this.generation,
      attachedAfterDeviceCreation: this.attachedAfterDeviceCreation,
      timingScope:
        "Inclusive CPU API calls (nested scopes overlap); async durations are completion latency, not GPU execution time" as const,
      metrics: Object.fromEntries(
        COMPILATION_PHASES.map((phase) => [phase, { ...this.metrics[phase] }]),
      ),
      hooks: { ...this.hooks },
      observerErrors: this.observerErrors,
      bundleCountersLastFrame: this.engine.countersLastFrame
        ? Object.fromEntries(
            BUNDLE_KEYS.map((key) => [
              key,
              finite(this.engine.countersLastFrame?.[key]),
            ]),
          )
        : null,
      sharedCacheCounters: {
        scope:
          "Babylon static counters shared by all engines in this JavaScript realm" as const,
        values:
          typeof constructor === "function"
            ? Object.fromEntries(
                CACHE_KEYS.map((key) => [key, finite(field(constructor, key))]),
              )
            : null,
      },
    };
  }

  private detach(cleanups: (() => void)[]) {
    for (const cleanup of cleanups.splice(0).reverse()) this.safe(cleanup);
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    this.detach(this.deviceCleanups);
    this.detach(this.tintCleanups);
    this.detach(this.engineCleanups);
    this.detach(this.lifecycleCleanups);
    if (this.device && deviceOwners.get(this.device) === this)
      deviceOwners.delete(this.device);
    owners.delete(this.engine);
    this.device = undefined;
    this.tint = undefined;
    for (const metric of Object.values(this.metrics)) metric.pending = 0;
  }
}
