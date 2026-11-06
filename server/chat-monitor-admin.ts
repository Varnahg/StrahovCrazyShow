import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type { CrazyTypkaSource } from "../shared/crazy-typka";
import type {
  ChatMonitorExchange,
  ChatMonitorStore,
} from "./chat-monitor-store";

const LOGIN_COOKIE = "__Secure-strahov-admin-oauth";
const SESSION_COOKIE = "__Secure-strahov-admin-session";
const LOGIN_TTL = 5 * 60 * 1000;
const SESSION_TTL = 15 * 60 * 1000;
const MAX_USED_LOGINS = 256;
const MAX_RECENT_ATTEMPTS = 512;
const MAX_ACTIVE_CALLBACKS = 4;
const MAX_SESSIONS = 32;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const SEALED_LOGIN = /^[A-Za-z0-9_-]{100,256}$/;
const LOGIN_IV_BYTES = 12;
const LOGIN_TAG_BYTES = 16;
const CONVERSATION_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

const STYLE = `
  :root { color-scheme: light dark; font: 1rem/1.55 system-ui, sans-serif; }
  body { margin: 2rem auto; padding: 0 1rem; max-width: 55rem; }
  header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; }
  h1, h2, h3 { line-height: 1.2; }
  a { overflow-wrap: anywhere; }
  article { border: 1px solid GrayText; border-radius: .5rem; margin: 1rem 0; padding: 1rem; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .citations { font-size: .9rem; overflow-wrap: anywhere; }
  button { font: inherit; }
`;
const CSP = [
  "default-src 'none'",
  `style-src 'sha256-${createHash("sha256").update(STYLE).digest("base64")}'`,
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const DATE_FORMAT = new Intl.DateTimeFormat("cs-CZ", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Europe/Prague",
});

type AdminOptions = {
  origin: string;
  clientId: string;
  clientSecret: string;
  allowedGithubIds: readonly number[];
  reader: Pick<
    ChatMonitorStore,
    "listConversations" | "openConversation" | "getDroppedCount"
  >;
  now?: () => number;
  fetch?: typeof fetch;
};
type PendingLogin = { state: string; verifier: string; expiresAt: number };
type AdminSession = { githubId: number; expiresAt: number };

export function isChatMonitorAdminPath(target: string | undefined): boolean {
  const path = target?.split("?", 1)[0];
  return path === "/admin" || path?.startsWith("/admin/") === true;
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setAdminHeaders(res: Response) {
  for (const header of res.getHeaderNames()) {
    if (header.startsWith("access-control-")) res.removeHeader(header);
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.vary("Sec-Fetch-Mode");
  res.vary("Sec-Fetch-Dest");
}

function page(
  res: Response,
  status: number,
  title: string,
  content: string,
  signedIn = false,
) {
  const logout = signedIn
    ? '<form method="post" action="/admin/logout"><button>Odhlásit</button></form>'
    : "";
  res.status(status).type("html").end(`<!doctype html><html lang="cs"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} | Crazy Typka</title><style>${STYLE}</style></head>
    <body><header><h1>${escapeHtml(title)}</h1>${logout}</header><main>${content}</main></body></html>`);
}

function redirect(res: Response, location: string) {
  res.setHeader("Location", location);
  res.status(303).end();
}

function setCookie(res: Response, name: string, value: string, ttl: number) {
  res.append(
    "Set-Cookie",
    `${name}=${value}; Path=/admin; Max-Age=${ttl / 1000}; Secure; HttpOnly; SameSite=Lax`,
  );
}

function readCookie(
  req: Request,
  name: string,
  format: RegExp,
): string | undefined {
  const cookies =
    req.headers.cookie?.split(";").map((part) => part.trim()) ?? [];
  const matching = cookies.filter((part) => part.startsWith(`${name}=`));
  if (matching.length !== 1) return undefined;
  const value = matching[0].slice(name.length + 1);
  return format.test(value) ? value : undefined;
}

function sealLogin(login: PendingLogin, key: Buffer, context: Buffer): string {
  const iv = randomBytes(LOGIN_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: LOGIN_TAG_BYTES,
  });
  cipher.setAAD(context);
  const payload = cipher.update(JSON.stringify(login), "utf8");
  return Buffer.concat([
    iv,
    payload,
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
}

function openLogin(
  value: string,
  key: Buffer,
  context: Buffer,
): PendingLogin | undefined {
  try {
    const sealed = Buffer.from(value, "base64url");
    const iv = sealed.subarray(0, LOGIN_IV_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: LOGIN_TAG_BYTES,
    });
    decipher.setAAD(context);
    decipher.setAuthTag(sealed.subarray(-LOGIN_TAG_BYTES));
    const payload = decipher.update(
      sealed.subarray(LOGIN_IV_BYTES, -LOGIN_TAG_BYTES),
    );
    const login: Partial<PendingLogin> | null = JSON.parse(
      Buffer.concat([payload, decipher.final()]).toString("utf8"),
    );
    if (
      typeof login?.state === "string" &&
      NONCE.test(login.state) &&
      typeof login.verifier === "string" &&
      NONCE.test(login.verifier) &&
      typeof login.expiresAt === "number" &&
      Number.isSafeInteger(login.expiresAt)
    ) {
      return {
        state: login.state,
        verifier: login.verifier,
        expiresAt: login.expiresAt,
      };
    }
  } catch {
    // A malformed or unauthentic cookie never reaches the provider.
  }
  return undefined;
}

function evictExpired<T extends { expiresAt: number }>(
  entries: Map<string, T>,
  now: number,
) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
}

function oneParameter(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function loginPage(res: Response) {
  page(
    res,
    401,
    "Přehled konverzací Crazy Typky",
    '<p><a href="/admin/login">Přihlásit přes GitHub</a></p>',
  );
}

function rejectLogin(res: Response) {
  page(
    res,
    403,
    "Přihlášení zamítnuto",
    '<p><a href="/admin/login">Zahájit nové přihlášení</a></p>',
  );
}

function busyLogin(res: Response) {
  page(
    res,
    503,
    "Přihlášení je obsazené",
    "<p>Zkus přihlášení znovu později.</p>",
  );
}

function invalidCursor(res: Response) {
  page(
    res,
    400,
    "Neplatný odkaz na další stránku",
    '<p><a href="/admin">Zpět na začátek</a></p>',
    true,
  );
}

function droppedExchanges(count: number): string {
  return `<p>Nezapsané výměny v tomto běhu serveru: ${escapeHtml(count)}</p>`;
}

function cite(source: CrazyTypkaSource): string {
  if (source.adaptation === "knowledge-curation") {
    const refs = source.supportingRefs.map(
      (ref) =>
        `<li>${escapeHtml(ref.title)} · ${escapeHtml(ref.locator)} · ${escapeHtml(ref.url)}</li>`,
    );
    return `${escapeHtml(source.title)}${refs.length ? `<ul>${refs.join("")}</ul>` : ""}`;
  }
  const locators =
    source.adaptation === "document-extraction"
      ? source.locators
          .map(
            (locator) =>
              `${locator.page === undefined ? "" : `s. ${locator.page} · `}${locator.text}`,
          )
          .join(" · ")
      : "";
  return `${escapeHtml(source.title)} · ${escapeHtml(source.url)}${locators ? ` · ${escapeHtml(locators)}` : ""}`;
}

function citations(sources: readonly CrazyTypkaSource[]): string {
  return sources.length
    ? `<ul class="citations">${sources.map((source) => `<li>${cite(source)}</li>`).join("")}</ul>`
    : "";
}

function displayExchange(exchange: ChatMonitorExchange): string {
  const { answer } = exchange;
  const answerText = answer.blocks?.length
    ? answer.blocks
        .map(
          (block) =>
            `<p class="text">${escapeHtml(block.text)}</p>${citations(
              answer.sources.filter((source) =>
                block.sourceIds.includes(source.id),
              ),
            )}`,
        )
        .join("")
    : `<p class="text">${escapeHtml(answer.text)}</p>${citations(answer.sources)}`;
  return `<article><h2>Výměna ${escapeHtml(exchange.requestSeq)}</h2>
    <time datetime="${exchange.completedAt.toISOString()}">${escapeHtml(DATE_FORMAT.format(exchange.completedAt))}</time>
    <h3>Dotaz</h3><p class="text">${escapeHtml(exchange.question)}</p>
    <h3>Odpověď Crazy Typky</h3>${answerText}</article>`;
}

export function createChatMonitorAdmin(options: AdminOptions): RequestHandler {
  const origin = new URL(options.origin);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.href !== `${origin.origin}/` ||
    !options.clientId ||
    !options.clientSecret ||
    !options.allowedGithubIds.length ||
    !options.allowedGithubIds.every(positiveId)
  ) {
    throw new Error("Invalid chat monitor admin configuration");
  }

  const callback = `${origin.origin}/admin/oauth/callback`;
  const allowed = new Set(options.allowedGithubIds);
  const now = options.now ?? Date.now;
  const request = options.fetch ?? fetch;
  const loginKey = randomBytes(32);
  const loginContext = Buffer.from(`strahov-admin-oauth:${callback}`);
  const usedLogins = new Map<string, { expiresAt: number }>();
  const recentAttempts = new Map<string, { expiresAt: number }>();
  const activeCallbacks = new Set<string>();
  const sessions = new Map<string, AdminSession>();

  async function githubIdentity(
    code: string,
    verifier: string,
  ): Promise<number | undefined> {
    const tokenResponse = await request(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          code,
          code_verifier: verifier,
          redirect_uri: callback,
        }),
      },
    );
    if (!tokenResponse.ok) throw new Error("GitHub token exchange failed");
    const token: { access_token?: unknown } | null = await tokenResponse.json();
    if (
      typeof token?.access_token !== "string" ||
      !/^[\x21-\x7e]{1,512}$/.test(token.access_token)
    )
      return undefined;
    const userResponse = await request("https://api.github.com/user", {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.access_token}`,
        "User-Agent": "StrahovCrazyShow-admin",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    });
    if (!userResponse.ok) throw new Error("GitHub identity lookup failed");
    const user: { id?: unknown } | null = await userResponse.json();
    return positiveId(user?.id) ? user.id : undefined;
  }

  async function handle(req: Request, res: Response) {
    if (
      req.headers.host?.toLowerCase() !== origin.host ||
      req.headers["sec-fetch-mode"] !== "navigate" ||
      req.headers["sec-fetch-dest"] !== "document"
    ) {
      page(
        res,
        403,
        "Přístup zamítnut",
        "<p>Přehled je dostupný přímo v hlavním okně prohlížeče.</p>",
      );
      return;
    }

    const url = new URL(req.originalUrl, origin);
    const path = url.pathname;
    if (url.origin !== origin.origin || !isChatMonitorAdminPath(path)) {
      page(res, 404, "Stránka není dostupná", "");
      return;
    }
    const instant = now();
    evictExpired(usedLogins, instant);
    evictExpired(sessions, instant);
    const sessionKey = readCookie(req, SESSION_COOKIE, NONCE);
    const session = sessionKey ? sessions.get(sessionKey) : undefined;

    if (path === "/admin/logout" && req.method === "POST") {
      if (req.headers.origin !== origin.origin) {
        page(
          res,
          403,
          "Přístup zamítnut",
          "<p>Odhlášení otevři ze správcovského přehledu.</p>",
        );
        return;
      }
      if (sessionKey) sessions.delete(sessionKey);
      setCookie(res, SESSION_COOKIE, "", 0);
      setCookie(res, LOGIN_COOKIE, "", 0);
      redirect(res, "/admin");
      return;
    }
    if (req.method !== "GET") {
      res.setHeader("Allow", path === "/admin/logout" ? "POST" : "GET");
      page(res, 405, "Metoda není dostupná", "");
      return;
    }
    if (path === "/admin/login") {
      const state = randomBytes(32).toString("base64url");
      const verifier = randomBytes(32).toString("base64url");
      const sealed = sealLogin(
        { state, verifier, expiresAt: instant + LOGIN_TTL },
        loginKey,
        loginContext,
      );
      setCookie(res, LOGIN_COOKIE, sealed, LOGIN_TTL);
      const authorize = new URL("https://github.com/login/oauth/authorize");
      authorize.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: callback,
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
        allow_signup: "false",
      }).toString();
      redirect(res, authorize.href);
      return;
    }
    if (path === "/admin/oauth/callback") {
      const sealed = readCookie(req, LOGIN_COOKIE, SEALED_LOGIN);
      const login = sealed
        ? openLogin(sealed, loginKey, loginContext)
        : undefined;
      const state = oneParameter(url, "state");
      const code = oneParameter(url, "code");
      evictExpired(recentAttempts, instant);
      if (
        !login ||
        login.expiresAt <= instant ||
        usedLogins.has(login.state) ||
        recentAttempts.has(login.state) ||
        activeCallbacks.has(login.state) ||
        !state ||
        !NONCE.test(state) ||
        !code ||
        code.length > 512 ||
        !timingSafeEqual(Buffer.from(login.state), Buffer.from(state))
      ) {
        setCookie(res, LOGIN_COOKIE, "", 0);
        rejectLogin(res);
        return;
      }

      if (activeCallbacks.size >= MAX_ACTIVE_CALLBACKS) {
        // Nothing was sent to GitHub. The browser may retry with the same cookie and code.
        res.setHeader("Retry-After", "2");
        busyLogin(res);
        return;
      }
      if (recentAttempts.size >= MAX_RECENT_ATTEMPTS) {
        const oldest = recentAttempts.keys().next().value;
        if (oldest !== undefined) recentAttempts.delete(oldest);
      }
      recentAttempts.set(login.state, { expiresAt: login.expiresAt });
      activeCallbacks.add(login.state);
      let githubId: number | undefined;
      try {
        setCookie(res, LOGIN_COOKIE, "", 0);
        githubId = await githubIdentity(code, login.verifier);
      } finally {
        activeCallbacks.delete(login.state);
      }
      if (githubId === undefined) {
        rejectLogin(res);
        return;
      }
      if (!allowed.has(githubId)) {
        page(
          res,
          403,
          "Přístup zamítnut",
          "<p>Tento účet nemá přístup k přehledu.</p>",
        );
        return;
      }

      const signedInAt = now();
      if (login.expiresAt <= signedInAt || usedLogins.has(login.state)) {
        rejectLogin(res);
        return;
      }
      evictExpired(usedLogins, signedInAt);
      evictExpired(sessions, signedInAt);
      const replacingSession = sessionKey && sessions.has(sessionKey);
      if (
        usedLogins.size >= MAX_USED_LOGINS ||
        (!replacingSession && sessions.size >= MAX_SESSIONS)
      ) {
        busyLogin(res);
        return;
      }
      if (sessionKey) sessions.delete(sessionKey);
      const key = randomBytes(32).toString("base64url");
      usedLogins.set(login.state, { expiresAt: login.expiresAt });
      sessions.set(key, { githubId, expiresAt: signedInAt + SESSION_TTL });
      setCookie(res, SESSION_COOKIE, key, SESSION_TTL);
      redirect(res, "/admin");
      return;
    }

    if (!sessionKey || !session) {
      loginPage(res);
      return;
    }
    const sessionIsCurrent = () =>
      sessions.get(sessionKey) === session && session.expiresAt > now();
    if (path === "/admin" || path === "/admin/") {
      const before = oneParameter(url, "before");
      if (
        url.searchParams.has("before") &&
        (!before || !/^[A-Za-z0-9_-]{1,100}$/.test(before))
      ) {
        invalidCursor(res);
        return;
      }
      let result: Awaited<
        ReturnType<AdminOptions["reader"]["listConversations"]>
      >;
      try {
        result = await options.reader.listConversations({ before });
      } catch (error) {
        if (!sessionIsCurrent()) {
          loginPage(res);
          return;
        }
        if (
          error instanceof Error &&
          error.message === "chat-monitor-invalid-cursor"
        ) {
          invalidCursor(res);
          return;
        }
        page(
          res,
          503,
          "Přehled je nedostupný",
          `${droppedExchanges(options.reader.getDroppedCount())}<p>Konverzace se nepodařilo načíst. <a href="/admin">Zkusit znovu</a></p>`,
          true,
        );
        return;
      }
      if (!sessionIsCurrent()) {
        loginPage(res);
        return;
      }
      const { conversations, nextCursor } = result;
      const list = conversations
        .map(
          (
            item,
          ) => `<li><a href="/admin/conversations/${encodeURIComponent(item.id)}">
        ${escapeHtml(DATE_FORMAT.format(item.firstSeenAt))} · ${escapeHtml(item.id)}</a>
        (${escapeHtml(item.exchangeCount)} výměn)</li>`,
        )
        .join("");
      const next = nextCursor
        ? `<p><a href="/admin?before=${encodeURIComponent(nextCursor)}">Starší konverzace</a></p>`
        : "";
      page(
        res,
        200,
        "Přehled konverzací Crazy Typky",
        `${droppedExchanges(options.reader.getDroppedCount())}
        ${list ? `<ul>${list}</ul>` : "<p>Žádné konverzace k zobrazení.</p>"}${next}`,
        true,
      );
      return;
    }

    const detailPrefix = "/admin/conversations/";
    const id = path.startsWith(detailPrefix)
      ? path.slice(detailPrefix.length)
      : "";
    const exchanges = CONVERSATION_ID.test(id)
      ? await options.reader.openConversation(id, session.githubId)
      : undefined;
    if (!sessionIsCurrent()) {
      loginPage(res);
      return;
    }
    const back = '<p><a href="/admin">Přehled konverzací</a></p>';
    if (!exchanges) {
      page(res, 404, "Konverzace není dostupná", back, true);
      return;
    }
    page(
      res,
      200,
      `Konverzace ${id}`,
      back + exchanges.map(displayExchange).join(""),
      true,
    );
  }

  return (req, res, next) => {
    if (!isChatMonitorAdminPath(req.path)) return next();
    setAdminHeaders(res);
    void handle(req, res).catch(() => {
      if (res.destroyed || res.writableEnded) return;
      page(
        res,
        503,
        "Přehled je nedostupný",
        '<p><a href="/admin">Zkusit znovu</a></p>',
      );
    });
  };
}
