type Method = (this: any, ...args: any[]) => any;
type Hook = { target: any; name: string; original?: PropertyDescriptor; wrapper: Method };
export type Sample = { calls: number; totalMs: number; maxMs: number; throws: number };
type ReadyScope = { kind: string; started: number; optionsAt?: number; serializedAt?: number };

/** Test-process instance ownership only. No engine/material algorithm replaced. */
export class OwnedHooks {
  private hooks: Hook[] = [];
  wrap(target: any, name: string, decorate: (original: Method) => Method) {
    const own = Object.getOwnPropertyDescriptor(target, name);
    let descriptor = own, cursor = Object.getPrototypeOf(target);
    while (!descriptor && cursor) { descriptor = Object.getOwnPropertyDescriptor(cursor, name); cursor = Object.getPrototypeOf(cursor); }
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") throw Error("Missing native method " + name);
    const wrapper = decorate(descriptor.value);
    Object.defineProperty(target, name, own ? { ...own, value: wrapper } : { value: wrapper, configurable: true, writable: true, enumerable: false });
    this.hooks.push({ target, name, original: own, wrapper });
  }
  dispose() {
    for (const hook of this.hooks.splice(0).reverse()) {
      if (Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper) continue;
      if (hook.original) Object.defineProperty(hook.target, hook.name, hook.original);
      else Reflect.deleteProperty(hook.target, hook.name);
    }
  }
  get size() { return this.hooks.length; }
}

/** Inclusive method timers and explicit same-invocation boundaries. Parent and
 * child measurements overlap; they are never subtracted to invent self time. */
export class Trace {
  enabled = false;
  private samples: Record<string, Sample> = Object.create(null);
  private counts: Record<string, number> = Object.create(null);
  private stack: ReadyScope[] = [];
  current() { return this.stack.at(-1); }
  count(name: string, amount = 1) { if (this.enabled) this.counts[name] = (this.counts[name] ?? 0) + amount; }
  span(name: string, from: number, to: number, thrown = false) {
    if (!this.enabled) return;
    const ms = Math.max(0, to - from), sample = this.samples[name] ??= { calls: 0, totalMs: 0, maxMs: 0, throws: 0 };
    sample.calls++; sample.totalMs += ms; sample.maxMs = Math.max(sample.maxMs, ms); if (thrown) sample.throws++;
  }
  method(name: string, original: Method): Method {
    const trace = this;
    return function(this: any, ...args: any[]) {
      if (!trace.enabled) return Reflect.apply(original, this, args);
      const at = performance.now(); let thrown = false;
      try { return Reflect.apply(original, this, args); }
      catch (error) { thrown = true; throw error; }
      finally { trace.span(name, at, performance.now(), thrown); }
    };
  }
  ready(kind: string, original: Method): Method {
    const trace = this;
    return function(this: any, ...args: any[]) {
      if (!trace.enabled) return Reflect.apply(original, this, args);
      const scope = { kind, started: performance.now() }; trace.stack.push(scope); let thrown = false;
      try { return Reflect.apply(original, this, args); }
      catch (error) { thrown = true; throw error; }
      finally { trace.span("materialReadyInclusive", scope.started, performance.now(), thrown); if (trace.stack.pop() !== scope) throw Error("Lost readiness trace stack"); }
    };
  }
  mark(original: Method): Method {
    const trace = this;
    return function(this: any, ...args: any[]) {
      const scope = trace.enabled ? trace.current() : undefined, at = performance.now();
      if (scope?.kind === "standard") trace.span("standardReadinessThroughDefines", scope.started, at);
      const result = Reflect.apply(original, this, args);
      if (scope) { const end = performance.now(); trace.span("markAsProcessed", at, end); scope.optionsAt = end; }
      return result;
    };
  }
  serialize(original: Method): Method {
    const trace = this;
    return function(this: any, ...args: any[]) {
      if (!trace.enabled) return Reflect.apply(original, this, args);
      const scope = trace.current(), at = performance.now(); let thrown = false;
      if (scope?.optionsAt !== undefined) trace.span("optionsBeforeSerializer", scope.optionsAt, at);
      try { return Reflect.apply(original, this, args); }
      catch (error) { thrown = true; throw error; }
      finally { const end = performance.now(); trace.span("serializerInclusive", at, end, thrown); if (scope) scope.serializedAt = end; }
    };
  }
  effect(original: Method): Method {
    const trace = this;
    return function(this: any, ...args: any[]) {
      if (!trace.enabled) return Reflect.apply(original, this, args);
      const scope = trace.current(), entry = performance.now();
      if (scope?.serializedAt !== undefined) trace.span("optionsTailToCache", scope.serializedAt, entry);
      // Classification is outside the cache-method timer but remains observer
      // overhead inside enclosing readiness/options scopes. Bounded to this
      // fixture's tiny existing cache, not a production instrumentation design.
      const before = new Set(Object.values(this._compiledEffects));
      const at = performance.now(); let thrown = false;
      try {
        const result = Reflect.apply(original, this, args);
        trace.count(before.has(result) ? "cacheHits" : "cacheMisses");
        if (this._compiledEffects[result.key] !== result) throw Error("Native Effect cache ownership mismatch");
        return result;
      } catch (error) { thrown = true; throw error; }
      finally { trace.span("nativeCreateEffectInclusive", at, performance.now(), thrown); }
    };
  }
  snapshot() { return { samples: JSON.parse(JSON.stringify(this.samples)), counts: { ...this.counts }, openScopes: this.stack.length }; }
  reset() { if (this.stack.length) throw Error("Cannot reset an open trace"); this.samples = Object.create(null); this.counts = Object.create(null); }
}
