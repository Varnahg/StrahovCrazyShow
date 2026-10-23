import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ready } from './fixture.mjs';
import { moduleAt } from './loader.mjs';
const { ObjectRenderer } = await moduleAt('Rendering/objectRenderer.js');
const { DirectionalLight } = await moduleAt('Lights/directionalLight.js');
const { ShadowGenerator } = await moduleAt('Lights/Shadows/shadowGenerator.js');
const { Vector3 } = await moduleAt('Maths/math.vector.js');

const entry = (w, sub, generator, pass) => w._subMeshToDepthWrapperByPass.get(sub)?.get(generator)?.get(pass);
const releases = (f, wrapper) => f.contexts.find(row => row.context === wrapper.drawContext).releases();

test('notified main base cannot evict an independent canonical shadow pass; cached readiness need not renotify', async t => {
  const f = await fixture(); t.after(f.dispose);
  const w = f.wrapper(), a = f.mesh(), shadow = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  const main = await f.base({ defines: '#define MAIN_PASS' });
  f.notify(a.sub, main, 2);
  assert.equal(w._subMeshToEffect.get(a.sub)[0], main);
  assert.equal(w._makeEffect(a.sub, f.depth, f.generator, 0), shadow);
  assert.equal(shadow.isDisposed, false); assert.equal(shadow._refCount, 1);
  assert.equal(w.getEffect(a.sub, f.generator, 2), null, 'known canonical pass cannot borrow another pass entry');
  const depthMain = await ready(w._makeEffect(a.sub, f.depth, f.generator, 2));
  assert.notEqual(depthMain, shadow);
  const changed = await f.base(); f.notify(a.sub, changed, 2);
  assert.equal(depthMain.isDisposed, true); assert.equal(shadow.isDisposed, false);
  assert.equal(w.getEffect(a.sub, f.generator, 0).effect, shadow);
});

test('same notified Effect in two canonical passes owns two acquires even when the engine program is shared', async t => {
  const f = await fixture(); t.after(f.dispose);
  const w = f.wrapper(), a = f.mesh(), first = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  f.notify(a.sub, f.original, 2);
  const second = await ready(w._makeEffect(a.sub, f.depth, f.generator, 2));
  assert.equal(second, first); assert.equal(first._refCount, 2);
  const left = w.getEffect(a.sub, f.generator, 0), right = w.getEffect(a.sub, f.generator, 2);
  assert.notEqual(left, right); assert.notEqual(left.drawContext, right.drawContext);
  f.engine.releaseRenderPassId(2);
  assert.equal(first._refCount, 1); assert.equal(first.isDisposed, false);
  assert.equal(right.effect, null); assert.equal(releases(f, right), 1);
  assert.equal(w.getEffect(a.sub, f.generator, 2), null);
  assert.equal(w._makeEffect(a.sub, f.depth, f.generator, 0), first);
  const baseRefs = f.original._refCount;
  f.engine.releaseRenderPassId(0);
  assert.equal(first.isDisposed, true); assert.equal(first._refCount, 0);
  assert.equal(f.original._refCount, baseRefs, 'canonical bases are borrowed');
  assert.equal(f.original.isDisposed, false); assert.equal(releases(f, left), 1);
});

test('getEffect aliases acquire contexts only; becoming canonical and pass retirement leave original owner intact', async t => {
  const f = await fixture(); t.after(f.dispose);
  const w = f.wrapper(), a = f.mesh(), first = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  const alias = w.getEffect(a.sub, f.generator, 8);
  assert.equal(alias.effect, first); assert.equal(first._refCount, 1);
  f.notify(a.sub, f.original, 8);
  assert.equal(alias.effect, null); assert.equal(releases(f, alias), 1);
  assert.equal(first.isDisposed, false); assert.equal(w.getEffect(a.sub, f.generator, 8), null);
  await ready(w._makeEffect(a.sub, f.depth, f.generator, 8));
  assert.equal(first._refCount, 2);
  const otherAlias = w.getEffect(a.sub, f.generator, 9);
  f.engine.releaseRenderPassId(9);
  assert.equal(otherAlias.effect, null); assert.equal(releases(f, otherAlias), 1);
  assert.equal(first._refCount, 2);
  w.dispose(); assert.equal(first._refCount, 0); assert.equal(first.isDisposed, true);
});

test('actual ObjectRenderer first-create undefined release events cannot retire another prepared pass', async t => {
  const f = await fixture(); t.after(f.dispose);
  const w = f.wrapper(), a = f.mesh(), effect = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  const seen = [], observer = f.engine._onReleaseRenderPassObservable.add(id => seen.push(id));
  const renderer = new ObjectRenderer('independent newly constructed RTT renderer', f.scene);
  assert.ok(seen.includes(undefined), 'pinned first-create release was actually observed');
  assert.equal(w.getEffect(a.sub, f.generator, 0).effect, effect);
  assert.equal(effect._refCount, 1); assert.equal(effect.isDisposed, false);
  renderer.dispose(); f.engine._onReleaseRenderPassObservable.remove(observer);
  assert.equal(w._makeEffect(a.sub, f.depth, f.generator, 0), effect);
});

test('released pass rejects late notifications and cannot revive entries; zero remains a real pass', async t => {
  const f = await fixture(); t.after(f.dispose);
  const w = f.wrapper(), a = f.mesh(), effect = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  assert.equal(entry(w, a.sub, f.generator, 0).originalEffect, f.original);
  f.engine.releaseRenderPassId(0); f.notify(a.sub, f.original, 0);
  assert.equal(w._subMeshToEffectByPass.get(a.sub), undefined);
  assert.equal(w._makeEffect(a.sub, f.depth, f.generator, 0), null);
  assert.equal(w.getEffect(a.sub, f.generator, 0), null); assert.equal(effect.isDisposed, true);
  for (const invalid of [undefined, null, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(w._makeEffect(a.sub, f.depth, f.generator, invalid), null);
  }
});

test('notified pending hot-swap base stays authoritative over an installed old-ready drawWrapper', async t => {
  const f = await fixture(); t.after(f.dispose);
  const w = f.wrapper(), a = f.mesh();
  a.sub.setEffect(f.original, '', undefined);
  const old = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  const pending = await f.base(); const originalReady = pending.isReady;
  pending.isReady = () => false; f.notify(a.sub, pending);
  assert.equal(a.sub._getDrawWrapper(0).effect, f.original); assert.equal(f.original.isReady(), true);
  assert.equal(old.isDisposed, true); assert.equal(w._makeEffect(a.sub, f.depth, f.generator, 0), null);
  assert.equal(w.getEffect(a.sub, f.generator, 0), null);
  pending.isReady = originalReady;
  const next = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  assert.notEqual(next, old); assert.equal(entry(w, a.sub, f.generator, 0).originalEffect, pending);
});

test('actual ShadowGenerator RTT resize retires only the old pass and can prepare its new live pass', async t => {
  const f = await fixture(); t.after(f.dispose);
  const light = new DirectionalLight('RTT lifetime', Vector3.Down(), f.scene);
  const generator = new ShadowGenerator(16, light), w = f.wrapper(), a = f.mesh();
  const before = generator.getShadowMap().renderPassId;
  f.notify(a.sub, f.original, before);
  const first = await ready(w._makeEffect(a.sub, f.depth, generator, before));
  const other = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  assert.equal(first, other); assert.equal(first._refCount, 2);
  generator.mapSize = 32;
  const after = generator.getShadowMap().renderPassId; assert.notEqual(after, before);
  assert.equal(first._refCount, 1); assert.equal(w.getEffect(a.sub, generator, before), null);
  assert.equal(w._subMeshToEffectByPass.get(a.sub).has(before), false);
  f.notify(a.sub, f.original, after);
  assert.equal(await ready(w._makeEffect(a.sub, f.depth, generator, after)), first);
  generator.dispose(); assert.equal(first._refCount, 1); assert.equal(other.isDisposed, false);
});

for (const action of ['notify-current', 'release-current', 'dispose-mesh', 'dispose-wrapper'])
  test(`reentrant ${action} during original create releases its acquired Effect and cannot install stale ownership`, async t => {
    const f = await fixture(); t.after(f.dispose);
    const w = f.wrapper(), a = f.mesh(), replacement = await f.base(), create = f.engine.createEffect;
    let acquired;
    f.engine.createEffect = function (...args) {
      acquired = Reflect.apply(create, this, args);
      f.engine.createEffect = create;
      if (action === 'notify-current') f.notify(a.sub, replacement);
      if (action === 'release-current') f.engine.releaseRenderPassId(0);
      if (action === 'dispose-mesh') a.mesh.dispose();
      if (action === 'dispose-wrapper') w.dispose();
      return acquired;
    };
    assert.equal(w._makeEffect(a.sub, f.depth, f.generator, 0), null);
    assert.equal(acquired._refCount, 0); assert.equal(acquired.isDisposed, true);
    assert.equal(w.getEffect(a.sub, f.generator, 0), null);
    await new Promise(resolve => setTimeout(resolve, 5));
  });

test('reentrant unrelated main notify preserves the in-flight shadow acquire and original ready ownership', async t => {
  const f = await fixture(); t.after(f.dispose);
  const w = f.wrapper(), a = f.mesh(), main = await f.base(), create = f.engine.createEffect;
  f.engine.createEffect = function (...args) {
    const effect = Reflect.apply(create, this, args); f.engine.createEffect = create;
    f.notify(a.sub, main, 2); return effect;
  };
  const effect = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  assert.equal(effect._refCount, 1); assert.equal(entry(w, a.sub, f.generator, 0).originalEffect, f.original);
  assert.equal(w._subMeshToEffectByPass.get(a.sub).get(2)[0], main);
});

test('best-effort release balances every acquired entry/context and preserves a first falsy cleanup error', async t => {
  const f = await fixture(); t.after(f.dispose);
  const w = f.wrapper(), a = f.mesh(), one = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  f.notify(a.sub, f.original, 2); await ready(w._makeEffect(a.sub, f.depth, f.generator, 2));
  const left = w.getEffect(a.sub, f.generator, 0), right = w.getEffect(a.sub, f.generator, 2), alias = w.getEffect(a.sub, f.generator, 3);
  const dispose = left.dispose.bind(left); left.dispose = function (...args) { Reflect.apply(dispose, this, args); throw undefined; };
  let threw = false;
  try { w.dispose(); } catch (error) { threw = true; assert.equal(error, undefined); }
  assert.equal(threw, true); assert.equal(one._refCount, 0); assert.equal(one.isDisposed, true);
  for (const wrapper of [left, right, alias]) { assert.equal(wrapper.effect, null); assert.equal(releases(f, wrapper), 1); }
  assert.equal(w._subMeshToEffectByPass.size, 0); assert.equal(w._subMeshToDepthWrapperByPass.size, 0);
  assert.equal(f.engine._onReleaseRenderPassObservable.hasObservers(), false);
  w.dispose(); assert.equal(one._refCount, 0);
});

test('pass cleanup is reentrant and independent scene owners remain untouched', async t => {
  const f = await fixture(), other = await fixture(); t.after(f.dispose); t.after(other.dispose);
  const w = f.wrapper(), a = f.mesh(), effect = await ready(w._makeEffect(a.sub, f.depth, f.generator, 0));
  const ow = other.wrapper(), b = other.mesh(), foreign = await ready(ow._makeEffect(b.sub, other.depth, other.generator, 0));
  const draw = w.getEffect(a.sub, f.generator, 0), dispose = draw.dispose.bind(draw);
  draw.dispose = function (...args) { f.engine.releaseRenderPassId(0); w.dispose(); return Reflect.apply(dispose, this, args); };
  f.engine.releaseRenderPassId(0);
  assert.equal(effect._refCount, 0); assert.equal(releases(f, draw), 1);
  assert.equal(foreign.isDisposed, false); assert.equal(ow.getEffect(b.sub, other.generator, 0).effect, foreign);
});
