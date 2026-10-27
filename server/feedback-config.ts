/** Soukromé runtime hodnoty a veřejná diagnostická projekce jsou oddělené.
 * configured potvrzuje pouze přítomnost nastavení, nikoli oprávnění v API. */
export type FeedbackConfigurationDiagnostic = Readonly<{
  configured: boolean;
  credentialMode: "api-key" | "oauth" | "none";
  missing: readonly string[];
  warnings: readonly string[];
  allowedOriginsConfigured: boolean;
}>;

export type FeedbackDiagnostic =
  | Readonly<{
      kind: "configuration";
      configuration: FeedbackConfigurationDiagnostic;
    }>
  | Readonly<{
      kind: "delivery-error";
      code: string;
      stage: "pending" | "verifying" | "blocked";
    }>
  | Readonly<{ kind: "storage-error"; code: "delivery-storage" }>;

export type FeedbackDiagnosticObserver = (event: FeedbackDiagnostic) => void;

export function emitFeedbackDiagnostic(
  observer: FeedbackDiagnosticObserver | undefined,
  event: FeedbackDiagnostic,
) {
  // Logovací observer nesmí přerušit uložení ani převzít lifecycle doručování.
  try {
    observer?.(Object.freeze(event));
  } catch {
    /* diagnostika je best effort */
  }
}

export function resolveFeedbackLinearConfig(
  env: NodeJS.ProcessEnv = process.env,
) {
  const apiKey = env.LINEAR_API_KEY?.trim() ?? "";
  const accessToken = env.LINEAR_ACCESS_TOKEN?.trim() ?? "";
  const credential = apiKey || accessToken;
  const teamId = env.LINEAR_TEAM_ID?.trim() ?? "";
  const projectId = env.LINEAR_PROJECT_ID?.trim() ?? "";
  const stateId = env.LINEAR_STATUS_ID?.trim() || undefined;
  const missing: string[] = [],
    warnings: string[] = [];
  if (!credential) missing.push("LINEAR_API_KEY or LINEAR_ACCESS_TOKEN");
  if (!teamId) missing.push("LINEAR_TEAM_ID");
  if (!projectId) missing.push("LINEAR_PROJECT_ID");
  if (apiKey && accessToken)
    warnings.push("multiple-credentials-api-key-preferred");
  if (/^Bearer\s/i.test(apiKey))
    warnings.push("api-key-includes-bearer-prefix");
  if (!apiKey && /^Bearer\s/i.test(accessToken))
    warnings.push("oauth-token-includes-bearer-prefix");
  if (!apiKey && /^lin_api_/i.test(accessToken))
    warnings.push("api-key-in-oauth-setting");
  const diagnostic: FeedbackConfigurationDiagnostic = Object.freeze({
    configured: missing.length === 0,
    credentialMode: apiKey ? "api-key" : accessToken ? "oauth" : "none",
    missing: Object.freeze(missing),
    warnings: Object.freeze(warnings),
    allowedOriginsConfigured: !!env.FEEDBACK_ALLOWED_ORIGINS?.trim(),
  });
  return {
    credential,
    authorization: apiKey || (accessToken ? `Bearer ${accessToken}` : ""),
    teamId,
    projectId,
    stateId,
    diagnostic,
  };
}

const deliveryCodes = new Set([
  "linear-not-configured",
  "invalid-linear-url",
  "linear-response-too-large",
  "linear-network",
  "linear-rate-limit",
  "linear-create-unconfirmed",
  "linear-auth",
  "linear-unavailable",
  "linear-rejected",
  "linear-invalid-response",
  "linear-invalid-readback",
  "linear-readback-conflict",
  "linear-invalid-upload",
  "linear-invalid-upload-header",
  "local-image-missing",
  "linear-upload-failed",
  "linear-readback-missing",
  "delivery-storage",
  "closed",
]);

/** Nezapisovat neočekávaný obsah delivery.json do výstupu či logu. */
export function feedbackDiagnosticCode(value: unknown): string {
  return typeof value === "string" && deliveryCodes.has(value)
    ? value
    : "other";
}
