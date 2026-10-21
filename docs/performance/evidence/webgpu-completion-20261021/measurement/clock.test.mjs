/** CPU-only clock/actual Rapier fixtures. No server/index import, browser,
 * listener, GPU, renderer benchmark or fabricated performance result. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTransitClock, validateClockConfig, installSimulationClock, installRenderClock, createPlannedBenchmark } from './transit-clock.mjs';
import { installBrowserClock } from './browser-clock.mjs';
import { backendPort, sha256 } from './common.mjs';
import { validateReceipt } from './receipt.mjs';
import { verifyBuildContract } from './harness.mjs';
import { Simulation, initPhysics } from '../../../../../shared/simulation.ts';
import { sampleTransit, sampleTransitVehicles, transitObstacles, serviceDayEpoch, TRANSIT_FEED } from '../../../../../shared/transit.ts';
import { NetworkTimeline } from '../../../../../client/network-timeline.ts';
import { TimelineSimulationClock } from '../../../../../shared/input-timeline.ts';

const E0 = serviceDayEpoch(TRANSIT_FEED.start) + 13 * 3600000;
const A = Date.UTC(2026, 10, 1);
const configuration = { schemaVersion: 1, scenarioEpochUTC: E0, armAtUTC: A };
const clockId = sha256(JSON.stringify(configuration));
const clock = () => createTransitClock(configuration, clockId);
test('immutable explicit map handles prearm, release, fractional tick, replay and rejects invalid configuration', () => {
  const source = { ...configuration }, map = createTransitClock(source, clockId);
  source.armAtUTC++;
  for (const time of [A - 1000, A - 1, A, A + 1000 / 60, A + 10000, A - 50])
    assert.equal(map.map(time), E0 + Math.max(0, time - A));
  assert.equal(map.config.armAtUTC, A); assert.equal(Object.isFrozen(map.config), true);
  assert.throws(() => { map.config.armAtUTC++; });
  for (const value of [null, { ...configuration, schemaVersion: 2 }, { ...configuration, armAtUTC: NaN },
    { ...configuration, scenarioEpochUTC: -1 }, { ...configuration, rearm: true },
    { ...configuration, benchmarkAtUTC: A }, { ...configuration, latenessToleranceMs: 1 },
    { ...configuration, benchmarkAtUTC: A + 1000, latenessToleranceMs: 1001 }]) assert.throws(() => validateClockConfig(value));
  for (const time of [NaN, Infinity, -1]) assert.throws(() => map.map(time));
});
test('single-owner wrappers preserve receiver/result/original exception and never double-map or overwrite a foreign owner', () => {
  const error = new Error('original tick error'), received = [];
  class Example {
    tick(time) { received.push({ receiver: this, time }); if (this.fail) throw error; return this.result; }
  }
  const original = Example.prototype.tick, instance = new Example(); instance.result = { originalResult: true };
  const hook = installSimulationClock(Example, clock());
  assert.equal(instance.tick(A + 10), instance.result);
  assert.equal(received[0].receiver, instance); assert.equal(received[0].time, E0 + 10);
  assert.throws(() => installSimulationClock(Example, clock()), /double mapping/);
  instance.fail = true; assert.throws(() => instance.tick(A + 20), value => value === error);
  assert.equal(hook.snapshot().originalThrows, 1); assert.equal(hook.snapshot().instancesObserved, 1);
  const wrapper = Example.prototype.tick;
  const foreign = function (time) { return wrapper.call(this, time); }; Example.prototype.tick = foreign;
  hook.dispose(); assert.equal(Example.prototype.tick, foreign); assert.equal(hook.snapshot().restoreConflict, true);
  instance.fail = false; instance.tick(A + 30); assert.equal(received.at(-1).time, A + 30);
  Example.prototype.tick = original;
  const game = { network: true, trafficInstant() { assert.equal(this, game); return A + 40; } };
  const render = installRenderClock(game, clock()); assert.equal(game.trafficInstant(), E0 + 40);
  game.network = false; assert.throws(() => game.trafficInstant(), /guest/); render.dispose();
  assert.equal(game.trafficInstant(), A + 40);
});
test('actual Simulation collider cache, extrapolation, body creation/removal and rewind equal direct mapped reference', async () => {
  await initPhysics();
  const candidate = new Simulation(), reference = new Simulation();
  const originalTick = Simulation.prototype.tick, hook = installSimulationClock(Simulation, clock());
  const observations = [], allIds = new Set(); let removed = false;
  try {
    const times = [A - 1000, A - 1, A, A + 16, A + 34, A + 50, A + 100, A + 40000, A + 80000, A + 136000, A + 50];
    for (const time of times) {
      const oldIds = new Set(candidate.trafficBodies.keys()), oldCache = candidate.trafficCache;
      candidate.tick(time); originalTick.call(reference, clock().map(time));
      assert.equal(candidate.trafficAt, reference.trafficAt);
      assert.deepEqual(candidate.trafficCache, reference.trafficCache);
      assert.deepEqual([...candidate.trafficVelocities], [...reference.trafficVelocities]);
      assert.deepEqual([...candidate.trafficBodies.keys()], [...reference.trafficBodies.keys()]);
      assert.equal(candidate.world.timestep, reference.world.timestep);
      for (const [id, body] of candidate.trafficBodies) {
        allIds.add(id); assert.deepEqual(body.translation(), reference.trafficBodies.get(id).translation());
        assert.deepEqual(body.rotation(), reference.trafficBodies.get(id).rotation());
      }
      if (time === A + 16) assert.equal(candidate.trafficCache, oldCache);
      if ([...oldIds].some(id => !candidate.trafficBodies.has(id))) removed = true;
      observations.push({ original: time, mapped: candidate.trafficAt, ids: [...candidate.trafficBodies.keys()] });
    }
    assert.ok(allIds.size > 1); assert.equal(removed, true);
    assert.equal(hook.snapshot().calls, times.length); assert.equal(hook.snapshot().instancesObserved, 1);
    assert.equal(hook.snapshot().rewindCalls, 1); assert.equal(hook.snapshot().unexpectedReceivers, 0);
    assert.equal(observations.length, times.length);
  } finally { hook.dispose(); candidate.dispose(); reference.dispose(); }
});
test('vehicle render sampling and physics obstacles agree at common map phases without freezing elapsed motion', () => {
  const map = clock(); let moved = false, prior;
  for (const time of [A - 1, A, A + 16, A + 1000, A + 14000, A + 75000, A + 136000, A + 1000]) {
    const utc = map.map(time), render = sampleTransit(utc), physics = sampleTransitVehicles(utc);
    assert.deepEqual(physics, { buses: render.buses, traffic: render.traffic });
    assert.deepEqual(transitObstacles(physics), transitObstacles(render));
    if (prior && JSON.stringify(prior) !== JSON.stringify(physics)) moved = true;
    prior = physics;
  }
  assert.equal(moved, true);
});
test('real Timeline authority, replay, inputEpoch/ack/time and original Date identity remain unchanged', () => {
  const dateFunction = Date.now, utcClock = new TimelineSimulationClock(A - 60), times = [];
  utcClock.advance(3 / 60, (_dt, tick, time) => times.push({ tick, time }));
  assert.equal(utcClock.time, A - 10);
  const authority = { inputEpoch: 4, inputTickBase: 0, tick: 0, ack: 0, time: A - 60 };
  const before = JSON.stringify(authority), timeline = new NetworkTimeline(), applied = [];
  class FakePhysics { tick(mapped) { applied.push(mapped); } }
  const hook = installSimulationClock(FakePhysics, clock()), sim = new FakePhysics();
  try {
    assert.equal(timeline.acceptAuthority(authority, 0, { vehicle: false, yaw: 0 }).accepted, true);
    const originalTimes = [];
    timeline.advance(0, seq => ({ seq, x: 0, z: 0, yaw: 0, jump: false, run: false, vehicle: false }), step => {
      originalTimes.push(step.time); sim.tick(step.time);
    });
    assert.deepEqual(applied, originalTimes.map(time => clock().map(time)));
    const next = { ...authority, tick: 1, ack: 1, time: authority.time + 1000 / 60 }, nextBefore = JSON.stringify(next);
    const acceptance = timeline.acceptAuthority(next, 1, { vehicle: false, yaw: 0 });
    assert.equal(acceptance.accepted, true);
    for (const step of acceptance.replay) assert.equal(step.time, next.time + (step.input.seq - next.ack) * 1000 / 60);
    assert.equal(JSON.stringify(authority), before); assert.equal(JSON.stringify(next), nextBefore);
    assert.equal(Date.now, dateFunction); assert.equal(times.length, 3);
  } finally { hook.dispose(); }
});
test('browser adapter is truly default-off, rejects guest and stale arm, records actual singleton calls and cleans up', async () => {
  let loads = 0;
  assert.equal(await installBrowserClock({}, null, { loadSimulation: () => { loads++; throw new Error('must not import'); } }), undefined);
  assert.equal(loads, 0);
  class Example { tick(value) { return value; } }
  const specification = { config: configuration, configId: clockId, configSha256: 'raw-fixture', simulationSourceSha256: 'actual-fixture-source' };
  const game = { network: true, trafficInstant: () => A + 10 };
  await assert.rejects(installBrowserClock({ ...game, network: false }, specification), /guest/);
  await assert.rejects(installBrowserClock(game, specification, { nowUTC: () => A }), /deadline/);
  const owner = await installBrowserClock(game, specification, { nowUTC: () => A - 1000, loadSimulation: async () => ({ Simulation: Example }) });
  assert.equal(owner.snapshot().actualSimulationMatches, null);
  game.sim = new Example(); game.sim.tick(A + 10); assert.equal(game.trafficInstant(), E0 + 10);
  assert.equal(owner.snapshot().actualSimulationMatches, true);
  assert.equal(owner.snapshot().physics.calls, 1); assert.equal(owner.snapshot().rendering.calls, 1);
  owner.dispose(); assert.equal(game.sim.tick(A + 10), A + 10); assert.equal(game.trafficInstant(), A + 10);
});
test('deferred import cannot install on a retired Game and a fresh rejoin keeps its own prototype hooks', async () => {
  class Example { tick(value) { return value; } }
  const specification = { config: configuration, configId: clockId, configSha256: 'fixture', simulationSourceSha256: 'fixture' };
  const originalTick = Example.prototype.tick, originalTraffic = () => A + 10;
  const old = { network: true, trafficInstant: originalTraffic }, controller = new AbortController();
  const deferred = Promise.withResolvers(), reason = new Error('retired owner'); reason.name = 'AbortError';
  const installation = installBrowserClock(old, specification, { nowUTC: () => A - 1000, signal: controller.signal,
    loadSimulation: () => deferred.promise });
  const rejected = assert.rejects(installation, received => received === reason);
  controller.abort(reason); old.disposed = true;
  const fresh = { network: true, sim: new Example(), trafficInstant: () => A + 20 };
  const owner = await installBrowserClock(fresh, specification, { nowUTC: () => A - 1000, loadSimulation: async () => ({ Simulation: Example }) });
  const freshTick = Example.prototype.tick;
  deferred.resolve({ Simulation: Example }); await rejected;
  assert.equal(old.trafficInstant, originalTraffic); assert.equal(Example.prototype.tick, freshTick);
  assert.equal(fresh.sim.tick(A + 20), E0 + 20); assert.equal(fresh.trafficInstant(), E0 + 20);
  owner.dispose(); assert.equal(Example.prototype.tick, originalTick);
});
test('abort between adapter resolution and owner publication releases hooks; import rejection identity remains original', async () => {
  class Example { tick(value) { return value; } }
  const specification = { config: configuration, configId: clockId, configSha256: 'fixture', simulationSourceSha256: 'fixture' };
  const originalTick = Example.prototype.tick, originalTraffic = () => A + 10;
  const game = { network: true, trafficInstant: originalTraffic }, controller = new AbortController();
  const installation = installBrowserClock(game, specification, { nowUTC: () => A - 1000, signal: controller.signal,
    loadSimulation: async () => ({ Simulation: Example }) });
  installation.then(() => controller.abort(new Error('publication lost')));
  const retiredOwner = await installation;
  assert.equal(retiredOwner.snapshot().active, false);
  assert.equal(Example.prototype.tick, originalTick); assert.equal(game.trafficInstant, originalTraffic);
  const fresh = { network: true, trafficInstant: () => A + 20 };
  const freshOwner = await installBrowserClock(fresh, specification, { nowUTC: () => A - 1000, loadSimulation: async () => ({ Simulation: Example }) });
  const freshTick = Example.prototype.tick; retiredOwner.dispose(); assert.equal(Example.prototype.tick, freshTick); freshOwner.dispose();
  const deferred = Promise.withResolvers(), originalError = new Error('original import error'), aborted = new AbortController();
  const failed = installBrowserClock({ network: true }, specification, { nowUTC: () => A - 1000, signal: aborted.signal, loadSimulation: () => deferred.promise });
  const rejected = assert.rejects(failed, received => received === originalError);
  aborted.abort(new Error('later retirement')); deferred.reject(originalError); await rejected;
  assert.equal(Example.prototype.tick, originalTick);
});
test('one planned benchmark records actual callback, refuses lateness and preserves timer disposal without new scheduling', async () => {
  const config = { ...configuration, benchmarkAtUTC: A + 1000, latenessToleranceMs: 10 };
  for (const scenario of ['ontime', 'late', 'early', 'disposed']) {
    let now = A, callback, cleared = false, starts = 0; const invalid = [];
    const planner = createPlannedBenchmark(config, { nowUTC: () => now,
      setTimer: (run, delay) => { assert.equal(delay, 1000); callback = run; return 17; },
      clearTimer: id => { assert.equal(id, 17); cleared = true; },
      onStart: plan => { starts++; assert.equal(plan.latenessMs, 5); return plan; },
      onInvalid: plan => { invalid.push(plan); return plan; } });
    const pending = planner.arm(); assert.throws(() => planner.arm(), /only once/);
    now = scenario === 'late' ? A + 1011 : scenario === 'early' ? A + 999 : A + 1005;
    if (scenario === 'disposed') planner.dispose();
    callback(); const result = await pending;
    assert.equal(starts, scenario === 'ontime' ? 1 : 0);
    assert.equal(invalid.length, scenario === 'ontime' ? 0 : 1);
    if (scenario !== 'ontime') assert.equal(result.actualStartUTC, null);
    if (scenario === 'disposed') assert.equal(cleared, true);
  }
});
test('clock receipt requires exact config ID and validated explicit API port, default remains2596', () => {
  assert.equal(backendPort(), 2596); assert.equal(backendPort('2597'), 2597);
  for (const value of ['0', '80', '-1', '65536', '2597x', '02597']) assert.throws(() => backendPort(value));
  const identity = { buildId: 'fixture', sourceSnapshotId: 'fixture', helperSha256: 'fixture', clock: { configId: clockId } };
  const receipt = { schemaVersion: 1, ...identity, attemptId: '8e9e7e15-6011-438d-96a2-53be43f17792', kind: 'startup', mode: 'plain',
    atMs: 1, timeOrigin: 1, observerErrors: [], outcome: 'rejected', samples: [], terminal: {}, clockConfigId: clockId };
  assert.equal(validateReceipt(receipt, identity), receipt);
  assert.throws(() => validateReceipt({ ...receipt, clockConfigId: 'wrong' }, identity), /clock config/);
});
test('timer installation and cleanup faults retain an invalid planned attempt without a benchmark', async () => {
  const config = { ...configuration, benchmarkAtUTC: A + 1000, latenessToleranceMs: 10 };
  let failed;
  const install = createPlannedBenchmark(config, { nowUTC: () => A, setTimer() { throw new Error('timer fixture'); },
    onInvalid: value => { failed = value; return value; } });
  await install.arm(); assert.match(failed.reason, /timer-install-failed/); assert.equal(failed.actualStartUTC, null);
  const cleanup = createPlannedBenchmark(config, { nowUTC: () => A, setTimer: () => 1,
    clearTimer() { throw new Error('cleanup fixture'); }, onInvalid: value => value });
  const result = cleanup.arm(); cleanup.dispose();
  assert.match((await result).reason, /disposed-before-start; timer-cleanup-failed/);
});
test('importing Node bootstrap is inert and source has no Date/Timeline packet patch or frame timer', async () => {
  const originalDate = Date.now, originalTick = Simulation.prototype.tick;
  const module = await import('./server-bootstrap.mjs');
  assert.equal(typeof module.bootstrap, 'function');
  assert.equal(Date.now, originalDate); assert.equal(Simulation.prototype.tick, originalTick);
  const source = await readFile(new URL('./server-bootstrap.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*=|setInterval\(|createServer\(|setSimulationInterval/);
  assert.match(source, /if \(process\.argv\[1\]/);
});
test('verified build identity rejects a different manifest or contradicting embedded clock config without importing a server', () => {
  const bytes = Buffer.from(JSON.stringify(configuration)), source = { snapshotId: 'verified-source', files: { 'shared/simulation.ts': 'verified-simulation' } };
  const identity = { sourceSnapshotId: source.snapshotId, clock: { config: { ...configuration }, configId: clockId,
    configSha256: sha256(bytes), simulationSourceSha256: 'verified-simulation' } };
  assert.doesNotThrow(() => verifyBuildContract(identity, source, bytes));
  assert.throws(() => verifyBuildContract({ ...identity, sourceSnapshotId: 'other-source' }, source, bytes), /sourceSnapshotId/);
  assert.throws(() => verifyBuildContract({ ...identity, clock: { ...identity.clock, config: { ...configuration, scenarioEpochUTC: E0 + 1 } } }, source, bytes), /content/);
  assert.throws(() => verifyBuildContract({ ...identity, clock: { ...identity.clock, configId: 'other-clock' } }, source, bytes), /identity/);
  assert.throws(() => verifyBuildContract(identity, source, Buffer.from(JSON.stringify(configuration) + ' ')), /bytes/);
  assert.throws(() => verifyBuildContract({ ...identity, clock: { ...identity.clock, simulationSourceSha256: 'other-simulation' } }, source, bytes), /Simulation/);
  assert.doesNotThrow(() => verifyBuildContract({ sourceSnapshotId: source.snapshotId }, source));
});
test('pure server launch plan isolates feedback/credential/static/cwd/source policy without touching process state', async () => {
  const { createServerLaunchPlan } = await import('./server-bootstrap.mjs');
  const cwd = process.cwd();
  const identity = { snapshot: '/explicit/verified/snapshot', sourceSnapshotId: 'verified-source' };
  const plan = createServerLaunchPlan(identity, '/explicit/owned/proof', '2597');
  assert.equal(plan.cwd, identity.snapshot); assert.equal(plan.setEnv.LINEAR_API_KEY, '');
  assert.equal(plan.setEnv.NODE_ENV, 'production'); assert.equal(plan.setEnv.STRAHOV_SOURCE_SNAPSHOT_ID, identity.sourceSnapshotId);
  assert.ok(plan.setEnv.FEEDBACK_DIR.endsWith('feedback')); assert.deepEqual(plan.unsetEnv, ['STATIC_DIR']);
  assert.equal(plan.setEnv.PORT, '2597'); assert.equal(plan.setEnv.HOST, '127.0.0.1');
  assert.equal(plan.evidence.linearCredentialCleared, true); assert.equal(plan.evidence.apiOnly, true);
  assert.equal(Object.hasOwn(plan.evidence, 'LINEAR_API_KEY'), false); assert.equal(Object.hasOwn(plan.evidence, 'setEnv'), false);
  assert.equal(process.cwd(), cwd); assert.equal(Object.isFrozen(plan.setEnv), true);
});
