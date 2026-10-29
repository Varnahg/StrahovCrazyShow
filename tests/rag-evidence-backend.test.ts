import assert from "node:assert/strict";
import test from "node:test";
import {
  createRagEvidenceBackend,
  createConfiguredEvidenceBackend,
  prepareEvidenceQuery,
  RagEvidenceError,
  isEvidenceCurrent,
} from "../server/rag-evidence-backend";
import {
  createEmbeddingProfile,
  type Embedder,
} from "../server/rag-embeddings";
import type {
  RagSearchSnapshot,
  RagSearchHit,
  RagVectorStore,
} from "../server/rag-vector-store";
import { getKnowledgeRegistry } from "../server/crazy-typka-retrieval";
import {
  isCrazyTypkaSource,
  mergeCrazyTypkaSources,
  type ExtractedCrazyTypkaSource,
} from "../shared/crazy-typka";
import type { ResolvedKnowledgeChunkV3 } from "../server/rag-knowledge-types";
import {
  CRAZY_TYPKA_EVIDENCE_BYTES,
  crazyTypkaEvidencePayload,
} from "../server/crazy-typka-provider";

const profile = createEmbeddingProfile();
const snapshot: RagSearchSnapshot = {
  id: "a".repeat(64),
  scope: { kind: "current" },
  heads: {
    legacy: { name: "public", revisionId: "a".repeat(64), profile },
    documents: null,
    archive: null,
  },
  embeddingSpace: {
    provider: profile.provider,
    model: profile.model,
    dimensions: profile.dimensions,
  },
};
const vector = Array.from({ length: profile.dimensions }, (_, i) =>
  i ? 0 : 1,
);
const chunk = getKnowledgeRegistry().chunks.find(
  (chunk) => chunk.id === "suz-report-maintenance",
)!;
const hit: RagSearchHit = {
  chunk,
  dependency: { head: "public", sourceVersionId: "b".repeat(64) },
  distance: 0.15,
};
const instant = Date.parse("2026-10-28T12:00:00Z");
function fixture(
  overrides: {
    store?: Partial<
      Pick<
        RagVectorStore,
        "captureSearch" | "searchSnapshot" | "assertSnapshot" | "close"
      >
    >;
    embedder?: Partial<Embedder>;
    maxDistance?: number;
    timeoutMs?: number;
    now?: () => number;
  } = {},
) {
  const events: string[] = [];
  let filters: unknown,
    queryVector: unknown,
    closed = 0;
  const inputs: string[][] = [];
  const store: Pick<
    RagVectorStore,
    "captureSearch" | "searchSnapshot" | "assertSnapshot" | "close"
  > = {
    async captureSearch() {
      events.push("capture");
      return snapshot;
    },
    async searchSnapshot(_snapshot, value, where) {
      events.push("sql-search");
      queryVector = value;
      filters = where;
      return [hit];
    },
    async assertSnapshot() {
      events.push("validate");
      return true;
    },
    async close() {
      closed++;
    },
    ...overrides.store,
  };
  const embedder: Embedder = {
    profile,
    async embed(values, options) {
      options.onAttempt?.(Buffer.byteLength(values.join("")));
      events.push("embed");
      inputs.push([...values]);
      return { vectors: [vector], usage: { promptTokens: 5, totalTokens: 5 } };
    },
    ...overrides.embedder,
  };
  const backend = createRagEvidenceBackend({
    store,
    embedder,
    maxDistance: overrides.maxDistance,
    timeoutMs: overrides.timeoutMs,
    now: overrides.now,
  });
  const search = (message = "Na mém pokoji protéká voda") =>
    backend.search(prepareEvidenceQuery(message), {
      signal: new AbortController().signal,
      now: instant,
      user: "hash-only",
      onEmbeddingAttempt() {
        events.push("charge");
      },
    });
  return {
    backend,
    search,
    events,
    inputs,
    filters: () => filters,
    vector: () => queryVector,
    closed: () => closed,
  };
}

test("prepared query is byte-bounded and only narrow follow-up includes the supplied successful user question", () => {
  assert.deepEqual(prepareEvidenceQuery("Nové téma?", "Předchozí dotaz"), {
    text: "Nové téma?",
    filterText: "Nové téma?",
  });
  const query = prepareEvidenceQuery("A kolik to stojí?", "Kde je Fotokomora?");
  assert.match(
    query.text,
    /Previous successful user question:\nKde je Fotokomora/,
  );
  assert.ok(query.text.endsWith("A kolik to stojí?"));
  const bounded = prepareEvidenceQuery("A kolik?", "🪴".repeat(3000));
  assert.ok(Buffer.byteLength(bounded.text) <= 8191);
  assert.ok(!bounded.filterText.endsWith("\ud83e"));
  assert.throws(() => prepareEvidenceQuery("x".repeat(8192)), RagEvidenceError);
});

test("runtime search never derives SQL metadata restrictions from institutions or mixed services in a question", async () => {
  const f = fixture();
  try {
    for (const question of [
      "Kde je Fotokomora a kancelář SÚZ?",
      "Kde je Fotokomora a kancelář SH?",
      "Doklady SÚZ",
      "Členství Silicon Hill",
      "Rozdíl SH a SÚZ",
      "Porovnej 3D tisk a posilovnu",
      "Kde je Fotokomora a menza?",
      "Porovnej 3D tisk a SHernu",
      "Does Silicon Hill membership pay my dorm rent?",
      "A dorm room near Fotokomora",
      "Na mém pokoji je havárie",
    ]) {
      const result = await f.search(question);
      assert.deepEqual(f.filters(), { limit: 4, now: instant }, question);
      assert.equal(f.vector(), vector);
      assert.deepEqual(
        result.chunks,
        [hit.chunk],
        "runtime must keep eligible SQL hits without an NLP authority filter",
      );
      assert.equal(f.inputs.at(-1)?.[0], question);
    }
  } finally {
    await f.backend.close();
  }
});

test("search uses the query vector and actual store hits without a lexical candidate list", async () => {
  const f = fixture();
  try {
    const result = await f.search();
    assert.deepEqual(f.events, [
      "capture",
      "charge",
      "embed",
      "sql-search",
      "validate",
    ]);
    assert.equal(f.vector(), vector);
    assert.deepEqual(f.filters(), { limit: 4, now: instant });
    assert.deepEqual(
      result.chunks.map((chunk) => chunk.id),
      ["suz-report-maintenance"],
    );
    assert.deepEqual(result.dependencies, [
      { head: "public", sourceVersionId: "b".repeat(64) },
    ]);
    assert.equal(result.embeddingUsage.totalTokens, 5);
    await f.backend.validate(result, instant, new AbortController().signal);
    assert.equal(f.inputs.length, 1, "validation cannot embed again");
  } finally {
    await f.backend.close();
  }
});

test("missing or mismatched active profile cannot spend an embedding call", async () => {
  for (const active of [
    null,
    {
      ...snapshot,
      embeddingSpace: { ...snapshot.embeddingSpace, dimensions: 768 },
    },
    {
      ...snapshot,
      embeddingSpace: { ...snapshot.embeddingSpace, model: "other-model" },
    },
  ]) {
    const f = fixture({
      store: {
        async captureSearch() {
          return active;
        },
      },
    });
    try {
      assert.equal(await f.backend.ready(), false);
      await assert.rejects(
        f.search(),
        (error: any) => error.code === "provider-unavailable",
      );
      assert.equal(f.inputs.length, 0);
    } finally {
      await f.backend.close();
    }
  }
  assert.throws(
    () => createConfiguredEvidenceBackend({ OPENAI_API_KEY: "fake" }),
    RagEvidenceError,
  );
});

test("default relevance cutoff accepts its boundary and rejects unrelated nearest neighbours", async () => {
  for (const distance of [0.6, 0.6001, 0.85]) {
    const f = fixture({
      store: {
        async searchSnapshot() {
          return [{ ...hit, distance }];
        },
      },
    });
    try {
      assert.equal((await f.search()).chunks.length, distance <= 0.6 ? 1 : 0);
    } finally {
      await f.backend.close();
    }
  }
});

test("low similarity is an empty successful search; DB failure and stale revision stay distinct", async () => {
  const f = fixture({ maxDistance: 0.1 });
  try {
    assert.deepEqual((await f.search()).chunks, []);
  } finally {
    await f.backend.close();
  }
  const broken = fixture({
    store: {
      async searchSnapshot() {
        throw new Error("postgres://private-secret connection failure");
      },
    },
  });
  try {
    await assert.rejects(
      broken.search(),
      (error: any) => error.message === "provider-unavailable",
    );
  } finally {
    await broken.backend.close();
  }
  const stale = fixture({
    store: {
      async assertSnapshot() {
        return false;
      },
    },
  });
  try {
    await assert.rejects(
      stale.search(),
      (error: any) => error.code === "response-expired",
    );
  } finally {
    await stale.backend.close();
  }
});

test("readiness requests coalesce without query embedding and expire their short cache", async () => {
  let time = 1000,
    captures = 0;
  const f = fixture({
    now: () => time,
    store: {
      async captureSearch() {
        captures++;
        return snapshot;
      },
    },
  });
  try {
    assert.deepEqual(
      await Promise.all([
        f.backend.ready(),
        f.backend.ready(),
        f.backend.ready(),
      ]),
      [true, true, true],
    );
    assert.equal(captures, 1);
    assert.equal(f.inputs.length, 0);
    time += 2001;
    assert.equal(await f.backend.ready(), true);
    assert.equal(captures, 2);
  } finally {
    await f.backend.close();
  }
});

test("abort, deadline and shutdown retire pending backend work and never pay after a late capture", async () => {
  let finish!: (value: RagSearchSnapshot) => void;
  const f = fixture({
    store: {
      captureSearch: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  });
  const controller = new AbortController();
  const work = f.backend.search(prepareEvidenceQuery("Dotaz"), {
    signal: controller.signal,
    now: instant,
    user: "fake",
    onEmbeddingAttempt() {
      assert.fail("late charge");
    },
  });
  controller.abort();
  await assert.rejects(work, (error: any) => error.code === "cancelled");
  finish(snapshot);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.inputs.length, 0);
  await Promise.all([f.backend.close(), f.backend.close()]);
  assert.equal(f.closed(), 1);
  const timeout = fixture({
    timeoutMs: 5,
    store: { captureSearch: () => new Promise(() => {}) },
  });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      timeout.search(),
      (error: any) => error.code === "request-timeout",
    );
  } finally {
    clearTimeout(keepAlive);
    await timeout.backend.close();
  }
});

test("combined view shares one embedding across compatible v1 and v2 document profiles", async () => {
  const documents = createEmbeddingProfile({
    inputVersion: "title-heading-text-v2",
  });
  const f = fixture({
    store: {
      async captureSearch() {
        return {
          ...snapshot,
          heads: {
            ...snapshot.heads,
            documents: {
              name: "public-documents",
              revisionId: "d".repeat(64),
              profile: documents,
            },
          },
        };
      },
    },
  });
  try {
    assert.equal(await f.backend.ready(), true);
    assert.equal((await f.search()).chunks.length, 1);
    assert.equal(f.inputs.length, 1);
    assert.notEqual(profile.id, documents.id);
  } finally {
    await f.backend.close();
  }
});

test("absent archive spends no embedding and its later creation invalidates the empty snapshot", async () => {
  let archive: RagSearchSnapshot | null = null;
  const scope = { kind: "archive" as const, asOf: "2020-06-01T00:00:00.000Z" };
  const f = fixture({
    store: {
      async captureSearch(requested) {
        return requested.kind === "archive" ? archive : snapshot;
      },
    },
  });
  try {
    assert.equal(await f.backend.ready(), true);
    const evidence = await f.backend.search(
      prepareEvidenceQuery("Starší podmínky"),
      {
        scope,
        signal: new AbortController().signal,
        now: instant,
        user: "fake",
        onEmbeddingAttempt() {
          assert.fail("no archive must not embed");
        },
      },
    );
    assert.equal(evidence.snapshot, null);
    assert.deepEqual(evidence.scope, scope);
    assert.deepEqual(evidence.chunks, []);
    assert.equal(f.inputs.length, 0);
    assert.equal(
      await f.backend.validate(evidence, instant, new AbortController().signal),
      true,
    );
    archive = {
      ...snapshot,
      scope,
      heads: {
        legacy: null,
        documents: null,
        archive: {
          name: "public-archive",
          revisionId: "e".repeat(64),
          profile,
        },
      },
    };
    assert.equal(
      await f.backend.validate(evidence, instant, new AbortController().signal),
      false,
    );
  } finally {
    await f.backend.close();
  }
});

test("evidence admission counts UTF-8 metadata and keeps whole chunks under one total cap", async () => {
  const large = {
    ...chunk,
    id: "large",
    text: "🪴".repeat(800),
    sourceLocator: "ě".repeat(500),
    versionNote: "ž".repeat(1500),
    document: {
      ...chunk.document,
      title: "Č".repeat(200),
      authorityLevel: "š".repeat(300),
    },
  };
  const candidates = Array.from({ length: 4 }, (_, index) => ({
    ...hit,
    chunk: { ...large, id: `large-${index}` },
  }));
  const f = fixture({
    store: {
      async searchSnapshot() {
        return candidates;
      },
    },
  });
  try {
    const evidence = await f.search();
    assert.ok(evidence.chunks.length > 0 && evidence.chunks.length < 4);
    assert.ok(
      Buffer.byteLength(
        JSON.stringify(crazyTypkaEvidencePayload(evidence.chunks)),
      ) <= CRAZY_TYPKA_EVIDENCE_BYTES,
    );
    assert.ok(evidence.chunks.every((item) => item.text === large.text));
    assert.equal(isEvidenceCurrent(evidence, instant), true);
  } finally {
    await f.backend.close();
  }
});

test("evidence admission enforces merged locator count and UTF-8 bytes before generation", async () => {
  for (const scenario of ["count", "bytes", "overlap"] as const) {
    const version = "b".repeat(64),
      id = "suz-citation-budget";
    const candidates: RagSearchHit[] = [0, 1].map((index) => {
      const locators = Array.from(
        { length: scenario === "bytes" ? 2 : 5 },
        (_, i) => ({
          page: 1,
          text:
            scenario === "bytes"
              ? "ě".repeat(600) + `${index}-${i}`
              : `PDF strana 1, část ${scenario === "overlap" ? i : index * 5 + i}`,
        }),
      );
      const source: ExtractedCrazyTypkaSource = {
        ...chunk.source,
        id: version,
        url: "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty",
        adaptation: "document-extraction",
        publisher: "suz",
        sourceId: id,
        sourceVersionId: version,
        status: "current",
        effectiveFrom: null,
        effectiveUntil: null,
        extractionMethod: "native",
        documentFormat: "pdf",
        pageCount: 1,
        locators,
      };
      assert.equal(isCrazyTypkaSource(source), true);
      const resolved: ResolvedKnowledgeChunkV3 = {
        ...chunk,
        schemaVersion: 3,
        id: `v3-${index}`,
        localChunkId: `c-${index}`,
        source,
        topic: null,
        headingPath: [],
        spans: [],
        document: {
          ...chunk.document,
          schemaVersion: 3,
          id,
          sourceVersionId: version,
          url: source.url,
          archiveReason: null,
          extraction: {
            inputSha256: "a".repeat(64),
            normalizedSha256: "c".repeat(64),
            parserProfileId: "fixture",
            parserProfileSha256: "d".repeat(64),
            format: "pdf",
            method: "native",
            complete: true,
            pageCount: 1,
          },
        },
      };
      return {
        chunk: resolved,
        dependency: { head: "public-documents", sourceVersionId: version },
        distance: 0.1 + index * 0.1,
      };
    });
    const f = fixture({
      store: {
        async searchSnapshot() {
          return candidates;
        },
      },
    });
    try {
      const evidence = await f.search();
      assert.equal(evidence.chunks.length, scenario === "overlap" ? 2 : 1);
      const merged = mergeCrazyTypkaSources(
        evidence.chunks.map((item) => item.source),
      );
      assert.ok(merged && merged.every(isCrazyTypkaSource));
      assert.equal(evidence.chunks[0].text, candidates[0].chunk.text);
    } finally {
      await f.backend.close();
    }
  }
});
