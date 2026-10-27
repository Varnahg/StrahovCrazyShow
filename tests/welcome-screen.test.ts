import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WelcomeScreen,
  observePublicPresence,
  type PublicPresenceState,
} from "../client/welcome-screen";
import { DEFAULT_PROFILE } from "../shared/types";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("home exposes both entry choices before mounting the detailed editor in CZ and EN", () => {
  let editorRenders = 0;
  const Editor = () => {
    editorRenders++;
    return createElement("p", {}, "heavy editor");
  };
  for (const locale of ["cs", "en"] as const) {
    const html = renderToStaticMarkup(
      createElement(WelcomeScreen, {
        locale,
        profile: DEFAULT_PROFILE,
        onChange() {},
        enter() {},
        busy: false,
        editor: createElement(Editor),
        map: createElement("svg"),
        language: "language",
        feedback: "feedback",
        presence: { status: "ready", online: 0 },
      }),
    );
    assert.equal(
      editorRenders,
      0,
      "collapsed editor must not initialize a 3D preview",
    );
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /<label[^>]+for=/);
    assert.match(html, /maxLength="24"/i);
    assert.match(
      html,
      locale === "cs"
        ? /Vstoupit do společného světa/
        : /Enter the shared world/,
    );
    assert.match(
      html,
      locale === "cs"
        ? /Prohlédnout si Strahov sám/
        : /Explore Strahov on your own/,
    );
    assert.match(html, /<strong>0<\/strong>/);
    assert.doesNotMatch(html, /heavy editor|crazy-chat/);
  }
});

test("unavailable count remains unknown and independent assistant is an optional slot", () => {
  const html = renderToStaticMarkup(
    createElement(WelcomeScreen, {
      locale: "cs",
      profile: DEFAULT_PROFILE,
      onChange() {},
      enter() {},
      busy: true,
      error: "Server neodpovídá",
      editor: null,
      map: null,
      language: null,
      feedback: null,
      assistant: createElement("p", {}, "Optional assistant"),
      presence: { status: "unavailable" },
    }),
  );
  assert.match(html, /Počet připojených teď není dostupný/);
  assert.doesNotMatch(html, /<strong>0<\/strong>/);
  assert.match(html, /Optional assistant/);
  assert.match(html, /role="alert"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
});

test("presence cancellation aborts one request and ignores its late result", async () => {
  const states: PublicPresenceState[] = [];
  let finish!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  let requests = 0;
  const stop = observePublicPresence((state) => states.push(state), {
    request: (async (_input, init) => {
      requests++;
      signal = init?.signal ?? undefined;
      return await new Promise<Response>((resolve) => (finish = resolve));
    }) as typeof fetch,
  });
  assert.equal(requests, 1);
  stop();
  assert.equal(signal?.aborted, true);
  finish(Response.json({ online: 12 }));
  await tick();
  assert.deepEqual(states, [{ status: "loading" }]);
  assert.equal(requests, 1);
});

test("presence validates counts and preserves real zero separately from failure", async () => {
  for (const [body, expected] of [
    [{ online: 0 }, { status: "ready", online: 0 }],
    [{ online: -1 }, { status: "unavailable" }],
    [{ online: "4" }, { status: "unavailable" }],
    [{ online: 1.5 }, { status: "unavailable" }],
  ] as const) {
    const states: PublicPresenceState[] = [];
    const stop = observePublicPresence((state) => states.push(state), {
      request: (async () => Response.json(body)) as typeof fetch,
    });
    await tick();
    stop();
    assert.deepEqual(states.at(-1), expected);
  }
});

test("presence failure never becomes a zero count and schedules no overlapping requests", async () => {
  const states: PublicPresenceState[] = [];
  let calls = 0;
  const stop = observePublicPresence((state) => states.push(state), {
    request: (async () => {
      calls++;
      return new Response("down", { status: 503 });
    }) as typeof fetch,
  });
  await tick();
  stop();
  assert.equal(calls, 1);
  assert.deepEqual(states.at(-1), { status: "unavailable" });
});

test("hidden menu pauses presence polling and visibility listeners retire with the screen", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const visibility = Object.assign(new EventTarget(), { hidden: true });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: visibility,
  });
  let calls = 0;
  let stop = () => {};
  try {
    stop = observePublicPresence(() => {}, {
      request: (async () => {
        calls++;
        return Response.json({ online: 2 });
      }) as typeof fetch,
    });
    assert.equal(calls, 0);
    visibility.hidden = false;
    visibility.dispatchEvent(new Event("visibilitychange"));
    await tick();
    assert.equal(calls, 1);
    stop();
    visibility.dispatchEvent(new Event("visibilitychange"));
    await tick();
    assert.equal(calls, 1);
  } finally {
    stop();
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
