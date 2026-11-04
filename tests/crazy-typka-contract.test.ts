import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CuratedKnowledgeDetails } from "../client/crazy-typka";
import {
  buildCuratedKnowledgeDocumentV3,
  resolveRagKnowledgeChunkV3,
} from "../server/rag-curation-contract";
import {
  createCrazyTypkaProvider,
  crazyTypkaEvidencePayload,
} from "../server/crazy-typka-provider";
import {
  isEvidenceCurrent,
  type EvidenceSnapshot,
} from "../server/rag-evidence-backend";
import {
  isCrazyTypkaSource,
  mergeCrazyTypkaSources,
  CRAZY_TYPKA_SPEAKER,
  isCrazyTypkaResponse,
  isCrazyTypkaReplyTo,
} from "../shared/crazy-typka";
import type { CuratedKnowledgeSource } from "../shared/knowledge-curation";
import type { EvidenceKnowledgeChunk } from "../server/rag-knowledge-types";

function curated(official = false) {
  const bundle = buildCuratedKnowledgeDocumentV3(
    {
      id: official ? "test-official" : "test-community",
      itemId: "test-laundry",
      title: official ? "Jak řešit závadu?" : "Jak si připravit praní?",
      status: "current",
      verification: official ? "verified-official" : "community-experience",
      applicability:
        "Strahov, zkušenost s plánováním praní; žádná garance dostupnosti.",
      reviewedAt: "2026-11-03",
      reviewAfter: "2026-12-03",
      factCheckedAt: official ? "2026-11-03" : null,
      observedFrom: "2024-10-01",
      observedUntil: "2024-10-31",
      limitations: ["Dostupnost služeb je nutné ověřit u provozovatele."],
      supportingRefs: official
        ? [
            {
              publisher: "suz",
              title: "SÚZ FAQ",
              url: "https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ubytovani-faq",
              locator: "Nahlašování závad",
              factCheckedAt: "2026-11-03",
              reviewAfter: "2026-12-03",
            },
          ]
        : [],
      archiveReason: null,
      versionNote: "Syntetický testovací podklad, nejde o skutečný chat.",
    },
    {
      text: official
        ? "Závadu oznamte podle aktuálního postupu SÚZ."
        : "Zkušenost z října 2024: praní si naplánujte předem.",
      headingPath: ["Praktické informace"],
      tokenCount: 40,
    },
  );
  const resolved = resolveRagKnowledgeChunkV3(
    bundle.document,
    bundle.chunks[0],
  );
  assert.ok(resolved.source.adaptation === "knowledge-curation");
  return { ...resolved, document: bundle.document, source: resolved.source };
}

async function generate(
  answer: unknown,
  evidence: EvidenceKnowledgeChunk[],
  locale: "cs" | "en" = "cs",
) {
  const bodies: any[] = [];
  const provider = createCrazyTypkaProvider({
    apiKey: "synthetic-key",
    model: "synthetic-model",
    fetch: async (url, init) => {
      if (String(url).endsWith("/moderations"))
        return Response.json({
          results: [
            {
              flagged: false,
              categories: { harassment: false, sexual: false },
            },
          ],
        });
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: JSON.stringify(answer) }],
          },
        ],
      });
    },
  });
  const result = await provider.generate({
    message: "Jak postupovat?",
    locale,
    history: [],
    evidence,
    now: Date.parse("2026-11-03T12:00:00Z"),
    safetyIdentifier: "synthetic-test",
    signal: new AbortController().signal,
    onGenerationStart() {},
  });
  return { result, body: bodies[0] };
}

test("curated public contract rejects raw audit fields and does not require a fake publisher URL", () => {
  const source = curated().source;
  assert.equal(isCrazyTypkaSource(source), true);
  assert.equal(
    isCrazyTypkaSource({ ...source, discordMessageId: "123456789012345678" }),
    false,
  );
  assert.equal(
    isCrazyTypkaSource({
      ...source,
      url: "https://discord.com/channels/1/2/3",
    }),
    false,
  );
  assert.equal(
    isCrazyTypkaSource({ ...source, verification: "verified-official" }),
    false,
  );
  assert.equal(mergeCrazyTypkaSources([source, source])?.length, 1);
});

test("provider payload separates observation, curator review and independent verification", () => {
  const payload = crazyTypkaEvidencePayload([curated(), curated(true)]);
  assert.equal(payload[0].adaptation, "knowledge-curation");
  assert.equal(payload[0].factCheckedAt, null);
  assert.equal(payload[0].observedUntil, "2024-10-31");
  assert.equal(payload[0].reviewedAt, "2026-11-03");
  assert.equal(payload[1].factCheckedAt, "2026-11-03");
  assert.equal("checkedAt" in payload[0], false);
  assert.equal("authority" in payload[0], false);
});

test("server labels only the community portion of a mixed answer in both locales", async () => {
  const community = curated(),
    official = curated(true);
  for (const locale of ["cs", "en"] as const) {
    const { result, body } = await generate(
      {
        parts: [
          {
            kind: "supported",
            text: "Oficiální postup.",
            sourceIds: [official.id],
          },
          {
            kind: "supported",
            text: "Praktická zkušenost.",
            sourceIds: [community.id],
          },
        ],
      },
      [official, community],
      locale,
    );
    assert.ok(result.text.startsWith("Oficiální postup.\n\n"));
    assert.match(
      result.text,
      locale === "cs"
        ? /Komunitní zkušenost.*nezávisle neověřeno/
        : /Community experience.*not independently verified/,
    );
    assert.match(result.text, /2024-10-01–2024-10-31/);
    assert.deepEqual(result.sourceIds, [official.id, community.id]);
    assert.deepEqual(body.text.format.schema.required, ["parts"]);
    assert.match(body.instructions, /reviewedAt is a curation review date/);
  }
});

test("mixed trust in one generated part, invented references and old format fail closed", async () => {
  const community = curated(),
    official = curated(true);
  for (const answer of [
    {
      parts: [
        {
          kind: "supported",
          text: "Smíšené tvrzení.",
          sourceIds: [official.id, community.id],
        },
      ],
    },
    {
      parts: [
        {
          kind: "supported",
          text: "Smyšlená podpora.",
          sourceIds: ["invented"],
        },
      ],
    },
    { text: "Není označeno.", sourceIds: [community.id] },
    {
      parts: [
        {
          kind: "supported",
          text: "Odkaz https://invalid.example",
          sourceIds: [community.id],
        },
      ],
    },
    { parts: [] },
  ])
    await assert.rejects(generate(answer, [community, official]), {
      code: "invalid-response",
    });
});

test("annotation is included in the public response length limit", async () => {
  const community = curated();
  await assert.rejects(
    generate(
      {
        parts: [
          {
            kind: "supported",
            text: "x".repeat(3999),
            sourceIds: [community.id],
          },
        ],
      },
      [community],
    ),
    { code: "invalid-response" },
  );
});

test("omitting citations cannot turn a community claim into an unlabelled assertion", async () => {
  const community = curated();
  for (const part of [
    { kind: "supported", text: community.text, sourceIds: [] },
    { kind: "gap", text: community.text, sourceIds: [] },
    { text: community.text, sourceIds: [] },
    { kind: "gap", text: "", sourceIds: [community.id] },
  ])
    await assert.rejects(generate({ parts: [part] }, [community]), {
      code: "invalid-response",
    });
  for (const locale of ["cs", "en"] as const) {
    const { result } = await generate(
      { parts: [{ kind: "gap", text: "", sourceIds: [] }] },
      [community],
      locale,
    );
    assert.deepEqual(result.sourceIds, []);
    assert.doesNotMatch(result.text, /října 2024|naplánujte praní/);
    assert.match(
      result.text,
      locale === "cs"
        ? /nemám.*dostatečnou oporu/
        : /don't have enough supporting information/,
    );
  }
});

test("curation expiry and historical asOf do not treat old observation as legal validity", () => {
  const chunk = curated();
  const evidence: EvidenceSnapshot = {
    snapshot: null,
    scope: { kind: "current" },
    chunks: [chunk],
    dependencies: [],
    embeddingUsage: { promptTokens: 0, totalTokens: 0 },
  };
  assert.equal(
    isEvidenceCurrent(evidence, Date.parse("2026-11-03T12:00:00Z")),
    true,
  );
  assert.equal(
    isEvidenceCurrent(evidence, Date.parse("2026-12-03T00:00:00Z")),
    false,
  );
  const archived = {
    ...chunk,
    document: { ...chunk.document, status: "archived" as const },
  };
  assert.equal(
    isEvidenceCurrent(
      {
        ...evidence,
        chunks: [archived],
        scope: { kind: "archive", asOf: "2024-10-15T00:00:00Z" },
      },
      Date.parse("2026-11-03T12:00:00Z"),
    ),
    false,
  );
});

test("source details visibly distinguish experience from official support without inventing an external citation", () => {
  const community = curated().source as CuratedKnowledgeSource;
  const html = renderToStaticMarkup(
    createElement(CuratedKnowledgeDetails, { source: community, locale: "cs" }),
  );
  assert.match(html, /Komunitní zkušenost/);
  assert.match(html, /nezávisle neověřeno/);
  assert.match(html, /Období zkušeností/);
  assert.match(html, /Kontrola kurace/);
  assert.doesNotMatch(html, /href=|Ověření tvrzení|discord/);
  const official = renderToStaticMarkup(
    createElement(CuratedKnowledgeDetails, {
      source: curated(true).source as CuratedKnowledgeSource,
      locale: "en",
    }),
  );
  assert.match(official, /Claims checked/);
  assert.match(official, /https:\/\/www.suz.cvut.cz/);
});

test("block contracts bind canonical text and only public source IDs while replies carry no quote text", () => {
  const source = curated(true).source;
  const block = {
    id: "a".repeat(32),
    text: "Doložená informace.",
    sourceIds: [source.id],
  };
  const answer = {
    speaker: CRAZY_TYPKA_SPEAKER,
    text: block.text,
    sources: [source],
    blocks: [block],
  };
  assert.ok(isCrazyTypkaResponse(answer));
  assert.ok(
    isCrazyTypkaResponse({
      speaker: CRAZY_TYPKA_SPEAKER,
      text: block.text,
      sources: [source],
    }),
  );
  assert.equal(isCrazyTypkaResponse({ ...answer, text: "jiné znění" }), false);
  assert.equal(
    isCrazyTypkaResponse({
      ...answer,
      blocks: [{ ...block, sourceIds: ["forged"] }],
    }),
    false,
  );
  assert.equal(
    isCrazyTypkaResponse({
      ...answer,
      blocks: [block, block],
      text: `${block.text}\n\n${block.text}`,
    }),
    false,
  );
  assert.equal(
    isCrazyTypkaResponse({
      ...answer,
      blocks: [{ ...block, sourceIds: [source.id, source.id] }],
    }),
    false,
  );
  const reply = { requestSeq: 1, blockId: block.id };
  assert.ok(isCrazyTypkaReplyTo(reply));
  assert.equal(
    isCrazyTypkaReplyTo({ ...reply, text: "spoofed earlier answer" }),
    false,
  );
  assert.equal(isCrazyTypkaReplyTo({ ...reply, requestSeq: 0 }), false);
  assert.equal(
    isCrazyTypkaReplyTo({ ...reply, blockId: "other-session-format" }),
    false,
  );
});
