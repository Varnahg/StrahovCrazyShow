import test from "node:test";
import assert from "node:assert/strict";
import { AvatarPreviewFrameWork } from "../client/avatar-preview-cache";

function fixture() {
  let sequence = 0,
    renders = 0,
    checks = 0,
    ready = false;
  const frames = new Map<number, () => void>();
  const retries = new Map<number, () => void>();
  const work = new AvatarPreviewFrameWork({
    render: () => {
      renders++;
    },
    ready: () => {
      checks++;
      return ready;
    },
    requestFrame: (callback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
    requestCheck: (callback) => {
      retries.set(++sequence, callback);
      return sequence;
    },
    cancelCheck: (id) => {
      retries.delete(id);
    },
  });
  const flush = (queue: Map<number, () => void>) => {
    const pending = [...queue.values()];
    queue.clear();
    for (const callback of pending) callback();
  };
  return {
    work,
    frames,
    retries,
    flush,
    setReady: () => {
      ready = true;
    },
    counts: () => ({ renders, checks }),
  };
}

test("rapid edits coalesce draws and asynchronous readiness retains at most one retry", () => {
  const { work, frames, retries, flush, setReady, counts } = fixture();
  for (let edit = 0; edit < 20; edit++) work.invalidate(true);
  assert.equal(frames.size, 1);
  flush(frames);
  assert.deepEqual(counts(), { renders: 1, checks: 1 });
  assert.equal(retries.size, 1);
  for (let edit = 0; edit < 20; edit++) work.invalidate(true);
  flush(frames);
  assert.equal(retries.size, 1);
  setReady();
  flush(retries);
  flush(frames);
  assert.deepEqual(counts(), { renders: 3, checks: 3 });
  assert.equal(retries.size, 0);
  assert.equal(frames.size, 0);
  work.invalidate(); // rotation only, shader readiness stays resolved
  flush(frames);
  assert.deepEqual(counts(), { renders: 4, checks: 3 });
  work.dispose();
});

test("hidden or disposed previews cancel all work, including a late callback already dequeued by the host", () => {
  const { work, frames, retries, flush, setReady, counts } = fixture();
  work.invalidate(true);
  const staleFrame = [...frames.values()][0];
  work.setActive(false);
  staleFrame();
  assert.deepEqual(counts(), { renders: 0, checks: 0 });
  assert.equal(frames.size, 0);
  work.invalidate(true);
  assert.equal(frames.size, 0);
  work.setActive(true);
  flush(frames);
  assert.equal(retries.size, 1);
  const staleRetry = [...retries.values()][0];
  work.setActive(false);
  assert.equal(retries.size, 0);
  staleRetry();
  assert.equal(frames.size, 0);
  setReady();
  work.setActive(true);
  staleFrame();
  staleRetry();
  assert.equal(
    frames.size,
    1,
    "old callbacks cannot clear or duplicate the resumed generation's draw",
  );
  flush(frames);
  assert.deepEqual(counts(), { renders: 2, checks: 2 });
  work.invalidate(true);
  work.dispose();
  work.dispose();
  work.setActive(true);
  staleRetry();
  assert.equal(frames.size, 0);
  assert.equal(retries.size, 0);
});
