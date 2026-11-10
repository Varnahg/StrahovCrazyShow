import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { Pool, type QueryResultRow } from "pg";
import { CRAZY_TYPKA_SPEAKER } from "../shared/crazy-typka.ts";
import { createChatMonitorStore, type ChatMonitorTurn } from "../server/chat-monitor-store.ts";

function exchange(conversationId: string, requestSeq: number, completedAt = Date.now()): ChatMonitorTurn {
  return {
    conversationId,
    completedAt,
    question: "  Otázka s emoji 🦄 a znaky \u0000\ud800\n",
    answer: { speaker: CRAZY_TYPKA_SPEAKER, text: "Odpověď s <script> a emoji 🦄", sources: [], requestSeq },
  };
}

test("transcript writes yield, stay bounded, and count storage failures and full queues", async () => {
  const writes: unknown[][] = [];
  let signalStarted!: () => void;
  let unblock!: () => void;
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  const blocked = new Promise<void>((resolve) => { unblock = resolve; });
  let ended = false;
  const store = createChatMonitorStore("unused", {
    pool: {
      async query<Row extends QueryResultRow>(sql: string, values?: unknown[]) {
        if (sql.includes("INSERT INTO chat_monitor.exchanges")) {
          writes.push(values!);
          if (writes.length === 1) {
            signalStarted();
            await blocked;
            throw new Error("private driver error");
          }
        }
        return { rows: [] as Row[] };
      },
      async end() { ended = true; },
    },
  });
  const id = randomUUID();
  try {
    for (let seq = 1; seq <= 130; seq++) store.enqueue(exchange(id, seq));
    assert.equal(writes.length, 0);
    assert.equal(store.getDroppedCount(), 2);
    await started;
    assert.equal(writes.length, 1);
  } finally {
    unblock();
    const closing = store.close();
    assert.equal(closing, store.close());
    await closing;
  }
  assert.equal(ended, true);
  assert.equal(writes.length, 128);
  assert.deepEqual(writes.map((parameters) => parameters[2]), Array.from({ length: 128 }, (_, i) => i + 1));
  assert.equal(store.getDroppedCount(), 3);
});

test("storage projects only the transcript fields and sanitizes read failures", async () => {
  const id = randomUUID();
  const turn = exchange(id, 1);
  let serialized: Buffer | undefined;
  const store = createChatMonitorStore("unused", {
    pool: {
      async query<Row extends QueryResultRow>(sql: string, values?: unknown[]) {
        if (sql.includes("INSERT INTO chat_monitor.exchanges")) serialized = values?.[3] as Buffer;
        if (sql.includes("INSERT INTO chat_monitor.reads")) throw new Error("private database detail");
        return { rows: [] as Row[] };
      },
      async end() {},
    },
  });
  try {
    const input = { ...turn, ip: "private ip", answer: { ...turn.answer, internal: "private provider detail" } };
    store.enqueue(input);
    await nextTurn();
    assert.deepEqual(JSON.parse(serialized!.toString()), { question: turn.question, answer: turn.answer });
    await assert.rejects(store.listConversations({ before: "unexpected text" }), /^Error: chat-monitor-invalid-cursor$/);
    assert.equal(await store.openConversation("bogus", 1), undefined);
    assert.equal(await store.openConversation(id, 0), undefined);
    await assert.rejects(store.openConversation(id, 1), /^Error: chat-monitor-database-unavailable$/);
  } finally {
    await store.close();
  }
});

const testDatabase = process.env.CHAT_MONITOR_TEST_DATABASE_URL;

test("PostgreSQL transcript persistence, cursor, read audit, retention and logging fence", {
  skip: !testDatabase,
}, async () => {
  const connectionString = testDatabase!;
  const url = new URL(connectionString);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/chat_monitor_test");
  const setup = new Pool({ connectionString, connectionTimeoutMillis: 1500, statement_timeout: 3000 });
  const stores: ReturnType<typeof createChatMonitorStore>[] = [];
  const storeFor = (dsn: string) => {
    const store = createChatMonitorStore(dsn);
    stores.push(store);
    return store;
  };
  let ownSchema = false;
  try {
    const identity = await setup.query("SELECT current_database() AS name, to_regnamespace('chat_monitor') AS schema");
    assert.equal(identity.rows[0].name, "chat_monitor_test");
    assert.equal(identity.rows[0].schema, null);
    await setup.query(await readFile(new URL("../server/chat-monitor-schema.sql", import.meta.url), "utf8"));
    ownSchema = true;

    const id = randomUUID();
    const start = Date.UTC(new Date().getUTCFullYear() + 1, 0, 31, 12, 45, 23, 456);
    const first = exchange(id, 1, start);
    const second = exchange(id, 2, start + 1000);
    const writer = storeFor(connectionString);
    writer.enqueue(first);
    writer.enqueue({ ...first, question: "attempted replay edit" });
    writer.enqueue(second);
    const more = Array.from({ length: 51 }, () => randomUUID());
    for (const otherId of more) writer.enqueue(exchange(otherId, 1, start));
    await writer.close();
    assert.equal(writer.getDroppedCount(), 0);

    const reader = storeFor(connectionString);
    const detail = await reader.openConversation(id, 12345);
    assert.deepEqual(detail, [first, second].map((turn) => ({
      requestSeq: turn.answer.requestSeq, completedAt: new Date(turn.completedAt), question: turn.question, answer: turn.answer,
    })));
    const retention = await setup.query("SELECT first_seen_at, expires_at FROM chat_monitor.conversations WHERE id = $1", [id]);
    assert.equal(retention.rows[0].first_seen_at.toISOString(), new Date(start).toISOString());
    assert.equal(retention.rows[0].expires_at.toISOString(), new Date(Date.UTC(new Date(start).getUTCFullYear(), 3, 30, 12, 45, 23, 456)).toISOString());
    const audit = await setup.query("SELECT github_id FROM chat_monitor.reads WHERE conversation_id = $1", [id]);
    assert.deepEqual(audit.rows, [{ github_id: "12345" }]);

    const { conversations, nextCursor } = await reader.listConversations();
    assert.equal(conversations.length, 50);
    assert.ok(nextCursor);
    const tail = await reader.listConversations({ before: nextCursor });
    assert.equal(tail.nextCursor, undefined);
    assert.deepEqual([...conversations, ...tail.conversations].map((item) => item.id), [id, ...more].sort().reverse());
    const summary = [...conversations, ...tail.conversations].find((item) => item.id === id)!;
    assert.equal(summary.exchangeCount, 2);
    assert.equal(summary.lastSeenAt.valueOf(), second.completedAt);

    const expiredId = randomUUID();
    await setup.query(`INSERT INTO chat_monitor.conversations VALUES
      ($1, '2000-01-31T12:45:23Z', '2000-04-30T12:45:23Z')`, [expiredId]);
    await setup.query("INSERT INTO chat_monitor.exchanges VALUES ($1, 1, now(), $2)", [expiredId, Buffer.from("{}")]);
    await setup.query("INSERT INTO chat_monitor.reads (conversation_id, github_id) VALUES ($1, 12345)", [expiredId]);
    assert.equal(await reader.openConversation(expiredId, 12345), undefined);
    assert.equal((await reader.listConversations()).conversations.some(({ id }) => id === expiredId), false);
    const auditBeforeCleanup = await setup.query("SELECT count(*)::int AS count FROM chat_monitor.reads WHERE conversation_id = $1", [expiredId]);
    assert.equal(auditBeforeCleanup.rows[0].count, 1);
    await storeFor(connectionString).close(); // Wait for the immediate maintenance pass.
    const expired = await setup.query(`SELECT
      EXISTS(SELECT FROM chat_monitor.conversations WHERE id = $1) AS conversation,
      EXISTS(SELECT FROM chat_monitor.exchanges WHERE conversation_id = $1) AS exchange,
      EXISTS(SELECT FROM chat_monitor.reads WHERE conversation_id = $1) AS audit`, [expiredId]);
    assert.deepEqual(expired.rows, [{ conversation: false, exchange: false, audit: false }]);

    const unsafeUrl = new URL(connectionString);
    unsafeUrl.searchParams.set("options", "-c log_parameter_max_length=-1");
    const unsafe = storeFor(unsafeUrl.href);
    const blocked = randomUUID();
    unsafe.enqueue(exchange(blocked, 1));
    await unsafe.close();
    assert.equal(unsafe.getDroppedCount(), 1);
    assert.equal(await reader.openConversation(blocked, 12345), undefined);
  } finally {
    try {
      await Promise.all(stores.map((store) => store.close()));
    } finally {
      try {
        if (ownSchema) await setup.query("DROP SCHEMA chat_monitor CASCADE");
      } finally {
        await setup.end();
      }
    }
  }
});
