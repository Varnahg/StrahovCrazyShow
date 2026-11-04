const owners = new WeakMap();
const MAX_UTC = 8640000000000000;
export function validateClockConfig(raw) {
  if (!raw || Object.getPrototypeOf(raw) !== Object.prototype || raw.schemaVersion !== 1)
    throw new Error('Expected clock schemaVersion1 object');
  const allowed = ['schemaVersion', 'scenarioEpochUTC', 'armAtUTC', 'benchmarkAtUTC', 'latenessToleranceMs'];
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw new Error('Unknown clock configuration field');
  const utc = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_UTC;
  if (!utc(raw.scenarioEpochUTC) || !utc(raw.armAtUTC)) throw new Error('Invalid scenario/arm UTC');
  const result = { schemaVersion: 1, scenarioEpochUTC: raw.scenarioEpochUTC, armAtUTC: raw.armAtUTC };
  if (raw.benchmarkAtUTC !== undefined) {
    if (!utc(raw.benchmarkAtUTC) || raw.benchmarkAtUTC <= raw.armAtUTC ||
        !Number.isFinite(raw.latenessToleranceMs) || raw.latenessToleranceMs < 0 || raw.latenessToleranceMs > 1000)
      throw new Error('Invalid planned benchmark UTC/lateness tolerance');
    result.benchmarkAtUTC = raw.benchmarkAtUTC; result.latenessToleranceMs = raw.latenessToleranceMs;
  } else if (raw.latenessToleranceMs !== undefined) throw new Error('Lateness tolerance needs benchmarkAtUTC');
  return Object.freeze(result);
}
export function createTransitClock(raw, configId) {
  const config = validateClockConfig(raw);
  if (typeof configId !== 'string' || !configId) throw new Error('Clock config identity required');
  return Object.freeze({ config, configId, map(realUTC) {
    if (!Number.isFinite(realUTC) || realUTC < 0) throw new Error('Invalid original transit UTC');
    return config.scenarioEpochUTC + Math.max(0, realUTC - config.armAtUTC);
  } });
}
function install(target, name, clock, originalTime, callOriginal, expectedReceiver) {
  let methods = owners.get(target);
  if (methods?.has(name)) throw new Error('Clock method already owned; double mapping forbidden');
  const own = Object.getOwnPropertyDescriptor(target, name), original = target[name];
  if (typeof original !== 'function') throw new Error('Expected original clock method');
  const stats = { calls: 0, originalThrows: 0, preArmCalls: 0, postArmCalls: 0, rewindCalls: 0,
    instancesObserved: 0, unexpectedReceivers: 0, lastOriginalUTC: null, lastMappedUTC: null };
  const instances = new WeakSet(); let active = true, restoreConflict = false;
  function wrapper(time = Date.now()) {
    if (!active) return Reflect.apply(original, this, arguments);
    const realUTC = originalTime.call(this, original, time), mappedUTC = clock.map(realUTC);
    stats.calls++; stats[realUTC < clock.config.armAtUTC ? 'preArmCalls' : 'postArmCalls']++;
    if (stats.lastOriginalUTC !== null && realUTC < stats.lastOriginalUTC) stats.rewindCalls++;
    stats.lastOriginalUTC = realUTC; stats.lastMappedUTC = mappedUTC;
    if (this !== null && (typeof this === 'object' || typeof this === 'function') && !instances.has(this)) {
      instances.add(this); stats.instancesObserved++;
    }
    if (expectedReceiver && !expectedReceiver(this)) stats.unexpectedReceivers++;
    try { return callOriginal.call(this, original, mappedUTC); }
    catch (error) { stats.originalThrows++; throw error; }
  }
  Object.defineProperty(target, name, { value: wrapper, configurable: true, writable: true, enumerable: own?.enumerable ?? false });
  if (!methods) { methods = new Map(); owners.set(target, methods); }
  methods.set(name, wrapper);
  return {
    snapshot: () => ({ configId: clock.configId, active, methodOwned: target[name] === wrapper, restoreConflict, ...stats }),
    dispose() {
      if (!active) return;
      active = false;
      if (Object.getOwnPropertyDescriptor(target, name)?.value === wrapper) {
        if (own) Object.defineProperty(target, name, own); else Reflect.deleteProperty(target, name);
      } else restoreConflict = true;
      if (methods.get(name) === wrapper) methods.delete(name);
    },
  };
}
export function installSimulationClock(Simulation, clock) {
  return install(Simulation.prototype, 'tick', clock, function (_original, time) { return time; },
    function (original, mapped) { return original.call(this, mapped); }, value => value instanceof Simulation);
}
export function installRenderClock(game, clock) {
  if (game.network !== true) throw new Error('Clock QA requires actual multiplayer; guest would double-map physics');
  return install(game, 'trafficInstant', clock, function (original) {
    if (this.network !== true) throw new Error('Clock QA cannot switch to guest');
    return original.call(this);
  }, function (_original, mapped) { return mapped; });
}

/** One explicit harness timer, never a game/frame scheduler. Every invalid
 * callback/disposal is reported; late callbacks never start a benchmark. */
export function createPlannedBenchmark(config, options) {
  config = validateClockConfig(config);
  if (config.benchmarkAtUTC === undefined) throw new Error('No planned benchmark configured');
  let state = 'idle', timer, resolvePending;
  const plan = extra => ({ plannedUTC: config.benchmarkAtUTC, latenessToleranceMs: config.latenessToleranceMs, ...extra });
  const invalid = (reason, actualUTC) => {
    state = 'finished';
    const value = plan({ reason, callbackUTC: actualUTC, actualStartUTC: null, latenessMs: actualUTC - config.benchmarkAtUTC });
    Promise.resolve().then(() => options.onInvalid(value)).then(resolvePending, error => resolvePending({ observerError: String(error) }));
  };
  return {
    get state() { return state; },
    arm() {
      if (state !== 'idle') throw new Error('Planned benchmark can be armed only once');
      state = 'waiting';
      return new Promise(resolve => {
        resolvePending = resolve;
        const armedUTC = options.nowUTC();
        const callback = () => {
          if (state !== 'waiting') return;
          const actualUTC = options.nowUTC(), late = actualUTC - config.benchmarkAtUTC;
          if (late < 0 || late > config.latenessToleranceMs) return invalid(late < 0 ? 'early-callback' : 'late-callback', actualUTC);
          state = 'running';
          Promise.resolve().then(() => options.onStart(plan({ armedUTC, callbackUTC: actualUTC, latenessMs: late })))
            .then(value => { state = 'finished'; resolve(value); }, error => invalid('start-observer-failed: ' + String(error), options.nowUTC()));
        };
        const delay = Math.max(0, config.benchmarkAtUTC - armedUTC);
        if (delay > 2147483647) return invalid('planned-delay-exceeds-timer-limit', armedUTC);
        try { timer = options.setTimer(callback, delay); }
        catch (error) { invalid('timer-install-failed: ' + String(error), options.nowUTC()); }
      });
    },
    dispose() {
      if (state !== 'waiting') return;
      let reason = 'disposed-before-start';
      try { options.clearTimer(timer); } catch (error) { reason += '; timer-cleanup-failed: ' + String(error); }
      invalid(reason, options.nowUTC());
    },
  };
}
