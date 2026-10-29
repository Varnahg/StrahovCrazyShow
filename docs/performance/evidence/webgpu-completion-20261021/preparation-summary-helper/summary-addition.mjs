
// Result-only QA evidence. No stages, resource objects or caller strings escape.
const QUALITY_LIMIT = 16;
const MISSING = Symbol('missing own data');
const NATIVE_PROMISE = Promise;
const NATIVE_THEN = Promise.prototype.then;
const NATIVE_SPECIES = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
const STATUSES = ['complete', 'timeout', 'disposed', 'failed'];
const FAILURE_STEPS = ['apply', 'meshes', 'check', 'effects', 'render', 'restore', 'cleanup', 'lifecycle'];
function ownData(value, key) {
  try {
    const descriptor = value != null && Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : MISSING;
  } catch { return MISSING; }
}
function arrayLength(value) {
  try {
    const length = Array.isArray(value) ? ownData(value, 'length') : MISSING;
    return Number.isSafeInteger(length) && length >= 0 ? length : null;
  } catch { return null; }
}
const unavailable = reason => ({ available: false, reason });

/** Copies at most16 quality rows using only own data descriptors. Stage entries
 * are never read. Missing/invalid data stays null with explicit invalidity. */
export function projectPreparationSummary(value) {
  if (value == null || (typeof value !== 'object' && typeof value !== 'function'))
    return unavailable('no-result');
  let invalidFields = 0;
  const scalar = (object, key, valid) => {
    const value = ownData(object, key);
    if (valid(value)) return value;
    invalidFields++;
    return null;
  };
  const timing = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const fields = object => ({
    status: scalar(object, 'status', value => STATUSES.includes(value)),
    elapsedMs: scalar(object, 'elapsedMs', timing),
    activeElapsedMs: scalar(object, 'activeElapsedMs', timing),
    pausedMs: scalar(object, 'pausedMs', timing),
    failureStep: scalar(object, 'failureStep', value => value === null || FAILURE_STEPS.includes(value)),
  });
  const result = { available: true, ...fields(value) };
  result.stageCount = arrayLength(ownData(value, 'stages'));
  if (result.stageCount === null) invalidFields++;
  const qualities = ownData(value, 'qualities');
  result.qualityCount = arrayLength(qualities);
  if (result.qualityCount === null) invalidFields++;
  result.qualitiesTruncated = result.qualityCount !== null && result.qualityCount > QUALITY_LIMIT;
  result.qualities = [];
  for (let index = 0; index < Math.min(result.qualityCount ?? 0, QUALITY_LIMIT); index++) {
    const before = invalidFields, row = ownData(qualities, String(index));
    const projected = {
      quality: scalar(row, 'quality', value => ['low', 'medium', 'high'].includes(value)),
      finalPass: scalar(row, 'finalPass', value => typeof value === 'boolean'),
      ...fields(row),
      stageCount: scalar(row, 'stageCount', count),
    };
    projected.valid = invalidFields === before;
    result.qualities.push(projected);
  }
  result.valid = invalidFields === 0;
  result.invalidFields = invalidFields;
  return result;
}

/** Observe only this Game's original method result. The single native.then side
 * reaction never replaces its Promise/return, receiver, args or thrown value.
 * Cleanup drops owner refs and restores only our own instance descriptor. */
export function observePreparationResult(game, { signal, startupSignal, isCurrent, onObserverError } = {}) {
  const state = { game, signals: [signal, startupSignal].filter(Boolean), isCurrent, onObserverError, active: true,
    summary: unavailable('not-observed'), restore: null, abort: null,
    health: ownData(game, 'renderHealth'), scene: ownData(game, 'scene'), engine: ownData(game, 'engine'),
    startupAbort: ownData(game, 'startupAbort'), wrapper: null };
  const generation = ownData(state.health, 'generation'), rendererId = ownData(state.health, 'rendererId');
  const report = error => { try { state.onObserverError?.(error); } catch {} };
  const dispose = () => {
    if (!state.active) return;
    state.active = false;
    for (const signal of state.signals) {
      try { signal.removeEventListener('abort', state.abort); } catch (error) { report(error); }
    }
    try { state.restore?.(); } catch (error) { report(error); }
    state.restore = state.abort = state.game = state.isCurrent = state.onObserverError = null;
    state.health = state.scene = state.engine = state.startupAbort = state.wrapper = null;
    state.signals = [];
    // Neither dispose nor returned accessors retain the argument Game binding.
    game = null;
  };
  const current = receiver => {
    try {
      if (!state.active || receiver !== state.game) return false;
      if (state.signals.some(signal => signal.aborted) || state.isCurrent?.() === false || ownData(state.game, 'disposed') === true ||
          ownData(state.game, 'renderHealth') !== state.health || ownData(state.game, 'scene') !== state.scene ||
          ownData(state.game, 'engine') !== state.engine || ownData(state.health, 'generation') !== generation ||
          ownData(state.health, 'rendererId') !== rendererId || ownData(state.game, 'startupAbort') !== state.startupAbort ||
          (state.wrapper && ownData(state.game, 'prepareLighting') !== state.wrapper)) {
        dispose(); return false;
      }
      return true;
    } catch (error) { report(error); dispose(); return false; }
  };
  const fulfilled = value => {
    if (!current(state.game)) return;
    try { state.summary = projectPreparationSummary(value); }
    catch (error) { state.summary = unavailable('projection-error'); report(error); }
  };
  const rejected = () => { if (current(state.game)) state.summary = unavailable('original-rejected'); };
  const owner = { snapshot: () => state.summary, dispose };
  try {
    if (!Number.isSafeInteger(generation) || generation < 1 || !Number.isSafeInteger(rendererId) || rendererId < 1 ||
        state.scene === MISSING || state.engine === MISSING) {
      state.summary = unavailable('owner-identity-unavailable'); dispose(); return owner;
    }
    if (!current(game)) return owner;
    const own = Object.getOwnPropertyDescriptor(game, 'prepareLighting');
    let descriptor = own, prototype = Object.getPrototypeOf(game);
    while (!descriptor && prototype) {
      descriptor = Object.getOwnPropertyDescriptor(prototype, 'prepareLighting');
      prototype = Object.getPrototypeOf(prototype);
    }
    const original = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    if (typeof original !== 'function') {
      state.summary = unavailable('missing-method'); dispose(); return owner;
    }
    const wrapper = function () {
      const observe = current(this);
      // Deliberately outside diagnostic catch: exact original synchronous throw.
      const result = Reflect.apply(original, this, arguments);
      if (observe && current(this)) {
        try {
          // Native.then consults constructor/@@species. Refuse exotic promises
          // without invoking their accessors/constructors as diagnostic work.
          const constructor = result != null && Object.getOwnPropertyDescriptor(result, 'constructor');
          const species = Object.getOwnPropertyDescriptor(NATIVE_PROMISE, Symbol.species);
          if (Object.getPrototypeOf(result) !== NATIVE_PROMISE.prototype ||
              (constructor && (!Object.hasOwn(constructor, 'value') || constructor.value !== NATIVE_PROMISE)) ||
              ownData(NATIVE_PROMISE.prototype, 'constructor') !== NATIVE_PROMISE ||
              species?.get !== NATIVE_SPECIES?.get || species?.set !== NATIVE_SPECIES?.set ||
              species?.value !== NATIVE_SPECIES?.value) {
            state.summary = unavailable('unsupported-promise');
          } else Reflect.apply(NATIVE_THEN, result, [fulfilled, rejected]);
        }
        catch (error) { state.summary = unavailable('non-native-promise'); report(error); }
      }
      return result;
    };
    Object.defineProperty(game, 'prepareLighting', own ? { ...own, value: wrapper } :
      { configurable: true, writable: true, enumerable: false, value: wrapper });
    state.wrapper = wrapper;
    state.restore = () => {
      if (ownData(state.game, 'prepareLighting') !== wrapper) return;
      if (own) Object.defineProperty(state.game, 'prepareLighting', own);
      else delete state.game.prepareLighting;
    };
    state.abort = dispose;
    for (const signal of state.signals) signal.addEventListener('abort', state.abort, { once: true });
    if (state.signals.some(signal => signal.aborted)) dispose();
  } catch (error) { state.summary = unavailable('observer-unavailable'); report(error); dispose(); }
  return owner;
}
