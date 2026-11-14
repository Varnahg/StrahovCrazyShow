import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import { writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Client, type Room } from "@colyseus/sdk";
import { PROTOCOL_VERSION } from "../shared/netcode";
import { DEFAULT_PROFILE } from "../shared/types";
import { ScriptTimelineClient, type ScriptAuthority } from "./timeline-client";
import { AccountDatabase } from "../server/accounts/database";

const workspace = process.env.STRAHOV_AUTH_TEST_DIR;
assert.ok(workspace, "Set STRAHOV_AUTH_TEST_DIR to a reserved, owned test directory");
await mkdir(workspace, { recursive: true });
const directory = await mkdtemp(join(resolve(workspace), "oidc-"));
const origin = "http://127.0.0.1:4251";
const storage = join(directory, "accounts.sqlite");
const secretFile = join(directory, "client_secret");
const preload = join(directory, "provider.mjs");
const id = "isolated-fixture.apps.googleusercontent.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const secondKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "isolated", alg: "RS256", use: "sig" };
const fixtureSource = `
  import { createHash, sign } from "node:crypto";
  const original = globalThis.fetch;
  const issuer = "https://accounts.google.com";
  const jwk = ${JSON.stringify(jwk)};
  const privateKey = ${JSON.stringify(privateKey.export({ type: "pkcs8", format: "pem" }))};
  const badKey = ${JSON.stringify(secondKey.export({ type: "pkcs8", format: "pem" }))};
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.href === issuer + "/.well-known/openid-configuration") return Promise.resolve(Response.json({
      issuer, authorization_endpoint: issuer + "/authorize", token_endpoint: issuer + "/token",
      jwks_uri: issuer + "/jwks", id_token_signing_alg_values_supported: ["RS256"],
      response_types_supported: ["code"], subject_types_supported: ["public"],
      token_endpoint_auth_methods_supported: ["client_secret_post"], code_challenge_methods_supported: ["S256"],
    }));
    if (url.href === issuer + "/jwks") return Promise.resolve(Response.json({keys:[jwk]}));
    if (url.href === issuer + "/token") {
      const body = new URLSearchParams(init.body);
      const code = JSON.parse(Buffer.from(body.get("code"), "base64url").toString());
      if (body.get("client_secret") !== "synthetic-secret" ||
          body.get("redirect_uri") !== ${JSON.stringify(origin + "/api/auth/google/callback")} ||
          createHash("sha256").update(body.get("code_verifier")).digest("base64url") !== code.challenge)
        return Promise.resolve(Response.json({error:"invalid_grant"}, {status:400}));
      const now = Math.floor(Date.now() / 1000);
      const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
      const jwt = encode({alg:"RS256",kid:"isolated"}) + "." + encode({
        iss:issuer, aud:${JSON.stringify(id)}, sub:code.sub, iat:now, exp:now+1800,
        nonce:code.nonce, email:"private@example.invalid",
      });
      const signature = sign("RSA-SHA256", Buffer.from(jwt), code.wrong ? badKey : privateKey).toString("base64url");
      return Promise.resolve(Response.json({token_type:"Bearer", access_token:"ephemeral", id_token:jwt+"."+signature}));
    }
    return original(input, init);
  };
`;
await writeFile(secretFile, "synthetic-secret");
await writeFile(preload, fixtureSource);
let child: ChildProcess | undefined;
const rooms = new Set<Room>();
const api = (path: string, options: RequestInit = {}) =>
  fetch(origin + path, { ...options, redirect: "manual", signal: AbortSignal.timeout(10_000) });

async function start() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(STRAHOV_(AUTH|GOOGLE|ACCOUNTS)|LINEAR_|FEEDBACK_|OPENAI_|CRAZY_TYPKA_|CHAT_MONITOR_|RAG_|STATIC_DIR)/i.test(key)));
  child = spawn(process.execPath, ["--import", "tsx", "--import", pathToFileURL(preload).href, "server/index.ts"], {
    stdio: ["ignore", "pipe", "pipe"], env: { ...env, HOST: "127.0.0.1", PORT: "4251",
      STRAHOV_AUTH_MODE: "google", STRAHOV_AUTH_ORIGIN: origin, STRAHOV_GOOGLE_CLIENT_ID: id,
      STRAHOV_GOOGLE_SECRET_FILE: secretFile, STRAHOV_ACCOUNTS_DB: storage,
      FEEDBACK_DIR: join(directory, "feedback"),
      ...(process.env.STRAHOV_AUTH_TEST_STATIC_DIR ? { STATIC_DIR: process.env.STRAHOV_AUTH_TEST_STATIC_DIR } : {}),
    },
  });
  let output = "";
  child.stdout?.on("data", bytes => { output += bytes; });
  child.stderr?.on("data", bytes => { output += bytes; });
  for (let i = 0; i < 200 && child.exitCode === null; i++) {
    if (output.includes("Strahov multiplayer: " + origin)) {
      const status = await api("/api/auth/session");
      assert.deepEqual(await status.json(), { mode: "google", account: null });
      return;
    }
    await delay(100);
  }
  throw Error("Fixture server did not start\n" + output);
}

async function stop() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
}

function cookie(response: Response, name: string) {
  const value = response.headers.getSetCookie().find(item => item.startsWith(name + "="));
  assert.ok(value && value.includes("HttpOnly; SameSite=Lax"));
  return value.split(";")[0];
}

async function attempt(sub: string, wrong = false) {
  const begin = await api("/api/auth/google/start", { method: "POST", headers: { Origin: origin } });
  assert.equal(begin.status, 303);
  const auth = new URL(begin.headers.get("location")!);
  assert.equal(auth.origin, "https://accounts.google.com");
  const params = auth.searchParams;
  assert.equal(params.get("scope"), "openid email");
  assert.equal(params.get("code_challenge_method"), "S256");
  const code = Buffer.from(JSON.stringify({ sub, wrong, challenge: params.get("code_challenge"), nonce: params.get("nonce") })).toString("base64url");
  const state = params.get("state")!;
  return { pending: cookie(begin, "strahov-dev-login"), path: "/api/auth/google/callback?code=" + code + "&state=" + state };
}

async function login(sub: string) {
  const { pending, path } = await attempt(sub);
  const response = await api(path, { headers: { Cookie: pending } });
  assert.equal(response.headers.get("location"), "/?auth=success");
  const result = cookie(response, "strahov-dev");
  assert.equal((await api(path, { headers: { Cookie: pending } })).headers.get("location"), "/?auth=invalid");
  return result;
}

async function verifyBrowser() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: [
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  ] });
  try {
    const page = await browser.newPage({ locale: "cs-CZ" });
    page.on("response", response => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith("/api/auth/") || path === "/authorize")
        console.log("Edge", response.status(), path);
    });
    page.on("requestfailed", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/auth/") || path === "/authorize")
        console.log("Edge request failed", path, request.failure()?.errorText);
    });
    let sockets = 0;
    page.on("websocket", () => { sockets++; });
    await page.route(origin + "/api/auth/google/start", async route => {
      const response = await route.fetch({ maxRedirects: 0 });
      assert.equal(response.status(), 303);
      const provider = new URL(response.headers().location);
      assert.equal(provider.origin, "https://accounts.google.com");
      const params = provider.searchParams;
      const code = Buffer.from(JSON.stringify({
        sub: "browser", challenge: params.get("code_challenge"), nonce: params.get("nonce"),
      })).toString("base64url");
      const redirect = origin + "/api/auth/google/callback?code=" + code + "&state=" + params.get("state");
      await route.fulfill({ response, headers: { ...response.headers(), location: redirect } });
    });
    await page.goto(origin);
    const source = await page.locator('script[type="module"][src]').getAttribute("src");
    assert.match(source ?? "", /^\/assets\/index-[\w-]+\.js$/);
    console.log("Edge build", source);
    await page.getByRole("button", { name: "Přihlásit se přes Google" }).waitFor();
    await page.getByRole("button", { name: "Hrát sólo" }).click();
    await page.locator(".game-shell canvas").waitFor({ timeout: 60_000 });
    assert.equal(sockets, 0);
    await page.goto(origin);
    const callback = page.waitForResponse(response => response.url().startsWith(origin + "/api/auth/google/callback"));
    await page.getByRole("button", { name: "Přihlásit se přes Google" }).click();
    const returned = await callback;
    assert.equal(returned.headers().location, "/?auth=success");
    await page.getByRole("heading", { name: "Tvoje postava" }).waitFor();
    await page.getByRole("textbox", { name: "Jak ti budeme říkat?" }).fill("Browser account");
    const joined = page.waitForResponse(response => response.url().includes("/matchmake/joinById/") && response.ok());
    await page.getByRole("button", { name: "Vstoupit do hry" }).click();
    await joined;
    await page.locator('canvas[data-network-stage="connected"]').waitFor({ timeout: 90_000 });
    assert.deepEqual(await (await api("/api/presence")).json(), { online: 1 });
    assert.ok(sockets > 0);
    await page.goto(origin);
    await page.getByRole("button", { name: "Odhlásit se" }).click();
    await page.getByRole("button", { name: "Přihlásit se přes Google" }).waitFor();
    console.log("PASS Edge production build: public solo, Google redirect, profile, WebSocket, logout");
  } finally { await browser.close(); }
}

async function status(cookie: string) {
  const response = await api("/api/auth/session", { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(!JSON.stringify(body).includes("private@example.invalid"));
  return body.account;
}

async function setProfile(cookie: string, nickname: string) {
  const response = await api("/api/account/profile", {
    method: "PUT", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ id: (await status(cookie)).id, profile: { ...DEFAULT_PROFILE, nickname } }),
  });
  assert.equal(response.status, 200);
}

async function issue(cookie: string) {
  const response = await api("/api/session", { method: "POST", headers: { Cookie: cookie, Origin: origin } });
  assert.equal(response.status, 200);
  return await response.json() as { ticket: string; id: string; worldId: string };
}

function sdk(cookie: string) { return new Client(origin, { headers: { Cookie: cookie, Origin: origin } }); }

async function joinPlayer(cookie: string) {
  const { ticket, worldId } = await issue(cookie);
  const room = await sdk(cookie).joinById(worldId, { ticket, protocol: PROTOCOL_VERSION });
  rooms.add(room);
  room.onLeave(() => { rooms.delete(room); });
  room.onMessage("*", () => {});
  return { room, ticket, worldId };
}

async function reserve(cookie: string, ticket: string, worldId: string) {
  const response = await api("/matchmake/joinById/" + worldId, {
    method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ ticket, protocol: PROTOCOL_VERSION }),
  });
  assert.equal(response.status, 200);
  return await response.json();
}

function message<T>(room: Room, type: string, accept: (value: T) => boolean) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(Error("No " + type + " event")); }, 5000);
    const stop = room.onMessage(type, (value: T) => {
      if (!accept(value)) return;
      clearTimeout(timer);
      stop();
      resolve(value);
    });
  });
}

try {
  await start();
  assert.equal((await api("/api/session", { method: "POST", headers: { Origin: origin }, body: '{"mode":"multiplayer"}' })).status, 401);
  assert.equal((await api("/api/auth/google/start", { method: "POST", headers: { Origin: "https://foreign.invalid" } })).status, 403);
  assert.equal((await api("/api/presence")).status, 200);
  const invalid = await attempt("invalid", true);
  assert.equal((await api(invalid.path, { headers: { Cookie: invalid.pending } })).headers.get("location"), "/?auth=failed");
  const unrelated = await attempt("unrelated");
  assert.equal((await api(unrelated.path, { headers: { Cookie: invalid.pending } })).headers.get("location"), "/?auth=invalid");
  const alice = await login("alice");
  const bob = await login("bob");
  const aliceId = (await status(alice)).id;
  const bobId = (await status(bob)).id;
  assert.notEqual(aliceId, bobId);
  assert.equal((await status(alice)).profile, null);
  await setProfile(alice, "Alice");
  await setProfile(bob, "Bob");
  const wrong = await issue(alice);
  await assert.rejects(() => sdk(bob).joinById(wrong.worldId, { ticket: wrong.ticket, protocol: PROTOCOL_VERSION }));
  const reservation = await reserve(alice, wrong.ticket, wrong.worldId);
  const deniedSocket = await Promise.race([
    new Promise<number>(resolve => {
      const socket = new WebSocket(origin.replace("http", "ws") + "/" + reservation.processId + "/" +
        reservation.roomId + "?sessionId=" + reservation.sessionId);
      socket.onopen = () => { socket.close(); resolve(101); };
      socket.onerror = () => resolve(401);
    }),
    delay(5000, 0),
  ]);
  assert.equal(deniedSocket, 401);
  const a = await joinPlayer(alice);
  const b = await joinPlayer(bob);
  assert.equal(a.worldId, b.worldId);
  assert.deepEqual(await (await api("/api/presence")).json(), { online: 2 });
  await assert.rejects(() => sdk(alice).joinById(a.worldId, { ticket: a.ticket, protocol: PROTOCOL_VERSION }));
  const duplicate = await issue(alice);
  await assert.rejects(() => sdk(alice).joinById(a.worldId, { ticket: duplicate.ticket, protocol: PROTOCOL_VERSION }));
  const request = message<{requests:string[]}>(b.room, "social", value => value.requests.includes(aliceId));
  a.room.send("contact", { to: bobId });
  await request;
  const accepted = message<{contacts:string[]}>(a.room, "social", value => value.contacts.includes(bobId));
  b.room.send("contact", { to: aliceId, accept: true });
  await accepted;
  const dm = message<{text:string}>(b.room, "chat", value => value.text === "Soukromá zpráva");
  a.room.send("chat", { channel: "dm:" + bobId, text: "Soukromá zpráva" });
  await dm;
  const timeline = new ScriptTimelineClient({ send: inputs => a.room.send("inputs", inputs) });
  const authority = a.room.onMessage("authoritative", (value: ScriptAuthority) => timeline.acceptAuthority(value));
  for (let i = 0; i < 40 && !timeline.authority; i++) await delay(50);
  assert.ok(timeline.authority);
  const initial = timeline.authority.state.position;
  const idle = { x: 0, z: 0, yaw: 0, jump: false, vehicle: false };
  await timeline.holdFor({ ...idle, z: 1 }, 1100);
  await timeline.holdFor(idle, 1300);
  const walked = timeline.authority.state.position;
  assert.ok(Math.hypot(walked.x - initial.x, walked.z - initial.z) > 1);
  authority();
  timeline.dispose();
  await a.room.leave();
  await b.room.leave();
  rooms.clear();
  await stop();
  const stored = new AccountDatabase(storage);
  try {
    assert.deepEqual(await stored.run("reward", [aliceId], "Kvízový nadšenec"), [aliceId]);
  } finally { await stored.close(); }
  await start();
  const newAlice = await login("alice");
  assert.equal((await status(newAlice)).id, aliceId);
  assert.equal((await status(newAlice)).profile.nickname, "Alice");
  assert.deepEqual((await status(newAlice)).rewards, ["Kvízový nadšenec"]);
  const a2 = await joinPlayer(newAlice);
  const state = await message<ScriptAuthority>(a2.room, "authoritative", value => value.state.grounded);
  assert.ok(Math.hypot(state.state.position.x - walked.x, state.state.position.z - walked.z) < 0.5);
  const offline = message<{contacts:string[]; names?:Record<string,string>}>(a2.room, "social",
    value => value.contacts.includes(bobId) && value.names?.[bobId] === "Bob");
  const b2 = await joinPlayer(bob);
  await offline;
  const simultaneous = await login("simultaneous");
  await setProfile(simultaneous, "Concurrent");
  const [ticketA, ticketB] = await Promise.all([issue(simultaneous), issue(simultaneous)]);
  const competing = await Promise.allSettled([ticketA, ticketB].map(({ ticket, worldId }) =>
    sdk(simultaneous).joinById(worldId, { ticket, protocol: PROTOCOL_VERSION })));
  const winners = competing.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  try { assert.equal(winners.length, 1); }
  finally { await Promise.all(winners.map(room => room.leave())); }
  const blocked = message<{blocked:string[]}>(a2.room, "social", value => value.blocked.includes(bobId));
  a2.room.send("block", { to: bobId, enabled: true });
  await blocked;
  const left = new Promise<number>(resolve => a2.room.onLeave(resolve));
  const loggedOut = await api("/api/auth/logout", { method: "POST", headers: { Cookie: newAlice, Origin: origin } });
  assert.equal(loggedOut.status, 200);
  assert.equal(await Promise.race([left, delay(5000, 0)]), 4401);
  assert.equal(await status(newAlice), null);
  await b2.room.leave();
  rooms.clear();
  await stop();
  await start();
  const a3 = await joinPlayer(await login("alice"));
  const b3 = await joinPlayer(bob);
  const rejected = message<string>(b3.room, "notice", value => value.includes("Soukromý kontakt"));
  b3.room.send("chat", { channel: "dm:" + aliceId, text: "Blocked after restart" });
  await rejected;
  await a3.room.leave();
  await assert.rejects(() => sdk(alice).joinById(a3.worldId, { ticket: a3.ticket, protocol: PROTOCOL_VERSION }));
  await b3.room.leave();
  if (process.env.STRAHOV_AUTH_TEST_STATIC_DIR) await verifyBrowser();
  console.log("PASS Google OIDC signature and state, two accounts, private chat, persistent profile, position and contacts, blocks and logout");
} finally {
  await Promise.race([Promise.allSettled([...rooms].map(room => room.leave())), delay(3000)]);
  await stop();
  await rm(directory, { recursive: true, force: true });
}
