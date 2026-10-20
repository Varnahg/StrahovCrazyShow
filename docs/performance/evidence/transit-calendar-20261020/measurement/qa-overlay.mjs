import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { assertScene, assertStableScene } from 'virtual:transit-qa-conditions';
import { deliverAttempt } from 'virtual:transit-qa-delivery';

// The build plugin supplies these immutable, separately hashed QA inputs.
const scenario = __TRANSIT_QA_SCENARIO__;
const identity = __TRANSIT_QA_IDENTITY__;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const xyz = value => ({x: value.x, y: value.y, z: value.z});
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(JSON.stringify(value))))].map(n => n.toString(16).padStart(2, '0')).join('');
let disposeInstalledQA;

export function installTransitQA(game) {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local QA only');
  disposeInstalledQA?.();
  const panel = document.createElement('section');
  panel.id = 'transit-qa';
  panel.style.cssText = 'position:fixed;right:8px;top:8px;z-index:100000;background:#101820ee;color:white;padding:10px;font:12px monospace;max-width:460px;border:1px solid #f5b642';
  const title = document.createElement('div');
  title.textContent = 'KEY-53 LOCAL QA · ' + identity.label + ' · ' + identity.sourceSnapshotId.slice(0, 12);
  const controls = document.createElement('details');
  controls.open = true;
  const toggle = document.createElement('summary');
  toggle.textContent = 'Ovládání měření (rozbalit / sbalit)';
  controls.append(toggle);
  const disclosure = document.createElement('div');
  disclosure.textContent = 'Simulované QA počasí a čas 20.10.2026 15:25 Praha; standardní hra, HUD a SDK multiplayer.';
  const status = document.createElement('pre');
  status.id = 'transit-qa-status';
  status.style.cssText = 'white-space:pre-wrap;max-height:150px;overflow:auto;margin:5px 0';
  controls.append(disclosure, status);
  panel.append(title, controls);
  document.body.append(panel);
  let busy = false, prepared = false, latest = null, context, latestRaw;
  let exportURL, exportLink;
  const revokeExport = () => {
    if (exportURL) URL.revokeObjectURL(exportURL);
    exportURL = undefined;
    exportLink?.remove();
    exportLink = undefined;
  };
  window.addEventListener('pagehide', revokeExport);
  disposeInstalledQA = () => {
    revokeExport();
    window.removeEventListener('pagehide', revokeExport);
    panel.remove();
  };
  const results = new Map(), buttons = [];
  const tell = (phase, data = {}) => {
    const value = {phase, ...identity, ...data};
    status.textContent = JSON.stringify(value, null, 1);
    // Snapshot only: browser automation reads this; actions are actual buttons.
    window.__transitQAStatus = value;
  };
  const action = (name, execute) => {
    const button = document.createElement('button');
    button.textContent = name;
    button.style.cssText = 'margin:3px;padding:5px;color:black;background:#eee';
    button.onclick = async () => {
      if (busy) return;
      busy = true;
      buttons.forEach(button => button.disabled = true);
      try { await execute(); }
      catch (error) { tell('failed', {error: String(error), stack: error?.stack}); }
      finally { busy = false; buttons.forEach(button => button.disabled = false); }
    };
    buttons.push(button);
    controls.append(button);
  };
  async function post(path, data, allowRejected = false) {
    const response = await fetch('/__transit-qa/' + path, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data),
    });
    const body = await response.json();
    if (!response.ok && !allowRejected) throw new Error(body.error || 'QA endpoint ' + response.status);
    return body;
  }
  async function saveRaw(raw) {
    latest = await deliverAttempt(raw, value => post('attempt', value, true), saved => {
      revokeExport();
      latestRaw = saved;
      if (!results.has(saved.attemptId)) results.set(saved.attemptId, saved);
      window.__transitQARawExport = JSON.stringify({attempts: [...results.values()]}, null, 2);
    });
    tell(latest.accepted ? 'saved' : latest.persisted ? 'rejected-raw-preserved' : 'transport-failed-export-available',
      {mode: raw.mode, attemptId: raw.attemptId, ...latest});
  }
  function sceneSnapshot() {
    const transit = game.transit, frame = transit?.lastFrame;
    const passengers = [...(transit?.passengers ?? [])].map(([id, npc]) => {
      const position = xyz(npc.rig.root.position);
      const projected = Vector3.Project(npc.rig.root.position.add(new Vector3(0, 1, 0)),
        Matrix.IdentityReadOnly, game.scene.getTransformMatrix(),
        game.camera.viewport.toGlobal(game.engine.getRenderWidth(), game.engine.getRenderHeight()));
      return {id, position, lod: npc.lod.level, projection: xyz(projected),
        projectedInside: projected.x >= 0 && projected.y >= 0 && projected.x <= game.engine.getRenderWidth() &&
          projected.y <= game.engine.getRenderHeight() && projected.z >= 0 && projected.z <= 1};
    }).sort((a, b) => a.id.localeCompare(b.id));
    return structuredClone({
      url: location.href, network: game.network, localId: game.localId,
      sourceSnapshotId: identity.sourceSnapshotId, harnessSha256: identity.harnessSha256,
      scenario, wallClock: new Date().toISOString(), visibilityState: document.visibilityState,
      ready: game.ready, disposed: game.disposed, preparingRenderQuality: game.preparingRenderQuality,
      pendingData: game.scene.getWaitingItemsCount(), backend: game.engine.isWebGPU ? 'webgpu' : 'webgl2',
      lightingInstant: game.timeOverride, transitInstant: game.trafficInstant(), distance: game.distance,
      actor: xyz(game.actor.position), yaw: game.yaw, pitch: game.pitch,
      camera: {activeId: game.scene.activeCamera?.uniqueId, gameCameraId: game.camera.uniqueId, position: xyz(game.camera.globalPosition), fov: game.camera.fov,
        view: Array.from(game.camera.getViewMatrix().m), projection: Array.from(game.camera.getProjectionMatrix().m)},
      viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio},
      backbuffer: {width: game.engine.getRenderWidth(), height: game.engine.getRenderHeight(), scaling: game.engine.getHardwareScalingLevel()},
      quality: game.quality, gpu: game.gpu, weather: game.weather,
      avatars: [...game.avatars.values()].map(a => ({id: a.target.id, nickname: a.target.nickname, avatar: a.target.avatar,
        position: {x: a.target.x, y: a.target.y, z: a.target.z}, lod: a.lod.level})).sort((a, b) => a.nickname.localeCompare(b.nickname)),
      ambient: transit?.counts, passengers, transitStatus: frame?.status,
      semantic: {passengers: frame?.passengers.filter(p => transit.passengers.has(p.id)),
        buses: frame?.buses.filter(p => transit.buses.has(p.id)), traffic: frame?.traffic.filter(p => transit.cars.has(p.id))},
      pool: {sources: transit?.pool.sources.size, materials: transit?.pool.materials.size},
      scene: {meshes: game.scene.meshes.length, materials: game.scene.materials.length, geometries: game.scene.geometries.length},
      health: game.renderHealth.snapshot(), renderErrors: game.renderErrorCount, assetErrors: game.assetLoadErrorCount,
    });
  }
  function validateScene(snapshot) {
    assertScene(snapshot, scenario);
  }
  function profileTransit() {
    const transit = game.transit, pool = transit.pool;
    const originalUpdate = transit.update, originalPrune = pool.pruneUnused;
    const updateMs = new Float64Array(20000), pruneMs = new Float64Array(20000);
    let updates = 0, prunes = 0;
    transit.update = function(...args) {
      const started = performance.now();
      try { return originalUpdate.apply(this, args); }
      finally { if (updates < updateMs.length) updateMs[updates] = performance.now() - started; updates++; }
    };
    pool.pruneUnused = function(...args) {
      const started = performance.now();
      try { return originalPrune.apply(this, args); }
      finally { if (prunes < pruneMs.length) pruneMs[prunes] = performance.now() - started; prunes++; }
    };
    return () => {
      transit.update = originalUpdate;
      pool.pruneUnused = originalPrune;
      if (updates > updateMs.length || prunes > pruneMs.length) throw new Error('Profile buffer overflow');
      return {scope: 'CPU monotonic wall time, update includes nested prune and wrapper overhead; not GPU time',
        updateMs: Array.from(updateMs.subarray(0, updates)), pruneMs: Array.from(pruneMs.subarray(0, prunes)), updates, prunes};
    };
  }
  async function interval(mode) {
    const before = sceneSnapshot();
    validateScene(before);
    const callback = game.onBenchmark;
    let restore, timer, rawFrames, hidden = false;
    const visibility = () => { if (document.visibilityState !== 'visible') hidden = true; };
    document.addEventListener('visibilitychange', visibility);
    try {
      if (mode === 'profile') restore = profileTransit();
      const benchmark = await new Promise((resolve, reject) => {
        game.onBenchmark = result => { callback?.(result); resolve(result); };
        timer = setTimeout(() => reject(new Error('Standard benchmark timed out')), 30000);
        if (!game.startBenchmark()) return reject(new Error('Standard benchmark did not start'));
        rawFrames = game.benchmark.frames;
      });
      const profile = restore ? restore() : null;
      restore = undefined;
      const after = sceneSnapshot(), validationErrors = [];
      const semanticHash = await digest(before.semantic);
      try {
        validateScene(after);
        assertStableScene(before, after);
        if (hidden || semanticHash !== await digest(after.semantic)) throw new Error('Visibility/cohort changed during interval');
      } catch (error) { validationErrors.push(String(error)); }
      return {before, after, semanticHash, benchmark, rawFrameMs: [...rawFrames], profile, validationErrors};
    } catch (error) {
      error.measurementAttempt = {before, rawFrameMs: rawFrames ? [...rawFrames] : [], profile: restore ? restore() : null,
        validationErrors: [String(error)], incomplete: true};
      restore = undefined;
      game.benchmark?.profile.dispose();
      game.benchmark = undefined;
      throw error;
    } finally {
      restore?.();
      clearTimeout(timer);
      game.onBenchmark = callback;
      document.removeEventListener('visibilitychange', visibility);
    }
  }
  async function run(mode) {
    if (!prepared) throw new Error('Prepare the scene first');
    controls.open = false;
    const result = {schemaVersion: 1, ...identity, scenario, mode, campaignId: context.campaignId,
      startId: context.startId, slot: context.slot, attemptId: crypto.randomUUID(), startedAt: new Date().toISOString(), intervals: []};
    try {
      await post('begin', {attemptId: result.attemptId, mode});
      for (let n = 0; n < scenario.repetitions; n++) {
        tell('measuring', {mode, interval: n + 1, total: scenario.repetitions});
        const measured = await interval(mode);
        result.intervals.push(measured);
        if (measured.validationErrors.length) throw new Error(measured.validationErrors.join('; '));
        await pause(1000);
      }
    } catch (error) {
      if (error.measurementAttempt) result.intervals.push(error.measurementAttempt);
      result.failure = String(error);
    }
    result.finishedAt = new Date().toISOString();
    await saveRaw(result);
  }
  action('Připravit scénář', async () => {
    if (!game.network || game.localId === 'guest') throw new Error('Join standard multiplayer from the game menu first');
    tell('preparing');
    context = (await post('prepare', {})).context;
    game.timeOverride = scenario.instant;
    game.trafficInstant = () => scenario.instant;
    game.setWeather(structuredClone(scenario.weather));
    game.setQuality(scenario.quality);
    game.setTargetFps(scenario.targetFps);
    game.yaw = scenario.yaw;
    game.pitch = scenario.pitch;
    game.distance = scenario.distance;
    game.firstPerson = false;
    game.blur();
    await game.transit.ready;
    tell('warming', {milliseconds: scenario.warmupMs});
    await pause(scenario.warmupMs);
    const snapshot = sceneSnapshot();
    validateScene(snapshot);
    prepared = true;
    tell('ready', {avatars: snapshot.avatars.length, ambient: snapshot.ambient,
      projectedPassengers: snapshot.passengers.filter(p => p.projectedInside).length, gpu: snapshot.gpu.renderer,
      viewport: snapshot.viewport, backbuffer: snapshot.backbuffer});
  });
  action('CPU profil 3×10 s', () => run('profile'));
  action('Plain FPS 3×10 s', () => run('plain'));
  action('Vypsat stav a výsledky', async () => {
    const snapshot = sceneSnapshot();
    document.getElementById('transit-qa-dump')?.remove();
    const dump = document.createElement('pre');
    dump.id = 'transit-qa-dump';
    dump.style.cssText = 'max-height:180px;overflow:auto;white-space:pre-wrap';
    dump.textContent = JSON.stringify({snapshot, latest, attempts: results.size}, null, 2);
    controls.append(dump);
    tell(prepared ? 'ready' : 'waiting', {attempts: results.size, latest});
  });
  action('Vypsat celý raw export', async () => {
    revokeExport();
    const raw = window.__transitQARawExport ?? '{"attempts":[]}';
    const blob = new Blob([raw], {type: 'application/json'});
    exportURL = URL.createObjectURL(blob);
    const link = document.createElement('a');
    exportLink = link;
    link.id = 'transit-qa-raw-export';
    link.href = exportURL;
    link.download = 'transit-qa-' + (context?.startId ?? 'empty') + '.json';
    link.textContent = 'Stáhnout celý raw export (JSON, ' + blob.size + ' bajtů)';
    link.style.cssText = 'display:block;color:#b8deff;margin:6px 0';
    controls.append(link);
  });
  action('Znovu odeslat poslední raw', async () => {
    if (!latestRaw) throw new Error('No raw attempt to retry');
    await saveRaw(latestRaw);
  });
  tell('waiting', {instruction: 'Join standard multiplayer, then prepare the QA scene'});
}
