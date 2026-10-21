import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformUI, transformLoading, START_MARKER, UI_IMPORT, sha256, inside, verifySnapshot, directoryHashes, helperIdentity, previewPort } from './common.mjs';
import { observeOperation } from './startup-observer.mjs';
import { createAttemptQueue } from './attempt-queue.mjs';
import { authorizeReceiptRequest, validateReceipt, saveReceipt, MAX_RECEIPT_BYTES } from './receipt.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../../..');
const identity = { buildId: 'test-build', sourceSnapshotId: 'test-source', helperSha256: 'test-helper' };
const startup = () => ({ schemaVersion: 1, ...identity, attemptId: '8e9e7e15-6011-438d-96a2-53be43f17792', kind: 'startup', mode: 'plain',
  atMs: 12, timeOrigin: 1000, observerErrors: [], samples: [], terminal: { ready: false }, outcome: 'rejected', error: { message: 'real failure fixture' } });
async function withFixture(run) {
  const fixture = await mkdtemp(join(directory, '.helper-test-'));
  try { return await run(fixture); }
  finally {
    // Every recursive cleanup is confined to this test's exclusive directory.
    const safe = inside(directory, fixture);
    assert.ok(safe.startsWith(join(directory, '.helper-test-')));
    await rm(safe, { recursive: true, force: true });
  }
}
test('actual UI transform is exact once, retains outer catch/dispose and original input bytes', async () => {
  const original = await readFile(join(root, 'client/ui.tsx'), 'utf8'), before = sha256(original);
  const transformed = transformUI(original);
  assert.equal(transformed.split('await observeStartup(g, startupCanvas, () => g.start());').length, 2);
  assert.equal(transformed.slice(UI_IMPORT.length).replace('        await observeStartup(g, startupCanvas, () => g.start());', START_MARKER), original.replaceAll('\r\n', '\n'));
  assert.ok(transformed.includes('game.current?.dispose();'));
  assert.equal(sha256(original), before);
  assert.throws(() => transformUI(transformed));
  assert.throws(() => transformUI('no marker'));
  assert.throws(() => transformUI(START_MARKER + '\n' + START_MARKER));
  assert.throws(() => transformUI(original.replace(START_MARKER, '        await g.start(1);')));
});
test('loading experiment changes exactly one declaration, original is byte identical, drift fails', async () => {
  const source = await readFile(join(root, 'client/style.css'), 'utf8');
  assert.equal(transformLoading(source), source);
  const changed = transformLoading(source, 'translucent');
  assert.equal(changed.replace('  background: rgba(239,243,230,.96);', '  background: #eff3e6;'), source);
  assert.throws(() => transformLoading(source, 'unrecognized'));
  assert.throws(() => transformLoading(changed, 'translucent'));
  assert.throws(() => transformLoading(source + '\n.loading {\n  background: #eff3e6;\n}'));
});
test('startup terminal capture precedes original UI teardown and keeps the same thrown object', async () => {
  const error = new Error('startup timeout fixture'), events = [];
  try {
    await observeOperation(async () => { events.push('start'); throw error; }, {
      onBegin: () => events.push('begin'), onTerminal: (outcome, received) => { assert.equal(received, error); events.push(outcome); },
    });
    assert.fail('must reject');
  } catch (received) { assert.equal(received, error); events.push('outer UI dispose'); }
  assert.deepEqual(events, ['begin', 'start', 'rejected', 'outer UI dispose']);
});
test('observer faults never replace startup failure/success and operation is called once', async () => {
  const original = new Error('original'), seen = [];
  const options = { onBegin() { throw new Error('begin observer'); }, onTerminal() { throw new Error('terminal observer'); }, onObserverError: error => seen.push(error.message) };
  let calls = 0;
  assert.equal(await observeOperation(async () => { calls++; return 42; }, options), 42);
  await assert.rejects(observeOperation(() => { calls++; throw original; }, options), error => error === original);
  assert.equal(calls, 2); assert.equal(seen.length, 4);
});
test('receipt keeps rejected startup evidence, repeated bytes are idempotent and conflict preserves original', () => withFixture(async fixture => {
  const bytes = Buffer.from(JSON.stringify(startup()));
  const first = await saveReceipt(fixture, bytes, identity), repeat = await saveReceipt(fixture, bytes, identity);
  assert.equal(first.persisted, true); assert.equal(first.repeated, false); assert.equal(repeat.repeated, true);
  assert.equal(first.sha256, sha256(bytes));
  const concurrent = await Promise.all(Array.from({ length: 3 }, () => saveReceipt(fixture, bytes, identity)));
  assert.equal(concurrent.every(value => value.repeated), true);
  const path = join(fixture, startup().attemptId + '.json');
  assert.deepEqual(await readFile(path), bytes);
  await assert.rejects(saveReceipt(fixture, Buffer.from(JSON.stringify({ ...startup(), outcome: 'resolved' })), identity), /conflict/);
  assert.deepEqual(await readFile(path), bytes);
}));
test('same-origin loopback POST, identity, array and byte bounds are enforced', async () => {
  const origin = 'http://127.0.0.1:4211';
  const req = { socket: { remoteAddress: '127.0.0.1' }, method: 'POST', headers: { host: '127.0.0.1:4211', origin, 'content-type': 'application/json' } };
  assert.equal(authorizeReceiptRequest(req, origin), true);
  for (const altered of [
    { ...req, method: 'GET' }, { ...req, socket: { remoteAddress: '10.0.0.1' } },
    { ...req, headers: { ...req.headers, origin: 'https://evil.example' } },
    { ...req, headers: { ...req.headers, host: 'evil.example' } },
  ]) assert.equal(authorizeReceiptRequest(altered, origin), false);
  assert.throws(() => validateReceipt({ ...startup(), buildId: 'wrong' }, identity));
  assert.throws(() => validateReceipt({ ...startup(), attemptId: '../outside' }, identity));
  assert.throws(() => validateReceipt({ ...startup(), samples: Array(182).fill({}) }, identity));
  assert.throws(() => validateReceipt({ ...startup(), observerErrors: Array(17).fill({}) }, identity));
  const benchmark = { ...startup(), kind: 'benchmark', completed: false, before: {}, after: {}, rawGameFrameMs: [], rawRafFrameMs: [], validationErrors: ['failed'] };
  assert.equal(validateReceipt(benchmark, identity), benchmark);
  assert.throws(() => validateReceipt({ ...benchmark, rawRafFrameMs: [NaN] }, identity));
  await withFixture(fixture => assert.rejects(saveReceipt(fixture, Buffer.alloc(MAX_RECEIPT_BYTES + 1), identity), /too large/));
});
test('snapshot verifies all original files, rejects drift/path escape; bundle/helper hashes are real', () => withFixture(async fixture => {
  const source = join(fixture, 'source'); await mkdir(source);
  await writeFile(join(source, 'actual.txt'), 'original');
  const files = { 'actual.txt': sha256('original') }, manifest = { snapshotId: sha256(JSON.stringify(files)), files };
  await writeFile(join(source, 'source-manifest.json'), JSON.stringify(manifest));
  assert.deepEqual(await verifySnapshot(source), manifest);
  assert.equal((await directoryHashes(source))['actual.txt'], files['actual.txt']);
  await writeFile(join(source, 'actual.txt'), 'drift');
  await assert.rejects(verifySnapshot(source), /differs/);
  assert.throws(() => inside(source, join(source, '..', 'escape')));
  const helper = await helperIdentity(directory);
  assert.equal(helper.files['common.mjs'], sha256(await readFile(join(directory, 'common.mjs'))));
  assert.equal(helper.sha256, sha256(JSON.stringify(helper.files)));
}));
test('overlay forbids browser engine exposure, extra readiness/render and periodic dumps during interval', async () => {
  const source = await readFile(join(directory, 'qa-overlay.mjs'), 'utf8');
  assert.doesNotMatch(source, /window\.__|\.isReady\(|\.render\(/);
  const measurement = source.slice(source.indexOf('async function measure()'), source.indexOf("  action('Změřit"));
  assert.doesNotMatch(measurement, /setInterval\(/);
  assert.ok(measurement.includes('owner.startBenchmark()'));
  assert.ok(measurement.includes('ownedBenchmark = owner.benchmark; frames = ownedBenchmark.frames'));
  assert.ok(measurement.includes('requestAnimationFrame(tick)'));
});
const ack = bytes => ({ persisted: true, attemptId: JSON.parse(bytes).attemptId,
  bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) });
async function until(predicate) {
  for (let count = 0; count < 100; count++) {
    if (predicate()) return;
    await new Promise(setImmediate);
  }
  assert.fail('fixture condition did not settle');
}
test('immutable attempt queue keeps every pending/failed body until an exact ACK and supports retry', async () => {
  const sends = [], events = [], pending = [];
  const queue = createAttemptQueue({ digest: sha256,
    send: bytes => { sends.push(bytes); const deferred = Promise.withResolvers(); pending.push(deferred); return deferred.promise; },
    onChange: state => events.push(state) });
  const raw = { attemptId: 'one', kind: 'startup', ownerId: 'old owner', payload: 'original' };
  const first = queue.enqueue(raw); raw.payload = 'mutated caller';
  const second = queue.enqueue({ attemptId: 'two', kind: 'startup', ownerId: 'new owner' });
  assert.equal(queue.pendingCount, 2);
  assert.equal(JSON.parse(queue.retained()[0].bytes).payload, 'original');
  assert.throws(() => queue.enqueue({ ...raw }), /conflict/);
  await until(() => pending.length === 2);
  pending[0].reject(new Error('offline fixture'));
  assert.equal((await first).acknowledged, false);
  assert.equal(queue.pendingCount, 2);
  pending[1].resolve(ack(sends[1])); await second;
  assert.equal(queue.pendingCount, 1);
  const retried = queue.retry('one'); await until(() => pending.length === 3);
  assert.equal(sends[0], sends[2]); pending[2].resolve({ ...ack(sends[2]), attemptId: 'wrong attempt' });
  assert.equal((await retried).acknowledged, false); assert.equal(queue.pendingCount, 1);
  const final = queue.retry('one'); await until(() => pending.length === 4);
  pending[3].resolve(ack(sends[3])); assert.equal((await final).acknowledged, true);
  assert.equal(queue.pendingCount, 0);
  assert.equal(events.filter(value => value.state === 'acknowledged').length, 2);
});
test('explicit preview port validation and derived origin authorization preserve immutable baseline ports', () => {
  assert.equal(previewPort(), 4211); assert.equal(previewPort('4213'), 4213);
  for (const value of ['0', '80', '2596', '65536', '4213x', '04213', 'http://localhost:4213', 4213])
    assert.throws(() => previewPort(value));
  const request = { socket: { remoteAddress: '127.0.0.1' }, method: 'POST',
    headers: { host: '127.0.0.1:4213', origin: 'http://127.0.0.1:4213', 'content-type': 'application/json' } };
  assert.equal(authorizeReceiptRequest(request, 'http://127.0.0.1:4213'), true);
  assert.equal(authorizeReceiptRequest(request, 'http://127.0.0.1:4211'), false);
});

async function browserFixture(run, transport = async bytes => ack(bytes)) {
  class Element {
    children = []; textContent = ''; style = {}; hidden = false;
    append(...children) { this.children.push(...children); for (const child of children) child.parent = this; }
    setAttribute() {}
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  }
  const body = new Element(), browserWindow = new EventTarget(), browserDocument = new EventTarget(), posted = [], created = new Set(), revoked = new Set(), raf = new Map();
  const games = []; let rafSequence = 0;
  const OriginalURL = URL;
  class FixtureURL extends OriginalURL {
    static createObjectURL(blob) { const value = OriginalURL.createObjectURL(blob); created.add(value); return value; }
    static revokeObjectURL(value) { revoked.add(value); OriginalURL.revokeObjectURL(value); }
  }
  Object.assign(browserDocument, { body, visibilityState: 'visible', hasFocus: () => true, createElement: () => new Element() });
  const globals = { document: browserDocument, window: browserWindow, location: { hostname: '127.0.0.1', search: '' },
    navigator: { userAgent: 'Test fixture; no browser or GPU' }, innerWidth: 100, innerHeight: 100, devicePixelRatio: 1,
    URL: FixtureURL, requestAnimationFrame: callback => { const id = ++rafSequence; raf.set(id, callback); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    fetch: async (_url, options) => { posted.push(JSON.parse(options.body)); return { ok: true, json: async () => transport(options.body) }; } };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    let source = await readFile(join(directory, 'qa-overlay.mjs'), 'utf8');
    source = source.replace("'virtual:webgpu-completion-observer'", JSON.stringify(pathToFileURL(join(directory, 'startup-observer.mjs')).href));
    source = source.replace("'virtual:webgpu-completion-attempts'", JSON.stringify(pathToFileURL(join(directory, 'attempt-queue.mjs')).href));
    source = source.replace('__WEBGPU_COMPLETION_IDENTITY__', JSON.stringify(identity));
    source += '\nexport { weatherSnapshot, benchmarkSnapshot };\n// Unique DOM fixture ' + crypto.randomUUID();
    const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const all = () => {
      const list = [];
      const walk = node => { list.push(node); node.children.forEach(walk); }; walk(body); return list;
    };
    const makeGame = () => {
      const disposal = new Set();
      const game = {
        ready: false, disposed: false, avatars: new Map(), adaptive: { state: {} }, gpu: {}, renderErrorCount: 0, assetLoadErrorCount: 0,
        engine: { isWebGPU: true, compatibilityMode: true, getRenderWidth: () => 100, getRenderHeight: () => 100, getHardwareScalingLevel: () => 1 },
        renderHealth: { snapshot: () => ({ phase: game.ready ? 'ready' : 'preparing', valid: game.ready && !game.disposed, rendererId: 1, generation: 1, pendingOperations: 0 }) },
        compilationProfile: { snapshot: () => ({ active: true, metrics: {} }) },
        scene: { meshes: [], materials: [], geometries: [], getActiveMeshes: () => [], getWaitingItemsCount: () => 0,
          onDisposeObservable: { addOnce: callback => { disposal.add(callback); return { remove: () => disposal.delete(callback) }; } } },
        camera: { globalPosition: {}, getViewMatrix: () => ({ m: [] }), getProjectionMatrix: () => ({ m: [] }) },
        trafficInstant: () => 0, startBenchmark: () => false,
        dispose() { game.disposed = true; game.ready = false; for (const callback of disposal) callback(); disposal.clear(); },
      };
      games.push(game); return game;
    };
    await run({ ...module, body, all, makeGame, posted, created, revoked, raf,
      output: () => all().find(value => value.id === 'webgpu-completion-export'),
      measureButton: () => all().find(value => value.textContent.startsWith('Změřit 10 s')) });
  } finally {
    games.forEach(game => game.dispose());
    browserWindow.dispatchEvent(new Event('pagehide'));
    for (const url of created) OriginalURL.revokeObjectURL(url);
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
test('actual overlay failure produces terminal export before teardown using a DOM/transport fixture, no engine', () => browserFixture(async context => {
    const game = context.makeGame();
    const error = new Error('actual startup rejection fixture');
    await assert.rejects(context.observeStartup(game, { dataset: { bootStage: 'light-preparation' } }, async () => { throw error; }), received => received === error);
    assert.equal(JSON.parse(context.output().textContent).error.message, error.message);
    await until(() => context.posted.length === 1);
    assert.equal(context.posted[0].outcome, 'rejected');
    assert.equal(context.posted[0].terminal.stages.bootStage, 'light-preparation');
    assert.equal(context.posted[0].samples.length, 1);
    assert.equal(context.posted[0].observerErrors.length, 0);
}));
test('delayed/failed startup ACK blocks measurement and pending downloads survive rejoin unchanged', async () => {
  const requests = [];
  await browserFixture(async context => {
    const game = context.makeGame();
    await context.observeStartup(game, { dataset: {} }, async () => { game.ready = true; });
    assert.equal(context.measureButton().disabled, true);
    await context.measureButton().onclick();
    assert.equal(context.posted.filter(value => value.kind === 'benchmark').length, 0);
    await until(() => requests.length === 1);
    const host = context.all().find(value => value.id === 'webgpu-completion-pending');
    const firstLink = host.children[1].children[0], firstURL = firstLink.href;
    const other = context.makeGame();
    await context.observeStartup(other, { dataset: {} }, async () => { other.ready = true; });
    await until(() => requests.length === 2);
    assert.equal(context.revoked.has(firstURL), false);
    assert.equal(host.children.length, 3);
    requests[0].deferred.reject(new Error('network offline fixture'));
    requests[1].deferred.resolve(ack(requests[1].bytes));
    await until(() => host.children.length === 2 && host.children[1].children[1].textContent.includes('failed'));
    assert.equal(context.measureButton().disabled, true);
    assert.equal(context.revoked.has(firstURL), false);
    await host.children[1].children[2].onclick();
    await until(() => requests.length === 3);
    assert.equal(requests[0].bytes, requests[2].bytes);
    requests[2].deferred.resolve(ack(requests[2].bytes));
    await until(() => context.measureButton().disabled === false);
    assert.equal(context.revoked.has(firstURL), true);
  }, bytes => { const deferred = Promise.withResolvers(); requests.push({ bytes, deferred }); return deferred.promise; });
});
test('refused, thrown and disposed benchmark attempts preserve raw failure despite cleanup errors', async () => {
  for (const scenario of ['refused', 'thrown', 'thrown-after-allocation', 'disposed']) await browserFixture(async context => {
    const game = context.makeGame();
    await context.observeStartup(game, { dataset: {} }, async () => { game.ready = true; });
    await until(() => context.measureButton().disabled === false);
    const originalCallback = () => {}; game.onBenchmark = originalCallback;
    game.startBenchmark = () => {
      if (scenario === 'refused') return false;
      if (scenario === 'thrown') throw new Error('start throw fixture');
      game.benchmark = { frames: [], profile: { dispose() { throw new Error('cleanup throw fixture'); } } };
      if (scenario === 'thrown-after-allocation') throw new Error('start throw after allocation fixture');
      setImmediate(() => game.dispose()); return true;
    };
    await context.measureButton().onclick();
    const raw = context.posted.find(value => value.kind === 'benchmark');
    assert.ok(raw); assert.equal(raw.completed, false); assert.deepEqual(raw.rawGameFrameMs, []);
    assert.match(raw.failure.message, scenario === 'refused' ? /refused/ : scenario.startsWith('thrown') ? /start throw/ : /disposed/);
    if (scenario === 'disposed' || scenario === 'thrown-after-allocation') assert.match(raw.cleanupError.message, /cleanup throw fixture/);
    assert.equal(game.onBenchmark, originalCallback); assert.equal(game.benchmark, undefined); assert.equal(context.raf.size, 0);
  });
});
test('weather arrays/layers, precipitation and independent benchmark start/end snapshots are retained', () => browserFixture(async context => {
  const weather = { temperature: 3, cloudLayers: { low: 0.1, mid: 0.2, high: 0.3 },
    cloudWinds: { low: { speed: 1, direction: 10 }, mid: { speed: 2, direction: 20 }, high: { speed: 3, direction: 30 } },
    humidity: 78, snowfall: 0.5, precipitationType: 'snow', source: 'Explicit test weather fixture' };
  const game = context.makeGame(); game.weather = weather;
  await context.observeStartup(game, { dataset: {} }, async () => { game.ready = true; });
  const raw = JSON.parse(context.output().textContent);
  assert.deepEqual(raw.terminal.weather, weather);
  const end = { ...weather, humidity: 79 }, benchmark = context.benchmarkSnapshot({ weatherAtStart: weather, weatherAtEnd: end });
  assert.deepEqual(benchmark.weatherAtStart, weather); assert.deepEqual(benchmark.weatherAtEnd, end);
  weather.cloudWinds.low.speed = 99;
  assert.equal(benchmark.weatherAtStart.cloudWinds.low.speed, 1);
}));
