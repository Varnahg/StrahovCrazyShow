import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createFeedbackStore,
  type FeedbackStore,
} from "../server/feedback-store";
import {
  createFeedbackLinearWorker,
  feedbackIssueDescription,
  feedbackMarker,
} from "../server/feedback-linear";
import type { FeedbackReport } from "../shared/feedback";

const report = (): FeedbackReport => ({
  version: 1,
  id: "b0000000-0000-4000-8000-000000000001",
  createdAtUTC: "2026-10-20T20:00:00.000Z",
  kind: "bug",
  message:
    "![tracker](https://evil.invalid/image) <script>alert(1)</script> @someone",
  contact: "tester@example.invalid",
  context: { clientBuildId: "test", mode: "guest", locale: "en", page: "game" },
  capture: { state: "unavailable" },
});
const env = {
  LINEAR_API_KEY: "test-api-secret",
  LINEAR_TEAM_ID: "team",
  LINEAR_PROJECT_ID: "project",
};
const response = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(data), { status, headers });
const readback = (store: FeedbackStore, assetUrl?: string) => ({
  data: {
    issue: {
      id: store.list()[0].delivery.issueId,
      url: "https://linear.app/team/issue/KEY-123",
      description: feedbackIssueDescription(report(), assetUrl),
      team: { id: "team" },
      project: { id: "project" },
    },
  },
});
async function fixture(
  action: (store: FeedbackStore, directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "feedback-linear-"));
  try {
    const store = await createFeedbackStore({ directory });
    await store.accept(report());
    await action(store, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test("missing configuration persists pending-config without any remote request", () =>
  fixture(async (store) => {
    const worker = createFeedbackLinearWorker({
      store,
      env: {},
      fetch: async () => {
        throw new Error("must not request");
      },
    });
    await worker.flush();
    await worker.close();
    assert.equal(store.list()[0].delivery.stage, "pending-config");
    assert.equal(store.list()[0].delivery.attempts, 0);
  }));
test("create uses persisted UUID, server credentials only in headers, escaped description and mandatory readback", () =>
  fixture(async (store) => {
    const calls: { query: string; variables: Record<string, any> }[] = [];
    const worker = createFeedbackLinearWorker({
      store,
      env,
      fetch: async (url, init) => {
        assert.equal(url, "https://api.linear.app/graphql");
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          env.LINEAR_API_KEY,
        );
        assert.ok(!String(init?.body).includes(env.LINEAR_API_KEY));
        const body = JSON.parse(String(init?.body));
        calls.push(body);
        if (body.query.includes("FeedbackCreate"))
          return response({
            data: {
              issueCreate: {
                success: true,
                issue: { id: body.variables.input.id },
              },
            },
          });
        return response(readback(store));
      },
    });
    await worker.flush();
    await worker.close();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].variables.input.id, store.list()[0].delivery.issueId);
    assert.equal(store.list()[0].delivery.stage, "delivered");
    const description = calls[0].variables.input.description;
    assert.ok(description.includes(feedbackMarker(report().id)));
    assert.ok(!description.includes("![tracker]"));
    assert.ok(!description.includes("<script>"));
  }));
test("ambiguous create is reconciled after restart without another create", () =>
  fixture(async (store, directory) => {
    let instant = 10000,
      creates = 0;
    const first = createFeedbackLinearWorker({
      store,
      env,
      now: () => instant,
      random: () => 0,
      fetch: async (_url, init) => {
        if (String(init?.body).includes("FeedbackCreate")) {
          creates++;
          throw new Error("response lost after server created issue");
        }
        throw new Error("unexpected");
      },
    });
    await first.flush();
    await first.close();
    assert.equal(store.list()[0].delivery.stage, "verifying");
    instant = 100000;
    const restored = await createFeedbackStore({ directory });
    const second = createFeedbackLinearWorker({
      store: restored,
      env,
      now: () => instant,
      fetch: async (_url, init) => {
        assert.ok(String(init?.body).includes("FeedbackRead"));
        return response(readback(restored));
      },
    });
    await second.flush();
    await second.close();
    assert.equal(creates, 1);
    assert.equal(restored.list()[0].delivery.stage, "delivered");
  }));
test("not-found reconciliation retries the same UUID; mismatching existing issue is blocked", () =>
  fixture(async (store) => {
    const original = store.list()[0];
    await store.update(original.report.id, {
      ...original.delivery,
      createAttempted: true,
      stage: "verifying",
    });
    let reads = 0,
      creates = 0;
    const worker = createFeedbackLinearWorker({
      store,
      env,
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.query.includes("FeedbackRead") && reads++ === 0)
          return response({
            errors: [
              {
                message: "missing",
                path: ["issue"],
                extensions: { code: "ENTITY_NOT_FOUND" },
              },
            ],
          });
        if (body.query.includes("FeedbackCreate")) {
          creates++;
          assert.equal(body.variables.input.id, original.delivery.issueId);
          return response({
            data: {
              issueCreate: {
                success: true,
                issue: { id: original.delivery.issueId },
              },
            },
          });
        }
        return response({
          data: {
            issue: {
              ...readback(store).data.issue,
              description: "unrelated issue",
            },
          },
        });
      },
    });
    await worker.flush();
    await worker.close();
    assert.equal(creates, 1);
    assert.equal(store.list()[0].delivery.stage, "blocked");
    assert.equal(store.list()[0].delivery.error, "linear-readback-conflict");
  }));
test("GraphQL HTTP200 errors are never success, and 400 RATELIMITED honors reset milliseconds", () =>
  fixture(async (store) => {
    let instant = 10000,
      calls = 0;
    const worker = createFeedbackLinearWorker({
      store,
      env,
      now: () => instant,
      random: () => 0,
      fetch: async () => {
        calls++;
        return response(
          {
            errors: [
              {
                message: "private server detail",
                extensions: { code: "RATELIMITED" },
              },
            ],
          },
          400,
          { "x-ratelimit-requests-reset": "120000" },
        );
      },
    });
    await worker.flush();
    assert.equal(store.list()[0].delivery.nextAttemptAt, 120000);
    assert.equal(store.list()[0].delivery.error, "linear-rate-limit");
    await worker.flush();
    assert.equal(calls, 1);
    await worker.close();
  }));
test("HTTP200 validation failure and authentication errors retain private report in blocked state", () =>
  fixture(async (store) => {
    const worker = createFeedbackLinearWorker({
      store,
      env,
      fetch: async () =>
        response({
          errors: [
            {
              message: env.LINEAR_API_KEY,
              extensions: { code: "BAD_USER_INPUT" },
            },
          ],
        }),
    });
    await worker.flush();
    await worker.close();
    assert.equal(store.list()[0].delivery.stage, "blocked");
    assert.equal(store.list()[0].delivery.error, "linear-rejected");
    assert.ok(!JSON.stringify(store.list()).includes(env.LINEAR_API_KEY));
  }));
test("upload PUT copies returned headers and stores private asset URL before issue creation", () =>
  fixture(async (original, directory) => {
    // The store itself is format-independent; intake verifies actual image headers.
    const next = { ...report(), id: "b0000000-0000-4000-8000-000000000002" };
    await original.accept(next, {
      bytes: Buffer.from([1, 2, 3]),
      width: 1,
      height: 1,
      mimeType: "image/png",
    });
    const first = original.list()[0];
    await original.update(first.report.id, {
      ...first.delivery,
      stage: "delivered",
    });
    const store = await createFeedbackStore({ directory });
    const assetUrl = "https://uploads.linear.app/private-image.png",
      record = store.list()[1];
    let puts = 0;
    const worker = createFeedbackLinearWorker({
      store,
      env: {
        ...env,
        LINEAR_API_KEY: undefined,
        LINEAR_ACCESS_TOKEN: "oauth-token",
      },
      fetch: async (url, init) => {
        if (url === "https://storage.example.invalid/signed") {
          puts++;
          assert.equal(init?.method, "PUT");
          assert.equal(
            new Headers(init?.headers).get("x-upload-proof"),
            "signed-value",
          );
          assert.equal(new Headers(init?.headers).has("Authorization"), false);
          return new Response(null, { status: 200 });
        }
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          "Bearer oauth-token",
        );
        const body = JSON.parse(String(init?.body));
        if (body.query.includes("FeedbackUpload"))
          return response({
            data: {
              fileUpload: {
                success: true,
                uploadFile: {
                  uploadUrl: "https://storage.example.invalid/signed",
                  assetUrl,
                  headers: [{ key: "x-upload-proof", value: "signed-value" }],
                },
              },
            },
          });
        if (body.query.includes("FeedbackCreate")) {
          assert.equal(store.get(next.id)?.delivery.assetUrl, assetUrl);
          assert.ok(body.variables.input.description.includes(assetUrl));
          return response({
            data: {
              issueCreate: {
                success: true,
                issue: { id: record.delivery.issueId },
              },
            },
          });
        }
        return response({
          data: {
            issue: {
              ...readback(store, assetUrl).data.issue,
              id: record.delivery.issueId,
              description: feedbackIssueDescription(next, assetUrl),
            },
          },
        });
      },
    });
    await worker.flush();
    await worker.close();
    assert.equal(puts, 1);
    assert.equal(store.get(next.id)?.delivery.stage, "delivered");
  }));
test("close aborts owned pending fetch and leaves persisted creation identity for restart", () =>
  fixture(async (store) => {
    let entered!: () => void;
    const started = new Promise<void>((done) => {
      entered = done;
    });
    const worker = createFeedbackLinearWorker({
      store,
      env,
      fetch: async (_url, init) =>
        new Promise<Response>((_done, reject) => {
          entered();
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    });
    const pending = worker.flush();
    await started;
    await worker.close();
    await pending;
    assert.equal(store.list()[0].delivery.createAttempted, true);
    assert.equal(store.list()[0].delivery.stage, "creating");
  }));
test("request deadline covers a stalled response body and allows later reconciliation", () =>
  fixture(async (store) => {
    const worker = createFeedbackLinearWorker({
      store,
      env,
      requestTimeoutMs: 10,
      random: () => 0,
      fetch: async () => new Response(new ReadableStream({ start() {} })),
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        worker.flush(),
        new Promise<never>((_done, reject) => {
          timeout = setTimeout(
            () => reject(new Error("body deadline failed")),
            500,
          );
        }),
      ]);
      assert.equal(store.list()[0].delivery.stage, "verifying");
      assert.equal(store.list()[0].delivery.error, "linear-network");
    } finally {
      clearTimeout(timeout);
      await worker.close();
    }
  }));
test("explicit authentication failure is blocked and its response detail never reaches storage or diagnostics", () =>
  fixture(async (store) => {
    const diagnostics: unknown[][] = [];
    const worker = createFeedbackLinearWorker({
      store,
      env,
      onDeliveryError: (...args) => diagnostics.push(args),
      fetch: async () =>
        response(
          { errors: [{ message: `Authorization ${env.LINEAR_API_KEY}` }] },
          401,
        ),
    });
    await worker.flush();
    await worker.close();
    assert.equal(store.list()[0].delivery.stage, "blocked");
    assert.equal(store.list()[0].delivery.error, "linear-auth");
    assert.ok(
      !JSON.stringify({ records: store.list(), diagnostics }).includes(
        env.LINEAR_API_KEY,
      ),
    );
  }));
test("description redacts recognized tokens and the configured credential before escaping", () => {
  const value = {
    ...report(),
    message:
      "Credential lin_api_unitTestFakeValue and Bearer unit.test.token plus test-api-secret",
  };
  const description = feedbackIssueDescription(
    value,
    undefined,
    env.LINEAR_API_KEY,
  );
  for (const secret of [
    "lin_api_unitTestFakeValue",
    "unit.test.token",
    "test-api-secret",
  ])
    assert.ok(!description.includes(secret));
  assert.ok(description.includes("redacted"));
});
test("verified live INPUT_ERROR not-found shape permits reconciliation and the same UUID create", () =>
  fixture(async (store) => {
    const original = store.list()[0];
    await store.update(original.report.id, {
      ...original.delivery,
      createAttempted: true,
      stage: "verifying",
    });
    let reads = 0,
      creates = 0;
    const worker = createFeedbackLinearWorker({
      store,
      env,
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.query.includes("FeedbackRead") && reads++ === 0)
          return response({
            data: { issue: null },
            errors: [
              {
                message: "Entity not found: Issue",
                path: ["issue"],
                extensions: {
                  code: "INPUT_ERROR",
                  type: "invalid input",
                  userPresentableMessage: "Could not find referenced Issue.",
                },
              },
            ],
          });
        if (body.query.includes("FeedbackCreate")) {
          creates++;
          assert.equal(body.variables.input.id, original.delivery.issueId);
          return response({
            data: {
              issueCreate: {
                success: true,
                issue: { id: original.delivery.issueId },
              },
            },
          });
        }
        return response(readback(store));
      },
    });
    await worker.flush();
    await worker.close();
    assert.equal(creates, 1);
    assert.equal(store.list()[0].delivery.stage, "delivered");
  }));
test("another INPUT_ERROR is not evidence of absence and never causes a create retry", () =>
  fixture(async (store) => {
    const original = store.list()[0];
    await store.update(original.report.id, {
      ...original.delivery,
      createAttempted: true,
      stage: "verifying",
    });
    let calls = 0;
    const worker = createFeedbackLinearWorker({
      store,
      env,
      fetch: async (_url, init) => {
        calls++;
        assert.ok(String(init?.body).includes("FeedbackRead"));
        return response({
          data: { issue: null },
          errors: [
            {
              message: "Invalid issue identifier",
              path: ["issue"],
              extensions: {
                code: "INPUT_ERROR",
                type: "invalid input",
                userPresentableMessage: "Invalid issue identifier",
              },
            },
          ],
        });
      },
    });
    await worker.flush();
    await worker.close();
    assert.equal(calls, 1);
    assert.equal(store.list()[0].delivery.stage, "blocked");
  }));

for (const code of ["BAD_USER_INPUT", "FORBIDDEN"]) {
  test(`partial successful create with nested ${code} is read back instead of terminally blocked`, () =>
    fixture(async (store) => {
      let instant = 10000,
        creates = 0,
        reads = 0;
      const remoteIds = new Set<string>();
      const worker = createFeedbackLinearWorker({
        store,
        env,
        now: () => instant,
        random: () => 0,
        fetch: async (_url, init) => {
          const body = JSON.parse(String(init?.body));
          if (body.query.includes("FeedbackCreate")) {
            creates++;
            remoteIds.add(body.variables.input.id);
            return response({
              data: {
                issueCreate: {
                  success: true,
                  issue: { id: body.variables.input.id, url: null },
                },
              },
              errors: [
                {
                  message: "nested field failed after mutation",
                  path: ["issueCreate", "issue", "url"],
                  extensions: { code },
                },
              ],
            });
          }
          reads++;
          return response(readback(store));
        },
      });
      await worker.flush();
      assert.equal(store.list()[0].delivery.stage, "verifying");
      instant = 100000;
      await worker.flush();
      await worker.close();
      assert.equal(store.list()[0].delivery.stage, "delivered");
      assert.equal(creates, 1);
      assert.equal(reads, 1);
      assert.equal(remoteIds.size, 1);
    }));
}
test("oversized HTTP200 after remote create survives restart and reconciles without another issue", () =>
  fixture(async (store, directory) => {
    let instant = 10000,
      creates = 0;
    const remoteIds = new Set<string>();
    const first = createFeedbackLinearWorker({
      store,
      env,
      now: () => instant,
      random: () => 0,
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.ok(body.query.includes("FeedbackCreate"));
        creates++;
        remoteIds.add(body.variables.input.id);
        return response({
          data: {
            issueCreate: {
              success: true,
              issue: { id: body.variables.input.id },
            },
          },
          oversizedDiagnostic: "x".repeat(128 * 1024),
        });
      },
    });
    await first.flush();
    await first.close();
    assert.equal(store.list()[0].delivery.stage, "verifying");
    assert.equal(store.list()[0].delivery.error, "linear-response-too-large");
    instant = 100000;
    const restored = await createFeedbackStore({ directory });
    const second = createFeedbackLinearWorker({
      store: restored,
      env,
      now: () => instant,
      fetch: async (_url, init) => {
        assert.ok(String(init?.body).includes("FeedbackRead"));
        return response(readback(restored));
      },
    });
    await second.flush();
    await second.close();
    assert.equal(restored.list()[0].delivery.stage, "delivered");
    assert.equal(creates, 1);
    assert.equal(remoteIds.size, 1);
  }));
for (const rejection of [
  { code: "UNAUTHENTICATED", status: 401, expected: "linear-auth" },
  { code: "BAD_USER_INPUT", status: 200, expected: "linear-rejected" },
]) {
  test(`definitive ${rejection.code} terminates without repeated create attempts`, () =>
    fixture(async (store) => {
      let calls = 0;
      const worker = createFeedbackLinearWorker({
        store,
        env,
        fetch: async () => {
          calls++;
          return response(
            {
              data: { issueCreate: null },
              errors: [
                {
                  message: "rejected before create",
                  path: ["issueCreate"],
                  extensions: { code: rejection.code },
                },
              ],
            },
            rejection.status,
          );
        },
      });
      await worker.flush();
      await worker.flush();
      await worker.close();
      assert.equal(calls, 1);
      assert.equal(store.list()[0].delivery.stage, "blocked");
      assert.equal(store.list()[0].delivery.error, rejection.expected);
    }));
}
test("ambiguous response retries have a finite persisted attempt budget", () =>
  fixture(async (store) => {
    const original = store.list()[0];
    await store.update(original.report.id, {
      ...original.delivery,
      attempts: 11,
    });
    let calls = 0;
    const worker = createFeedbackLinearWorker({
      store,
      env,
      fetch: async () => {
        calls++;
        return new Response("x".repeat(128 * 1024 + 1));
      },
    });
    await worker.flush();
    await worker.flush();
    await worker.close();
    assert.equal(calls, 1);
    assert.equal(store.list()[0].delivery.attempts, 12);
    assert.equal(store.list()[0].delivery.stage, "blocked");
  }));
