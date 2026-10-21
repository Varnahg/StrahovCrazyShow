import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformUI, transformLoading, START_MARKER, UI_IMPORT, sha256, inside, verifySnapshot, directoryHashes, helperIdentity, previewPort } from './common.mjs';
import { observeOperation } from './startup-observer.mjs';
import { createAttemptQueue } from './attempt-queue.mjs';
import ts from 'typescript';
import { authorizeReceiptRequest, validateReceipt, saveReceipt, MAX_RECEIPT_BYTES } from './receipt.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../../..');
const temporaryRoot = join(root, '.cache/webgpu-completion-lifecycle-controls-20261021');
const identity = { buildId: 'test-build', sourceSnapshotId: 'test-source', helperSha256: 'test-helper', lifecycleControls: false };
const startup = () => ({ schemaVersion: 1, ...identity, attemptId: '8e9e7e15-6011-438d-96a2-53be43f17792', kind: 'startup', mode: 'plain',
  atMs: 12, timeOrigin: 1000, observerErrors: [], samples: [], terminal: { ready: false }, outcome: 'rejected', error: { message: 'real failure fixture' } });
async function withFixture(run) {
  await mkdir(temporaryRoot, { recursive: true });
  const fixture = await mkdtemp(join(temporaryRoot, 'helper-test-'));
  try { return await run(fixture); }
  finally {
    // Every recursive cleanup is confined to this test's exclusive directory.
    const safe = inside(temporaryRoot, fixture);
    assert.ok(safe.startsWith(join(temporaryRoot, 'helper-test-')));
    await rm(safe, { recursive: true, force: true });
  }
}
test('actual UI transform is exact once, retains outer catch/dispose and original input bytes', async () => {
  const original = await readFile(join(root, 'client/ui.tsx'), 'utf8'), before = sha256(original);
  const transformed = transformUI(original);
  assert.equal(transformed.split('await observeStartup(g, startupCanvas, () => g.start());').length, 2);
  assert.equal(transformed.slice(UI_IMPORT.length).replace('        await observeStartup(g, startupCanvas, () => g.start());', START_MARKER), original.replaceAll('\r\n', '\n'));
  // The full reverse-transform equality above retains current UI ownership
  // cleanup verbatim, including its disposeOwnedGame refactor.
  assert.equal(sha256(await readFile(join(root, 'client/ui.tsx'))), before, 'actual UI bytes still match immediately before TSX parse');
  assert.equal(ts.createSourceFile('qa-ui.tsx', transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0);
  assert.equal(sha256(await readFile(join(root, 'client/ui.tsx'))), before, 'actual UI bytes still match after TSX parse');
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
  const measurement = source.slice(source.indexOf('async function measure('), source.indexOf("  action('Změřit"));
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

async function browserFixture(run, transport = async bytes => ack(bytes), browserIdentity = identity, search = '') {
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
  const globals = { document: browserDocument, window: browserWindow, location: { hostname: '127.0.0.1', search },
    navigator: { userAgent: 'Test fixture; no browser or GPU' }, innerWidth: 100, innerHeight: 100, devicePixelRatio: 1,
    URL: FixtureURL, requestAnimationFrame: callback => { const id = ++rafSequence; raf.set(id, callback); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    fetch: async (_url, options) => { posted.push(JSON.parse(options.body)); return { ok: true, json: async () => transport(options.body) }; } };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    const adapterSource = `import {installBrowserClock as actual} from ${JSON.stringify(pathToFileURL(join(directory, 'browser-clock.mjs')).href)};
      export class FixtureSimulation { tick(time) { return time; } }
      let deferredImport;
      export function deferSimulationImport() { deferredImport = Promise.withResolvers(); return deferredImport; }
      export const installBrowserClock = (game, specification, dependencies = {}) => actual(game, specification,
        {...dependencies, loadSimulation: () => { const pending = deferredImport; deferredImport = undefined;
          return pending ? pending.promise : Promise.resolve({Simulation: FixtureSimulation}); }});\n// ${crypto.randomUUID()}`;
    const adapterURL = 'data:text/javascript;base64,' + Buffer.from(adapterSource).toString('base64');
    const { FixtureSimulation, deferSimulationImport } = await import(adapterURL);
    let source = await readFile(join(directory, 'qa-overlay.mjs'), 'utf8');
    source = source.replace("'virtual:webgpu-completion-observer'", JSON.stringify(pathToFileURL(join(directory, 'startup-observer.mjs')).href));
    source = source.replace("'virtual:webgpu-completion-attempts'", JSON.stringify(pathToFileURL(join(directory, 'attempt-queue.mjs')).href));
    source = source.replace("'virtual:webgpu-completion-browser-clock'", JSON.stringify(adapterURL));
    source = source.replace("'virtual:webgpu-completion-clock'", JSON.stringify(pathToFileURL(join(directory, 'transit-clock.mjs')).href));
    source = source.replace("'virtual:webgpu-completion-startup-latency'", JSON.stringify(pathToFileURL(join(directory, 'startup-latency.mjs')).href));
    source = source.replace("'virtual:webgpu-completion-shader-attribution'", JSON.stringify(pathToFileURL(join(directory, 'shader-attribution.mjs')).href));
    source = source.replace("'virtual:webgpu-completion-routine-cost'", JSON.stringify(pathToFileURL(join(directory, 'routine-cost.mjs')).href));
    source = source.replace("'virtual:webgpu-completion-buffer-lifecycle'", JSON.stringify(pathToFileURL(join(directory, 'buffer-lifecycle.mjs')).href));
    source = source.replace("'virtual:webgpu-completion-lifecycle-controls'", JSON.stringify(pathToFileURL(join(directory, 'lifecycle-controls.mjs')).href));
    source = source.replace('__WEBGPU_COMPLETION_IDENTITY__', JSON.stringify(browserIdentity));
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
        renderHealth: { snapshot: () => ({ phase: game.ready ? 'ready' : 'preparing', valid: game.ready && !game.disposed, rendererId: 1, generation: 1, pendingOperations: 0, errorCount: 0 }) },
        compilationProfile: { snapshot: () => ({ active: true, metrics: {} }) },
        scene: { meshes: [], materials: [], geometries: [], getActiveMeshes: () => [], getWaitingItemsCount: () => 0,
          onDisposeObservable: { addOnce: callback => { disposal.add(callback); return { remove: () => disposal.delete(callback) }; } } },
        camera: { globalPosition: {}, getViewMatrix: () => ({ m: [] }), getProjectionMatrix: () => ({ m: [] }) },
        trafficInstant: () => 0, startBenchmark: () => false,
        dispose() { game.disposed = true; game.ready = false; for (const callback of disposal) callback(); disposal.clear(); },
      };
      games.push(game); return game;
    };
    await run({ ...module, FixtureSimulation, deferSimulationImport, body, all, makeGame, posted, created, revoked, raf,
      output: () => all().find(value => value.id === 'webgpu-completion-export'),
      measureButton: () => all().find(value => value.textContent.startsWith('Změřit 10 s')) });
  } finally {
    games.forEach(game => game.dispose());
    // Crypto/transport is deliberately async. Keep this fixture's realm alive
    // until its exact ACKs, rather than letting its pending fetch enter the
    // next test's temporary globals and look like another owner's receipt.
    await until(() => body.children.filter(value => value.id === 'webgpu-completion-pending').every(value => value.hidden));
    browserWindow.dispatchEvent(new Event('pagehide'));
    for (const url of created) OriginalURL.revokeObjectURL(url);
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
test('lifecycle controls default-off cannot be activated by a query and never inspect the device', () => browserFixture(async context => {
  const game = context.makeGame(); let reads = 0;
  Object.defineProperty(game.engine, '_device', { get() { reads++; throw new Error('default-off device read'); } });
  await context.observeStartup(game, { dataset: {} }, async () => { game.ready = true; });
  await until(() => context.posted.length === 1);
  assert.equal(reads, 0); assert.equal(context.posted[0].mode, 'plain');
  assert.equal(context.all().some(value => value.href === 'about:blank' || value.textContent.includes('zničit zařízení')), false);
}, async value => ack(value), identity, '?lifecycleControls=1&lifecycle-controls=1'));
test('explicit lifecycle DOM action is one-shot and preserves original native loss handling and immutable action transfer', () => browserFixture(async context => {
  const game = context.makeGame(), lost = Promise.withResolvers(); let calls = 0;
  game.startupAbort = new AbortController(); game.scene.getEngine = () => game.engine;
  const device = { lost: lost.promise, destroy() { assert.equal(this, device); calls++; lost.resolve(); } }; game.engine._device = device;
  // Terminal native-loss IO only: original product behavior is not implemented
  // by the QA module and requires the separate root browser/GPU acceptance.
  const originalLoss = lost.promise.then(() => game.dispose());
  await context.observeStartup(game, { dataset: {} }, async () => { game.ready = true; });
  await until(() => context.posted.length === 1);
  const anchor = context.all().find(value => value.href === 'about:blank');
  assert.equal(anchor.target, '_blank'); assert.equal(anchor.rel, 'noopener'); assert.equal(anchor.onclick, undefined);
  const button = context.all().find(value => value.textContent === 'Diagnostic · zničit zařízení této testovací hry');
  assert.equal(button.disabled, false);
  game.startupPresentationLease = {}; await button.onclick(); assert.equal(calls, 0, 'actual pending startup handoff refuses destruction');
  game.startupPresentationLease = undefined; await button.onclick(); assert.equal(calls, 1, 'owned ready idle device was actually called'); await originalLoss;
  await until(() => context.posted.some(value => value.lifecycleControl));
  const raw = context.posted.find(value => value.lifecycleControl), bytes = JSON.stringify(raw);
  assert.equal(raw.mode, 'diagnostic'); assert.equal(raw.lifecycleControls, true);
  assert.deepEqual(raw.lifecycleControl, { action: 'destroy-own-device', attempted: true, outcome: 'returned', rendererId: 1, generation: 1 });
  assert.equal(game.disposed, true); assert.equal(button.disabled, true); await button.onclick(); assert.equal(calls, 1);
  const fresh = context.makeGame(); await context.observeStartup(fresh, { dataset: {} }, async () => { fresh.ready = true; });
  await button.onclick(); assert.equal(calls, 1); assert.equal(JSON.stringify(raw), bytes);
}, async value => ack(value), { ...identity, lifecycleControls: true }));
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
    assert.equal(context.posted[0].mode, 'plain'); assert.equal(context.posted[0].startupLatency, null);
}));

test('buffer overlay persists distinct immutable raw before original fatal cleanup and keeps the original error', () => browserFixture(async context => {
  const { WebGPUBufferManager }=await import('@babylonjs/core/Engines/WebGPU/webgpuBufferManager.js');
  const { Observable }=await import('@babylonjs/core/Misc/observable.js');
  const game=context.makeGame(),engine=game.engine,primary=new Error('unchanged original GPU handler error');
  const device={createBuffer:descriptor=>({...descriptor,destroy(){}})};
  engine._isWebGPU=true;engine.uniqueId=3;engine._device=device;engine._bufferManager=new WebGPUBufferManager(engine,device);
  game.scene._engine=engine;game.scene.onNewMeshAddedObservable=new Observable();game.renderHealth.generation=1;
  const original=function(message){assert.equal(this,game);assert.equal(message,'Buffer BabylonWebGPUDevice3_DataBufferUniqueId='+db.uniqueId+'_CopyDst_Vertex_Storage_size2048 used in submit while destroyed.');
    const captured=JSON.parse(context.output().textContent);assert.equal(captured.kind,'buffer-lifecycle');assert.equal(captured.bufferTrace.reason,'renderer-failure');assert.equal(captured.bufferTrace.target.dataBufferID,db.uniqueId);
    game.dispose();throw primary;};game.handleRendererFailure=original;
  await context.observeStartup(game,{dataset:{}},async()=>{game.ready=true;});
  const db=engine._bufferManager.createBuffer(2048,168);assert.ok(context.all().some(value=>value.textContent.includes('buffer owner/reallocation/release/destroy')));
  assert.throws(()=>game.handleRendererFailure('Buffer BabylonWebGPUDevice3_DataBufferUniqueId='+db.uniqueId+'_CopyDst_Vertex_Storage_size2048 used in submit while destroyed.'),error=>error===primary);
  await until(()=>context.posted.some(raw=>raw.kind==='buffer-lifecycle'));
  const raws=context.posted.filter(raw=>raw.kind==='buffer-lifecycle');assert.equal(raws.length,1);assert.equal(raws[0].mode,'diagnostic');assert.equal(raws[0].bufferLifecycle,true);
  assert.equal(raws[0].bufferTrace.target.ownerObserved,false);assert.equal(game.handleRendererFailure,original);assert.equal(game.disposed,true);
  const bytes=JSON.stringify(raws[0]);engine._bufferManager.releaseBuffer(db);engine._bufferManager.destroyDeferredBuffers();assert.equal(JSON.stringify(raws[0]),bytes);
},async value=>ack(value),{...identity,bufferLifecycle:true}));

test('buffer overlay retains startup-rejected trace before the existing outer UI catch and dispose',()=>browserFixture(async context=>{
  const { WebGPUBufferManager }=await import('@babylonjs/core/Engines/WebGPU/webgpuBufferManager.js');
  const { Observable }=await import('@babylonjs/core/Misc/observable.js');
  const game=context.makeGame(),engine=game.engine,primary=new Error('same original startup rejection'),device={createBuffer:descriptor=>({...descriptor,destroy(){}})};
  engine._isWebGPU=true;engine.uniqueId=4;engine._device=device;engine._bufferManager=new WebGPUBufferManager(engine,device);game.scene._engine=engine;game.scene.onNewMeshAddedObservable=new Observable();
  await assert.rejects(context.observeStartup(game,{dataset:{}},()=>{engine._bufferManager.createBuffer(2048,168);throw primary;}),error=>error===primary);
  assert.equal(game.disposed,false);game.dispose();await until(()=>context.posted.some(raw=>raw.kind==='buffer-lifecycle'));
  const raw=context.posted.find(raw=>raw.kind==='buffer-lifecycle');assert.equal(raw.bufferTrace.reason,'startup-rejected');assert.equal(raw.bufferTrace.resources.length,1);assert.equal(context.posted.filter(value=>value.kind==='buffer-lifecycle').length,1);
},async value=>ack(value),{...identity,bufferLifecycle:true}));

test('routine diagnostic defaultoff has no action; explicit flag is visible and retains rejected actual-scene attempt', async () => {
  await browserFixture(async context => {
    const game = context.makeGame(); await context.observeStartup(game, { dataset: {} }, async () => { game.ready = true; });
    assert.equal(context.all().some(value => value.textContent.startsWith('Diagnostic ·8 skutečných')), false);
  });
  await browserFixture(async context => {
    const game = context.makeGame(); await context.observeStartup(game, { dataset: {} }, async () => { game.ready = true; });
    await until(() => context.measureButton().disabled === false);
    const button = context.all().find(value => value.textContent.startsWith('Diagnostic ·8 skutečných'));
    assert.ok(button); await button.onclick();
    await until(() => context.posted.some(value => value.kind === 'routine-cost'));
    const raw = context.posted.find(value => value.kind === 'routine-cost');
    assert.equal(raw.mode, 'diagnostic'); assert.equal(raw.routineCost, true); assert.equal(raw.completed, false);
    assert.match(raw.failure.message, /actual Game scene/); assert.equal(raw.routineProfile, null);
    assert.equal(raw.validationErrors.length, 1);
  }, async value => ack(value), { ...identity, routineCost: true });
});

test('explicit routine UI action exports actual native scene8-frame diagnostic through immutable receipt queue', () => browserFixture(async context => {
  const { NullEngine } = await import('@babylonjs/core/Engines/nullEngine.js');
  const { Scene } = await import('@babylonjs/core/scene.js');
  const { FreeCamera } = await import('@babylonjs/core/Cameras/freeCamera.js');
  const { Vector3 } = await import('@babylonjs/core/Maths/math.vector.js');
  const engine = new NullEngine(), scene = new Scene(engine); new FreeCamera('CPU-only actual UI capture', new Vector3(0, 0, -8), scene);
  try {
    const game = context.makeGame(); game.scene = scene; game.engine = engine;
    await context.observeStartup(game, { dataset: {} }, async () => { game.ready = true; });
    await until(() => context.measureButton().disabled === false);
    const button = context.all().find(value => value.textContent.startsWith('Diagnostic ·8 skutečných'));
    const attempt = button.onclick(); for (let i = 0; i < 8; i++) scene.render(); await attempt;
    await until(() => context.posted.some(value => value.kind === 'routine-cost'));
    const raw = context.posted.find(value => value.kind === 'routine-cost');
    assert.equal(raw.mode, 'diagnostic'); assert.equal(raw.completed, true); assert.equal(raw.routineProfile.frames.length, 8);
    assert.equal(raw.routineProfile.remainingRoutineHooks, 0); assert.equal(Object.hasOwn(scene, 'render'), false);
    assert.deepEqual(raw.validationErrors, []); assert.ok(raw.before.ready && raw.after.ready);
  } finally { scene.dispose(); engine.dispose(); }
}, async value => ack(value), { ...identity, routineCost: true }));
test('diagnostic overlay observes original startup calls and restores before failure receipt without replacing primary error', () => browserFixture(async context => {
  const game = context.makeGame(), primary = new Error('same startup failure');
  const pending = Promise.withResolvers(), scope = () => pending.promise, fence = () => Promise.resolve();
  const queue = { onSubmittedWorkDone: fence }, device = { queue, popErrorScope: scope }; game.engine._device = device;
  await assert.rejects(context.observeStartup(game, { dataset: {} }, () => {
    assert.equal(device.popErrorScope(), pending.promise);
    queue.onSubmittedWorkDone(); throw primary;
  }), error => error === primary);
  assert.equal(device.popErrorScope, scope); assert.equal(queue.onSubmittedWorkDone, fence);
  const raw = JSON.parse(context.output().textContent);
  assert.equal(raw.mode, 'diagnostic'); assert.equal(raw.startupLatency.active, false);
  assert.equal(raw.startupLatency.recordedCalls, 2); assert.equal(raw.startupLatency.channels[0].pending, 1);
  assert.equal(raw.error.message, primary.message); assert.equal(raw.observerErrors.length, 0);
  pending.resolve(null); await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(context.output().textContent), raw);
}, async value => ack(value), { ...identity, startupLatency: true }));
test('diagnostic latency stop during pending start and rejoin cannot release fresh device hooks or mutate old receipt', () => browserFixture(async context => {
  const old = context.makeGame(), fresh = context.makeGame();
  const pending = Promise.withResolvers(), oldStart = Promise.withResolvers(), freshStart = Promise.withResolvers();
  const scope = () => pending.promise, fence = () => Promise.resolve(), queue = { onSubmittedWorkDone: fence }, device = { queue, popErrorScope: scope };
  old.engine._device = fresh.engine._device = device;
  let oldStarted = false, freshStarted = false;
  const starting = context.observeStartup(old, { dataset: {} }, () => { oldStarted = true; device.popErrorScope(); return oldStart.promise; });
  await until(() => oldStarted);
  old.dispose(); assert.equal(device.popErrorScope, scope);
  let freshWrapper;
  const freshStarting = context.observeStartup(fresh, { dataset: {} }, () => {
    freshWrapper = device.popErrorScope; assert.notEqual(freshWrapper, scope);
    freshStarted = true; return freshStart.promise;
  });
  await until(() => freshStarted); oldStart.resolve(); await starting;
  assert.equal(device.popErrorScope, freshWrapper, 'late terminal must not remove fresh owner hook');
  fresh.ready = true; freshStart.resolve(); await freshStarting;
  await until(() => context.posted.length === 2);
  assert.equal(device.popErrorScope, scope); assert.equal(queue.onSubmittedWorkDone, fence);
  assert.equal(context.posted.every(value => value.mode === 'diagnostic'), true);
  assert.equal(context.posted.find(value => value.ownerId !== context.posted.at(-1).ownerId).startupLatency.active, false);
  pending.resolve(null);
}, async value => ack(value), { ...identity, startupLatency: true }));
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
test('clock overlay refuses Guest before its start and leaves Simulation unwrapped, retaining failed receipt', async () => {
  const config = { schemaVersion: 1, scenarioEpochUTC: 1000, armAtUTC: Date.now() + 100000 };
  const clockIdentity = { ...identity, clock: { config, configId: sha256(JSON.stringify(config)), configSha256: 'fixture', simulationSourceSha256: 'fixture' } };
  await browserFixture(async context => {
    const original = context.FixtureSimulation.prototype.tick, game = context.makeGame(); game.network = false;
    let starts = 0;
    await assert.rejects(context.observeStartup(game, { dataset: {} }, async () => { starts++; }), /guest/);
    await until(() => context.posted.length === 1);
    assert.equal(starts, 0); assert.equal(context.FixtureSimulation.prototype.tick, original);
    assert.equal(context.posted[0].outcome, 'rejected'); assert.equal(context.posted[0].clockConfigId, clockIdentity.clock.configId);
  }, async bytes => ack(bytes), clockIdentity);
});
test('clock planned button uses the actual adapter, then disposal preserves a failed attempt and restores hook', async () => {
  const config = { schemaVersion: 1, scenarioEpochUTC: 1000, armAtUTC: Date.now() + 100000,
    benchmarkAtUTC: Date.now() + 110000, latenessToleranceMs: 20 };
  const clockIdentity = { ...identity, clock: { config, configId: sha256(JSON.stringify(config)), configSha256: 'fixture', simulationSourceSha256: 'fixture' } };
  await browserFixture(async context => {
    const original = context.FixtureSimulation.prototype.tick, game = context.makeGame(); game.network = true;
    await context.observeStartup(game, { dataset: {} }, async () => {
      game.sim = new context.FixtureSimulation(); game.sim.tick(Date.now()); game.trafficInstant(); game.ready = true;
    });
    await until(() => context.measureButton().disabled === false);
    const startup = context.posted[0];
    assert.equal(startup.terminal.transitClock.actualSimulationMatches, true);
    assert.equal(startup.terminal.transitClock.physics.calls, 1); assert.equal(startup.terminal.transitClock.rendering.calls, 1);
    const button = context.all().find(value => value.textContent === 'Naplánovat jediný 10s benchmark UTC');
    const pending = button.onclick(); game.dispose(); await pending;
    const raw = context.posted.find(value => value.kind === 'benchmark');
    assert.ok(raw); assert.equal(raw.completed, false); assert.equal(raw.plannedStart.reason, 'disposed-before-start');
    assert.equal(raw.plannedStart.actualStartUTC, null); assert.deepEqual(raw.rawGameFrameMs, []);
    assert.equal(context.FixtureSimulation.prototype.tick, original);
  }, async bytes => ack(bytes), clockIdentity);
});
test('clock import deferred across dispose/rejoin cannot install a late Game owner or poison the next startup', async () => {
  for (const disposal of ['dispose', 'rejoin']) {
    const config = { schemaVersion: 1, scenarioEpochUTC: 1000, armAtUTC: Date.now() + 100000 };
    const clockIdentity = { ...identity, clock: { config, configId: sha256(JSON.stringify(config)), configSha256: 'fixture', simulationSourceSha256: 'fixture' } };
    await browserFixture(async context => {
      const originalTick = context.FixtureSimulation.prototype.tick;
      const old = context.makeGame(); old.network = true;
      const originalTraffic = old.trafficInstant, deferred = context.deferSimulationImport(); let oldStarts = 0;
      const pending = context.observeStartup(old, { dataset: {} }, async () => { oldStarts++; old.ready = true; });
      const rejected = assert.rejects(pending, error => error.name === 'AbortError');
      if (disposal === 'dispose') old.dispose();
      const fresh = context.makeGame(); fresh.network = true;
      await context.observeStartup(fresh, { dataset: {} }, async () => {
        fresh.sim = new context.FixtureSimulation(); fresh.sim.tick(Date.now()); fresh.trafficInstant(); fresh.ready = true;
      });
      const freshTick = context.FixtureSimulation.prototype.tick;
      assert.notEqual(freshTick, originalTick);
      deferred.resolve({ Simulation: context.FixtureSimulation }); await rejected;
      await until(() => context.posted.filter(value => value.kind === 'startup').length === 2);
      assert.equal(oldStarts, 0); assert.equal(old.trafficInstant, originalTraffic);
      assert.equal(context.FixtureSimulation.prototype.tick, freshTick);
      const failed = context.posted.find(value => value.outcome === 'rejected');
      assert.equal(failed.error.name, 'AbortError'); assert.equal(failed.clockConfigId, clockIdentity.clock.configId);
      assert.equal(fresh.sim.tick(Date.now()), 1000);
      fresh.dispose(); assert.equal(context.FixtureSimulation.prototype.tick, originalTick);
    }, async bytes => ack(bytes), clockIdentity);
  }
});

test('shader attribution overlay stays diagnostic, restores original methods and retains scalar inventory before the original failure',()=>browserFixture(async context=>{
  const game=context.makeGame(),device={};game.engine._isWebGPU=true;game.engine._device=device;game.engine._compiledEffects={};
  const inventory={enabled:true,calls:2,stages:[{name:'submitted-frame',calls:2}],rawDuplicates:[],bodyDuplicates:[],unusedDefines:{names:['never export']}};
  const profile={engine:game.engine,device,active:true,generation:1,metrics:{shaderValidation:{}},
    setStage(){},observe(operation){return operation;},
    inspectShader(module,label){return this.observe(Promise.resolve({messages:[]}), 'shaderValidation',this.metrics.shaderValidation,1,performance.now(),label);},
    snapshot:()=>({active:true,metrics:{},shaderInventory:inventory})};
  game.compilationProfile=profile;
  const inspect=profile.inspectShader,observe=profile.observe,stage=profile.setStage,primary=new Error('same failed startup');
  await assert.rejects(context.observeStartup(game,{dataset:{}},async()=>{
    profile.setStage('submitted-frame');const operation=profile.inspectShader({},'vertex');assert.equal(operation instanceof Promise,true);
    await operation;throw primary;
  }),error=>error===primary);
  await until(()=>context.posted.length===1);
  const raw=context.posted[0];assert.equal(raw.mode,'diagnostic');assert.equal(raw.outcome,'rejected');
  assert.equal(raw.shaderAttribution.active,false);assert.equal(raw.shaderAttribution.jobs[0][7],1);
  assert.equal(raw.compilation.shaderInventory.calls,2);assert.doesNotMatch(JSON.stringify(raw.compilation.shaderInventory),/never export|unusedDefines/);
  assert.equal(profile.inspectShader,inspect);assert.equal(profile.observe,observe);assert.equal(profile.setStage,stage);
},async value=>ack(value),{...identity,shaderAttribution:true}));
