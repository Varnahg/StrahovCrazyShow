import { createHash, randomBytes } from "node:crypto";
import type {
  IncomingMessage,
  ServerResponse,
  Server as HttpServer,
  RequestListener,
} from "node:http";
import {
  CRAZY_TYPKA_LIMITS,
  CRAZY_TYPKA_SPEAKER,
  isCrazyTypkaRequestSeq,
  type CrazyTypkaErrorCode,
  type CrazyTypkaChatResponse,
  type CrazyTypkaErrorResponse,
} from "../shared/crazy-typka";
import {
  createCrazyTypkaProvider,
  CrazyTypkaProviderError,
  CRAZY_TYPKA_REASONING_EFFORTS,
  type CrazyTypkaReasoningEffort,
  type AiHistoryMessage,
} from "./crazy-typka-provider";
import {
  createConfiguredEvidenceBackend,
  prepareEvidenceQuery,
  RagEvidenceError,
  type AsyncEvidenceBackend,
  type EvidenceSnapshot,
} from "./rag-evidence-backend";
import { isKnowledgeDocumentUsable } from "./crazy-typka-retrieval";

export type CrazyTypkaServiceLimits = {
  requestBytes: number;
  requestTimeoutMs: number;
  operationTimeoutMs: number;
  providerTimeoutMs: number;
  providerResponseBytes: number;
  maxActiveRequests: number;
  maxSessions: number;
  maxAddresses: number;
  sessionTtlMs: number;
  requestsPerMinutePerIp: number;
  sessionsPerMinutePerIp: number;
  globalRequestsPerMinute: number;
  messagesPerMinutePerSession: number;
  generationsPerProcess: number;
  embeddingsPerProcess: number;
  embeddingTokenBudget: number;
};
export type CrazyTypkaServiceOptions = {
  env?: NodeJS.ProcessEnv;
  evidenceBackend?: AsyncEvidenceBackend;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  limits?: Partial<CrazyTypkaServiceLimits>;
};
const DEFAULT_LIMITS: CrazyTypkaServiceLimits = {
  requestBytes: 8192,
  requestTimeoutMs: 10000,
  operationTimeoutMs: 40000,
  providerTimeoutMs: 15000,
  providerResponseBytes: 65536,
  maxActiveRequests: 4,
  maxSessions: 256,
  maxAddresses: 2048,
  sessionTtlMs: 30 * 60000,
  requestsPerMinutePerIp: 30,
  sessionsPerMinutePerIp: 6,
  globalRequestsPerMinute: 120,
  messagesPerMinutePerSession: 6,
  generationsPerProcess: 500,
  embeddingsPerProcess: 500,
  embeddingTokenBudget: 500000,
};
type Session = {
  expiresAt: number;
  origin: string;
  history: AiHistoryMessage[];
  messages: number[];
  inflight?: AbortController;
  lastMessage?: { hash: string; at: number };
  nextRequestSeq: number;
  lastOperation?: Operation;
  /** Failed or blocked attempts clear this boundary without retaining rejected text. */
  previousSuccessfulUser?: string;
};
type TerminalResult = {
  status: number;
  body: CrazyTypkaChatResponse | CrazyTypkaErrorResponse;
};
type Operation = {
  seq: number;
  payloadHash: string;
  evidence?: EvidenceSnapshot;
  terminal?: TerminalResult;
};
type Address = { requests: number[]; sessions: number[] };
function evidenceCurrent(evidence: EvidenceSnapshot, instant: number) {
  return evidence.chunks.every((chunk) =>
    isKnowledgeDocumentUsable(chunk.document, instant),
  );
}
function rememberTerminal(
  session: Session,
  operation: Operation,
  result: TerminalResult,
) {
  // A failed newer USER attempt is a topic boundary. Do not let the generator
  // silently fall back to older successful dialogue, or resend rejected text.
  if (result.status >= 400) {
    session.history.length = 0;
    operation.evidence = undefined;
    session.previousSuccessfulUser = undefined;
  }
  operation.terminal = result;
}
export function isCrazyTypkaPath(url: string | undefined) {
  return (
    url === "/api/ai" ||
    url?.startsWith("/api/ai/") === true ||
    url?.startsWith("/api/ai?") === true
  );
}
class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: CrazyTypkaErrorCode,
  ) {
    super(code);
  }
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function firstGreeting(
  message: string,
  locale: "cs" | "en",
): string | undefined {
  if (!/^(?:ahoj|čau|cau|nazdar|dobrý den|hello|hi|hey)[!.?]?$/iu.test(message))
    return undefined;
  return locale === "cs"
    ? "Ahoj! Jsem Crazy Typka, fiktivní AI průvodkyně Strahovem. S čím ti pomůžu? Kopec už máme, teď najdeme cestu."
    : "Hi! I'm Crazy Typka, a fictional AI guide to Strahov. What can I help with? We've got the hill; let's find your way.";
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function trim(timestamps: number[], now: number) {
  while (timestamps.length && timestamps[0] <= now - 60000) timestamps.shift();
}
function parseOrigins(value: string | undefined) {
  const origins = new Set<string>();
  for (const text of value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []) {
    const url = new URL(text);
    if (
      url.origin !== text ||
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Invalid CRAZY_TYPKA_ALLOWED_ORIGINS configuration");
    origins.add(text);
  }
  return origins;
}
function originFor(req: IncomingMessage, allowed: Set<string>) {
  const raw = req.headers.origin;
  if (typeof raw !== "string" || raw === "null") return undefined;
  try {
    const origin = new URL(raw);
    if (origin.origin !== raw || !["https:", "http:"].includes(origin.protocol))
      return undefined;
    const host = req.headers.host;
    const scheme = (req.socket as typeof req.socket & { encrypted?: boolean })
      .encrypted
      ? "https"
      : "http";
    const direct =
      host && !/[\s/@\\]/.test(host)
        ? new URL(`${scheme}://${host}`).origin
        : undefined;
    return allowed.has(raw) || raw === direct ? raw : undefined;
  } catch {
    return undefined;
  }
}
function readJson(
  req: IncomingMessage,
  limits: CrazyTypkaServiceLimits,
  signal: AbortSignal,
): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? ""))
    return Promise.reject(new RequestError(400, "invalid-request"));
  const length = req.headers["content-length"];
  if (
    length !== undefined &&
    (!/^\d+$/.test(length) || Number(length) > limits.requestBytes)
  )
    return Promise.reject(new RequestError(413, "request-too-large"));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0,
      finished = false;
    const timer = setTimeout(
      () => finish(new RequestError(408, "request-timeout")),
      limits.requestTimeoutMs,
    );
    timer.unref();
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      req.off("data", data);
      req.off("end", end);
      req.off("error", failed);
      req.off("aborted", aborted);
      if (error) {
        req.resume();
        reject(error);
        return;
      }
      try {
        resolve(
          JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              Buffer.concat(chunks, size),
            ) || "{}",
          ),
        );
      } catch {
        reject(new RequestError(400, "invalid-request"));
      }
    };
    const data = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limits.requestBytes)
        return finish(new RequestError(413, "request-too-large"));
      chunks.push(bytes);
    };
    const end = () => finish(),
      failed = () => finish(new RequestError(400, "invalid-request"));
    const aborted = () => finish(new RequestError(400, "cancelled"));
    const abort = () => finish(new RequestError(409, "cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    req.on("data", data);
    req.on("end", end);
    req.on("error", failed);
    req.on("aborted", aborted);
    if (signal.aborted) abort();
  });
}

export function createCrazyTypkaService(
  options: CrazyTypkaServiceOptions = {},
) {
  const env = options.env ?? process.env,
    now = options.now ?? Date.now;
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const value of Object.values(limits))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error("Invalid AI limits");
  const configuredCap = env.CRAZY_TYPKA_GENERATIONS_PER_PROCESS;
  if (configuredCap !== undefined) {
    if (!/^[1-9]\d{0,5}$/.test(configuredCap))
      throw new Error("Invalid CRAZY_TYPKA_GENERATIONS_PER_PROCESS");
    limits.generationsPerProcess = Math.min(
      limits.generationsPerProcess,
      Number(configuredCap),
    );
  }
  for (const [key, variable] of [
    ["embeddingsPerProcess", "CRAZY_TYPKA_EMBEDDINGS_PER_PROCESS"],
    ["embeddingTokenBudget", "CRAZY_TYPKA_EMBEDDING_TOKEN_BUDGET"],
  ] as const) {
    const raw = env[variable];
    if (raw !== undefined) {
      if (!/^[1-9]\d{0,8}$/.test(raw))
        throw new Error("Invalid AI budget configuration");
      limits[key] = Math.min(limits[key], Number(raw));
    }
  }
  const enabled =
    env.CRAZY_TYPKA_ENABLED === "1" &&
    !!env.OPENAI_API_KEY?.trim() &&
    !!env.OPENAI_MODEL?.trim();
  const origins = parseOrigins(env.CRAZY_TYPKA_ALLOWED_ORIGINS);
  const reasoningEffort = env.OPENAI_REASONING_EFFORT?.trim() || undefined;
  if (
    reasoningEffort &&
    !CRAZY_TYPKA_REASONING_EFFORTS.includes(
      reasoningEffort as CrazyTypkaReasoningEffort,
    )
  )
    throw new Error("Invalid OPENAI_REASONING_EFFORT");
  const provider = createCrazyTypkaProvider({
    apiKey: env.OPENAI_API_KEY?.trim() ?? "",
    model: env.OPENAI_MODEL?.trim() ?? "",
    reasoningEffort: reasoningEffort as CrazyTypkaReasoningEffort | undefined,
    fetch: options.fetch,
    timeoutMs: limits.providerTimeoutMs,
    responseBytes: limits.providerResponseBytes,
  });
  const backend = enabled
    ? (options.evidenceBackend ??
      createConfiguredEvidenceBackend(env, options.fetch))
    : undefined;
  const sessions = new Map<string, Session>(),
    addresses = new Map<string, Address>();
  const globalRequests: number[] = [];
  const active = new Set<AbortController>();
  const pending = new Set<Promise<boolean>>();
  let closed = false,
    generations = 0,
    embeddingAttempts = 0,
    reservedEmbeddingTokens = 0,
    confirmedEmbeddingTokens = 0;
  function prune() {
    const instant = now();
    for (const [key, session] of sessions)
      if (session.expiresAt <= instant) {
        session.inflight?.abort();
        sessions.delete(key);
      }
    for (const [ip, state] of addresses) {
      trim(state.requests, instant);
      trim(state.sessions, instant);
      if (!state.requests.length && !state.sessions.length)
        addresses.delete(ip);
    }
    trim(globalRequests, instant);
  }
  function admission(req: IncomingMessage, issueSession: boolean) {
    prune();
    if (active.size >= limits.maxActiveRequests)
      throw new RequestError(503, "busy");
    const ip = req.socket.remoteAddress ?? "unknown";
    let state = addresses.get(ip);
    if (!state) {
      if (addresses.size >= limits.maxAddresses)
        throw new RequestError(429, "rate-limited");
      state = { requests: [], sessions: [] };
      addresses.set(ip, state);
    }
    if (
      state.requests.length >= limits.requestsPerMinutePerIp ||
      globalRequests.length >= limits.globalRequestsPerMinute ||
      (issueSession && state.sessions.length >= limits.sessionsPerMinutePerIp)
    )
      throw new RequestError(429, "rate-limited");
    state.requests.push(now());
    globalRequests.push(now());
    if (issueSession) state.sessions.push(now());
  }
  function sessionFor(token: unknown, origin: string) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      throw new RequestError(401, "session-expired");
    const key = hash(token),
      session = sessions.get(key);
    if (!session || session.expiresAt <= now() || session.origin !== origin)
      throw new RequestError(401, "session-expired");
    return { key, session };
  }
  async function processRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    if (!isCrazyTypkaPath(req.url)) return false;
    for (const name of [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Credentials",
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Headers",
      "Access-Control-Max-Age",
    ])
      res.removeHeader(name);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status: number, body?: unknown) => {
      if (!res.destroyed && !res.writableEnded)
        res
          .writeHead(status)
          .end(body === undefined ? undefined : JSON.stringify(body));
      return true;
    };
    let controller: AbortController | undefined,
      operationTimer: ReturnType<typeof setTimeout> | undefined;
    let inflight: Session | undefined,
      operationTimedOut = false;
    let accepted:
      { key: string; session: Session; operation: Operation } | undefined;
    const terminalReply = (
      status: number,
      body: CrazyTypkaChatResponse | CrazyTypkaErrorResponse,
    ) => {
      if (
        accepted &&
        sessions.get(accepted.key) === accepted.session &&
        accepted.session.lastOperation === accepted.operation &&
        accepted.session.expiresAt > now()
      )
        rememberTerminal(accepted.session, accepted.operation, {
          status,
          body,
        });
      return reply(status, body);
    };
    const disconnected = () => controller?.abort();
    try {
      if (
        !["/api/ai/status", "/api/ai/session", "/api/ai/chat"].includes(
          req.url ?? "",
        )
      )
        return reply(404, { error: "not-found" });
      if (req.url === "/api/ai/status" && req.method === "GET") {
        const origin = originFor(req, origins);
        if (req.headers.origin && !origin)
          return reply(403, { error: "origin-rejected" });
        if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
        const available = enabled && !closed && (await backend!.ready());
        return reply(200, { enabled: available && !closed });
      }
      const origin = originFor(req, origins);
      if (!origin) return reply(403, { error: "origin-rejected" });
      res.setHeader("Access-Control-Allow-Origin", origin);
      const methods =
        req.url === "/api/ai/session"
          ? ["POST", "DELETE"]
          : req.url === "/api/ai/chat"
            ? ["POST"]
            : ["GET"];
      if (req.method === "OPTIONS") {
        const method = req.headers["access-control-request-method"];
        const headers = req.headers["access-control-request-headers"];
        if (
          typeof method !== "string" ||
          !methods.includes(method) ||
          (typeof headers === "string" &&
            headers
              .split(",")
              .some(
                (header) =>
                  !["content-type", "authorization"].includes(
                    header.trim().toLowerCase(),
                  ),
              ))
        )
          return reply(403, { error: "origin-rejected" });
        res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );
        return reply(204);
      }
      if (!methods.includes(req.method ?? ""))
        return reply(405, { error: "method-not-allowed" });
      if (!enabled || closed) return reply(503, { error: "unavailable" });
      // Reset remains possible while admission slots are full: it releases resources.
      if (req.method === "DELETE") {
        const authorization = req.headers.authorization;
        const { key, session } = sessionFor(
          authorization?.startsWith("Bearer ")
            ? authorization.slice(7)
            : undefined,
          origin,
        );
        sessions.delete(key);
        session.inflight?.abort();
        session.history.length = 0;
        session.previousSuccessfulUser = undefined;
        session.lastOperation = undefined;
        return reply(204);
      }
      const issueSession = req.url === "/api/ai/session";
      admission(req, issueSession); // Before body collection or any paid provider work.
      if (issueSession && sessions.size >= limits.maxSessions)
        throw new RequestError(503, "busy");
      controller = new AbortController();
      active.add(controller);
      req.on("aborted", disconnected);
      res.on("close", disconnected);
      operationTimer = setTimeout(() => {
        operationTimedOut = true;
        controller?.abort();
      }, limits.operationTimeoutMs);
      operationTimer.unref();
      const body = await readJson(req, limits, controller.signal);
      if (closed || controller.signal.aborted)
        throw new RequestError(409, "cancelled");
      if (!object(body)) throw new RequestError(400, "invalid-request");
      if (issueSession) {
        if (!(await backend!.ready(controller.signal)))
          throw new RequestError(503, "unavailable");
        if (closed || controller.signal.aborted)
          throw new RequestError(409, "cancelled");
        if (Object.keys(body).length)
          throw new RequestError(400, "invalid-request");
        // Recheck after asynchronous uploads: other admitted requests may have issued sessions.
        if (sessions.size >= limits.maxSessions)
          throw new RequestError(503, "busy");
        const token = randomBytes(32).toString("hex"),
          expiresAt = now() + limits.sessionTtlMs;
        sessions.set(hash(token), {
          expiresAt,
          origin,
          history: [],
          messages: [],
          nextRequestSeq: 1,
          previousSuccessfulUser: undefined,
        });
        return reply(201, { token, expiresAt });
      }
      if (
        Object.keys(body).some(
          (key) => !["token", "requestSeq", "message", "locale"].includes(key),
        ) ||
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > CRAZY_TYPKA_LIMITS.messageChars ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.message) ||
        (body.locale !== "cs" && body.locale !== "en") ||
        !isCrazyTypkaRequestSeq(body.requestSeq)
      )
        throw new RequestError(400, "invalid-request");
      const { key, session } = sessionFor(body.token, origin);
      const message = body.message.trim(),
        payloadHash = hash(JSON.stringify([message, body.locale]));
      const previous = session.lastOperation;
      if (previous?.seq === body.requestSeq) {
        if (previous.payloadHash !== payloadHash)
          throw new RequestError(409, "request-conflict");
        if (!previous.terminal) throw new RequestError(409, "busy");
        if (session.inflight) throw new RequestError(409, "busy");
        session.inflight = controller;
        inflight = session;
        const current =
          previous.terminal.status >= 400 ||
          !previous.evidence ||
          ((await backend!.validate(
            previous.evidence,
            now(),
            controller.signal,
          )) &&
            evidenceCurrent(previous.evidence, now()));
        if (
          controller.signal.aborted ||
          sessions.get(key) !== session ||
          session.lastOperation !== previous ||
          session.expiresAt <= now()
        )
          throw new RequestError(401, "session-expired");
        if (!current)
          rememberTerminal(session, previous, {
            status: 409,
            body: { error: "response-expired", requestSeq: previous.seq },
          });
        return reply(previous.terminal.status, previous.terminal.body);
      }
      if (body.requestSeq !== session.nextRequestSeq)
        throw new RequestError(409, "request-out-of-order");
      if (session.inflight) throw new RequestError(409, "busy");
      trim(session.messages, now());
      const digest = hash(message.toLocaleLowerCase("cs"));
      if (
        session.messages.length >= limits.messagesPerMinutePerSession ||
        (session.lastMessage?.hash === digest &&
          now() - session.lastMessage.at < 10000)
      )
        throw new RequestError(429, "rate-limited");
      const greeting =
        !previous && session.nextRequestSeq === 1 && !session.history.length
          ? firstGreeting(message, body.locale)
          : undefined;
      if (!greeting && generations >= limits.generationsPerProcess)
        throw new RequestError(503, "budget-exhausted");
      session.messages.push(now());
      session.lastMessage = { hash: digest, at: now() };
      session.inflight = controller;
      inflight = session;
      const operation: Operation = {
        seq: body.requestSeq,
        payloadHash,
        evidence: undefined,
      };
      session.lastOperation = operation;
      session.nextRequestSeq++;
      accepted = { key, session, operation };
      if (greeting) {
        session.history.push(
          { role: "user", content: message },
          { role: "assistant", content: greeting },
        );
        return terminalReply(200, {
          speaker: CRAZY_TYPKA_SPEAKER,
          text: greeting,
          sources: [],
          requestSeq: operation.seq,
        });
      }
      const query = prepareEvidenceQuery(
        message,
        session.previousSuccessfulUser,
      );
      await provider.moderateInput(query.text, controller.signal);
      operation.evidence = await backend!.search(query, {
        signal: controller.signal,
        now: now(),
        user: key,
        onEmbeddingAttempt: (inputBytes) => {
          if (
            sessions.get(key) !== session ||
            session.expiresAt <= now() ||
            controller?.signal.aborted
          )
            throw new RagEvidenceError("cancelled");
          if (
            !Number.isSafeInteger(inputBytes) ||
            inputBytes < 1 ||
            embeddingAttempts >= limits.embeddingsPerProcess ||
            reservedEmbeddingTokens + inputBytes > limits.embeddingTokenBudget
          )
            throw new RagEvidenceError("budget-exhausted");
          embeddingAttempts++;
          reservedEmbeddingTokens += inputBytes;
        },
        onEmbeddingUsage: (usage) => {
          confirmedEmbeddingTokens += usage.totalTokens;
        },
      });
      if (
        !(await backend!.validate(
          operation.evidence,
          now(),
          controller.signal,
        )) ||
        !evidenceCurrent(operation.evidence, now())
      )
        throw new RequestError(409, "response-expired");
      if (
        previous?.evidence &&
        previous.evidence.snapshot.revisionId !==
          operation.evidence.snapshot.revisionId
      )
        session.history.length = 0;
      const evidence = operation.evidence.chunks;
      const answer = await provider.generate({
        message,
        locale: body.locale as "cs" | "en",
        history: session.history,
        evidence,
        safetyIdentifier: key,
        signal: controller.signal,
        onGenerationStart: () => {
          if (
            sessions.get(key) !== session ||
            session.expiresAt <= now() ||
            controller?.signal.aborted
          )
            throw new RequestError(409, "cancelled");
          if (generations >= limits.generationsPerProcess)
            throw new RequestError(503, "budget-exhausted");
          generations++; // Counts actual generation attempts, including upstream errors; no refund/retry.
        },
      });
      if (
        controller.signal.aborted ||
        sessions.get(key) !== session ||
        session.expiresAt <= now()
      )
        throw new RequestError(409, "cancelled");
      if (
        !(await backend!.validate(
          operation.evidence,
          now(),
          controller.signal,
        )) ||
        !evidenceCurrent(operation.evidence, now())
      )
        throw new RequestError(409, "response-expired");
      if (
        controller.signal.aborted ||
        sessions.get(key) !== session ||
        session.expiresAt <= now()
      )
        throw new RequestError(409, "cancelled");
      session.previousSuccessfulUser = query.filterText;
      session.history.push(
        { role: "user", content: message },
        { role: "assistant", content: answer.text },
      );
      session.history.splice(
        0,
        Math.max(
          0,
          session.history.length - CRAZY_TYPKA_LIMITS.historyTurns * 2,
        ),
      );
      const sources = [
        ...new Map(
          answer.sourceIds.map((id) => {
            const source = evidence.find((chunk) => chunk.id === id)!.source;
            return [source.id, source] as const;
          }),
        ).values(),
      ];
      const result: CrazyTypkaChatResponse = {
        speaker: CRAZY_TYPKA_SPEAKER,
        text: answer.text,
        sources,
        requestSeq: operation.seq,
      };
      return terminalReply(200, result);
    } catch (error) {
      const code = operationTimedOut
        ? "request-timeout"
        : error instanceof RequestError ||
            error instanceof CrazyTypkaProviderError ||
            error instanceof RagEvidenceError
          ? error.code
          : "provider-unavailable";
      const status = operationTimedOut
        ? 408
        : error instanceof RequestError
          ? error.status
          : code === "blocked"
            ? 422
            : code === "cancelled" || code === "response-expired"
              ? 409
              : code === "request-timeout"
                ? 504
                : code === "budget-exhausted"
                  ? 503
                  : 502;
      if (code === "rate-limited") res.setHeader("Retry-After", "60");
      return terminalReply(status, {
        error: code,
        ...(accepted ? { requestSeq: accepted.operation.seq } : {}),
        ...(code === "rate-limited" ? { retryAfterSeconds: 60 } : {}),
      });
    } finally {
      if (operationTimer) clearTimeout(operationTimer);
      req.off("aborted", disconnected);
      res.off("close", disconnected);
      if (inflight && inflight.inflight === controller)
        inflight.inflight = undefined;
      if (controller) {
        active.delete(controller);
        controller.abort();
      }
    }
  }
  // One unref'ed sweep also forgets idle histories without waiting for another
  // request. Expiry checks on every use remain authoritative between sweeps.
  const expiryTimer = setInterval(prune, Math.min(60000, limits.sessionTtlMs));
  expiryTimer.unref();
  return {
    handle(req: IncomingMessage, res: ServerResponse) {
      const work = processRequest(req, res);
      pending.add(work);
      void work.finally(() => pending.delete(work)).catch(() => {});
      return work;
    },
    usage() {
      return {
        embeddingAttempts,
        reservedEmbeddingTokens,
        confirmedEmbeddingTokens,
        generationAttempts: generations,
      };
    },
    async close() {
      closed = true;
      clearInterval(expiryTimer);
      for (const controller of active) controller.abort();
      sessions.clear();
      addresses.clear();
      globalRequests.length = 0;
      await Promise.allSettled([...pending, backend?.close()]);
    },
  };
}

/** AI is optional: invalid operator configuration must not stop the game server. */
export function createOptionalCrazyTypkaService(
  options: CrazyTypkaServiceOptions = {},
  onInvalidConfiguration: () => void = () => {},
) {
  try {
    return createCrazyTypkaService(options);
  } catch {
    // Do not expose parser errors or raw env values to a logger/browser.
    try {
      onInvalidConfiguration();
    } catch {
      /* diagnostics cannot stop the game */
    }
    return createCrazyTypkaService({ env: {} });
  }
}

/** Colyseus 0.18 applies CORS/OPTIONS before Express. Give only AI its own dispatcher. */
export function attachCrazyTypkaHttpRoute(
  http: HttpServer,
  service: Pick<ReturnType<typeof createCrazyTypkaService>, "handle">,
) {
  const listeners = http.listeners("request");
  if (listeners.length !== 1)
    throw new Error(
      "Expected one initialized HTTP dispatcher before mounting AI",
    );
  const forward = listeners[0] as RequestListener;
  http.removeListener("request", forward);
  http.on("request", (req, res) => {
    if (!isCrazyTypkaPath(req.url)) {
      forward.call(http, req, res);
      return;
    }
    const unavailable = () => {
      if (res.destroyed || res.writableEnded) return;
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.writeHead(503).end(JSON.stringify({ error: "unavailable" }));
      } else res.end();
    };
    void service.handle(req, res).then((handled) => {
      if (!handled) unavailable();
    }, unavailable);
  });
}
