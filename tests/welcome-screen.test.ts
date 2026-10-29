import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WelcomeScreen,
  observePublicPresence,
  type PublicPresenceState,
  type WelcomeScreenProps,
} from "../client/welcome-screen";
import { DEFAULT_PROFILE } from "../shared/types";
import { observeViewportHeight } from "../client/use-viewport-height";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function home(props: Partial<WelcomeScreenProps> = {}) {
  return renderToStaticMarkup(
    createElement(WelcomeScreen, {
      locale: "cs",
      profile: DEFAULT_PROFILE,
      enter() {},
      busy: false,
      editor: null,
      language: "language",
      feedback: "feedback",
      presence: { status: "ready", online: 0 },
      ...props,
    }),
  );
}

test("home has one multiplayer entry and defers the live editor in CZ and EN", () => {
  let editorRenders = 0;
  const Editor = () => {
    editorRenders++;
    return createElement("canvas", { "data-live-editor": true });
  };
  for (const locale of ["cs", "en"] as const) {
    const html = home({ locale, editor: createElement(Editor) });
    assert.equal(editorRenders, 0, "home must not initialize a GPU preview");
    assert.match(html, /data-screen="home"/);
    assert.equal(
      (html.match(/class="home-primary home-enter"/g) ?? []).length,
      1,
    );
    assert.match(html, locale === "cs" ? />Pusť mě dovnitř</ : />Let me in</);
    assert.match(html, /<strong>0<\/strong>/);
    assert.match(
      html,
      locale === "cs" ? /Strahováků online/ : /Strahov players online/,
    );
    assert.doesNotMatch(
      html,
      /data-live-editor|<canvas|<input|Explore Strahov|Prohlédnout si|DEMO|Na kopci|Ve svém živlu|↗|class="brand"/,
    );
  }
});

test("unavailable and loading presence stay unknown, and chat is initially only a launcher", () => {
  for (const status of ["unavailable", "loading"] as const) {
    const html = home({
      presence: { status },
      assistant: createElement("p", {}, "Private assistant contents"),
    });
    assert.match(html, /<strong>—<\/strong>/);
    assert.doesNotMatch(
      html,
      /<strong>0<\/strong>|Private assistant contents|home-chat-popup/,
    );
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /Crazy Typka/);
    assert.match(html, /class="home-ai-tag">AI</);
    assert.match(
      html,
      status === "loading"
        ? /Zjišťuji počet připojených/
        : /Počet připojených teď není dostupný/,
    );
  }
});

test("real player count handles Czech plural forms without claiming verified identities", () => {
  for (const [online, wording] of [
    [1, "Strahovák online"],
    [3, "Strahováci online"],
    [12, "Strahováků online"],
  ] as const) {
    const html = home({ presence: { status: "ready", online } });
    assert.ok(html.includes(wording));
    assert.ok(html.includes("<strong>" + online + "</strong>"));
  }
});

test("background is decorative, dialogs stay closed and genuine feedback/language slots remain", () => {
  const html = home({ busy: true, error: "Server neodpovídá" });
  assert.match(html, /class="home-map-viewport" aria-hidden="true"/);
  assert.match(html, /class="home-map-art"/);
  assert.match(html, /focusable="false"/);
  assert.match(html, /language/);
  assert.match(html, /feedback/);
  assert.match(html, /role="alert">Server neodpovídá/);
  assert.match(html, /class="home-primary home-enter" disabled=""/);
  assert.doesNotMatch(
    html,
    /<dialog|OpenStreetMap|<text|<canvas|class="leaflet/,
  );
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

function viewportFixture() {
  function eventSource<T extends object>(values: T) {
    const listeners = new Map<string, Set<EventListener>>();
    const source = Object.assign(values, {
      addEventListener(type: string, listener: EventListener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: EventListener) {
        listeners.get(type)?.delete(listener);
      },
    });
    return {
      source,
      emit(type: string) {
        for (const listener of listeners.get(type) ?? []) listener(new Event(type));
      },
      listeners,
    };
  }
  const visual = eventSource({ height: 844, offsetTop: 0, scale: 1 });
  const outer = eventSource({ innerHeight: 900, visualViewport: visual.source });
  const properties = new Map<string, string>();
  const attributes = new Set<string>();
  let writes = 0;
  const element = {
    toggleAttribute(name: string, present: boolean) {
      if (present) attributes.add(name);
      else attributes.delete(name);
    },
    removeAttribute(name: string) { attributes.delete(name); },
    style: {
      setProperty(name: string, value: string) {
        properties.set(name, value);
        writes++;
      },
      removeProperty(name: string) { properties.delete(name); },
    },
  } as unknown as HTMLElement;
  return {
    visual, outer, properties, attributes, element,
    source: outer.source as unknown as Window,
    writes: () => writes,
  };
}

test("welcome viewport follows keyboard resize and pan without redundant writes", () => {
  const view = viewportFixture();
  const stop = observeViewportHeight(view.element, view.source);
  assert.equal(view.properties.get("--welcome-viewport-height"), "844px");
  view.visual.source.height = 360;
  view.visual.source.offsetTop = 32;
  view.visual.emit("resize");
  assert.equal(view.properties.get("--welcome-viewport-height"), "360px");
  assert.equal(view.properties.get("--welcome-viewport-top"), "32px");
  const writes = view.writes();
  view.visual.emit("scroll");
  view.outer.emit("resize");
  assert.equal(view.writes(), writes);
  view.visual.source.offsetTop = 48;
  view.visual.emit("scroll");
  assert.equal(view.properties.get("--welcome-viewport-top"), "48px");
  stop();
});

test("pinch zoom leaves the layout stable and returning to normal scale resumes fitting", () => {
  const view = viewportFixture();
  const stop = observeViewportHeight(view.element, view.source);
  view.visual.source.scale = 2;
  view.visual.source.height = 422;
  view.visual.source.offsetTop = 120;
  view.visual.emit("resize");
  view.visual.emit("scroll");
  view.outer.emit("resize");
  assert.equal(view.properties.get("--welcome-viewport-height"), "844px");
  assert.equal(view.properties.get("--welcome-viewport-top"), "0px");
  view.visual.source.scale = 1;
  view.visual.source.height = 700;
  view.visual.source.offsetTop = 0;
  view.visual.emit("resize");
  assert.equal(view.properties.get("--welcome-viewport-height"), "700px");
  stop();
});

test("viewport teardown removes every listener and rejects queued callbacks", () => {
  const view = viewportFixture();
  const stop = observeViewportHeight(view.element, view.source);
  const queued = [...view.visual.listeners.get("resize")!][0]!;
  stop();
  stop();
  assert.equal(view.properties.size, 0);
  assert.equal(view.attributes.size, 0);
  assert.equal(view.visual.listeners.get("resize")?.size, 0);
  assert.equal(view.visual.listeners.get("scroll")?.size, 0);
  assert.equal(view.outer.listeners.get("resize")?.size, 0);
  const writes = view.writes();
  view.visual.source.height = 200;
  queued(new Event("resize"));
  view.visual.emit("scroll");
  view.outer.emit("resize");
  assert.equal(view.writes(), writes);
  const next = observeViewportHeight(view.element, view.source);
  assert.equal(view.properties.get("--welcome-viewport-height"), "200px");
  next();
});

test("viewport fallback follows window resize and ignores invalid measurements", () => {
  const view = viewportFixture();
  Object.assign(view.source, { visualViewport: null });
  const stop = observeViewportHeight(view.element, view.source);
  assert.equal(view.properties.get("--welcome-viewport-height"), "900px");
  for (const height of [0, -1, NaN, Infinity]) {
    view.outer.source.innerHeight = height;
    view.outer.emit("resize");
    assert.equal(view.properties.get("--welcome-viewport-height"), "900px");
  }
  view.outer.source.innerHeight = 600;
  view.outer.emit("resize");
  assert.equal(view.properties.get("--welcome-viewport-height"), "600px");
  stop();
});

test("compact flow follows actual keyboard height while pinch zoom preserves the chosen layout", () => {
  const view = viewportFixture();
  const stop = observeViewportHeight(view.element, view.source);
  assert.equal(view.attributes.has("data-compact-viewport"), false);
  // The layout/window height stays unchanged, as on a phone with its keyboard open.
  for (const height of [420, 244, 200]) {
    view.visual.source.height = height;
    view.visual.emit("resize");
    assert.equal(view.outer.source.innerHeight, 900);
    assert.equal(view.attributes.has("data-compact-viewport"), true);
  }
  view.visual.source.height = 421;
  view.visual.emit("resize");
  assert.equal(view.attributes.has("data-compact-viewport"), false);
  view.visual.source.scale = 2;
  view.visual.source.height = 200;
  view.visual.emit("resize");
  assert.equal(view.attributes.has("data-compact-viewport"), false);
  view.visual.source.scale = 1;
  view.visual.emit("resize");
  assert.equal(view.attributes.has("data-compact-viewport"), true);
  stop();
  assert.equal(view.attributes.has("data-compact-viewport"), false);
});
