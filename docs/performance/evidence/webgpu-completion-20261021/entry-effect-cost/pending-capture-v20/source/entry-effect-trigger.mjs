import { inspectEffectGuard, validateGuardFailure, validateGuardSample, closed, GUARD_CODES, effectContext, own as ownData } from './entry-effect-guard.mjs';
import { validateEntryTrigger, ENTRY_ROUTINE_SCOPE } from './entry-routine-cost.mjs';
/** Pure controller: one prepare waiter, then the original synchronous factory. */
export const ENTRY_ROUTINE_LIMITS = Object.freeze({ deadlineMs: 30000, frames: 8, standbyCalls: 8192 });
export const ENTRY_EFFECT_TRIGGER_SCOPE = 'Accepted foot-to-vehicle; idle admission and synchronous install, then eight consecutive original renders permitting pending preparation and shader-validation activity. Diagnostic completion is not renderer health/FPS/async acceptance.';
export const ENTRY_EFFECT_TRIGGER_REASONS=Object.freeze(['complete','disposed','owner-stopped','external-dispose','clock-error','deadline','retired','foreign-prepare','foreign-render','observer-error','frame-correlation','waiter-restore-failed','late-owner','factory-error','routine-rejected','routine-incomplete','prepare-reentry','standby-overflow','invalid-vehicle','original-prepare-threw','aborted','scene-disposed','installation-failed']);
const owners = new WeakMap(), attempts = new WeakSet();
const data = (object, key) => { const d = object && Object.getOwnPropertyDescriptor(object, key); return d && Object.hasOwn(d, 'value') ? d.value : undefined; };
const count = value => Number.isSafeInteger(value) && value >= 0;
const time = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const same = (a, b) => !!a === !!b && (!a || ['value','get','set','writable','configurable','enumerable'].every(key => a[key] === b[key]));
function descriptor(object, key) { let current = object; while (current) { const d = Object.getOwnPropertyDescriptor(current, key); if (d) return d; current = Object.getPrototypeOf(current); } }


export function captureEntryEffectTrigger(game, { enabled = false, expected, startCapture, signal, isCurrent = () => true,
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!enabled) return undefined;
  const classes = expected?.classes, methods = expected?.methods;
  if (!classes || !methods || !(game instanceof classes.Game) || !(ownData(game,'scene') instanceof classes.Scene) ||
      !(ownData(game,'gltfLightBudget') instanceof classes.GltfLightBudget) || !(ownData(game,'stableLights') instanceof classes.StableLightState) || typeof startCapture !== 'function') throw Error('Entry routine singleton/factory mismatch');
  const state = { ...effectContext(game,{isCurrent,signal}),factory:startCapture,active:true,profileOwner:null,timer:null,detach:null };
  const own = Object.getOwnPropertyDescriptor(state.budget, 'prepareFrame'), original = descriptor(state.budget, 'prepareFrame')?.value;
  if (original !== methods.prepareFrame || typeof original !== 'function' || (own && (!Object.hasOwn(own, 'value') || (!own.writable && !own.configurable))) ||
      (!own && !Object.isExtensible(state.budget)) || descriptor(state.scene, 'render')?.value !== methods.render || state.scene._engine !== state.engine ||
      ownData(state.actor,'vehicle') !== false || owners.has(state.scene) || attempts.has(game)) throw Error('Entry routine requires native unowned foot Game');
  const rendererId = data(state.health, 'rendererId'), generation = data(state.health, 'generation');
  if (!count(rendererId) || rendererId < 1 || !count(generation) || generation < 1) throw Error('Entry renderer identity missing');
  state.rendererId=rendererId;state.generation=generation;
  let installed, inside = 0, installing = true, handingOff = false, phase = 'waiting', lastClock = -Infinity, routineProfile = null, terminal;
  let resolveDone; const done = new Promise(resolve => { resolveDone = resolve; });
  const meta = { schemaVersion: 2, scope: ENTRY_EFFECT_TRIGGER_SCOPE, limits: ENTRY_ROUTINE_LIMITS, active: true, complete: false, reason: null,
    armedAtMs: null, deadlineAtMs: null, triggeredAtMs: null, captureInstalledAtMs: null, terminalAtMs: null,
    vehicleAtArm: false, vehicleAtTrigger: null, vehicleAtTerminal: null, sceneFrameIdAtTrigger: null, engineFrameIdAtTrigger: null,
    sceneFrameIdAtTerminal: null, engineFrameIdAtTerminal: null, rendererId, generation, standbyCalls: 0, errors: 0, restoreConflicts: 0,
    installedWaiterHooks: 0, remainingWaiterHooks: 0, firstFailure:null, pendingAtTerminal:null };
  const owner = { done, dispose: why => stop(why ?? 'disposed'), snapshot: () => terminal ?? ({ entryTrigger: structuredClone(meta), routineProfile }) };
  function clock() { try { const at = now(); if (time(at) && at >= lastClock) { lastClock = at; return at; } } catch {} meta.errors++; return null; }
  function check(at,boundary='before-render',requireIdle=false) {
    if (!state.active) return false;
    try {
      if (at === null) { stop('clock-error', null); return false; }
      if (meta.deadlineAtMs !== null && at >= meta.deadlineAtMs) { stop('deadline', at); return false; }
      const inspected=inspectEffectGuard(state,{source:'trigger',boundary,atMs:at,allowPending:phase==='capturing'&&meta.captureInstalledAtMs!==null&&!requireIdle,requireVehicle:phase==='capturing'});
      if(inspected.failure){meta.firstFailure??=inspected.failure;stop('retired',at);return false;}
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
    reason=ENTRY_EFFECT_TRIGGER_REASONS.includes(reason)?reason:'external-dispose';
    const terminalTime=at===undefined?clock():at;
    const observed=inspectEffectGuard(state,{source:'trigger',boundary:'terminal',atMs:terminalTime,allowPending:true,requireVehicle:phase==='capturing'});
    meta.pendingAtTerminal=observed.sample;
    if(reason!=='complete')meta.firstFailure??=observed.failure??{source:'trigger',boundary:'terminal',code:GUARD_CODES.includes(reason)?reason:'observer-error',atMs:terminalTime,frameId:count(data(state.scene,'_frameId'))?data(state.scene,'_frameId'):null,...observed.sample};
    state.active = false; meta.active = false; meta.reason = reason; meta.terminalAtMs = terminalTime;
    try { meta.vehicleAtTerminal = typeof ownData(state.actor,'vehicle') === 'boolean' ? ownData(state.actor,'vehicle') : null; meta.sceneFrameIdAtTerminal = count(data(state.scene, '_frameId')) ? data(state.scene, '_frameId') : null; meta.engineFrameIdAtTerminal = count(data(state.engine, '_frameId')) ? data(state.engine, '_frameId') : null; } catch { meta.errors++; }
    restoreWaiter();
    try { if (state.timer !== null) clearTimer(state.timer); } catch { meta.errors++; }
    try { state.detach?.(); } catch { meta.errors++; }
    if (state.profileOwner) {
      try { state.profileOwner.dispose(reason); } catch { meta.errors++; }
      if (!routineProfile) { try { routineProfile = state.profileOwner.snapshot(); } catch { meta.errors++; } }
    }
    meta.complete = reason === 'complete' && !meta.firstFailure && !meta.errors && !meta.restoreConflicts && routineProfile?.complete === true;
    if (owners.get(state.scene) === owner) owners.delete(state.scene);
    state.game = state.actor = state.scene = state.engine = state.health = state.budget = state.stable = state.device = state.startup = null;
    state.isCurrent = state.factory = state.profileOwner = state.detach = state.signal = null; state.timer = null; game = signal = expected = startCapture = now = setTimer = clearTimer = isCurrent = null;
    seal();
  }
  function profileDone(profile) {
    if (!state.active) return;
    routineProfile = profile;
    const at = clock(); if (!check(at,'terminal')) return;
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
      if (!state.active || !check(clock(),'installed',true)) {
        try { returned.dispose('late-owner'); if (!routineProfile) routineProfile = returned.snapshot(); } catch { meta.errors++; }
        return;
      }
      state.profileOwner = returned; meta.captureInstalledAtMs = clock();
      check(meta.captureInstalledAtMs,'installed',true);
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
      if (check(at,ownData(state.actor,'vehicle')===true?'trigger':'arm',true)) {
        if (inside) { meta.errors++; stop('prepare-reentry', at); }
        else if (meta.standbyCalls >= ENTRY_ROUTINE_LIMITS.standbyCalls) { meta.errors++; stop('standby-overflow', at); }
        else { meta.standbyCalls++; if (ownData(state.actor,'vehicle') === true) trigger(at); else if (ownData(state.actor,'vehicle') !== false) { meta.errors++; stop('invalid-vehicle', at); } }
      }
    } catch { meta.errors++; stop('observer-error'); }
    inside++;
    try { return Reflect.apply(original, this, arguments); }
    catch (error) { try { stop('original-prepare-threw'); } catch {} throw error; }
    finally { inside--; }
  };
  try {
    meta.armedAtMs = clock(); meta.deadlineAtMs = meta.armedAtMs === null ? null : meta.armedAtMs + ENTRY_ROUTINE_LIMITS.deadlineMs;
    if (!check(meta.armedAtMs,'arm',true)) return owner;
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

const baseKeys='schemaVersion,scope,limits,active,complete,reason,armedAtMs,deadlineAtMs,triggeredAtMs,captureInstalledAtMs,terminalAtMs,vehicleAtArm,vehicleAtTrigger,vehicleAtTerminal,sceneFrameIdAtTrigger,engineFrameIdAtTrigger,sceneFrameIdAtTerminal,engineFrameIdAtTerminal,rendererId,generation,standbyCalls,errors,restoreConflicts,installedWaiterHooks,remainingWaiterHooks'.split(',');
export function validateEntryEffectTrigger(value,profile){
  const p=closed(value,[...baseKeys,'firstFailure','pendingAtTerminal']);
  if(p.schemaVersion!==2||p.scope!==ENTRY_EFFECT_TRIGGER_SCOPE||!ENTRY_EFFECT_TRIGGER_REASONS.includes(p.reason))throw Error('Effect trigger schema/scope');
  const original=Object.fromEntries(baseKeys.map(k=>[k,p[k]]));original.schemaVersion=1;original.scope=ENTRY_ROUTINE_SCOPE;validateEntryTrigger(original,profile);
  validateGuardFailure(p.firstFailure);const terminal=validateGuardSample(p.pendingAtTerminal);
  if(p.firstFailure&&p.firstFailure.source!=='trigger')throw Error('Effect trigger witness source');
  if(p.reason!=='complete'&&!p.firstFailure)throw Error('Effect trigger missing failure witness');
  if(p.complete&&(p.firstFailure||!terminal.dataValid||terminal.identityMismatchMask||terminal.phase!=='ready'||terminal.errorCount||terminal.rendererId!==p.rendererId||terminal.generation!==p.generation))throw Error('Effect trigger false complete');
  if(p.firstFailure&&p.firstFailure.atMs!==null&&p.terminalAtMs!==null&&p.firstFailure.atMs>p.terminalAtMs)throw Error('Effect trigger witness time');
  return value;
}
