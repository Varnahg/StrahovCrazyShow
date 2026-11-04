import { PBRBaseMaterial } from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import { Effect } from '@babylonjs/core/Materials/effect.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { capturePipelineInputs } from 'virtual:webgpu-completion-pipeline-inputs';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
import { observeOperation, observePreparationResult } from 'virtual:webgpu-completion-observer';
import { createAttemptQueue } from 'virtual:webgpu-completion-attempts';
import { installBrowserClock } from 'virtual:webgpu-completion-browser-clock';
import { createPlannedBenchmark } from 'virtual:webgpu-completion-clock';
import { observeStartupLatency } from 'virtual:webgpu-completion-startup-latency';
import { createShaderAttributionWindow, projectShaderInventory } from 'virtual:webgpu-completion-shader-attribution';
import { captureRoutineCost } from 'virtual:webgpu-completion-routine-cost';
import { captureEntryRenderCost } from 'virtual:webgpu-completion-entry-render';
import { captureEntryRoutineCost } from 'virtual:webgpu-completion-entry-routine';
import { Game, Scene, GltfLightBudget, StableLightState } from 'virtual:webgpu-completion-entry-classes';
import { observeBufferLifecycle } from 'virtual:webgpu-completion-buffer-lifecycle';
import { createLifecycleControls, createVisibilityAnchor } from 'virtual:webgpu-completion-lifecycle-controls';

const identity = __WEBGPU_COMPLETION_IDENTITY__;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const xyz = value => value ? { x: finite(value.x), y: finite(value.y), z: finite(value.z) } : null;
const errorText = error => ({ name: String(error?.name ?? 'Error').slice(0, 80), message: String(error?.message ?? error).slice(0, 2000) });
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
const mode = identity.lifecycleControls === true || identity.bufferLifecycle === true || identity.routineCost === true || identity.shaderAttribution === true || identity.startupLatency === true || identity.loading === 'translucent' || new URLSearchParams(location.search).get('profileEnvironment') === '1' ? 'diagnostic' : 'plain';
let previousOwner;
let sharedTransfers;
const weatherKeys = ['temperature', 'cloud', 'rain', 'wind', 'windDirection', 'observedAt', 'fetchedAt', 'stale', 'cloudStale',
  'status', 'sourceKind', 'source', 'cloudSource', 'cloudObservedAt', 'cloudWindSource', 'cloudLayers', 'cloudWinds',
  'humidity', 'snowfall', 'precipitationType', 'windGust', 'visibility', 'liquidPrecipitation', 'fieldSources'];
const weatherSnapshot = weather => weather ? structuredClone(pick(weather, weatherKeys)) : null;

/** This owner survives Game/rejoin teardown. Only immutable transfer bytes and
 * their download elements are retained; no game or device enters the queue. */
function transferQueue() {
  if (sharedTransfers) return sharedTransfers;
  const host = document.createElement('details'); host.id = 'webgpu-completion-pending'; host.open = true;
  host.style.cssText = 'position:fixed;bottom:6px;right:6px;z-index:100001;max-width:480px;max-height:260px;overflow:auto;background:#302015;color:white;padding:6px';
  const summary = document.createElement('summary'); summary.textContent = 'Neodeslané raw důkazy'; host.append(summary);
  const rows = new Map(); host.hidden = true; document.body.append(host);
  let queue;
  queue = createAttemptQueue({
    async digest(bytes) {
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes)))].map(n => n.toString(16).padStart(2, '0')).join('');
    },
    async send(bytes) {
      const response = await fetch('/__webgpu-completion/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bytes });
      const receipt = await response.json();
      if (!response.ok) throw new Error(receipt.error ?? 'Receipt HTTP ' + response.status);
      return receipt;
    },
    onChange(entry) {
      let row = rows.get(entry.attemptId);
      if (entry.state === 'acknowledged') {
        if (row) { URL.revokeObjectURL(row.url); row.element.remove(); rows.delete(entry.attemptId); }
      } else {
        if (!row) {
          const element = document.createElement('div'), link = document.createElement('a'), retry = document.createElement('button'), state = document.createElement('span');
          const url = URL.createObjectURL(new Blob([entry.bytes], { type: 'application/json' }));
          link.href = url; link.download = entry.attemptId + '.json'; link.textContent = entry.kind + ' ' + entry.attemptId;
          link.style.color = '#b8e5ff'; retry.textContent = 'Retry receipt';
          retry.onclick = () => { void queue.retry(entry.attemptId); };
          element.append(link, state, retry); host.append(element);
          row = { element, url, state, retry }; rows.set(entry.attemptId, row);
        }
        row.state.textContent = ' · ' + entry.state + (entry.error ? ' · ' + entry.error : '');
        row.retry.disabled = entry.state === 'pending';
      }
      host.hidden = rows.size === 0;
      summary.textContent = 'Neodeslané raw důkazy: ' + rows.size;
    },
  });
  sharedTransfers = queue;
  return queue;
}

function compilationFields(value) {
  const result = pick(value, ['active', 'backend', 'generation', 'attachedAfterDeviceCreation', 'timingScope', 'metrics', 'hooks',
    'observerErrors', 'bundleCountersLastFrame', 'sharedCacheCounters']);
  if (mode === 'diagnostic') result.shaderInventory = projectShaderInventory(value?.shaderInventory);
  return result;
}
const compilationSnapshot = game => compilationFields(game.compilationProfile.snapshot());
function sceneSnapshot(game, canvas, clockOwner) {
  const transitClock = clockOwner?.snapshot();
  const avatars = [...game.avatars.values()].slice(0, 128).map(value => ({
    id: value.target.id, local: value.target.id === game.localId,
    avatar: pick(value.target.avatar, ['preset', 'skin', 'hair', 'shirt', 'trousers', 'glasses', 'beard', 'face']),
    position: { x: finite(value.target.x), y: finite(value.target.y), z: finite(value.target.z) }, lod: value.lod.level,
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    atMs: performance.now(), utc: new Date().toISOString(), visibility: document.visibilityState, focused: document.hasFocus(),
    ready: game.ready, disposed: game.disposed, preparingRenderQuality: game.preparingRenderQuality,
    stages: pick(canvas.dataset, ['bootStage', 'lightPreparation', 'physicsStage', 'b6Stage', 'carStage', 'renderHealth']),
    backend: game.engine.isWebGPU ? 'webgpu' : 'webgl2', compatibilityMode: game.engine.isWebGPU ? game.engine.compatibilityMode : null,
    quality: game.quality, requestedRendering: pick(game.adaptive.state, ['mode', 'quality', 'hardwareScaling', 'targetFps', 'revision']),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    backbuffer: { width: game.engine.getRenderWidth(), height: game.engine.getRenderHeight(), scaling: game.engine.getHardwareScalingLevel() },
    gpu: pick(game.gpu, ['backend', 'compatibilityMode', 'gpuTimingScope', 'renderer', 'vendor', 'version', 'classification', 'context']),
    health: game.renderHealth.snapshot(), renderErrors: game.renderErrorCount, assetErrors: game.assetLoadErrorCount,
    network: game.network, avatarCount: game.avatars.size, avatars, avatarsOmitted: Math.max(0, game.avatars.size - avatars.length),
    actor: xyz(game.actor?.position), vehicle: game.actor?.vehicle ?? null, yaw: game.yaw, pitch: game.pitch, distance: game.distance,
    camera: { position: xyz(game.camera.globalPosition), fov: game.camera.fov,
      view: Array.from(game.camera.getViewMatrix().m), projection: Array.from(game.camera.getProjectionMatrix().m) },
    lightingInstant: game.timeOverride, trafficInstant: transitClock ? transitClock.rendering.lastMappedUTC : game.trafficInstant(), flashlight: game.flashlightOn,
    transitClock: transitClock ?? null,
    weather: weatherSnapshot(game.weather),
    scene: { meshes: game.scene.meshes.length, materials: game.scene.materials.length, geometries: game.scene.geometries.length,
      activeMeshes: game.scene.getActiveMeshes().length, waitingItems: game.scene.getWaitingItemsCount() },
    ambient: game.transit?.counts ?? null,
  };
}
function benchmarkSnapshot(value) {
  return { ...pick(value, ['date', 'sourceSnapshotId', 'durationSeconds', 'frames', 'averageFps', 'p95FrameMs', 'p99FrameMs',
    'renderErrorCount', 'assetLoadErrorCount', 'renderHealth', 'avatars', 'viewport', 'renderResolution', 'quality',
    'triangles', 'triangleCountScope', 'drawCalls', 'avatarLod', 'grassClumps', 'sceneView', 'frameBreakdownMs', 'engineCpuBreakdownMs',
    'engineCpuBreakdownScope', 'frameWork']),
    compilation: { start: compilationFields(value.compilation?.start), end: compilationFields(value.compilation?.end) },
    weatherAtStart: weatherSnapshot(value.weatherAtStart), weatherAtEnd: weatherSnapshot(value.weatherAtEnd) };
}

/** Called from the explicit, exact build-only UI transform. Never exposes Game
 * through window and never calls an additional render or readiness method. */
export async function observeStartup(game, canvas, start) {
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(location.hostname))
    throw new Error('Explicit QA build is loopback only');
  previousOwner?.();
  const transfers = transferQueue();
  const panel = document.createElement('section');
  panel.id = 'webgpu-completion-qa';
  panel.style.cssText = 'position:fixed;right:6px;top:6px;z-index:100000;background:#101820ed;color:white;padding:8px;font:12px monospace;max-width:480px';
  const title = document.createElement('div');
  title.textContent = 'KEY-22 LOCAL QA · ' + identity.label + ' · ' + mode;
  const controls = document.createElement('details'); controls.open = true;
  const summary = document.createElement('summary'); summary.textContent = 'Měření skutečné hry'; controls.append(summary);
  const disclosure = document.createElement('p');
  disclosure.textContent = 'Plná hra a HUD. Čas osvětlení nemění reálný čas dopravy. Plain používá standardní Game benchmark a lehký RAF pozorovatel; bez dalších profilovacích wrapperů.';
  if (identity.weather) disclosure.textContent += ' Počasí: řízený uložený QA záznam, viditelně označený jako fallback.';
  if (identity.shaderAttribution) disclosure.textContent += ' Diagnostic v8: jedno explicitní30s post-ready shader okno; původní jobs a pasivní mapping, žádné nové GPU volání. Nevhodné pro FPS srovnání.';
  if (identity.startupLatency) disclosure.textContent += ' Diagnostic: pozorované původní popErrorScope/onSubmittedWorkDone pouze při startu; latency není GPU čas.';
  if (identity.routineCost) disclosure.textContent += ' Diagnostic: volitelných8 actual render framů /8 původních CPU rutin. Zahrnuje režii observeru; není FPS A/B ani GPU čas.';
  if(identity.bufferLifecycle)disclosure.textContent+=' Diagnostic: původní buffer owner/reallocation/release/destroy a context/bundle identity; recent window, žádný encoded-resource graph ani FPS A/B.';
  if (identity.lifecycleControls) disclosure.textContent += ' Diagnostic: zničit lze pouze zařízení této vlastní dočasné testovací hry; pak je potřeba renderer obnovit původním UI. Native ztrátu a obnovu je nutné ověřit zvlášť. Prázdnou kartu po visibility testu zavři; prohlížeč ji nemusí aktivovat.';
  const status = document.createElement('pre'); status.id = 'webgpu-completion-status';
  status.style.cssText = 'white-space:pre-wrap;max-height:160px;overflow:auto';
  const output = document.createElement('pre'); output.id = 'webgpu-completion-export'; output.hidden = true;
  const download = document.createElement('a'); download.textContent = 'Stáhnout poslední raw důkaz';
  download.style.cssText = 'display:block;color:#b8e5ff'; download.hidden = true;
  controls.append(disclosure, status, download); panel.append(title, controls, output); document.body.append(panel);
  let gameRef = game, startupTimer, sampleOverflow = false, busy = false, disposed = false, downloadURL, interruptBenchmark;
  let startupResolved = false, readyAtUTC, clockOwner, latencyOwner, preparationOwner, attributionWindow, pipelineOwner, routineOwner, entryOwner, entryRoutineOwner,bufferOwner, planned, lifecycleOwner, lifecycleButton;
  const clockAbort = new AbortController();
  const samples = [], observerErrors = [], buttons = [];
  const ownerId = crypto.randomUUID();
  let sequence = 0;
  const noteError = error => { if (observerErrors.length < 16) observerErrors.push(errorText(error)); };
  const tell = value => { status.textContent = JSON.stringify(value, null, 1); };
  const snapshot = () => {
    try { return sceneSnapshot(gameRef, canvas, clockOwner); }
    catch (error) { noteError(error); return { atMs: performance.now(), unavailable: true, error: errorText(error) }; }
  };
  const envelope = kind => ({ schemaVersion: 1, ...identity, attemptId: crypto.randomUUID(), ownerId, kind, mode,
    atMs: performance.now(), timeOrigin: performance.timeOrigin, capturedAtUTC: new Date().toISOString(),
    userAgent: navigator.userAgent, observerErrors: [...observerErrors], clockConfigId: identity.clock?.configId ?? null });
  const keep = raw => {
    // Each attempt has an independent immutable export; never silently trim one.
    output.textContent = JSON.stringify(raw);
    if (downloadURL) URL.revokeObjectURL(downloadURL);
    downloadURL = URL.createObjectURL(new Blob([output.textContent], { type: 'application/json' }));
    download.href = downloadURL; download.download = raw.attemptId + '.json'; download.hidden = false;
    return output.textContent;
  };
  async function persist(raw) {
    keep(raw);
    const result = await transfers.enqueue(raw);
    if (result.acknowledged) {
      tell({ phase: raw.kind + '-saved', outcome: raw.outcome, attemptId: raw.attemptId, receipt: result.receipt,
        basicSampleGatesPassed: raw.kind === 'benchmark' ? raw.completed && raw.validationErrors.length === 0 : false });
    } else {
      tell({ phase: raw.kind + '-transport-failed', attemptId: raw.attemptId, error: result.error, downloadBackup: true });
    }
  }
  const updateButtons = () => buttons.forEach(button => button.disabled = busy || disposed || !startupResolved || !gameRef?.ready || transfers.pendingCount > 0 ||
    (button === lifecycleButton && (!lifecycleOwner?.snapshot().active || lifecycleOwner.snapshot().attempted)));
  const unsubscribeTransfers = transfers.subscribe(updateButtons);
  const sampleStartup = () => {
    if (samples.length >= 180) { sampleOverflow = true; clearInterval(startupTimer); return; }
    const value = { seq: sequence++, ...snapshot() }; samples.push(value);
    tell({ phase: 'startup', ...value });
  };
  function action(label, run) {
    const button = document.createElement('button'); button.textContent = label;
    button.disabled = true; button.style.cssText = 'margin:3px;padding:4px';
    button.onclick = async () => {
      if (busy || disposed || !gameRef?.ready) return;
      if (transfers.pendingCount > 0 || !startupResolved) {
        tell({ phase: 'receipt-pending', reason: 'Retained startup/attempt bytes must receive an exact ACK before another QA action.' });
        return;
      }
      busy = true; buttons.forEach(value => value.disabled = true);
      try { await run(); } catch (error) { tell({ phase: 'control-failed', error: errorText(error) }); }
      finally { busy = false; updateButtons(); }
    };
    buttons.push(button); controls.append(button);
    return button;
  }
  async function measure(plannedStart) {
    if (gameRef.benchmark) throw new Error('An existing Game benchmark is active');
    controls.open = false;
    const owner = gameRef, before = snapshot(), original = owner.onBenchmark;
    const raw = { ...envelope('benchmark'), completed: false, before, after: null, benchmark: null,
      plannedStart: plannedStart ? { ...plannedStart, actualStartUTC: null } : null,
      rawGameFrameMs: [], rawRafFrameMs: [], rafOverflow: false, hidden: false, focusLost: false, validationErrors: [],
      scope: 'Standard Game.startBenchmark 10s; its intrinsic BenchmarkRenderProfile remains active. Extra RAF observer records delivery cadence, not GPU execution. No periodic snapshots or diagnostic dumps inside interval.' };
    const rafValues = new Float64Array(20000);
    let frames, ownedBenchmark, raf, timeout, previous, count = 0, settled = false, wrapper;
    const visibility = () => { if (document.visibilityState !== 'visible') raw.hidden = true; };
    const blur = () => { raw.focusLost = true; };
    const tick = at => {
      if (previous !== undefined) {
        if (count < rafValues.length) rafValues[count++] = Math.max(0, at - previous);
        else raw.rafOverflow = true;
      }
      previous = at; raf = requestAnimationFrame(tick);
    };
    try {
      document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', blur);
      const result = await new Promise((resolve, reject) => {
        const finish = value => { if (settled) return; settled = true; resolve(value); };
        interruptBenchmark = () => { if (!settled) { settled = true; reject(new Error('Game disposed during benchmark')); } };
        wrapper = value => { try { return original?.(value); } finally { finish(value); } };
        owner.onBenchmark = wrapper;
        timeout = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Standard Game benchmark exceeded 30s observer deadline')); } }, 30000);
        let accepted;
        try {
          const actualUTC = Date.now();
          if (raw.plannedStart) {
            raw.plannedStart.attemptedAtUTC = actualUTC;
            raw.plannedStart.latenessMs = actualUTC - raw.plannedStart.plannedUTC;
            if (raw.plannedStart.latenessMs < 0 || raw.plannedStart.latenessMs > raw.plannedStart.latenessToleranceMs)
              throw new Error('Planned benchmark start outside immutable lateness tolerance');
          }
          accepted = owner.startBenchmark();
          if (accepted && raw.plannedStart) raw.plannedStart.actualStartUTC = actualUTC;
        }
        finally {
          // This call began with no benchmark. Capture its actual object even
          // when startBenchmark throws after allocation, never undefined.
          if (owner.benchmark && Array.isArray(owner.benchmark.frames)) {
            ownedBenchmark = owner.benchmark; frames = ownedBenchmark.frames;
          }
        }
        if (!accepted) return reject(new Error('Game refused benchmark'));
        if (!ownedBenchmark || !Array.isArray(ownedBenchmark.frames)) throw new Error('Game returned no owned benchmark');
        raf = requestAnimationFrame(tick);
      });
      raw.benchmark = benchmarkSnapshot(result); raw.completed = true;
    } catch (error) { raw.failure = errorText(error); raw.validationErrors.push(raw.failure.message); }
    finally {
      cancelAnimationFrame(raf); clearTimeout(timeout); interruptBenchmark = undefined;
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur);
      if (owner.onBenchmark === wrapper) owner.onBenchmark = original;
      raw.rawGameFrameMs = frames ? [...frames] : []; raw.rawRafFrameMs = Array.from(rafValues.subarray(0, count));
      raw.after = snapshot(); raw.finishedAtMs = performance.now();
      if (!raw.completed && ownedBenchmark && owner.benchmark === ownedBenchmark) {
        try { ownedBenchmark.profile.dispose(); }
        catch (error) { raw.cleanupError = errorText(error); raw.validationErrors.push('Owned benchmark cleanup failed: ' + raw.cleanupError.message); }
        finally { if (owner.benchmark === ownedBenchmark) owner.benchmark = undefined; }
      }
    }
    for (const [label, state] of [['before', raw.before], ['after', raw.after]]) {
      if (!state.ready || state.disposed || !state.health?.valid || state.assetErrors || state.renderErrors ||
          state.health.pendingOperations || state.unavailable) raw.validationErrors.push(label + ': unready or invalid health');
      if (state.visibility !== 'visible' || !state.focused) raw.validationErrors.push(label + ': not visible/focused');
    }
    if (raw.hidden || raw.focusLost || raw.rafOverflow) raw.validationErrors.push('Visibility/focus/RAF buffer changed');
    for (const key of ['backend', 'compatibilityMode', 'quality'])
      if (before[key] !== raw.after[key]) raw.validationErrors.push(key + ' changed');
    if (JSON.stringify(before.backbuffer) !== JSON.stringify(raw.after.backbuffer) ||
        JSON.stringify(before.viewport) !== JSON.stringify(raw.after.viewport)) raw.validationErrors.push('Resolution changed');
    if (before.health?.generation !== raw.after.health?.generation || before.health?.rendererId !== raw.after.health?.rendererId)
      raw.validationErrors.push('Renderer generation changed');
    if (raw.benchmark?.renderHealth?.valid !== true || raw.benchmark?.frames !== raw.rawGameFrameMs.length ||
        raw.rawGameFrameMs.length < 10 || raw.rawRafFrameMs.length < 10) raw.validationErrors.push('Incomplete standard/raw benchmark');
    if (raw.benchmark?.sourceSnapshotId !== identity.sourceSnapshotId) raw.validationErrors.push('Benchmark source identity differs');
    const cohort = state => (state.avatars ?? []).map(value => ({ id: value.id, avatar: value.avatar }));
    if (before.avatarCount !== raw.after.avatarCount || before.avatarsOmitted || raw.after.avatarsOmitted ||
        JSON.stringify(cohort(before)) !== JSON.stringify(cohort(raw.after))) raw.validationErrors.push('Avatar cohort/config changed or omitted');
    if (identity.clock) {
      const a = before.transitClock, b = raw.after.transitClock;
      if (!a?.active || !b?.active || a.configId !== identity.clock.configId || b.configId !== identity.clock.configId ||
          a.actualSimulationMatches !== true || b.actualSimulationMatches !== true ||
          a.physics.calls < 1 || b.physics.calls <= a.physics.calls || b.rendering.calls <= a.rendering.calls ||
          !a.physics.methodOwned || !b.physics.methodOwned || !a.rendering.methodOwned || !b.rendering.methodOwned ||
          a.physics.unexpectedReceivers || b.physics.unexpectedReceivers)
        raw.validationErrors.push('Unproven clock import/instance/hooks or no physics/render progress');
      if (identity.clock.config.benchmarkAtUTC !== undefined && !plannedStart)
        raw.validationErrors.push('Clock comparison requires its configured planned-start button');
    }
    // Conditions during movement and actual transit workload are not inferred
    // from endpoints. Keep both actual identities for an offline campaign gate.
    raw.observerErrors = [...observerErrors];
    await persist(raw);
  }
  action('Změřit 10 s · standardní hra + raw RAF', measure);
  if (identity.routineCost) action('Diagnostic ·8 skutečných framů /8 CPU rutin', async () => {
    controls.open = false;
    const raw = { ...envelope('routine-cost'), completed: false, before: snapshot(), after: null, routineProfile: null, validationErrors: [],
      scope: 'Selected original synchronous calls in at most8 actual Game scene.render frames. No added render/readiness/GPU calls. Instrumented CPU diagnostic, never FPS A/B.' };
    let deadline;
    try {
      if (gameRef.benchmark) throw new Error('Existing Game benchmark must finish before routine diagnostic');
      routineOwner = captureRoutineCost(gameRef, { enabled: identity.routineCost, signal: clockAbort.signal,
        isRetired: () => disposed || !gameRef || gameRef.disposed === true });
      deadline = setTimeout(() => routineOwner?.dispose('observer-deadline'), 30000);
      raw.routineProfile = await routineOwner.done;
      raw.completed = raw.routineProfile.complete;
      if (!raw.completed) raw.validationErrors.push('Routine diagnostic incomplete: ' + raw.routineProfile.reason);
    } catch (error) { raw.failure = errorText(error); raw.validationErrors.push(raw.failure.message); }
    finally {
      clearTimeout(deadline); routineOwner?.dispose();
      raw.routineProfile ??= routineOwner?.snapshot() ?? null; routineOwner = undefined;
      raw.after = snapshot(); raw.observerErrors = [...observerErrors];
    }
    await persist(raw);
  });
  if (identity.routineCost) {
    const expected = { classes: { Game, Scene, GltfLightBudget, StableLightState }, methods: {
      prepareFrame: GltfLightBudget.prototype.prepareFrame, update: StableLightState.prototype.update, render: Scene.prototype.render } };
    action('Diagnostic · první vstup do auta /8 framů /3 render fáze', async () => {
      controls.open = false;
      const raw = { ...envelope('vehicle-entry-cost'), completed: false, before: snapshot(), after: null, entryProfile: null, validationErrors: [],
        scope: 'First observed foot-to-vehicle after explicit arm; coldness requires fresh Game/session evidence. Original prelude/Scene CPU only, never GPU/submission/FPS.' };
      try {
        entryOwner = captureEntryRenderCost(gameRef, { enabled: identity.routineCost, expected, signal: clockAbort.signal,
          isCurrent: () => !disposed && gameRef === game });
        raw.entryProfile = await entryOwner.done;
        raw.completed = raw.entryProfile.complete;
        if (!raw.completed) raw.validationErrors.push('Entry diagnostic incomplete: ' + raw.entryProfile.reason);
      } catch (error) { raw.failure = errorText(error); raw.validationErrors.push(raw.failure.message); }
      finally {
        entryOwner?.dispose(); raw.entryProfile ??= entryOwner?.snapshot() ?? null; entryOwner = undefined;
        raw.after = snapshot(); raw.observerErrors = [...observerErrors];
      }
      await persist(raw);
    });
  }
  if (identity.routineCost) {
    const routineExpected = { classes: { Game, Scene, GltfLightBudget, StableLightState }, methods: {
      prepareFrame: GltfLightBudget.prototype.prepareFrame, render: Scene.prototype.render } };
    action('Diagnostic · první vstup do auta /8 framů /8 CPU rutin', async () => {
      controls.open = false;
      const raw = { ...envelope('routine-cost'), completed: false, before: snapshot(), after: null, routineProfile: null, entryTrigger: null, validationErrors: [],
        scope: 'Restore one prepare waiter at first observed accepted vehicle transition, then original8 routine capture. Coldness requires fresh Game/session. Diagnostic wall costs, never FPS/GPU.' };
      try {
        entryRoutineOwner = captureEntryRoutineCost(gameRef, { enabled: identity.routineCost, expected: routineExpected,
          startCapture: captureRoutineCost, signal: clockAbort.signal, isCurrent: () => !disposed && gameRef === game });
        const result = await entryRoutineOwner.done;
        raw.entryTrigger = result.entryTrigger; raw.routineProfile = result.routineProfile; raw.completed = result.entryTrigger.complete;
        if (!raw.completed) raw.validationErrors.push('Entry routine incomplete: ' + result.entryTrigger.reason);
      } catch (error) { raw.failure = errorText(error); raw.validationErrors.push(raw.failure.message); }
      finally {
        entryRoutineOwner?.dispose(); const result = entryRoutineOwner?.snapshot();
        raw.entryTrigger ??= result?.entryTrigger ?? null; raw.routineProfile ??= result?.routineProfile ?? null; entryRoutineOwner = undefined;
        raw.after = snapshot(); raw.observerErrors = [...observerErrors];
      }
      await persist(raw);
    });
  }
  if (identity.clock?.config.benchmarkAtUTC !== undefined) action('Naplánovat jediný 10s benchmark UTC', async () => {
    const armedBefore = snapshot(), config = identity.clock.config;
    const invalid = plan => persist({ ...envelope('benchmark'), completed: false, plannedStart: plan,
      before: armedBefore, after: snapshot(), benchmark: null, rawGameFrameMs: [], rawRafFrameMs: [],
      failure: { name: 'PlannedBenchmarkError', message: plan.reason }, validationErrors: [plan.reason],
      scope: 'Invalid planned attempt retained; no Game benchmark/FPS was produced' });
    if (planned) throw new Error('Configured planned attempt already armed');
    if (readyAtUTC === undefined || readyAtUTC + 30000 > config.armAtUTC) {
      planned = { dispose() {} };
      return invalid({ plannedUTC: config.benchmarkAtUTC, actualStartUTC: null, reason: 'Startup did not leave30s settling before static arm' });
    }
    planned = createPlannedBenchmark(config, { nowUTC: Date.now, setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: timer => clearTimeout(timer), onStart: measure, onInvalid: invalid });
    tell({ phase: 'planned-wait', benchmarkAtUTC: config.benchmarkAtUTC, armAtUTC: config.armAtUTC });
    await planned.arm();
  });
  action('Uložit stav', () => persist({ ...envelope('state'), state: snapshot(), compilation: compilationSnapshot(gameRef) }));
  if (identity.shaderAttribution) {
    attributionWindow = createShaderAttributionWindow(game, {
      signal: clockAbort.signal, isRetired: () => disposed || gameRef !== game || game.disposed === true,
      snapshot: () => ({ state: snapshot(), compilation: compilationSnapshot(gameRef) }),
      onComplete: shaderWindow => persist({ ...envelope('state'), state: snapshot(), compilation: compilationSnapshot(gameRef), shaderWindow }),
      onError: noteError,
    });
    action('Diagnostic · začít30s shader okno', () => tell({ phase: 'shader-window-open', ...attributionWindow.begin() }));
    action('Diagnostic · uzavřít shader okno', () => attributionWindow.finish('explicit'));
  }
  if (identity.lifecycleControls === true) {
    controls.append(createVisibilityAnchor(document));
    lifecycleButton = action('Diagnostic · zničit zařízení této testovací hry', () => lifecycleOwner.destroyOwnDevice());
    lifecycleOwner = createLifecycleControls(game, { enabled: true, signal: clockAbort.signal,
      isCurrent: () => !disposed && gameRef === game,
      onAttempt: lifecycleControl => {
        const raw = { ...envelope('state'), state: snapshot(), compilation: compilationSnapshot(game), lifecycleControl,
          scope: 'Explicit original own GPUDevice.destroy call only; native device.lost/product failure/recovery remain original and are not asserted successful by this receipt.' };
        void persist(raw).catch(noteError);
      },
    });
  }
  if (identity.routineCost) action('Diagnostic ·30s původní compiler vstupy', async () => {
    const raw = { ...envelope('pipeline-inputs'), completed: false, before: snapshot(), after: null, pipelineInputs: null, validationErrors: [],
      scope: 'Original post-ready compiler inputs only; hashes and fixed family/define flags. No raw text/owner inference or extra compiler/GPU calls.' };
    try {
      pipelineOwner = capturePipelineInputs(gameRef, { enabled: identity.routineCost,
        expected: { classes: { Game, Scene, WebGPUEngine, PBRBaseMaterial, Effect, Mesh, InstancedMesh, ShadowGenerator }, methods: { render: Scene.prototype.render, preparePipeline: WebGPUEngine.prototype._preparePipelineContextAsync, prepareEffect: PBRBaseMaterial.prototype._prepareEffect } },
        signal: clockAbort.signal, isCurrent: () => !disposed && gameRef === game });
      raw.pipelineInputs = await pipelineOwner.done; raw.completed = raw.pipelineInputs.completed;
      if (!raw.completed) raw.validationErrors.push('Pipeline inputs incomplete: ' + raw.pipelineInputs.reason);
    } catch (error) { raw.failure = errorText(error); raw.validationErrors.push(raw.failure.message); }
    finally {
      pipelineOwner?.dispose('owner-stopped'); raw.pipelineInputs ??= pipelineOwner?.snapshot() ?? null; pipelineOwner = undefined;
      raw.after = snapshot(); raw.observerErrors = [...observerErrors];
    }
    await persist(raw);
  });
  for (const quality of ['low', 'medium', 'high', 'auto']) action('Kvalita ' + quality, () => { gameRef.setQuality(quality); tell(snapshot()); });
  action('Cíl 60 FPS', () => { gameRef.setTargetFps(60); tell(snapshot()); });
  action('Svítilna', () => { gameRef.toggleFlashlight(); tell(snapshot()); });
  const instant = document.createElement('input'); instant.type = 'text'; instant.value = '2026-10-20T22:00:00.000Z';
  instant.setAttribute('aria-label', 'QA UTC okamžik osvětlení'); controls.append(instant);
  action('Použít UTC osvětlení', () => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(instant.value) || !Number.isFinite(Date.parse(instant.value)))
      throw new Error('Expected ISO UTC ending Z');
    gameRef.timeOverride = Date.parse(instant.value); tell(snapshot());
  });
  action('Skutečný čas osvětlení', () => { gameRef.timeOverride = null; tell(snapshot()); });
  const revoke = () => { if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = undefined; };
  const stop = () => {
    clearInterval(startupTimer); planned?.dispose(); interruptBenchmark?.(); disposed = true;
    if (!clockAbort.signal.aborted) {
      const abort = new Error('Clock QA owner stopped'); abort.name = 'AbortError'; clockAbort.abort(abort);
    }
    attributionWindow?.dispose(); pipelineOwner?.dispose('owner-stopped'); clockOwner?.dispose(); latencyOwner?.dispose(); routineOwner?.dispose('owner-stopped'); entryOwner?.dispose('owner-stopped'); entryRoutineOwner?.dispose('owner-stopped');bufferOwner?.dispose('owner-stopped');
    lifecycleOwner?.dispose(); preparationOwner?.dispose();
    unsubscribeTransfers(); buttons.forEach(button => button.disabled = true); gameRef = undefined;
  };
  const observer = game.scene.onDisposeObservable.addOnce(stop);
  const teardown = () => { stop(); unsubscribeTransfers(); observer.remove(true); revoke(); panel.remove(); window.removeEventListener('pagehide', revoke); };
  previousOwner = teardown; window.addEventListener('pagehide', revoke);
  return observeOperation(async () => {
    latencyOwner = observeStartupLatency(game.engine, { enabled: identity.startupLatency,
      signal: clockAbort.signal, isRetired: () => disposed || gameRef !== game || game.disposed === true });
    // v8 attribution is explicitly armed after startup, never mixed with its history.
    bufferOwner=observeBufferLifecycle(game,{enabled:identity.bufferLifecycle,signal:clockAbort.signal,
      isRetired:()=>disposed||gameRef!==game||game.disposed===true,
      onTerminal:bufferTrace=>{void persist({...envelope('buffer-lifecycle'),outcome:bufferTrace.reason,bufferTrace}).catch(noteError);}});
    const owner = await installBrowserClock(game, identity.clock, {
      signal: clockAbort.signal, isRetired: () => disposed || gameRef !== game || game.disposed === true,
    });
    // A returned async owner may have lost publication to stop/rejoin. Never
    // publish it or call the original Game.start on the retired Game.
    if (identity.clock && (clockAbort.signal.aborted || disposed || gameRef !== game || game.disposed === true)) {
      owner?.dispose();
      throw clockAbort.signal.reason ?? new Error('Clock QA owner retired before startup');
    }
    clockOwner = owner;
    preparationOwner = observePreparationResult(game, { signal: clockAbort.signal, startupSignal: game.startupAbort?.signal,
      isCurrent: () => !disposed && gameRef === game, onObserverError: noteError });
    return start();
  }, {
    onBegin: () => { sampleStartup(); startupTimer = setInterval(sampleStartup, 1000); },
    onObserverError: noteError,
    onTerminal: (outcome, error) => {
      clearInterval(startupTimer);
      latencyOwner?.dispose(); preparationOwner?.dispose();
      if(outcome==='rejected')bufferOwner?.dispose('startup-rejected');
      const terminal = snapshot();
      const raw = { ...envelope('startup'), outcome, error: error ? errorText(error) : null,
        samples, sampleOverflow, terminal, compilation: compilationSnapshot(game),
        startupLatency: latencyOwner?.snapshot() ?? null, shaderAttribution: null,
        preparationSummary: preparationOwner?.snapshot() ?? { available: false, reason: 'not-installed' },
        preparationStages: preparationOwner?.stagesSnapshot() ?? { schemaVersion:1, available:false, reason:'not-installed' },
        scope: '1Hz technical startup samples plus one bounded result-only preparation projection; stopped before gameplay measurement. Existing production compilation/health hooks unchanged.' };
      startupResolved = outcome === 'resolved';
      if (startupResolved && terminal.ready) readyAtUTC = Date.now();
      void persist(raw);
      updateButtons();
    },
  });
}
