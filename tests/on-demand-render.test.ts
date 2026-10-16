import test from "node:test";
import assert from "node:assert/strict";
import { OnDemandRender } from "../client/on-demand-render";

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function fixture(frame: () => boolean | Promise<boolean>) {
  const queued = new Map<number, () => void>();
  const errors: unknown[] = [];
  let next = 0,
    visible = true;
  const renderer = new OnDemandRender({
    requestFrame: (callback) => {
      queued.set(++next, callback);
      return next;
    },
    cancelFrame: (handle) => {
      queued.delete(handle);
    },
    visible: () => visible,
    frame,
    onError: (error) => errors.push(error),
  });
  return {
    renderer,
    queued,
    errors,
    visible(value: boolean) {
      visible = value;
      renderer.visibilityChanged();
    },
    async fire() {
      const [key, callback] = queued.entries().next().value!;
      queued.delete(key);
      callback();
      await settle();
    },
  };
}

test("on-demand changes coalesce and a completed frame leaves no idle loop", async () => {
  let frames = 0;
  const f = fixture(() => {
    frames++;
    return false;
  });
  for (let i = 0; i < 10; i++) f.renderer.request();
  assert.equal(f.queued.size, 1);
  await f.fire();
  assert.equal(frames, 1);
  assert.equal(f.queued.size, 0);
  f.renderer.dispose();
});

test("requests during a GPU checkpoint wait and schedule exactly one later frame", async () => {
  let resolve!: (value: boolean) => void;
  const pending = new Promise<boolean>((done) => {
    resolve = done;
  });
  let frames = 0;
  const f = fixture(() => (++frames === 1 ? pending : false));
  f.renderer.request();
  await f.fire();
  f.renderer.request();
  f.renderer.request();
  assert.equal(f.queued.size, 0);
  resolve(false);
  await settle();
  assert.equal(f.queued.size, 1);
  await f.fire();
  assert.equal(frames, 2);
  assert.equal(f.queued.size, 0);
  f.renderer.dispose();
});

test("hidden state cancels the queued RAF and retains the pending change", async () => {
  let frames = 0;
  const f = fixture(() => {
    frames++;
    return false;
  });
  f.renderer.request();
  f.visible(false);
  f.renderer.request();
  assert.equal(f.queued.size, 0);
  assert.equal(frames, 0);
  f.visible(true);
  assert.equal(f.queued.size, 1);
  await f.fire();
  assert.equal(frames, 1);
  f.renderer.dispose();
});

test("a dequeued RAF from an earlier visible generation cannot submit or clear the current handle", async () => {
  let frames = 0;
  const f = fixture(() => { frames++; return false; });
  f.renderer.request();
  const stale = f.queued.values().next().value!;
  f.visible(false);
  f.visible(true);
  const current = f.queued.values().next().value!;
  stale();
  await settle();
  assert.equal(frames, 0, "cancelled generation cannot render after visibility resumes");
  assert.equal(f.queued.size, 1);
  assert.equal(f.queued.values().next().value, current);
  f.renderer.request();
  assert.equal(f.queued.size, 1, "stale callback cannot clear the current handle");
  await f.fire();
  assert.equal(frames, 1);
  f.renderer.dispose();
  current();
  stale();
  await settle();
  assert.equal(frames, 1, "disposal also rejects callbacks already dequeued");
});

test("dispose suppresses a late checkpoint and preparation repeat", async () => {
  let resolve!: (value: boolean) => void;
  const pending = new Promise<boolean>((done) => {
    resolve = done;
  });
  const f = fixture(() => pending);
  f.renderer.request();
  await f.fire();
  f.renderer.dispose();
  resolve(true);
  await settle();
  assert.equal(f.queued.size, 0);
  assert.deepEqual(f.errors, []);
  f.renderer.request();
  assert.equal(f.queued.size, 0);
});

test("a failed frame is reported once and never spins without another request", async () => {
  const failure = new Error("render failed");
  const f = fixture(() => {
    throw failure;
  });
  f.renderer.request();
  await f.fire();
  assert.deepEqual(f.errors, [failure]);
  assert.equal(f.queued.size, 0);
  f.renderer.dispose();
});
