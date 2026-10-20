import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createFeedbackStore,
  FeedbackStoreError,
} from "../server/feedback-store";
import type { FeedbackReport } from "../shared/feedback";

const report = (): FeedbackReport => ({
  version: 1,
  id: "a0000000-0000-4000-8000-000000000001",
  createdAtUTC: "2026-10-20T20:00:00.000Z",
  kind: "bug",
  message: "Cannot enter the building",
  context: {
    clientBuildId: "test-build",
    mode: "guest",
    locale: "en",
    page: "game",
  },
  capture: { state: "unavailable", reason: "no-frame" },
});
async function fixture(action: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "feedback-store-"));
  try {
    await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test("disk commit survives recreation and simultaneous duplicates receive exactly one receipt", () =>
  fixture(async (directory) => {
    const store = await createFeedbackStore({
      directory,
      now: () => 1234567890000,
    });
    const receipts = await Promise.all(
      Array.from({ length: 12 }, () => store.accept(report())),
    );
    assert.ok(
      receipts.every(
        (receipt) => JSON.stringify(receipt) === JSON.stringify(receipts[0]),
      ),
    );
    assert.deepEqual(Object.keys(receipts[0]).sort(), [
      "accepted",
      "id",
      "receivedAtUTC",
    ]);
    assert.equal((await readdir(directory)).length, 1);
    const state = store.list()[0];
    await store.update(state.report.id, {
      ...state.delivery,
      stage: "verifying",
      createAttempted: true,
      attempts: 1,
    });
    await store.close();
    const restarted = await createFeedbackStore({
      directory,
      now: () => 9999999999999,
    });
    assert.deepEqual(await restarted.accept(report()), receipts[0]);
    assert.equal(restarted.list()[0].delivery.issueId, state.delivery.issueId);
    assert.equal(restarted.list()[0].delivery.stage, "verifying");
    await assert.rejects(
      restarted.accept({ ...report(), message: "different" }),
      (error: unknown) =>
        error instanceof FeedbackStoreError && error.code === "conflict",
    );
  }));
test("images are durable and image bytes participate in deduplication", () =>
  fixture(async (directory) => {
    const store = await createFeedbackStore({ directory });
    const image = {
      bytes: Buffer.from("some binary"),
      mimeType: "image/png",
      width: 1,
      height: 1,
    };
    await store.accept(report(), image);
    const restarted = await createFeedbackStore({ directory });
    assert.deepEqual(await restarted.image(report().id), image.bytes);
    await assert.rejects(
      restarted.accept(report(), {
        ...image,
        bytes: Buffer.from("other binary"),
      }),
      /conflict/,
    );
  }));
test("capacity rejects newer reports and preserves earlier confirmed payloads", () =>
  fixture(async (directory) => {
    const store = await createFeedbackStore({ directory, maxReports: 1 });
    const receipt = await store.accept(report());
    await assert.rejects(
      store.accept({ ...report(), id: "a0000000-0000-4000-8000-000000000002" }),
      /capacity/,
    );
    assert.deepEqual(await store.accept(report()), receipt);
    const tiny = await createFeedbackStore({
      directory: join(directory, "tiny"),
      maxBytes: 100,
    });
    await assert.rejects(tiny.accept(report()), /capacity/);
    assert.equal(tiny.list().length, 0);
  }));
test("startup removes stale partial staging and uncommitted delivery files, preserving committed records", () =>
  fixture(async (directory) => {
    const store = await createFeedbackStore({ directory });
    await store.accept(report());
    const staging = join(directory, ".staging-orphan");
    await mkdir(staging);
    await writeFile(join(staging, "image.bin"), "partial");
    await utimes(staging, new Date(0), new Date(0));
    await writeFile(join(directory, report().id, ".delivery-partial"), "{");
    const restarted = await createFeedbackStore({ directory });
    assert.equal(restarted.list().length, 1);
    assert.deepEqual(await readdir(directory), [report().id]);
    assert.equal(
      (await readdir(join(directory, report().id))).some((name) =>
        name.startsWith("."),
      ),
      false,
    );
    const body = JSON.parse(
      await readFile(join(directory, report().id, "report.json"), "utf8"),
    );
    assert.equal(body.receipt.accepted, true);
  }));
test("corrupt acknowledged records block startup instead of being silently deleted", () =>
  fixture(async (directory) => {
    const store = await createFeedbackStore({ directory });
    await store.accept(report());
    await writeFile(join(directory, report().id, "delivery.json"), "{");
    await assert.rejects(createFeedbackStore({ directory }), /corrupt/);
    assert.ok(
      (await readFile(join(directory, report().id, "report.json"))).length,
    );
  }));
test("same-length image corruption is detected from the content hash at restart", () =>
  fixture(async (directory) => {
    const store = await createFeedbackStore({ directory });
    await store.accept(report(), {
      bytes: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
      width: 1,
      height: 1,
    });
    await writeFile(
      join(directory, report().id, "image.bin"),
      Buffer.from([3, 2, 1]),
    );
    await assert.rejects(createFeedbackStore({ directory }), /corrupt/);
  }));
test("file count includes unknown spool files and refuses new acceptance before inode exhaustion", () =>
  fixture(async (directory) => {
    await writeFile(join(directory, "operator-note.txt"), "keep");
    const store = await createFeedbackStore({ directory, maxFiles: 4 });
    await assert.rejects(store.accept(report()), /capacity/);
    assert.equal(
      await readFile(join(directory, "operator-note.txt"), "utf8"),
      "keep",
    );
  }));
