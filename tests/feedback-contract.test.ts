import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validateFeedbackReport, FEEDBACK_LIMITS } from "../shared/feedback";

const input = () => ({
  version: 1,
  id: randomUUID(),
  createdAtUTC: "2026-10-20T20:00:00.000Z",
  kind: "bug",
  message: "  Nemohu projít dveřmi.  ",
  context: {
    clientBuildId: "sha256-test",
    locale: "cs",
    mode: "guest",
    page: "game",
  },
  capture: { state: "unavailable", reason: "no-frame" },
});
test("feedback accepts host without identity and explicitly projects technical context", () => {
  const raw = {
    ...input(),
    token: "private",
    context: { ...input().context, chat: "private", players: [1] },
  };
  const parsed = validateFeedbackReport(raw);
  assert.ok(parsed.ok);
  assert.equal(parsed.report.message, "Nemohu projít dveřmi.");
  assert.equal("token" in parsed.report, false);
  assert.equal("chat" in parsed.report.context, false);
  assert.equal("players" in parsed.report.context, false);
});
test("feedback rejects invalid envelope, message/contact limits and ready capture without frame", () => {
  for (const patch of [
    { version: 2 },
    { id: "../escape" },
    { message: " " },
    { message: "a".repeat(FEEDBACK_LIMITS.message + 1) },
    { contact: "broken" },
    {
      capture: {
        state: "ready",
        width: 100,
        height: 100,
        mimeType: "image/png",
      },
    },
  ])
    assert.equal(validateFeedbackReport({ ...input(), ...patch }).ok, false);
});
test("feedback captures a deep frame copy and rejects nonfinite or mismatched frame geometry", () => {
  const raw = {
    ...input(),
    capture: {
      state: "ready",
      width: 1280,
      height: 720,
      mimeType: "image/png",
      requestedAtMs: 10,
      capturedAtMs: 20,
      frame: {
        frameId: 1,
        renderedAtUTC: "2026-10-20T20:00:00.000Z",
        renderCompletedAtMs: 19,
        position: { x: 1, y: 2, z: 3 },
        camera: { x: 4, y: 5, z: 6, yaw: 1, pitch: 0 },
        renderWidth: 1280,
        renderHeight: 720,
        cssWidth: 1280,
        cssHeight: 720,
        quality: "medium",
        backend: "webgl2",
      },
    },
  };
  const parsed = validateFeedbackReport(raw);
  assert.ok(parsed.ok);
  raw.capture.frame.camera.x = 99;
  assert.equal(parsed.report.capture.frame?.camera.x, 4);
  raw.capture.frame.position.x = NaN;
  assert.equal(validateFeedbackReport(raw).ok, false);
});
test("feedback removes credential-like values and secret URL queries from technical data", () => {
  const secret = ["lin", "api", "fake-test-value"].join("_");
  const parsed = validateFeedbackReport({
    ...input(),
    message: "Issue with " + secret,
    context: {
      ...input().context,
      events: [
        {
          atMs: 1,
          kind: "js-error",
          detail: "https://example.com/asset?token=private " + secret,
        },
      ],
    },
  });
  assert.ok(parsed.ok);
  assert.ok(!JSON.stringify(parsed.report).includes(secret));
  assert.ok(!JSON.stringify(parsed.report).includes("token=private"));
  assert.ok(parsed.report.message.includes("[redacted]"));
});
