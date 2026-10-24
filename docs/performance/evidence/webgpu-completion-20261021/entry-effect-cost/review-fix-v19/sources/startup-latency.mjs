/** Diagnostic only: observe the original methods; never call either API extra,
 * never await a new fence, never change render health or return Promise identity. */
export const MAX_LATENCY_CALLS = 4096;
const owners = new WeakMap();
const then = Promise.prototype.then;
const clock = () => performance.now();
const metric = name => ({ name, calls: 0, trackedCalls: 0, settledCalls: 0, pending: 0, fulfilled: 0, rejected: 0,
  syncThrows: 0, unsupportedResults: 0, completionTotalMs: 0, completionMaxMs: 0, syncTotalMs: 0, syncMaxMs: 0 });

export function observeStartupLatency(engine, options = {}) {
  if (options.enabled !== true) return undefined;
  const capacity = Math.min(MAX_LATENCY_CALLS, Math.max(1, Math.floor(options.maxCalls ?? MAX_LATENCY_CALLS) || 1));
  const starts = new Float64Array(capacity), ends = new Float64Array(capacity), elapsed = new Float64Array(capacity);
  ends.fill(NaN); elapsed.fill(NaN);
  const channels = new Uint8Array(capacity), outcomes = new Uint8Array(capacity), nonNullResult = new Uint8Array(capacity);
  const metrics = [metric('device.popErrorScope'), metric('queue.onSubmittedWorkDone')];
  const issues = { overflow: 0, observerErrors: 0, invalidClocks: 0, restoreConflicts: 0, restoreFailures: 0, ownerChanged: 0, unexpectedReceivers: 0 };
  const availability = ['unavailable', 'unavailable'], hooks = [];
  let engineRef = engine, device, queue, signal = options.signal, retired = options.isRetired;
  let active = true, used = 0, stoppedAtMs = null, registered = false;
  const token = {};
  const now = options.now ?? clock;
  const readNow = () => {
    try { const value = now(); if (Number.isFinite(value) && value >= 0) return value; } catch { issues.observerErrors++; }
    issues.invalidClocks++; return NaN;
  };
  const finish = (index, outcome, value) => {
    if (!active || index < 0) return;
    try {
      const at = readNow(), duration = at - starts[index], stats = metrics[channels[index]];
      ends[index] = at; elapsed[index] = Number.isFinite(duration) && duration >= 0 ? duration : NaN;
      if (Number.isFinite(duration) && duration < 0) issues.invalidClocks++;
      outcomes[index] = outcome; nonNullResult[index] = value !== null && value !== undefined ? 1 : 0;
      stats.pending--; stats.settledCalls++;
      if (outcome === 1) stats.fulfilled++;
      else if (outcome === 2) stats.rejected++;
      else if (outcome === 3) stats.syncThrows++;
      else stats.unsupportedResults++;
      if ((outcome === 1 || outcome === 2) && Number.isFinite(elapsed[index])) {
        stats.completionTotalMs += elapsed[index]; stats.completionMaxMs = Math.max(stats.completionMaxMs, elapsed[index]);
      }
    } catch { issues.observerErrors++; }
  };
  const noteSync = (index, stats) => {
    if (index < 0) return;
    const sync = readNow() - starts[index];
    if (Number.isFinite(sync) && sync >= 0) { stats.syncTotalMs += sync; stats.syncMaxMs = Math.max(stats.syncMaxMs, sync); }
    else issues.invalidClocks++;
  };
  const restore = hook => {
    try {
      if (Object.getOwnPropertyDescriptor(hook.target, hook.name)?.value !== hook.wrapper) { issues.restoreConflicts++; return; }
      if (hook.own) Object.defineProperty(hook.target, hook.name, hook.own);
      else if (!Reflect.deleteProperty(hook.target, hook.name)) issues.restoreFailures++;
    } catch { issues.restoreFailures++; }
  };
  const onAbort = () => observer.dispose();
  const observer = {
    snapshot() {
      const finite = value => Number.isFinite(value) ? value : null;
      const stop = stoppedAtMs ?? readNow();
      const records = [];
      for (let i = 0; i < used; i++) records.push([i, channels[i], finite(starts[i]), finite(ends[i]), finite(elapsed[i]), outcomes[i], nonNullResult[i]]);
      return { enabled: true, active, evidenceValid: availability.every(value => value === 'installed') &&
          Object.values(issues).every(value => value === 0) && metrics.every(value => value.unsupportedResults === 0),
        capacity, recordedCalls: used, availability: [...availability], issues: { ...issues },
        channels: metrics.map(value => ({ ...value })), stoppedAtMs: finite(stoppedAtMs),
        pendingAgeMaxMs: used ? Math.max(0, ...Array.from(starts.subarray(0, used), (start, index) => outcomes[index] === 0 && Number.isFinite(start) && Number.isFinite(stop) ? stop - start : 0)) : 0,
        recordColumns: ['callSequence', 'channel', 'startAtMs', 'settledAtMs', 'completionMs', 'outcome', 'nonNullResult'],
        outcomeCodes: { pendingAtStop: 0, fulfilled: 1, rejected: 2, synchronousThrow: 3, unsupportedResult: 4 }, records,
        scope: 'Observed original native-Promise calls on this Game device during Game.start. Completion wall latency includes browser/microtask scheduling; not GPU execution time or call-site attribution. Pending/overflow are explicit, not zero latency. No extra pop/fence/await/health operation.',
      };
    },
    dispose() {
      if (!active) return;
      active = false; stoppedAtMs = readNow();
      signal?.removeEventListener('abort', onAbort);
      for (const hook of hooks.splice(0).reverse()) restore(hook);
      if (registered && owners.get(device) === token) owners.delete(device);
      registered = false; signal = retired = engineRef = device = queue = undefined;
    },
  };
  const live = () => {
    try {
      if (!signal?.aborted && !retired?.() && engineRef?._device === device && device?.queue === queue) return true;
      issues.ownerChanged++;
    } catch { issues.observerErrors++; }
    observer.dispose(); return false;
  };
  const install = (target, name, channel) => {
    try {
      const original = target?.[name];
      if (typeof original !== 'function') return;
      const own = Object.getOwnPropertyDescriptor(target, name);
      function wrapper(...args) {
        if (!active || !live()) return Reflect.apply(original, this, args);
        if (this !== target) issues.unexpectedReceivers++;
        const stats = metrics[channel]; stats.calls++;
        const index = used < capacity ? used++ : -1;
        if (index < 0) issues.overflow++;
        else { stats.trackedCalls++; stats.pending++; channels[index] = channel; starts[index] = readNow(); }
        let result;
        try { result = Reflect.apply(original, this, args); }
        catch (error) { noteSync(index, stats); finish(index, 3); throw error; }
        noteSync(index, stats);
        if (index >= 0) {
          try { then.call(result, value => finish(index, 1, value), () => finish(index, 2)); }
          catch { finish(index, 4); }
        }
        return result;
      }
      Object.defineProperty(target, name, own && 'value' in own ? { ...own, value: wrapper }
        : { value: wrapper, configurable: true, writable: true, enumerable: own?.enumerable ?? false });
      hooks.push({ target, name, own, wrapper }); availability[channel] = 'installed';
    } catch { availability[channel] = 'install-failed'; }
  };
  try {
    if (signal?.aborted || retired?.() || engine.isDisposed || engine.isWebGPU !== true) { availability.fill('retired-or-not-webgpu'); observer.dispose(); return observer; }
    device = engine._device; queue = device?.queue;
    if (!device || !queue) { observer.dispose(); return observer; }
    if (owners.has(device)) { availability.fill('ownership-conflict'); observer.dispose(); return observer; }
    owners.set(device, token); registered = true;
    install(device, 'popErrorScope', 0); install(queue, 'onSubmittedWorkDone', 1);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted || retired?.()) observer.dispose();
  } catch { issues.observerErrors++; observer.dispose(); }
  return observer;
}
