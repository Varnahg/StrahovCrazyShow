import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marker, transformUI, inside, writeNewJSON, validateResult, harnessIdentity, sha256 } from './common.mjs';
import { assertScene, assertStableScene, assertComparableScenes } from './conditions.mjs';
import { statistics, buildBundle } from './package-evidence.mjs';
import { deliverAttempt } from './attempt-delivery.mjs';
import { createCampaign, readCampaign, startCampaignRun, beginAttempt, recordAttempt, readInventory, assessInterleaving, recoverExport, slots } from './campaign.mjs';
import { stopOwned } from './lifecycle.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../../..');
const cache = join(root, '.cache/performance-transit-measure-20261020');
const scenario = JSON.parse(await readFile(join(directory, 'scenario.json'), 'utf8'));
const snapshot = () => ({ready: true, disposed: false, preparingRenderQuality: false,
  health: {valid: true, phase: 'ready', pendingOperations: 0, generation: 1}, pendingData: 0, renderErrors: 0, assetErrors: 0,
  network: true, avatars: [0, 1, 2].map(n => ({id: 'player' + n, nickname: 'QA' + n, avatar: {preset: n}, position: {x: 110 + n, y: 0, z: 12}, lod: 'near'})),
  quality: scenario.quality, backend: scenario.backend, lightingInstant: scenario.instant, transitInstant: scenario.instant,
  ambient: {passengers: 12, buses: 0, cars: 0}, transitStatus: {state: 'scheduled'}, visibilityState: 'visible',
  weather: structuredClone(scenario.weather), yaw: scenario.yaw, pitch: scenario.pitch, distance: scenario.distance,
  actor: {x: 110, y: 0, z: 12}, camera: {activeId: 10, gameCameraId: 10, view: Array(16).fill(0), projection: Array(16).fill(0), position: {x: 100, y: 4, z: 12}, fov: .7},
  viewport: {width: 1200, height: 800}, backbuffer: {width: 1200, height: 800}, gpu: {renderer: 'fixture', vendor: 'fixture', backend: 'webgl2'},
  passengers: [{projectedInside: true}], pool: {sources: 1, materials: 1}, scene: {meshes: 2},
});
const identity = {sourceSnapshotId: 'a'.repeat(64), harnessSha256: 'b'.repeat(64)};
const validRaw = () => ({schemaVersion: 1, ...identity, scenario, mode: 'plain', intervals: Array.from({length: 3}, () => ({rawFrameMs: Array(20).fill(16), profile: null,
  validationErrors: [], semanticHash: 'c'.repeat(64), before: snapshot(), after: snapshot(),
  benchmark: {frames: 20, avatars: 3, renderHealth: {valid: true}, renderErrorCount: 0, assetLoadErrorCount: 0}}))});
async function ownedFixture(t) {
  await mkdir(cache, {recursive: true});
  const directory = await mkdtemp(join(cache, 'helper-test-'));
  t.after(() => rm(inside(cache, directory), {recursive: true}));
  await writeNewJSON(join(directory, 'identity.json'), {...identity, snapshot: directory});
  await writeNewJSON(join(directory, 'source-manifest.json'), {snapshotId: identity.sourceSnapshotId, files: {'client/transit-renderer.ts': 'fixture'}});
  const campaign = await readCampaign(await createCampaign(directory, 'fixture'), directory);
  const run = await startCampaignRun(campaign, 'A1', join(directory, 'identity.json'), identity);
  await writeNewJSON(join(run.directory, 'cleanup.json'), {apiExited: true, previewClosed: true});
  return {directory, campaign, run};
}
async function registeredRaw(run) {
  const attemptId = randomUUID();
  await beginAttempt(run, attemptId, 'plain');
  return {...validRaw(), campaignId: run.start.campaignId, startId: run.start.startId, slot: run.start.slot,
    attemptId, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString()};
}

test('Exact production UI injection fails closed when the entry point is missing or ambiguous', async () => {
  const source = await readFile(join(root, 'client/ui.tsx'), 'utf8');
  const result = transformUI(source);
  assert.equal(result.split('installTransitQA(g);').length, 2);
  assert.equal(result.replace('import { installTransitQA } from "virtual:transit-qa";\n', '')
    .replace('        installTransitQA(g);\n', ''), source.replaceAll('\r\n', '\n'));
  assert.throws(() => transformUI(''), /injection point/);
  assert.throws(() => transformUI(marker + marker), /injection point/);
});
test('Bounded output cannot escape and prior raw records cannot be overwritten', async () => {
  await mkdir(cache, {recursive: true});
  const directory = await mkdtemp(join(cache, 'helper-test-'));
  const file = inside(directory, join(directory, 'result.json'));
  await writeNewJSON(file, {raw: [1, 2]});
  await assert.rejects(() => writeNewJSON(file, {raw: []}), /EEXIST/);
  assert.throws(() => inside(directory, join(directory, '../escape.json')));
  assert.throws(() => inside(directory, directory));
  assert.deepEqual(JSON.parse(await readFile(file)), {raw: [1, 2]});
  // Only this test's just-created unique directory, inside the owned cache.
  await rm(inside(cache, directory), {recursive: true});
});
test('Recorder binds source/harness and rejects added profiling in plain FPS', () => {
  const sample = validRaw();
  assert.equal(validateResult(sample, identity), sample);
  assert.throws(() => validateResult({...sample, sourceSnapshotId: 'c'.repeat(64)}, identity));
  const bad = structuredClone(sample);
  bad.intervals[0].profile = {updates: 20};
  assert.throws(() => validateResult(bad, identity), /Plain FPS/);
  const nan = structuredClone(sample);
  nan.intervals[0].rawFrameMs[0] = NaN;
  assert.throws(() => validateResult(nan, identity), /raw frame/);
});
test('One immutable harness identity covers the scenario, build injection and profiler', async () => {
  const identity = await harnessIdentity(directory);
  assert.equal(identity.sha256, sha256(JSON.stringify(identity.files)));
  assert.deepEqual(Object.keys(identity.files), ['scenario.json', 'common.mjs', 'harness.mjs', 'qa-overlay.mjs', 'conditions.mjs', 'attempt-delivery.mjs', 'campaign.mjs', 'lifecycle.mjs']);
});
test('Actual camera, weather, backend and lifecycle gates reject drift or missing evidence', () => {
  const before = snapshot();
  assertScene(before, scenario);
  assertStableScene(before, structuredClone(before));
  for (const mutate of [s => s.weather.wind = 2, s => s.backend = 'webgpu', s => delete s.health.pendingOperations,
    s => s.ready = false, s => s.avatars.pop(), s => s.camera.activeId++, s => s.distance = 10]) {
    const invalid = snapshot(); mutate(invalid);
    assert.throws(() => assertScene(invalid, scenario));
  }
  const drifted = snapshot(); drifted.camera.position.x += .02;
  assert.throws(() => assertStableScene(before, drifted), /camera/);
  const missing = snapshot(); delete missing.viewport;
  assert.throws(() => assertScene(missing, scenario), /resolution/);
});
test('Cross-start comparison allows generated IDs but refuses pose/population changes; raw stats retain outliers', () => {
  const a = snapshot(), b = snapshot();
  b.avatars.forEach(p => p.id += '-new'); b.camera.activeId++; b.health.generation++;
  assertComparableScenes(a, b);
  b.avatars[0].position.x += .04;
  assert.throws(() => assertComparableScenes(a, b), /peer position/);
  assert.deepEqual(statistics([]), {count: 0, sum: 0, mean: null, median: null, p95: null, p99: null});
  assert.equal(statistics([1, 2, 3, 100]).mean, 26.5);
  assert.equal(statistics([1, 2, 3, 100]).p99, 100);
});
test('Rejected POST and transport failure retain exportable full raw before any network operation', async () => {
  const raw = {...validRaw(), attemptId: randomUUID()}; let exported;
  const rejected = await deliverAttempt(raw, async value => {
    assert.deepEqual(exported, value);
    return {persisted: true, accepted: false, file: 'received.json', reasons: ['late peer disconnect']};
  }, value => exported = value);
  assert.equal(rejected.persisted, true); assert.equal(rejected.accepted, false);
  assert.deepEqual(exported.intervals[0].rawFrameMs, raw.intervals[0].rawFrameMs);
  const failed = await deliverAttempt(raw, async () => { throw new Error('offline'); }, value => exported = value);
  assert.equal(failed.persisted, false); assert.equal(failed.exportable, true);
  raw.intervals[0].rawFrameMs[0] = 999;
  assert.equal(exported.intervals[0].rawFrameMs[0], 16);
});
test('Late disconnected peers and invalid payloads preserve first raw receipts and reject byte-changing retries', async t => {
  const {run} = await ownedFixture(t), raw = await registeredRaw(run);
  const verdict = await recordAttempt(run, raw, identity, [{connected: true}, {connected: false}]);
  assert.equal(verdict.persisted, true); assert.equal(verdict.accepted, false);
  assert.match(verdict.reasons.join(), /disconnected/);
  assert.deepEqual(JSON.parse(await readFile(verdict.file)).raw, raw);
  assert.equal((await recordAttempt(run, raw, identity, [])).replay, true);
  const altered = structuredClone(raw); altered.intervals[0].rawFrameMs[0]++;
  await assert.rejects(() => recordAttempt(run, altered, identity, []), /different raw bytes/);
  assert.equal((await readdir(join(run.directory, 'attempts', raw.attemptId))).length, 2);
  const invalid = await registeredRaw(run); invalid.intervals[0].validationErrors.push('weather drift');
  const rejected = await recordAttempt(run, invalid, identity, [{connected: true}, {connected: true}]);
  assert.equal(rejected.accepted, false); assert.deepEqual(JSON.parse(await readFile(rejected.file)).raw, invalid);
});
test('Complete campaign inventory includes partial, rejected and missing receipts; recovered exports never enter accepted stats', async t => {
  const {run, campaign, directory} = await ownedFixture(t);
  const partial = await registeredRaw(run); partial.intervals.splice(1); partial.failure = 'renderer stopped';
  await recordAttempt(run, partial, identity, []);
  const missing = await registeredRaw(run);
  let inventory = await readInventory(campaign);
  assert.equal(inventory.records.length, 2); assert.equal(inventory.missingReceipts, 1);
  assert.equal(inventory.incompleteStarts, 0);
  assert.ok(inventory.files.some(file => file.path.endsWith('cleanup.json')));
  const exportFile = join(directory, 'browser-export.json');
  await writeNewJSON(exportFile, {attempts: [missing]});
  await recoverExport(campaign, run.start.startId, exportFile);
  inventory = await readInventory(campaign);
  assert.equal(inventory.missingReceipts, 0);
  const bundle = await buildBundle(inventory, 'A');
  assert.equal(bundle.failedRecords.length, 2); assert.equal(bundle.acceptedRecords.length, 0); assert.equal(bundle.groups.length, 0);
  assert.equal(bundle.failedRecords[0].receipt.raw.intervals.length >= 1, true);
  assert.ok(bundle.failedRecords.some(record => record.reasons.some(reason => reason.includes('Transport'))));
  await writeNewJSON(join(run.directory, 'attempts', missing.attemptId, 'hidden.json'), {bad: true});
  await assert.rejects(() => readInventory(campaign), /Uninventoried/);
});
test('Inventory refuses duplicate attempts across independent starts', async t => {
  const {run, campaign, directory} = await ownedFixture(t), raw = await registeredRaw(run);
  const second = await startCampaignRun(campaign, 'B1', join(directory, 'identity.json'), identity);
  await beginAttempt(second, raw.attemptId, 'plain');
  await assert.rejects(() => readInventory(campaign), /Duplicate attempt/);
  const duplicatedPaths = spawnSync(process.execPath, [fileURLToPath(new URL('./package-evidence.mjs', import.meta.url)),
    campaign.file, campaign.file], {encoding: 'utf8'});
  assert.notEqual(duplicatedPaths.status, 0);
  assert.match(duplicatedPaths.stderr, /no manual raw selection/);
});
test('Each mode requires exact six-start interleaving; mixed modes or duplicate success cannot satisfy it', () => {
  const records = slots.flatMap((slot, n) => ['profile', 'plain'].map((mode, m) => ({accepted: true,
    begin: {slot, mode, startId: slot + '-physical-start', attemptId: randomUUID(), begunAt: new Date(100000 + n * 10000 + m * 1000).toISOString()}})));
  assert.equal(assessInterleaving(records).valid, true);
  assert.equal(assessInterleaving([...records, records[0]]).valid, false);
  assert.equal(assessInterleaving(records.filter(record => record.begin.slot !== 'B3')).valid, false);
  const mixed = structuredClone(records);
  mixed.filter(record => record.begin.mode === 'plain').forEach(record => {
    const index = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'].indexOf(record.begin.slot);
    record.begin.begunAt = new Date(index * 10000).toISOString();
  });
  assert.equal(assessInterleaving(mixed).valid, false);
  const shared = structuredClone(records); shared[2].begin.startId = shared[0].begin.startId;
  assert.equal(assessInterleaving(shared).valid, false);
});
test('Cleanup skips terminal SDK rooms, bounds live leave, then verifies owned API and preview shutdown', async () => {
  let terminalLeave = 0, activeClosed = 0, socketDestroyed = 0;
  const api = new EventEmitter(); api.exitCode = null; api.signalCode = null; api.kill = () => {
    setImmediate(() => { api.signalCode = 'SIGTERM'; api.emit('exit', null, 'SIGTERM'); }); return true;
  };
  const peers = [
    {evidence: {connected: false}, room: {connection: {isOpen: false}, leave: () => { terminalLeave++; return new Promise(() => {}); }}},
    {evidence: {connected: true}, room: {connection: {isOpen: true, close: () => activeClosed++}, leave: () => new Promise(() => {})}},
  ];
  const preview = {httpServer: {close: callback => setImmediate(callback), closeAllConnections() {}}};
  const report = await stopOwned({peers, api, preview, sockets: [{destroy: () => socketDestroyed++}], milliseconds: 10});
  assert.equal(terminalLeave, 0); assert.equal(activeClosed, 1); assert.equal(socketDestroyed, 1);
  assert.equal(report.apiExited, true); assert.equal(report.previewClosed, true);
  assert.equal(api.listenerCount('exit'), 0);
});
test('Cleanup forces only its own non-exiting child and still closes preview after peer leave throws', async () => {
  const signals = [], api = new EventEmitter(); api.exitCode = null; api.signalCode = null;
  api.kill = signal => { signals.push(signal); if (signal === 'SIGKILL') setImmediate(() => { api.signalCode = signal; api.emit('exit', null, signal); }); };
  let closed = false;
  const report = await stopOwned({peers: [{evidence: {connected: true}, room: {connection: {isOpen: true, close() {}}, leave() {throw new Error('closed race');}}}],
    api, preview: {httpServer: {close(callback) { closed = true; callback(); }}}, sockets: [], milliseconds: 10});
  assert.deepEqual(signals, [undefined, 'SIGKILL']); assert.equal(closed, true); assert.equal(report.apiExited, true);
});
