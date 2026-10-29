import type { PhotoGrassTile } from "./photo-grass-placement";

export const GRASS_WORKER_PROTOCOL = 1;
export const GRASS_WORKER_INFLIGHT = 2;
// Experimental failure bounds, not performance targets. Bootstrap can duplicate
// world-data initialization; meanwhile the original main-thread path keeps working.
export const GRASS_WORKER_STARTUP_MS = 5000;
export const GRASS_WORKER_REQUEST_MS = 500;

export type GrassTileRequest = {
  kind: "tile";
  protocol: typeof GRASS_WORKER_PROTOCOL;
  epoch: number;
  requestId: number;
  x: number;
  z: number;
};
export type GrassWorkerInput =
  | GrassTileRequest
  | {
      kind: "cancel";
      protocol: typeof GRASS_WORKER_PROTOCOL;
      epoch: number;
      requestId: number;
    }
  | {
      kind: "reset";
      protocol: typeof GRASS_WORKER_PROTOCOL;
      epoch: number;
    };
export type GrassWorkerOutput =
  | {
      kind: "ready";
      protocol: typeof GRASS_WORKER_PROTOCOL;
    }
  | {
      kind: "tile";
      protocol: typeof GRASS_WORKER_PROTOCOL;
      epoch: number;
      requestId: number;
      tile: PhotoGrassTile;
      cpuMs: number;
    }
  | {
      kind: "error";
      protocol: typeof GRASS_WORKER_PROTOCOL;
    };

export function grassWorkerEnabled(location: {
  hostname: string;
  search: string;
}) {
  const values = new URLSearchParams(location.search).getAll("grassWorker");
  return (
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
      location.hostname.toLowerCase(),
    ) &&
    values.length === 1 &&
    values[0] === "1"
  );
}
