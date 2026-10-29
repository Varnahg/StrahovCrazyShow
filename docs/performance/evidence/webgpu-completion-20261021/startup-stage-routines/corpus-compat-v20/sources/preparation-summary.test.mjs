/** Pure acquisition/projection/actual-overlay contracts; no GPU, build or disk output. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { observeOperation, observePreparationResult, projectPreparationSummary, projectPreparationStages, validatePreparationStages, STAGE_LIMITS } from './startup-observer.mjs';
import {validateReceipt,MAX_RECEIPT_BYTES} from './receipt.mjs';
import { createAttemptQueue } from './attempt-queue.mjs';
import { installBrowserClock } from './browser-clock.mjs';
import { createPlannedBenchmark } from './transit-clock.mjs';
import { observeStartupLatency } from './startup-latency.mjs';
import { observeBufferLifecycle } from './buffer-lifecycle.mjs';
import { createLifecycleControls, createVisibilityAnchor } from './lifecycle-controls.mjs';
import { transformUI, sha256, helperIdentity } from './common.mjs';
import ts from 'typescript';

const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../../../../..');
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
const row = (quality = 'medium', finalPass = false) => ({ quality, finalPass, status: 'complete', elapsedMs: 12.25,
  activeElapsedMs: 11.5, pausedMs: .75, failureStep: null, stageCount: 19 });
const result = () => ({ status: 'complete', elapsedMs: 12345.625, activeElapsedMs: 12000.5, pausedMs: 345.125,
  failureStep: null, stages: new Array(76), qualities: [row('low'), row(), row('high'), row('medium', true)] });
const stageNames=['vehicle-0','vehicle-1','vehicle-2','vehicle-keyed-0','vehicle-keyed-1','vehicle-keyed-2','current-off','current-on','night-0-off','night-0-on','night-1-off','night-1-on','night-2-off','night-2-on','day-0-off','day-0-on','day-1-off','day-1-on','restore'];
const stageRow=(quality='medium',stage='restore')=>({passQuality:quality,stage,elapsedMs:12.5,activeElapsedMs:11.25,pausedMs:1.25,
  tickCount:3,checks:512,renders:3,restarts:1,cpu:{apply:{calls:1,totalMs:.75,maxMs:.75},checkBatch:{calls:2,totalMs:3.5,maxMs:2.25},render:{calls:3,totalMs:5.25,maxMs:2}},
  rafGap:{count:3,totalMs:14.5,maxMs:6.25},restartReasons:{materials:1}});
const stageResult=()=>({...result(),stages:['low','medium','high','medium'].flatMap(q=>stageNames.map(s=>stageRow(q,s)))});
function fixture(original) {
  let current = true;
  const errors = [], signal = new AbortController(), startupAbort = new AbortController();
  class Game { prepareLighting(...args) { return Reflect.apply(original, this, args); } }
  const game = Object.assign(new Game(), { disposed: false, scene: {}, engine: {}, startupAbort,
    renderHealth: { generation: 1, rendererId: 7 } });
  const options = { signal: signal.signal, startupSignal: startupAbort.signal, isCurrent: () => current,
    onObserverError: error => errors.push(error) };
  return { game, options, errors, signal, startupAbort, retire: () => { current = false; },
    install: () => observePreparationResult(game, options) };
}

test('stage export preserves76 numeric rows, repeated Medium pass identity and partial failure',()=>{
  const input=stageResult(),p=projectPreparationStages(input);validatePreparationStages(p);
  assert.equal(p.capturedCount,76);assert.equal(p.stageCount,76);assert.equal(p.mapping.valid,true);assert.equal(p.valid,true);
  assert.deepEqual(p.rows.filter(r=>r.stage==='restore').map(r=>[r.passIndex,r.passQuality]),[[0,'low'],[1,'medium'],[2,'high'],[3,'medium']]);
  assert.equal(p.rows[0].cpu.checkBatch.totalMs,3.5);assert.equal(p.rows[0].rafGap.totalMs,14.5);assert.deepEqual(p.rows[0].restartReasons,{materials:1});
  input.stages[0].cpu.apply.totalMs=999;assert.equal(p.rows[0].cpu.apply.totalMs,.75,'only copied scalar data survives');
  const partial=stageResult();partial.status='timeout';partial.failureStep='effects';partial.stages=partial.stages.slice(0,26);partial.qualities=[row('low'),{...row('medium'),stageCount:7,status:'timeout'}];
  const failed=projectPreparationStages(partial);validatePreparationStages(failed);assert.equal(failed.status,'timeout');assert.equal(failed.failureStep,'effects');assert.equal(failed.mapping.valid,true);assert.equal(failed.rows[25].passIndex,1);
  const basic={...partial,stages:[stageRow()]};delete basic.qualities;delete basic.stages[0].passQuality;
  const unassigned=projectPreparationStages(basic);validatePreparationStages(unassigned);assert.equal(unassigned.mapping.reason,'qualities-unavailable');assert.equal(unassigned.rows[0].passIndex,null);
});

test('stage export bounds304rows16passes and256KiB without walking overflow or arbitrary reason keys',()=>{
  const input=stageResult();input.qualities=Array.from({length:16},()=>row('medium'));input.stages=Array.from({length:304},()=>stageRow());
  const full=projectPreparationStages(input);validatePreparationStages(full);assert.equal(full.capturedCount,304);assert.equal(full.mapping.valid,true);
  input.stages.length=4294967295;Object.defineProperty(input.stages,'304',{get(){assert.fail('overflow stage getter');}});
  const sparse=projectPreparationStages(input);validatePreparationStages(sparse);assert.equal(sparse.capturedCount,304);assert.equal(sparse.stageCount,4294967295);assert.equal(sparse.truncated,true);
  input.qualities=new Array(4294967295);for(let i=0;i<16;i++)input.qualities[i]=row();Object.defineProperty(input.qualities,'16',{get(){assert.fail('overflow quality getter');}});
  assert.equal(projectPreparationStages(input).mapping.reason,'pass-limit');
  const huge=stageResult();huge.qualities=Array.from({length:16},()=>row());
  const keys=['quality','timeOverride','profile','weather','meshes','materials','car','parkedCar','carDisposed','parkedCarDisposed','vegetation','grassResources','startupView','presentationCoverage','revision-length'];
  huge.stages=Array.from({length:304},()=>{const r=stageRow();for(const k of ['elapsedMs','activeElapsedMs','pausedMs'])r[k]=Number.MAX_VALUE;
    for(const t of Object.values(r.cpu)){t.calls=Number.MAX_SAFE_INTEGER;t.totalMs=t.maxMs=Number.MAX_VALUE;}r.rafGap={count:Number.MAX_SAFE_INTEGER,totalMs:Number.MAX_VALUE,maxMs:Number.MAX_VALUE};
    r.restartReasons=Object.fromEntries(keys.map(k=>[k,Number.MAX_SAFE_INTEGER]));return r;});
  const limited=projectPreparationStages(huge);validatePreparationStages(limited);assert.equal(limited.byteLimited,true);assert.equal(limited.truncated,true);assert.ok(limited.capturedCount<304);assert.ok(Buffer.byteLength(JSON.stringify(limited))<=STAGE_LIMITS.bytes);
});

test('stage export own getter, sparse, proxy and nonfinite failures stay explicit with closed output',()=>{
  const input=stageResult();let reads=0;
  Object.defineProperty(input.stages[0].cpu,'apply',{get(){reads++;throw Error('getter');}});
  Object.defineProperty(input.stages[1].restartReasons,'weather',{get(){reads++;throw Error('reason getter');}});
  input.stages[2].elapsedMs=Infinity;delete input.stages[3];
  input.stages[4].restartReasons=new Proxy({materials:2,secret:'not exported'},{ownKeys(){throw Error('must not enumerate raw reasons');}});
  const p=projectPreparationStages(input);validatePreparationStages(p);assert.equal(reads,0);assert.equal(p.valid,false);assert.ok(p.invalidFields>0);assert.equal(p.rows[0].cpu.apply.totalMs,null);assert.equal(p.rows[2].elapsedMs,null);assert.equal('secret' in p.rows[4].restartReasons,false);
  const revoked=Proxy.revocable({},{});revoked.revoke();assert.equal(projectPreparationStages(revoked.proxy).available,false);
});

test('stage receipt rejects invented mapping/fields/kinds/getters and accepts actual startup envelope headroom',async()=>{
  const p=projectPreparationStages(stageResult());
  const bads=[x=>x.rows[0].passIndex=3,x=>x.mapping.stageCounts[0]=18,x=>x.mapping.valid=false,x=>x.rows[0].hidden='raw',x=>x.rows[0].elapsedMs=-1,x=>x.capturedCount=75,x=>x.rows[0].elapsedMs=null];
  for(const alter of bads){const x=structuredClone(p);alter(x);assert.throws(()=>validatePreparationStages(x));}
  let reads=0;const getter=structuredClone(p);Object.defineProperty(getter.rows[0],'elapsedMs',{get(){reads++;return 1;}});assert.throws(()=>validatePreparationStages(getter));assert.equal(reads,0);
  for(const name of ['99c27c5a-5070-4254-b26b-36ba81aaf3bf','02e3300d-bad7-46bf-b55f-14be21b385f5']){
    const raw=JSON.parse(await readFile(join(root,'docs/performance/evidence/webgpu-completion-20261021/validation/receiver-source14-v16/receipts/'+name+'.json'),'utf8'));
    const extended={...raw,preparationStages:p};validateReceipt(raw,raw);validateReceipt(extended,raw);assert.ok(Buffer.byteLength(JSON.stringify(extended))<MAX_RECEIPT_BYTES);
    assert.throws(()=>validateReceipt({...extended,kind:'state',state:{},compilation:{}},raw),/kind mismatch/);
  }
});

test('stagesSnapshot shares the original observer reaction, preserves Promise identity and scalar evidence after dispose',async()=>{
  const pending=Promise.withResolvers(),input=stageResult(),f=fixture(function(...args){assert.equal(this,f.game);assert.deepEqual(args,[1,2]);return pending.promise;}),owner=f.install();
  const actual=f.game.prepareLighting(1,2);assert.equal(actual,pending.promise);pending.resolve(input);assert.equal(await actual,input);await flush();
  const data=owner.stagesSnapshot();validatePreparationStages(data);assert.equal(data.capturedCount,76);owner.dispose();assert.equal(owner.stagesSnapshot(),data);
  const source=await readFile(join(directory,'startup-observer.mjs'),'utf8');assert.equal(source.match(/Reflect\.apply\(NATIVE_THEN, result/g)?.length,1,'the same single native side reaction observes both projections');
  const late=Promise.withResolvers(),g=fixture(()=>late.promise),retired=g.install();const original=g.game.prepareLighting(),lateResult=stageResult();retired.dispose();late.resolve(lateResult);assert.equal(await original,lateResult);await flush();assert.equal(retired.stagesSnapshot().available,false);
  const h=fixture(()=>Promise.resolve(new Proxy(stageResult(),{getOwnPropertyDescriptor(target,key){if(key==='stages')h.retire();return Reflect.getOwnPropertyDescriptor(target,key);}}))),stale=h.install();await h.game.prepareLighting();await flush();assert.equal(stale.stagesSnapshot().available,false);assert.equal(stale.snapshot().available,false);
});

test('actual overlay exports stage projection once at terminal before teardown, never into startup samples',async()=>{
  const f=await overlayFixture(),g=overlayGame(f);const operation=f.observeStartup(g.game,g.canvas,async()=>{await g.game.prepareLighting();return 42;});
  await flush();g.pending.resolve(stageResult());assert.equal(await operation,42);await flush();const raw=f.raw();
  validatePreparationStages(raw.preparationStages);assert.equal(raw.preparationStages.capturedCount,76);assert.equal(raw.preparationStages.mapping.valid,true);
  assert.ok(f.events.indexOf('terminal-raw')>=0);assert.equal(g.game.prepareLighting,g.original);for(const sample of raw.samples)assert.equal('preparationStages' in sample,false);
  for(const callback of [...g.callbacks])callback();
});

test('76 original stages produce truthful scalar summary without reading even one stage or shader/resource getter', () => {
  const input = result(); let reads = 0;
  for (let index = 0; index < 76; index++) Object.defineProperty(input.stages, index, { get() { reads++; throw Error('stage read'); } });
  Object.defineProperty(input, 'shader', { get() { reads++; throw Error('shader read'); } });
  input.stageCount = 999; input.resources = { texture: 'not exported' };
  const summary = projectPreparationSummary(input);
  assert.equal(summary.available, true); assert.equal(summary.valid, true); assert.equal(summary.stageCount, 76);
  assert.equal(summary.qualityCount, 4); assert.equal(summary.qualitiesTruncated, false);
  assert.deepEqual(summary.qualities.map(value => [value.quality, value.finalPass, value.stageCount]),
    [['low', false, 19], ['medium', false, 19], ['high', false, 19], ['medium', true, 19]]);
  assert.equal(summary.elapsedMs, 12345.625); assert.equal(summary.activeElapsedMs, 12000.5); assert.equal(summary.pausedMs, 345.125);
  assert.equal(reads, 0); assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 1500);
  assert.equal('resources' in summary, false); assert.equal('stages' in summary, false);
});

test('max16 quality rows retain true total count/truncation; enormous sparse arrays remain bounded', () => {
  const input = result(); input.qualities = new Array(4294967295);
  for (let index = 0; index < 16; index++) input.qualities[index] = row();
  Object.defineProperty(input.qualities, '16', { get() { throw Error('beyond cap'); } });
  const summary = projectPreparationSummary(input);
  assert.equal(summary.qualityCount, 4294967295); assert.equal(summary.qualities.length, 16); assert.equal(summary.qualitiesTruncated, true);
  assert.equal(summary.valid, true); assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 8192);
});
for (const value of [undefined, null, false, 0, '', 'complete']) test('unavailable input is never invented: ' + String(value), () => {
  assert.deepEqual(projectPreparationSummary(value), { available: false, reason: 'no-result' });
});
test('own getters, inherited getters and throwing descriptors cannot execute or leak arbitrary values', () => {
  let reads = 0;
  const input = Object.create({ get status() { reads++; throw Error('inherited'); } });
  for (const key of ['elapsedMs', 'activeElapsedMs', 'pausedMs', 'failureStep', 'stages', 'qualities'])
    Object.defineProperty(input, key, { get() { reads++; throw Error('own getter'); } });
  const projected = projectPreparationSummary(input);
  assert.equal(reads, 0); assert.equal(projected.status, null); assert.equal(projected.qualityCount, null); assert.equal(projected.valid, false);
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  assert.doesNotThrow(() => projectPreparationSummary(revoked.proxy));
});
test('finite numeric and enum validation makes missing/invalid/overflow fields explicit, never clamps', () => {
  const input = result(); input.status = { toJSON() { throw Error('not scalar'); } }; input.elapsedMs = Infinity;
  input.activeElapsedMs = -1; input.pausedMs = NaN; input.failureStep = 'invented'; input.stages = { length: 76 };
  input.qualities = [{ ...row(), quality: 'auto', finalPass: 1, stageCount: 2 ** 53 }, , Object.create(row())];
  const summary = projectPreparationSummary(input);
  for (const key of ['status', 'elapsedMs', 'activeElapsedMs', 'pausedMs', 'failureStep', 'stageCount']) assert.equal(summary[key], null);
  assert.equal(summary.valid, false); assert.equal(summary.qualities.length, 3); assert.equal(summary.qualities.every(value => !value.valid), true);
  assert.ok(Number.isSafeInteger(summary.invalidFields)); assert.ok(summary.invalidFields > 0);
  assert.doesNotThrow(() => JSON.stringify(summary));
  const single = result(); delete single.qualities;
  const original = projectPreparationSummary(single); assert.equal(original.elapsedMs, single.elapsedMs); assert.equal(original.qualityCount, null);
});
for (const status of ['complete', 'timeout', 'disposed', 'failed']) test('original status and failure flags retained: ' + status, () => {
  const input = result(); input.status = status; input.failureStep = 'render'; input.qualities[3].status = status; input.qualities[3].failureStep = 'render';
  const summary = projectPreparationSummary(input); assert.equal(summary.status, status); assert.equal(summary.failureStep, 'render');
  assert.equal(summary.qualities[3].status, status); assert.equal(summary.qualities[3].failureStep, 'render'); assert.equal(summary.valid, true);
});

test('same original native Promise, receiver/arguments and immediate projection before original await continuation', async () => {
  const pending = Promise.withResolvers(), calls = [], arg = {}, events = [];
  let thenReads = 0; Object.defineProperty(pending.promise, 'then', { get() { thenReads++; throw Error('do not read .then'); } });
  const f = fixture(function (...args) { calls.push({ receiver: this, args }); return pending.promise; }), original = f.game.prepareLighting;
  const owner = f.install(), actual = f.game.prepareLighting(arg, 42, undefined);
  assert.equal(actual, pending.promise); assert.deepEqual(calls, [{ receiver: f.game, args: [arg, 42, undefined] }]);
  const originalContinuation = (async () => { await actual; events.push(owner.snapshot().stageCount); })();
  pending.resolve(result()); await originalContinuation;
  assert.deepEqual(events, [76]); assert.equal(thenReads, 0); owner.dispose();
  assert.equal(f.game.prepareLighting, original); assert.equal(Object.hasOwn(f.game, 'prepareLighting'), false);
});
test('foreign receiver passes through without collecting and without retiring the current Game', async () => {
  const pending = Promise.withResolvers(), calls = [];
  const f = fixture(function (...args) { calls.push([this, args]); return pending.promise; }), owner = f.install(), foreign = {};
  assert.equal(Reflect.apply(f.game.prepareLighting, foreign, [7]), pending.promise); pending.resolve(result()); await flush();
  assert.deepEqual(calls, [[foreign, [7]]]); assert.equal(owner.snapshot().available, false); owner.dispose();
});
for (const value of [undefined, null, false, 0, '', 42, {}]) test('non-Promise original return identity is untouched: ' + String(value), () => {
  const f = fixture(() => value), owner = f.install(); assert.equal(f.game.prepareLighting(), value);
  assert.equal(owner.snapshot().available, false); assert.ok(['non-native-promise', 'unsupported-promise'].includes(owner.snapshot().reason)); owner.dispose();
});
test('exotic constructor/species accessors are not invoked by the optional observation', async () => {
  const pending = Promise.withResolvers(); let reads = 0;
  Object.defineProperty(pending.promise, 'constructor', { configurable: true, get() { reads++; throw Error('constructor getter'); } });
  const f = fixture(() => pending.promise), owner = f.install(); assert.equal(f.game.prepareLighting(), pending.promise);
  assert.equal(reads, 0); assert.equal(owner.snapshot().reason, 'unsupported-promise'); owner.dispose();
  delete pending.promise.constructor;
  const descriptor = Object.getOwnPropertyDescriptor(Promise, Symbol.species), second = fixture(() => pending.promise), other = second.install();
  try {
    Object.defineProperty(Promise, Symbol.species, { configurable: true, get() { reads++; throw Error('species getter'); } });
    assert.equal(second.game.prepareLighting(), pending.promise); assert.equal(reads, 0); assert.equal(other.snapshot().reason, 'unsupported-promise');
  } finally { Object.defineProperty(Promise, Symbol.species, descriptor); other.dispose(); }
  pending.resolve(result()); await pending.promise;
});
test('missing or invalid own renderer identity refuses observation without changing the original method', () => {
  for (const change of [f => { f.game.renderHealth.generation = 0; }, f => { f.game.renderHealth.rendererId = NaN; },
    f => { delete f.game.renderHealth; }, f => { delete f.game.scene; }, f => { delete f.game.engine; }]) {
    const f = fixture(() => 42), original = f.game.prepareLighting; change(f); const owner = f.install();
    assert.equal(owner.snapshot().reason, 'owner-identity-unavailable'); assert.equal(f.game.prepareLighting, original); assert.equal(f.game.prepareLighting(), 42);
  }
});
for (const thrown of [undefined, null, false, 0, '', new Error('original')]) {
  test('exact synchronous thrown value including falsy: ' + String(thrown), () => {
    const f = fixture(() => { throw thrown; }), owner = f.install(); let caught = false;
    try { f.game.prepareLighting(); } catch (error) { caught = true; assert.equal(error, thrown); }
    assert.equal(caught, true); owner.dispose();
  });
  test('exact asynchronous rejection including falsy, side chain is consumed: ' + String(thrown), async () => {
    const original = Promise.reject(thrown), f = fixture(() => original), owner = f.install();
    const actual = f.game.prepareLighting(); assert.equal(actual, original); let caught = false;
    try { await actual; } catch (error) { caught = true; assert.equal(error, thrown); }
    assert.equal(caught, true); assert.deepEqual(owner.snapshot(), { available: false, reason: 'original-rejected' }); owner.dispose();
  });
}
test('observer/projection diagnostics cannot replace original success or throw', async () => {
  const f = fixture(() => 0); f.options.onObserverError = () => { throw Error('observer fault'); };
  const owner = f.install(); assert.equal(f.game.prepareLighting(), 0); owner.dispose();
  const pending = Promise.withResolvers(), g = fixture(() => pending.promise);
  g.options.isCurrent = () => { throw Error('owner observer fault'); }; g.options.onObserverError = () => { throw false; };
  const guarded = g.install(); assert.equal(g.game.prepareLighting(), pending.promise); pending.resolve(result()); await pending.promise;
  assert.equal(guarded.snapshot().available, false);
});
const retirements = {
  dispose: (f, owner) => owner.dispose(), abort: f => f.signal.abort(), startupAbort: f => f.startupAbort.abort(),
  current: f => f.retire(), gameDisposed: f => { f.game.disposed = true; }, health: f => { f.game.renderHealth = {}; },
  generation: f => { f.game.renderHealth.generation++; }, renderer: f => { f.game.renderHealth.rendererId++; },
  scene: f => { f.game.scene = {}; }, engine: f => { f.game.engine = {}; }, controller: f => { f.game.startupAbort = new AbortController(); },
};
for (const [name, retire] of Object.entries(retirements)) test('late original fulfilment after retirement is ignored: ' + name, async () => {
  const pending = Promise.withResolvers(), f = fixture(() => pending.promise), original = f.game.prepareLighting, owner = f.install();
  assert.equal(f.game.prepareLighting(), pending.promise); retire(f, owner); pending.resolve(result()); await flush();
  assert.equal(owner.snapshot().available, false); assert.equal(f.game.prepareLighting, original); owner.dispose(); owner.dispose();
});
test('foreign replacement survives dispose and late callback; exact own descriptor restored when owned', async () => {
  const pending = Promise.withResolvers(), f = fixture(() => pending.promise), owner = f.install(); f.game.prepareLighting();
  const replacement = () => 'foreign'; f.game.prepareLighting = replacement; pending.resolve(result()); await flush(); owner.dispose();
  assert.equal(f.game.prepareLighting, replacement); assert.equal(owner.snapshot().available, false);
  const own = fixture(() => Promise.resolve(result()));
  Object.defineProperty(own.game, 'prepareLighting', { configurable: true, writable: true, enumerable: true, value: own.game.prepareLighting });
  const before = Object.getOwnPropertyDescriptor(own.game, 'prepareLighting'), restored = own.install(); restored.dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptor(own.game, 'prepareLighting'), before);
});
test('new owner/rejoin works while old promise resolves; old wrapper cannot double-observe replacement', async () => {
  const old = Promise.withResolvers(), f = fixture(() => old.promise), first = f.install(), stale = f.game.prepareLighting;
  f.game.prepareLighting(); first.dispose(); const second = f.install();
  old.resolve(result()); await flush(); assert.equal(first.snapshot().available, false); assert.equal(second.snapshot().available, false);
  const value = result(); value.stages = [1]; f.game.prepareLighting = () => Promise.resolve(value); second.dispose();
  assert.equal(typeof stale, 'function'); assert.equal(await stale.call(f.game), await old.promise);
});
test('same instance rejoin restores descriptor before next start and accepts only the new result', async () => {
  const old = Promise.withResolvers(), fresh = Promise.withResolvers(); let pending = old;
  const f = fixture(() => pending.promise), original = f.game.prepareLighting, first = f.install();
  f.game.prepareLighting(); first.dispose(); assert.equal(f.game.prepareLighting, original);
  pending = fresh; const second = f.install(); assert.equal(f.game.prepareLighting(), fresh.promise);
  old.resolve(result()); await flush(); assert.equal(first.snapshot().available, false); assert.equal(second.snapshot().available, false);
  const actual = result(); actual.stages = [1, 2, 3]; fresh.resolve(actual); await flush();
  assert.equal(second.snapshot().stageCount, 3); second.dispose(); assert.equal(f.game.prepareLighting, original);
});
test('original synchronous abort retains its Promise and no late projection survives', async () => {
  const pending = Promise.withResolvers(); let f;
  f = fixture(function () { f.startupAbort.abort(); return pending.promise; });
  const original = f.game.prepareLighting, owner = f.install(); assert.equal(f.game.prepareLighting(), pending.promise);
  assert.equal(f.game.prepareLighting, original); pending.resolve(result()); await flush(); assert.equal(owner.snapshot().available, false);
});
test('accessor/missing/nonwritable methods are never invoked by installation and leave source outcome alone', () => {
  const f = fixture(() => 5); let reads = 0;
  Object.defineProperty(f.game, 'prepareLighting', { configurable: true, get() { reads++; throw Error('method getter'); } });
  const owner = f.install(); assert.equal(reads, 0); assert.equal(owner.snapshot().reason, 'missing-method');
  const g = fixture(() => 5); Object.defineProperty(g.game, 'prepareLighting', { configurable: false, writable: false, value: () => 5 });
  const frozen = g.install(); assert.equal(g.game.prepareLighting(), 5); assert.equal(frozen.snapshot().available, false);
});

// Execute the complete actual overlay body with scalar DOM/network/clock sinks.
// Imported implementations are real; optional GPU diagnostics stay default-off.
async function overlayFixture() {
  const source = await readFile(join(directory, 'qa-overlay.mjs'), 'utf8'), events = [], intervals = new Set(), elements = [];
  class Element {
    constructor(tag) { this.tag = tag; this.style = {}; this.children = []; elements.push(this); }
    append(...values) { this.children.push(...values); } setAttribute() {} remove() {}
    set textContent(value) { this.text = value; if (this.id === 'webgpu-completion-export') events.push('terminal-raw'); }
    get textContent() { return this.text; }
  }
  const document = { createElement: tag => new Element(tag), body: new Element('body'), visibilityState: 'visible', hasFocus: () => true };
  const window = { addEventListener() {}, removeEventListener() {} }, requests = [];
  const identity = { label: 'cpu-only', buildId: 'fixture', sourceSnapshotId: 'source', helperSha256: 'helper',
    startupLatency: false, bufferLifecycle: false, lifecycleControls: false, routineCost: false, shaderAttribution: false, loading: 'original', clock: null };
  const URLFixture = class extends URL { static createObjectURL() { return 'blob:fixture'; } static revokeObjectURL() {} };
  const dependencies = { observeOperation, observePreparationResult, createAttemptQueue, installBrowserClock, createPlannedBenchmark,
    observeStartupLatency, observeBufferLifecycle, createLifecycleControls, createVisibilityAnchor,
    createShaderAttributionWindow() { throw Error('default-off shader observer'); }, projectShaderInventory() { throw Error('default-off shader inventory'); },
    captureRoutineCost() { throw Error('default-off routine observer'); }, document, window,
    location: { hostname: '127.0.0.1', search: '' }, navigator: { userAgent: 'CPU fixture' },
    crypto: { randomUUID: () => webcrypto.randomUUID(), subtle: { digest: async (_algorithm, bytes) => Buffer.from(sha256(bytes), 'hex') } },
    URL: URLFixture, URLSearchParams, Blob, TextEncoder, performance, innerWidth: 2040, innerHeight: 986, devicePixelRatio: 1,
    setInterval(callback) { intervals.add(callback); return callback; }, clearInterval(callback) { intervals.delete(callback); },
    setTimeout() { throw Error('no additional timer'); }, clearTimeout() {},
    async fetch(path, options) { const raw = JSON.parse(options.body); requests.push(raw); events.push('receipt'); return { ok: true, json: async () => ({ sha256: 'fixture', persisted: true, attemptId: raw.attemptId }) }; },
    __WEBGPU_COMPLETION_IDENTITY__: identity };
  const body = source.replace(/^import .*;\r?\n/gm, '').replace('export async function observeStartup', 'async function observeStartup');
  const observeStartup = new Function(...Object.keys(dependencies), body + '\nreturn observeStartup;')(...Object.values(dependencies));
  return { observeStartup, events, requests, intervals, elements,
    raw: () => JSON.parse(elements.find(value => value.id === 'webgpu-completion-export').textContent) };
}
function overlayGame(f) {
  const pending = Promise.withResolvers(), callbacks = new Set();
  const base = fixture(function () { f.events.push('prepare'); return pending.promise; });
  Object.assign(base.game, { scene: { onDisposeObservable: { addOnce(callback) { callbacks.add(callback); return { remove() { callbacks.delete(callback); } }; } } },
    compilationProfile: { snapshot: () => ({ active: true }) }, ready: false });
  return { ...base, pending, callbacks, canvas: { dataset: {} }, original: base.game.prepareLighting };
}
test('complete actual UI overlay captures bounded result before terminal raw/outer UI continuation and restores method', async () => {
  const f = await overlayFixture(), g = overlayGame(f);
  const operation = f.observeStartup(g.game, g.canvas, async () => {
    assert.notEqual(g.game.prepareLighting, g.original); const value = await g.game.prepareLighting();
    f.events.push('original-start-after-await'); assert.equal(value.elapsedMs, 12345.625); g.game.ready = true; return 42;
  });
  await flush(); g.pending.resolve(result()); assert.equal(await operation, 42); f.events.push('outer-UI-after-start'); await flush();
  const raw = f.raw(); assert.equal(raw.kind, 'startup'); assert.equal(raw.preparationSummary.stageCount, 76);
  assert.equal(raw.preparationSummary.qualityCount, 4); assert.equal(raw.outcome, 'resolved');
  assert.ok(f.events.indexOf('original-start-after-await') < f.events.indexOf('terminal-raw'));
  assert.ok(f.events.indexOf('terminal-raw') < f.events.indexOf('outer-UI-after-start'));
  assert.equal(g.game.prepareLighting, g.original); assert.equal(f.intervals.size, 0);
  for (const sample of raw.samples) assert.equal('preparationSummary' in sample, false);
  for (const callback of [...g.callbacks]) callback();
});
test('actual UI rejected terminal restores method before outer UI teardown, preserving original falsy rejection', async () => {
  const f = await overlayFixture(), g = overlayGame(f);
  const operation = f.observeStartup(g.game, g.canvas, async () => { await g.game.prepareLighting(); });
  await flush(); g.pending.reject(false); let caught = false;
  try { await operation; } catch (error) { caught = true; assert.equal(error, false); f.events.push('outer-UI-dispose'); }
  await flush(); assert.equal(caught, true); assert.equal(g.game.prepareLighting, g.original);
  const raw = f.raw(); assert.equal(raw.outcome, 'rejected');
  assert.deepEqual(raw.preparationSummary, { available: false, reason: 'original-rejected' });
  assert.ok(f.events.indexOf('terminal-raw') < f.events.indexOf('outer-UI-dispose'));
  for (const callback of [...g.callbacks]) callback();
});
test('actual UI stop during pending original result restores hook and ignores late fulfilment', async () => {
  const f = await overlayFixture(), g = overlayGame(f);
  const operation = f.observeStartup(g.game, g.canvas, async () => { await g.game.prepareLighting(); return 9; });
  await flush(); for (const callback of [...g.callbacks]) callback(); assert.equal(g.game.prepareLighting, g.original);
  g.pending.resolve(result()); assert.equal(await operation, 9); await flush();
  const raw = f.raw(); assert.equal(raw.preparationSummary.available, false);
  assert.equal(f.intervals.size, 0);
});
test('actual Game preparation-await expression and actual RenderHealth.guard consume only original result after projection', async () => {
  const gameSource = await readFile(join(root, 'client/game.ts'), 'utf8'), healthSource = await readFile(join(root, 'client/render-health.ts'), 'utf8');
  const gameAST = ts.createSourceFile('game.ts', gameSource, ts.ScriptTarget.Latest, true), expressions = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(gameAST) === 'preparation' && node.initializer && ts.isAwaitExpression(node.initializer))
      expressions.push(node.initializer.getText(gameAST));
    ts.forEachChild(node, visit);
  }
  visit(gameAST); assert.equal(expressions.length, 1); assert.match(expressions[0], /this\.renderHealth\.guard\(this\.prepareLighting/);
  const healthAST = ts.createSourceFile('render-health.ts', healthSource, ts.ScriptTarget.Latest, true);
  const declaration = healthAST.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'RenderHealth');
  const method = declaration.members.find(node => node.name?.getText(healthAST) === 'guard').getText(healthAST);
  const native = ts.transpileModule('class ActualHealth{' + method + '}', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const Health = new Function(native + ';return ActualHealth;')();
  const pending = Promise.withResolvers(), f = fixture(() => pending.promise);
  f.game.renderHealth = Object.assign(new Health(), { generation: 1, rendererId: 7, phase: 'preparing', guards: new Set() });
  const owner = f.install(), preloadRender = {}, pipelinePreparation = {}, lightPreparationLoop = {};
  const body = ts.transpileModule('async function actual(){const preparation=' + expressions[0] + ';return preparation;}',
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const actual = new Function('preloadRender', 'pipelinePreparation', 'lightPreparationLoop', body + ';return actual;')(
    preloadRender, pipelinePreparation, lightPreparationLoop);
  const operation = actual.call(f.game), raw = result(); pending.resolve(raw);
  assert.equal(await operation, raw); assert.equal(owner.snapshot().stageCount, 76); assert.equal(f.game.renderHealth.guards.size, 0);
  owner.dispose();
});
test('actual source UI exact once transform parses and preserves original bytes; depth5 and new helper seal include test', async () => {
  const path = join(root, 'client/ui.tsx'), source = await readFile(path, 'utf8'), before = sha256(await readFile(path));
  const transformed = transformUI(source); assert.equal(sha256(await readFile(path)), before);
  assert.equal(transformed.split('await observeStartup(g, startupCanvas, () => g.start());').length, 2);
  assert.equal(ts.createSourceFile('qa-ui.tsx', transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0);
  assert.equal(sha256(await readFile(path)), before); assert.throws(() => transformUI(transformed));
  const identity = await helperIdentity(directory); assert.equal(Object.keys(identity.files).length, 38);
  assert.equal(identity.files['preparation-summary.test.mjs'], sha256(await readFile(fileURLToPath(import.meta.url))));
});
