/** Pure QA owner/validator. No product imports or original Promise inspection. */
export const ENTRY_LIMITS = Object.freeze({ frames: 8, deadlineMs: 30000, standbyCalls: 8192, nestedCalls: 32 });
export const ENTRY_TARGETS = Object.freeze(['gltfLightBudget.prepareFrame.outer', 'stableLights.update.outer', 'Scene.render']);
export const ENTRY_SCOPE = 'Original synchronous wall intervals including observer/JIT/GC/scheduling; three outer scopes are disjoint subsets of the render chain, with wrapper/host gaps. Scene includes its direct glTF refresh; nested hook times overlap Scene. No GPU/submission/FPS or coldness claim.';
const activeOwners = new WeakMap(), attempted = new WeakSet();
const data = (object, key) => {
  const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};
const count = value => Number.isSafeInteger(value) && value >= 0;
const time = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const pendingClear = health => {
  const pending = data(health, 'pendingByKind');
  return data(pending, 'preparation') === 0 && data(pending, 'shader-validation') === 0;
};
function method(object, key, expected) {
  const own = Object.getOwnPropertyDescriptor(object, key);
  let descriptor = own, prototype = Object.getPrototypeOf(object);
  while (!descriptor && prototype) { descriptor = Object.getOwnPropertyDescriptor(prototype, key); prototype = Object.getPrototypeOf(prototype); }
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.value !== expected || typeof expected !== 'function' ||
      (own && !own.configurable && !own.writable) || (!own && !Object.isExtensible(object))) throw Error('Entry method identity/descriptor: ' + key);
  return { object, key, own, original: expected, wrapper: null };
}
const same = (a, b) => !!a === !!b && (!a || ['value', 'get', 'set', 'configurable', 'enumerable', 'writable'].every(key => a[key] === b[key]));
const scope = () => ({ calls: 0, startedAtMs: null, endedAtMs: null, wallMs: null, threw: null });

export function captureEntryRenderCost(game, { enabled = false, expected, signal, isCurrent = () => true,
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!enabled) return undefined;
  const classes = expected?.classes, methods = expected?.methods;
  if (!classes || !methods || !(game instanceof classes.Game) || !(game.scene instanceof classes.Scene) ||
      !(game.gltfLightBudget instanceof classes.GltfLightBudget) || !(game.stableLights instanceof classes.StableLightState)) throw Error('Entry singleton classes differ');
  const state = { game, actor: game.actor, scene: game.scene, engine: game.engine, health: game.renderHealth,
    budget: game.gltfLightBudget, stable: game.stableLights, device: game.engine?._device, startupAbort: game.startupAbort,
    signal, isCurrent, timer: null, detach: null, active: true };
  const rendererId = data(state.health, 'rendererId'), generation = data(state.health, 'generation');
  if (!count(rendererId) || rendererId < 1 || !count(generation) || generation < 1 || state.scene._engine !== state.engine ||
      !state.actor || state.actor.vehicle !== false || !game.ready || game.disposed || state.scene.isDisposed || game.benchmark ||
      game.rendererFailed || game.startupPresentationLease || game.preparingRenderQuality || data(state.health, 'phase') !== 'ready' || data(state.health, 'errorCount') !== 0 || !pendingClear(state.health) ||
      !isCurrent() || signal?.aborted || state.startupAbort?.signal.aborted || activeOwners.has(state.scene) || attempted.has(game)) throw Error('Entry requires fresh unowned ready foot Game');
  // Validate the complete transaction before writing a single descriptor.
  const hooks = [method(state.budget, 'prepareFrame', methods.prepareFrame), method(state.stable, 'update', methods.update), method(state.scene, 'render', methods.render)];
  const frames = [], depth = [0, 0, 0];
  let stage = 'standby', frame, previousVehicle = false, lastClock = -Infinity, armedAtMs = null, triggeredAtMs = null;
  let reason = null, errors = 0, phaseErrors = 0, restoreConflicts = 0, standbyCalls = 0, installedHooks = 0, overflow = false, terminal;
  let finish, installing = true; const done = new Promise(resolve => { finish = resolve; });
  function snapshot() {
    return terminal ?? { schemaVersion: 1, scope: ENTRY_SCOPE, limits: ENTRY_LIMITS, targets: ENTRY_TARGETS, active: state.active, reason,
      armedAtMs, deadlineAtMs: armedAtMs === null ? null : armedAtMs + ENTRY_LIMITS.deadlineMs, triggeredAtMs, rendererId, generation,
      standbyCalls, errors, phaseErrors, restoreConflicts, overflow, installedHooks, remainingHooks: hooks.filter(h => h.installed).length,
      complete: !state.active && reason === 'complete' && frames.length === 8 && !errors && !phaseErrors && !restoreConflicts && !overflow,
      frames: structuredClone(frames) };
  }
  function stop(why) {
    if (!state.active) return;
    state.active = false; reason = why;
    try { if (state.timer !== null) clearTimer(state.timer); } catch { errors++; }
    try { state.detach?.(); } catch { errors++; }
    for (const hook of hooks.slice().reverse()) {
      if (!hook.installed) { hook.object = hook.own = null; continue; }
      try {
        const current = Object.getOwnPropertyDescriptor(hook.object, hook.key);
        if (same(current, hook.installed)) {
          if (hook.own) Object.defineProperty(hook.object, hook.key, hook.own); else delete hook.object[hook.key];
        } else if (!same(current, hook.own)) restoreConflicts++;
      } catch { restoreConflicts++; }
      hook.installed = null; hook.object = null; hook.own = null;
    }
    if (activeOwners.get(state.scene) === owner) activeOwners.delete(state.scene);
    state.game = state.actor = state.scene = state.engine = state.health = state.budget = state.stable = state.device = state.startupAbort = null;
    state.signal = state.isCurrent = state.detach = null; state.timer = null; game = null;
    frame = null;
    if (!installing) seal();
  }
  function seal() { if (!terminal) { terminal = snapshot(); finish(terminal); } }
  const owner = { done, snapshot, dispose: why => stop(why ?? 'disposed') };
  function clock() {
    try { const at = now(); if (time(at) && at >= lastClock) { lastClock = at; return at; } } catch {}
    errors++; stop('clock-error'); return null;
  }
  function check(at) {
    if (!state.active) return false;
    try {
      if (at === null || at >= armedAtMs + ENTRY_LIMITS.deadlineMs) { stop('deadline'); return false; }
      if (!state.isCurrent() || state.signal?.aborted || state.startupAbort?.signal.aborted || state.game.disposed || !state.game.ready ||
          state.scene.isDisposed || state.game.actor !== state.actor || state.game.scene !== state.scene || state.game.engine !== state.engine ||
          state.game.renderHealth !== state.health || state.game.gltfLightBudget !== state.budget || state.game.stableLights !== state.stable ||
          state.game.startupAbort !== state.startupAbort || state.engine._device !== state.device || state.scene._engine !== state.engine ||
          data(state.health, 'rendererId') !== rendererId || data(state.health, 'generation') !== generation || data(state.health, 'phase') !== 'ready' ||
          data(state.health, 'errorCount') !== 0 || !pendingClear(state.health) || state.game.rendererFailed || state.engine.isDisposed ||
          data(state.budget, 'disposed') === true || data(state.stable, 'disposed') === true ||
          state.game.benchmark || state.game.startupPresentationLease || state.game.preparingRenderQuality) { stop('retired'); return false; }
      for (const hook of hooks) if (!same(Object.getOwnPropertyDescriptor(hook.object, hook.key), hook.installed)) { stop('foreign-method'); return false; }
      return true;
    } catch { errors++; stop('observer-error'); return false; }
  }
  const failPhase = () => { phaseErrors++; stop('phase-error'); };
  function before(index) {
    const at = clock(); if (!check(at)) return null;
    const vehicle = state.actor.vehicle;
    if (typeof vehicle !== 'boolean') { failPhase(); return null; }
    if (depth.some(Boolean)) {
      if (frame && depth[2] && index !== 2) {
        const nested = frame.nested[index];
        if (nested.calls >= ENTRY_LIMITS.nestedCalls) { overflow = true; stop('overflow'); return null; }
        nested.calls++;
        return { at, nested };
      }
      failPhase(); return null;
    }
    if (stage === 'standby') {
      if (index !== 0) { if (vehicle) failPhase(); return null; }
      if (standbyCalls >= ENTRY_LIMITS.standbyCalls) { overflow = true; stop('overflow'); return null; }
      standbyCalls++;
      if (!previousVehicle && vehicle) { triggeredAtMs = at; stage = 'prepare'; }
      previousVehicle = vehicle;
      if (stage === 'standby') return null;
    }
    if (stage !== ['prepare', 'stable', 'render'][index] || !vehicle) { failPhase(); return null; }
    if (index === 0) {
      const engineId = data(state.engine, '_frameId'), sceneId = data(state.scene, '_frameId');
      if (!count(engineId) || !count(sceneId)) { failPhase(); return null; }
      const previous = frames.at(-1);
      if (previous && (sceneId !== previous.sceneFrameIdAfter || engineId !== previous.engineFrameId + 1)) { failPhase(); return null; }
      frame = { index: frames.length, startedAtMs: at, endedAtMs: null, chainWallMs: null, engineFrameId: engineId, engineFrameIdAfterRender: null,
        sceneFrameIdBefore: sceneId, sceneFrameIdAfter: null, vehicleBeforePrelude: vehicle, vehicleBeforeScene: null, vehicleAfterScene: null,
        scopes: [scope(), scope(), scope()], nested: [{ calls: 0, wallMs: 0, throws: 0 }, { calls: 0, wallMs: 0, throws: 0 }], progressed: false };
      frames.push(frame);
    }
    if (index === 2) frame.vehicleBeforeScene = vehicle;
    const row = frame.scopes[index]; row.calls++; row.startedAtMs = at;
    return { at, row };
  }
  function after(index, token, threw) {
    if (!token || !state.active) return;
    const at = clock(); if (!state.active || at === null) return;
    if (token.nested) { token.nested.wallMs += at - token.at; if (threw) token.nested.throws++; }
    else { token.row.endedAtMs = at; token.row.wallMs = at - token.at; token.row.threw = threw; }
    if (threw) { stop('original-threw'); return; }
    if (!check(at)) return;
    if (token.nested) return;
    if (index !== 2) { stage = index === 0 ? 'stable' : 'render'; return; }
    frame.endedAtMs = at; frame.chainWallMs = at - frame.startedAtMs;
    frame.engineFrameIdAfterRender = data(state.engine, '_frameId'); frame.sceneFrameIdAfter = data(state.scene, '_frameId'); frame.vehicleAfterScene = state.actor.vehicle;
    frame.progressed = frame.sceneFrameIdAfter === frame.sceneFrameIdBefore + 1 && frame.engineFrameIdAfterRender === frame.engineFrameId;
    if (!frame.progressed || frame.vehicleAfterScene !== true) { failPhase(); return; }
    stage = 'prepare'; frame = null;
    if (frames.length === ENTRY_LIMITS.frames) stop('complete');
  }
  try {
    armedAtMs = clock(); if (!state.active) return owner;
    for (let index = 0; index < hooks.length; index++) {
      const hook = hooks[index], original = hook.original;
      hook.wrapper = function () {
        if (!state.active || this !== hook.object) return Reflect.apply(original, this, arguments);
        let token;
        try { token = before(index); } catch { errors++; stop('observer-error'); }
        depth[index]++;
        let threw = true;
        try { const result = Reflect.apply(original, this, arguments); threw = false; return result; }
        finally { depth[index]--; try { after(index, token, threw); } catch { errors++; stop('observer-error'); } }
      };
      hook.installed = hook.own ? { ...hook.own, value: hook.wrapper } : { value: hook.wrapper, configurable: true, writable: true, enumerable: false };
      Object.defineProperty(hook.object, hook.key, hook.installed);
      installedHooks++;
    }
    activeOwners.set(state.scene, owner); attempted.add(game);
    const aborted = () => stop('aborted'), startupSignal = state.startupAbort?.signal, detaches = [];
    state.detach = () => { for (const detach of detaches.splice(0)) { try { detach(); } catch { errors++; } } };
    if (signal) { detaches.push(() => signal.removeEventListener('abort', aborted)); signal.addEventListener('abort', aborted, { once: true }); if (!state.active) return owner; }
    if (startupSignal) { detaches.push(() => startupSignal.removeEventListener('abort', aborted)); startupSignal.addEventListener('abort', aborted, { once: true }); if (!state.active) return owner; }
    const disposable = state.scene.onDisposeObservable.add(() => stop('scene-disposed'));
    if (!state.active) { disposable.remove(true); return owner; }
    detaches.push(() => disposable.remove(true));
    const timer = setTimer(() => stop('deadline'), ENTRY_LIMITS.deadlineMs);
    if (!state.active) { clearTimer(timer); return owner; }
    state.timer = timer;
    check(clock());
  } catch { errors++; stop('installation-failed'); }
  finally { installing = false; if (!state.active) seal(); }
  return owner;
}

export function validateEntryRenderProfile(value) {
  const keys = (object, expected) => object && Object.keys(object).sort().join(',') === expected.split(',').sort().join(',');
  if (!value || value.schemaVersion !== 1 || value.scope !== ENTRY_SCOPE || JSON.stringify(value.limits) !== JSON.stringify(ENTRY_LIMITS) ||
      JSON.stringify(value.targets) !== JSON.stringify(ENTRY_TARGETS) ||
      !keys(value, 'schemaVersion,scope,limits,targets,active,reason,armedAtMs,deadlineAtMs,triggeredAtMs,rendererId,generation,standbyCalls,errors,phaseErrors,restoreConflicts,overflow,installedHooks,remainingHooks,complete,frames') ||
      value.active !== false || typeof value.complete !== 'boolean' || typeof value.reason !== 'string' || value.reason.length > 40 ||
      !(time(value.armedAtMs) || (!value.complete && value.armedAtMs === null && value.frames?.length === 0)) ||
      value.deadlineAtMs !== (value.armedAtMs === null ? null : value.armedAtMs + ENTRY_LIMITS.deadlineMs) ||
      (value.triggeredAtMs !== null && (!time(value.triggeredAtMs) || value.triggeredAtMs < value.armedAtMs)) ||
      !Array.isArray(value.frames) || value.frames.length > 8 || typeof value.overflow !== 'boolean' ||
      ['rendererId','generation','standbyCalls','errors','phaseErrors','restoreConflicts','installedHooks','remainingHooks'].some(key => !count(value[key]))) throw Error('Entry profile identity/bounds');
  if (value.rendererId < 1 || value.generation < 1 || value.installedHooks > 3 || value.remainingHooks !== 0 || value.standbyCalls > ENTRY_LIMITS.standbyCalls ||
      (value.triggeredAtMs !== null && (value.armedAtMs === null || value.triggeredAtMs >= value.deadlineAtMs))) throw Error('Entry terminal owner/clock bounds');
  for (const [index, frame] of value.frames.entries()) {
    if (!keys(frame, 'index,startedAtMs,endedAtMs,chainWallMs,engineFrameId,engineFrameIdAfterRender,sceneFrameIdBefore,sceneFrameIdAfter,vehicleBeforePrelude,vehicleBeforeScene,vehicleAfterScene,scopes,nested,progressed') ||
        frame.index !== index || !time(frame.startedAtMs) || frame.startedAtMs < value.armedAtMs || value.triggeredAtMs === null || frame.startedAtMs < value.triggeredAtMs ||
        !count(frame.engineFrameId) || !count(frame.sceneFrameIdBefore) || typeof frame.progressed !== 'boolean' ||
        ![null,true,false].includes(frame.vehicleBeforeScene) || ![null,true,false].includes(frame.vehicleAfterScene) ||
        ['engineFrameIdAfterRender','sceneFrameIdAfter'].some(key => frame[key] !== null && !count(frame[key])) ||
        ['endedAtMs','chainWallMs'].some(key => frame[key] !== null && !time(frame[key])) ||
        frame.vehicleBeforePrelude !== true || !Array.isArray(frame.scopes) || frame.scopes.length !== 3 ||
        !Array.isArray(frame.nested) || frame.nested.length !== 2) throw Error('Entry frame bounds');
    for (const row of frame.scopes) {
      if (!keys(row, 'calls,startedAtMs,endedAtMs,wallMs,threw') || !count(row.calls) || row.calls > 1 || ![null,true,false].includes(row.threw) ||
          ['startedAtMs','endedAtMs','wallMs'].some(key => row[key] !== null && !time(row[key]))) throw Error('Entry scope bounds');
      if ((row.calls === 0 && (row.startedAtMs !== null || row.endedAtMs !== null || row.wallMs !== null || row.threw !== null)) ||
          (row.calls === 1 && (row.startedAtMs === null || row.startedAtMs < frame.startedAtMs)) ||
          (row.endedAtMs === null && row.wallMs !== null)) throw Error('Entry partial scope inconsistent');
      if (row.endedAtMs !== null && (row.startedAtMs === null || row.wallMs !== row.endedAtMs - row.startedAtMs)) throw Error('Entry scope clock');
    }
    for (const row of frame.nested) if (!keys(row, 'calls,wallMs,throws') || !count(row.calls) || row.calls > ENTRY_LIMITS.nestedCalls || !count(row.throws) || row.throws > row.calls || !time(row.wallMs)) throw Error('Entry nested bounds');
    if (value.complete && (!frame.progressed || frame.engineFrameIdAfterRender !== frame.engineFrameId || frame.sceneFrameIdAfter !== frame.sceneFrameIdBefore + 1 ||
        frame.vehicleBeforeScene !== true || frame.vehicleAfterScene !== true || !time(frame.endedAtMs) || frame.endedAtMs >= value.deadlineAtMs ||
        frame.chainWallMs !== frame.endedAtMs - frame.startedAtMs || frame.scopes.some(row => row.calls !== 1 || row.threw !== false || row.endedAtMs === null) ||
        (index && (frame.sceneFrameIdBefore !== value.frames[index-1].sceneFrameIdAfter || frame.engineFrameId !== value.frames[index-1].engineFrameId+1)))) throw Error('Entry completed frame inconsistent');
    if (value.complete && (frame.startedAtMs !== frame.scopes[0].startedAtMs || frame.endedAtMs !== frame.scopes[2].endedAtMs ||
        frame.scopes[0].endedAtMs > frame.scopes[1].startedAtMs || frame.scopes[1].endedAtMs > frame.scopes[2].startedAtMs ||
        frame.nested.some(row => row.throws || row.wallMs > frame.scopes[2].wallMs + 0.000001))) throw Error('Entry completed scope ordering');
  }
  if (value.frames.length && value.frames[0].startedAtMs !== value.triggeredAtMs) throw Error('Entry trigger/frame mismatch');
  if (value.complete && (value.reason !== 'complete' || value.installedHooks !== 3 || value.frames.length !== 8 || value.triggeredAtMs === null || value.errors || value.phaseErrors || value.restoreConflicts || value.overflow || value.remainingHooks)) throw Error('Entry completion inconsistent');
  return value;
}
