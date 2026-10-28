-- Run only through the explicit administrative migration command.
-- All names are fixed; search_path is an operator-controlled connection setting.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE TABLE IF NOT EXISTS rag_schema_version (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version integer NOT NULL CHECK (version = 1)
);
INSERT INTO rag_schema_version VALUES (true, 1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS rag_profiles (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  provider text NOT NULL CHECK (provider = 'openai'),
  model text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions BETWEEN 1 AND 16000),
  input_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model, dimensions, input_version),
  UNIQUE (id, dimensions)
);
CREATE TABLE IF NOT EXISTS rag_embedding_cache (
  profile_id text NOT NULL,
  dimensions integer NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  input_text text NOT NULL,
  embedding vector NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, input_hash),
  FOREIGN KEY (profile_id, dimensions) REFERENCES rag_profiles(id, dimensions),
  CHECK (vector_dims(embedding) = dimensions),
  CHECK (vector_norm(embedding) > 0)
);
CREATE TABLE IF NOT EXISTS rag_source_versions (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  source_id text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  authority text NOT NULL CHECK (authority IN ('silicon-hill', 'suz')),
  status text NOT NULL CHECK (status IN ('current', 'archived')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility = 'public'),
  checked_at timestamptz NOT NULL,
  review_after timestamptz NOT NULL,
  effective_from timestamptz,
  effective_until timestamptz,
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (source_id, id),
  CHECK (checked_at < review_after),
  CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_from < effective_until)
);
CREATE TABLE IF NOT EXISTS rag_revisions (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  profile_id text NOT NULL REFERENCES rag_profiles(id),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('building', 'ready', 'failed')),
  expected_sources integer NOT NULL CHECK (expected_sources >= 0),
  expected_chunks integer NOT NULL CHECK (expected_chunks >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_code text,
  UNIQUE (profile_id, manifest_hash),
  UNIQUE (id, profile_id),
  UNIQUE (id, state)
);
CREATE TABLE IF NOT EXISTS rag_revision_sources (
  revision_id text NOT NULL REFERENCES rag_revisions(id),
  source_id text NOT NULL,
  source_version_id text NOT NULL,
  PRIMARY KEY (revision_id, source_id),
  FOREIGN KEY (source_id, source_version_id) REFERENCES rag_source_versions(source_id, id)
);
CREATE TABLE IF NOT EXISTS rag_revision_chunks (
  revision_id text NOT NULL,
  chunk_id text NOT NULL,
  source_id text NOT NULL,
  profile_id text NOT NULL,
  input_hash text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (revision_id, chunk_id),
  FOREIGN KEY (revision_id, source_id) REFERENCES rag_revision_sources(revision_id, source_id),
  FOREIGN KEY (revision_id, profile_id) REFERENCES rag_revisions(id, profile_id),
  FOREIGN KEY (profile_id, input_hash) REFERENCES rag_embedding_cache(profile_id, input_hash)
);
CREATE TABLE IF NOT EXISTS rag_heads (
  name text PRIMARY KEY CHECK (name = 'public'),
  revision_id text NOT NULL,
  revision_state text NOT NULL DEFAULT 'ready' CHECK (revision_state = 'ready'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (revision_id, revision_state) REFERENCES rag_revisions(id, state)
);
CREATE TABLE IF NOT EXISTS rag_embedding_attempts (
  id uuid PRIMARY KEY,
  revision_id text NOT NULL REFERENCES rag_revisions(id),
  profile_id text NOT NULL REFERENCES rag_profiles(id),
  input_hashes text[] NOT NULL CHECK (cardinality(input_hashes) > 0),
  state text NOT NULL CHECK (state IN ('inflight', 'complete', 'failed', 'uncertain')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  prompt_tokens integer,
  total_tokens integer,
  error_code text
);

CREATE OR REPLACE FUNCTION rag_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable RAG record' USING ERRCODE = '55000';
END $$;
DROP TRIGGER IF EXISTS rag_profiles_immutable ON rag_profiles;
CREATE TRIGGER rag_profiles_immutable BEFORE UPDATE OR DELETE ON rag_profiles
  FOR EACH ROW EXECUTE FUNCTION rag_reject_mutation();
DROP TRIGGER IF EXISTS rag_cache_immutable ON rag_embedding_cache;
CREATE TRIGGER rag_cache_immutable BEFORE UPDATE OR DELETE ON rag_embedding_cache
  FOR EACH ROW EXECUTE FUNCTION rag_reject_mutation();
DROP TRIGGER IF EXISTS rag_sources_immutable ON rag_source_versions;
CREATE TRIGGER rag_sources_immutable BEFORE UPDATE OR DELETE ON rag_source_versions
  FOR EACH ROW EXECUTE FUNCTION rag_reject_mutation();

CREATE OR REPLACE FUNCTION rag_guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state = 'ready' THEN
    RAISE EXCEPTION 'Immutable RAG revision' USING ERRCODE = '55000';
  END IF;
  IF ROW(OLD.id, OLD.profile_id, OLD.manifest_hash, OLD.expected_sources, OLD.expected_chunks)
     IS DISTINCT FROM ROW(NEW.id, NEW.profile_id, NEW.manifest_hash, NEW.expected_sources, NEW.expected_chunks) THEN
    RAISE EXCEPTION 'Immutable RAG manifest' USING ERRCODE = '55000';
  END IF;
  IF NEW.state = 'ready' AND (
    (SELECT count(*) FROM rag_revision_sources WHERE revision_id = NEW.id) <> NEW.expected_sources OR
    (SELECT count(*) FROM rag_revision_chunks WHERE revision_id = NEW.id) <> NEW.expected_chunks
  ) THEN
    RAISE EXCEPTION 'Incomplete RAG revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rag_revision_guard ON rag_revisions;
CREATE TRIGGER rag_revision_guard BEFORE UPDATE OR DELETE ON rag_revisions
  FOR EACH ROW EXECUTE FUNCTION rag_guard_revision();

CREATE OR REPLACE FUNCTION rag_guard_revision_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_state text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Immutable RAG revision member' USING ERRCODE = '55000';
  END IF;
  SELECT state INTO revision_state FROM rag_revisions WHERE id = NEW.revision_id FOR SHARE;
  IF revision_state IS DISTINCT FROM 'building' THEN
    RAISE EXCEPTION 'RAG revision is not building' USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'rag_revision_chunks' AND NOT EXISTS (
    SELECT 1 FROM rag_revision_sources rs JOIN rag_source_versions s ON s.id = rs.source_version_id
    WHERE rs.revision_id = NEW.revision_id AND rs.source_id = NEW.source_id
      AND s.status = 'current' AND s.visibility = 'public'
  ) THEN
    RAISE EXCEPTION 'Archived RAG source cannot have active chunks' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rag_revision_source_guard ON rag_revision_sources;
CREATE TRIGGER rag_revision_source_guard BEFORE INSERT OR UPDATE OR DELETE ON rag_revision_sources
  FOR EACH ROW EXECUTE FUNCTION rag_guard_revision_member();
DROP TRIGGER IF EXISTS rag_revision_chunk_guard ON rag_revision_chunks;
CREATE TRIGGER rag_revision_chunk_guard BEFORE INSERT OR UPDATE OR DELETE ON rag_revision_chunks
  FOR EACH ROW EXECUTE FUNCTION rag_guard_revision_member();

REVOKE ALL ON TABLE rag_schema_version,rag_profiles,rag_embedding_cache,rag_source_versions,
  rag_revisions,rag_revision_sources,rag_revision_chunks,rag_heads,rag_embedding_attempts FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rag_reject_mutation(),rag_guard_revision(),rag_guard_revision_member() FROM PUBLIC;
