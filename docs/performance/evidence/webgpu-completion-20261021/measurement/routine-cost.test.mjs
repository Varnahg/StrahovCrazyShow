import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { PBRBaseMaterial } from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { ObjectRenderer } from '@babylonjs/core/Rendering/objectRenderer.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { RoutineCallProfile, ROUTINE_IDS, ROUTINE_LIMITS, validateRoutineProfile } from './routine-cost-core.mjs';
import { captureRoutineCost } from './routine-cost.mjs';
import { parseBuildOptions, buildDigest, browserBuildIdentity, resolveBuildOverlay, sha256 } from './common.mjs';
import { verifyBuildSeal } from './harness.mjs';
import { validateReceipt, MAX_RECEIPT_BYTES } from './receipt.mjs';

function fixture() {
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64, textureSize: 64 }), scene = new Scene(engine);
  const camera = new FreeCamera('actual native CPU camera', new Vector3(0, 0, -8), scene); camera.setTarget(Vector3.Zero());
  const standard = new StandardMaterial('actual standard', scene), pbr = new PBRMaterial('actual PBR', scene);
  const a = CreateBox('actual standard box', {}, scene), b = CreateBox('actual PBR box', {}, scene);
  a.position.x = -1; a.material = standard; b.position.x = 1; b.material = pbr;
  const game = { scene, engine, ready: true, disposed: false };
  return { engine, scene, game, a, b, standard, pbr, close: () => { scene.dispose(); engine.dispose(); } };
}
const selected = (profile, id, phase) => profile.frames.flatMap(frame => frame.rows).filter(row => row.id === id && (!phase || row.phase === phase));
const calls = rows => rows.reduce((sum, row) => sum + row.calls, 0);

test('donor source identity, pin9.30 own methods and precise readiness observer order', async () => {
  const donor = gunzipSync(await readFile(new URL('../../webgpu-migration-20261016/f3-routine-profile/overlay/client/qa-routine-profile.ts.gz', import.meta.url)));
  assert.equal(sha256(donor), 'ee3c3280de69ee61dcbf433dcf2a259d07a4efa80a711f822056da331168289f');
  const pin = JSON.parse(await readFile(new URL('../../../../../node_modules/@babylonjs/core/package.json', import.meta.url)));
  assert.equal(pin.version, '9.30.0');
  for (const [target, key] of [[Scene.prototype, '_activeMesh'], [TransformNode.prototype, 'computeWorldMatrix'], [Mesh.prototype, 'getLOD'],
    [PBRBaseMaterial.prototype, 'isReadyForSubMesh'], [StandardMaterial.prototype, 'isReadyForSubMesh'],
    [PBRBaseMaterial.prototype, 'bindForSubMesh'], [StandardMaterial.prototype, 'bindForSubMesh']]) assert.equal(typeof Object.getOwnPropertyDescriptor(target, key)?.value, 'function');
  const body = Mesh.prototype.render.toString();
  assert.ok(body.indexOf('_getInstancesRenderList') < body.indexOf('_onBeforeRenderObservable.notifyObservers'));
  assert.ok(body.indexOf('_onBeforeRenderObservable.notifyObservers') < body.indexOf('material.isReadyForSubMesh'));
  assert.ok(body.indexOf('material.isReadyForSubMesh') < body.indexOf('_onBeforeBindObservable.notifyObservers'));
  assert.ok(body.indexOf('_onBeforeBindObservable.notifyObservers') < body.indexOf('effectiveMaterial.bindForSubMesh'));
});

test('donor nested timing preserves receiver/return/false/throw/Promise with selected-only self', () => {
  let time = 0; const primary = new Error('original'), promise = Promise.resolve('original promise');
  const target = { inner(value) { assert.equal(this, target); time += 3; return value; },
    outer() { time += 2; this.inner(false); time += 4; return promise; }, fail() { time += 5; throw primary; } };
  const originals = { ...target };
  const profile = new RoutineCallProfile(['inner', 'outer', 'fail'].map(id => ({ id, target, key: id })), { now: () => time });
  profile.beginFrame(1); assert.equal(target.outer(), promise); assert.throws(() => target.fail(), error => error === primary);
  const result = profile.endFrame(), row = id => result.rows.find(value => value.id === id && value.phase === 'other');
  assert.equal(row('outer').inclusiveMs, 9); assert.equal(row('outer').selfSelectedMs, 6);
  assert.equal(row('inner').falseReturns, 1); assert.equal(row('fail').throws, 1); assert.equal(row('fail').inclusiveMs, 5);
  profile.dispose(); assert.deepEqual(target, originals);
});

test('foreign receiver bypasses all clocks/phase checks, stale disposal and faulty clocks preserve primary result', () => {
  const target = { call() { return this.value; } }, own = { value: 7 }, foreign = { value: 9 }; let clocks = 0;
  const profile = new RoutineCallProfile([{ id: 'call', target, key: 'call', accepts: receiver => receiver === own }], { now: () => { clocks++; return clocks; }, phase: () => 'main' });
  profile.beginFrame(0); assert.equal(target.call.call(foreign), 9); assert.equal(clocks, 0);
  assert.equal(target.call.call(own), 7); assert.equal(clocks, 2); profile.endFrame(); profile.dispose();
  const primary = new Error('same throw'), failing = { call() { throw primary; } };
  const bad = new RoutineCallProfile([{ id: 'bad', target: failing, key: 'call' }], { now() { throw new Error('observer only'); } });
  bad.beginFrame(0); assert.throws(() => failing.call(), error => error === primary); assert.ok(bad.endFrame().errors); bad.dispose();
});

test('transaction bounds/unsupported descriptors/ownership and foreign descriptor restoration', () => {
  const target = { call() { return 1; } }, original = target.call;
  assert.throws(() => new RoutineCallProfile(Array.from({ length: 9 }, (_, i) => ({ id: String(i), target: { call() {} }, key: 'call' }))));
  assert.throws(() => new RoutineCallProfile([{ id: 'a', target, key: 'call' }, { id: 'bad', target: {}, key: 'missing' }])); assert.equal(target.call, original);
  const profile = new RoutineCallProfile([{ id: 'a', target, key: 'call' }]);
  assert.throws(() => new RoutineCallProfile([{ id: 'other', target, key: 'call' }]));
  const foreign = () => 2; target.call = foreign; assert.equal(profile.dispose().restoreConflicts, 1); assert.equal(target.call, foreign);
  const accessor = Object.defineProperty({}, 'call', { get() { throw new Error('must not read'); } });
  assert.throws(() => new RoutineCallProfile([{ id: 'a', target: accessor, key: 'call' }]));
  assert.throws(() => new RoutineCallProfile([{ id: 'a', target, key: 'call', expected: original }]));
});

test('stack32 and call budgets are bounded, explicit and do not suppress original calls', () => {
  let originalCalls = 0, time = 0; const target = { recurse(depth) { originalCalls++; return depth ? this.recurse(depth - 1) : false; } };
  const profile = new RoutineCallProfile([{ id: 'recursive', target, key: 'recurse' }], { now: () => time++ });
  profile.beginFrame(0); assert.equal(target.recurse(40), false); const a = profile.endFrame(); assert.equal(originalCalls, 41); assert.equal(a.depthSkipped, 9);
  profile.beginFrame(1); for (let i = 0; i <= ROUTINE_LIMITS.callsPerFrame; i++) target.recurse(0);
  const b = profile.endFrame(); assert.equal(b.callsSkipped, 1); assert.equal(b.rows.reduce((n, row) => n + row.calls, 0), ROUTINE_LIMITS.callsPerFrame); profile.dispose();
});

test('defaultoff touches no game/descriptor and actual scene captures exactly8 native frames then restores', async () => {
  assert.equal(captureRoutineCost(new Proxy({}, { get() { throw new Error('off must not touch Game'); } })), undefined);
  const f = fixture(), original = Scene.prototype._activeMesh, provider = f.scene.getActiveMeshCandidates;
  try {
    // NullEngine is a CPU fixture only; allow its original native effects to settle.
    f.scene.render(); await new Promise(setImmediate);
    const before = f.scene._frameId, owner = captureRoutineCost(f.game, { enabled: true });
    assert.throws(() => captureRoutineCost(f.game, { enabled: true }), /unowned/);
    for (let i = 0; i < 8; i++) { f.scene.render(); await new Promise(setImmediate); }
    const result = await owner.done;
    assert.equal(f.scene._frameId - before, 8); assert.equal(result.complete, true); assert.equal(result.frames.length, 8);
    assert.deepEqual(result.targets, ROUTINE_IDS); assert.ok(calls(selected(result, ROUTINE_IDS[0], 'active')) >= 8);
    assert.ok(calls(selected(result, ROUTINE_IDS[1], 'active')) >= 8);
    for (const id of ROUTINE_IDS.slice(2)) assert.ok(calls(selected(result, id)) > 0, id);
    assert.ok(calls(selected(result, ROUTINE_IDS[4], 'main')) > 0); assert.ok(calls(selected(result, ROUTINE_IDS[6], 'main')) > 0);
    assert.equal(f.scene.getActiveMeshCandidates, provider); assert.equal(Scene.prototype._activeMesh, original); assert.equal(Object.hasOwn(f.scene, 'render'), false);
    f.scene.render(); assert.deepEqual(owner.snapshot(), result); validateRoutineProfile(result);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 80000); assert.ok(Buffer.byteLength(JSON.stringify(result)) < MAX_RECEIPT_BYTES);
    for (const mutate of [value => { value.frames[0].rows[0].id = 'wrong'; }, value => { value.frames[0].rows[0].calls = 100001; },
      value => { value.frames[0].progressed = false; }, value => { value.targets.pop(); }, value => { value.frames[0].rows[0].selfSelectedMs = Infinity; }]) {
      const changed = structuredClone(result); mutate(changed); assert.throws(() => validateRoutineProfile(changed));
    }
  } finally { f.close(); }
});

test('actual native material readiness false early return is timed without retry/readiness injection', async () => {
  const f = fixture(); let observed = 0;
  try {
    // Real native material readiness sees a native Texture with no terminal GPU resource.
    const texture = new Texture(null, f.scene), original = texture.isReadyOrNotBlocking;
    texture.isReadyOrNotBlocking = function (...args) { observed++; return Reflect.apply(original, this, args); };
    f.pbr.albedoTexture = texture;
    const owner = captureRoutineCost(f.game, { enabled: true });
    for (let i = 0; i < 8; i++) f.scene.render();
    const result = await owner.done;
    assert.ok(selected(result, ROUTINE_IDS[4]).some(row => row.falseReturns > 0));
    assert.equal(observed, calls(selected(result, ROUTINE_IDS[4])));
  } finally { f.pbr.albedoTexture = null; f.close(); }
});

test('actual pinned PBR synchronous readiness throw keeps original Error and records failed frame without retries', async () => {
  const f = fixture(), primary = new Error('original texture readiness throw'); let calls = 0;
  try {
    const texture = new Texture(null, f.scene);
    texture.isReadyOrNotBlocking = () => { calls++; throw primary; }; f.pbr.albedoTexture = texture;
    const owner = captureRoutineCost(f.game, { enabled: true }); assert.throws(() => f.scene.render(), error => error === primary);
    const result = await owner.done;
    assert.equal(calls, 1); assert.equal(result.complete, false); assert.equal(result.frames[0].threw, true);
    assert.equal(selected(result, ROUTINE_IDS[4]).reduce((n, row) => n + row.throws, 0), 1);
    assert.equal(result.reason, 'original-render-threw'); assert.equal(result.remainingRoutineHooks, 0); validateRoutineProfile(result);
  } finally { f.pbr.albedoTexture = null; f.close(); }
});

test('partial defineProperty failure rolls back transaction, hardened foreign flags are retained', () => {
  const underlying = { call() { return 7; } }, original = underlying.call; let failOnce = true;
  const proxy = new Proxy(underlying, { defineProperty(target, key, descriptor) { Reflect.defineProperty(target, key, descriptor); if (failOnce) { failOnce = false; throw new Error('partial install'); } return true; } });
  assert.throws(() => new RoutineCallProfile([{ id: 'partial', target: proxy, key: 'call' }])); assert.equal(underlying.call, original);
  const target = { call() { return 1; } }, profile = new RoutineCallProfile([{ id: 'hardened', target, key: 'call' }]);
  Object.defineProperty(target, 'call', { configurable: false, writable: false });
  assert.equal(profile.dispose().restoreConflicts, 1); assert.equal(Object.getOwnPropertyDescriptor(target, 'call').configurable, false);
});

test('dispose and fresh owner inside original call cannot clock or mutate new frame generation', () => {
  let old, fresh, retiring = true, clocks = 0;
  const target = { call() {
    if (retiring) { retiring = false; old.dispose(); fresh = new RoutineCallProfile([{ id: 'fresh', target, key: 'call' }], { now: () => ++clocks }); fresh.beginFrame(2); }
    return false;
  } };
  old = new RoutineCallProfile([{ id: 'old', target, key: 'call' }], { now: () => ++clocks }); old.beginFrame(1);
  assert.equal(target.call(), false); assert.equal(clocks, 1); assert.equal(fresh.endFrame().rows.reduce((n, row) => n + row.calls, 0), 0);
  fresh.beginFrame(3); assert.equal(target.call(), false); assert.equal(fresh.endFrame().rows.reduce((n, row) => n + row.falseReturns, 0), 1); fresh.dispose();
});

test('actual receiver filtering excludes a second scene sharing native prototypes', async () => {
  const f = fixture(), other = fixture(); let clocks = 0;
  try {
    const observer = f.scene.onBeforeRenderObservable.add(() => {
      const before = clocks; other.scene._activeMesh(other.a, other.a); other.a.computeWorldMatrix(); other.a.getLOD(other.scene.activeCamera);
      other.standard.isReadyForSubMesh(other.a, other.a.subMeshes[0]); assert.equal(clocks, before);
    });
    const owner = captureRoutineCost(f.game, { enabled: true, now: () => ++clocks });
    for (let i = 0; i < 8; i++) f.scene.render();
    assert.equal((await owner.done).complete, true); f.scene.onBeforeRenderObservable.remove(observer);
  } finally { f.close(); other.close(); }
});

test('actual ObjectRenderer public phase scopes distinguish RTT/active/main/other and detect unbalanced bounds', async () => {
  const f = fixture(), renderer = new ObjectRenderer('actual native object renderer', f.scene);
  try {
    const observer = f.scene.onBeforeRenderObservable.add(() => {
      f.a.computeWorldMatrix(); renderer.onInitRenderingObservable.notifyObservers(); f.a.computeWorldMatrix(); renderer.onFinishRenderingObservable.notifyObservers();
    });
    const owner = captureRoutineCost(f.game, { enabled: true });
    for (let i = 0; i < 8; i++) f.scene.render();
    const result = await owner.done;
    for (const phase of ['rtt', 'active', 'other']) assert.ok(calls(selected(result, ROUTINE_IDS[2], phase)) > 0, phase);
    assert.equal(result.complete, true); f.scene.onBeforeRenderObservable.remove(observer);
    const bad = f.scene.onBeforeRenderObservable.add(() => { for (let i = 0; i < 129; i++) renderer.onInitRenderingObservable.notifyObservers(); });
    const invalid = captureRoutineCost(f.game, { enabled: true }); f.scene.render(); invalid.dispose('bounded-phase-fixture');
    assert.ok((await invalid.done).phaseErrors > 0); assert.equal((await invalid.done).complete, false); f.scene.onBeforeRenderObservable.remove(bad);
  } finally { renderer.dispose(); f.close(); }
});

test('original render throw, scene dispose, abort, retirement and rejoin retain failed evidence and restore ownership', async () => {
  for (const scenario of ['throw', 'dispose', 'abort', 'retired']) {
    const f = fixture(), primary = new Error('same actual render throw'), controller = new AbortController(); let retired = false;
    const original = Scene.prototype._activeMesh;
    try {
      const owner = captureRoutineCost(f.game, { enabled: true, signal: controller.signal, isRetired: () => retired });
      if (scenario === 'throw') { const observer = f.scene.onBeforeDrawPhaseObservable.add(() => { throw primary; }); assert.throws(() => f.scene.render(), e => e === primary); f.scene.onBeforeDrawPhaseObservable.remove(observer); }
      if (scenario === 'dispose') f.scene.dispose();
      if (scenario === 'abort') controller.abort();
      if (scenario === 'retired') { retired = true; f.scene.render(); }
      const result = await owner.done; assert.equal(result.complete, false); assert.equal(Scene.prototype._activeMesh, original); assert.equal(Object.hasOwn(f.scene, 'render'), false);
      if (scenario !== 'dispose') { const fresh = captureRoutineCost(f.game, { enabled: true }); owner.dispose(); fresh.dispose('fresh-rejoin'); assert.equal((await fresh.done).reason, 'fresh-rejoin'); }
    } finally { f.close(); }
  }
});

test('foreign render/prototype replacement survives cleanup and marks evidence incomplete', async () => {
  const f = fixture(), original = TransformNode.prototype.computeWorldMatrix;
  try {
    const owner = captureRoutineCost(f.game, { enabled: true }), foreign = () => f.scene, foreignWorld = function () { return this._worldMatrix; };
    Object.defineProperty(f.scene, 'render', { value: foreign, configurable: true, writable: true });
    TransformNode.prototype.computeWorldMatrix = foreignWorld; owner.dispose('foreign replacement');
    const result = await owner.done; assert.equal(f.scene.render, foreign); assert.equal(TransformNode.prototype.computeWorldMatrix, foreignWorld);
    assert.ok(result.restoreConflicts >= 2); assert.equal(result.complete, false);
    assert.throws(() => captureRoutineCost(f.game, { enabled: true }), /drift/);
  } finally { delete f.scene.render; TransformNode.prototype.computeWorldMatrix = original; f.close(); }
});

test('new flag is defaultoff, strict explicit CLI, canonical/sealed/browser identity and receipt bounds', () => {
  assert.equal(parseBuildOptions([]).routineCost, false); assert.equal(parseBuildOptions(['--routine-cost']).routineCost, true);
  assert.throws(() => parseBuildOptions(['--routine-cost', '--routine-cost']));
  const input = { sourceSnapshotId: sha256('source'), helperSha256: sha256('helper'), label: 'routine-test', loading: 'original', transforms: {}, clock: null, weather: null, startupLatency: false, shaderAttribution: false, routineCost: true, dependencies: {} };
  const template = 'export const identity=__WEBGPU_COMPLETION_IDENTITY__;', overlayBytes = Buffer.from(resolveBuildOverlay(template, input));
  const sealed = { ...browserBuildIdentity(input), transforms: {}, snapshot: '/CPU-only', helperFiles: {}, sourceFiles: 0, observerSha256: 'observer', overlaySha256: sha256(overlayBytes), dependencies: {} };
  const inputBytes = Buffer.from(JSON.stringify(sealed));
  const bundleJavaScript = { 'assets/test.js': Buffer.from(JSON.stringify(browserBuildIdentity(input))) }, bundleFiles = { 'assets/test.js': sha256(bundleJavaScript['assets/test.js']) };
  const identity = { ...sealed, buildInputSha256: sha256(inputBytes), bundleFiles }, proof = { inputBytes, overlayBytes, overlayTemplate: template, bundleFiles, bundleJavaScript };
  assert.doesNotThrow(() => verifyBuildSeal(identity, sealed, proof));
  const deleted = { ...identity }; delete deleted.routineCost; assert.throws(() => verifyBuildSeal(deleted, sealed, proof));
  const changed = { ...identity, routineCost: false }; changed.buildId = buildDigest(changed); assert.throws(() => verifyBuildSeal(changed, sealed, proof));
  const missing = { ...input }; delete missing.routineCost; assert.throws(() => buildDigest(missing));
  assert.throws(() => buildDigest({ ...input, routineCost: 1 }));
  const raw = { schemaVersion: 1, ...browserBuildIdentity(input), attemptId: '8e9e7e15-6011-438d-96a2-53be43f17792', atMs: 1, timeOrigin: 1, observerErrors: [],
    kind: 'routine-cost', mode: 'diagnostic', before: {}, after: {}, completed: false, routineProfile: null, validationErrors: ['explicit failed capture'] };
  assert.equal(validateReceipt(raw, identity), raw); assert.throws(() => validateReceipt({ ...raw, mode: 'plain' }, identity));
  assert.throws(() => validateReceipt(raw, { ...identity, routineCost: false })); assert.throws(() => validateReceipt({ ...raw, completed: true }, identity));
  assert.throws(() => validateRoutineProfile({ schemaVersion: 1, complete: false, frames: Array(9).fill({}) }));
});
