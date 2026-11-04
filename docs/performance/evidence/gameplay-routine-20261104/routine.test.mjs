import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformGame, transformDonor, marker, assertExtra, extraInputs, finishDiagnosticServe } from './run.mjs';
import { startRoutineCapture, validateMaterialRows } from './browser.mjs';

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
  const options = { document, identity: { test: true }, capture() { captureCalls++; return owner; }, validate() {}, validateMaterials() { return []; },
    setTimeout(_fn, ms) { deadline = ms; return 1; }, clearTimeout() { cleared++; } };
  assert.equal(startRoutineCapture(game, options), false);
  assert.equal(startRoutineCapture(game, options), false); assert.equal(captureCalls, 1); assert.equal(deadline, 30000);
  finish({ complete: true, materialOmitted: { calls: 0 } }); await Promise.resolve(); await Promise.resolve();
  assert.equal(JSON.parse(nodes[0].children[1].textContent).completed, true);
  assert.equal(disposed, 1); assert.equal(removed, 1); assert.equal(cleared, 1);
  nodes[0].children[0].onclick(); assert.equal(nodes[0].removed, true);
});

async function instrumentedCore() {
  const source = await readFile(new URL('../webgpu-completion-20261021/measurement/routine-cost-core.mjs', import.meta.url), 'utf8');
  const transformed = transformDonor('routine-cost-core.mjs', source);
  assert.throws(() => transformDonor('routine-cost-core.mjs', transformed));
  const capture = await readFile(new URL('../webgpu-completion-20261021/measurement/routine-cost.mjs', import.meta.url), 'utf8');
  assert.ok(transformDonor('routine-cost.mjs', capture).includes('materialRowLimit: 256'));
  assert.throws(() => transformDonor('routine-cost.mjs', capture.replace('return { schemaVersion: 1, scope: ROUTINE_SCOPE,', 'drift')));
  return import('data:text/javascript;base64,' + Buffer.from(transformed).toString('base64'));
}
test('material attribution uses the same elapsed values and matches readiness/bind totals', async () => {
  const { RoutineCallProfile, ROUTINE_IDS } = await instrumentedCore();
  let clock = 0, classReads = 0;
  const targets = ROUTINE_IDS.map(id => ({ id, target: { call() { clock += 2; return true; } }, key: 'call' }));
  const core = new RoutineCallProfile(targets, { now: () => clock });
  const a = { uniqueId: 7, name: 'car paint', metadata: { materialKey: 'paint', assetId: 'car-13', vehiclePaint: true, privateThing: 'omit' }, getClassName() { classReads++; return 'PBRMaterial'; } };
  const b = { uniqueId: 8, name: 'tree leaves', getClassName() { classReads++; return 'PBRMaterial'; } };
  try {
    core.beginFrame(1);
    targets[6].target.call.call(a); targets[6].target.call.call(a); targets[6].target.call.call(b); targets[4].target.call.call(a);
    const frame = core.endFrame(), rows = [...core.materialRows.values()];
    const timing = { materialRowLimit: 256, materialRows: rows, materialOmitted: core.materialOmitted, frames: [frame] };
    assert.equal(validateMaterialRows(timing).length, 3); assert.equal(classReads, 3);
    assert.deepEqual(rows[0].metadata, { materialKey: 'paint', assetId: 'car-13', vehiclePaint: true }); assert.equal(rows[0].calls, 2); assert.equal(rows[0].inclusiveMs, 4);
    assert.throws(() => validateMaterialRows({ ...timing, materialRows: rows.slice(1) }), /totals/);
    core.beginFrame(2); targets[6].target.call.call(a); assert.equal(classReads, 3); core.endFrame();
  } finally { core.dispose(); }
});
test('material rows cap at256 while dropped cost and repeated known owners remain exact', async () => {
  const { RoutineCallProfile, ROUTINE_IDS } = await instrumentedCore(); let clock = 0;
  const targets = ROUTINE_IDS.map(id => ({ id, target: { call() { clock++; } }, key: 'call' }));
  const core = new RoutineCallProfile(targets, { now: () => clock }), first = { uniqueId: 0, name: 'first' };
  try {
    core.beginFrame(1); targets[6].target.call.call(first);
    for (let id = 1; id <= 257; id++) targets[6].target.call.call({ uniqueId: id, name: 'bounded' });
    targets[6].target.call.call(first);
    const frame = core.endFrame(); assert.equal(core.materialRows.size, 256);
    assert.deepEqual(core.materialOmitted, { calls: 2, inclusiveMs: 2 });
    validateMaterialRows({ materialRowLimit: 256, materialRows: [...core.materialRows.values()], materialOmitted: core.materialOmitted, frames: [frame] });
  } finally { core.dispose(); }
});
test('serve persists diagnostic cleanup on success and drift, preserving original errors', async () => {
  const files = { donor: { sha256: 'fixed' } }, identity = { diagnostic: { files } }, records = [];
  const options = { read: async () => files, exists: async () => true, save: async (path, value) => records.push({ path, value }) };
  await finishDiagnosticServe(identity, '/candidate13/runs/run1', async () => {}, options);
  assert.equal(records[0].value.extraInputsValidated, true); assert.match(records[0].path, /diagnostic-cleanup.json$/);
  const original = new Error('canonical failure');
  await assert.rejects(finishDiagnosticServe(identity, '/candidate13/runs/run2', async () => { throw original; },
    { ...options, read: async () => ({ changed: true }) }), error => error instanceof AggregateError && error.errors.includes(original));
  assert.equal(records[1].value.extraInputsValidated, false); assert.match(records[1].value.serveError, /canonical failure/);
});
