import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createPublicPresenceHandler } from "../server/public-presence";

function invoke(read: () => number, method = "GET", url = "/api/presence") {
  const headers = new Map<string, string>();
  let status = 0,
    body = "";
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    writeHead(code: number) {
      status = code;
      return response;
    },
    end(text: string) {
      body = text;
      return response;
    },
  };
  const handled = createPublicPresenceHandler(read)(
    { method, url } as IncomingMessage,
    response as unknown as ServerResponse,
  );
  return {
    handled,
    status,
    body: body ? JSON.parse(body) : undefined,
    headers,
  };
}

test("public presence is exactly the current aggregate including genuine zero", () => {
  let online = 0;
  for (const count of [0, 12, 11, 0]) {
    online = count;
    const reply = invoke(() => online);
    assert.equal(reply.status, 200);
    assert.deepEqual(reply.body, { online: count });
    assert.deepEqual(Object.keys(reply.body), ["online"]);
    assert.equal(reply.headers.get("Cache-Control"), "no-store");
  }
});

test("unavailable population is an error and never a fabricated zero", () => {
  for (const count of [NaN, Infinity, -1, 1.5]) {
    const reply = invoke(() => count);
    assert.equal(reply.status, 503);
    assert.deepEqual(reply.body, { error: "presence-unavailable" });
  }
  assert.equal(
    invoke(() => {
      throw new Error("private internal detail");
    }).status,
    503,
  );
});

test("only the explicit public GET reads population; no private route becomes public", () => {
  const forbiddenRead = () => {
    throw new Error("must not run");
  };
  assert.equal(invoke(forbiddenRead, "POST").status, 405);
  for (const url of [
    "/api/players",
    "/api/chat",
    "/api/presence?players=1",
    "/api/health",
  ]) {
    const reply = invoke(forbiddenRead, "GET", url);
    assert.equal(reply.handled, false);
    assert.equal(reply.status, 0);
  }
});
