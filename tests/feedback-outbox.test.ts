import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  FeedbackOutbox,
  FeedbackOutboxError,
  type FeedbackPending,
  type FeedbackStorage,
} from "../client/feedback-outbox";
import { FEEDBACK_LIMITS, type FeedbackReport } from "../shared/feedback";

class MemoryStorage implements FeedbackStorage {
  entries: FeedbackPending[] = [];
  fail = false;
  private serial: Promise<unknown> = Promise.resolve();
  async list() {
    if (this.fail) throw new Error("quota");
    return structuredClone(this.entries);
  }
  change<T>(
    update: (entries: FeedbackPending[]) => {
      entries: FeedbackPending[];
      value: T;
    },
  ): Promise<T> {
    const operation = this.serial.then(() => {
      if (this.fail) throw new Error("quota");
      const changed = update(structuredClone(this.entries));
      this.entries = structuredClone(changed.entries);
      return changed.value;
    });
    this.serial = operation.catch(() => {});
    return operation;
  }
}
const report = (): FeedbackReport => ({
  version: 1,
  id: randomUUID(),
  createdAtUTC: "2026-10-20T10:00:00.000Z",
  kind: "bug",
  message: "The stairs stop me.",
  context: {
    clientBuildId: "test-build",
    mode: "guest",
    locale: "en",
    page: "game",
  },
  capture: { state: "unavailable", reason: "no-frame" },
});
function imageReport(): FeedbackReport {
  const original = report();
  original.capture = {
    state: "ready",
    width: 1,
    height: 1,
    mimeType: "image/png",
    frame: {
      frameId: 4,
      renderedAtUTC: original.createdAtUTC,
      renderCompletedAtMs: 42,
      position: { x: 1, y: 2, z: 3 },
      camera: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 },
      renderWidth: 100,
      renderHeight: 100,
      cssWidth: 100,
      cssHeight: 100,
      quality: "medium",
      backend: "webgl2",
    },
  };
  return original;
}
const receipt = (id: string) =>
  Response.json(
    { accepted: true, id, receivedAtUTC: "2026-10-20T10:01:00.000Z" },
    { status: 202 },
  );
const request = (
  fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) => fn as typeof fetch;
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("already-online reload resumes stored reports at startup without an online event or opening the form", async () => {
  const storage = new MemoryStorage(),
    original = report();
  const first = new FeedbackOutbox({ storage, online: () => false });
  assert.deepEqual(await first.enqueue(original, null), {
    state: "queued",
    id: original.id,
  });
  first.dispose();
  let calls = 0;
  const second = new FeedbackOutbox({
    storage,
    fetch: request(async (url, init) => {
      calls++;
      assert.equal(url, "/api/feedback");
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.cache, "no-store");
      assert.deepEqual(
        JSON.parse(String((init!.body as FormData).get("metadata"))),
        original,
      );
      return receipt(original.id);
    }),
  });
  try {
    await Promise.all([second.start(), second.start()]);
    assert.equal(calls, 1);
    assert.equal((await second.list()).length, 0);
  } finally {
    second.dispose();
  }
});

test("empty startup sends no new draft and disposal during restore preserves queued reports", async () => {
  const memory = new MemoryStorage();
  let calls = 0;
  const send = request(async () => {
    calls++;
    throw new Error("unexpected request");
  });
  const empty = new FeedbackOutbox({ storage: memory, fetch: send });
  try {
    await empty.start();
    assert.equal(calls, 0);
  } finally {
    empty.dispose();
  }

  const first = new FeedbackOutbox({ storage: memory, online: () => false });
  const original = report();
  await first.enqueue(original, null);
  first.dispose();
  let restore: (() => void) | undefined;
  const delayed: FeedbackStorage = {
    list: async () => {
      await new Promise<void>((resolve) => {
        restore = resolve;
      });
      return memory.list();
    },
    change: memory.change.bind(memory),
  };
  const second = new FeedbackOutbox({ storage: delayed, fetch: send });
  const starting = second.start();
  second.dispose();
  restore!();
  await starting;
  assert.equal(calls, 0);
  assert.equal(memory.entries[0].report.id, original.id);
});

test("image and metadata are persisted together and FormData uses the actual MIME", async () => {
  const storage = new MemoryStorage(),
    original = imageReport();
  const image = new Blob(["test-image"], { type: "image/png" });
  const box = new FeedbackOutbox({ storage, online: () => false });
  await box.enqueue(original, image);
  assert.equal(await storage.entries[0].image!.text(), "test-image");
  box.dispose();
  const second = new FeedbackOutbox({
    storage,
    fetch: request(async (_, init) => {
      const file = (init!.body as FormData).get("screenshot") as File;
      assert.equal(file.type, "image/png");
      assert.equal(file.name, "feedback.png");
      assert.equal(await file.text(), "test-image");
      return receipt(original.id);
    }),
  });
  try {
    await second.flush();
    assert.equal(storage.entries.length, 0);
  } finally {
    second.dispose();
  }
});

test("the byte budget includes metadata and preserves all earlier images when full", async () => {
  const storage = new MemoryStorage();
  const image = new Blob([new Uint8Array(FEEDBACK_LIMITS.imageBytes)], {
    type: "image/png",
  });
  const first = new FeedbackOutbox({ storage, online: () => false });
  const second = new FeedbackOutbox({ storage, online: () => false });
  try {
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        (i % 2 ? first : second).enqueue(imageReport(), image),
      ),
    );
    assert.equal(
      attempts.filter((entry) => entry.status === "fulfilled").length,
      4,
    );
    assert.equal(storage.entries.length, 4);
    assert.ok(
      storage.entries.reduce((sum, entry) => sum + entry.bytes, 0) <=
        FEEDBACK_LIMITS.pendingBytes,
    );
    for (const entry of storage.entries)
      assert.equal(entry.image!.size, FEEDBACK_LIMITS.imageBytes);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test("concurrent enqueue and flush share one request per report and enforce atomic capacity", async () => {
  const storage = new MemoryStorage(),
    original = report();
  let release: (() => void) | undefined,
    calls = 0;
  const box = new FeedbackOutbox({
    storage,
    fetch: request(async () => {
      calls++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return receipt(original.id);
    }),
  });
  try {
    const a = box.enqueue(original, null),
      b = box.enqueue(original, null);
    await tick();
    await tick();
    const flush = box.flush();
    assert.equal(calls, 1);
    release!();
    assert.equal((await a).state, "accepted");
    assert.equal((await b).state, "accepted");
    await flush;
    assert.equal(calls, 1);
  } finally {
    box.dispose();
  }
  const offline = new FeedbackOutbox({ storage, online: () => false });
  try {
    const added = await Promise.allSettled(
      Array.from({ length: 9 }, () => offline.enqueue(report(), null)),
    );
    assert.equal(
      added.filter((value) => value.status === "fulfilled").length,
      FEEDBACK_LIMITS.pendingReports,
    );
    assert.equal(storage.entries.length, FEEDBACK_LIMITS.pendingReports);
    assert.ok(
      added
        .filter((value) => value.status === "rejected")
        .every((value) => value.reason.code === "full"),
    );
  } finally {
    offline.dispose();
  }
});

test("2xx with a wrong, absent or invalid receipt is queued and retry keeps the same id and text", async () => {
  for (const variant of [
    "wrong-id",
    "missing",
    "invalid-time",
    "not-accepted",
  ]) {
    const storage = new MemoryStorage(),
      original = report(),
      sent: FeedbackReport[] = [];
    const value =
      variant === "missing"
        ? {}
        : {
            accepted: variant !== "not-accepted",
            id: variant === "wrong-id" ? randomUUID() : original.id,
            receivedAtUTC:
              variant === "invalid-time" ? "tomorrow" : "2026-10-20T10:00:00Z",
          };
    let good = false;
    const box = new FeedbackOutbox({
      storage,
      retryDelaysMs: [60_000],
      fetch: request(async (_, init) => {
        sent.push(JSON.parse(String((init!.body as FormData).get("metadata"))));
        return good ? receipt(original.id) : Response.json(value);
      }),
    });
    const accepted: string[] = [];
    box.subscribe((receipt) => {
      if (receipt) accepted.push(receipt.id);
    });
    try {
      assert.equal((await box.enqueue(original, null)).state, "queued");
      assert.equal(storage.entries[0].error, "receipt");
      assert.equal(accepted.length, 0);
      good = true;
      await box.retry(original.id);
      assert.deepEqual(sent, [original, original]);
      assert.equal(storage.entries.length, 0);
      assert.deepEqual(accepted, [original.id]);
    } finally {
      box.dispose();
    }
  }
});

test("terminal 4xx remain visible without automatic retries; 413 is identifiable and manual retry is explicit", async () => {
  for (const status of [400, 403, 409, 413]) {
    const storage = new MemoryStorage(),
      original = report();
    let calls = 0;
    const box = new FeedbackOutbox({
      storage,
      fetch: request(async () => {
        calls++;
        return new Response(null, { status });
      }),
    });
    try {
      await box.enqueue(original, null);
      await box.flush();
      await box.flush();
      assert.equal(calls, 1);
      assert.equal(storage.entries[0].blocked, true);
      assert.equal(storage.entries[0].error, "http-" + status);
      await box.retry(original.id);
      assert.equal(calls, 2);
      assert.equal(storage.entries.length, 1);
    } finally {
      box.dispose();
    }
  }
});

test("408 and 429 retry automatically within the existing attempt and age budgets", async () => {
  for (const status of [408, 429]) {
    const storage = new MemoryStorage();
    let now = 100,
      calls = 0;
    const box = new FeedbackOutbox({
      storage,
      now: () => now,
      retryDelaysMs: [1000],
      fetch: request(async () => {
        calls++;
        return new Response(null, { status });
      }),
    });
    try {
      await box.enqueue(report(), null);
      assert.equal(storage.entries[0].blocked, false);
      await box.flush();
      assert.equal(calls, 1);
      now += 1000;
      await box.flush();
      assert.equal(calls, 2);
      now += 1000;
      await box.flush();
      assert.equal(calls, 2);
      now += FEEDBACK_LIMITS.pendingAgeMs;
      await box.retry();
      assert.equal(calls, 2);
      assert.equal(storage.entries.length, 1);
    } finally {
      box.dispose();
    }
  }
});

test("429 respects integer/date Retry-After, caps long waits and ignores invalid values", async () => {
  const initial = Date.parse("2026-10-20T10:00:00.000Z");
  for (const [header, delay] of [
    ["120", 120_000],
    ["Tue, 20 Oct 2026 10:00:30 GMT", 30_000],
    ["999999999", 300_000],
    ["not-a-date", 1000],
    ["-1", 1000],
    ["1.5", 1000],
    ["Tue, 20 Oct 2026 09:00:00 GMT", 1000],
  ] as const) {
    const storage = new MemoryStorage(),
      original = report();
    let now = initial,
      calls = 0;
    const box = new FeedbackOutbox({
      storage,
      now: () => now,
      retryDelaysMs: [1000],
      fetch: request(async () => {
        calls++;
        return calls === 1
          ? new Response(null, {
              status: 429,
              headers: { "Retry-After": header },
            })
          : receipt(original.id);
      }),
    });
    try {
      await box.enqueue(original, null);
      assert.equal(storage.entries[0].nextAttemptAtMs, initial + delay, header);
      await box.retry(original.id);
      assert.equal(calls, 1, "manual retry must respect rate-limit delay");
      now += delay - 1;
      await box.flush();
      assert.equal(calls, 1);
      now++;
      await box.flush();
      assert.equal(calls, 2);
      assert.equal(storage.entries.length, 0);
    } finally {
      box.dispose();
    }
  }
});

test("backoff and automatic attempt budget survive reload; expired entries are never silently removed", async () => {
  const storage = new MemoryStorage(),
    original = report();
  let now = 100,
    calls = 0;
  const options = {
    storage,
    now: () => now,
    retryDelaysMs: [1_000],
    fetch: request(async () => {
      calls++;
      return new Response(null, { status: 503 });
    }),
  };
  const first = new FeedbackOutbox(options);
  await first.enqueue(original, null);
  await first.flush();
  assert.equal(calls, 1);
  first.dispose();
  const second = new FeedbackOutbox(options);
  try {
    now += 999;
    await second.flush();
    assert.equal(calls, 1);
    now++;
    await second.flush();
    assert.equal(calls, 2);
    now += 1_000;
    await second.flush();
    assert.equal(calls, 2);
    now += FEEDBACK_LIMITS.pendingAgeMs;
    await second.retry(original.id);
    assert.equal(calls, 2);
    assert.equal(second.expired(storage.entries[0]), true);
    assert.equal((await second.list())[0].report.message, original.message);
    await second.remove(original.id);
    assert.equal(storage.entries.length, 0);
  } finally {
    second.dispose();
  }
});

test("online event retries persistent entries and dispose removes the listener, aborts requests and preserves pending", async () => {
  const storage = new MemoryStorage(),
    events = new EventTarget();
  let online = false,
    signal: AbortSignal | undefined;
  const box = new FeedbackOutbox({
    storage,
    online: () => online,
    events: events as Window,
    fetch: request(async (_, init) => {
      signal = init!.signal as AbortSignal;
      return await new Promise<Response>((_, reject) =>
        signal!.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    }),
  });
  await box.enqueue(report(), null);
  online = true;
  events.dispatchEvent(new Event("online"));
  await tick();
  await tick();
  assert.ok(signal);
  box.dispose();
  assert.equal(signal.aborted, true);
  await tick();
  assert.equal(storage.entries.length, 1);
  await assert.rejects(
    box.list(),
    (error) =>
      error instanceof FeedbackOutboxError && error.code === "disposed",
  );
  events.dispatchEvent(new Event("online"));
  await tick();
  assert.equal(storage.entries[0].attempts, 1);
});

test("timeout queues a retry, storage quota failure never sends, and invalid image is rejected before persistence", async () => {
  const storage = new MemoryStorage();
  let calls = 0;
  const box = new FeedbackOutbox({
    storage,
    timeoutMs: 5,
    retryDelaysMs: [60_000],
    fetch: request(async (_, init) => {
      calls++;
      return await new Promise<Response>((_, reject) =>
        init!.signal!.addEventListener("abort", () =>
          reject(new Error("timeout")),
        ),
      );
    }),
  });
  try {
    assert.equal((await box.enqueue(report(), null)).state, "queued");
    assert.equal(storage.entries[0].error, "timeout");
    storage.fail = true;
    await assert.rejects(
      box.enqueue(report(), null),
      (error) =>
        error instanceof FeedbackOutboxError && error.code === "storage",
    );
    assert.equal(calls, 1);
    storage.fail = false;
    await assert.rejects(
      box.enqueue(report(), new Blob(["wrong"], { type: "image/png" })),
      { code: "invalid" },
    );
    assert.equal(storage.entries.length, 1);
  } finally {
    box.dispose();
  }
});

test("removing an in-flight report is respected when its failed response arrives", async () => {
  const storage = new MemoryStorage(),
    original = report();
  let finish: (() => void) | undefined;
  const box = new FeedbackOutbox({
    storage,
    fetch: request(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return new Response(null, { status: 503 });
    }),
  });
  try {
    const submitting = box.enqueue(original, null);
    await tick();
    await tick();
    await box.remove(original.id);
    finish!();
    await submitting;
    assert.equal(storage.entries.length, 0);
  } finally {
    box.dispose();
  }
});
