import { captureRoutineCost } from '../webgpu-completion-20261021/measurement/routine-cost.mjs';
import { validateRoutineProfile } from '../webgpu-completion-20261021/measurement/routine-cost-core.mjs';

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
      result.completed = result.timing.complete;
    } catch (error) { result.failure = String(error).slice(0, 2000); }
    finally {
      state.capture?.dispose(); cleanup();
      if (!state.closed) output.textContent = JSON.stringify(result, null, 2);
    }
  })();
  return false;
}
