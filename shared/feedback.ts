import { sanitizeDiagnosticsText } from "./session-diagnostics";
/** Explicit public feedback contract. Never accepts room presence, chat or credentials. */
export const FEEDBACK_VERSION = 1;
export const FEEDBACK_LIMITS = {
  message: 4000,
  expected: 2000,
  steps: 2000,
  contact: 254,
  imageBytes: 4 * 1024 * 1024,
  requestBytes: 5 * 1024 * 1024,
  imagePixels: 1920 * 1920,
  pendingReports: 5,
  pendingBytes: 20 * 1024 * 1024,
  pendingAgeMs: 7 * 86400000,
  events: 30,
} as const;
export type FeedbackKind = "bug" | "idea" | "other";
export type FeedbackMode = "menu" | "guest" | "multiplayer";
export interface FeedbackFrame {
  frameId: number;
  renderedAtUTC: string;
  renderCompletedAtMs: number;
  position: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number; yaw: number; pitch: number };
  renderWidth: number;
  renderHeight: number;
  cssWidth: number;
  cssHeight: number;
  quality: string;
  backend: "webgl2" | "webgpu" | "webgpu-fast";
}
export interface FeedbackCapture {
  state: "ready" | "unavailable" | "removed";
  reason?: string;
  requestedAtMs?: number;
  capturedAtMs?: number;
  width?: number;
  height?: number;
  mimeType?: "image/webp" | "image/png" | "image/jpeg";
  frame?: FeedbackFrame;
}
export interface FeedbackContext {
  clientBuildId: string;
  mode: FeedbackMode;
  locale: "cs" | "en";
  page: "menu" | "game" | "startup-error";
  userAgent?: string;
  renderErrors?: number;
  renderHealth?: string;
  events?: { atMs: number; kind: string; detail: string }[];
}
export interface FeedbackReport {
  version: typeof FEEDBACK_VERSION;
  id: string;
  createdAtUTC: string;
  kind: FeedbackKind;
  message: string;
  expected?: string;
  steps?: string;
  contact?: string;
  context: FeedbackContext;
  capture: FeedbackCapture;
}
export interface FeedbackReceipt {
  accepted: true;
  id: string;
  receivedAtUTC: string;
}
export type FeedbackValidation =
  { ok: true; report: FeedbackReport } | { ok: false; error: string };
export const feedbackIdValid = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const number = (v: unknown, max = 1e12) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
const positive = (v: unknown) => number(v, 32768) && (v as number) > 0;
const utc = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d\d-\d\dT/.test(v) &&
  v.length <= 32 &&
  Number.isFinite(Date.parse(v));
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max;
const clean = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
export const redactFeedbackSecrets = (s: string) =>
  s
    .replace(/\blin_api_[a-zA-Z0-9_-]+\b/g, "[redacted]")
    .replace(/\b(?:Bearer|Basic)\s+[a-zA-Z0-9._~+\/-]+=*/gi, "[redacted]");
const technical = (s: string) =>
  redactFeedbackSecrets(sanitizeDiagnosticsText(clean(s)));
function frame(raw: unknown): FeedbackFrame | null {
  const r = object(raw),
    p = object(r?.position),
    c = object(r?.camera);
  if (
    !r ||
    !p ||
    !c ||
    !Number.isSafeInteger(r.frameId) ||
    (r.frameId as number) < 0 ||
    !utc(r.renderedAtUTC) ||
    !number(r.renderCompletedAtMs) ||
    (r.renderCompletedAtMs as number) < 0 ||
    !["x", "y", "z"].every((k) => number(p[k], 1e7) && number(c[k], 1e7)) ||
    !number(c.yaw, 1e7) ||
    !number(c.pitch, 1e7) ||
    !["renderWidth", "renderHeight", "cssWidth", "cssHeight"].every((k) =>
      positive(r[k]),
    ) ||
    !text(r.quality, 32) ||
    !["webgl2", "webgpu", "webgpu-fast"].includes(String(r.backend))
  )
    return null;
  return {
    frameId: r.frameId as number,
    renderedAtUTC: r.renderedAtUTC,
    renderCompletedAtMs: r.renderCompletedAtMs as number,
    position: { x: p.x as number, y: p.y as number, z: p.z as number },
    camera: {
      x: c.x as number,
      y: c.y as number,
      z: c.z as number,
      yaw: c.yaw as number,
      pitch: c.pitch as number,
    },
    renderWidth: r.renderWidth as number,
    renderHeight: r.renderHeight as number,
    cssWidth: r.cssWidth as number,
    cssHeight: r.cssHeight as number,
    quality: r.quality as string,
    backend: r.backend as FeedbackFrame["backend"],
  };
}
export function validateFeedbackReport(value: unknown): FeedbackValidation {
  const r = object(value),
    ctx = object(r?.context),
    cap = object(r?.capture);
  const fail = (error: string): FeedbackValidation => ({ ok: false, error });
  if (
    !r ||
    r.version !== FEEDBACK_VERSION ||
    !feedbackIdValid(r.id) ||
    !utc(r.createdAtUTC)
  )
    return fail("invalid-envelope");
  if (
    !["bug", "idea", "other"].includes(String(r.kind)) ||
    !text(r.message, FEEDBACK_LIMITS.message) ||
    !clean(r.message as string)
  )
    return fail("invalid-message");
  for (const key of ["expected", "steps", "contact"] as const)
    if (r[key] !== undefined && !text(r[key], FEEDBACK_LIMITS[key]))
      return fail("invalid-" + key);
  if (r.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contact as string))
    return fail("invalid-contact");
  if (
    !ctx ||
    !text(ctx.clientBuildId, 128) ||
    !ctx.clientBuildId ||
    !["menu", "guest", "multiplayer"].includes(String(ctx.mode)) ||
    !["cs", "en"].includes(String(ctx.locale)) ||
    !["menu", "game", "startup-error"].includes(String(ctx.page))
  )
    return fail("invalid-context");
  if (!cap || !["ready", "unavailable", "removed"].includes(String(cap.state)))
    return fail("invalid-capture");
  const capture: FeedbackCapture = {
    state: cap.state as FeedbackCapture["state"],
  };
  if (cap.reason !== undefined) {
    if (!text(cap.reason, 120)) return fail("invalid-capture-reason");
    capture.reason = clean(cap.reason as string);
  }
  for (const key of ["requestedAtMs", "capturedAtMs"] as const) {
    if (cap[key] !== undefined) {
      if (!number(cap[key]) || (cap[key] as number) < 0)
        return fail("invalid-capture-time");
      capture[key] = cap[key] as number;
    }
  }
  if (cap.state === "ready") {
    const f = frame(cap.frame);
    if (
      !f ||
      !Number.isSafeInteger(cap.width) ||
      !Number.isSafeInteger(cap.height) ||
      !positive(cap.width) ||
      !positive(cap.height) ||
      (cap.width as number) * (cap.height as number) >
        FEEDBACK_LIMITS.imagePixels ||
      !["image/webp", "image/png", "image/jpeg"].includes(String(cap.mimeType))
    )
      return fail("invalid-image-metadata");
    capture.width = cap.width as number;
    capture.height = cap.height as number;
    capture.mimeType = cap.mimeType as FeedbackCapture["mimeType"];
    capture.frame = f;
  }
  const context: FeedbackContext = {
    clientBuildId: technical(ctx.clientBuildId as string),
    mode: ctx.mode as FeedbackMode,
    locale: ctx.locale as "cs" | "en",
    page: ctx.page as FeedbackContext["page"],
  };
  if (text(ctx.userAgent, 512))
    context.userAgent = technical(ctx.userAgent as string);
  if (
    Number.isSafeInteger(ctx.renderErrors) &&
    (ctx.renderErrors as number) >= 0
  )
    context.renderErrors = ctx.renderErrors as number;
  if (text(ctx.renderHealth, 64))
    context.renderHealth = technical(ctx.renderHealth as string);
  if (Array.isArray(ctx.events)) {
    context.events = ctx.events.slice(-FEEDBACK_LIMITS.events).flatMap((e) => {
      const entry = object(e);
      return entry &&
        number(entry.atMs) &&
        text(entry.kind, 48) &&
        text(entry.detail, 256)
        ? [
            {
              atMs: entry.atMs as number,
              kind: technical(entry.kind as string),
              detail: technical(entry.detail as string),
            },
          ]
        : [];
    });
  }
  const report: FeedbackReport = {
    version: FEEDBACK_VERSION,
    id: r.id.toLowerCase(),
    createdAtUTC: r.createdAtUTC,
    kind: r.kind as FeedbackKind,
    message: redactFeedbackSecrets(clean(r.message as string)),
    context,
    capture,
  };
  for (const key of ["expected", "steps", "contact"] as const)
    if (typeof r[key] === "string" && clean(r[key] as string))
      report[key] = redactFeedbackSecrets(clean(r[key] as string));
  return { ok: true, report };
}
