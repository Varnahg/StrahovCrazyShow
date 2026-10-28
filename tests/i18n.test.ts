import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  detectLocale,
  getLocale,
  setLocale,
  subscribeLocale,
  t,
  localizeText,
  localizeNotice,
  formatDate,
  formatNumber,
  plural,
  LOCALE_STORAGE_KEY,
} from "../client/i18n";
import { messages } from "../client/i18n-messages";
import { contentMessages } from "../client/i18n-content";
import {
  demoEventText,
  searchLocalizedJournal,
} from "../client/i18n-content-helpers";
import journal from "../shared/data/journal.json";
import translation from "../client/data/journal-en.json";
import { JOURNAL_ENTRIES, parseJournalProgress } from "../shared/journal";
import { makeDemoEvents } from "../shared/events";
import { DEFAULT_PROFILE } from "../shared/types";
import ts from "typescript";

test("saved language wins, browser order is respected and unsupported languages fall back to English", () => {
  assert.equal(detectLocale("cs", ["en-US"]), "cs");
  assert.equal(detectLocale("en", ["cs-CZ"]), "en");
  assert.equal(detectLocale(null, ["de-DE", "cs-CZ", "en"]), "cs");
  assert.equal(detectLocale("invalid", ["en-US", "cs-CZ"]), "en");
  assert.equal(detectLocale(null, ["CS-cz"]), "cs");
  assert.equal(detectLocale(null, ["de-DE"]), "en");
  assert.equal(detectLocale(null), "en");
});

test("switching publishes once, persists only locale, updates document language and survives rejected storage", () => {
  const savedStorage = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    ),
    savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document"),
    storage = new Map<string, string>([
      ["strahov.session", "existing-session"],
      ["strahov.profile", "unchanged-profile"],
    ]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { setItem: (key: string, value: string) => storage.set(key, value) },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { lang: "" } },
  });
  let calls = 0;
  const unsubscribe = subscribeLocale(() => calls++);
  try {
    setLocale("cs");
    calls = 0;
    setLocale("en");
    assert.equal(document.title, "Strahov Crazy Show");
    document.title = "stale title";
    document.documentElement.lang = "stale";
    setLocale("en");
    assert.equal(calls, 1);
    assert.equal(getLocale(), "en");
    assert.equal(document.documentElement.lang, "en");
    assert.equal(document.title, "Strahov Crazy Show");
    assert.equal(storage.get(LOCALE_STORAGE_KEY), "en");
    assert.equal(storage.get("strahov.session"), "existing-session");
    assert.equal(storage.get("strahov.profile"), "unchanged-profile");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        setItem() {
          throw new Error("private storage");
        },
      },
    });
    assert.doesNotThrow(() => setLocale("cs"));
    assert.equal(getLocale(), "cs");
    assert.equal(document.title, "Strahov Crazy Show");
    assert.equal(calls, 2);
    unsubscribe();
    setLocale("en");
    assert.equal(calls, 2);
  } finally {
    unsubscribe();
    if (savedStorage)
      Object.defineProperty(globalThis, "localStorage", savedStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
    if (savedDocument)
      Object.defineProperty(globalThis, "document", savedDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("the registered storage handler preserves the brand for unchanged and changed fallback locales", async () => {
  const globals = ["window", "document", "navigator", "localStorage"] as const;
  const saved = globals.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const registered: ((event: StorageEvent) => void)[] = [];
  let writes = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, listener: (event: StorageEvent) => void) {
        assert.equal(type, "storage");
        registered.push(listener);
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { lang: "" }, title: "" },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { languages: ["cs-CZ"] },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => "cs",
      setItem: () => writes++,
    },
  });
  let unsubscribe: (() => void) | undefined;
  try {
    // An isolated module registers the real browser callback without a new API.
    const url = new URL("../client/i18n.ts", import.meta.url);
    url.searchParams.set("test", "storage-title");
    const isolated: typeof import("../client/i18n") = await import(url.href);
    assert.equal(registered.length, 1);
    const [onStorage] = registered;
    assert.ok(onStorage);
    let calls = 0;
    unsubscribe = isolated.subscribeLocale(() => calls++);

    // Reproduce a clear after App set the brand: browser fallback is still cs.
    document.title = "Strahov Crazy Show";
    onStorage({ key: null, newValue: null } as StorageEvent);
    assert.equal(document.title, "Strahov Crazy Show");
    assert.equal(document.documentElement.lang, "cs");
    assert.equal(isolated.getLocale(), "cs");
    assert.equal(calls, 0);

    document.title = "stale title";
    document.documentElement.lang = "stale";
    onStorage({ key: LOCALE_STORAGE_KEY, newValue: null } as StorageEvent);
    assert.equal(document.title, "Strahov Crazy Show");
    assert.equal(document.documentElement.lang, "cs");
    assert.equal(calls, 0);

    onStorage({ key: LOCALE_STORAGE_KEY, newValue: "en" } as StorageEvent);
    assert.equal(document.title, "Strahov Crazy Show");
    assert.equal(document.documentElement.lang, "en");
    assert.equal(isolated.getLocale(), "en");
    assert.equal(calls, 1);
    onStorage({ key: LOCALE_STORAGE_KEY, newValue: "en" } as StorageEvent);
    assert.equal(calls, 1);

    onStorage({ key: LOCALE_STORAGE_KEY, newValue: null } as StorageEvent);
    assert.equal(document.title, "Strahov Crazy Show");
    assert.equal(document.documentElement.lang, "cs");
    assert.equal(isolated.getLocale(), "cs");
    assert.equal(calls, 2);

    onStorage({ key: "strahov.profile", newValue: "en" } as StorageEvent);
    assert.equal(isolated.getLocale(), "cs");
    assert.equal(document.documentElement.lang, "cs");
    assert.equal(document.title, "Strahov Crazy Show");
    assert.equal(calls, 2);
    assert.equal(writes, 0, "storage notifications must not persist again");
  } finally {
    unsubscribe?.();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("typed messages retain parameters and legacy notices can change language after they were emitted", () => {
  for (const [source, english] of Object.entries(messages)) {
    const params = (s: string) =>
      [...s.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(params(source), params(english), source);
    assert.ok(english.trim(), source);
  }
  setLocale("en");
  assert.equal(
    t("Nalezeno {count}/{total}", { count: 2, total: 5 }),
    "Found 2/5",
  );
  assert.equal(
    localizeNotice("Error: Kontakt není dostupný."),
    "The contact is unavailable.",
  );
  const reward = t("Odměna: {name}", {
    name: localizeText("Průzkumník kopce"),
  });
  assert.equal(reward, "Reward: Hill explorer");
  setLocale("cs");
  assert.equal(localizeNotice(reward), "Odměna: Průzkumník kopce");
  assert.equal(
    localizeNotice("Unknown network detail 503"),
    "Unknown network detail 503",
  );
});

test("current server validation and public HTTP errors have a client-side translation without changing the wire protocol", () => {
  for (const path of ["server/index.ts", "server/community.ts"]) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      let value: string | undefined;
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(source) === "Error" &&
        node.arguments?.[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        value = node.arguments[0].text;
      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(source) === "error" &&
        ts.isStringLiteral(node.initializer)
      )
        value = node.initializer.text;
      if (value && /[áčďéěíňóřšťúůýž]/i.test(value))
        assert.ok(Object.hasOwn(messages, value), `${path}: ${value}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

// TypeScript must reject invalid keys and missing/wrong interpolation parameters.
function compileTimeContract() {
  // @ts-expect-error Unknown message key.
  t("missing-key-for-test");
  // @ts-expect-error Parameters are required for a parameterised message.
  t("Nalezeno {count}/{total}");
  // @ts-expect-error The total parameter cannot be replaced by another field.
  t("Nalezeno {count}/{total}", { count: 1, maximum: 5 });
}
void compileTimeContract;

test("Czech and English use locale-specific numbers, Prague dates and singular/few/other forms", () => {
  const instant = Date.UTC(2026, 9, 10, 22, 30);
  setLocale("cs");
  assert.equal(
    formatNumber(1234.5),
    new Intl.NumberFormat("cs-CZ").format(1234.5),
  );
  assert.equal(plural(1, { one: "one", few: "few", other: "other" }), "one");
  assert.equal(plural(3, { one: "one", few: "few", other: "other" }), "few");
  assert.equal(plural(5, { one: "one", few: "few", other: "other" }), "other");
  assert.equal(formatDate(instant, { dateStyle: "long" }), "11. října 2026");
  setLocale("en");
  assert.equal(formatNumber(1234.5), "1,234.5");
  assert.equal(formatDate(instant, { dateStyle: "long" }), "11 October 2026");
  assert.equal(plural(2, { one: "one", few: "few", other: "other" }), "other");
});

test("all journal articles and factual text have translations tied to the unchanged source hash", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync("shared/data/journal.json"))
      .digest("hex"),
    translation.sourceSha256,
  );
  assert.deepEqual(
    Object.keys(translation.entries).sort(),
    journal.entries.map((e) => e.id).sort(),
  );
  const entries = translation.entries as Record<
    string,
    { paragraphs: string[]; tags: string[]; steps?: string[] }
  >;
  for (const entry of journal.entries) {
    assert.equal(
      entries[entry.id].paragraphs.length,
      entry.paragraphs.length,
      entry.id,
    );
    assert.equal(entries[entry.id].tags.length, entry.tags.length, entry.id);
    assert.equal(
      entries[entry.id].steps?.length,
      entry.steps?.length,
      entry.id,
    );
    for (const source of [
      entry.title,
      entry.summary,
      ...entry.paragraphs,
      ...(entry.steps ?? []),
      ...(entry.facts?.flatMap((f) => [f.label, f.value]) ?? []),
    ])
      assert.ok(contentMessages[source], `${entry.id}: missing ${source}`);
    for (const link of entry.links ?? [])
      if (!link.url.startsWith("mailto:"))
        assert.ok(contentMessages[link.label], link.label);
  }
  for (const source of journal.sources)
    assert.ok(contentMessages[source.label], source.label);
  for (const image of journal.images)
    for (const text of [image.caption, image.changes])
      assert.ok(contentMessages[text], text);
  for (const place of journal.places)
    for (const text of [place.name, place.description, place.venueLabel]) {
      assert.ok(contentMessages[text] || text === "Olympijská 1912/2", text);
    }
});

test("translated search preserves source identities, source URLs, bookmarks and factual uncertainty", () => {
  const before = JSON.stringify(journal);
  const favorites = new Set(["laundry"]);
  assert.ok(
    searchLocalizedJournal("washing machines", "all", undefined, "en").some(
      (e) => e.id === "laundry",
    ),
  );
  assert.deepEqual(
    searchLocalizedJournal("laundry", "services", favorites, "en").map(
      (e) => e.id,
    ),
    ["laundry"],
  );
  assert.ok(
    searchLocalizedJournal("pracky", "all", undefined, "cs").some(
      (e) => e.id === "laundry",
    ),
  );
  const found = searchLocalizedJournal(
    "not a surveyed",
    "all",
    undefined,
    "en",
  ).find((e) => e.id === "b6-guide");
  assert.equal(
    found,
    JOURNAL_ENTRIES.find((e) => e.id === "b6-guide"),
  );
  assert.equal(
    found?.links?.[0].url,
    "https://wiki.sh.cvut.cz/kolej/bloky/blok_6",
  );
  assert.equal(JSON.stringify(journal), before);
  const progress = parseJournalProgress(
    JSON.stringify({
      version: 1,
      favorites: ["laundry"],
      read: ["welcome"],
      lastEntryId: "laundry",
    }),
  );
  setLocale("en");
  setLocale("cs");
  assert.deepEqual(progress, {
    version: 1,
    favorites: ["laundry"],
    read: ["welcome"],
    lastEntryId: "laundry",
  });
});

test("only source-identical built-in events translate; player-authored text stays verbatim", () => {
  const event = makeDemoEvents(0)[0];
  setLocale("en");
  assert.equal(demoEventText(event, "title"), "Tea & first introductions");
  assert.equal(
    demoEventText({ ...event, owner: "player" }, "title"),
    event.title,
  );
  assert.equal(demoEventText({ ...event, id: "custom" }, "title"), event.title);
  assert.equal(
    demoEventText({ ...event, title: "My edited meetup" }, "title"),
    "My edited meetup",
  );
  assert.equal(localizeText("Unlisted proper name"), "Unlisted proper name");
});

test("real journal and avatar React views render English/Czech with original links and unmodified nickname, without a GPU", async () => {
  const hooks = registerHooks({
    load(url, context, next) {
      if (url.endsWith(".css"))
        return {
          format: "module",
          source: "export default {};",
          shortCircuit: true,
        };
      return next(url, context);
    },
  });
  try {
    const [{ Journal }, { AvatarEditor }, { EmoteMenu }] = await Promise.all([
      import("../client/journal"),
      import("../client/avatar-editor"),
      import("../client/emote-menu"),
    ]);
    setLocale("en");
    const journalEN = renderToStaticMarkup(
      createElement(Journal, {
        open: true,
        onClose() {},
        initialEntryId: "laundry",
      }),
    );
    assert.match(journalEN, /Strahov journal/);
    assert.match(journalEN, /new Student Laundry in B4 opened on 1 April 2025/);
    assert.match(
      journalEN,
      /https:\/\/www.suz.cvut.cz\/cz\/aktuality\/nova-studentska-pradelna-strahov-bude-otevrena-od-1-4-2025/,
    );
    const nickname = "Čaj & první seznámení";
    const avatarEN = renderToStaticMarkup(
      createElement(AvatarEditor, {
        profile: { ...DEFAULT_PROFILE, nickname },
        onChange() {},
      }),
    );
    assert.match(avatarEN, /What should we call you/);
    assert.match(avatarEN, /value="Čaj &amp; první seznámení"/);
    assert.match(avatarEN, /Face and hair/);
    assert.match(
      renderToStaticMarkup(
        createElement(EmoteMenu, { open: true, onClose() {}, onChoose() {} }),
      ),
      /Quick gestures/,
    );
    setLocale("cs");
    const journalCS = renderToStaticMarkup(
      createElement(Journal, {
        open: true,
        onClose() {},
        initialEntryId: "laundry",
      }),
    );
    assert.match(journalCS, /Strahovský deník/);
    assert.match(
      journalCS,
      /Nová Studentská prádelna na B4 byla otevřena 1. dubna 2025/,
    );
  } finally {
    hooks.deregister();
  }
});
