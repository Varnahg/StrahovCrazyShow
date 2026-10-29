import { isPhotoGrassTile, type PhotoGrassTile } from "./photo-grass-placement";
import {
  GRASS_WORKER_PROTOCOL,
  GRASS_WORKER_INFLIGHT,
  GRASS_WORKER_STARTUP_MS,
  GRASS_WORKER_REQUEST_MS,
  grassWorkerEnabled,
  type GrassWorkerInput,
  type GrassTileRequest,
} from "./photo-grass-worker-protocol";

export type PhotoGrassWorkerPort = {
  postMessage(message: GrassWorkerInput): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
};
type Pending = GrassTileRequest & {
  sentAt: number;
  received?: { tile: unknown; cpuMs: unknown; at: number };
};

/** Transport only. No cache, render state, timers or async mutation of the lawn. */
export class PhotoGrassTileExecutor {
  readonly stats = {
    experimental: true,
    state: "starting",
    requested: 0,
    completed: 0,
    cancelled: 0,
    startupMs: 0,
    // Completed tiles only; cancelled partial computation is not reported.
    workerCpuMs: 0,
    workerMaxCpuMs: 0,
    waitMs: 0,
    maxWaitMs: 0,
    applyMs: 0,
    maxApplyMs: 0,
    failure: "",
  };
  private port?: PhotoGrassWorkerPort;
  private pending = new Map<number, Pending>();
  private epoch = 1;
  private nextId = 1;
  private startedAt: number;
  private state: "starting" | "ready" | "failed" | "disposed" = "starting";
  failure?: string;

  constructor(
    create: () => PhotoGrassWorkerPort,
    private now = () => performance.now(),
  ) {
    this.startedAt = now();
    try {
      this.port = create();
      this.port.onmessage = ({ data }) => this.receive(data);
      this.port.onerror = () => this.fail("worker error");
      this.port.onmessageerror = () => this.fail("worker message error");
    } catch {
      this.fail("worker construction failed");
    }
  }
  get ready() {
    return this.state === "ready";
  }
  get failed() {
    return this.state === "failed";
  }
  get pendingCount() {
    return this.pending.size;
  }
  get requests(): Iterable<Readonly<GrassTileRequest>> {
    return this.pending.values();
  }
  has(x: number, z: number) {
    for (const request of this.pending.values())
      if (request.x === x && request.z === z) return true;
    return false;
  }
  checkTimeout() {
    const now = this.now();
    if (
      this.state === "starting" &&
      now - this.startedAt >= GRASS_WORKER_STARTUP_MS
    )
      this.fail("worker startup timeout");
    if (this.state === "ready")
      for (const request of this.pending.values())
        if (
          !request.received &&
          now - request.sentAt >= GRASS_WORKER_REQUEST_MS
        ) {
          this.fail("worker tile timeout");
          break;
        }
  }
  request(x: number, z: number) {
    if (
      !this.ready ||
      this.pending.size >= GRASS_WORKER_INFLIGHT ||
      this.has(x, z)
    )
      return false;
    const request: Pending = {
      kind: "tile",
      protocol: GRASS_WORKER_PROTOCOL,
      epoch: this.epoch,
      requestId: this.nextId++,
      x,
      z,
      sentAt: this.now(),
    };
    this.pending.set(request.requestId, request);
    this.stats.requested++;
    this.send(request);
    return !this.failed;
  }
  cancel(x: number, z: number) {
    for (const request of this.pending.values())
      if (request.x === x && request.z === z) {
        this.pending.delete(request.requestId);
        this.stats.cancelled++;
        this.send({
          kind: "cancel",
          protocol: GRASS_WORKER_PROTOCOL,
          epoch: this.epoch,
          requestId: request.requestId,
        });
        return;
      }
  }
  takeCompleted(): PhotoGrassTile | undefined {
    if (!this.ready) return;
    for (const request of this.pending.values()) {
      if (!request.received) continue;
      const tile = request.received.tile;
      if (
        !isPhotoGrassTile(tile) ||
        tile.x !== request.x + 0.5 ||
        tile.z !== request.z + 0.5 ||
        typeof request.received.cpuMs !== "number" ||
        !Number.isFinite(request.received.cpuMs) ||
        request.received.cpuMs < 0
      ) {
        this.fail("invalid worker tile");
        return;
      }
      const cpuMs = request.received.cpuMs,
        waitMs = Math.max(0, request.received.at - request.sentAt);
      this.stats.completed++;
      this.stats.workerCpuMs += cpuMs;
      this.stats.workerMaxCpuMs = Math.max(this.stats.workerMaxCpuMs, cpuMs);
      this.stats.waitMs += waitMs;
      this.stats.maxWaitMs = Math.max(this.stats.maxWaitMs, waitMs);
      this.pending.delete(request.requestId);
      return tile;
    }
  }
  reset() {
    this.epoch++;
    this.stats.cancelled += this.pending.size;
    this.pending.clear();
    this.send({
      kind: "reset",
      protocol: GRASS_WORKER_PROTOCOL,
      epoch: this.epoch,
    });
  }
  recordApply(milliseconds: number) {
    this.stats.applyMs += milliseconds;
    this.stats.maxApplyMs = Math.max(this.stats.maxApplyMs, milliseconds);
  }
  private receive(data: unknown) {
    if (this.state === "disposed" || this.failed) return;
    if (!data || typeof data !== "object") {
      this.fail("invalid worker message");
      return;
    }
    const message = data as Record<string, unknown>;
    if (message.protocol !== GRASS_WORKER_PROTOCOL) {
      this.fail("worker protocol mismatch");
      return;
    }
    if (message.kind === "ready") {
      if (this.state === "starting")
        this.stats.startupMs = Math.max(0, this.now() - this.startedAt);
      this.state = "ready";
      this.stats.state = "ready";
      return;
    }
    if (message.kind === "error") {
      this.fail("worker computation failed");
      return;
    }
    if (message.kind !== "tile") {
      this.fail("invalid worker message");
      return;
    }
    if (message.epoch !== this.epoch) return;
    const request = this.pending.get(message.requestId as number);
    // At most two retained payloads. Duplicate/cancelled responses never queue.
    if (request && !request.received)
      request.received = {
        tile: message.tile,
        cpuMs: message.cpuMs,
        at: this.now(),
      };
  }
  private send(message: GrassWorkerInput) {
    if (!this.port || this.failed || this.state === "disposed") return;
    try {
      this.port.postMessage(message);
    } catch {
      this.fail("worker send failed");
    }
  }
  private detach() {
    const port = this.port;
    this.port = undefined;
    if (port) {
      port.onmessage = port.onerror = port.onmessageerror = null;
      port.terminate();
    }
  }
  private fail(reason: string) {
    if (this.state === "disposed" || this.failed) return;
    this.state = "failed";
    this.failure = reason;
    this.stats.state = "failed";
    this.stats.failure = reason;
    // Keep requests until update requeues them for the original generator.
    this.detach();
  }
  dispose() {
    if (this.state === "disposed") return;
    this.state = "disposed";
    if (!this.stats.failure) this.stats.state = "disposed";
    this.detach();
    this.pending.clear();
  }
}

export function createExperimentalGrassTileExecutor() {
  if (typeof location === "undefined" || !grassWorkerEnabled(location)) return;
  return new PhotoGrassTileExecutor(
    () =>
      new Worker(new URL("./photo-grass-worker.ts", import.meta.url), {
        type: "module",
        name: "photographic-grass-tiles",
      }) as unknown as PhotoGrassWorkerPort,
  );
}
