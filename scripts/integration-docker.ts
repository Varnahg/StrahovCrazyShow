import assert from "node:assert/strict";
import { Client, ErrorCode, type Room } from "@colyseus/sdk";
import { DEFAULT_PROFILE } from "../shared/types";
import { PROTOCOL_VERSION } from "../shared/netcode";

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
    try {
      const page = await browser.newPage({
        locale: "cs-CZ",
        viewport: { width: 1280, height: 720 },
      });
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
      await page
        .getByRole("textbox", { name: "Jak ti budeme říkat?", exact: true })
        .fill("Docker Browser");
      await page
        .getByRole("button", {
          name: "Vstoupit do společného světa ↗",
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
      await browser.close();
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
