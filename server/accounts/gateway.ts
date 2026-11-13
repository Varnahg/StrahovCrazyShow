import { createHash, randomBytes } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AccountDatabase, type Login } from "./database";
import { googleIdentity, type GoogleIdentity, type LoginAttempt } from "./google";
import { sanitizeProfile } from "../../shared/profile";
import { consumeRate, pruneRateWindows } from "../session-lifecycle";
import { isIP } from "node:net";

const DAY = 86_400_000;
const LOGIN_TTL = 7 * DAY;
const ATTEMPT_TTL = 10 * 60_000;
const TICKET_TTL = 30_000;
const MAX_PENDING = 4096;
const CALLBACK = "/api/auth/google/callback";
const token = () => randomBytes(32).toString("base64url");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const validToken = (value: unknown): value is string => typeof value === "string" && /^[\w-]{43}$/.test(value);

type HeadersLike = Pick<Headers, "get" | "has">;
type Ticket = { login: Login; expires: number; reserved: boolean };
type PendingLogin = LoginAttempt & { expires: number };
export type AuthMode = "google" | "closed" | "local";

export function sessionCookieName(secure: boolean) { return secure ? "__Host-strahov" : "strahov-dev"; }

function readCookie(headers: HeadersLike, name: string) {
  const cookies = headers.get("cookie")?.split(";") ?? [];
  const prefix = name + "=";
  const matches = cookies.map(item => item.trim()).filter(item => item.startsWith(prefix));
  const value = matches.length === 1 ? matches[0].slice(prefix.length) : undefined;
  return validToken(value) ? value : undefined;
}

export function reply(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.removeHeader("Access-Control-Allow-Origin");
  res.removeHeader("Access-Control-Allow-Credentials");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

export function requestHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

export async function readJson(req: IncomingMessage) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw Error("invalid-content-type");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 12_000) { req.resume(); throw Error("body-too-large"); }
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createGateway(options: {
  origin: URL;
  database: AccountDatabase;
  google: GoogleIdentity;
  now?: () => number;
  trustCloudflare?: boolean;
  profileChanged?: (id: string, profile: ReturnType<typeof sanitizeProfile>) => void;
}) {
  const { origin, database, google, now = Date.now } = options;
  const secure = origin.protocol === "https:";
  const cookieName = sessionCookieName(secure);
  const attemptName = secure ? "__Host-strahov-login" : "strahov-dev-login";
  const attempts = new Map<string, PendingLogin>();
  const tickets = new Map<string, Ticket>();
  const revoked = new Map<string, number>();
  const loginRates = new Map<string, number[]>();
  let lastPrune = 0;
  const startWindow = 60_000;
  const listeners = new Set<(hash: string) => void>();
  const pruneMemory = () => {
    const time = now();
    if (time - lastPrune < 1000) return;
    lastPrune = time;
    for (const map of [attempts, tickets]) {
      for (const [key, entry] of map) if (entry.expires <= time) map.delete(key);
    }
    for (const [hash, expires] of revoked) if (expires <= time) revoked.delete(hash);
    pruneRateWindows(loginRates, startWindow, time);
  };
  const setCookie = (res: ServerResponse, name: string, value: string, duration: number) =>
    res.appendHeader("Set-Cookie",
      `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${duration / 1000}${secure ? "; Secure" : ""}`);
  const invalidate = (hash: string) => {
    revoked.set(hash, now() + TICKET_TTL);
    for (const listener of listeners) listener(hash);
  };
  const cookieHash = (headers: HeadersLike) => {
    const value = readCookie(headers, cookieName);
    return value ? digest(value) : undefined;
  };
  const sameOrigin = (headers: HeadersLike) => headers.get("origin") === origin.origin;
  const validMatchmakingOrigin = (headers: HeadersLike) =>
    sameOrigin(headers) || (
      !headers.has("origin") &&
      headers.get("sec-fetch-site") === "same-origin"
    );
  const session = async (headers: HeadersLike): Promise<Login | null> => {
    const hash = cookieHash(headers);
    if (!hash || revoked.has(hash)) return null;
    const found = await database.run("session", hash, now());
    return found && found.expires > now() && !revoked.has(hash) ? { ...found, hash } : null;
  };
  const usableTicket = (value: unknown, login: Login) => {
    if (!validToken(value) || revoked.has(login.hash)) return;
    const ticket = tickets.get(value);
    if (ticket && ticket.expires > now() && ticket.login.hash === login.hash) return ticket;
  };
  const expireCookie = (res: ServerResponse) => setCookie(res, cookieName, "", 0);
  const authRedirect = (res: ServerResponse, result: string) => {
    res.setHeader("Location", "/?auth=" + result);
    res.writeHead(303).end();
  };
  const handled = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    res.setHeader("Cache-Control", "no-store");
    const url = new URL(req.url ?? "/", origin);
    const path = url.pathname;
    const headers = requestHeaders(req);
    if (req.method !== "GET" && !sameOrigin(headers)) {
      reply(res, 403, { error: "origin-denied" });
      return true;
    }
    if (req.method === "POST" && path === "/api/auth/google/start") {
      req.resume();
      pruneMemory();
      const previous = readCookie(headers, attemptName);
      if (previous) attempts.delete(previous);
      const forwarded = options.trustCloudflare ? headers.get("cf-connecting-ip") : null;
      const address = forwarded && isIP(forwarded) ? forwarded : req.socket.remoteAddress ?? "unknown";
      if (attempts.size >= MAX_PENDING || !consumeRate(loginRates, address, 20, startWindow, now(), MAX_PENDING)) {
        res.setHeader("Retry-After", "60");
        authRedirect(res, "busy");
        return true;
      }
      const browser = token();
      const attempt = { state: token(), nonce: token(), verifier: token(), expires: now() + ATTEMPT_TTL };
      attempts.set(browser, attempt);
      try {
        const target = await google.start(attempt);
        setCookie(res, attemptName, browser, ATTEMPT_TTL);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.writeHead(303, { Location: target.href }).end();
      } catch {
        attempts.delete(browser);
        res.setHeader("Cache-Control", "no-store");
        authRedirect(res, "unavailable");
      }
      return true;
    }
    if (req.method === "GET" && path === CALLBACK) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      const browser = readCookie(headers, attemptName);
      const attempt = browser && attempts.get(browser);
      if (browser) attempts.delete(browser);
      setCookie(res, attemptName, "", 0);
      if (!attempt || attempt.expires <= now() || url.searchParams.get("state") !== attempt.state) {
        authRedirect(res, "invalid");
        return true;
      }
      if (url.searchParams.get("error") === "access_denied") {
        authRedirect(res, "denied");
        return true;
      }
      let sub: string;
      try {
        sub = await google.finish(new URL(CALLBACK + url.search, origin), attempt);
      } catch {
        authRedirect(res, "failed");
        return true;
      }
      const value = token();
      const previousHash = cookieHash(headers);
      await database.run("login", sub, digest(value), now() + LOGIN_TTL, previousHash);
      if (previousHash) invalidate(previousHash);
      setCookie(res, cookieName, value, LOGIN_TTL);
      authRedirect(res, "success");
      return true;
    }
    if (req.method === "GET" && path === "/api/auth/session") {
      const login = await session(headers);
      const account = login ? await database.run("account", login.id) : undefined;
      reply(res, 200, { mode: "google", account: account ? {
        id: account.id, profile: account.profile, rewards: account.rewards,
      } : null });
      return true;
    }
    if (req.method === "POST" && path === "/api/auth/logout") {
      req.resume();
      const login = await session(headers);
      if (login) {
        invalidate(login.hash);
        try { await database.run("revoke", login.hash); }
        catch (error) {
          revoked.set(login.hash, login.expires);
          throw error;
        }
      }
      expireCookie(res);
      reply(res, 200, { ok: true });
      return true;
    }
    if (req.method === "PUT" && path === "/api/account/profile") {
      const login = await session(headers);
      if (!login) reply(res, 401, { error: "login-required" });
      else {
        let profile;
        try {
          const body = await readJson(req);
          if (body?.id !== login.id) { reply(res, 409, { error: "account-changed" }); return true; }
          if (typeof body.profile?.nickname !== "string" || !body.profile.nickname.trim())
            throw Error("invalid-profile");
          profile = sanitizeProfile(body.profile);
        }
        catch { reply(res, 400, { error: "invalid-profile" }); return true; }
        const account = await database.run("account", login.id);
        if (!account?.rewards.includes(profile.avatar.badge ?? "")) profile.avatar.badge = "";
        if (!(await session(headers))) { reply(res, 401, { error: "login-required" }); return true; }
        await database.run("profile", login.id, profile);
        options.profileChanged?.(login.id, profile);
        reply(res, 200, { profile });
      }
      return true;
    }
    return false;
  };

  return {
    database,
    sameOrigin,
    validMatchmakingOrigin,
    session,
    onRevoke(listener: (hash: string) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async handle(req: IncomingMessage, res: ServerResponse) {
      res.removeHeader("Access-Control-Allow-Origin");
      res.removeHeader("Access-Control-Allow-Credentials");
      return handled(req, res);
    },
    async issue(req: IncomingMessage, res: ServerResponse, worldId: string) {
      req.resume();
      const headers = requestHeaders(req);
      if (!sameOrigin(headers)) return reply(res, 403, { error: "origin-denied" });
      const login = await session(headers);
      if (!login) {
        if (cookieHash(headers)) expireCookie(res);
        return reply(res, 401, { error: "login-required" });
      }
      const expected = headers.get("x-strahov-account");
      if (expected && expected !== login.id) return reply(res, 409, { error: "account-changed" });
      if (!worldId) return reply(res, 503, { error: "world-unavailable" });
      const account = await database.run("account", login.id);
      if (!account?.profile) return reply(res, 409, { error: "profile-required" });
      const value = token();
      pruneMemory();
      if (tickets.size >= MAX_PENDING) return reply(res, 429, { error: "auth-busy" });
      tickets.set(value, { login, expires: now() + TICKET_TTL, reserved: false });
      reply(res, 200, { ticket: value, id: login.id, worldId });
    },
    reserve(value: unknown, login: Login) {
      const ticket = usableTicket(value, login);
      if (!ticket || ticket.reserved) return false;
      ticket.reserved = true;
      return true;
    },
    live(login: Login) { return login.expires > now() && !revoked.has(login.hash); },
    consume(value: unknown, login: Login) {
      const ticket = usableTicket(value, login);
      if (!ticket?.reserved) return false;
      tickets.delete(value as string);
      return true;
    },
    async prune() {
      pruneMemory();
      await database.run("prune", now());
    },
  };
}
export type AccountGateway = ReturnType<typeof createGateway>;

export async function configureGateway(
  host: string,
  profileChanged?: Parameters<typeof createGateway>[0]["profileChanged"],
  env = process.env,
): Promise<{
  mode: AuthMode;
  gateway?: AccountGateway;
}> {
  const mode = env.STRAHOV_AUTH_MODE ?? (env.NODE_ENV !== "production" && isLoopback(host) ? "local" : "closed");
  if (mode === "local" && (
    isLoopback(host) || (env.STRAHOV_LOCAL_TEST_ONLY === "1" && !env.STRAHOV_AUTH_CONFIG_DIR)
  )) return { mode };
  if (mode !== "google") return { mode: "closed" };
  let database: AccountDatabase | undefined;
  try {
    const origin = new URL(env.STRAHOV_AUTH_ORIGIN ?? "");
    if (origin.href !== origin.origin + "/" || origin.username || origin.password ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && isLoopback(origin.hostname))))
      throw Error("invalid-auth-origin");
    const authDir = env.STRAHOV_AUTH_CONFIG_DIR;
    const clientId = env.STRAHOV_GOOGLE_CLIENT_ID || (authDir && await privateText(join(authDir, "client_id")));
    const secretFile = env.STRAHOV_GOOGLE_SECRET_FILE || (authDir && join(authDir, "client_secret"));
    const file = env.STRAHOV_ACCOUNTS_DB;
    if (!clientId?.endsWith(".apps.googleusercontent.com") || !secretFile || !isAbsolute(secretFile) || !file || !isAbsolute(file))
      throw Error("incomplete-auth-configuration");
    const secret = await privateText(secretFile);
    database = new AccountDatabase(file);
    await database.ready;
    return { mode, gateway: createGateway({
      origin, database, profileChanged, trustCloudflare: env.STRAHOV_AUTH_TRUST_CLOUDFLARE === "1",
      google: googleIdentity(clientId, secret, new URL(CALLBACK, origin)),
    }) };
  } catch {
    await database?.close();
    console.error("[account] Google sign-in unavailable");
    return { mode: "closed" };
  }
}

export function isAccountPath(path: string | undefined) {
  return Boolean(path?.startsWith("/api/auth/") || path?.startsWith("/api/account/"));
}

async function privateText(file: string) {
  const info = await lstat(file);
  if (!info.isFile() || info.size > 4096) throw Error("invalid-auth-config");
  const value = (await readFile(file, "utf8")).trim();
  if (!value || /[\s\0]/.test(value)) throw Error("invalid-auth-config");
  return value;
}

function isLoopback(host: string) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
}
