import { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PBRBaseMaterial } from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { RoutineCallProfile, ROUTINE_LIMITS, ROUTINE_IDS, ROUTINE_SCOPE } from './routine-cost-core.mjs';

const sceneOwners = new WeakMap();
const methods = [[Scene.prototype, '_activeMesh'], [TransformNode.prototype, 'computeWorldMatrix'], [Mesh.prototype, 'getLOD'],
  [PBRBaseMaterial.prototype, 'isReadyForSubMesh'], [StandardMaterial.prototype, 'isReadyForSubMesh'],
  [PBRBaseMaterial.prototype, 'bindForSubMesh'], [StandardMaterial.prototype, 'bindForSubMesh']].map(([target, key]) => ({ target, key, expected: target[key] }));
const nativeRender = Scene.prototype.render;

/** One explicit capture, driven only by original actual Game scene calls. */
export function captureRoutineCost(game, { enabled = false, now, signal, isRetired = () => false } = {}) {
  if (!enabled) return undefined;
  const scene = game.scene;
  if (!(scene instanceof Scene) || scene._engine !== game.engine || sceneOwners.has(scene) || scene.isDisposed || game.disposed || !game.ready || isRetired() || signal?.aborted)
    throw new Error('Routine capture requires a live unowned ready actual Game scene');
  const oldRender = Object.getOwnPropertyDescriptor(scene, 'render');
  if (scene.render !== nativeRender || (oldRender && (!('value' in oldRender) || (!oldRender.configurable && !oldRender.writable))))
    throw new Error('Actual scene.render drift/ownership');
  const originalRender = scene.render, detaches = [], frames = [], phases = [], targets = new Map();
  let core, closed = false, rendering = false, phaseEvents = 0, phaseErrors = 0, restoreConflicts = 0, reason = null, finish;
  const done = new Promise(resolve => { finish = resolve; });
  const owner = { done, dispose: why => stop(why ?? 'disposed'), snapshot };
  sceneOwners.set(scene, owner);
  const observe = (observable, callback) => { const observer = observable.add(callback); detaches.push(() => observable.remove(observer)); };
  const phase = () => phases.at(-1)?.phase ?? 'other';
  function enter(phaseName, token) {
    if (!rendering || closed) return;
    if (++phaseEvents > ROUTINE_LIMITS.phaseEvents || phases.length >= 32) { phaseErrors++; return; }
    phases.push({ phase: phaseName, token });
  }
  function leave(token) {
    if (!rendering || closed) return;
    if (phases.at(-1)?.token !== token) { phaseErrors++; return; }
    phases.pop();
  }
  function track(renderer) {
    if (targets.has(renderer)) return;
    if (targets.size >= ROUTINE_LIMITS.renderers) { phaseErrors++; return; }
    const before = renderer.onInitRenderingObservable.add(() => enter('rtt', renderer));
    const after = renderer.onFinishRenderingObservable.add(() => leave(renderer));
    targets.set(renderer, () => { renderer.onInitRenderingObservable.remove(before); renderer.onFinishRenderingObservable.remove(after); });
  }
  function snapshot() {
    const errors = core?.errors ?? 0, conflicts = restoreConflicts + (core?.restoreConflicts ?? 0);
    return { schemaVersion: 1, scope: ROUTINE_SCOPE, limits: ROUTINE_LIMITS, targets: [...ROUTINE_IDS], frames: structuredClone(frames),
      complete: closed && reason === 'complete' && frames.length === 8 && !errors && !conflicts && !phaseErrors && frames.every(frame => frame.progressed && !frame.threw && !frame.depthSkipped && !frame.callsSkipped && !frame.errors),
      reason, errors, phaseErrors, restoreConflicts: conflicts, installedRoutineHooks: core ? 8 : 0, remainingRoutineHooks: core?.hooks.length ?? 0, active: !closed };
  }
  function stop(why) {
    if (closed) return;
    closed = true; reason = why;
    core?.dispose();
    for (const detach of [...detaches.splice(0), ...targets.values()]) {
      try { detach(); } catch { phaseErrors++; }
    }
    targets.clear();
    signal?.removeEventListener('abort', aborted);
    const current = Object.getOwnPropertyDescriptor(scene, 'render');
    try {
      if (current?.value === render && current.configurable === (oldRender?.configurable ?? true) && current.enumerable === (oldRender?.enumerable ?? false) && current.writable === (oldRender?.writable ?? true)) {
        if (oldRender) Object.defineProperty(scene, 'render', oldRender); else delete scene.render;
      } else if (current?.value !== oldRender?.value || (!!current !== !!oldRender)) restoreConflicts++;
    } catch { restoreConflicts++; }
    if (sceneOwners.get(scene) === owner) sceneOwners.delete(scene);
    finish(snapshot());
  }
  const aborted = () => stop('aborted');
  function render(...args) {
    if (this !== scene || closed) return Reflect.apply(originalRender, this, args);
    let retired;
    try { retired = isRetired() || game.disposed || scene.isDisposed; }
    catch { phaseErrors++; stop('observer-error'); return Reflect.apply(originalRender, this, args); }
    if (retired) { stop('retired'); return Reflect.apply(originalRender, this, args); }
    if (rendering) { phaseErrors++; return Reflect.apply(originalRender, this, args); }
    // Existing renderers only; this mirrors the production benchmark's same-task registration.
    try { for (const renderer of scene.objectRenderers) track(renderer); }
    catch { phaseErrors++; stop('observer-error'); return Reflect.apply(originalRender, this, args); }
    const beforeId = scene._frameId;
    rendering = true; phaseEvents = 0; phases.length = 0; core.beginFrame(beforeId);
    let threw = true;
    try { const result = Reflect.apply(originalRender, this, args); threw = false; return result; }
    finally {
      if (!closed) {
        const frame = core.endFrame();
        frame.nativeFrameIdAfter = scene._frameId; frame.progressed = scene._frameId === beforeId + 1; frame.threw = threw;
        if (phases.length) phaseErrors++;
        frames.push(frame); rendering = false; phases.length = 0;
        if (threw) stop('original-render-threw');
        else if (!frame.progressed) stop('no-native-frame-progress');
        else if (frames.length === 8) stop('complete');
      }
    }
  }
  try {
    core = new RoutineCallProfile([{ id: ROUTINE_IDS[0], target: scene, key: 'getActiveMeshCandidates', accepts: receiver => receiver === scene },
      ...methods.map((method, index) => ({ ...method, id: ROUTINE_IDS[index + 1], accepts: receiver => index === 0 ? receiver === scene : receiver?._scene === scene }))], { now, phase });
    for (const [before, after, name] of [[scene.onBeforeActiveMeshesEvaluationObservable, scene.onAfterActiveMeshesEvaluationObservable, 'active'],
      [scene.onBeforeDrawPhaseObservable, scene.onAfterDrawPhaseObservable, 'main']]) {
      observe(before, () => enter(name, before)); observe(after, () => leave(before));
    }
    observe(scene.onNewObjectRendererAddedObservable, renderer => { if (scene.objectRenderers.includes(renderer)) track(renderer); });
    observe(scene.onObjectRendererRemovedObservable, renderer => { targets.get(renderer)?.(); targets.delete(renderer); });
    observe(scene.onDisposeObservable, () => stop('scene-disposed'));
    signal?.addEventListener('abort', aborted, { once: true });
    Object.defineProperty(scene, 'render', { ...(oldRender ?? { configurable: true, writable: true, enumerable: false }), value: render });
  } catch (error) { stop('installation-failed'); throw error; }
  return owner;
}
