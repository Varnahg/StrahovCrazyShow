import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CrazyTypkaChat,
  CrazyTypkaChatActions,
  createCrazyTypkaClient,
  type CrazyTypkaState,
} from "../client/crazy-typka";
import {
  CRAZY_TYPKA_SPEAKER,
  type CrazyTypkaSource,
} from "../shared/crazy-typka";

const source: CrazyTypkaSource = {
  id: "membership",
  title: "Členství Silicon Hill",
  url: "https://www.siliconhill.cz/pages/clenstvi",
  checkedAt: "2026-10-27",
  author: "Silicon Hill",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  adaptation: "curated-paraphrase",
};

function state(patch: Partial<CrazyTypkaState> = {}): CrazyTypkaState {
  return {
    availability: "enabled",
    busy: false,
    draft: "",
    messages: [],
    error: null,
    notice: null,
    recovery: "none",
    setDraft() {},
    selectReply() {},
    clearReply() {},
    draftReply: null,
    replyableRequestSeqs: [],
    setKnowledgeScope() {},
    knowledgeScope: { kind: "current" },
    async send() {},
    async retry() {},
    async reset() {},
    async cancel() {},
    async refreshStatus() {},
    ...patch,
  };
}

function render(
  value: CrazyTypkaState,
  locale: "cs" | "en" = "cs",
  variant?: "default" | "compact",
) {
  return renderToStaticMarkup(
    createElement(CrazyTypkaChat, { state: value, locale, variant }),
  );
}

const incoming = {
  id: 1,
  role: "ai" as const,
  text: "Ahoj <script>alert(1)</script>",
  sources: [source],
};

test("the real client validates new SUZ and SHerna citations before compact rendering", async () => {
  const sources: CrazyTypkaSource[] = [
    {
      ...source,
      id: "suz-housing-documents",
      title: "SÚZ – aktuální ceníky a dokumenty ubytování",
      url: "https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty",
      checkedAt: "2026-10-28",
      author: null,
      license: null,
      licenseUrl: null,
    },
    {
      ...source,
      id: "sh-game-room-reservations",
      title: "Silicon Hill – SHerna: veřejný postup rezervace",
      url: "https://sherna.siliconhill.cz/pages/reservation",
      checkedAt: "2026-10-28",
      author: null,
      license: null,
      licenseUrl: null,
    },
  ];
  let chats = 0;
  const client = createCrazyTypkaClient({
    request: (async (input, init) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(input).endsWith("status"))
        return Response.json({ enabled: true });
      if (String(input).endsWith("session"))
        return Response.json({
          token: "b".repeat(64),
          expiresAt: Date.now() + 60000,
        });
      assert.ok(String(input).endsWith("chat"));
      chats++;
      const body = JSON.parse(String(init?.body));
      return Response.json({
        requestSeq: body.requestSeq,
        speaker: CRAZY_TYPKA_SPEAKER,
        text: "Ověř si podklady příslušné služby.",
        sources,
      });
    }) as typeof fetch,
  });
  try {
    await client.refreshStatus();
    client.setDraft("Kde najdu podklady k ubytování a SHerně?");
    await client.send("cs");
    assert.equal(client.getSnapshot().error, null);
    assert.deepEqual(client.getSnapshot().messages.at(-1)?.sources, sources);
    const html = render(state(client.getSnapshot()), "cs", "compact");
    for (const item of sources) {
      assert.ok("url" in item);
      assert.ok(html.includes('href="' + item.url + '"'));
    }
    assert.equal(chats, 1);
  } finally {
    client.dispose();
  }
});

test("the compact presentation is opt-in and the default contract stays intact", () => {
  for (const locale of ["cs", "en"] as const) {
    const value = state({ messages: [incoming] });
    const html = render(value, locale);
    assert.equal(html, render(value, locale, "default"));
    assert.match(html, /class="crazy-chat"/);
    assert.doesNotMatch(
      html,
      /crazy-compact|crazy-privacy|\/ui\/crazy-typka\.svg/,
    );
    assert.match(html, /rows="2"/);
    assert.match(
      html,
      locale === "cs" ? /Tvoje průvodkyně po kopci/ : /Your guide to the hill/,
    );
    assert.equal((html.match(/class="crazy-ai-badge"/g) ?? []).length, 2);
  }
});

test("compact composer is quiet and complete privacy lives in the header information icon", () => {
  for (const locale of ["cs", "en"] as const) {
    const html = render(state(), locale, "compact");
    assert.match(html, /class="crazy-chat crazy-compact"/);
    assert.match(html, /<img[^>]+src="\/ui\/crazy-typka\.svg"[^>]+alt=""/);
    assert.match(html, /Crazy Typka.*class="crazy-ai-badge">AI/s);
    assert.doesNotMatch(
      html,
      /Tvoje průvodkyně po kopci|Your guide to the hill/,
    );
    assert.doesNotMatch(
      html,
      /OpenAI|Soukromá AI konverzace|Odpověď může chybovat|<select|datetime-local/,
    );
    const actions = renderToStaticMarkup(
      createElement(CrazyTypkaChatActions, { state: state(), locale }),
    );
    const details = actions.match(
      /<details class="crazy-chat-info">([\s\S]*?)<\/details>/,
    );
    assert.ok(
      details,
      "privacy must remain a keyboard-operable native disclosure",
    );
    assert.match(details[1], /OpenAI/);
    assert.match(details[1], /Silicon Hill/);
    assert.match(
      details[1],
      locale === "cs" ? /Informace o chatu/ : /Chat information/,
    );
    assert.match(
      details[1],
      locale === "cs"
        ? /Ostatní hráči ji nevidí/
        : /Other players cannot see it/,
    );
    assert.match(
      details[1],
      locale === "cs"
        ? /Neposílej hesla ani osobní údaje/
        : /Do not send passwords or personal data/,
    );
    assert.match(
      details[1],
      locale === "cs" ? /v krátké relaci/ : /in a short session/,
    );
    const label = html.match(/<label for="([^"]+-message)">([^<]+)<\/label>/);
    assert.ok(label);
    assert.match(html, new RegExp(`<textarea id="${label[1]}"`));
    assert.equal(label[2], locale === "cs" ? "Zpráva" : "Message");
    assert.match(html, /rows="1"/);
    assert.match(html, locale === "cs" ? /Napiš zprávu…/ : /Write a message…/);
    assert.doesNotMatch(details[0].match(/<details[^>]*>/)![0], /\bopen\b/);
    assert.match(html, /Enter.*Shift\+Enter/);
    assert.match(
      html,
      locale === "cs"
        ? /aria-label="Odeslat zprávu"/
        : /aria-label="Send message"/,
    );
  }
});

test("compact bubbles preserve escaped messages, source provenance and safe external links", () => {
  const html = render(
    state({
      messages: [
        { id: 2, role: "user", text: "<b>Otázka</b>", sources: [] },
        incoming,
      ],
    }),
    "cs",
    "compact",
  );
  assert.match(html, /role="log"[^>]+aria-live="polite"/);
  assert.match(html, /class="crazy-message user"/);
  assert.match(html, /class="crazy-message ai"/);
  assert.match(html, /&lt;b&gt;Otázka&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|<b>Otázka/);
  assert.match(html, /class="crazy-sources"/);
  assert.match(html, /href="https:\/\/www\.siliconhill\.cz\/pages\/clenstvi"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /<time dateTime="2026-10-27">2026-10-27<\/time>/);
  assert.match(html, /stručná parafráze/);
  assert.match(html, /CC BY-SA 4\.0/);
  assert.equal((html.match(/class="crazy-ai-badge"/g) ?? []).length, 2);
  const unsafe = render(
    state({
      messages: [
        { ...incoming, sources: [{ ...source, url: "javascript:alert(1)" }] },
      ],
    }),
    "en",
    "compact",
  );
  assert.doesNotMatch(unsafe, /href="javascript:/);
  assert.match(unsafe, /Členství Silicon Hill/);
});

test("compact busy composer stays editable and exposes cancellation while send remains disabled", () => {
  const html = render(
    state({
      busy: true,
      draft: "Rozepsaná další otázka",
      messages: [incoming],
    }),
    "cs",
    "compact",
  );
  assert.doesNotMatch(html.match(/<textarea\b[^>]*>/)![0], /disabled/);
  assert.match(html.match(/<button\b[^>]*type="submit"[^>]*>/)![0], /disabled/);
  assert.match(html, /Rozepsaná další otázka/);
  assert.match(html, /aria-label="Crazy Typka píše…"/);
  assert.equal((html.match(/<i>/g) ?? []).length, 3);
  assert.doesNotMatch(html, /Hledám v podkladech/);
  const actions = renderToStaticMarkup(
    createElement(CrazyTypkaChatActions, {
      state: state({ busy: true, messages: [incoming] }),
      locale: "cs",
    }),
  );
  assert.match(actions, /aria-label="Zastavit a smazat konverzaci"/);
});

test("compact recovery, expiration and reset controls retain the existing state contract", () => {
  const retry = render(
    state({
      recovery: "retry",
      error: "request-timeout",
      draft: "Další draft",
      messages: [incoming],
    }),
    "cs",
    "compact",
  );
  assert.match(retry, /Obnovit odpověď/);
  assert.match(retry, /Výsledek poslední zprávy není potvrzený/);
  assert.match(
    retry.match(/<button\b[^>]*type="submit"[^>]*>/)![0],
    /disabled/,
  );
  assert.doesNotMatch(retry.match(/<textarea\b[^>]*>/)![0], /disabled/);
  const restart = render(
    state({
      notice: "session-restarted",
      recovery: "reset",
      error: "request-conflict",
      messages: [incoming],
    }),
    "en",
    "compact",
  );
  assert.match(restart, /The previous session expired/);
  assert.match(
    renderToStaticMarkup(
      createElement(CrazyTypkaChatActions, {
        state: state({ recovery: "reset" }),
        locale: "en",
      }),
    ),
    /Start a new conversation/,
  );
  assert.match(restart, /role="alert"/);
  const reset = render(
    state({ error: "reset-unconfirmed", messages: [incoming] }),
    "cs",
    "compact",
  );
  assert.match(reset, /Smazání na serveru se nepodařilo potvrdit/);
  assert.match(
    renderToStaticMarkup(
      createElement(CrazyTypkaChatActions, {
        state: state({ messages: [incoming] }),
        locale: "cs",
      }),
    ),
    /Smazat konverzaci/,
  );
});

for (const availability of ["checking", "disabled", "error"] as const) {
  test(`compact ${availability} availability remains truthful and disables only unavailable composition`, () => {
    const html = render(
      state({ availability, draft: "Ahoj" }),
      "cs",
      "compact",
    );
    assert.match(
      html,
      new RegExp(`class="crazy-availability ${availability}"`),
    );
    assert.match(html.match(/<textarea\b[^>]*>/)![0], /disabled/);
    assert.match(
      html.match(/<button\b[^>]*type="submit"[^>]*>/)![0],
      /disabled/,
    );
    assert.match(
      html,
      availability === "checking"
        ? /Ověřuji připojení AI…/
        : availability === "disabled"
          ? /AI zatím není připojená/
          : /Připojení AI se nepodařilo ověřit/,
    );
    if (availability === "checking") assert.doesNotMatch(html, /Ověřit znovu/);
    else assert.match(html, /Ověřit znovu/);
  });
}
