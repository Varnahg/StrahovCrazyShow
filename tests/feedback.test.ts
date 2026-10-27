import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { createFeedbackService } from "../server/feedback";
import type { FeedbackDiagnostic } from "../server/feedback-config";

test("service forwards one safe configuration diagnostic without opening a server or contacting Linear", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "feedback-service-diagnostic-"),
  );
  assert.equal(dirname(directory), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith("feedback-service-diagnostic-"));
  const events: FeedbackDiagnostic[] = [];
  const service = await createFeedbackService({
    directory,
    env: {},
    onDiagnostic: (event) => events.push(event),
    fetch: async () => {
      throw Error("No transport may run without configuration");
    },
  });
  try {
    await service.flush();
    await service.flush();
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, "configuration");
    if (events[0].kind === "configuration")
      assert.equal(events[0].configuration.configured, false);
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
});
