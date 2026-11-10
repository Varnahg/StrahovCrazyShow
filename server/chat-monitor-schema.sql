-- Apply as the owner of a dedicated private PostgreSQL database.
BEGIN;

CREATE SCHEMA IF NOT EXISTS chat_monitor;
REVOKE ALL ON SCHEMA chat_monitor FROM PUBLIC;

CREATE TABLE IF NOT EXISTS chat_monitor.conversations (
  id uuid PRIMARY KEY,
  first_seen_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL CHECK (expires_at > first_seen_at)
);
CREATE INDEX IF NOT EXISTS chat_monitor_conversations_first_seen
  ON chat_monitor.conversations (first_seen_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS chat_monitor_conversations_expiry
  ON chat_monitor.conversations (expires_at);

CREATE TABLE IF NOT EXISTS chat_monitor.exchanges (
  conversation_id uuid NOT NULL REFERENCES chat_monitor.conversations(id) ON DELETE CASCADE,
  request_seq bigint NOT NULL CHECK (request_seq BETWEEN 1 AND 9007199254740991),
  completed_at timestamptz(3) NOT NULL,
  payload bytea NOT NULL,
  PRIMARY KEY (conversation_id, request_seq)
);

CREATE TABLE IF NOT EXISTS chat_monitor.reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_monitor.conversations(id) ON DELETE CASCADE,
  github_id bigint NOT NULL CHECK (github_id BETWEEN 1 AND 9007199254740991),
  opened_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX IF NOT EXISTS chat_monitor_reads_conversation
  ON chat_monitor.reads (conversation_id);

COMMIT;
