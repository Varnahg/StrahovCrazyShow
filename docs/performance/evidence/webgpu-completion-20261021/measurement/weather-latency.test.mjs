/** Pure CPU contract fixtures. No browser, WebGPU device, network or FPS data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inside, sha256, parseBuildOptions, canonicalJSON, canonicalBuildInput, buildDigest, browserBuildIdentity, resolveBuildOverlay } from './common.mjs';
import { verifyBuildSeal, verifyBuildInputs } from './harness.mjs';
import { MAX_WEATHER_BYTES, WEATHER_LABELS, weatherFixture, validateWeather, loadWeatherInput, verifyBuiltWeather, serveWeatherFixture } from './weather-fixture.mjs';
import { MAX_LATENCY_CALLS, observeStartupLatency } from './startup-latency.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const recorded = () => ({ temperature: 8.375, wind: 0.9, windDirection: 287.125, rain: 0, cloud: 0.86,
  observedAt: 1792533600000, fetchedAt: 1792533612345, source: 'Station fixture', cloudSource: 'Model fixture',
  status: 'live', stale: false, sourceKind: 'station', cloudObservedAt: 1792533600000, cloudStale: false,
  cloudLayers: { low: 0.86, mid: 0.4123456789, high: 0.09 },
  cloudWinds: { low: { speed: 0.9, direction: 287.125 }, mid: { speed: 4.25, direction: 170 }, high: { speed: 13.7, direction: 359 } },
  cloudWindSource: 'Wind aloft fixture', windGust: 2.7, humidity: 89.5, visibility: 12345.6, snowfall: 0.125,
  liquidPrecipitation: 0.375, precipitationType: 'mixed',
  fieldSources: { humidity: { kind: 'station', source: 'Station fixture', observedAt: 1792533600000, stale: false },
    snowfall: { kind: 'model', source: 'Model fixture', observedAt: 1792530000000, stale: true } } });
const bytes = value => Buffer.from(JSON.stringify(value));
async function withDirectory(run) {
  const path = await mkdtemp(join(directory, '.weather-latency-test-'));
  try { return await run(path); }
  finally { await rm(inside(directory, path), { recursive: true, force: true }); }
}
const flush = () => new Promise(setImmediate);
function deviceFixture() {
  const seen = [], pending = [];
  const call = function (...args) { const value = Promise.withResolvers(); pending.push(value); seen.push({ receiver: this, args }); return value.promise; };
  const queue = { onSubmittedWorkDone: call }, device = { queue, popErrorScope: call };
  return { engine: { isWebGPU: true, _device: device }, device, queue, seen, pending, original: call };
}

test('explicit build flags preserve positional clock and reject duplicate/ambiguous input; default observer off', () => {
  const clock = resolve(directory, 'clock.json'), weather = resolve(directory, 'weather.json');
  assert.deepEqual(parseBuildOptions([]), { loading: 'original', clockFile: undefined, weatherFile: undefined, startupLatency: false });
  assert.deepEqual(parseBuildOptions(['original', clock, '--weather', weather, '--startup-latency']),
    { loading: 'original', clockFile: clock, weatherFile: weather, startupLatency: true });
  assert.deepEqual(parseBuildOptions(['--weather', weather, '--clock', clock]),
    { loading: 'original', clockFile: clock, weatherFile: weather, startupLatency: false });
  for (const args of [['--weather'], ['--weather', '--startup-latency'], ['--startup-latency', '--startup-latency'],
    ['original', clock, '--clock', clock], ['--clock', clock, '--clock', clock], ['--weather', weather, '--weather', weather],
    ['original', 'relative.json'], ['--unknown'], ['original', 'translucent'], ['--weather=x']]) assert.throws(() => parseBuildOptions(args));
});
test('recorded weather changes only original preview QA labels and preserves every numeric/null/nested value', () => {
  const source = recorded(), raw = Buffer.from(JSON.stringify(source, null, 2) + '\n'), fixture = weatherFixture(raw);
  assert.deepEqual(JSON.parse(fixture.emittedBytes), { ...source, ...WEATHER_LABELS });
  assert.deepEqual(fixture.sourceBytes, raw); assert.equal(fixture.specification.sourceSha256, sha256(raw));
  assert.equal(fixture.specification.emittedSha256, sha256(fixture.emittedBytes));
  assert.equal(fixture.specification.sourceBytes, raw.length); assert.equal(fixture.specification.emittedBytes, fixture.emittedBytes.length);
  assert.match(fixture.specification.provenance.mechanism, /scripts\/performance-preview.mjs/);
  const output = JSON.parse(fixture.emittedBytes);
  assert.equal(output.wind, 0.9); assert.equal(output.cloud, 0.86); assert.deepEqual(output.cloudWinds, source.cloudWinds);
  assert.deepEqual(output.fieldSources, source.fieldSources);
  source.temperature = source.observedAt = source.cloudObservedAt = null;
  assert.equal(JSON.parse(weatherFixture(bytes(source)).emittedBytes).temperature, null);
});
test('weather byte/UTF8/known-shape/value bounds fail closed without clamping values', () => {
  for (const raw of [Buffer.alloc(0), Buffer.alloc(MAX_WEATHER_BYTES + 1), Buffer.from([0xc3, 0x28]), Buffer.from('{bad')])
    assert.throws(() => weatherFixture(raw));
  const cases = [value => delete value.wind, value => value.extra = 1, value => value.wind = -1,
    value => value.wind = '0.9', value => value.cloud = 1.01, value => value.humidity = 101,
    value => value.cloudWinds.mid.direction = 361, value => delete value.cloudLayers.low,
    value => value.cloudWinds.high.extra = 1, value => value.fieldSources.snowfall.kind = 'guess',
    value => value.source = 'x'.repeat(2049), value => value.precipitationType = 'mystery'];
  for (const change of cases) { const value = recorded(); change(value); assert.throws(() => weatherFixture(bytes(value))); }
  assert.throws(() => validateWeather({ ...recorded(), wind: NaN }));
  assert.throws(() => weatherFixture(Buffer.from(JSON.stringify(recorded()).replace('"wind":0.9', '"wind":-0'))), /round-trip/);
});
test('explicit weather path, raw/emitted identity, provenance and postbuild drift are verified', () => withDirectory(async path => {
  const input = join(path, 'input.json'); await writeFile(input, bytes(recorded()));
  const fixture = await loadWeatherInput(input, path);
  await writeFile(join(path, 'weather-source.json'), fixture.sourceBytes);
  await writeFile(join(path, 'weather-emitted.json'), fixture.emittedBytes);
  assert.deepEqual((await verifyBuiltWeather(path, fixture.specification)).specification, fixture.specification);
  assert.equal(await verifyBuiltWeather(path, null), undefined);
  await assert.rejects(loadWeatherInput('relative.json', path), /absolute/);
  await assert.rejects(loadWeatherInput(join(path, '..', 'escape.json'), path), /strict child/);
  await writeFile(join(path, 'wrong.txt'), fixture.sourceBytes);
  await assert.rejects(loadWeatherInput(join(path, 'wrong.txt'), path), /JSON/);
  const subdirectory = join(path, 'directory.json'); await mkdir(subdirectory);
  await assert.rejects(loadWeatherInput(subdirectory, path), /regular/);
  await writeFile(join(path, 'large.json'), Buffer.alloc(MAX_WEATHER_BYTES + 1));
  await assert.rejects(loadWeatherInput(join(path, 'large.json'), path), /bound/);
  const allowedRoot = join(path, 'allowed'), outside = join(path, 'outside'); await mkdir(allowedRoot); await mkdir(outside);
  await writeFile(join(outside, 'record.json'), fixture.sourceBytes);
  await symlink(outside, join(allowedRoot, 'linked-directory'), 'junction');
  await assert.rejects(loadWeatherInput(join(allowedRoot, 'linked-directory', 'record.json'), allowedRoot), /strict child/);
  await assert.rejects(verifyBuiltWeather(path, { ...fixture.specification, provenance: { ...fixture.specification.provenance, numericPolicy: 'different' } }), /differ/);
  await writeFile(join(path, 'weather-emitted.json'), bytes({ ...recorded(), ...WEATHER_LABELS, wind: 0 }));
  await assert.rejects(verifyBuiltWeather(path, fixture.specification), /differ/);
  await writeFile(join(path, 'weather-emitted.json'), fixture.emittedBytes);
  await writeFile(join(path, 'weather-source.json'), Buffer.concat([fixture.sourceBytes, Buffer.from(' ')]));
  await assert.rejects(verifyBuiltWeather(path, fixture.specification), /differ/);
}));
test('weather middleware default leaves API proxy untouched; explicit fixture returns exact no-store bytes only at existing route', () => {
  const events = [], output = weatherFixture(bytes(recorded())).emittedBytes;
  const response = { setHeader: (...args) => events.push(args), end: value => events.push(value) };
  assert.equal(serveWeatherFixture({ url: '/api/weather' }, response), false);
  assert.equal(serveWeatherFixture({ url: '/api/health' }, response, output), false);
  assert.equal(serveWeatherFixture({ url: '/api/weather?x=1' }, response, output), false); assert.deepEqual(events, []);
  assert.equal(serveWeatherFixture({ url: '/api/weather' }, response, output), true);
  assert.deepEqual(events, [['Content-Type', 'application/json; charset=utf-8'], ['Cache-Control', 'no-store'], output]);
});
test('latency default off never reads engine/device or installs methods; non-WebGPU enabled is explicit invalid diagnostic', () => {
  const inaccessible = new Proxy({}, { get() { throw new Error('must not read'); } });
  assert.equal(observeStartupLatency(inaccessible), undefined);
  assert.equal(observeStartupLatency(inaccessible, { enabled: false }), undefined);
  const observer = observeStartupLatency({ isWebGPU: false }, { enabled: true, now: () => 0 });
  assert.equal(observer.snapshot().active, false); assert.equal(observer.snapshot().evidenceValid, false);
});
test('latency returns the exact original Promises, receivers/args and independent completion channels with no extra calls', async () => {
  const fixture = deviceFixture(); let time = 10;
  const observer = observeStartupLatency(fixture.engine, { enabled: true, now: () => time });
  const scope = fixture.device.popErrorScope('original argument'), fence = fixture.queue.onSubmittedWorkDone(42);
  assert.equal(scope, fixture.pending[0].promise); assert.equal(fence, fixture.pending[1].promise);
  assert.deepEqual(fixture.seen, [{ receiver: fixture.device, args: ['original argument'] }, { receiver: fixture.queue, args: [42] }]);
  time = 17; fixture.pending[0].resolve(null); await scope; await flush();
  let snapshot = observer.snapshot();
  assert.equal(snapshot.channels[0].completionTotalMs, 7); assert.equal(snapshot.channels[1].pending, 1);
  const original = new Error('original native Promise rejection');
  time = 23; fixture.pending[1].reject(original); await assert.rejects(fence, error => error === original); await flush();
  observer.dispose(); snapshot = observer.snapshot();
  assert.equal(snapshot.evidenceValid, true); assert.equal(snapshot.recordedCalls, 2);
  assert.equal(snapshot.channels[1].completionTotalMs, 13); assert.equal(snapshot.channels[1].rejected, 1);
  assert.deepEqual(snapshot.records.map(row => [row[1], row[5]]), [[0, 1], [1, 2]]);
  assert.equal(fixture.device.popErrorScope, fixture.original); assert.equal(fixture.queue.onSubmittedWorkDone, fixture.original);
  assert.equal(fixture.seen.length, 2);
});
test('latency preserves synchronous throws and unsupported outputs despite faulty observer clock', () => {
  const fixture = deviceFixture(), original = new Error('same original synchronous throw');
  fixture.device.popErrorScope = function (...args) { assert.equal(this, fixture.device); assert.deepEqual(args, [123]); throw original; };
  fixture.queue.onSubmittedWorkDone = () => 17;
  const observer = observeStartupLatency(fixture.engine, { enabled: true, now() { throw new Error('observer clock fault'); } });
  assert.throws(() => fixture.device.popErrorScope(123), error => error === original);
  assert.equal(fixture.queue.onSubmittedWorkDone(), 17); observer.dispose();
  const snapshot = observer.snapshot(); assert.equal(snapshot.channels[0].syncThrows, 1);
  assert.equal(snapshot.channels[1].unsupportedResults, 1); assert.equal(snapshot.evidenceValid, false);
  assert.ok(snapshot.issues.observerErrors > 0); assert.ok(snapshot.issues.invalidClocks > 0);
});
test('latency retains pending calls at stop; late settlements cannot mutate sealed evidence or a fresh owner', async () => {
  const fixture = deviceFixture(); let time = 100;
  const first = observeStartupLatency(fixture.engine, { enabled: true, now: () => time });
  fixture.device.popErrorScope(); time = 125; first.dispose();
  const sealed = first.snapshot(); assert.equal(sealed.pendingAgeMaxMs, 25);
  assert.equal(sealed.channels[0].pending, 1); assert.equal(sealed.records[0][3], null); assert.equal(sealed.records[0][5], 0);
  const next = observeStartupLatency(fixture.engine, { enabled: true, now: () => time });
  fixture.pending[0].resolve(null); await flush();
  assert.deepEqual(first.snapshot(), sealed); assert.equal(next.snapshot().recordedCalls, 0);
  const call = fixture.queue.onSubmittedWorkDone(); time = 130; fixture.pending[1].resolve(); await call; await flush();
  next.dispose(); assert.equal(next.snapshot().channels[1].fulfilled, 1);
});
test('latency abort, retirement and device replacement restore only owned hooks and permit rejoin', () => {
  for (const reason of ['abort', 'retire', 'device']) {
    const fixture = deviceFixture(), abort = new AbortController(); let retired = false;
    const observer = observeStartupLatency(fixture.engine, { enabled: true, signal: abort.signal, isRetired: () => retired, now: () => 1 });
    if (reason === 'abort') abort.abort();
    else { if (reason === 'retire') retired = true; else fixture.engine._device = {}; fixture.device.popErrorScope(); }
    assert.equal(observer.snapshot().active, false); assert.equal(fixture.device.popErrorScope, fixture.original);
    assert.equal(fixture.queue.onSubmittedWorkDone, fixture.original);
    retired = false; fixture.engine._device = fixture.device;
    const next = observeStartupLatency(fixture.engine, { enabled: true, now: () => 2 });
    assert.deepEqual(next.snapshot().availability, ['installed', 'installed']); next.dispose();
  }
});
test('latency late retirement during installation never leaves a wrapper; foreign wrapper and overlapping owner are retained safely', () => {
  const fixture = deviceFixture(), abort = new AbortController();
  Object.defineProperty(fixture.engine, '_device', { configurable: true, get() { abort.abort(); return fixture.device; } });
  const retired = observeStartupLatency(fixture.engine, { enabled: true, signal: abort.signal, now: () => 0 });
  assert.equal(retired.snapshot().active, false); assert.equal(fixture.device.popErrorScope, fixture.original);
  const next = observeStartupLatency(fixture.engine, { enabled: true, now: () => 0 });
  const installed = fixture.device.popErrorScope;
  const overlap = observeStartupLatency(fixture.engine, { enabled: true, now: () => 0 });
  assert.equal(overlap.snapshot().evidenceValid, false); assert.equal(fixture.device.popErrorScope, installed);
  const foreign = function (...args) { return Reflect.apply(installed, this, args); };
  fixture.device.popErrorScope = foreign; next.dispose();
  assert.equal(fixture.device.popErrorScope, foreign); assert.equal(next.snapshot().issues.restoreConflicts, 1);
  const fresh = observeStartupLatency(fixture.engine, { enabled: true, now: () => 0 });
  fixture.device.popErrorScope(); assert.equal(fresh.snapshot().channels[0].calls, 1);
  assert.equal(next.snapshot().recordedCalls, 0); fresh.dispose(); assert.equal(fixture.device.popErrorScope, foreign);
});
test('latency cap is bounded, original calls continue, overflow invalidates and scalar trace fits receipt headroom', async () => {
  let calls = 0, time = 1000;
  const original = () => { calls++; return Promise.resolve(null); }, queue = { onSubmittedWorkDone: original };
  const device = { queue, popErrorScope: original }, observer = observeStartupLatency({ isWebGPU: true, _device: device }, { enabled: true, now: () => ++time });
  for (let index = 0; index <= MAX_LATENCY_CALLS; index++) (index % 2 ? device.popErrorScope() : queue.onSubmittedWorkDone());
  await flush(); observer.dispose(); const snapshot = observer.snapshot();
  assert.equal(calls, MAX_LATENCY_CALLS + 1); assert.equal(snapshot.recordedCalls, MAX_LATENCY_CALLS);
  assert.equal(snapshot.channels.reduce((sum, channel) => sum + channel.calls, 0), calls);
  assert.equal(snapshot.issues.overflow, 1); assert.equal(snapshot.evidenceValid, false);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 768 * 1024, 'bounded scalar trace below receipt2MiB with headroom for existing startup data');
  assert.equal(device.popErrorScope, original); assert.equal(queue.onSubmittedWorkDone, original);
});
test('latency method descriptors and inherited ownership restore exactly; missing/immutable methods are invalid', () => {
  const original = () => Promise.resolve(), devicePrototype = { popErrorScope: original }, queuePrototype = { onSubmittedWorkDone: original };
  const queue = Object.create(queuePrototype), device = Object.assign(Object.create(devicePrototype), { queue });
  const observer = observeStartupLatency({ isWebGPU: true, _device: device }, { enabled: true, now: () => 0 });
  assert.equal(Object.hasOwn(device, 'popErrorScope'), true); observer.dispose();
  assert.equal(Object.hasOwn(device, 'popErrorScope'), false); assert.equal(Object.hasOwn(queue, 'onSubmittedWorkDone'), false);
  Object.defineProperty(device, 'popErrorScope', { value: original, writable: false, configurable: false });
  const bad = observeStartupLatency({ isWebGPU: true, _device: device }, { enabled: true, now: () => 0 });
  assert.equal(bad.snapshot().availability[0], 'install-failed'); assert.equal(bad.snapshot().evidenceValid, false); bad.dispose();
});

function sealedFixture(patch = {}) {
  // These are CPU metadata/JavaScript-byte fixtures, never a Vite/GPU build.
  const source = { snapshotId: sha256('source fixture'), files: { 'shared/simulation.ts': sha256('simulation fixture') } };
  const helper = { sha256: sha256('helper fixture'), files: { 'startup-observer.mjs': sha256('observer fixture') } };
  const config = { schemaVersion: 1, scenarioEpochUTC: 1000, armAtUTC: 2000 }, clockBytes = bytes(config);
  const weather = weatherFixture(bytes(recorded())).specification;
  const clock = { config, configId: sha256(JSON.stringify(config)), configSha256: sha256(clockBytes), simulationSourceSha256: source.files['shared/simulation.ts'] };
  const transforms = { ui: { before: sha256('UI original'), after: sha256('UI transformed') }, loading: { variant: 'original', before: sha256('CSS'), after: sha256('CSS') } };
  const settings = { sourceSnapshotId: source.snapshotId, helperSha256: helper.sha256, label: 'seal-fixture', loading: 'original',
    transforms, clock, weather, startupLatency: true, dependencies: { 'selected.js': sha256('dependency') }, ...patch };
  const template = 'export const identity = __WEBGPU_COMPLETION_IDENTITY__;\n';
  const overlayBytes = Buffer.from(resolveBuildOverlay(template, settings));
  const input = { ...browserBuildIdentity(settings), transforms: settings.transforms, snapshot: '/explicit/cpu/snapshot', sourceFiles: 1,
    helperFiles: helper.files, observerSha256: helper.files['startup-observer.mjs'], dependencies: settings.dependencies, overlaySha256: sha256(overlayBytes) };
  const inputBytes = Buffer.from(JSON.stringify(input, null, 2) + '\n');
  const bundleJavaScript = { 'assets/cpu-only.js': Buffer.from('export default ' + JSON.stringify(browserBuildIdentity(settings)) + ';') };
  const bundleFiles = Object.fromEntries(Object.entries(bundleJavaScript).map(([file, value]) => [file, sha256(value)]));
  const identity = { ...input, buildInputSha256: sha256(inputBytes), bundleFiles };
  const proof = { inputBytes, overlayBytes, overlayTemplate: template, bundleFiles, bundleJavaScript };
  const verified = { source, helper, clockBytes: settings.clock ? clockBytes : undefined, weather: settings.weather ?? undefined,
    transforms: settings.transforms, dependencies: settings.dependencies };
  return { identity, input, proof, verified };
}
test('canonical digest covers every required build input, explicit null/off and nested key order deterministically', () => {
  const fixture = sealedFixture(), original = fixture.identity;
  assert.equal(buildDigest(original), original.buildId);
  const reordered = Object.fromEntries(Object.entries(original).reverse());
  reordered.transforms = { loading: { ...original.transforms.loading }, ui: { after: original.transforms.ui.after, before: original.transforms.ui.before } };
  assert.equal(buildDigest(reordered), original.buildId);
  for (const key of ['sourceSnapshotId', 'helperSha256', 'label', 'loading', 'transforms', 'clock', 'weather', 'startupLatency', 'dependencies']) {
    const missing = structuredClone(original); delete missing[key]; assert.throws(() => buildDigest(missing), /Missing/);
  }
  for (const changed of [{ sourceSnapshotId: sha256('other source') }, { helperSha256: sha256('other helper') }, { label: 'other-label' },
    { loading: 'translucent' }, { transforms: { ...original.transforms, ui: { before: sha256('different') } } },
    { clock: null }, { weather: null }, { startupLatency: false }, { dependencies: { 'selected.js': sha256('other dependency') } }])
    assert.notEqual(buildDigest({ ...original, ...changed }), original.buildId);
  const plain = sealedFixture({ clock: null, weather: null, startupLatency: false });
  assert.doesNotThrow(() => verifyBuildSeal(plain.identity, plain.input, plain.proof));
  assert.doesNotThrow(() => verifyBuildInputs(plain.identity, plain.verified));
  assert.throws(() => canonicalBuildInput({ ...original, startupLatency: undefined }));
  assert.throws(() => canonicalJSON({ unsupported: undefined }));
  assert.throws(() => resolveBuildOverlay('no marker', original));
  assert.throws(() => resolveBuildOverlay('__WEBGPU_COMPLETION_IDENTITY__ __WEBGPU_COMPLETION_IDENTITY__', original));
});
test('load seal rejects deletion/null/tamper of weather, clock and diagnostic flag before optional branch selection', () => {
  const fixture = sealedFixture(); assert.doesNotThrow(() => verifyBuildSeal(fixture.identity, fixture.input, fixture.proof));
  for (const key of ['weather', 'clock', 'startupLatency']) {
    const missing = structuredClone(fixture.identity); delete missing[key];
    assert.throws(() => verifyBuildSeal(missing, fixture.input, fixture.proof), /Missing/);
    const modified = { ...fixture.identity, [key]: key === 'startupLatency' ? false : null };
    assert.throws(() => verifyBuildSeal(modified, fixture.input, fixture.proof), /digest/);
    modified.buildId = buildDigest(modified);
    assert.throws(() => verifyBuildSeal(modified, fixture.input, fixture.proof), /digest/);
  }
  const modified = structuredClone(fixture.identity); modified.weather.emittedSha256 = sha256('other emitted weather');
  modified.buildId = buildDigest(modified);
  assert.throws(() => verifyBuildSeal(modified, fixture.input, fixture.proof), /digest/);
});
test('coherently recomputed sidecars/overlay cannot relabel the old verified browser JavaScript', () => {
  const old = sealedFixture(), changed = sealedFixture({ clock: null, weather: null, startupLatency: false });
  assert.doesNotThrow(() => verifyBuildSeal(changed.identity, changed.input, changed.proof));
  // Both JSON sidecars, raw SHA and overlay now agree, but emitted JS still
  // contains the old browser identity. No server/Vite build is performed.
  const relabelled = { ...changed.identity, bundleFiles: old.identity.bundleFiles };
  assert.throws(() => verifyBuildSeal(relabelled, changed.input, { ...changed.proof,
    bundleFiles: old.proof.bundleFiles, bundleJavaScript: old.proof.bundleJavaScript }), /absent.*browser JavaScript/);
  assert.throws(() => verifyBuildSeal(changed.identity, changed.input, { ...changed.proof, overlayBytes: old.proof.overlayBytes }), /browser overlay/);
  assert.throws(() => verifyBuildSeal(changed.identity, changed.input, { ...changed.proof, inputBytes: Buffer.concat([changed.proof.inputBytes, Buffer.from(' ')]) }), /build-input bytes/);
  const metadata = { ...changed.identity, snapshot: '/different/valid/snapshot' };
  assert.throws(() => verifyBuildSeal(metadata, changed.input, changed.proof), /build metadata/);
});
test('verified source/helper/config/weather/transforms/dependencies must belong to the same sealed branch', () => {
  const fixture = sealedFixture(); assert.doesNotThrow(() => verifyBuildInputs(fixture.identity, fixture.verified));
  assert.throws(() => verifyBuildInputs(fixture.identity, { ...fixture.verified,
    source: { ...fixture.verified.source, snapshotId: sha256('another verified source') } }), /sourceSnapshotId/);
  assert.throws(() => verifyBuildInputs(fixture.identity, { ...fixture.verified,
    helper: { ...fixture.verified.helper, sha256: sha256('another verified helper') } }), /helper branch/);
  assert.throws(() => verifyBuildInputs(fixture.identity, { ...fixture.verified,
    helper: { ...fixture.verified.helper, files: { 'startup-observer.mjs': sha256('another observer') } } }), /helper branch/);
  const otherClock = bytes({ schemaVersion: 1, scenarioEpochUTC: 1001, armAtUTC: 2000 });
  assert.throws(() => verifyBuildInputs(fixture.identity, { ...fixture.verified, clockBytes: otherClock }), /config bytes/);
  const otherWeather = weatherFixture(bytes({ ...recorded(), wind: 0.95 })).specification;
  assert.throws(() => verifyBuildInputs(fixture.identity, { ...fixture.verified, weather: otherWeather }), /weather\/transform/);
  assert.throws(() => verifyBuildInputs(fixture.identity, { ...fixture.verified, weather: undefined }), /weather\/transform/);
  assert.throws(() => verifyBuildInputs(fixture.identity, { ...fixture.verified,
    transforms: { ...fixture.verified.transforms, loading: { variant: 'translucent' } } }), /weather\/transform/);
  assert.throws(() => verifyBuildInputs(fixture.identity, { ...fixture.verified,
    dependencies: { 'selected.js': sha256('another actual dependency') } }), /dependency/);
  const alternate = sealedFixture({ weather: otherWeather });
  assert.doesNotThrow(() => verifyBuildInputs(alternate.identity, { ...alternate.verified, weather: otherWeather }));
  assert.throws(() => verifyBuildSeal(alternate.identity, fixture.input, alternate.proof), /digest/);
});
test('seal refuses mismatched actual JavaScript bytes/hashes and source proof metadata', () => {
  const fixture = sealedFixture(), file = Object.keys(fixture.proof.bundleJavaScript)[0];
  assert.throws(() => verifyBuildSeal(fixture.identity, fixture.input, { ...fixture.proof,
    bundleJavaScript: { [file]: Buffer.from('different bytes') } }), /JavaScript differs/);
  assert.throws(() => verifyBuildSeal(fixture.identity, fixture.input, { ...fixture.proof,
    bundleFiles: { [file]: sha256('different bytes') } }), /Immutable/);
  assert.throws(() => verifyBuildSeal(fixture.identity, fixture.input, { ...fixture.proof, bundleJavaScript: {} }), /absent/);
  const modified = { ...fixture.identity, sourceFiles: 2 };
  assert.throws(() => verifyBuildInputs(modified, fixture.verified), /proof fields/);
});
