import type { FeedbackReport } from "../shared/feedback";
import {
  emitFeedbackDiagnostic,
  feedbackDiagnosticCode,
  resolveFeedbackLinearConfig,
  type FeedbackDiagnosticObserver,
} from "./feedback-config";
import type {
  FeedbackDelivery,
  FeedbackStore,
  StoredFeedback,
} from "./feedback-store";

const ENDPOINT = "https://api.linear.app/graphql";
const UPLOAD = `mutation FeedbackUpload($contentType:String!,$filename:String!,$size:Int!){fileUpload(contentType:$contentType,filename:$filename,size:$size,makePublic:false){success uploadFile{uploadUrl assetUrl headers{key value}}}}`;
const CREATE = `mutation FeedbackCreate($input:IssueCreateInput!){issueCreate(input:$input){success issue{id url}}}`;
const READ = `query FeedbackRead($id:String!){issue(id:$id){id url description team{id} project{id}}}`;
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : undefined;
const linearErrorCode = (error: unknown) => {
  const extensions = object(object(error)?.extensions);
  return String(extensions?.code ?? extensions?.type ?? "")
    .trim()
    .toUpperCase()
    .replace(/[ -]+/g, "_");
};
class DeliveryError extends Error {
  constructor(
    public code: string,
    public retry = false,
    public resetAt = 0,
  ) {
    super(code);
  }
}
function privateHttps(value: unknown) {
  if (typeof value !== "string" || value.length > 8192)
    throw new DeliveryError("invalid-linear-url");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DeliveryError("invalid-linear-url");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    /[\s<>"\\]/.test(value)
  )
    throw new DeliveryError("invalid-linear-url");
  return value;
}
function redactSecrets(text: string, credential?: string) {
  let safe = credential ? text.split(credential).join("[redacted]") : text;
  safe = safe
    .replace(/\blin_api_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]");
  return safe;
}
function resetTime(headers: Headers, now: number) {
  const after = headers.get("retry-after");
  const retry = after
    ? /^\d+(?:\.\d+)?$/.test(after)
      ? now + Number(after) * 1000
      : Date.parse(after)
    : 0;
  const resets = [
    "x-ratelimit-requests-reset",
    "x-ratelimit-complexity-reset",
    "x-ratelimit-endpoint-requests-reset",
  ].map((key) => Number(headers.get(key) ?? 0));
  return Math.min(
    now + 86400000,
    Math.max(
      now,
      Number.isFinite(retry) ? retry : 0,
      ...resets.filter(Number.isFinite),
    ),
  );
}
export const feedbackMarker = (id: string) => `Feedback report ID: ${id}`;
// Plain player text cannot create Markdown images/links, mention syntax or HTML.
export function escapeFeedbackMarkdown(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|~@-])/g, "\\$1");
}
export function feedbackIssueDescription(
  report: FeedbackReport,
  assetUrl?: string,
  credential?: string,
) {
  const section = (title: string, body?: string) =>
    body
      ? `## ${title}\n${escapeFeedbackMarkdown(redactSecrets(body, credential))}\n\n`
      : "";
  return (
    `${feedbackMarker(report.id)}\n\n` +
    section("Player feedback", report.message) +
    section("Expected behavior", report.expected) +
    section("Steps to reproduce", report.steps) +
    section("Optional private contact", report.contact) +
    `## Technical context\n\n${escapeFeedbackMarkdown(redactSecrets(JSON.stringify({ createdAtUTC: report.createdAtUTC, kind: report.kind, context: report.context, capture: report.capture }, null, 2), credential))}\n\n` +
    (assetUrl ? `![Game frame without HUD](<${privateHttps(assetUrl)}>)\n` : "")
  );
}
export interface FeedbackLinearOptions {
  store: FeedbackStore;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  requestTimeoutMs?: number;
  onDeliveryError?: (code: string, reportId: string) => void;
  onDiagnostic?: FeedbackDiagnosticObserver;
}
export function createFeedbackLinearWorker(options: FeedbackLinearOptions) {
  const { store } = options,
    env = options.env ?? process.env,
    fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now,
    random = options.random ?? Math.random;
  const controllers = new Set<AbortController>();
  let closed = false,
    running: Promise<void> | undefined;
  let configurationFingerprint = "";
  function configuration() {
    const result = resolveFeedbackLinearConfig(env);
    const fingerprint = JSON.stringify(result.diagnostic);
    if (fingerprint !== configurationFingerprint) {
      configurationFingerprint = fingerprint;
      emitFeedbackDiagnostic(options.onDiagnostic, {
        kind: "configuration",
        configuration: result.diagnostic,
      });
    }
    return result;
  }
  configuration();
  async function request(url: string, init: RequestInit) {
    if (closed) throw new DeliveryError("closed", true);
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(
      () => controller.abort(),
      options.requestTimeoutMs ?? 15000,
    );
    timer.unref?.();
    try {
      const response = await fetcher(url, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });
      const reader = response.body?.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      const abortBody = () => {
        void reader?.cancel().catch(() => {});
      };
      controller.signal.addEventListener("abort", abortBody, { once: true });
      try {
        if (reader)
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 128 * 1024) {
              await reader.cancel();
              // A successful HTTP status does not prove a mutation failed just
              // because its body could not be retained. Reconcile its UUID on
              // the next bounded attempt; definitive HTTP auth errors stop.
              throw new DeliveryError(
                "linear-response-too-large",
                response.ok ||
                  response.status >= 500 ||
                  response.status === 429,
              );
            }
            chunks.push(part.value);
          }
        if (controller.signal.aborted)
          throw new DeliveryError(closed ? "closed" : "linear-network", true);
        return new Response(
          [204, 205, 304].includes(response.status)
            ? null
            : Buffer.concat(chunks),
          {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          },
        );
      } finally {
        controller.signal.removeEventListener("abort", abortBody);
      }
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      throw new DeliveryError(closed ? "closed" : "linear-network", true);
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  async function graphql(
    query: string,
    variables: ObjectValue,
    auth: string,
    allowNotFound = false,
  ): Promise<ObjectValue | undefined> {
    const response = await request(ENDPOINT, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    let value: unknown;
    // request() applies one deadline and byte cap to headers and body together.
    try {
      value = await response.json();
    } catch {
      value = undefined;
    }
    const body = object(value),
      errors = Array.isArray(body?.errors) ? body.errors : [];
    const createPayload = object(object(body?.data)?.issueCreate);
    const ambiguousCreate =
      query === CREATE &&
      response.ok &&
      errors.length > 0 &&
      (createPayload?.success === true ||
        errors.some((error) => {
          const path = object(error)?.path;
          return (
            Array.isArray(path) && path.length > 1 && path[0] === "issueCreate"
          );
        }));
    // Nested field errors can coexist with a completed mutation. Even a
    // nonretryable nested permission/validation error must not strand that
    // successful issue in blocked without reading its persisted UUID first.
    const codes = errors.map(linearErrorCode);
    if (response.status === 429 || codes.includes("RATELIMITED"))
      throw new DeliveryError(
        "linear-rate-limit",
        true,
        resetTime(response.headers, now()),
      );
    if (ambiguousCreate)
      throw new DeliveryError("linear-create-unconfirmed", true);
    if (
      [401, 403].includes(response.status) ||
      codes.some((code) =>
        ["UNAUTHENTICATED", "AUTHENTICATION_ERROR", "FORBIDDEN"].includes(code),
      )
    )
      throw new DeliveryError("linear-auth");
    if (response.status >= 500 || response.status === 408)
      throw new DeliveryError("linear-unavailable", true);
    if (
      allowNotFound &&
      errors.length &&
      errors.every((error) => {
        const raw = object(error),
          code = linearErrorCode(raw),
          extensions = object(raw?.extensions);
        // Verified against Linear's live issue(id) endpoint on 2026-10-20.
        // Other INPUT_ERRORs can be validation/permissions and are never absence.
        const liveMissingIssue =
          code === "INPUT_ERROR" &&
          extensions?.type === "invalid input" &&
          raw?.message === "Entity not found: Issue" &&
          extensions.userPresentableMessage ===
            "Could not find referenced Issue." &&
          Array.isArray(raw.path) &&
          raw.path.length === 1 &&
          raw.path[0] === "issue";
        return (
          (liveMissingIssue ||
            ["ENTITY_NOT_FOUND", "NOT_FOUND"].includes(code)) &&
          (!raw?.path || (Array.isArray(raw.path) && raw.path[0] === "issue"))
        );
      })
    )
      return undefined;
    if (!response.ok || errors.length)
      throw new DeliveryError(
        "linear-rejected",
        response.ok &&
          !codes.some((code) =>
            [
              "BAD_USER_INPUT",
              "INVALID_INPUT",
              "INPUT_ERROR",
              "USER_ERROR",
              "FEATURE_NOT_ACCESSIBLE",
              "USAGE_LIMIT_EXCEEDED",
              "GRAPHQL_VALIDATION_FAILED",
              "VALIDATION_ERROR",
            ].includes(code),
          ),
      );
    const data = object(body?.data);
    if (!data) throw new DeliveryError("linear-invalid-response", true);
    return data;
  }
  async function deliver(record: StoredFeedback) {
    let state: FeedbackDelivery = { ...record.delivery };
    const save = async (patch: Partial<FeedbackDelivery>) => {
      state = { ...state, ...patch };
      await store.update(record.report.id, state);
    };
    const {
      credential, authorization: auth, teamId, projectId, stateId, diagnostic,
    } = configuration();
    if (!diagnostic.configured) {
      if (state.stage !== "pending-config")
        await save({ stage: "pending-config", error: "linear-not-configured" });
      return;
    }
    try {
      await save({ attempts: state.attempts + 1, error: undefined });
      // A create may have succeeded before an HTTP timeout or process restart.
      // Never retry it before checking the persisted UUID and report marker.
      const reconcile = async () => {
        const data = await graphql(READ, { id: state.issueId }, auth, true),
          issue = object(data?.issue);
        if (!issue) {
          if (data && data.issue !== null)
            throw new DeliveryError("linear-invalid-readback", true);
          return false;
        }
        if (
          issue.id !== state.issueId ||
          typeof issue.description !== "string" ||
          !issue.description.includes(feedbackMarker(record.report.id)) ||
          object(issue.team)?.id !== teamId ||
          object(issue.project)?.id !== projectId ||
          (state.assetUrl && !issue.description.includes(state.assetUrl))
        )
          throw new DeliveryError("linear-readback-conflict");
        await save({
          stage: "delivered",
          issueUrl: privateHttps(issue.url),
          deliveredAtUTC: new Date(now()).toISOString(),
          error: undefined,
          nextAttemptAt: 0,
        });
        return true;
      };
      if (state.createAttempted && (await reconcile())) return;
      if (record.image && !state.assetUrl) {
        await save({ stage: "uploading" });
        const data = await graphql(
          UPLOAD,
          {
            contentType: record.image.mimeType,
            filename: `feedback-${record.report.id}.${record.image.mimeType === "image/png" ? "png" : record.image.mimeType === "image/jpeg" ? "jpg" : "webp"}`,
            size: record.image.bytes,
          },
          auth,
        );
        const payload = object(data?.fileUpload),
          upload = object(payload?.uploadFile);
        if (
          payload?.success !== true ||
          !upload ||
          !Array.isArray(upload.headers) ||
          upload.headers.length > 32
        )
          throw new DeliveryError("linear-invalid-upload");
        const uploadUrl = privateHttps(upload.uploadUrl),
          assetUrl = privateHttps(upload.assetUrl);
        const headers = new Headers({
          "Content-Type": record.image.mimeType,
          "Cache-Control": "private, max-age=0",
        });
        for (const raw of upload.headers) {
          const header = object(raw);
          if (
            typeof header?.key !== "string" ||
            typeof header.value !== "string" ||
            header.key.length > 128 ||
            header.value.length > 8192
          )
            throw new DeliveryError("linear-invalid-upload-header");
          headers.set(header.key, header.value);
        }
        const image = await store.image(record.report.id);
        if (!image) throw new DeliveryError("local-image-missing");
        const uploaded = await request(uploadUrl, {
          method: "PUT",
          headers,
          body: new Uint8Array(image),
        });
        await uploaded.body?.cancel();
        if (!uploaded.ok)
          throw new DeliveryError(
            "linear-upload-failed",
            uploaded.status >= 500 || [403, 408, 429].includes(uploaded.status),
            resetTime(uploaded.headers, now()),
          );
        await save({ stage: "uploaded", assetUrl });
      }
      // Persist before the remote side effect, including its chosen immutable ID.
      await save({ stage: "creating", createAttempted: true });
      const input = {
        id: state.issueId,
        teamId,
        projectId,
        ...(stateId ? { stateId } : {}),
        title: redactSecrets(
          `[Game ${record.report.kind}] ${record.report.message.split(/\r?\n/)[0].slice(0, 180)}`,
          credential,
        ),
        description: feedbackIssueDescription(
          record.report,
          state.assetUrl,
          credential,
        ),
      };
      const data = await graphql(CREATE, { input }, auth),
        payload = object(data?.issueCreate),
        issue = object(payload?.issue);
      if (payload?.success !== true || issue?.id !== state.issueId)
        throw new DeliveryError("linear-create-unconfirmed", true);
      await save({ stage: "verifying" });
      if (!(await reconcile()))
        throw new DeliveryError("linear-readback-missing", true);
    } catch (error) {
      if (closed) return;
      const failure =
        error instanceof DeliveryError
          ? error
          : new DeliveryError("delivery-storage", true);
      // A malformed/unconfirmed create response is ambiguous even if the error
      // itself is non-retryable; the next attempt must reconcile before create.
      const retry = failure.retry && state.attempts < 12;
      const delay =
        Math.min(3600000, 5000 * 2 ** Math.min(state.attempts - 1, 10)) *
        (0.75 + Math.max(0, Math.min(1, random())) * 0.5);
      const stage = retry
        ? state.createAttempted ? "verifying" : "pending"
        : "blocked";
      await save({
        stage,
        error: failure.code,
        nextAttemptAt: retry ? Math.max(now() + delay, failure.resetAt) : 0,
      });
      emitFeedbackDiagnostic(options.onDiagnostic, {
        kind: "delivery-error", code: feedbackDiagnosticCode(failure.code), stage,
      });
      try { options.onDeliveryError?.(failure.code, record.report.id); }
      catch { /* observer nevlastní frontu */ }
    }
  }
  return {
    flush(): Promise<void> {
      if (closed) return Promise.resolve();
      if (running) return running;
      running = (async () => {
        const configured = configuration().diagnostic.configured;
        for (const record of store.pending(now(), configured)) {
          if (closed) break;
          await deliver(record);
        }
      })().finally(() => {
        running = undefined;
      });
      return running;
    },
    async close() {
      closed = true;
      for (const controller of controllers) controller.abort();
      await running;
    },
  };
}
