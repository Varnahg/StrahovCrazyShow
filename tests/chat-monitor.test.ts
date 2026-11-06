import assert from "node:assert/strict";
import test from "node:test";
import { createOptionalChatMonitor } from "../server/chat-monitor";
import { CRAZY_TYPKA_MONITORING_NOTICE_VERSION } from "../shared/crazy-typka";

const config = {
  CHAT_MONITOR_DATABASE_URL: "postgresql://127.0.0.1:1/chat_monitor_fixture",
  CHAT_MONITOR_ORIGIN: "https://strahov.example.test",
  CHAT_MONITOR_GITHUB_CLIENT_ID: "test-client",
  CHAT_MONITOR_GITHUB_CLIENT_SECRET: "test-secret",
  CHAT_MONITOR_GITHUB_IDS: "19, 32",
  CHAT_MONITOR_PRIVACY_URL: "https://strahov.example.test/privacy",
};

test("chat monitor is absent with default configuration", () => {
  const unexpected = () => assert.fail("disabled monitoring is valid");
  assert.equal(createOptionalChatMonitor({}, unexpected), undefined);
  assert.equal(
    createOptionalChatMonitor({ CHAT_MONITOR_CAPTURE: "0" }, unexpected),
    undefined,
  );
});

test("chat monitor admin can be configured independently of capture", async () => {
  for (const capture of ["0", "1"]) {
    const monitor = createOptionalChatMonitor({ ...config, CHAT_MONITOR_CAPTURE: capture });
    assert.ok(monitor);
    try {
      assert.equal(typeof monitor.admin, "function");
      assert.deepEqual(monitor.monitoring?.notice, capture === "1" ? {
        noticeVersion: CRAZY_TYPKA_MONITORING_NOTICE_VERSION,
        privacyUrl: config.CHAT_MONITOR_PRIVACY_URL,
      } : undefined);
    } finally {
      await monitor.close();
    }
  }
});

test("invalid, partial or RAG-shared monitoring configuration stays disabled", () => {
  let invalid = 0;
  const check = (env: NodeJS.ProcessEnv) => {
    assert.equal(createOptionalChatMonitor(env, () => {
      invalid++;
      throw new Error("broken diagnostics");
    }), undefined);
  };
  check({ CHAT_MONITOR_CAPTURE: "1" });
  check({ ...config, CHAT_MONITOR_CAPTURE: "true" });
  check({ ...config, CHAT_MONITOR_CAPTURE: "1", CHAT_MONITOR_PRIVACY_URL: "" });
  check({ ...config, CHAT_MONITOR_CAPTURE: "1", CHAT_MONITOR_PRIVACY_URL: "https://secret@strahov.example.test/privacy" });
  check({ ...config, CHAT_MONITOR_ORIGIN: "https://strahov.example.test/admin" });
  check({ ...config, CHAT_MONITOR_GITHUB_IDS: "1e3" });
  check({ ...config, RAG_DATABASE_URL: "postgres://other-host/chat_monitor_fixture" });
  assert.equal(invalid, 7);
});
