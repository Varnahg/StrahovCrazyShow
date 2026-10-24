/** Pure controller: one prepare waiter, then the original synchronous factory. */
export const ENTRY_ROUTINE_LIMITS = Object.freeze({ deadlineMs: 30000, frames: 8, standbyCalls: 8192 });
export const ENTRY_ROUTINE_SCOPE = 'First observed accepted foot-to-vehicle at outer prepare; restore waiter then synchronously install original8 routine capture. Install time is not Scene start; selected wall times include instrument overhead, never GPU/FPS/coldness proof.';
const owners = new WeakMap(), attempts = new WeakSet();
const data = (object, key) => { const d = object && Object.getOwnPropertyDescriptor(object, key); return d && Object.hasOwn(d, 'value') ? d.value : undefined; };
const count = value => Number.isSafeInteger(value) && value >= 0;
const time = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const same = (a, b) => !!a === !!b && (!a || ['value','get','set','writable','configurable','enumerable'].every(key => a[key] === b[key]));
function descriptor(object, key) { let current = object; while (current) { const d = Object.getOwnPropertyDescriptor(current, key); if (d) return d; current = Object.getPrototypeOf(current); } }
const pendingClear = health => { const p = data(health, 'pendingByKind'); return data(p, 'preparation') === 0 && data(p, 'shader-validation') === 0; };

export function captureEntryRoutineCost(game, { enabled = false, expected, startCapture, signal, isCurrent = () => true,
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!enabled) return undefined;
  const classes = expected?.classes, methods = expected?.methods;
  if (!classes || !methods || !(game instanceof classes.Game) || !(game.scene instanceof classes.Scene) ||
      !(game.gltfLightBudget instanceof classes.GltfLightBudget) || !(game.stableLights instanceof classes.StableLightState) || typeof startCapture !== 'function') throw Error('Entry routine singleton/factory mismatch');
  const state = { game, actor: game.actor, scene: game.scene, engine: game.engine, health: game.renderHealth, budget: game.gltfLightBudget,
    stable: game.stableLights, device: game.engine?._device, startup: game.startupAbort, isCurrent, factory: startCapture, active: true,
    profileOwner: null, timer: null, detach: null };
  const own = Object.getOwnPropertyDescriptor(state.budget, 'prepareFrame'), original = descriptor(state.budget, 'prepareFrame')?.value;
  if (original !== methods.prepareFrame || typeof original !== 'function' || (own && (!Object.hasOwn(own, 'value') || (!own.writable && !own.configurable))) ||
      (!own && !Object.isExtensible(state.budget)) || descriptor(state.scene, 'render')?.value !== methods.render || state.scene._engine !== state.engine ||
      state.actor?.vehicle !== false || owners.has(state.scene) || attempts.has(game)) throw Error('Entry routine requires native unowned foot Game');
  const rendererId = data(state.health, 'rendererId'), generation = data(state.health, 'generation');
  if (!count(rendererId) || rendererId < 1 || !count(generation) || generation < 1) throw Error('Entry renderer identity missing');
  let installed, inside = 0, installing = true, handingOff = false, phase = 'waiting', lastClock = -Infinity, routineProfile = null, terminal;
  let resolveDone; const done = new Promise(resolve => { resolveDone = resolve; });
  const meta = { schemaVersion: 1, scope: ENTRY_ROUTINE_SCOPE, limits: ENTRY_ROUTINE_LIMITS, active: true, complete: false, reason: null,
    armedAtMs: null, deadlineAtMs: null, triggeredAtMs: null, captureInstalledAtMs: null, terminalAtMs: null,
    vehicleAtArm: false, vehicleAtTrigger: null, vehicleAtTerminal: null, sceneFrameIdAtTrigger: null, engineFrameIdAtTrigger: null,
    sceneFrameIdAtTerminal: null, engineFrameIdAtTerminal: null, rendererId, generation, standbyCalls: 0, errors: 0, restoreConflicts: 0,
    installedWaiterHooks: 0, remainingWaiterHooks: 0 };
  const owner = { done, dispose: why => stop(why ?? 'disposed'), snapshot: () => terminal ?? ({ entryTrigger: structuredClone(meta), routineProfile }) };
  function clock() { try { const at = now(); if (time(at) && at >= lastClock) { lastClock = at; return at; } } catch {} meta.errors++; return null; }
  function healthCurrent() {
    return state.isCurrent() && state.game.ready && !state.game.disposed && !state.game.rendererFailed && !state.scene.isDisposed && !state.engine.isDisposed &&
      state.game.actor === state.actor && state.game.scene === state.scene && state.game.engine === state.engine && state.scene._engine === state.engine &&
      state.engine._device === state.device && state.game.renderHealth === state.health && state.game.gltfLightBudget === state.budget && state.game.stableLights === state.stable &&
      state.game.startupAbort === state.startup && !state.startup?.signal.aborted && !signal?.aborted &&
      data(state.health, 'rendererId') === rendererId && data(state.health, 'generation') === generation && data(state.health, 'phase') === 'ready' &&
      data(state.health, 'errorCount') === 0 && pendingClear(state.health) && !state.game.benchmark && !state.game.startupPresentationLease && !state.game.preparingRenderQuality;
  }
  function check(at) {
    if (!state.active) return false;
    try {
      if (at === null) { stop('clock-error', null); return false; }
      if (meta.deadlineAtMs !== null && at >= meta.deadlineAtMs) { stop('deadline', at); return false; }
      if (!healthCurrent() || (phase === 'capturing' && state.actor.vehicle !== true)) { stop('retired', at); return false; }
      if (installed ? !same(Object.getOwnPropertyDescriptor(state.budget, 'prepareFrame'), installed) :
          !same(Object.getOwnPropertyDescriptor(state.budget, 'prepareFrame'), own) || descriptor(state.budget, 'prepareFrame')?.value !== original) { stop('foreign-prepare', at); return false; }
      if (phase === 'waiting' && descriptor(state.scene, 'render')?.value !== methods.render) { stop('foreign-render', at); return false; }
      return true;
    } catch { meta.errors++; stop('observer-error', at); return false; }
  }
  function restoreWaiter() {
    if (!installed) return;
    try {
      const current = Object.getOwnPropertyDescriptor(state.budget, 'prepareFrame');
      if (same(current, installed)) { if (own) Object.defineProperty(state.budget, 'prepareFrame', own); else delete state.budget.prepareFrame; }
      else if (!same(current, own)) meta.restoreConflicts++;
    } catch { meta.restoreConflicts++; }
    installed = null; meta.remainingWaiterHooks = 0;
  }
  function seal() {
    if (!state.active && !installing && !handingOff && !terminal) {
      terminal = { entryTrigger: structuredClone(meta), routineProfile }; resolveDone(terminal);
    }
  }
  function stop(reason, at) {
    if (!state.active) return;
    state.active = false; meta.active = false; meta.reason = reason; meta.terminalAtMs = at === undefined ? clock() : at;
    try { meta.vehicleAtTerminal = typeof state.actor.vehicle === 'boolean' ? state.actor.vehicle : null; meta.sceneFrameIdAtTerminal = count(data(state.scene, '_frameId')) ? data(state.scene, '_frameId') : null; meta.engineFrameIdAtTerminal = count(data(state.engine, '_frameId')) ? data(state.engine, '_frameId') : null; } catch { meta.errors++; }
    restoreWaiter();
    try { if (state.timer !== null) clearTimer(state.timer); } catch { meta.errors++; }
    try { state.detach?.(); } catch { meta.errors++; }
    if (state.profileOwner) {
      try { state.profileOwner.dispose(reason); } catch { meta.errors++; }
      if (!routineProfile) { try { routineProfile = state.profileOwner.snapshot(); } catch { meta.errors++; } }
    }
    meta.complete = reason === 'complete' && !meta.errors && !meta.restoreConflicts && routineProfile?.complete === true;
    if (owners.get(state.scene) === owner) owners.delete(state.scene);
    state.game = state.actor = state.scene = state.engine = state.health = state.budget = state.stable = state.device = state.startup = null;
    state.isCurrent = state.factory = state.profileOwner = state.detach = null; state.timer = null; game = null;
    seal();
  }
  function profileDone(profile) {
    if (!state.active) return;
    routineProfile = profile;
    const at = clock(); if (!check(at)) return;
    if (!profile || profile.frames?.[0]?.frameId !== meta.sceneFrameIdAtTrigger || profile.frames.at(-1)?.nativeFrameIdAfter !== data(state.scene, '_frameId')) { meta.errors++; stop('frame-correlation', at); return; }
    stop(profile.complete === true ? 'complete' : 'routine-incomplete', at);
  }
  function trigger(at) {
    meta.triggeredAtMs = at; meta.vehicleAtTrigger = true; meta.sceneFrameIdAtTrigger = data(state.scene, '_frameId'); meta.engineFrameIdAtTrigger = data(state.engine, '_frameId');
    if (!count(meta.sceneFrameIdAtTrigger) || !count(meta.engineFrameIdAtTrigger)) { meta.errors++; stop('frame-correlation', at); return; }
    restoreWaiter(); if (meta.restoreConflicts) { stop('waiter-restore-failed', at); return; }
    phase = 'capturing'; handingOff = true;
    let returned;
    try {
      returned = Reflect.apply(state.factory, undefined, [state.game, { enabled: true, now, signal, isRetired: () => !check(clock()) }]);
      if (!returned || typeof returned.dispose !== 'function' || typeof returned.snapshot !== 'function') throw Error('Invalid original capture owner');
      // Both reactions consume only QA-control errors, never a product return.
      Reflect.apply(Promise.prototype.then, returned.done, [profile => { try { profileDone(profile); } catch { meta.errors++; stop('observer-error'); } }, () => { meta.errors++; stop('routine-rejected'); }]);
      if (!state.active || !check(clock())) {
        try { returned.dispose('late-owner'); if (!routineProfile) routineProfile = returned.snapshot(); } catch { meta.errors++; }
        return;
      }
      state.profileOwner = returned; meta.captureInstalledAtMs = clock();
      check(meta.captureInstalledAtMs);
    } catch {
      meta.errors++;
      if (returned) { try { returned.dispose('factory-error'); if (!routineProfile) routineProfile = returned.snapshot(); } catch { meta.errors++; } }
      stop('factory-error');
    } finally { handingOff = false; seal(); }
  }
  const wrapper = function () {
    if (!state.active || phase !== 'waiting' || this !== state.budget) return Reflect.apply(original, this, arguments);
    try {
      const at = clock();
      if (check(at)) {
        if (inside) { meta.errors++; stop('prepare-reentry', at); }
        else if (meta.standbyCalls >= ENTRY_ROUTINE_LIMITS.standbyCalls) { meta.errors++; stop('standby-overflow', at); }
        else { meta.standbyCalls++; if (state.actor.vehicle === true) trigger(at); else if (state.actor.vehicle !== false) { meta.errors++; stop('invalid-vehicle', at); } }
      }
    } catch { meta.errors++; stop('observer-error'); }
    inside++;
    try { return Reflect.apply(original, this, arguments); }
    catch (error) { try { stop('original-prepare-threw'); } catch {} throw error; }
    finally { inside--; }
  };
  try {
    meta.armedAtMs = clock(); meta.deadlineAtMs = meta.armedAtMs === null ? null : meta.armedAtMs + ENTRY_ROUTINE_LIMITS.deadlineMs;
    if (!check(meta.armedAtMs)) return owner;
    installed = own ? { ...own, value: wrapper } : { value: wrapper, writable: true, configurable: true, enumerable: false };
    Object.defineProperty(state.budget, 'prepareFrame', installed); meta.installedWaiterHooks = 1; meta.remainingWaiterHooks = 1;
    owners.set(state.scene, owner); attempts.add(game);
    const detaches = [], aborted = () => stop('aborted'), startupSignal = state.startup?.signal;
    state.detach = () => { for (const detach of detaches.splice(0)) { try { detach(); } catch { meta.errors++; } } };
    if (signal) { detaches.push(() => signal.removeEventListener('abort', aborted)); signal.addEventListener('abort', aborted, { once: true }); if (!state.active) return owner; }
    if (startupSignal) { detaches.push(() => startupSignal.removeEventListener('abort', aborted)); startupSignal.addEventListener('abort', aborted, { once: true }); if (!state.active) return owner; }
    const observer = state.scene.onDisposeObservable.add(() => stop('scene-disposed'));
    if (!state.active) { observer.remove(true); return owner; } detaches.push(() => observer.remove(true));
    const timerAt = clock(); if (!check(timerAt)) return owner;
    const timer = setTimer(() => stop('deadline'), meta.deadlineAtMs - timerAt);
    if (!state.active) { clearTimer(timer); return owner; } state.timer = timer;
    check(clock());
  } catch { meta.errors++; stop('installation-failed'); }
  finally { installing = false; seal(); }
  return owner;
}

export function validateEntryTrigger(value, profile) {
  const keys = 'schemaVersion,scope,limits,active,complete,reason,armedAtMs,deadlineAtMs,triggeredAtMs,captureInstalledAtMs,terminalAtMs,vehicleAtArm,vehicleAtTrigger,vehicleAtTerminal,sceneFrameIdAtTrigger,engineFrameIdAtTrigger,sceneFrameIdAtTerminal,engineFrameIdAtTerminal,rendererId,generation,standbyCalls,errors,restoreConflicts,installedWaiterHooks,remainingWaiterHooks';
  if (!value || Object.keys(value).sort().join(',') !== keys.split(',').sort().join(',') || value.schemaVersion !== 1 || value.scope !== ENTRY_ROUTINE_SCOPE ||
      JSON.stringify(value.limits) !== JSON.stringify(ENTRY_ROUTINE_LIMITS) || value.active !== false || typeof value.complete !== 'boolean' ||
      typeof value.reason !== 'string' || value.reason.length > 40 || value.vehicleAtArm !== false || ![null,true].includes(value.vehicleAtTrigger) || ![null,true,false].includes(value.vehicleAtTerminal) ||
      ['rendererId','generation','standbyCalls','errors','restoreConflicts','installedWaiterHooks','remainingWaiterHooks'].some(key => !count(value[key])) ||
      value.rendererId < 1 || value.generation < 1 || value.standbyCalls > ENTRY_ROUTINE_LIMITS.standbyCalls || value.installedWaiterHooks > 1 || value.remainingWaiterHooks !== 0 ||
      ['armedAtMs','triggeredAtMs','captureInstalledAtMs','terminalAtMs'].some(key => value[key] !== null && !time(value[key])) ||
      value.deadlineAtMs !== (value.armedAtMs === null ? null : value.armedAtMs + ENTRY_ROUTINE_LIMITS.deadlineMs) ||
      ['sceneFrameIdAtTrigger','engineFrameIdAtTrigger','sceneFrameIdAtTerminal','engineFrameIdAtTerminal'].some(key => value[key] !== null && !count(value[key]))) throw Error('Entry trigger scalar identity/bounds');
  if ((value.triggeredAtMs === null) !== (value.vehicleAtTrigger === null) || (value.triggeredAtMs === null && (value.sceneFrameIdAtTrigger !== null || value.engineFrameIdAtTrigger !== null || value.captureInstalledAtMs !== null)) ||
      (value.triggeredAtMs !== null && (value.armedAtMs === null || value.triggeredAtMs < value.armedAtMs || value.triggeredAtMs >= value.deadlineAtMs || value.sceneFrameIdAtTrigger === null || value.engineFrameIdAtTrigger === null)) ||
      (value.captureInstalledAtMs !== null && (value.triggeredAtMs === null || value.captureInstalledAtMs < value.triggeredAtMs)) ||
      (value.terminalAtMs !== null && value.armedAtMs !== null && value.terminalAtMs < value.armedAtMs)) throw Error('Entry trigger clock/order');
  if (value.complete && (value.reason !== 'complete' || value.installedWaiterHooks !== 1 || value.errors || value.restoreConflicts || value.captureInstalledAtMs === null || value.terminalAtMs === null ||
      value.terminalAtMs < value.captureInstalledAtMs || value.terminalAtMs >= value.deadlineAtMs || value.vehicleAtTerminal !== true || profile?.complete !== true || profile.frames?.length !== 8 ||
      profile.frames[0].frameId !== value.sceneFrameIdAtTrigger || profile.frames.at(-1).nativeFrameIdAfter !== value.sceneFrameIdAtTerminal)) throw Error('Entry trigger completion/correlation');
  return value;
}
