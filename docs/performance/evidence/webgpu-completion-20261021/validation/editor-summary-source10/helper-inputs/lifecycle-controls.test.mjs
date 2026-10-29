/** CPU ownership/transport fixtures only; no actual GPU loss or visibility. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createLifecycleControls, createVisibilityAnchor } from './lifecycle-controls.mjs';
import { parseBuildOptions, buildDigest, browserBuildIdentity } from './common.mjs';
import { validateReceipt } from './receipt.mjs';

function fixture(original) {
  const callbacks = new Set(), reports = [], calls = [], lost = Promise.withResolvers();
  let current = true;
  const device = { lost: lost.promise, destroy: original ?? function (...args) { calls.push({ receiver: this, args }); return 'original-result'; } };
  const state = { phase: 'ready', valid: true, rendererId: 1, generation: 1, errorCount: 0, pendingOperations: 0, pendingPreparationOperations: 0 };
  const engine = { isWebGPU: true, isDisposed: false, _device: device };
  const scene = { isDisposed: false, getEngine: () => engine, onDisposeObservable: {
    addOnce(callback) { callbacks.add(callback); return { remove() { callbacks.delete(callback); } }; },
  } };
  const game = { scene, engine, renderHealth: { snapshot: () => ({ ...state }) }, startupAbort: new AbortController(),
    ready: true, disposed: false, rendererFailed: false, preparingRenderQuality: false };
  const signal = new AbortController();
  const options = { enabled: true, isCurrent: () => current, signal: signal.signal, onAttempt: value => reports.push(value) };
  return { game, engine, scene, device, state, signal, callbacks, calls, reports, lost, options,
    owner: () => createLifecycleControls(game, options), retire: () => { current = false; } };
}
test('default-off does not inspect Game/device or install any owner', () => {
  const game = new Proxy({}, { get() { throw new Error('unexpected default-off read'); } });
  assert.equal(createLifecycleControls(game), undefined); assert.equal(createLifecycleControls(game, { enabled: false }), undefined);
});
test('original own destroy receives exact device/no args/result, no loss/health method is wrapped', () => {
  const f = fixture(), original = f.device.destroy, promise = f.device.lost, owner = f.owner();
  assert.equal(owner.destroyOwnDevice(), 'original-result');
  assert.deepEqual(f.calls, [{ receiver: f.device, args: [] }]); assert.equal(f.device.destroy, original); assert.equal(f.device.lost, promise);
  assert.deepEqual(f.reports, [{ action: 'destroy-own-device', attempted: true, outcome: 'returned', rendererId: 1, generation: 1 }]);
  assert.equal(owner.snapshot().active, false); assert.equal(f.callbacks.size, 0);
  assert.throws(owner.destroyOwnDevice); assert.throws(f.owner().destroyOwnDevice, /already attempted/);
});
for (const thrown of [undefined, null, false, 0, '']) test('original falsy destroy throw is preserved: ' + String(thrown), () => {
  const f = fixture(function () { assert.equal(this, f.device); throw thrown; }), owner = f.owner(); let caught = false;
  try { owner.destroyOwnDevice(); } catch (error) { caught = true; assert.equal(error, thrown); }
  assert.equal(caught, true); assert.equal(f.reports[0].outcome, 'threw'); assert.equal(owner.snapshot().active, false);
});
const refused = {
  foreignGame: f => f.retire(), changedScene: f => { f.game.scene = {}; }, changedSceneEngine: f => { f.scene.getEngine = () => ({}); },
  changedEngine: f => { f.game.engine = {}; }, changedDevice: f => { f.engine._device = { destroy() { throw new Error('foreign device called'); } }; },
  changedHealth: f => { f.game.renderHealth = {}; }, changedGeneration: f => { f.state.generation++; }, changedRenderer: f => { f.state.rendererId++; },
  invalidHealth: f => { f.state.valid = false; }, error: f => { f.state.errorCount++; }, phase: f => { f.state.phase = 'restart-required'; },
  pending: f => { f.state.pendingOperations++; }, pendingPreparation: f => { f.state.pendingPreparationOperations++; },
  startupLease: f => { f.game.startupPresentationLease = {}; }, qualityPreparation: f => { f.game.preparingRenderQuality = true; },
  benchmark: f => { f.game.benchmark = {}; }, unready: f => { f.game.ready = false; }, disposed: f => { f.game.disposed = true; },
  disposedEngine: f => { f.engine.isDisposed = true; }, disposedScene: f => { f.scene.isDisposed = true; }, failed: f => { f.game.rendererFailed = true; },
  webgl: f => { f.engine.isWebGPU = false; }, missingDevice: f => { f.engine._device = undefined; },
  foreignMethod: f => { f.device.destroy = () => { throw new Error('foreign wrapper called'); }; },
  replacedAbort: f => { f.game.startupAbort = new AbortController(); }, abort: f => f.signal.abort(), startupAbort: f => f.game.startupAbort.abort(),
};
for (const [name, change] of Object.entries(refused)) test('strict owner/readiness refuses ' + name + ' without destroying any device', () => {
  const f = fixture(), owner = f.owner(); change(f); assert.throws(owner.destroyOwnDevice); assert.equal(f.calls.length, 0); assert.equal(f.reports.length, 0); owner.dispose();
});
test('retirement/scene teardown is idempotent and old callbacks cannot act on a replacement', () => {
  const f = fixture(), owner = f.owner(); for (const callback of [...f.callbacks]) callback(); owner.dispose(); owner.dispose();
  assert.equal(f.callbacks.size, 0); assert.throws(owner.destroyOwnDevice); assert.equal(f.calls.length, 0);
  const fresh = fixture(), replacement = fresh.owner(); assert.equal(replacement.destroyOwnDevice(), 'original-result');
});
test('synchronous original teardown and observer faults cannot erase result/attempt or replace throw', () => {
  const f = fixture(function () { f.game.startupAbort.abort(); return 42; });
  const owner = f.owner(); assert.equal(owner.destroyOwnDevice(), 42); assert.equal(f.reports[0].outcome, 'returned');
  const bad = fixture(() => { throw false; }); bad.options.onAttempt = () => { throw new Error('observer fault'); };
  bad.scene.onDisposeObservable.addOnce = () => ({ remove() { throw new Error('cleanup fault'); } });
  assert.throws(bad.owner().destroyOwnDevice, error => error === false);
});
test('safe anchor uses actual native navigation and no visibility/focus event handler', () => {
  const anchor = createVisibilityAnchor({ createElement(tag) { assert.equal(tag, 'a'); return { style: {} }; } });
  assert.equal(anchor.href, 'about:blank'); assert.equal(anchor.target, '_blank'); assert.equal(anchor.rel, 'noopener');
  assert.equal(anchor.onclick, undefined); assert.equal(anchor.onfocus, undefined);
});
test('explicit lifecycle flag is canonical default-off and absent/null/type drift is rejected', () => {
  assert.equal(parseBuildOptions([]).lifecycleControls, false); assert.equal(parseBuildOptions(['--lifecycle-controls']).lifecycleControls, true);
  const clock = resolve('explicit-immutable-clock.json');
  assert.equal(parseBuildOptions(['original', clock, '--lifecycle-controls']).clockFile, clock);
  assert.throws(() => parseBuildOptions(['--lifecycle-controls', '--lifecycle-controls'])); assert.throws(() => parseBuildOptions(['--lifecycle-controls=1']));
  const input = { sourceSnapshotId: 'source', helperSha256: 'helper', label: 'label', loading: 'original', transforms: {},
    clock: null, weather: null, startupLatency: false, shaderAttribution: false, routineCost: false, bufferLifecycle: false, lifecycleControls: false, dependencies: {} };
  assert.notEqual(buildDigest(input), buildDigest({ ...input, lifecycleControls: true }));
  assert.equal(browserBuildIdentity({ ...input, lifecycleControls: true }).lifecycleControls, true);
  for (const value of [undefined, null, 0, 'true']) assert.throws(() => buildDigest({ ...input, lifecycleControls: value }));
  const missing = { ...input }; delete missing.lifecycleControls; assert.throws(() => buildDigest(missing));
});
test('state action receipt validates explicit flag/diagnostic mode and bounded scalar-only evidence', () => {
  const identity = { buildId: 'build', sourceSnapshotId: 'source', helperSha256: 'helper', lifecycleControls: true };
  const value = { schemaVersion: 1, ...identity, attemptId: '8e9e7e15-6011-438d-96a2-53be43f17792', kind: 'state', mode: 'diagnostic',
    atMs: 1, timeOrigin: 1, observerErrors: [], state: {}, compilation: {},
    lifecycleControl: { action: 'destroy-own-device', attempted: true, outcome: 'returned', rendererId: 1, generation: 1 } };
  assert.equal(validateReceipt(value, identity), value);
  for (const patch of [{ lifecycleControls: undefined }, { lifecycleControls: false }, { mode: 'plain' },
    { lifecycleControl: { ...value.lifecycleControl, device: {} } }, { lifecycleControl: { ...value.lifecycleControl, outcome: 'recovered' } },
    { lifecycleControl: { ...value.lifecycleControl, rendererId: -1 } }, { lifecycleControl: { ...value.lifecycleControl, generation: 0 } }])
    assert.throws(() => validateReceipt({ ...value, ...patch }, identity));
  assert.throws(() => validateReceipt(value, { ...identity, lifecycleControls: false }));
  const missing = { ...identity }; delete missing.lifecycleControls; assert.throws(() => validateReceipt(value, missing));
});
