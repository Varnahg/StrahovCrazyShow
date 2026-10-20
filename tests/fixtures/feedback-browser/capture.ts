import type {
  FeedbackCapture,
  FeedbackContext,
} from "../../../shared/feedback";

/** A deterministic tiny PNG, not a game-rendering or GPU fixture. */
export const IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a40cAAAAASUVORK5CYII=";
export const fixtureContext = (locale: "cs" | "en"): FeedbackContext => ({
  clientBuildId: "feedback-browser-fixture",
  mode: "guest",
  locale,
  page: "game",
  renderErrors: 0,
  renderHealth: "fixture",
});
export async function capture(
  signal: AbortSignal,
): Promise<{ capture: FeedbackCapture; image: Blob }> {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  return {
    image: new Blob(
      [Uint8Array.from(atob(IMAGE_BASE64), (char) => char.charCodeAt(0))],
      { type: "image/png" },
    ),
    capture: {
      state: "ready",
      mimeType: "image/png",
      width: 1,
      height: 1,
      requestedAtMs: 100,
      capturedAtMs: 101,
      frame: {
        frameId: 1,
        renderedAtUTC: "2026-10-20T10:00:00.000Z",
        renderCompletedAtMs: 101,
        position: { x: 1, y: 2, z: 3 },
        camera: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 },
        renderWidth: 1,
        renderHeight: 1,
        cssWidth: 1,
        cssHeight: 1,
        quality: "fixture",
        backend: "webgl2",
      },
    },
  };
}
