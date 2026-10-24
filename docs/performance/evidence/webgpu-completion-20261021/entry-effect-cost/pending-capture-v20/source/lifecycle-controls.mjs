/** Explicit local QA action only. No device/health wrappers or synthetic loss. */
const attemptedDevices = new WeakSet();
export function createLifecycleControls(game, options = {}) {
  if (options.enabled !== true) return undefined;
  let owner = game, scene = game.scene, engine = game.engine, health = game.renderHealth;
  let device = engine?._device, originalDestroy = device?.destroy, current = options.isCurrent, notify = options.onAttempt;
  let startupSignal = game.startupAbort?.signal;
  const initial = health.snapshot(), rendererId = initial.rendererId, generation = initial.generation;
  let active = true, attempted = false, outcome = null, observer;
  let signals = [...new Set([options.signal, startupSignal].filter(Boolean))];
  const snapshot = () => ({ active, attempted, outcome, rendererId, generation });
  const dispose = () => {
    if (!active) return;
    active = false;
    for (const signal of signals) try { signal.removeEventListener('abort', dispose); } catch { /* Continue owned cleanup. */ }
    try { observer?.remove(true); } catch { /* Never replace the original action result. */ }
    signals = []; observer = undefined;
    owner = scene = engine = health = device = originalDestroy = current = notify = startupSignal = undefined;
  };
  const assertOwned = () => {
    if (!active || !owner || current?.() !== true || owner.disposed || owner.rendererFailed || signals.some(signal => signal.aborted) ||
        owner.scene !== scene || owner.engine !== engine || owner.renderHealth !== health || owner.startupAbort?.signal !== startupSignal || scene.isDisposed || engine.isDisposed ||
        scene.getEngine?.() !== engine || engine._device !== device)
      throw new Error('Lifecycle QA owner/device retired');
    const state = health.snapshot();
    if (!owner.ready || !state.valid || state.phase !== 'ready' || state.rendererId !== rendererId || state.generation !== generation ||
        !Number.isSafeInteger(rendererId) || rendererId < 1 || !Number.isSafeInteger(generation) || generation < 1 || state.errorCount !== 0 || state.pendingOperations !== 0 ||
        (state.pendingPreparationOperations ?? 0) !== 0 || owner.startupPresentationLease || owner.preparingRenderQuality || owner.benchmark)
      throw new Error('Lifecycle QA requires this ready valid idle renderer with no startup lease/pending work');
    if (!engine.isWebGPU || !device || typeof originalDestroy !== 'function' || device.destroy !== originalDestroy || attemptedDevices.has(device))
      throw new Error('Lifecycle QA original own WebGPU destroy unavailable or already attempted');
  };
  const destroyOwnDevice = () => {
    assertOwned();
    attemptedDevices.add(device); attempted = true;
    const report = notify;
    let returned = false;
    try { const result = Reflect.apply(originalDestroy, device, []); returned = true; return result; }
    finally {
      outcome = returned ? 'returned' : 'threw';
      try { report?.({ action: 'destroy-own-device', attempted: true, outcome, rendererId, generation }); }
      catch { /* Receipt/UI observers must not replace the original return/throw. */ }
      finally { dispose(); }
    }
  };
  for (const signal of signals) signal.addEventListener('abort', dispose, { once: true });
  if (signals.some(signal => signal.aborted) || scene.isDisposed || owner.disposed) dispose();
  if (active) {
    const acquired = scene.onDisposeObservable.addOnce(dispose);
    if (active) observer = acquired; else acquired.remove(true);
  }
  game = options = undefined;
  return { snapshot, destroyOwnDevice, dispose };
}
export function createVisibilityAnchor(document) {
  const anchor = document.createElement('a');
  anchor.href = 'about:blank'; anchor.target = '_blank'; anchor.rel = 'noopener';
  anchor.textContent = 'Visibility QA · otevřít vlastní prázdnou kartu';
  anchor.style.cssText = 'display:block;color:#b8e5ff;margin:4px';
  return anchor;
}
