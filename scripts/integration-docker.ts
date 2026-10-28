import assert from "node:assert/strict";
import { Client, ErrorCode, type Room } from "@colyseus/sdk";
import type { Page } from "playwright";
import { DEFAULT_PROFILE } from "../shared/types";
import { PROTOCOL_VERSION } from "../shared/netcode";
import { CRAZY_TYPKA_SPEAKER } from "../shared/crazy-typka";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => (resolve = accept));
  return { promise, resolve };
}

async function bounded<T>(operation: Promise<T>, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function installBrowserAiFixture(page: Page) {
  const received = deferred<Record<string, unknown>>();
  const release = deferred<void>();
  const counts = { sessions: 0, chats: 0, deletions: 0 };
  const unexpected: string[] = [];
  const answer = "Testovací odpověď bez volání služby OpenAI.";
  const source = {
    id: "docker-browser-fixture",
    title: "Testovací podklad Silicon Hill",
    url: "https://wiki.sh.cvut.cz/",
    checkedAt: "2026-10-28",
    author: "Browser fixture",
    license: null,
    licenseUrl: null,
    adaptation: "curated-paraphrase",
  };
  let pendingResponse: Promise<void> | undefined;
  // Intercept every AI route before navigation; this fixture never contacts a provider.
  await page.route("**/api/ai/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/ai/status" && method === "GET")
      return route.fulfill({ json: { enabled: true } });
    if (path === "/api/ai/session" && method === "POST") {
      counts.sessions++;
      return route.fulfill({
        json: { token: "d".repeat(64), expiresAt: Date.now() + 600_000 },
      });
    }
    if (path === "/api/ai/session" && method === "DELETE") {
      counts.deletions++;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/ai/chat" && method === "POST") {
      counts.chats++;
      const operation = request.postDataJSON() as Record<string, unknown>;
      pendingResponse = release.promise.then(() =>
        route.fulfill({
          json: {
            requestSeq: operation.requestSeq,
            speaker: CRAZY_TYPKA_SPEAKER,
            text: answer,
            sources: [source],
          },
        }),
      );
      received.resolve(operation);
      return pendingResponse;
    }
    unexpected.push(method + " " + path);
    return route.fulfill({ status: 404, json: { error: "not-found" } });
  });
  return {
    answer,
    source,
    counts,
    unexpected,
    received: () => bounded(received.promise, "AI fixture neobdržela zprávu."),
    complete: async () => {
      release.resolve();
      if (pendingResponse)
        await bounded(pendingResponse, "AI fixture nedokončila odpověď.");
    },
  };
}

async function verifyWelcomeChat(
  page: Page,
  fixture: Awaited<ReturnType<typeof installBrowserAiFixture>>,
) {
  const launcher = page.getByRole("button", {
    name: "Chat s Crazy Typkou",
    exact: true,
  });
  const popup = page.getByRole("region", {
    name: "Soukromý AI chat",
    exact: true,
  });
  const composer = popup.getByRole("textbox", { name: "Zpráva", exact: true });
  const open = async () => {
    await launcher.click();
    await composer.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const field = document.querySelector<HTMLTextAreaElement>(
        ".home-chat-popup textarea",
      );
      return field && !field.disabled;
    });
    // CSS hides the open launcher from role lookup; its DOM state is still present.
    assert.equal(
      await page.locator(".home-chat-launcher").getAttribute("aria-expanded"),
      "true",
    );
  };
  const closed = async () => {
    await popup.waitFor({ state: "hidden" });
    await page.waitForFunction(() => {
      const button = document.querySelector(".home-chat-launcher");
      return (
        button === document.activeElement &&
        button?.getAttribute("aria-expanded") === "false"
      );
    });
  };
  await popup.waitFor({ state: "hidden" });
  await open(); // A launcher with a no-op onClick must fail here.
  await popup.getByText("O AI a soukromí", { exact: true }).click();
  await popup.locator(".crazy-definition").waitFor({ state: "visible" });
  const disclosure = popup.locator(".crazy-disclosure");
  await disclosure.waitFor({ state: "visible" });
  assert.match(await disclosure.innerText(), /OpenAI.*Ostatní hráči ji nevidí/);

  const question = "Testovací dotaz z Docker browser fixture.";
  await composer.fill(question);
  await popup.getByRole("button", { name: "Zavřít chat", exact: true }).click();
  await closed();
  await open();
  assert.equal(await composer.inputValue(), question, "Close zachová draft.");
  await composer.press("Escape");
  await closed();
  await open();
  assert.equal(await composer.inputValue(), question, "Escape zachová draft.");

  await popup
    .getByRole("button", { name: "Odeslat zprávu", exact: true })
    .click();
  const operation = await fixture.received();
  assert.equal(operation.message, question);
  assert.equal(operation.requestSeq, 1);
  assert.equal(operation.locale, "cs");
  await popup.locator(".crazy-working").waitFor({ state: "visible" });
  const draft = "Další rozepsaný dotaz během odpovědi.";
  await composer.fill(draft);
  await popup.getByRole("button", { name: "Zavřít chat", exact: true }).click();
  await closed();
  await fixture.complete(); // The App-owned request completes while the popup is absent.
  await open();
  await popup
    .getByText(fixture.answer, { exact: true })
    .waitFor({ state: "visible" });
  assert.equal(await composer.inputValue(), draft);
  assert.equal(await popup.locator(".crazy-message.user").count(), 1);
  assert.equal(await popup.locator(".crazy-message.ai").count(), 1);
  await popup.getByText("Použité podklady (1)", { exact: true }).click();
  const citation = popup.getByRole("link", {
    name: fixture.source.title + " ↗",
    exact: true,
  });
  await citation.waitFor({ state: "visible" });
  assert.equal(await citation.getAttribute("href"), fixture.source.url);
  assert.equal(
    await popup.locator(".crazy-sources time").getAttribute("datetime"),
    fixture.source.checkedAt,
  );
  assert.deepEqual(fixture.counts, { sessions: 1, chats: 1, deletions: 0 });
  assert.deepEqual(fixture.unexpected, []);
  await composer.press("Escape");
  await closed();
  console.log(
    "PASS Docker welcome AI popup/close/Escape/focus/draft/pending/sources (fake AI only)",
  );
}

const endpoint = process.env.STRAHOV_TEST_URL;
assert.ok(endpoint, "STRAHOV_TEST_URL musí určit ověřovaný kontejner.");
const url = endpoint.replace(/\/$/, "");
const lifecycle = process.argv.includes("--lifecycle");
const rooms: Room[] = [];
const closedRooms = new Set<Room>();
const request = (path: string, init: RequestInit = {}) =>
  fetch(url + path, { ...init, signal: AbortSignal.timeout(10_000) });
async function issue(nickname: string, resumeToken?: string) {
  const response = await request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "multiplayer",
      profile: { ...DEFAULT_PROFILE, nickname },
      resumeToken,
    }),
  });
  assert.equal(response.status, 200);
  return response.json() as Promise<{
    token: string;
    id: string;
    worldId: string;
  }>;
}
try {
  const health = await request("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, demo: true });
  const html = await request("/");
  assert.equal(html.status, 200);
  assert.match(html.headers.get("content-type") ?? "", /text\/html/);
  const document = await html.text();
  const bundle = document.match(/<script[^>]+src="([^"]+)"/)?.[1];
  assert.ok(bundle, "HTML obsahuje cestu k produkčnímu bundlu.");
  assert.ok(
    bundle.startsWith("/assets/"),
    "HTML odkazuje na produkční bundle.",
  );
  const js = await request(bundle);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type") ?? "", /javascript/);
  const etag = js.headers.get("etag");
  assert.ok(etag);
  await js.arrayBuffer();
  assert.equal(
    (
      await request(bundle, {
        cache: "no-cache",
        headers: { "If-None-Match": etag },
      })
    ).status,
    304,
  );
  const model = await request("/models/vegetation/runtime/far.glb", {
    headers: { Range: "bytes=0-3" },
  });
  assert.equal(model.status, 206);
  assert.equal(Buffer.from(await model.arrayBuffer()).toString(), "glTF");
  for (const path of [
    "/assets/missing-docker-test.js",
    "/models/missing-docker-test.glb",
    "/server/index.ts",
    "/package.json",
  ])
    assert.equal((await request(path)).status, 404, path);
  assert.equal((await request("/.env")).status, 403);
  for (const path of ["/api/players", "/api/chat", "/api/community-events"])
    assert.equal((await request(path)).status, 403, path);
  for (const path of [
    "/api/diagnostics/session/status",
    "/api/diagnostics/status",
  ])
    assert.equal((await request(path)).status, 404, path);
  assert.equal(
    (
      await request("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "guest" }),
      })
    ).status,
    403,
  );
  for (const method of ["create", "join", "joinOrCreate", "reconnect"]) {
    const response = await request("/matchmake/" + method + "/strahov", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.ok(!response.ok, "Nepovolený matchmaking: " + method);
    const rejection = await response.json();
    assert.equal(rejection.code, ErrorCode.MATCHMAKE_NO_HANDLER);
    assert.equal(rejection.error, 'invalid method "' + method + '"');
  }
  if (process.argv.includes("--browser")) {
    const { chromium } = await import("playwright");
    // This isolated software-rendered browser checks the real frontend's
    // connection code. Rendering quality/performance is verified separately.
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    });
    let aiFixture:
      Awaited<ReturnType<typeof installBrowserAiFixture>> | undefined;
    try {
      const page = await browser.newPage({
        locale: "cs-CZ",
        viewport: { width: 1280, height: 720 },
      });
      page.setDefaultTimeout(10_000);
      aiFixture = await installBrowserAiFixture(page);
      const matchmaking: string[] = [];
      const sockets: string[] = [];
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (path.includes("/matchmake/")) matchmaking.push(path);
      });
      page.on("websocket", (socket) =>
        sockets.push(new URL(socket.url()).pathname),
      );
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await verifyWelcomeChat(page, aiFixture);
      await page
        .getByRole("button", { name: "Pusť mě dovnitř", exact: true })
        .click();
      await page
        .locator('.welcome-screen[data-screen="profile"] .avatar-editor')
        .waitFor({ state: "visible" });
      await page
        .getByRole("textbox", { name: "Jak ti budeme říkat?", exact: true })
        .fill("Docker Browser");
      await page
        .getByRole("button", {
          name: "Vstoupit do hry",
          exact: true,
        })
        .click({ timeout: 30_000 });
      await page
        .locator('canvas[data-network-stage="connected"]')
        .waitFor({ timeout: 60_000 });
      assert.ok(
        matchmaking.some((path) => /^\/matchmake\/joinById\//.test(path)),
        "Skutečný frontend používá kořenový matchmaking.",
      );
      assert.ok(
        sockets.length > 0 &&
          sockets.every((path) => !path.startsWith("/realtime")),
        "Skutečný frontend používá kořenový WebSocket.",
      );
      console.log(
        "PASS Docker compiled frontend admission " +
          JSON.stringify({ matchmaking, sockets }),
      );
    } finally {
      try {
        await aiFixture?.complete();
      } finally {
        await browser.close();
      }
    }
  }
  const first = await issue("Docker Alice", process.env.STRAHOV_OLD_TOKEN);
  const second = await issue("Docker Bob");
  assert.equal(first.worldId, second.worldId);
  const sdk = new Client(url);
  if (process.env.STRAHOV_OLD_WORLD) {
    assert.notEqual(first.worldId, process.env.STRAHOV_OLD_WORLD);
    assert.notEqual(first.id, process.env.STRAHOV_OLD_ID);
    await assert.rejects(
      () =>
        sdk.joinById(first.worldId, {
          token: process.env.STRAHOV_OLD_TOKEN,
          protocol: PROTOCOL_VERSION,
        }),
      "Token před restartem nesmí platit.",
    );
  }
  for (const session of [first, second]) {
    const room = await sdk.joinById(session.worldId, {
      token: session.token,
      protocol: PROTOCOL_VERSION,
    });
    room.onMessage("*", () => {});
    room.onLeave(() => closedRooms.add(room));
    rooms.push(room);
  }
  console.log(
    "PASS Docker HTTP/assets/cache/guest/diagnostics/matchmaking/two clients" +
      (process.env.STRAHOV_OLD_WORLD ? "/restart identity" : ""),
  );
  if (lifecycle) {
    assert.ok(process.send, "Lifecycle režim vyžaduje IPC rodiče.");
    let timeout: NodeJS.Timeout | undefined;
    const closed = Promise.all(
      rooms.map(
        (room) => new Promise<void>((resolve) => room.onLeave(() => resolve())),
      ),
    );
    process.send({
      kind: "ready",
      worldId: first.worldId,
      id: first.id,
      token: first.token,
    });
    try {
      await Promise.race([
        closed,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Klienti nebyli odpojeni při docker stop.")),
            40_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    process.send({ kind: "closed" });
    console.log("PASS Docker SIGTERM odpojil oba skutečné SDK klienty.");
  }
} finally {
  await Promise.allSettled(
    rooms.filter((room) => !closedRooms.has(room)).map((room) => room.leave()),
  );
  process.disconnect?.();
}
