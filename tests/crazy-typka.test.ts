import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import { getKnowledgeRegistry } from "../server/crazy-typka-retrieval";
import {
  buildKnowledgeDocumentV3,
  parserProfileSha256,
  requirePublishableExtraction,
  resolveKnowledgeChunkV3,
  validateWorkerEnvelope,
} from "../server/rag-document-contract";
import { RAG_TOKENIZER } from "../shared/rag-provenance";
import type { DocumentMetadataV3 } from "../server/rag-knowledge-types";
import {
  createDecisionRouter,
  DecisionRouterError,
  type DecisionRouter,
} from "../server/crazy-typka-decisions";

import {
  createEmbeddingProfile,
  createOpenAIEmbedder,
} from "../server/rag-embeddings";
import type {
  RagVectorStore,
  RagSearchSnapshot,
} from "../server/rag-vector-store";
import {
  createRagEvidenceBackend,
  RagEvidenceError,
  type AsyncEvidenceBackend,
  type EvidenceSnapshot,
  type PreparedEvidenceQuery,
} from "../server/rag-evidence-backend";

function viewSnapshot(id = "a".repeat(64)): RagSearchSnapshot {
  const profile = createEmbeddingProfile();
  return {
    id,
    scope: { kind: "current" },
    heads: {
      legacy: { name: "public", revisionId: id, profile },
      documents: null,
      archive: null,
    },
    embeddingSpace: {
      provider: profile.provider,
      model: profile.model,
      dimensions: profile.dimensions,
    },
  };
}
function archiveEvidence(year: number, page = 1) {
  const metadata: DocumentMetadataV3 = {
    ...getKnowledgeRegistry().chunks[0].document,
    id: "suz-archive-wire",
    title: "Archivní podmínky",
    authority: "suz",
    status: "archived",
    archiveReason: "Novější vydání",
    url: "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty",
    discoveryUrl:
      "https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty",
    author: null,
    license: null,
    licenseUrl: null,
    checkedAt: "2026-10-28",
    reviewAfter: "2026-11-28",
    effectiveFrom: `${year}-01-01T00:00:00.000Z`,
    effectiveUntil: `${year + 1}-01-01T00:00:00.000Z`,
  };
  const text = `Pravidlo roku ${year}: sleva neplatí.`,
    inputSha256 = "a".repeat(64);
  const parserProfile = {
    id: "wire-test",
    packages: { tiktoken: "0.12.0" },
    pipeline: "test",
    configurationHash: "b".repeat(64),
    modelManifestHash: null,
    tokenizer: { ...RAG_TOKENIZER, version: "0.12.0" },
  };
  const spans = [{ blockId: "b-one", locator: `PDF strana ${page}`, page }];
  const envelope = validateWorkerEnvelope(
    {
      schemaVersion: 1,
      sourceId: metadata.id,
      inputSha256,
      status: "ok",
      format: "pdf",
      parserProfile,
      document: { title: metadata.title, pageCount: page, complete: true },
      blocks: [{ id: "b-one", kind: "text", text, headingPath: [], spans }],
      chunks: [
        {
          id: "c-one",
          text,
          headingPath: [],
          tokenCount: 15,
          blockIds: ["b-one"],
          spans,
        },
      ],
      quality: {
        processedPages: page,
        expectedPages: page,
        inputTextCharacters: null,
        outputTextCharacters: [...text].length,
        tableCount: 0,
        ocrPages: [],
        issues: [],
      },
      links: [],
    },
    {
      sourceId: metadata.id,
      inputSha256,
      parserProfileSha256: parserProfileSha256(parserProfile),
    },
  );
  const bundle = buildKnowledgeDocumentV3(
    metadata,
    requirePublishableExtraction(envelope),
    "native",
  );
  return resolveKnowledgeChunkV3(bundle.document, bundle.chunks[0]);
}
function fakeEvidenceBackend(): AsyncEvidenceBackend {
  const registry = getKnowledgeRegistry(),
    profile = createEmbeddingProfile();
  return {
    profile,
    async ready() {
      return true;
    },
    async search(query, options) {
      options.onEmbeddingAttempt(Buffer.byteLength(query.text, "utf8"));
      options.onEmbeddingUsage?.({ promptTokens: 1, totalTokens: 1 });
      const message = query.text.split("\nCurrent user question:\n").at(-1)!;
      const previous =
        query.filterText === message
          ? []
          : [{ role: "user", content: query.filterText }];
      const chunks = registry.retrieveConversation(
        message,
        previous,
        4,
        options.now,
      );
      return {
        snapshot: viewSnapshot(),
        scope: options.scope ?? { kind: "current" },
        chunks,
        dependencies: [...new Set(chunks.map((chunk) => chunk.source.id))].map(
          (sourceVersionId) => ({ head: "public" as const, sourceVersionId }),
        ),
        embeddingUsage: { promptTokens: 1, totalTokens: 1 },
      };
    },
    async validate(evidence, instant) {
      return evidence.dependencies.every(({ sourceVersionId }) =>
        registry.isSourceUsable(sourceVersionId, instant),
      );
    },
    async close() {},
  };
}
function fakeDecisionRouter(
  complexProbability = 0.1,
  localSourcesProbability = 0.1,
  calls: string[] = [],
): DecisionRouter {
  return {
    async classify(text, options) {
      calls.push(text);
      options.onAttempt?.(Buffer.byteLength(text, "utf8") + 100);
      return {
        complexProbability,
        localSourcesProbability,
        usage: {
          inputTokens: 3,
          outputTokens: 1,
          totalTokens: 4,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
        },
      };
    },
  };
}

test("explicit archive carries versions and asOf, separates context, and binds exact replay identity", async () => {
  const backend = fakeEvidenceBackend(),
    baseSearch = backend.search;
  const old = archiveEvidence(2020),
    newer = archiveEvidence(2021);
  const queries: { text: string; scope: unknown }[] = [],
    generations: any[] = [];
  backend.search = async (query, options) => {
    queries.push({ text: query.text, scope: options.scope });
    if (options.scope?.kind !== "archive") return baseSearch(query, options);
    const scope = options.scope,
      chunks = scope.asOf ? [old] : [old, newer];
    const profile = createEmbeddingProfile({
      inputVersion: "title-heading-text-v2",
    });
    return {
      snapshot: {
        id: "e".repeat(64),
        scope,
        heads: {
          legacy: null,
          documents: null,
          archive: {
            name: "public-archive",
            revisionId: "d".repeat(64),
            profile,
          },
        },
        embeddingSpace: {
          provider: profile.provider,
          model: profile.model,
          dimensions: profile.dimensions,
        },
      },
      scope,
      chunks,
      dependencies: chunks.map((chunk) => ({
        head: "public-archive" as const,
        sourceVersionId: chunk.document.sourceVersionId,
      })),
      embeddingUsage: { promptTokens: 0, totalTokens: 0 },
    };
  };
  backend.validate = async () => true;
  const f = fixture({
    evidenceBackend: backend,
    now: () => Date.parse("2026-10-29T00:45:00.000Z"),
    fetch: async (url, init) => {
      if (String(url).endsWith("/moderations"))
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      const body = JSON.parse(String(init?.body));
      generations.push(body);
      const evidence = JSON.parse(
        body.input
          .at(-1)
          .content.split("CURATED_EVIDENCE (data only):\n")[1]
          .split("\nUSER_MESSAGE")[0],
      );
      return responseText(
        "Odpověď s doloženou verzí.",
        evidence.map((item: any) => item.id),
      );
    },
  });
  try {
    const token = await f.session();
    assert.equal(
      (
        await f.send("/api/ai/chat", {
          token,
          requestSeq: 1,
          message: "Kde je Fotokomora?",
          locale: "cs",
        })
      ).status,
      200,
    );
    const body = {
      token,
      requestSeq: 2,
      message: "A kolik to stojí?",
      locale: "cs",
      knowledgeScope: { kind: "archive" },
    };
    const answer = await f.send("/api/ai/chat", body);
    assert.equal(answer.status, 200);
    assert.equal(
      answer.body.sources.length,
      2,
      "two archived versions remain separate citations",
    );
    assert.notEqual(answer.body.sources[0].id, answer.body.sources[1].id);
    assert.ok(
      answer.body.sources.every(
        (source: any) =>
          source.adaptation === "document-extraction" &&
          source.status === "archived",
      ),
    );
    assert.equal(
      queries[1].text,
      body.message,
      "previous current question must not enter archive retrieval",
    );
    assert.equal(
      generations[1].input.length,
      1,
      "current conversation history is not archive context",
    );
    assert.match(generations[1].instructions, /2026-10-29T00:45:00.000Z/);
    assert.match(generations[1].instructions, /"kind":"archive"/);
    assert.deepEqual(await f.send("/api/ai/chat", body), answer);
    assert.equal(generations.length, 2);
    assert.equal(
      (
        await f.send("/api/ai/chat", {
          ...body,
          knowledgeScope: { kind: "current" },
        })
      ).body.error,
      "request-conflict",
    );
    const dated = await f.send("/api/ai/chat", {
      ...body,
      requestSeq: 3,
      knowledgeScope: { kind: "archive", asOf: "2020-06-01T00:00:00.000Z" },
    });
    assert.equal(dated.status, 200);
    assert.equal(dated.body.sources.length, 1);
    assert.deepEqual(queries[2].scope, {
      kind: "archive",
      asOf: "2020-06-01T00:00:00.000Z",
    });
    assert.equal(
      generations[2].input.length,
      1,
      "asOf change is also a context boundary",
    );
  } finally {
    await f.service.close();
  }
});

test("invalid knowledge scopes never reach moderation or Decisions", async () => {
  const f = fixture();
  try {
    const token = await f.session();
    for (const knowledgeScope of [
      null,
      "archive",
      {},
      { kind: "other" },
      { kind: "current", asOf: "2020-01-01T00:00:00.000Z" },
      { kind: "archive", asOf: "2020-02-31T00:00:00.000Z" },
      { kind: "archive", asOf: "2020-01-01" },
      { kind: "archive", extra: true },
    ]) {
      const response = await f.send("/api/ai/chat", {
        token,
        requestSeq: 1,
        message: "Podmínky",
        locale: "cs",
        knowledgeScope,
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.error, "invalid-request");
    }
    assert.equal(f.calls.length, 0);
    assert.equal(f.decisions.length, 0);
  } finally {
    await f.service.close();
  }
});

test("current request cannot publish archived evidence even when an injected asynchronous validator accepts it", async () => {
  const backend = fakeEvidenceBackend(),
    archived = archiveEvidence(2020);
  backend.search = async (_query, options) => ({
    snapshot: viewSnapshot(),
    scope: options.scope ?? { kind: "current" },
    chunks: [archived],
    dependencies: [
      {
        head: "public-archive",
        sourceVersionId: archived.document.sourceVersionId,
      },
    ],
    embeddingUsage: { promptTokens: 0, totalTokens: 0 },
  });
  backend.validate = async () => true;
  const f = fixture({
    evidenceBackend: backend,
    now: () => Date.parse("2026-10-28T12:00:00.000Z"),
  });
  try {
    const token = await f.session();
    const result = await f.send("/api/ai/chat", {
      token,
      requestSeq: 1,
      message: "Aktuální pravidla",
      locale: "cs",
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "response-expired");
    assert.equal(f.service.usage().generationAttempts, 0);
  } finally {
    await f.service.close();
  }
});
function expectedRoutingUsage(
  decisionAttempts: number,
  reservedInputBytes: number,
  simpleAttempts: number,
) {
  const empty = {
    attempts: 0,
    confirmedUsageResponses: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    unconfirmedUsageAttempts: 0,
  };
  return {
    decisions: {
      ...empty,
      attempts: decisionAttempts,
      confirmedUsageResponses: decisionAttempts,
      reservedInputBytes,
      inputTokens: decisionAttempts * 3,
      outputTokens: decisionAttempts,
      totalTokens: decisionAttempts * 4,
    },
    generations: {
      simple: {
        ...empty,
        attempts: simpleAttempts,
        unconfirmedUsageAttempts: simpleAttempts,
      },
      complex: empty,
    },
    routingFallbacks: {
      "decision-budget": 0,
      "decision-timeout": 0,
      "decision-error": 0,
      "low-confidence": simpleAttempts,
      "missing-local-evidence": 0,
      "complex-budget": 0,
    },
  };
}
test("the exact bounded query is moderated before embedding and failed or blocked USER text never becomes follow-up input", async () => {
  const base = fakeEvidenceBackend(),
    events: string[] = [],
    queries: string[] = [],
    moderated: string[] = [];
  const decisions: string[] = [],
    router = fakeDecisionRouter(0.1, 0.1, decisions);
  let failGeneration = false;
  const backend: AsyncEvidenceBackend = {
    ...base,
    async search(query, options) {
      events.push("embedding");
      queries.push(query.text);
      return base.search(query, options);
    },
  };
  const f = fixture({
    decisionRouter: {
      classify(text, options) {
        events.push("decisions");
        return router.classify(text, options);
      },
    },
    evidenceBackend: backend,
    now: () => Date.parse("2026-10-28T12:00:00Z"),
    fetch: async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).endsWith("/moderations")) {
        events.push("moderation");
        moderated.push(body.input);
        const flagged = body.input.includes("BLOCKED USER");
        return Response.json({
          results: [{ flagged, categories: { harassment: flagged } }],
        });
      }
      events.push("generation");
      if (failGeneration) {
        failGeneration = false;
        throw new Error("private failure");
      }
      return responseText("Schválená odpověď.");
    },
  });
  try {
    const token = await f.session();
    const send = (requestSeq: number, message: string) =>
      f.send("/api/ai/chat", { token, requestSeq, message, locale: "cs" });
    await send(1, "Kde je Fotokomora?");
    await send(2, "A kolik to stojí?");
    assert.deepEqual(events.slice(0, 10), [
      "moderation",
      "decisions",
      "embedding",
      "generation",
      "moderation",
      "moderation",
      "decisions",
      "embedding",
      "generation",
      "moderation",
    ]);
    assert.equal(queries[0], moderated[0]);
    assert.equal(queries[1], moderated[2]);
    assert.deepEqual(decisions, queries);
    assert.match(queries[1], /Kde je Fotokomora/);
    assert.equal((await send(3, "BLOCKED USER text")).body.error, "blocked");
    await send(4, "A kolik to stojí?");
    assert.equal(queries.at(-1), "A kolik to stojí?");
    assert.ok(queries.every((query) => !query.includes("BLOCKED USER")));
    assert.deepEqual(decisions, queries);
    failGeneration = true;
    assert.equal(
      (await send(5, "FAILED USER nové téma")).body.error,
      "provider-unavailable",
    );
    await send(6, "Kde to najdu?");
    assert.equal(queries.at(-1), "Kde to najdu?");
  } finally {
    await f.service.close();
  }
});

test("transient DB failure while replaying keeps the cached success without any additional API work", async () => {
  const backend = fakeEvidenceBackend();
  let unavailable = false,
    searches = 0;
  const baseSearch = backend.search,
    baseValidate = backend.validate;
  backend.search = async (query, options) => {
    searches++;
    return baseSearch(query, options);
  };
  backend.validate = async (evidence, now, signal) => {
    if (unavailable) throw new Error("postgres://private-password");
    return baseValidate(evidence, now, signal);
  };
  const f = fixture({ evidenceBackend: backend });
  try {
    const token = await f.session(),
      body = { token, requestSeq: 1, message: "Kdo jsi?", locale: "cs" };
    const first = await f.send("/api/ai/chat", body);
    assert.equal(first.status, 200);
    unavailable = true;
    const retry = await f.send("/api/ai/chat", body);
    assert.deepEqual(retry.body, { error: "provider-unavailable" });
    unavailable = false;
    assert.deepEqual((await f.send("/api/ai/chat", body)).body, first.body);
    assert.equal(searches, 1);
    assert.equal(f.calls.length, 3);
    assert.equal(f.service.usage().embeddingAttempts, 1);
    assert.equal(f.service.usage().generationAttempts, 1);
  } finally {
    await f.service.close();
  }
});

for (const phase of ["publish", "replay"] as const)
  for (const boundary of ["review", "effective"] as const)
    test(`all evidence is rechecked at the fresh clock after ${phase} SQL validation crosses the ${boundary} boundary`, async () => {
      const cutoff = Date.parse(
        boundary === "review"
          ? "2026-11-04T00:00:00Z"
          : "2026-11-04T00:00:00+01:00",
      );
      let instant = cutoff - 1,
        validations = 0;
      const backend = fakeEvidenceBackend(),
        baseSearch = backend.search,
        original = getKnowledgeRegistry().chunks.find(
          (item) => item.id === "sh-printing-location",
        )!;
      const dependency = {
        ...original,
        document: {
          ...original.document,
          reviewAfter: boundary === "review" ? "2026-11-04" : "2026-11-10",
          effectiveUntil:
            boundary === "effective" ? "2026-11-04T00:00:00+01:00" : null,
        },
      };
      backend.search = async (query, options) => ({
        ...(await baseSearch(query, options)),
        chunks: [dependency],
        dependencies: [
          { head: "public", sourceVersionId: dependency.source.id },
        ],
      });
      backend.validate = async () => {
        validations++;
        if (validations === (phase === "publish" ? 2 : 3)) {
          await Promise.resolve();
          instant = cutoff;
        }
        return true; // SQL evaluated its caller-supplied, earlier timestamp.
      };
      const f = fixture({
        evidenceBackend: backend,
        now: () => instant,
        decisionRouter: fakeDecisionRouter(0.95, 0.95),
      });
      try {
        const token = await f.session(),
          body = {
            token,
            requestSeq: 1,
            message: "Kde je 3D tisk?",
            locale: "cs",
          };
        const initial = await f.send("/api/ai/chat", body);
        if (phase === "replay") {
          assert.equal(initial.status, 200);
          assert.deepEqual(
            initial.body.sources,
            [],
            "uncited evidence must also expire",
          );
        }
        const expired =
          phase === "publish" ? initial : await f.send("/api/ai/chat", body);
        assert.equal(expired.status, 409);
        assert.deepEqual(expired.body, {
          error: "response-expired",
          requestSeq: 1,
        });
        assert.deepEqual(await f.send("/api/ai/chat", body), expired);
        assert.equal(validations, phase === "publish" ? 2 : 3);
        assert.equal(f.calls.length, 3);
        assert.equal(f.service.usage().embeddingAttempts, 1);
        assert.equal(f.service.usage().generationAttempts, 1);
      } finally {
        await f.service.close();
      }
    });

for (const changed of [false, true])
  test(`${changed ? "new" : "same"} published revision ${changed ? "discards" : "retains"} successful USER and assistant history before generation`, async () => {
    const backend = fakeEvidenceBackend(),
      baseSearch = backend.search;
    let searches = 0;
    backend.search = async (query, options) => {
      const evidence = await baseSearch(query, options);
      searches++;
      return {
        ...evidence,
        snapshot: {
          ...evidence.snapshot!,
          id: (changed && searches > 1 ? "b" : "a").repeat(64),
        },
      };
    };
    const f = fixture({
      evidenceBackend: backend,
      now: () => Date.parse("2026-10-28T12:00:00Z"),
    });
    try {
      const token = await f.session();
      for (const [index, message] of [
        "Kde je Fotokomora?",
        "Jak funguje 3D tisk?",
      ].entries())
        assert.equal(
          (
            await f.send("/api/ai/chat", {
              token,
              requestSeq: index + 1,
              message,
              locale: "cs",
            })
          ).status,
          200,
        );
      const generations = f.calls.filter((call) =>
        call.url.endsWith("/responses"),
      );
      assert.equal(generations.length, 2);
      assert.deepEqual(generations[0].body.input.slice(0, -1), []);
      assert.deepEqual(
        generations[1].body.input.slice(0, -1),
        changed
          ? []
          : [
              { role: "user", content: "Kde je Fotokomora?" },
              {
                role: "assistant",
                content: "Ahoj! Jsem fiktivní AI průvodkyně.",
              },
            ],
      );
    } finally {
      await f.service.close();
    }
  });

test("async replay validation is serialized with new operations and reset cannot resurrect its old answer", async () => {
  const backend = fakeEvidenceBackend();
  let gate = false,
    release!: (value: boolean) => void,
    reached!: () => void;
  const entered = new Promise<void>((resolve) => {
    reached = resolve;
  });
  backend.validate = async () => {
    if (!gate) return true;
    reached();
    return new Promise<boolean>((resolve) => {
      release = resolve;
    });
  };
  const f = fixture({ evidenceBackend: backend });
  try {
    const token = await f.session(),
      body = { token, requestSeq: 1, message: "Kdo jsi?", locale: "cs" };
    await f.send("/api/ai/chat", body);
    gate = true;
    const replay = f.send("/api/ai/chat", body);
    await entered;
    assert.deepEqual(
      (
        await f.send("/api/ai/chat", {
          ...body,
          requestSeq: 2,
          message: "Další",
        })
      ).body,
      { error: "busy" },
    );
    assert.deepEqual((await f.send("/api/ai/chat", body)).body, {
      error: "busy",
    });
    await f.send("/api/ai/session", undefined, "DELETE", {
      authorization: `Bearer ${token}`,
    });
    release(true);
    assert.deepEqual((await replay).body, { error: "session-expired" });
    assert.equal(f.calls.length, 3);
  } finally {
    await f.service.close();
  }
});

test("embedding attempt and conservative token caps are independent of generation and cached errors never refund or retry", async () => {
  const f = fixture({
    env: {
      ...env,
      CRAZY_TYPKA_EMBEDDINGS_PER_PROCESS: "1",
      CRAZY_TYPKA_EMBEDDING_TOKEN_BUDGET: "100",
    },
    limits: { generationsPerProcess: 3 },
  });
  try {
    const token = await f.session();
    await f.send("/api/ai/chat", {
      token,
      requestSeq: 1,
      message: "Hello there",
      locale: "en",
    });
    const body = { token, requestSeq: 2, message: "More facts", locale: "en" };
    const blocked = await f.send("/api/ai/chat", body);
    assert.deepEqual(blocked.body, {
      error: "budget-exhausted",
      requestSeq: 2,
    });
    assert.deepEqual((await f.send("/api/ai/chat", body)).body, blocked.body);
    assert.deepEqual(f.service.usage(), {
      embeddingAttempts: 1,
      reservedEmbeddingTokens: 11,
      confirmedEmbeddingTokens: 1,
      generationAttempts: 1,
      ...expectedRoutingUsage(2, 221, 1),
    });
    assert.equal(f.calls.length, 4);
  } finally {
    await f.service.close();
  }
  const bounded = fixture({ limits: { embeddingTokenBudget: 1 } });
  try {
    const token = await bounded.session();
    assert.equal(
      (
        await bounded.send("/api/ai/chat", {
          token,
          requestSeq: 1,
          message: "Dotaz",
          locale: "cs",
        })
      ).body.error,
      "budget-exhausted",
    );
    assert.deepEqual(bounded.service.usage(), {
      embeddingAttempts: 0,
      reservedEmbeddingTokens: 0,
      confirmedEmbeddingTokens: 0,
      generationAttempts: 0,
      ...expectedRoutingUsage(1, 105, 0),
    });
    assert.equal(bounded.calls.length, 1, "only free moderation ran");
  } finally {
    await bounded.service.close();
  }
});

test("backend readiness never falls back and DELETE remains usable during a DB outage", async () => {
  const backend = fakeEvidenceBackend();
  let available = true;
  backend.ready = async () => available;
  const f = fixture({ evidenceBackend: backend });
  try {
    const token = await f.session();
    available = false;
    assert.deepEqual((await f.send("/api/ai/status", undefined, "GET")).body, {
      enabled: false,
    });
    assert.deepEqual((await f.send("/api/ai/session", {})).body, {
      error: "unavailable",
    });
    assert.equal(
      (
        await f.send("/api/ai/session", undefined, "DELETE", {
          authorization: `Bearer ${token}`,
        })
      ).status,
      204,
    );
    assert.equal(f.calls.length, 0);
  } finally {
    await f.service.close();
  }
});

test("a revision expiring inside vector retrieval is confirmed as a conflict and replays without another embedding", async () => {
  const backend = fakeEvidenceBackend();
  let searches = 0;
  backend.search = async (_query, options) => {
    searches++;
    options.onEmbeddingAttempt(5);
    throw new RagEvidenceError("response-expired");
  };
  const f = fixture({ evidenceBackend: backend });
  try {
    const token = await f.session(),
      body = {
        token,
        requestSeq: 1,
        message: "Kde je Fotokomora?",
        locale: "cs",
      };
    const first = await f.send("/api/ai/chat", body);
    assert.equal(first.status, 409);
    assert.deepEqual(first.body, { error: "response-expired", requestSeq: 1 });
    assert.deepEqual(await f.send("/api/ai/chat", body), first);
    assert.equal(searches, 1);
    assert.equal(f.calls.length, 1, "only input moderation ran");
    assert.equal(f.service.usage().generationAttempts, 0);
  } finally {
    await f.service.close();
  }
});

test("missing or invalid vector configuration disables optional AI without provider calls", async () => {
  for (const database of [undefined, "not-a-database-url"]) {
    let diagnostics = 0,
      calls = 0;
    const service = createOptionalCrazyTypkaService(
      {
        env: { ...env, RAG_DATABASE_URL: database },
        fetch: async () => {
          calls++;
          throw new Error("must not call");
        },
      },
      () => {
        diagnostics++;
      },
    );
    const result = response();
    await service.handle(
      request("/api/ai/status", undefined, "GET"),
      result.res,
    );
    assert.deepEqual(result.result().body, { enabled: false });
    assert.equal(
      await service.handle(
        request("/api/health", undefined, "GET"),
        response().res,
      ),
      false,
    );
    assert.equal(diagnostics, 1);
    assert.equal(calls, 0);
    await service.close();
  }
});

test("new SH and SUZ facts reach provider and compatible client citations through the service", async () => {
  const cases = [
    {
      question: "Kde je dílna 3D tisku?",
      id: "sh-printing-location",
      authority: "silicon-hill",
      host: "wiki.sh.cvut.cz",
    },
    {
      question: "Do kdy platím kolejné SÚZ?",
      id: "suz-housing-payment-due",
      authority: "suz",
      host: "www.suz.cvut.cz",
    },
  ];
  for (const item of cases) {
    let delivered: any;
    const f = fixture({
      now: () => Date.parse("2026-10-28T12:00:00Z"),
      fetch: async (url, init) => {
        if (String(url).endsWith("/moderations"))
          return Response.json({
            results: [{ flagged: false, categories: { harassment: false } }],
          });
        delivered = JSON.parse(String(init?.body));
        return responseText("Stručná odpověď s ověřeným podkladem.", [item.id]);
      },
    });
    try {
      const token = await f.session();
      const result = await f.send("/api/ai/chat", {
        token,
        requestSeq: 1,
        message: item.question,
        locale: "cs",
      });
      assert.equal(result.status, 200);
      assert.ok(isCrazyTypkaChatResponse(result.body));
      assert.ok(delivered.input.at(-1).content.includes(item.id));
      assert.ok(delivered.input.at(-1).content.includes(item.authority));
      assert.equal(new URL(result.body.sources[0].url).hostname, item.host);
      assert.equal(
        Object.hasOwn(result.body.sources[0], "effectiveFrom"),
        false,
        "internal source metadata must not change the public citation shape",
      );
    } finally {
      await f.service.close();
    }
  }
});

for (const expiry of ["during", "replay"] as const)
  test(`all evidence dependencies expire ${expiry}, including an answer with no public citations`, async () => {
    const cutoff = Date.parse("2026-11-04T00:00:00Z");
    let instant = cutoff - 1000,
      calls = 0;
    const f = fixture({
      now: () => instant,
      fetch: async (url) => {
        calls++;
        if (String(url).endsWith("/moderations"))
          return Response.json({
            results: [{ flagged: false, categories: { harassment: false } }],
          });
        if (expiry === "during") instant = cutoff;
        return responseText("S tímto tématem ti pomůžu.", []);
      },
    });
    try {
      const token = await f.session(),
        body = {
          token,
          requestSeq: 1,
          message: "Kde je 3D tisk?",
          locale: "cs",
        };
      assert.ok(
        getKnowledgeRegistry().retrieve(body.message, 4, instant).length > 0,
      );
      const first = await f.send("/api/ai/chat", body);
      assert.equal(first.status, expiry === "during" ? 409 : 200);
      if (expiry === "replay") assert.deepEqual(first.body.sources, []);
      instant = cutoff;
      const replay = await f.send("/api/ai/chat", body);
      assert.deepEqual(replay.body, {
        error: "response-expired",
        requestSeq: 1,
      });
      assert.deepEqual((await f.send("/api/ai/chat", body)).body, replay.body);
      assert.equal(calls, 3);
      assert.equal(
        getKnowledgeRegistry().isSourceUsable(
          "suz-scenario-2026-2027",
          instant,
        ),
        true,
      );
    } finally {
      await f.service.close();
    }
  });
import {
  createCrazyTypkaService,
  createOptionalCrazyTypkaService,
  attachCrazyTypkaHttpRoute,
  type CrazyTypkaServiceOptions,
} from "../server/crazy-typka";
import {
  isCrazyTypkaResponse,
  isCrazyTypkaSession,
  isCrazyTypkaChatResponse,
  isCrazyTypkaErrorResponse,
} from "../shared/crazy-typka";

const env = {
  CRAZY_TYPKA_ENABLED: "1",
  OPENAI_API_KEY: "private-test-key",
  OPENAI_MODEL: "test-model",
};

test("invalid optional AI configuration leaves a disabled service and cannot break the host", async () => {
  for (const extra of [
    { CRAZY_TYPKA_ALLOWED_ORIGINS: "not a valid origin" },
    { CRAZY_TYPKA_GENERATIONS_PER_PROCESS: "unlimited" },
    { OPENAI_REASONING_EFFORT: "unbounded" },
    { OPENAI_COMPLEX_REASONING_EFFORT: "unbounded" },
    { OPENAI_COMPLEX_REASONING_EFFORT: "none" },
    { OPENAI_COMPLEX_REASONING_EFFORT: "minimal" },
    { CRAZY_TYPKA_DECISIONS_PER_PROCESS: "NaN" },
    { CRAZY_TYPKA_DECISION_TOKEN_BUDGET: "-1" },
    { CRAZY_TYPKA_COMPLEX_GENERATIONS_PER_PROCESS: "1.5" },
    { CRAZY_TYPKA_COMPLEX_THRESHOLD: "" },
    { CRAZY_TYPKA_COMPLEX_THRESHOLD: "NaN" },
    { CRAZY_TYPKA_COMPLEX_THRESHOLD: "1.1" },
  ]) {
    let notices = 0;
    const service = createOptionalCrazyTypkaService(
      {
        env: { ...env, ...extra },
        fetch: async () => {
          throw new Error("must not call provider");
        },
      },
      () => {
        notices++;
        throw new Error("broken logger");
      },
    );
    try {
      const status = response();
      await service.handle(
        request("/api/ai/status", undefined, "GET"),
        status.res,
      );
      assert.equal(notices, 1);
      assert.deepEqual(status.result().body, { enabled: false });
      const issue = response();
      await service.handle(request("/api/ai/session", {}), issue.res);
      assert.equal(issue.result().status, 503);
      assert.deepEqual(issue.result().body, { error: "unavailable" });
    } finally {
      await service.close();
    }
  }
});
function responseText(
  text = "Ahoj! Jsem fiktivní AI průvodkyně.",
  sourceIds: string[] = [],
  usage?: unknown,
) {
  return Response.json({
    status: "completed",
    ...(usage === undefined ? {} : { usage }),
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: JSON.stringify({ text, sourceIds }) },
        ],
      },
    ],
  });
}
function request(
  url: string,
  body?: unknown,
  method = "POST",
  headers: Record<string, string> = {},
  address = "127.0.0.1",
) {
  const bytes =
    body === undefined
      ? []
      : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const req = Readable.from(bytes) as IncomingMessage;
  req.url = url;
  req.method = method;
  req.headers = {
    host: "localhost:1234",
    origin: "http://localhost:1234",
    "content-type": "application/json",
    ...headers,
  };
  Object.defineProperty(req, "socket", { value: { remoteAddress: address } });
  return req;
}
function response() {
  const res = new EventEmitter() as ServerResponse;
  const headers = new Map<string, unknown>();
  let status = 0,
    body: any,
    ended = false;
  Object.defineProperties(res, {
    destroyed: { value: false },
    writableEnded: { get: () => ended },
  });
  res.setHeader = ((key: string, value: unknown) => {
    headers.set(key.toLowerCase(), value);
    return res;
  }) as typeof res.setHeader;
  res.removeHeader = (key: string) => {
    headers.delete(key.toLowerCase());
  };
  res.writeHead = ((value: number) => {
    status = value;
    return res;
  }) as typeof res.writeHead;
  res.end = ((value?: string) => {
    body = value ? JSON.parse(value) : undefined;
    ended = true;
    return res;
  }) as typeof res.end;
  return { res, result: () => ({ status, body, headers }) };
}
function fixture(options: CrazyTypkaServiceOptions = {}) {
  const sequence = new Map<string, number>();
  const decisions: string[] = [];
  const calls: { url: string; body: any; signal: AbortSignal }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
      signal: init!.signal!,
    });
    return String(url).endsWith("/moderations")
      ? Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        })
      : responseText();
  };
  const service = createCrazyTypkaService({
    env,
    fetch: fetcher,
    evidenceBackend: fakeEvidenceBackend(),
    decisionRouter: fakeDecisionRouter(0.1, 0.1, decisions),
    now: () => Date.parse("2026-10-27T12:00:00Z"),
    ...options,
  });
  const send = async (
    url: string,
    body?: unknown,
    method = "POST",
    headers?: Record<string, string>,
    address?: string,
  ) => {
    // Old behavioural scenarios use an acknowledged client sequence; explicit
    // requestSeq in protocol regression cases is never changed by this helper.
    const token =
      typeof body === "object" &&
      body !== null &&
      "token" in body &&
      typeof body.token === "string"
        ? body.token
        : undefined;
    if (
      url === "/api/ai/chat" &&
      token &&
      typeof body === "object" &&
      body !== null &&
      !Object.hasOwn(body, "requestSeq")
    )
      body = { ...body, requestSeq: sequence.get(token) ?? 1 };
    const res = response();
    assert.equal(
      await service.handle(
        request(url, body, method, headers, address),
        res.res,
      ),
      true,
    );
    const result = res.result();
    if (
      token &&
      result.body?.requestSeq === (body as { requestSeq: number })?.requestSeq
    )
      sequence.set(token, result.body.requestSeq + 1);
    return result;
  };
  const session = async () => {
    const result = await send("/api/ai/session", {});
    assert.equal(result.status, 201);
    assert.ok(isCrazyTypkaSession(result.body));
    return result.body.token as string;
  };
  return { service, calls, decisions, send, session };
}

function decisionResponse(
  complexProbability: number,
  localSourcesProbability = 0.1,
  reasoningTokens = 0,
) {
  return Response.json({
    model: "gpt-6-luna",
    answers: [
      {
        type: "predicate",
        name: "complex_reasoning",
        probability: complexProbability,
      },
      {
        type: "predicate",
        name: "local_sources_required",
        probability: localSourcesProbability,
      },
    ],
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 3, cache_write_tokens: 2 },
      output_tokens_details: { reasoning_tokens: reasoningTokens },
    },
  });
}
const safeModeration = () =>
  Response.json({
    results: [{ flagged: false, categories: { harassment: false } }],
  });

for (const complex of [false, true])
  test(`real service adapter selects ${complex ? "complex" : "simple"} Responses parameters after moderation and RAG, with private separate usage and no replay charge`, async () => {
    const events: string[] = [],
      calls: any[] = [];
    const backend = fakeEvidenceBackend(),
      search = backend.search;
    backend.search = (query, options) => {
      events.push("embedding");
      return search(query, options);
    };
    const f = fixture({
      decisionRouter: undefined,
      evidenceBackend: backend,
      env: { ...env, OPENAI_REASONING_EFFORT: "none" },
      fetch: async (url, init) => {
        const body = JSON.parse(String(init?.body));
        const path = String(url).split("/").at(-1)!;
        events.push(path);
        calls.push({ path, body });
        if (path === "moderations") return safeModeration();
        if (path === "decisions")
          return decisionResponse(complex ? 0.95 : 0.1, 0.1, complex ? 3 : 0);
        assert.equal(path, "responses");
        return responseText("Obecné vysvětlení.", [], {
          input_tokens: 50,
          output_tokens: 30,
          total_tokens: 80,
          input_tokens_details: { cached_tokens: 10, cache_write_tokens: 5 },
          output_tokens_details: { reasoning_tokens: complex ? 20 : 0 },
        });
      },
    });
    try {
      const token = await f.session(),
        body = {
          token,
          requestSeq: 1,
          message: "Porovnej dvě obecné možnosti.",
          locale: "cs",
        };
      const answer = await f.send("/api/ai/chat", body);
      assert.equal(answer.status, 200);
      assert.deepEqual(Object.keys(answer.body).sort(), [
        "requestSeq",
        "sources",
        "speaker",
        "text",
      ]);
      assert.deepEqual(events, [
        "moderations",
        "decisions",
        "embedding",
        "responses",
        "moderations",
      ]);
      const routed = calls.find((call) => call.path === "responses").body;
      assert.equal(routed.model, complex ? "gpt-6.1-sol" : env.OPENAI_MODEL);
      assert.deepEqual(routed.reasoning, { effort: complex ? "low" : "none" });
      assert.equal(routed.max_output_tokens, complex ? 4096 : 600);
      assert.equal(calls[1].body.input, calls[0].body.input);
      assert.match(calls[1].body.safety_identifier, /^[a-f0-9]{64}$/);
      assert.equal(calls[1].body.safety_identifier, routed.safety_identifier);
      const usage = f.service.usage(),
        tier = complex ? "complex" : "simple";
      assert.equal(usage.decisions.attempts, 1);
      assert.equal(usage.decisions.confirmedUsageResponses, 1);
      assert.equal(
        usage.decisions.reservedInputBytes,
        Buffer.byteLength(JSON.stringify(calls[1].body)),
      );
      assert.equal(usage.decisions.totalTokens, 15);
      assert.equal(usage.decisions.outputTokens, 5);
      assert.equal(usage.decisions.reasoningTokens, complex ? 3 : 0);
      assert.equal(usage.embeddingAttempts, 1);
      assert.equal(usage.confirmedEmbeddingTokens, 1);
      assert.equal(usage.generationAttempts, 1);
      assert.equal(usage.generations[tier].totalTokens, 80);
      assert.equal(usage.generations[tier].reasoningTokens, complex ? 20 : 0);
      assert.equal(usage.generations[tier].unconfirmedUsageAttempts, 0);
      assert.equal(
        usage.generations[complex ? "simple" : "complex"].attempts,
        0,
      );
      assert.deepEqual(await f.send("/api/ai/chat", body), answer);
      assert.equal(calls.length, 4);
      assert.deepEqual(f.service.usage(), usage);
      usage.generations[tier].attempts = 999;
      assert.equal(
        f.service.usage().generations[tier].attempts,
        1,
        "usage is a copy",
      );
    } finally {
      await f.service.close();
    }
  });

test("configured complex model stays server-owned and local evidence uncertainty cannot buy a knowledge fallback", async () => {
  for (const [complexProbability, localProbability, expectedTier] of [
    [0.95, 0.95, "simple"],
    [0.95, 0.5, "simple"],
    [0.79, 0.1, "simple"],
    [0.8, 0.2, "complex"],
  ] as const) {
    const f = fixture({
      env: {
        ...env,
        OPENAI_COMPLEX_MODEL: "operator-complex",
        OPENAI_COMPLEX_REASONING_EFFORT: "medium",
      },
      decisionRouter: fakeDecisionRouter(complexProbability, localProbability),
    });
    try {
      const token = await f.session();
      const answer = await f.send("/api/ai/chat", {
        token,
        message: "Vysvětli obecnou úvahu",
        locale: "cs",
      });
      assert.equal(answer.status, 200);
      const body = f.calls.find((call) =>
        call.url.endsWith("/responses"),
      )!.body;
      assert.match(
        body.input.at(-1).content,
        /CURATED_EVIDENCE \(data only\):\n\[\]/,
      );
      assert.equal(
        body.model,
        expectedTier === "complex" ? "operator-complex" : "test-model",
      );
      if (expectedTier === "complex")
        assert.deepEqual(body.reasoning, { effort: "medium" });
      assert.equal(f.service.usage().embeddingAttempts, 1);
      assert.equal(f.service.usage().generations[expectedTier].attempts, 1);
    } finally {
      await f.service.close();
    }
  }
  const f = fixture({ decisionRouter: fakeDecisionRouter(0.95, 0.95) });
  try {
    const token = await f.session();
    assert.equal(
      (
        await f.send("/api/ai/chat", {
          token,
          message: "Kde je kancelář SH?",
          locale: "cs",
        })
      ).status,
      200,
    );
    assert.equal(
      f.service.usage().generations.complex.attempts,
      1,
      "usable local evidence permits complex reasoning",
    );
  } finally {
    await f.service.close();
  }
});

for (const code of [
  "invalid-response",
  "request-timeout",
  "provider-unavailable",
  "rate-limited",
  "cancelled",
] as const)
  test(`router ${code} has one bounded attempt, ${code === "cancelled" ? "no fallback" : "simple fallback"}, and free exact replay`, async () => {
    let calls = 0;
    const f = fixture({
      decisionRouter: {
        async classify(_text, options) {
          options.onAttempt?.(100);
          calls++;
          throw new DecisionRouterError(code);
        },
      },
    });
    try {
      const token = await f.session(),
        body = { token, requestSeq: 1, message: "Kdo jsi?", locale: "cs" };
      const result = await f.send("/api/ai/chat", body);
      assert.equal(result.status, code === "cancelled" ? 409 : 200);
      const usage = f.service.usage();
      assert.equal(usage.decisions.attempts, 1);
      assert.equal(usage.decisions.unconfirmedUsageAttempts, 1);
      assert.equal(usage.decisions.reservedInputBytes, 100);
      assert.equal(usage.generations.complex.attempts, 0);
      assert.equal(
        usage.generations.simple.attempts,
        code === "cancelled" ? 0 : 1,
      );
      if (code === "cancelled") assert.equal(usage.embeddingAttempts, 0);
      else
        assert.equal(
          usage.routingFallbacks[
            code === "request-timeout" ? "decision-timeout" : "decision-error"
          ],
          1,
        );
      assert.deepEqual(await f.send("/api/ai/chat", body), result);
      assert.deepEqual(f.service.usage(), usage);
      assert.equal(calls, 1);
    } finally {
      await f.service.close();
    }
  });

test("Decisions attempts, reservation budget and complex caps independently fall back without disabling generation", async () => {
  for (const config of [
    { CRAZY_TYPKA_DECISIONS_PER_PROCESS: "1" },
    { CRAZY_TYPKA_DECISION_TOKEN_BUDGET: "1" },
    { CRAZY_TYPKA_COMPLEX_GENERATIONS_PER_PROCESS: "0" },
  ]) {
    const f = fixture({
      env: { ...env, ...config },
      decisionRouter: fakeDecisionRouter(0.95, 0.1),
    });
    try {
      const token = await f.session();
      for (const message of ["Obecný rozbor", "Další obecný rozbor"])
        assert.equal(
          (await f.send("/api/ai/chat", { token, message, locale: "cs" }))
            .status,
          200,
        );
      const usage = f.service.usage();
      assert.equal(usage.generationAttempts, 2);
      assert.equal(usage.embeddingAttempts, 2);
      assert.equal(
        usage.decisions.attempts,
        config.CRAZY_TYPKA_DECISION_TOKEN_BUDGET
          ? 0
          : config.CRAZY_TYPKA_DECISIONS_PER_PROCESS
            ? 1
            : 2,
      );
      assert.equal(
        usage.generations.complex.attempts,
        config.CRAZY_TYPKA_DECISIONS_PER_PROCESS ? 1 : 0,
      );
      assert.equal(
        usage.routingFallbacks[
          config.CRAZY_TYPKA_COMPLEX_GENERATIONS_PER_PROCESS
            ? "complex-budget"
            : "decision-budget"
        ],
        config.CRAZY_TYPKA_DECISIONS_PER_PROCESS ? 1 : 2,
      );
    } finally {
      await f.service.close();
    }
  }
});

test("concurrent reasoning requests reserve only one final complex slot before HTTP", async () => {
  let arrived = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const router = fakeDecisionRouter(0.99, 0.1);
  const f = fixture({
    limits: { complexGenerationsPerProcess: 1 },
    env: { ...env, CRAZY_TYPKA_COMPLEX_GENERATIONS_PER_PROCESS: "999" },
    decisionRouter: {
      async classify(text, options) {
        const decision = await router.classify(text, options);
        if (++arrived === 2) release();
        await gate;
        return decision;
      },
    },
  });
  try {
    const first = await f.session(),
      second = await f.session();
    const results = await Promise.all(
      [first, second].map((token) =>
        f.send("/api/ai/chat", {
          token,
          message: "Odvoď obecnou odpověď",
          locale: "cs",
        }),
      ),
    );
    assert.deepEqual(
      results.map((result) => result.status),
      [200, 200],
    );
    assert.deepEqual(
      f.calls
        .filter((call) => call.url.endsWith("/responses"))
        .map((call) => call.body.model)
        .sort(),
      ["gpt-6.1-sol", "test-model"],
    );
    assert.equal(f.service.usage().generations.complex.attempts, 1);
    assert.equal(f.service.usage().generations.simple.attempts, 1);
    assert.equal(f.service.usage().routingFallbacks["complex-budget"], 1);
  } finally {
    await f.service.close();
  }
});

test("operator configuration cannot raise the twenty-attempt complex process ceiling", async () => {
  const f = fixture({
    env: { ...env, CRAZY_TYPKA_COMPLEX_GENERATIONS_PER_PROCESS: "999" },
    limits: {
      complexGenerationsPerProcess: 999,
      messagesPerMinutePerSession: 30,
    },
    decisionRouter: fakeDecisionRouter(0.99, 0.1),
  });
  try {
    const token = await f.session();
    for (let index = 0; index < 21; index++)
      assert.equal(
        (
          await f.send("/api/ai/chat", {
            token,
            message: `Obecná úvaha ${index}`,
            locale: "cs",
          })
        ).status,
        200,
      );
    assert.equal(f.service.usage().generations.complex.attempts, 20);
    assert.equal(f.service.usage().generations.simple.attempts, 1);
    assert.equal(f.service.usage().routingFallbacks["complex-budget"], 1);
  } finally {
    await f.service.close();
  }
});

test("router admission refuses HTTP after its cap but keeps the paid attempt and ordinary generation", async () => {
  let routerCalls = 0,
    generationCalls = 0;
  const f = fixture({
    env: { ...env, CRAZY_TYPKA_DECISIONS_PER_PROCESS: "1" },
    decisionRouter: undefined,
    fetch: async (url) => {
      if (String(url).endsWith("/moderations")) return safeModeration();
      if (String(url).endsWith("/decisions")) {
        routerCalls++;
        return decisionResponse(0.99);
      }
      generationCalls++;
      return responseText();
    },
  });
  try {
    const token = await f.session();
    for (const message of ["Obecná úvaha", "Obecná druhá úvaha"])
      assert.equal(
        (await f.send("/api/ai/chat", { token, message, locale: "cs" })).status,
        200,
      );
    assert.equal(routerCalls, 1);
    assert.equal(generationCalls, 2);
    assert.equal(f.service.usage().decisions.attempts, 1);
    assert.equal(f.service.usage().routingFallbacks["decision-budget"], 1);
  } finally {
    await f.service.close();
  }
});

test("session expiry during actual evidence capture stays cancelled before embedding HTTP", async () => {
  let instant = Date.parse("2026-10-27T12:00:00Z"),
    captures = 0,
    embeddingCalls = 0;
  const profile = createEmbeddingProfile();
  const store: Pick<
    RagVectorStore,
    "captureSearch" | "searchSnapshot" | "assertSnapshot" | "close"
  > = {
    async captureSearch() {
      if (++captures === 2) {
        await Promise.resolve();
        instant += 30 * 60000;
      }
      return viewSnapshot();
    },
    async searchSnapshot() {
      throw new Error("cancelled operation cannot query vectors");
    },
    async assertSnapshot() {
      throw new Error("cancelled operation cannot validate evidence");
    },
    async close() {},
  };
  const backend = createRagEvidenceBackend({
    store,
    now: () => instant,
    embedder: createOpenAIEmbedder({
      profile,
      apiKey: "fake-only",
      fetch: async () => {
        embeddingCalls++;
        throw new Error("must not pay for embedding");
      },
    }),
  });
  const f = fixture({ evidenceBackend: backend, now: () => instant });
  try {
    const token = await f.session();
    const result = await f.send("/api/ai/chat", {
      token,
      message: "Obecny dotaz",
      locale: "cs",
    });
    assert.equal(result.status, 409);
    assert.deepEqual(result.body, { error: "cancelled", requestSeq: 1 });
    assert.equal(
      captures,
      2,
      "expiry occurred after readiness and before embedding admission",
    );
    assert.equal(embeddingCalls, 0);
    assert.equal(f.service.usage().embeddingAttempts, 0);
    assert.equal(f.service.usage().generationAttempts, 0);
    assert.deepEqual(
      f.calls.map((call) => call.url),
      ["https://api.openai.com/v1/moderations"],
    );
  } finally {
    await f.service.close();
  }
});

test("cumulative decision byte cap blocks the second individually admissible request before HTTP", async () => {
  const messages = ["Obecna uvaha jedna", "Obecna uvaha druha"];
  assert.equal(Buffer.byteLength(messages[0]), Buffer.byteLength(messages[1]));
  let bytesPerRequest = 0,
    decisionCalls = 0;
  // Derive the full serialized size, including fixed questions and a session hash.
  const probe = createDecisionRouter({
    apiKey: "fake-only",
    fetch: async () => decisionResponse(0.99),
  });
  await probe.classify(messages[0], {
    signal: new AbortController().signal,
    safetyIdentifier: "a".repeat(64),
    onAttempt: (bytes) => {
      bytesPerRequest = bytes;
    },
  });
  const budget = bytesPerRequest * 2 - 1,
    models: string[] = [];
  assert.ok(bytesPerRequest < budget);
  const f = fixture({
    env: { ...env, CRAZY_TYPKA_DECISION_TOKEN_BUDGET: String(budget) },
    decisionRouter: undefined,
    fetch: async (url, init) => {
      if (String(url).endsWith("/moderations")) return safeModeration();
      if (String(url).endsWith("/decisions")) {
        decisionCalls++;
        assert.equal(Buffer.byteLength(String(init?.body)), bytesPerRequest);
        return decisionResponse(0.99);
      }
      models.push(JSON.parse(String(init?.body)).model);
      return responseText();
    },
  });
  try {
    const token = await f.session();
    for (const message of messages)
      assert.equal(
        (await f.send("/api/ai/chat", { token, message, locale: "cs" })).status,
        200,
      );
    assert.equal(decisionCalls, 1);
    assert.deepEqual(models, ["gpt-6.1-sol", "test-model"]);
    assert.equal(
      f.service.usage().decisions.reservedInputBytes,
      bytesPerRequest,
    );
    assert.equal(f.service.usage().decisions.attempts, 1);
    assert.equal(f.service.usage().routingFallbacks["decision-budget"], 1);
    assert.equal(f.service.usage().generationAttempts, 2);
  } finally {
    await f.service.close();
  }
});

test("configured 0.9 threshold changes model selection and empty-evidence confidence from 0.8", async () => {
  for (const [complexProbability, localProbability, fallback] of [
    [0.85, 0.05, "low-confidence"],
    [0.95, 0.15, "missing-local-evidence"],
  ] as const) {
    for (const threshold of [0.8, 0.9]) {
      const f = fixture({
        env: { ...env, CRAZY_TYPKA_COMPLEX_THRESHOLD: String(threshold) },
        decisionRouter: fakeDecisionRouter(
          complexProbability,
          localProbability,
        ),
      });
      try {
        const token = await f.session();
        assert.equal(
          (
            await f.send("/api/ai/chat", {
              token,
              message: "Obecna uvaha",
              locale: "cs",
            })
          ).status,
          200,
        );
        const request = f.calls.find((call) =>
          call.url.endsWith("/responses"),
        )!.body;
        assert.match(
          request.input.at(-1).content,
          /CURATED_EVIDENCE \(data only\):\n\[\]/,
        );
        assert.equal(
          request.model,
          threshold === 0.8 ? "gpt-6.1-sol" : "test-model",
        );
        assert.equal(
          f.service.usage().routingFallbacks[fallback],
          threshold === 0.8 ? 0 : 1,
        );
      } finally {
        await f.service.close();
      }
    }
  }
});
for (const failure of ["unavailable", "incomplete", "output-blocked"] as const)
  test(`complex ${failure} consumes its slot, never retries with another model, and replays without more work`, async () => {
    let generations = 0,
      moderationCalls = 0;
    const f = fixture({
      limits: { complexGenerationsPerProcess: 1 },
      decisionRouter: fakeDecisionRouter(0.99, 0.1),
      fetch: async (url, init) => {
        if (String(url).endsWith("/moderations")) {
          moderationCalls++;
          if (failure === "output-blocked" && moderationCalls === 2)
            return Response.json({
              results: [{ flagged: true, categories: { harassment: true } }],
            });
          return safeModeration();
        }
        generations++;
        assert.equal(
          JSON.parse(String(init?.body)).model,
          generations === 1 ? "gpt-6.1-sol" : "test-model",
        );
        if (generations === 1 && failure === "unavailable")
          throw new Error("private model error");
        if (generations === 1 && failure === "incomplete")
          return Response.json({
            status: "incomplete",
            output: [],
            usage: {
              input_tokens: 10,
              output_tokens: 4096,
              total_tokens: 4106,
            },
          });
        return responseText();
      },
    });
    try {
      const token = await f.session(),
        body = { token, requestSeq: 1, message: "Obecný rozbor", locale: "cs" };
      const result = await f.send("/api/ai/chat", body);
      assert.equal(
        result.body.error,
        failure === "unavailable"
          ? "provider-unavailable"
          : failure === "incomplete"
            ? "invalid-response"
            : "blocked",
      );
      assert.equal(generations, 1);
      const usage = f.service.usage();
      assert.equal(usage.generations.complex.attempts, 1);
      assert.equal(usage.generations.simple.attempts, 0);
      assert.equal(
        usage.generations.complex.unconfirmedUsageAttempts,
        failure === "incomplete" ? 0 : 1,
      );
      if (failure === "incomplete")
        assert.equal(usage.generations.complex.totalTokens, 4106);
      assert.deepEqual(await f.send("/api/ai/chat", body), result);
      assert.deepEqual(f.service.usage(), usage);
      assert.equal(
        (
          await f.send("/api/ai/chat", {
            ...body,
            requestSeq: 2,
            message: "Nová obecná úvaha",
          })
        ).status,
        200,
      );
      assert.equal(generations, 2);
      assert.equal(f.service.usage().routingFallbacks["complex-budget"], 1);
    } finally {
      await f.service.close();
    }
  });

for (const action of [
  "reset",
  "shutdown",
  "disconnect",
  "deadline",
  "expiry",
] as const)
  test(`${action} during Decisions never enters embedding or fallback generation`, async () => {
    let entered!: () => void, complete!: (value: Response) => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let instant = Date.parse("2026-10-27T12:00:00Z"),
      decisionSignal: AbortSignal | undefined;
    const f = fixture({
      decisionRouter: undefined,
      now: () => instant,
      limits: action === "deadline" ? { operationTimeoutMs: 20 } : {},
      fetch: async (url, init) => {
        if (String(url).endsWith("/moderations")) return safeModeration();
        assert.ok(String(url).endsWith("/decisions"));
        decisionSignal = init!.signal!;
        entered();
        return new Promise<Response>((resolve) => {
          complete = resolve;
        });
      },
    });
    const keepAlive = setTimeout(() => {}, 1000);
    try {
      const token = await f.session(),
        res = response();
      const pending = f.service.handle(
        request("/api/ai/chat", {
          token,
          requestSeq: 1,
          message: "Složitá úvaha",
          locale: "cs",
        }),
        res.res,
      );
      await reached;
      if (action === "reset")
        await f.send("/api/ai/session", undefined, "DELETE", {
          authorization: `Bearer ${token}`,
        });
      if (action === "shutdown") await f.service.close();
      if (action === "disconnect") res.res.emit("close");
      if (action === "expiry") {
        instant += 30 * 60000;
        complete(decisionResponse(0.99));
      }
      await pending;
      assert.equal(
        res.result().body.error,
        action === "deadline" ? "request-timeout" : "cancelled",
      );
      assert.equal(f.service.usage().embeddingAttempts, 0);
      assert.equal(f.service.usage().generationAttempts, 0);
      assert.equal(
        Object.values(f.service.usage().routingFallbacks).reduce(
          (a, b) => a + b,
          0,
        ),
        0,
      );
      assert.equal(decisionSignal?.aborted, true);
      complete(decisionResponse(0.99)); // A late response cannot start more work.
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(f.service.usage().generationAttempts, 0);
    } finally {
      clearTimeout(keepAlive);
      await f.service.close();
    }
  });
test("disabled configuration exposes only status and never calls provider", async () => {
  for (const config of [
    {},
    { ...env, CRAZY_TYPKA_ENABLED: "0" },
    { ...env, OPENAI_MODEL: "" },
    { ...env, OPENAI_API_KEY: "" },
  ]) {
    const f = fixture({ env: config });
    assert.deepEqual((await f.send("/api/ai/status", undefined, "GET")).body, {
      enabled: false,
    });
    assert.equal((await f.send("/api/ai/session", {})).status, 503);
    assert.equal(f.calls.length, 0);
    await f.service.close();
  }
});
test("namespace, exact origin, method and preflight never fall through wildcard CORS", async () => {
  const f = fixture();
  assert.equal(
    await f.service.handle(request("/api/weather"), response().res),
    false,
  );
  for (const path of [
    "/api/ai",
    "/api/ai/status?token=bad",
    "/api/ai/unknown",
    "/api/ai/chat/extra",
  ]) {
    const result = await f.send(path, {});
    assert.equal(result.status, 404);
    assert.equal(result.headers.has("access-control-allow-origin"), false);
  }
  const foreign = await f.send("/api/ai/session", {}, "POST", {
    origin: "https://evil.invalid",
  });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.has("access-control-allow-origin"), false);
  assert.equal((await f.send("/api/ai/chat", {}, "GET")).status, 405);
  assert.equal(
    (
      await f.send("/api/ai/session", undefined, "OPTIONS", {
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "authorization",
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await f.send("/api/ai/chat", undefined, "OPTIONS", {
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-unsafe",
      })
    ).status,
    403,
  );
  assert.equal(f.calls.length, 0);
  await f.service.close();
});

test("AI removes permissive CORS headers inherited from an outer HTTP framework", async () => {
  const f = fixture();
  for (const path of ["/api/ai/unknown", "/api/ai/session"]) {
    const reply = response();
    reply.res.setHeader("Access-Control-Allow-Origin", "*");
    reply.res.setHeader("Access-Control-Allow-Credentials", "true");
    reply.res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE");
    reply.res.setHeader("Access-Control-Max-Age", "2592000");
    await f.service.handle(
      request(path, {}, "POST", { origin: "https://evil.invalid" }),
      reply.res,
    );
    for (const header of [
      "access-control-allow-origin",
      "access-control-allow-credentials",
      "access-control-allow-methods",
      "access-control-max-age",
    ])
      assert.equal(reply.result().headers.has(header), false);
  }
  await f.service.close();
});

test("AI dispatch owns preflight before the framework while other routes retain their dispatcher", async () => {
  let forwarded = 0;
  const http = createServer((_req, res) => {
    forwarded++;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ legacy: true }));
  });
  const service = createCrazyTypkaService({ env: {} });
  attachCrazyTypkaHttpRoute(http, service);
  try {
    const foreign = response();
    http.emit(
      "request",
      request("/api/ai/chat", undefined, "OPTIONS", {
        origin: "https://evil.invalid",
        "access-control-request-method": "POST",
      }),
      foreign.res,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(foreign.result().status, 403);
    assert.equal(
      foreign.result().headers.has("access-control-allow-origin"),
      false,
    );
    const allowed = response();
    http.emit(
      "request",
      request("/api/ai/chat", undefined, "OPTIONS", {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      }),
      allowed.res,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(allowed.result().status, 204);
    assert.equal(
      allowed.result().headers.get("access-control-allow-methods"),
      "POST",
    );
    assert.equal(forwarded, 0);
    const health = response();
    http.emit("request", request("/api/health", undefined, "GET"), health.res);
    assert.equal(forwarded, 1);
    assert.deepEqual(health.result().body, { legacy: true });
  } finally {
    await service.close();
    http.removeAllListeners();
  }
});
test("explicit reverse-proxy origin is accepted but forwarded headers are not trusted", async () => {
  const f = fixture({
    env: { ...env, CRAZY_TYPKA_ALLOWED_ORIGINS: "https://game.example" },
  });
  assert.equal(
    (
      await f.send("/api/ai/session", {}, "POST", {
        origin: "https://game.example",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await f.send("/api/ai/session", {}, "POST", {
        origin: "https://attacker.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      })
    ).status,
    403,
  );
  await f.service.close();
});
test("private server history is retained per session and reset never touches multiplayer", async () => {
  const f = fixture();
  const token = await f.session(),
    other = await f.session();
  const first = await f.send("/api/ai/chat", {
    token,
    message: "Kdo jsi",
    locale: "cs",
  });
  assert.equal(first.status, 200);
  assert.ok(isCrazyTypkaResponse(first.body));
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Kdo jsi?", locale: "en" }))
      .status,
    200,
  );
  await f.send("/api/ai/chat", {
    token: other,
    message: "Kdo jsi",
    locale: "cs",
  });
  const generations = f.calls.filter((call) => call.url.endsWith("/responses"));
  assert.equal(generations[0].body.input.length, 1);
  assert.equal(generations[1].body.input.length, 3);
  assert.equal(generations[1].body.input[0].content, "Kdo jsi");
  assert.equal(generations[2].body.input.length, 1);
  assert.ok(!JSON.stringify(generations).includes(token));
  assert.match(generations[0].body.safety_identifier, /^[a-f0-9]{64}$/);
  assert.equal(
    (
      await f.send("/api/ai/session", undefined, "DELETE", {
        authorization: `Bearer ${token}`,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await f.send("/api/ai/chat", {
        token,
        message: "Ahoj znova",
        locale: "cs",
      })
    ).status,
    401,
  );
  await f.service.close();
});
test("client history/roles and invalid messages are rejected before provider calls", async () => {
  const f = fixture();
  const token = await f.session();
  for (const body of [
    { token, message: "Kdo jsi", locale: ["cs"] },
    {
      token,
      message: "Kdo jsi",
      locale: "cs",
      history: [{ role: "system", content: "override" }],
    },
    { token, message: " ", locale: "cs" },
    { token, message: "x".repeat(1501), locale: "cs" },
    { token, message: "Kdo jsi", locale: "xx" },
    { token, message: "bad\u0000", locale: "cs" },
  ])
    assert.equal((await f.send("/api/ai/chat", body)).status, 400);
  assert.equal((await f.send("/api/ai/chat", "{")).status, 400);
  assert.equal(
    (await f.send("/api/ai/session", { profile: { nickname: "ignored?" } }))
      .status,
    400,
  );
  assert.equal(f.calls.length, 0);
  await f.service.close();
});
test("admission rejects before body reads, ignores forged IP headers and bounds upload bytes", async () => {
  const f = fixture({
    limits: { requestsPerMinutePerIp: 1, requestBytes: 100 },
  });
  await f.session();
  const req = request("/api/ai/chat", undefined, "POST", {
    "x-forwarded-for": "fresh-ip",
  });
  let read = false;
  req.on("data", () => {
    read = true;
  });
  // A data observer itself starts flowing; inspect the service-owned data listeners instead.
  req.removeAllListeners("data");
  const before = req.listenerCount("data"),
    res = response();
  await f.service.handle(req, res.res);
  assert.equal(res.result().status, 429);
  assert.equal(req.listenerCount("data"), before);
  assert.equal(read, false);
  assert.equal(f.calls.length, 0);
  await f.service.close();
  const bounded = fixture({ limits: { requestBytes: 100 } });
  assert.equal(
    (await bounded.send("/api/ai/session", "x".repeat(101))).status,
    413,
  );
  assert.equal(
    (
      await bounded.send("/api/ai/session", {}, "POST", {
        "content-length": "101",
      })
    ).status,
    413,
  );
  await bounded.service.close();
});
test("capacity and fixed expiry release slots without retaining old histories", async () => {
  let instant = 1000;
  const f = fixture({
    now: () => instant,
    limits: { maxSessions: 1, sessionTtlMs: 100 },
  });
  const token = await f.session();
  assert.equal((await f.send("/api/ai/session", {})).status, 503);
  instant += 101;
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Kdo jsi", locale: "cs" }))
      .status,
    401,
  );
  await f.session();
  await f.service.close();
});
test("duplicate messages and session rate limits do not trigger extra moderation or generation", async () => {
  const f = fixture({ limits: { messagesPerMinutePerSession: 1 } });
  const token = await f.session();
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Kdo jsi", locale: "cs" }))
      .status,
    200,
  );
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Kdo jsi", locale: "cs" }))
      .status,
    429,
  );
  assert.equal(
    (
      await f.send("/api/ai/chat", {
        token,
        message: "Jiná zpráva",
        locale: "cs",
      })
    ).status,
    429,
  );
  assert.equal(f.calls.length, 3);
  await f.service.close();
});
test("process generation cap is consumed on started attempts, including upstream failure", async () => {
  let calls = 0;
  const f = fixture({
    limits: { generationsPerProcess: 1 },
    fetch: async (url) => {
      calls++;
      if (String(url).endsWith("/moderations"))
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      throw new Error("private-test-key sensitive error");
    },
  });
  const token = await f.session();
  const failed = await f.send("/api/ai/chat", {
    token,
    message: "Kdo jsi",
    locale: "cs",
  });
  assert.equal(failed.status, 502);
  assert.deepEqual(failed.body, {
    error: "provider-unavailable",
    requestSeq: 1,
  });
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Znovu", locale: "cs" }))
      .body.error,
    "budget-exhausted",
  );
  assert.equal(calls, 2);
  await f.service.close();
});
test("one inflight per session and reset abort prevent deleted conversation resurrection", async () => {
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const f = fixture({
    fetch: (async () => {
      entered();
      return new Promise<Response>(() => {});
    }) as typeof fetch,
  });
  const token = await f.session();
  const pending = f.send("/api/ai/chat", {
    token,
    message: "Kdo jsi",
    locale: "cs",
  });
  await started;
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Další", locale: "cs" }))
      .status,
    409,
  );
  assert.equal(
    (
      await f.send("/api/ai/session", undefined, "DELETE", {
        authorization: `Bearer ${token}`,
      })
    ).status,
    204,
  );
  assert.equal((await pending).body.error, "cancelled");
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Nová", locale: "cs" }))
      .status,
    401,
  );
  await f.service.close();
});

test("concurrent input moderation cannot race past the process generation cap", async () => {
  let admitted = 0,
    generationCalls = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = fixture({
    limits: { generationsPerProcess: 1 },
    fetch: async (url) => {
      if (String(url).endsWith("/moderations")) {
        admitted++;
        if (admitted === 2) release();
        if (admitted <= 2) await barrier;
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      }
      generationCalls++;
      return responseText();
    },
  });
  const first = await f.session(),
    second = await f.session();
  const results = await Promise.all([
    f.send("/api/ai/chat", { token: first, message: "Kdo jsi", locale: "cs" }),
    f.send("/api/ai/chat", {
      token: second,
      message: "Jak pomáháš?",
      locale: "cs",
    }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 503]);
  assert.equal(
    results.find((result) => result.status === 503)!.body.error,
    "budget-exhausted",
  );
  assert.equal(generationCalls, 1);
  await f.service.close();
});
test("global admission, disconnect, stalled uploads and shutdown clean their resources", async () => {
  const f = fixture({ limits: { maxActiveRequests: 1, requestTimeoutMs: 10 } });
  const req = new Readable({ read() {} }) as IncomingMessage;
  Object.assign(req, {
    url: "/api/ai/session",
    method: "POST",
    headers: {
      host: "localhost:1234",
      origin: "http://localhost:1234",
      "content-type": "application/json",
    },
  });
  Object.defineProperty(req, "socket", {
    value: { remoteAddress: "127.0.0.1" },
  });
  const res = response(),
    pending = f.service.handle(req, res.res);
  assert.equal((await f.send("/api/ai/session", {})).body.error, "busy");
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await pending;
  } finally {
    clearTimeout(keepAlive);
  }
  assert.equal(res.result().body.error, "request-timeout");
  assert.equal(req.listenerCount("data"), 0);
  assert.equal(res.res.listenerCount("close"), 0);
  await f.session();
  await f.service.close();
  assert.deepEqual((await f.send("/api/ai/status", undefined, "GET")).body, {
    enabled: false,
  });

  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const closing = fixture({
    fetch: (async () => {
      entered();
      return new Promise<Response>(() => {});
    }) as typeof fetch,
  });
  const token = await closing.session(),
    chatRes = response();
  const chat = closing.service.handle(
    request("/api/ai/chat", {
      token,
      requestSeq: 1,
      message: "Kdo jsi",
      locale: "cs",
    }),
    chatRes.res,
  );
  await started;
  chatRes.res.emit("close");
  await chat;
  assert.equal(chatRes.result().body.error, "cancelled");
  const again = closing.send("/api/ai/chat", {
    token,
    requestSeq: 2,
    message: "Další",
    locale: "cs",
  });
  await new Promise((resolve) => setImmediate(resolve));
  await closing.service.close();
  assert.equal((await again).body.error, "cancelled");
});
test("history is bounded to six turns, and source links come only from curated metadata", async () => {
  let instant = Date.parse("2026-10-27T12:00:00Z");
  const generationBodies: any[] = [];
  const f = fixture({
    now: () => instant,
    fetch: async (url, init) => {
      if (String(url).endsWith("/moderations"))
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      generationBodies.push(JSON.parse(String(init?.body)));
      return responseText("Kancelář je na bloku 1.", ["sh-office"]);
    },
  });
  const token = await f.session();
  for (let i = 0; i < 8; i++) {
    const result = await f.send("/api/ai/chat", {
      token,
      message: `Kancelář SH dotaz ${i}`,
      locale: "cs",
    });
    assert.equal(result.status, 200);
    assert.ok(isCrazyTypkaResponse(result.body));
    assert.equal(
      result.body.sources[0].url,
      "https://www.siliconhill.cz/pages/clenstvi",
    );
    instant += 61000;
  }
  assert.equal(generationBodies[7].input.length, 13);
  assert.equal(generationBodies[7].input[0].content, "Kancelář SH dotaz 1");
  await f.service.close();
});

test("first whole greeting is local and replayable, later greetings and greeting questions use the provider", async () => {
  let instant = Date.parse("2026-10-27T12:00:00Z");
  const f = fixture({ now: () => instant });
  const token = await f.session(),
    first = { token, requestSeq: 1, message: " Ahoj! ", locale: "cs" };
  const local = await f.send("/api/ai/chat", first);
  assert.equal(local.status, 200);
  assert.ok(isCrazyTypkaChatResponse(local.body));
  assert.match(local.body.text, /fiktivní AI/);
  assert.deepEqual(local.body.sources, []);
  assert.equal(f.calls.length, 0);
  assert.equal(f.decisions.length, 0);
  assert.deepEqual(
    (await f.send("/api/ai/chat", { ...first, message: "Ahoj!" })).body,
    local.body,
  );
  assert.equal(f.calls.length, 0);
  instant += 11000;
  assert.equal(
    (await f.send("/api/ai/chat", { ...first, requestSeq: 2 })).status,
    200,
  );
  assert.equal(f.calls.length, 3);
  const generation = f.calls.find((call) => call.url.endsWith("/responses"))!;
  assert.equal(generation.body.input.length, 3);
  const other = await f.session();
  await f.send("/api/ai/chat", {
    token: other,
    requestSeq: 1,
    message: "Ahoj, jak se přidám do klubu?",
    locale: "cs",
  });
  assert.equal(f.calls.length, 6);
  const english = await f.session();
  const hello = await f.send("/api/ai/chat", {
    token: english,
    requestSeq: 1,
    message: "Hello!",
    locale: "en",
  });
  assert.match(hello.body.text, /fictional AI/);
  assert.equal(f.calls.length, 6);
  assert.equal(f.decisions.length, 2);
  await f.service.close();
});

test("last successful operation replays exactly without charging, appending history or bypassing ingress", async () => {
  const f = fixture({ limits: { generationsPerProcess: 1 } }),
    token = await f.session();
  const question = { token, requestSeq: 1, message: "Kdo jsi?", locale: "cs" };
  const first = await f.send("/api/ai/chat", question),
    replay = await f.send("/api/ai/chat", question);
  assert.equal(first.status, 200);
  assert.deepEqual(replay.body, first.body);
  assert.equal(f.calls.length, 3);
  assert.equal(f.decisions.length, 1);
  assert.ok(isCrazyTypkaChatResponse(first.body));
  assert.equal(
    (
      await f.send("/api/ai/chat", {
        ...question,
        requestSeq: 2,
        message: "Další otázka",
      })
    ).body.error,
    "budget-exhausted",
  );
  const newToken = await f.session();
  assert.equal(
    (
      await f.send("/api/ai/chat", {
        token: newToken,
        requestSeq: 1,
        message: "Ahoj",
        locale: "cs",
      })
    ).status,
    200,
  );
  assert.equal(f.calls.length, 3);
  await f.service.close();

  const limited = fixture({ limits: { requestsPerMinutePerIp: 2 } }),
    limitedToken = await limited.session();
  const local = {
    token: limitedToken,
    requestSeq: 1,
    message: "Ahoj",
    locale: "cs",
  };
  await limited.send("/api/ai/chat", local);
  const rejected = await limited.send("/api/ai/chat", local);
  assert.equal(rejected.status, 429);
  assert.equal(rejected.body.requestSeq, undefined);
  assert.equal(limited.calls.length, 0);
  assert.equal(limited.decisions.length, 0);
  await limited.service.close();
});

test("operator environment cap limits paid generations without a direct limits override", async () => {
  const f = fixture({
    env: { ...env, CRAZY_TYPKA_GENERATIONS_PER_PROCESS: "1" },
  });
  try {
    const token = await f.session();
    assert.equal(
      (
        await f.send("/api/ai/chat", {
          token,
          message: "Kdo jsi?",
          locale: "cs",
        })
      ).status,
      200,
    );
    const capped = await f.send("/api/ai/chat", {
      token,
      message: "Další otázka",
      locale: "cs",
    });
    assert.equal(capped.status, 503);
    assert.equal(capped.body.error, "budget-exhausted");
    assert.equal(
      f.calls.filter((call) => call.url.endsWith("/responses")).length,
      1,
    );
  } finally {
    await f.service.close();
  }
});

test("sequence rejects invalid, changed, stale or skipped operations without confirming or generating", async () => {
  const f = fixture(),
    token = await f.session();
  const first = { token, requestSeq: 1, message: "Kdo jsi?", locale: "cs" };
  for (const requestSeq of [
    undefined,
    null,
    "1",
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const invalid = await f.send("/api/ai/chat", { ...first, requestSeq });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.requestSeq, undefined);
  }
  await f.send("/api/ai/chat", first);
  for (const changed of [
    { ...first, message: "kdo jsi?" },
    { ...first, locale: "en" },
  ]) {
    const conflict = await f.send("/api/ai/chat", changed);
    assert.deepEqual(conflict.body, { error: "request-conflict" });
  }
  assert.deepEqual(
    (await f.send("/api/ai/chat", { ...first, requestSeq: 3 })).body,
    { error: "request-out-of-order" },
  );
  assert.equal(f.calls.length, 3);
  await f.send("/api/ai/chat", {
    ...first,
    requestSeq: 2,
    message: "Jak pomáháš?",
  });
  assert.deepEqual((await f.send("/api/ai/chat", first)).body, {
    error: "request-out-of-order",
  });
  assert.equal(f.calls.length, 6);
  const secondBody = f.calls.filter((call) =>
    call.url.endsWith("/responses"),
  )[1].body;
  assert.equal(secondBody.input.length, 3);
  await f.service.close();
});

test("concurrent same operation is busy without acknowledgement, then replays one result", async () => {
  let release!: () => void,
    entered!: () => void,
    calls = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const f = fixture({
    fetch: async (url) => {
      calls++;
      if (calls === 1) {
        entered();
        await gate;
      }
      return String(url).endsWith("/moderations")
        ? Response.json({
            results: [{ flagged: false, categories: { harassment: false } }],
          })
        : responseText();
    },
  });
  const token = await f.session(),
    body = { token, requestSeq: 1, message: "Kdo jsi?", locale: "cs" };
  const pending = f.send("/api/ai/chat", body);
  await started;
  assert.deepEqual((await f.send("/api/ai/chat", body)).body, {
    error: "busy",
  });
  assert.deepEqual(
    (await f.send("/api/ai/chat", { ...body, message: "Jiná" })).body,
    { error: "request-conflict" },
  );
  release();
  const first = await pending;
  assert.deepEqual((await f.send("/api/ai/chat", body)).body, first.body);
  assert.equal(calls, 3);
  await f.service.close();
});

test("terminal upstream and moderation errors replay without API and cannot re-enable the first greeting shortcut", async () => {
  for (const failStage of [1, 2, 3]) {
    let calls = 0;
    const f = fixture({
      fetch: async (url) => {
        calls++;
        if (calls === failStage) throw new Error("private upstream failure");
        return String(url).endsWith("/moderations")
          ? Response.json({
              results: [{ flagged: false, categories: { harassment: false } }],
            })
          : responseText();
      },
    });
    const token = await f.session(),
      body = { token, requestSeq: 1, message: "Kdo jsi?", locale: "cs" };
    const first = await f.send("/api/ai/chat", body);
    assert.equal(first.body.requestSeq, 1);
    assert.ok(isCrazyTypkaErrorResponse(first.body));
    assert.deepEqual((await f.send("/api/ai/chat", body)).body, first.body);
    assert.equal(calls, failStage);
    await f.send("/api/ai/chat", { ...body, requestSeq: 2, message: "Ahoj" });
    assert.equal(calls, failStage + 3);
    await f.service.close();
  }
});

test("accepted generation timeout is cached and explicit replay cannot start a second paid attempt", async () => {
  let calls = 0;
  const f = fixture({
    limits: { providerTimeoutMs: 10 },
    fetch: (async (url) => {
      calls++;
      if (String(url).endsWith("/moderations"))
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      return new Promise<Response>(() => {});
    }) as typeof fetch,
  });
  const token = await f.session(),
    body = { token, requestSeq: 1, message: "Kdo jsi?", locale: "cs" };
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const first = await f.send("/api/ai/chat", body);
    assert.deepEqual(first.body, { error: "request-timeout", requestSeq: 1 });
    assert.deepEqual((await f.send("/api/ai/chat", body)).body, first.body);
    assert.equal(calls, 2);
  } finally {
    clearTimeout(keepAlive);
    await f.service.close();
  }
});

test("a moderation block is a confirmed replayable attempt and does not leave a first-greeting bypass", async () => {
  let calls = 0;
  const f = fixture({
    fetch: async (url) => {
      calls++;
      if (calls === 1)
        return Response.json({
          results: [{ flagged: true, categories: { harassment: true } }],
        });
      return String(url).endsWith("/moderations")
        ? Response.json({
            results: [{ flagged: false, categories: { harassment: false } }],
          })
        : responseText();
    },
  });
  const token = await f.session(),
    body = { token, requestSeq: 1, message: "Moderovaný vstup", locale: "cs" };
  const blocked = await f.send("/api/ai/chat", body);
  assert.deepEqual(blocked.body, { error: "blocked", requestSeq: 1 });
  assert.deepEqual((await f.send("/api/ai/chat", body)).body, blocked.body);
  assert.equal(calls, 1);
  assert.equal(
    (await f.send("/api/ai/chat", { ...body, requestSeq: 2, message: "Ahoj" }))
      .status,
    200,
  );
  assert.equal(calls, 4);
  await f.service.close();
});

test("evidence expiring during generation is never published and the rejection replays without another call", async () => {
  const cutoff = Date.parse("2026-11-03T00:00:00Z");
  let instant = cutoff - 1000,
    calls = 0;
  const f = fixture({
    now: () => instant,
    fetch: async (url) => {
      calls++;
      if (String(url).endsWith("/moderations"))
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      instant = cutoff;
      return responseText("Kancelář je na bloku 1.", ["sh-office"]);
    },
  });
  try {
    const token = await f.session(),
      body = { token, requestSeq: 1, message: "Kancelář SH", locale: "cs" };
    const expired = await f.send("/api/ai/chat", body);
    assert.equal(expired.status, 409);
    assert.deepEqual(expired.body, {
      error: "response-expired",
      requestSeq: 1,
    });
    assert.deepEqual((await f.send("/api/ai/chat", body)).body, expired.body);
    assert.equal(calls, 3);
  } finally {
    await f.service.close();
  }
});

test("reset and expiry forget operations; cited replay loses freshness without regenerating", async () => {
  const cutoff = Date.parse("2026-11-03T00:00:00Z");
  let instant = cutoff - 1000,
    calls = 0;
  const f = fixture({
    now: () => instant,
    fetch: async (url) => {
      calls++;
      return String(url).endsWith("/moderations")
        ? Response.json({
            results: [{ flagged: false, categories: { harassment: false } }],
          })
        : responseText("Kancelář je na bloku 1.", ["sh-office"]);
    },
  });
  const token = await f.session(),
    body = { token, requestSeq: 1, message: "Kancelář SH", locale: "cs" };
  assert.equal((await f.send("/api/ai/chat", body)).status, 200);
  instant = cutoff;
  const expired = await f.send("/api/ai/chat", body);
  assert.deepEqual(expired.body, { error: "response-expired", requestSeq: 1 });
  assert.deepEqual((await f.send("/api/ai/chat", body)).body, expired.body);
  assert.equal(calls, 3);
  await f.send("/api/ai/session", undefined, "DELETE", {
    authorization: `Bearer ${token}`,
  });
  assert.equal(
    (await f.send("/api/ai/chat", body)).body.error,
    "session-expired",
  );
  const fresh = await f.session();
  assert.equal(
    (
      await f.send("/api/ai/chat", {
        token: fresh,
        requestSeq: 1,
        message: "Ahoj",
        locale: "cs",
      })
    ).status,
    200,
  );
  instant += 30 * 60000;
  assert.equal(
    (
      await f.send("/api/ai/chat", {
        token: fresh,
        requestSeq: 1,
        message: "Ahoj",
        locale: "cs",
      })
    ).body.error,
    "session-expired",
  );
  assert.equal(calls, 3);
  await f.service.close();
});

test("server retrieval context includes accepted USER attempts only and respects a failed newer topic boundary", async () => {
  const generations: any[] = [];
  let failNext = false;
  const f = fixture({
    fetch: async (url, init) => {
      if (String(url).endsWith("/moderations"))
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      const body = JSON.parse(String(init?.body));
      generations.push(body);
      if (failNext) {
        failNext = false;
        throw new Error("upstream");
      }
      return responseText("Fiktivní zmínka o routeru, která nesmí být kotvou.");
    },
  });
  const token = await f.session();
  const send = (requestSeq: number, message: string) =>
    f.send("/api/ai/chat", { token, requestSeq, message, locale: "cs" });
  await send(1, "Kde najdu posilovnu?");
  await send(2, "A kolik to stojí?");
  await send(3, "Kde to najdu?");
  for (const body of generations.slice(1)) {
    const content = body.input.at(-1).content;
    assert.match(content, /sh-sport/);
    assert.ok(!content.includes("sh-membership-fees"));
    assert.ok(!content.includes("sh-network"));
  }
  failNext = true;
  await send(4, "Co víš o Bitcoinu?");
  await send(5, "A kolik to stojí?");
  assert.match(
    generations.at(-1).input.at(-1).content,
    /CURATED_EVIDENCE \(data only\):\n\[\]/,
  );
  assert.equal(
    generations.at(-1).input.length,
    1,
    "generation must not retain the old successful topic after a newer failed question",
  );
  assert.doesNotMatch(
    JSON.stringify(generations.at(-1).input),
    /posilovnu|Fiktivní zmínka|Bitcoinu/,
    "neither stale dialogue nor the failed full text is resent",
  );
  await f.service.close();
});
