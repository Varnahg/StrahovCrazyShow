import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformGame, marker, assertExtra, extraInputs } from './run.mjs';
import { startRoutineCapture } from './browser.mjs';

test('exact current Game transform preserves startup and declines the HUD benchmark', async () => {
  const source = await readFile(new URL('../../../../client/game.ts', import.meta.url), 'utf8');
  const out = transformGame(source);
  assert.ok(out.includes(marker + '\n    return startRoutineCapture(this);'));
  assert.equal(out.split('return startRoutineCapture(this)').length, 2);
  assert.throws(() => transformGame(out)); assert.throws(() => transformGame(marker + marker));
  assert.throws(() => transformGame('startBenchmark() {}'));
});
test('manifest includes both donors and all helper implementation/tests; drift refuses', async () => {
  const files = await extraInputs();
  assert.equal(Object.keys(files).length, 6);
  assertExtra(files, structuredClone(files));
  assert.throws(() => assertExtra(files, { ...files, 'browser.mjs': { sha256: 'changed' } }));
});
test('capture is bounded, refuses duplicates, publishes JSON and restores lifecycle', async () => {
  const nodes = [], body = { append(node) { nodes.push(node); } };
  const document = { body, createElement() { return { style: {}, append(...children) { this.children = children; }, remove() { this.removed = true; } }; } };
  let finish, captureCalls = 0, disposed = 0, removed = 0, cleared = 0, deadline;
  const owner = { done: new Promise(resolve => { finish = resolve; }), dispose() { disposed++; } };
  const game = { ready: true, scene: { onDisposeObservable: { addOnce() { return { remove() { removed++; } }; } } } };
  const options = { document, identity: { test: true }, capture() { captureCalls++; return owner; }, validate() {},
    setTimeout(_fn, ms) { deadline = ms; return 1; }, clearTimeout() { cleared++; } };
  assert.equal(startRoutineCapture(game, options), false);
  assert.equal(startRoutineCapture(game, options), false); assert.equal(captureCalls, 1); assert.equal(deadline, 30000);
  finish({ complete: true }); await Promise.resolve(); await Promise.resolve();
  assert.equal(JSON.parse(nodes[0].children[1].textContent).completed, true);
  assert.equal(disposed, 1); assert.equal(removed, 1); assert.equal(cleared, 1);
  nodes[0].children[0].onclick(); assert.equal(nodes[0].removed, true);
});
