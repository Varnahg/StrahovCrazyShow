import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Observer } from "@babylonjs/core/Misc/observable";
import {
  FEEDBACK_LIMITS,
  type FeedbackCapture,
  type FeedbackFrame,
} from "../shared/feedback";

const FRAME_TIMEOUT_MS = 2500;
const ENCODE_TIMEOUT_MS = 5000;
const MAX_IMAGE_SIDE = 1920;

export type RenderedFrameCaptureResult = {
  capture: FeedbackCapture;
  image: Blob | null;
};

/** IO seams for CPU lifecycle tests; production uses browser canvas/time. */
export interface RenderedFrameCaptureEnvironment {
  createCanvas(): HTMLCanvasElement;
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RenderedFrameCaptureOptions {
  engine: Pick<AbstractEngine, "onEndFrameObservable" | "getRenderingCanvas">;
  /** Last successful ordinary scene.render, using performance.now timestamps.
   * Advance frameId only after that render, before engine.endFrame. */
  frame(): FeedbackFrame | null;
  environment?: Partial<RenderedFrameCaptureEnvironment>;
}

type UnavailableReason =
  "no-view" | "no-frame" | "timeout" | "encoding" | "busy" | "cancelled";

interface CaptureOperation {
  requestedAtMs: number;
  baselineFrameId: number;
  capturedAtMs?: number;
  observedEndFrame: boolean;
  settled: boolean;
  encoding: boolean;
  observer: Observer<AbstractEngine> | null;
  frameTimer?: unknown;
  encodeTimer?: unknown;
  signal?: AbortSignal;
  abort?: () => void;
  canvas?: HTMLCanvasElement;
  resolve(result: RenderedFrameCaptureResult): void;
}

function unavailable(
  reason: UnavailableReason,
  requestedAtMs: number,
  capturedAtMs?: number,
): RenderedFrameCaptureResult {
  return {
    capture: {
      state: "unavailable",
      reason,
      requestedAtMs,
      ...(capturedAtMs === undefined ? {} : { capturedAtMs }),
    },
    image: null,
  };
}

/** Copy only the public frame allowlist, including mutable camera/position. */
function snapshotFrame(frame: FeedbackFrame): FeedbackFrame {
  return {
    frameId: frame.frameId,
    renderedAtUTC: frame.renderedAtUTC,
    renderCompletedAtMs: frame.renderCompletedAtMs,
    position: {
      x: frame.position.x,
      y: frame.position.y,
      z: frame.position.z,
    },
    camera: {
      x: frame.camera.x,
      y: frame.camera.y,
      z: frame.camera.z,
      yaw: frame.camera.yaw,
      pitch: frame.camera.pitch,
    },
    renderWidth: frame.renderWidth,
    renderHeight: frame.renderHeight,
    cssWidth: frame.cssWidth,
    cssHeight: frame.cssHeight,
    quality: frame.quality,
    backend: frame.backend,
  };
}

function imageMimeType(blob: Blob): FeedbackCapture["mimeType"] {
  return blob.type === "image/webp" ||
    blob.type === "image/png" ||
    blob.type === "image/jpeg"
    ? blob.type
    : undefined;
}

/** One requested copy of the first new, successful ordinary engine frame.
 * No idle observer, second render, engine reconfiguration, upload or readPixels.
 * The browser can legitimately render a dark frame: colour is not validity. */
export class RenderedFrameCapture {
  // Game replacement must not start another encoder while the previous
  // instance is still completing its noncancellable browser operation.
  private static encoderOwner?: CaptureOperation;
  private readonly environment: RenderedFrameCaptureEnvironment;
  private operation?: CaptureOperation;
  private disposed = false;

  constructor(private readonly options: RenderedFrameCaptureOptions) {
    this.environment = {
      createCanvas: () => document.createElement("canvas"),
      now: () => performance.now(),
      setTimeout: (callback, delayMs) =>
        globalThis.setTimeout(callback, delayMs),
      clearTimeout: (handle) =>
        globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
      ...options.environment,
    };
  }

  capture(signal?: AbortSignal): Promise<RenderedFrameCaptureResult> {
    const requestedAtMs = this.environment.now();
    if (this.disposed || signal?.aborted)
      return Promise.resolve(unavailable("cancelled", requestedAtMs));
    if (this.operation || RenderedFrameCapture.encoderOwner)
      return Promise.resolve(unavailable("busy", requestedAtMs));
    if (!this.renderingCanvas())
      return Promise.resolve(unavailable("no-view", requestedAtMs));

    const baselineFrameId = this.readFrame()?.frameId ?? -1;
    // The caller's frame callback is synchronous and may end this Game or
    // start another request. Recheck ownership before installing any observer.
    if (this.disposed || signal?.aborted)
      return Promise.resolve(unavailable("cancelled", requestedAtMs));
    if (this.operation || RenderedFrameCapture.encoderOwner)
      return Promise.resolve(unavailable("busy", requestedAtMs));
    return new Promise((resolve) => {
      const operation: CaptureOperation = {
        requestedAtMs,
        baselineFrameId,
        observedEndFrame: false,
        settled: false,
        encoding: false,
        observer: null,
        signal,
        resolve,
      };
      this.operation = operation;
      operation.abort = () => {
        this.settle(
          operation,
          unavailable("cancelled", requestedAtMs, operation.capturedAtMs),
          !operation.encoding,
        );
        // toBlob snapshots its input synchronously. Keep the encoder slot, but
        // release our bitmap promptly when the caller no longer wants it.
        this.releaseCanvas(operation);
      };
      signal?.addEventListener("abort", operation.abort, { once: true });
      operation.frameTimer = this.environment.setTimeout(() => {
        this.settle(
          operation,
          unavailable(
            operation.observedEndFrame ? "no-frame" : "timeout",
            requestedAtMs,
          ),
        );
      }, FRAME_TIMEOUT_MS);
      try {
        operation.observer = this.options.engine.onEndFrameObservable.add(() =>
          this.copyFrame(operation),
        );
      } catch {
        this.settle(operation, unavailable("no-frame", requestedAtMs));
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.operation?.abort?.();
  }

  private readFrame(): FeedbackFrame | null {
    try {
      return this.options.frame();
    } catch {
      return null;
    }
  }

  private renderingCanvas(): HTMLCanvasElement | null {
    try {
      const canvas = this.options.engine.getRenderingCanvas();
      return canvas &&
        Number.isSafeInteger(canvas.width) &&
        Number.isSafeInteger(canvas.height) &&
        canvas.width > 0 &&
        canvas.height > 0
        ? canvas
        : null;
    } catch {
      return null;
    }
  }

  private copyFrame(operation: CaptureOperation): void {
    if (!this.active(operation) || operation.encoding) return;
    operation.observedEndFrame = true;
    const frame = this.readFrame();
    const source = this.renderingCanvas();
    if (!this.active(operation)) return;
    if (!source) {
      this.settle(operation, unavailable("no-view", operation.requestedAtMs));
      return;
    }
    // endFrame can run without a successful scene.render. Never attach stale
    // metadata, or an image resized after the recorded render completed.
    if (
      !frame ||
      !Number.isSafeInteger(frame.frameId) ||
      frame.frameId <= operation.baselineFrameId ||
      !Number.isFinite(frame.renderCompletedAtMs) ||
      frame.renderCompletedAtMs < operation.requestedAtMs ||
      frame.renderCompletedAtMs > this.environment.now() ||
      frame.renderWidth !== source.width ||
      frame.renderHeight !== source.height
    )
      return;

    if (!this.active(operation)) return;
    if (RenderedFrameCapture.encoderOwner) {
      this.settle(operation, unavailable("busy", operation.requestedAtMs));
      return;
    }
    // Claim before any canvas callbacks, so synchronous reentrancy cannot
    // create a second bitmap/encode in another Game instance.
    RenderedFrameCapture.encoderOwner = operation;
    this.stopFrameWait(operation);
    try {
      const snapshot = snapshotFrame(frame);
      const scale = Math.min(
        1,
        MAX_IMAGE_SIDE / Math.max(source.width, source.height),
        Math.sqrt(FEEDBACK_LIMITS.imagePixels / (source.width * source.height)),
      );
      const width = Math.max(1, Math.floor(source.width * scale));
      const height = Math.max(1, Math.floor(source.height * scale));
      const canvas = this.environment.createCanvas();
      operation.canvas = canvas;
      if (!this.active(operation)) {
        this.releaseCanvas(operation);
        return;
      }
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D capture context unavailable");
      if (!this.active(operation)) return;
      context.drawImage(
        source,
        0,
        0,
        source.width,
        source.height,
        0,
        0,
        width,
        height,
      );
      operation.capturedAtMs = this.environment.now();
      if (!this.active(operation)) {
        this.releaseCanvas(operation);
        return;
      }
      operation.encoding = true;
      operation.encodeTimer = this.environment.setTimeout(() => {
        this.settle(
          operation,
          unavailable(
            "timeout",
            operation.requestedAtMs,
            operation.capturedAtMs,
          ),
        );
      }, ENCODE_TIMEOUT_MS);
      canvas.toBlob(
        (blob) => {
          // A cancelled/timed-out native encode can finish after a new draft.
          // It never owns that draft's promise, timer or canvas.
          if (this.operation !== operation) return;
          if (operation.settled) {
            this.release(operation);
            return;
          }
          const mimeType = blob ? imageMimeType(blob) : undefined;
          const result: RenderedFrameCaptureResult =
            blob &&
            mimeType &&
            blob.size > 0 &&
            blob.size <= FEEDBACK_LIMITS.imageBytes
              ? {
                  capture: {
                    state: "ready",
                    requestedAtMs: operation.requestedAtMs,
                    capturedAtMs: operation.capturedAtMs,
                    width,
                    height,
                    mimeType,
                    frame: snapshot,
                  },
                  image: blob,
                }
              : unavailable(
                  "encoding",
                  operation.requestedAtMs,
                  operation.capturedAtMs,
                );
          this.settle(operation, result);
        },
        "image/webp",
        0.9,
      );
    } catch {
      this.settle(
        operation,
        unavailable(
          "encoding",
          operation.requestedAtMs,
          operation.capturedAtMs,
        ),
      );
    }
  }

  private active(operation: CaptureOperation): boolean {
    return this.operation === operation && !operation.settled && !this.disposed;
  }

  private stopFrameWait(operation: CaptureOperation): void {
    if (operation.observer) {
      this.options.engine.onEndFrameObservable.remove(operation.observer);
      operation.observer = null;
    }
    if (operation.frameTimer !== undefined) {
      this.environment.clearTimeout(operation.frameTimer);
      operation.frameTimer = undefined;
    }
  }

  private settle(
    operation: CaptureOperation,
    result: RenderedFrameCaptureResult,
    release = true,
  ): void {
    if (this.operation !== operation) return;
    if (!operation.settled) {
      operation.settled = true;
      this.stopFrameWait(operation);
      if (operation.abort)
        operation.signal?.removeEventListener("abort", operation.abort);
      operation.resolve(result);
    }
    if (release) this.release(operation);
  }

  private releaseCanvas(operation: CaptureOperation): void {
    if (!operation.canvas) return;
    operation.canvas.width = 0;
    operation.canvas.height = 0;
    operation.canvas = undefined;
  }

  private release(operation: CaptureOperation): void {
    this.stopFrameWait(operation);
    if (operation.encodeTimer !== undefined) {
      this.environment.clearTimeout(operation.encodeTimer);
      operation.encodeTimer = undefined;
    }
    this.releaseCanvas(operation);
    if (this.operation === operation) this.operation = undefined;
    if (RenderedFrameCapture.encoderOwner === operation)
      RenderedFrameCapture.encoderOwner = undefined;
  }
}
