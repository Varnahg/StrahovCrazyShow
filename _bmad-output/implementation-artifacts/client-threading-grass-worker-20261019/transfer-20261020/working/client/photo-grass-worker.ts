import {
  createPhotoGrassPlacement,
  type PhotoGrassTile,
} from "./photo-grass-placement";
import { GRASS_PREPARATION } from "./photo-grass-selection";
import {
  GRASS_WORKER_PROTOCOL,
  GRASS_WORKER_INFLIGHT,
  type GrassWorkerInput,
  type GrassWorkerOutput,
  type GrassTileRequest,
} from "./photo-grass-worker-protocol";

/** Exact generator in a serial, yielding worker. A completed buffer has one owner. */
export function createPhotoGrassWorkerRuntime(
  post: (message: GrassWorkerOutput, transfer?: ArrayBuffer[]) => void,
  schedule: (run: () => void) => () => void = (run) => {
    const timer = setTimeout(run, 0);
    return () => clearTimeout(timer);
  },
  now = () => performance.now(),
) {
  const placement = createPhotoGrassPlacement();
  const requests = new Map<number, GrassTileRequest>();
  let epoch = 1,
    disposed = false;
  let active:
    | {
        request: GrassTileRequest;
        work: Generator<void, PhotoGrassTile | undefined>;
        cpuMs: number;
      }
    | undefined;
  let cancelScheduled: (() => void) | undefined;
  function clear() {
    active?.work.return(undefined);
    active = undefined;
    requests.clear();
    cancelScheduled?.();
    cancelScheduled = undefined;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    placement.dispose();
  }
  function wake() {
    if (!disposed && !cancelScheduled && requests.size)
      cancelScheduled = schedule(pump);
  }
  function pump() {
    cancelScheduled = undefined;
    if (disposed) return;
    try {
      const deadline = now() + GRASS_PREPARATION.milliseconds;
      let completed = 0;
      for (let step = 0; step < GRASS_PREPARATION.steps; step++) {
        if (!active) {
          const request = requests.values().next().value as
            GrassTileRequest | undefined;
          if (!request) break;
          active = {
            request,
            work: placement.prepareTile(request.x, request.z),
            cpuMs: 0,
          };
        }
        const started = now();
        const result = active.work.next();
        const ended = now();
        active.cpuMs += ended - started;
        if (result.done) {
          const request = active.request,
            tile = result.value,
            cpuMs = active.cpuMs;
          if (!tile || !placement.releaseTile(tile))
            throw Error("Unowned grass tile");
          requests.delete(request.requestId);
          active = undefined;
          // releaseTile MUST precede detachment: no cached typed array survives.
          post(
            {
              kind: "tile",
              protocol: GRASS_WORKER_PROTOCOL,
              epoch,
              requestId: request.requestId,
              tile,
              cpuMs,
            },
            [tile.matrices.buffer as ArrayBuffer],
          );
          if (++completed >= GRASS_PREPARATION.coldTiles) break;
        }
        if (ended >= deadline) break;
      }
      wake();
    } catch {
      dispose();
      post({ kind: "error", protocol: GRASS_WORKER_PROTOCOL });
    }
  }
  return {
    receive(message: GrassWorkerInput) {
      if (disposed) return;
      if (message.protocol !== GRASS_WORKER_PROTOCOL) {
        dispose();
        post({ kind: "error", protocol: GRASS_WORKER_PROTOCOL });
        return;
      }
      if (message.kind === "reset") {
        if (message.epoch > epoch) {
          clear();
          epoch = message.epoch;
        }
        return;
      }
      if (message.epoch !== epoch) return;
      if (message.kind === "cancel") {
        if (active?.request.requestId === message.requestId) {
          active.work.return(undefined);
          active = undefined;
        }
        requests.delete(message.requestId);
        return;
      }
      if (requests.has(message.requestId)) return;
      if (
        requests.size >= GRASS_WORKER_INFLIGHT ||
        !Number.isSafeInteger(message.x) ||
        !Number.isSafeInteger(message.z)
      ) {
        dispose();
        post({ kind: "error", protocol: GRASS_WORKER_PROTOCOL });
        return;
      }
      requests.set(message.requestId, message);
      wake();
    },
    dispose,
  };
}

// Node tests import the runtime without constructing a browser or engine.
if (typeof self !== "undefined" && typeof Window === "undefined") {
  const runtime = createPhotoGrassWorkerRuntime((message, transfer = []) =>
    self.postMessage(message, { transfer }),
  );
  self.onmessage = (event: MessageEvent<GrassWorkerInput>) =>
    runtime.receive(event.data);
  self.postMessage({ kind: "ready", protocol: GRASS_WORKER_PROTOCOL });
}
