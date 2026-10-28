import assert from "node:assert/strict";
import test from "node:test";
import {
  createRagEvidenceBackend,
  createConfiguredEvidenceBackend,
  prepareEvidenceQuery,
  explicitEvidenceFilters,
  RagEvidenceError,
} from "../server/rag-evidence-backend";
import {
  createEmbeddingProfile,
  type Embedder,
} from "../server/rag-embeddings";
import type {
  RagSnapshot,
  VectorHit,
  VectorKnowledgeStore,
} from "../server/rag-vector-store";
import { getKnowledgeRegistry } from "../server/crazy-typka-retrieval";

const profile = createEmbeddingProfile();
const snapshot: RagSnapshot = { revisionId: "a".repeat(64), profile };
const vector = Array.from({ length: profile.dimensions }, (_, i) =>
  i ? 0 : 1,
);
const chunk = getKnowledgeRegistry().chunks.find(
  (chunk) => chunk.id === "suz-report-maintenance",
)!;
const hit: VectorHit = {
  chunk,
  sourceVersionId: "b".repeat(64),
  distance: 0.15,
};
const instant = Date.parse("2026-10-28T12:00:00Z");
function fixture(
  overrides: {
    store?: Partial<VectorKnowledgeStore>;
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
  const store: VectorKnowledgeStore = {
    async captureActive() {
      events.push("capture");
      return snapshot;
    },
    async search(_snapshot, value, where) {
      events.push("sql-search");
      queryVector = value;
      filters = where;
      return [hit];
    },
    async assertCurrent() {
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

test("metadata filters identify only explicit institutions or named services, never broad room vocabulary", () => {
  assert.deepEqual(
    explicitEvidenceFilters(prepareEvidenceQuery("Na mém pokoji je havárie")),
    {},
  );
  assert.deepEqual(
    explicitEvidenceFilters(prepareEvidenceQuery("Ubytování na Strahově")),
    {},
  );
  assert.deepEqual(
    explicitEvidenceFilters(prepareEvidenceQuery("Doklady SÚZ")),
    { authority: "suz" },
  );
  assert.deepEqual(
    explicitEvidenceFilters(prepareEvidenceQuery("Kde je Fotokomora?")),
    { authority: "silicon-hill", topics: ["photography"] },
  );
  assert.deepEqual(
    explicitEvidenceFilters(prepareEvidenceQuery("Rozdíl SH a SÚZ")),
    {},
  );
  assert.deepEqual(
    explicitEvidenceFilters(
      prepareEvidenceQuery("Ubytování v pokoji vedle Fotokomory"),
    ),
    {},
  );
  for (const mixed of [
    "Platí členství SH také kolejné?",
    "Does Silicon Hill membership pay my dorm rent?",
    "A dorm room near Fotokomora",
    "SÚZ a členské příspěvky",
  ])
    assert.deepEqual(explicitEvidenceFilters(prepareEvidenceQuery(mixed)), {});
  assert.deepEqual(
    explicitEvidenceFilters(prepareEvidenceQuery("Porovnej 3D tisk a SHernu")),
    { authority: "silicon-hill", topics: ["printing", "game-room"] },
  );
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
    assert.deepEqual(result.sourceVersionIds, ["b".repeat(64)]);
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
    { ...snapshot, profile: { ...profile, dimensions: 768 } },
    { ...snapshot, profile: { ...profile, id: "c".repeat(64) } },
  ]) {
    const f = fixture({
      store: {
        async captureActive() {
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

test("low similarity is an empty successful search; DB failure and stale revision stay distinct", async () => {
  const f = fixture({ maxDistance: 0.1 });
  try {
    assert.deepEqual((await f.search()).chunks, []);
  } finally {
    await f.backend.close();
  }
  const broken = fixture({
    store: {
      async search() {
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
      async assertCurrent() {
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
      async captureActive() {
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
  let finish!: (value: RagSnapshot) => void;
  const f = fixture({
    store: {
      captureActive: () =>
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
    store: { captureActive: () => new Promise(() => {}) },
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
