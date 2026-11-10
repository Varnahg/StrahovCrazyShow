import { setImmediate as nextTurn, setTimeout as delay } from "node:timers/promises";
import { Pool, type QueryResultRow } from "pg";
import {
  isCrazyTypkaChatResponse,
  isCrazyTypkaRequestSeq,
  type CrazyTypkaChatResponse,
} from "../shared/crazy-typka.ts";

export type ChatMonitorTurn = {
  conversationId: string;
  completedAt: number;
  question: string;
  answer: CrazyTypkaChatResponse;
};
export type ChatMonitorExchange = {
  requestSeq: number;
  completedAt: Date;
  question: string;
  answer: CrazyTypkaChatResponse;
};
export type ChatMonitorConversation = {
  id: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  exchangeCount: number;
};
export type ChatMonitorStore = {
  enqueue(turn: ChatMonitorTurn): void;
  listConversations(options?: { before?: string }): Promise<{
    conversations: ChatMonitorConversation[];
    nextCursor?: string;
  }>;
  openConversation(id: string, githubId: number): Promise<ChatMonitorExchange[] | undefined>;
  getDroppedCount(): number;
  close(): Promise<void>;
};

type MonitorPool = {
  query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
  end(): Promise<void>;
  on?(event: "error", listener: () => void): unknown;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pageSize = 50;
const queueLimit = 128;
const cleanupIntervalMs = 60_000;
const shutdownGraceMs = 2000;

const unavailable = () => new Error("chat-monitor-database-unavailable");

// The no-op conflict update locks the same conversation and returns its id
// without moving its original retention boundary.
const appendSql = `
  WITH boundary AS (
    SELECT $2::timestamptz AS first_seen_at,
      (($2::timestamptz AT TIME ZONE 'UTC') + INTERVAL '3 months') AT TIME ZONE 'UTC' AS expires_at
  ), conversation AS (
    INSERT INTO chat_monitor.conversations AS existing (id, first_seen_at, expires_at)
    SELECT $1::uuid, first_seen_at, expires_at FROM boundary
      WHERE expires_at > statement_timestamp()
    ON CONFLICT (id) DO UPDATE SET first_seen_at = existing.first_seen_at
      WHERE existing.expires_at > statement_timestamp()
    RETURNING id
  )
  INSERT INTO chat_monitor.exchanges (conversation_id, request_seq, completed_at, payload)
  SELECT id, $3::bigint, $2::timestamptz, $4::bytea FROM conversation
  ON CONFLICT (conversation_id, request_seq) DO NOTHING`;

const listSql = `
  WITH page AS (
    SELECT id, first_seen_at FROM chat_monitor.conversations
    WHERE expires_at > statement_timestamp()
      AND ($1::timestamptz IS NULL OR (first_seen_at, id) < ($1::timestamptz, $2::uuid))
    ORDER BY first_seen_at DESC, id DESC
    LIMIT $3::integer
  )
  SELECT page.id, page.first_seen_at, stats.last_seen_at, stats.exchange_count
  FROM page
  CROSS JOIN LATERAL (
    SELECT max(completed_at) AS last_seen_at, count(*)::integer AS exchange_count
    FROM chat_monitor.exchanges WHERE conversation_id = page.id
  ) stats
  ORDER BY page.first_seen_at DESC, page.id DESC`;

const detailSql = `
  WITH opened AS (
    INSERT INTO chat_monitor.reads (conversation_id, github_id)
    SELECT id, $2::bigint FROM chat_monitor.conversations
    WHERE id = $1::uuid AND expires_at > statement_timestamp()
    RETURNING conversation_id
  )
  SELECT exchanges.request_seq, exchanges.completed_at, exchanges.payload
  FROM opened JOIN chat_monitor.exchanges USING (conversation_id)
  ORDER BY exchanges.request_seq`;

const cleanupSql = `
  DELETE FROM chat_monitor.conversations WHERE expires_at <= statement_timestamp()`;

function createPrivatePool(connectionString: string): MonitorPool {
  try {
    const url = new URL(connectionString);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname || url.pathname.length < 2
    ) throw unavailable();
    return new Pool({
      connectionString,
      connectionTimeoutMillis: 1500,
      statement_timeout: 2000,
      query_timeout: 2500,
      idleTimeoutMillis: 10000,
      max: 4,
      application_name: "strahov-chat-monitor",
      allowExitOnIdle: true,
      async onConnect(client) {
        // Check before sending any bind value from a transcript to the server.
        const { rows } = await client.query<{ safe: boolean }>(`
          SELECT current_setting('log_parameter_max_length') = '0'
            AND current_setting('log_parameter_max_length_on_error') = '0'
            AND current_setting('log_error_verbosity') = 'terse'
            AND coalesce(current_setting('pgaudit.log_parameter', true), 'off') = 'off' AS safe`);
        if (!rows[0]?.safe) throw unavailable();
      },
    });
  } catch {
    throw unavailable();
  }
}

function encodeCursor(conversation: ChatMonitorConversation): string {
  return Buffer.from(JSON.stringify([conversation.firstSeenAt.toISOString(), conversation.id]))
    .toString("base64url");
}

function decodeCursor(cursor: string | undefined): [string | null, string | null] {
  if (cursor === undefined) return [null, null];
  try {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(cursor)) throw new Error();
    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(decoded) && decoded.length === 2 &&
      typeof decoded[0] === "string" && new Date(decoded[0]).toISOString() === decoded[0] &&
      typeof decoded[1] === "string" && uuid.test(decoded[1])
    ) return [decoded[0], decoded[1]];
  } catch {
    // The caller receives only a generic cursor error.
  }
  throw new Error("chat-monitor-invalid-cursor");
}

export function createChatMonitorStore(
  connectionString: string,
  options: { pool?: MonitorPool } = {},
): ChatMonitorStore {
  const pool = options.pool ?? createPrivatePool(connectionString);
  pool.on?.("error", () => {}); // Never emit a raw driver error to application logs.
  const queue: ChatMonitorTurn[] = [];
  let dropped = 0;
  let writing: Promise<void> | undefined;
  let pruning: Promise<void> | undefined;
  let closing: Promise<void> | undefined;

  async function query<Row extends QueryResultRow>(sql: string, values?: unknown[]) {
    try {
      return (await pool.query<Row>(sql, values)).rows;
    } catch {
      throw unavailable();
    }
  }

  async function drain() {
    // Terminal reply paths perform no serialization or SQL work before yielding.
    await nextTurn();
    try {
      while (queue.length) {
        const turn = queue.shift()!;
        try {
          const { speaker, text, sources, blocks, requestSeq } = turn.answer;
          const answer: CrazyTypkaChatResponse = { speaker, text, sources, blocks, requestSeq };
          // JSON in bytea also preserves UTF-16 escapes PostgreSQL jsonb cannot represent.
          const payload = Buffer.from(JSON.stringify({ question: turn.question, answer }));
          await query(appendSql, [turn.conversationId, new Date(turn.completedAt), requestSeq, payload]);
        } catch {
          dropped++;
        }
      }
    } finally {
      writing = undefined;
    }
  }

  function prune() {
    if (pruning || closing) return;
    pruning = query(cleanupSql).then(() => {}, () => {}).finally(() => {
      pruning = undefined;
    });
  }

  const cleanup = setInterval(prune, cleanupIntervalMs);
  cleanup.unref();
  prune();

  async function finish() {
    const pending = writing;
    if (pending) {
      const timeout = new AbortController();
      try {
        await Promise.race([pending, delay(shutdownGraceMs, undefined, { signal: timeout.signal })]);
      } finally {
        timeout.abort();
      }
      dropped += queue.length;
      queue.length = 0;
      await pending;
    }
    await pruning;
    await pool.end().catch(() => { throw unavailable(); });
  }

  return {
    enqueue(turn) {
      if (closing || queue.length >= queueLimit) {
        dropped++;
        return;
      }
      queue.push(turn);
      writing ??= drain();
    },
    async listConversations({ before } = {}) {
      const cursor = decodeCursor(before);
      const rows = await query<{
        id: string;
        first_seen_at: Date;
        last_seen_at: Date;
        exchange_count: number;
      }>(listSql, [...cursor, pageSize + 1]);
      const conversations = rows.slice(0, pageSize).map((row) => ({
        id: row.id,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        exchangeCount: row.exchange_count,
      }));
      return {
        conversations,
        nextCursor: rows.length > pageSize ? encodeCursor(conversations[pageSize - 1]) : undefined,
      };
    },
    async openConversation(id, githubId) {
      if (!uuid.test(id) || !isCrazyTypkaRequestSeq(githubId)) return undefined;
      const rows = await query<{
        request_seq: string;
        completed_at: Date;
        payload: Buffer;
      }>(detailSql, [id, githubId]);
      if (!rows.length) return undefined;
      try {
        return rows.map((row) => {
          const requestSeq = Number(row.request_seq);
          const { question, answer } = JSON.parse(row.payload.toString("utf8")) as {
            question: unknown;
            answer: unknown;
          };
          if (typeof question !== "string" || !isCrazyTypkaChatResponse(answer) || answer.requestSeq !== requestSeq) {
            throw unavailable();
          }
          return { requestSeq, completedAt: row.completed_at, question, answer };
        });
      } catch {
        throw unavailable();
      }
    },
    getDroppedCount: () => dropped,
    close() {
      clearInterval(cleanup);
      closing ??= finish();
      return closing;
    },
  };
}
