import assert from "node:assert/strict";
import test from "node:test";
import {
  feedbackDiagnosticCode,
  resolveFeedbackLinearConfig,
} from "../server/feedback-config";

test("feedback configuration reports missing names without serializing environment values", () => {
  const config = resolveFeedbackLinearConfig({
    LINEAR_API_KEY: "  ",
    LINEAR_PROJECT_ID: "\n",
    UNRELATED_SECRET: "private-value",
  });
  assert.deepEqual(config.diagnostic, {
    configured: false,
    credentialMode: "none",
    missing: [
      "LINEAR_API_KEY or LINEAR_ACCESS_TOKEN",
      "LINEAR_TEAM_ID",
      "LINEAR_PROJECT_ID",
    ],
    warnings: [],
    allowedOriginsConfigured: false,
  });
  assert.ok(!JSON.stringify(config.diagnostic).includes("private-value"));
});

test("API key precedence remains unchanged and diagnostic output contains no key or target values", () => {
  const config = resolveFeedbackLinearConfig({
    LINEAR_API_KEY: "  fake-api-secret  ",
    LINEAR_ACCESS_TOKEN: "fake-oauth-secret",
    LINEAR_TEAM_ID: " private-team ",
    LINEAR_PROJECT_ID: " private-project ",
    LINEAR_STATUS_ID: " private-state ",
    FEEDBACK_ALLOWED_ORIGINS: "https://private-origin.invalid",
  });
  assert.equal(config.authorization, "fake-api-secret");
  assert.equal(config.stateId, "private-state");
  assert.equal(config.diagnostic.configured, true);
  assert.equal(config.diagnostic.credentialMode, "api-key");
  assert.deepEqual(config.diagnostic.warnings, [
    "multiple-credentials-api-key-preferred",
  ]);
  const serialized = JSON.stringify(config.diagnostic);
  for (const secret of [
    "fake-api-secret",
    "fake-oauth-secret",
    "private-team",
    "private-project",
    "private-state",
    "private-origin",
  ]) {
    assert.ok(!serialized.includes(secret));
  }
  assert.ok(
    Object.isFrozen(config.diagnostic) &&
      Object.isFrozen(config.diagnostic.missing),
  );
});

test("OAuth uses Bearer and suspicious credential formats are diagnosed rather than silently rewritten", () => {
  const base = { LINEAR_TEAM_ID: "team", LINEAR_PROJECT_ID: "project" };
  assert.equal(
    resolveFeedbackLinearConfig({ ...base, LINEAR_ACCESS_TOKEN: "token" })
      .authorization,
    "Bearer token",
  );
  const bearer = resolveFeedbackLinearConfig({
    ...base,
    LINEAR_ACCESS_TOKEN: "Bearer token",
  });
  assert.equal(bearer.authorization, "Bearer Bearer token");
  assert.deepEqual(bearer.diagnostic.warnings, [
    "oauth-token-includes-bearer-prefix",
  ]);
  assert.deepEqual(
    resolveFeedbackLinearConfig({ ...base, LINEAR_API_KEY: "Bearer token" })
      .diagnostic.warnings,
    ["api-key-includes-bearer-prefix"],
  );
  assert.deepEqual(
    resolveFeedbackLinearConfig({
      ...base,
      LINEAR_ACCESS_TOKEN: "lin_api_fake",
    }).diagnostic.warnings,
    ["api-key-in-oauth-setting"],
  );
});

test("diagnostic error codes never forward arbitrary stored messages", () => {
  assert.equal(feedbackDiagnosticCode("linear-auth"), "linear-auth");
  for (const value of [
    "lin_api_private",
    "Bearer private\nmessage",
    "https://private.invalid",
    "__proto__",
    null,
    5,
  ]) {
    assert.equal(feedbackDiagnosticCode(value), "other");
  }
});
