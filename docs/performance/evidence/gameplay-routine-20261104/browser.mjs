import { captureRoutineCost } from '../webgpu-completion-20261021/measurement/routine-cost.mjs';
import { validateRoutineProfile, ROUTINE_IDS } from '../webgpu-completion-20261021/measurement/routine-cost-core.mjs';

export function validateMaterialRows(timing) {
  const selected = ROUTINE_IDS.slice(4), rows = timing.materialRows, omitted = timing.materialOmitted;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const cost = value => Number.isFinite(value) && value >= 0;
  if (timing.materialRowLimit !== 256 || !Array.isArray(rows) || rows.length > 256 ||
      !omitted || !count(omitted.calls) || !cost(omitted.inclusiveMs)) throw new Error('Material attribution bounds');
  const unique = new Set();
  for (const row of rows) {
    const key = row.routine + ':' + row.materialId;
    if (!selected.includes(row.routine) || !count(row.materialId) || !count(row.calls) || !cost(row.inclusiveMs) || unique.has(key))
      throw new Error('Invalid material attribution row');
    unique.add(key);
  }
  const original = timing.frames.flatMap(frame => frame.rows).filter(row => selected.includes(row.id));
  const equal = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, a, b);
  const sum = (rows, key) => rows.reduce((n, row) => n + row[key], 0);
  if (sum(rows, 'calls') + omitted.calls !== sum(original, 'calls') ||
      !equal(sum(rows, 'inclusiveMs') + omitted.inclusiveMs, sum(original, 'inclusiveMs')))
    throw new Error('Material attribution does not match original routine totals');
  if (!omitted.calls) for (const id of selected) {
    const a = rows.filter(row => row.routine === id), b = original.filter(row => row.id === id);
    if (sum(a, 'calls') !== sum(b, 'calls') || !equal(sum(a, 'inclusiveMs'), sum(b, 'inclusiveMs')))
      throw new Error('Material attribution routine mismatch');
  }
  return rows;
}

const owners = new WeakMap();
/** Diagnostic build only. The ordinary benchmark is deliberately not started. */
export function startRoutineCapture(game, options = {}) {
  if (owners.has(game)) return false;
  const document = options.document ?? globalThis.document;
  const panel = document.createElement('section'), close = document.createElement('button');
  const output = document.createElement('pre'); output.id = 'routine-profile-result';
  panel.style.cssText = 'position:fixed;inset:12px;z-index:100100;background:#101820;color:white;padding:12px;overflow:auto';
  close.textContent = 'Zavřít diagnostiku';
  output.textContent = 'Diagnostika osmi skutečných renderů; zahrnuje režii profileru, není FPS benchmark.';
  panel.append(close, output); document.body.append(panel);
  const state = { closed: false, capture: undefined }; owners.set(game, state);
  const schedule = options.setTimeout ?? globalThis.setTimeout;
  const cancel = options.clearTimeout ?? globalThis.clearTimeout;
  let timer, observer;
  const cleanup = () => { cancel(timer); observer?.remove(true); owners.delete(game); };
  close.onclick = () => { state.closed = true; state.capture?.dispose('panel-closed'); panel.remove(); };
  void (async () => {
    const result = { schemaVersion: 1, mode: 'diagnostic', kind: 'routine-cost',
      identity: options.identity ?? __ROUTINE_DIAGNOSTIC_IDENTITY__,
      capturedAtUTC: new Date().toISOString(), completed: false, timing: null, failure: null };
    try {
      if (!game.ready || game.disposed || game.rendererFailed || game.benchmark)
        throw new Error('Requires a ready healthy Game without an active benchmark');
      state.capture = (options.capture ?? captureRoutineCost)(game, { enabled: true,
        isRetired: () => state.closed || game.disposed || game.rendererFailed });
      observer = game.scene.onDisposeObservable.addOnce(() => state.capture?.dispose('scene-disposed'));
      timer = schedule(() => state.capture?.dispose('observer-deadline'), 30000);
      result.timing = await state.capture.done;
      (options.validate ?? validateRoutineProfile)(result.timing);
      result.materialRows = (options.validateMaterials ?? validateMaterialRows)(result.timing);
      result.materialOmitted = result.timing.materialOmitted;
      result.completed = result.timing.complete && result.materialOmitted?.calls === 0;
    } catch (error) { result.failure = String(error).slice(0, 2000); }
    finally {
      state.capture?.dispose(); cleanup();
      if (!state.closed) output.textContent = JSON.stringify(result, null, 2);
    }
  })();
  return false;
}
