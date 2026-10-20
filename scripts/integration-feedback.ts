import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FeedbackReceipt, FeedbackReport } from "../shared/feedback";

export async function runFeedbackIntegration(
  options: {
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
  } = {},
) {
  const env = options.env ?? process.env,
    fetcher = options.fetch ?? fetch;
  assert.ok(
    env.STRAHOV_TEST_URL && env.FEEDBACK_DIR,
    "Owned isolated URL and FEEDBACK_DIR are required",
  );
  assert.ok(isAbsolute(env.FEEDBACK_DIR));
  assert.deepEqual(
    Object.keys(env).filter((key) => /^LINEAR_/i.test(key)),
    [],
    "Feedback integration must not inherit Linear credentials or targeting",
  );
  const endpoint = new URL(env.STRAHOV_TEST_URL);
  assert.equal(endpoint.origin, "http://127.0.0.1:2568");
  assert.deepEqual(
    await readdir(env.FEEDBACK_DIR),
    [],
    "Integration starts with its own empty spool",
  );
  const report: FeedbackReport = {
    version: 1,
    id: randomUUID(),
    createdAtUTC: new Date().toISOString(),
    kind: "other",
    message:
      "Isolated feedback HTTP integration acceptance; no remote issue requested.",
    context: {
      clientBuildId: "integration-feedback",
      mode: "guest",
      locale: "en",
      page: "menu",
    },
    capture: { state: "unavailable", reason: "integration-no-renderer" },
  };
  const post = async (metadata: unknown) => {
    const body = new FormData();
    body.append("metadata", JSON.stringify(metadata));
    return fetcher(new URL("/api/feedback", endpoint), {
      method: "POST",
      headers: { Origin: endpoint.origin },
      body,
      signal: AbortSignal.timeout(10000),
    });
  };
  const accepted = await post(report);
  assert.equal(
    accepted.status,
    202,
    "server/index.ts must register the real feedback handler",
  );
  assert.equal(accepted.headers.get("cache-control"), "no-store");
  const receipt = (await accepted.json()) as FeedbackReceipt;
  assert.deepEqual(Object.keys(receipt).sort(), [
    "accepted",
    "id",
    "receivedAtUTC",
  ]);
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.id, report.id);
  assert.ok(Number.isFinite(Date.parse(receipt.receivedAtUTC)));
  const persisted = JSON.parse(
    await readFile(join(env.FEEDBACK_DIR, report.id, "report.json"), "utf8"),
  );
  assert.deepEqual(persisted.receipt, receipt);
  assert.deepEqual(persisted.report, report);
  assert.match(persisted.hash, /^[a-f0-9]{64}$/);
  const duplicate = await post(report);
  assert.equal(duplicate.status, 202);
  assert.deepEqual(await duplicate.json(), receipt);
  const conflict = await post({
    ...report,
    message: "Different content under the same ID",
  });
  assert.equal(conflict.status, 409);
  await conflict.arrayBuffer();
  const malformed = await post({
    ...report,
    id: randomUUID(),
    context: { ...report.context, clientBuildId: "   " },
  });
  assert.equal(
    malformed.status,
    400,
    "Malformed canonical metadata must never poison the durable queue",
  );
  await malformed.arrayBuffer();
  assert.deepEqual(
    await readdir(env.FEEDBACK_DIR),
    [report.id],
    "Retries/conflicts/malformed metadata must not publish more reports",
  );
  let stage: string | undefined;
  for (let attempt = 0; attempt < 600; attempt++) {
    stage = JSON.parse(
      await readFile(
        join(env.FEEDBACK_DIR, report.id, "delivery.json"),
        "utf8",
      ),
    ).stage;
    if (stage === "pending-config") break;
    await new Promise((done) => setTimeout(done, 10));
  }
  assert.equal(
    stage,
    "pending-config",
    "No remote delivery is attempted without configuration",
  );
  console.log(
    "PASS isolated feedback POST, durable receipt, duplicate/conflict and malformed metadata boundary.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await runFeedbackIntegration();
