-- Additive v3 publication. The immutable v1 bootstrap is never replayed here.
ALTER TABLE rag_schema_version DROP CONSTRAINT rag_schema_version_version_check;
ALTER TABLE rag_schema_version ADD CONSTRAINT rag_schema_version_version_check CHECK (version IN (1,2));
ALTER TABLE rag_revisions ADD COLUMN data_schema_version integer NOT NULL DEFAULT 2 CHECK (data_schema_version IN (2,3));
ALTER TABLE rag_revisions ADD COLUMN collection text NOT NULL DEFAULT 'current' CHECK (collection IN ('current','archive'));
ALTER TABLE rag_revisions ADD COLUMN expected_blocks integer NOT NULL DEFAULT 0 CHECK (expected_blocks >= 0);
ALTER TABLE rag_revisions ADD COLUMN expected_suppressions integer NOT NULL DEFAULT 0 CHECK (expected_suppressions >= 0);
ALTER TABLE rag_revisions ADD COLUMN expected_restores integer NOT NULL DEFAULT 0 CHECK (expected_restores >= 0);
ALTER TABLE rag_revisions ADD CONSTRAINT rag_revision_collection_identity UNIQUE(id,collection);
ALTER TABLE rag_heads DROP CONSTRAINT rag_heads_name_check;
ALTER TABLE rag_heads ADD CONSTRAINT rag_heads_name_check CHECK (name IN ('public','public-documents','public-archive'));

CREATE TABLE rag_document_versions (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  source_id text NOT NULL,
  authority text NOT NULL CHECK (authority IN ('silicon-hill','suz','su','cvut')),
  status text NOT NULL CHECK (status IN ('current','archived')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility='public'),
  checked_at timestamptz NOT NULL,
  review_after timestamptz NOT NULL,
  effective_from timestamptz,
  effective_until timestamptz,
  block_count integer NOT NULL CHECK (block_count>=0),
  chunk_count integer NOT NULL CHECK (chunk_count>=0),
  sealed boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=65536),
  UNIQUE(source_id,id),
  CHECK (checked_at < review_after),
  CHECK ((metadata->>'sourceVersionId'=id AND metadata->>'id'=source_id
    AND metadata->>'authority'=authority AND metadata->>'status'=status
    AND metadata->>'schemaVersion'='3' AND metadata->'extraction'->>'complete'='true') IS TRUE),
  CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_from<effective_until)
);
CREATE TABLE rag_document_blocks (
  source_version_id text NOT NULL REFERENCES rag_document_versions(id),
  block_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>=0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=5242880),
  PRIMARY KEY(source_version_id,block_id),
  UNIQUE(source_version_id,ordinal)
);
CREATE TABLE rag_document_chunks (
  source_version_id text NOT NULL REFERENCES rag_document_versions(id),
  chunk_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>=0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=131072),
  PRIMARY KEY(source_version_id,chunk_id),
  UNIQUE(source_version_id,ordinal)
);
CREATE TABLE rag_revision_documents (
  revision_id text NOT NULL,
  source_version_id text NOT NULL,
  source_id text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('current','archive')),
  PRIMARY KEY(revision_id,source_version_id),
  FOREIGN KEY(revision_id,scope) REFERENCES rag_revisions(id,collection),
  FOREIGN KEY(source_id,source_version_id) REFERENCES rag_document_versions(source_id,id)
);
CREATE UNIQUE INDEX rag_current_document_identity ON rag_revision_documents(revision_id,source_id) WHERE scope='current';
CREATE TABLE rag_revision_document_chunks (
  revision_id text NOT NULL,
  source_version_id text NOT NULL,
  chunk_id text NOT NULL,
  profile_id text NOT NULL,
  input_hash text NOT NULL,
  PRIMARY KEY(revision_id,source_version_id,chunk_id),
  FOREIGN KEY(revision_id,source_version_id) REFERENCES rag_revision_documents(revision_id,source_version_id),
  FOREIGN KEY(source_version_id,chunk_id) REFERENCES rag_document_chunks(source_version_id,chunk_id),
  FOREIGN KEY(revision_id,profile_id) REFERENCES rag_revisions(id,profile_id),
  FOREIGN KEY(profile_id,input_hash) REFERENCES rag_embedding_cache(profile_id,input_hash)
);
CREATE TABLE rag_revision_legacy_replacements (
  revision_id text NOT NULL REFERENCES rag_revisions(id),
  legacy_source_id text NOT NULL,
  legacy_source_version_id text NOT NULL,
  document_source_version_id text NOT NULL REFERENCES rag_document_versions(id),
  PRIMARY KEY(revision_id,legacy_source_id),
  FOREIGN KEY(legacy_source_id,legacy_source_version_id) REFERENCES rag_source_versions(source_id,id)
  -- The replacement may be retired later. Suppression intentionally outlives membership.
);
CREATE TABLE rag_revision_legacy_restores (
  revision_id text NOT NULL REFERENCES rag_revisions(id),
  legacy_source_id text NOT NULL,
  legacy_source_version_id text NOT NULL,
  PRIMARY KEY(revision_id,legacy_source_id),
  FOREIGN KEY(legacy_source_id,legacy_source_version_id) REFERENCES rag_source_versions(source_id,id)
);

CREATE FUNCTION rag_guard_document_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.sealed THEN RAISE EXCEPTION 'New document cannot be sealed' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP<>'UPDATE' OR OLD.sealed OR NOT NEW.sealed OR (to_jsonb(OLD)-'sealed') IS DISTINCT FROM (to_jsonb(NEW)-'sealed') THEN
    RAISE EXCEPTION 'Immutable document version' USING ERRCODE='55000';
  END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Document writes require read committed isolation' USING ERRCODE='25000';
  END IF;
  IF (SELECT count(*) FROM rag_document_blocks WHERE source_version_id=OLD.id)<>OLD.block_count
    OR (SELECT count(*) FROM rag_document_chunks WHERE source_version_id=OLD.id)<>OLD.chunk_count THEN
    RAISE EXCEPTION 'Incomplete document version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rag_documents_immutable BEFORE INSERT OR UPDATE OR DELETE ON rag_document_versions FOR EACH ROW EXECUTE FUNCTION rag_guard_document_version();
CREATE TRIGGER rag_document_blocks_immutable BEFORE UPDATE OR DELETE ON rag_document_blocks FOR EACH ROW EXECUTE FUNCTION rag_reject_mutation();
CREATE TRIGGER rag_document_chunks_immutable BEFORE UPDATE OR DELETE ON rag_document_chunks FOR EACH ROW EXECUTE FUNCTION rag_reject_mutation();

CREATE FUNCTION rag_guard_document_part() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_identity text; source_sealed boolean;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Document writes require read committed isolation' USING ERRCODE='25000';
  END IF;
  SELECT source_id,sealed INTO source_identity,source_sealed FROM rag_document_versions WHERE id=NEW.source_version_id FOR SHARE;
  IF source_identity IS NULL OR NEW.payload->>'sourceVersionId' IS DISTINCT FROM NEW.source_version_id
    OR NEW.payload->>'sourceId' IS DISTINCT FROM source_identity
    OR NEW.payload->>'id' IS DISTINCT FROM to_jsonb(NEW)->>(CASE WHEN TG_TABLE_NAME='rag_document_blocks' THEN 'block_id' ELSE 'chunk_id' END) THEN
    RAISE EXCEPTION 'Invalid document part identity' USING ERRCODE='23514';
  END IF;
  IF source_sealed THEN
    RAISE EXCEPTION 'Published document is immutable' USING ERRCODE='55000';
  END IF;
  IF TG_TABLE_NAME='rag_document_chunks' THEN
    IF jsonb_typeof(NEW.payload->'blockIds') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Missing document block references' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW.payload->'blockIds') AS reference(block_id)
      WHERE NOT EXISTS (SELECT 1 FROM rag_document_blocks b WHERE b.source_version_id=NEW.source_version_id AND b.block_id=reference.block_id)) THEN
      RAISE EXCEPTION 'Foreign document block reference' USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rag_document_block_insert BEFORE INSERT ON rag_document_blocks FOR EACH ROW EXECUTE FUNCTION rag_guard_document_part();
CREATE TRIGGER rag_document_chunk_insert BEFORE INSERT ON rag_document_chunks FOR EACH ROW EXECUTE FUNCTION rag_guard_document_part();

CREATE FUNCTION rag_guard_document_member() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision rag_revisions%ROWTYPE; document_status text;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Immutable document membership' USING ERRCODE='55000'; END IF;
  SELECT * INTO revision FROM rag_revisions WHERE id=NEW.revision_id FOR SHARE;
  IF revision.state IS DISTINCT FROM 'building' OR revision.data_schema_version IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Document revision is not building' USING ERRCODE='55000';
  END IF;
  IF TG_TABLE_NAME='rag_revision_documents' THEN
    SELECT status INTO document_status FROM rag_document_versions WHERE id=NEW.source_version_id;
    IF document_status IS DISTINCT FROM (CASE WHEN revision.collection='current' THEN 'current' ELSE 'archived' END) THEN
      RAISE EXCEPTION 'Wrong document collection' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME IN ('rag_revision_legacy_replacements','rag_revision_legacy_restores') AND revision.collection<>'current' THEN
    RAISE EXCEPTION 'Archive cannot suppress current legacy' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rag_document_members_guard BEFORE INSERT OR UPDATE OR DELETE ON rag_revision_documents FOR EACH ROW EXECUTE FUNCTION rag_guard_document_member();
CREATE TRIGGER rag_document_chunk_members_guard BEFORE INSERT OR UPDATE OR DELETE ON rag_revision_document_chunks FOR EACH ROW EXECUTE FUNCTION rag_guard_document_member();
CREATE TRIGGER rag_legacy_replacement_guard BEFORE INSERT OR UPDATE OR DELETE ON rag_revision_legacy_replacements FOR EACH ROW EXECUTE FUNCTION rag_guard_document_member();
CREATE TRIGGER rag_legacy_restore_guard BEFORE INSERT OR UPDATE OR DELETE ON rag_revision_legacy_restores FOR EACH ROW EXECUTE FUNCTION rag_guard_document_member();

CREATE OR REPLACE FUNCTION rag_guard_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document_id text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'building' THEN RAISE EXCEPTION 'New revision must be building' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' OR OLD.state='ready' THEN RAISE EXCEPTION 'Immutable RAG revision' USING ERRCODE='55000'; END IF;
  IF ROW(OLD.id,OLD.profile_id,OLD.manifest_hash,OLD.expected_sources,OLD.expected_chunks,OLD.expected_blocks,OLD.expected_suppressions,OLD.expected_restores,OLD.data_schema_version,OLD.collection)
    IS DISTINCT FROM ROW(NEW.id,NEW.profile_id,NEW.manifest_hash,NEW.expected_sources,NEW.expected_chunks,NEW.expected_blocks,NEW.expected_suppressions,NEW.expected_restores,NEW.data_schema_version,NEW.collection) THEN
    RAISE EXCEPTION 'Immutable RAG manifest' USING ERRCODE='55000';
  END IF;
  IF NEW.state='ready' THEN
    IF NEW.data_schema_version=2 THEN
      IF NEW.collection<>'current' OR NEW.expected_blocks<>0 OR NEW.expected_suppressions<>0 OR NEW.expected_restores<>0
        OR (SELECT count(*) FROM rag_revision_sources WHERE revision_id=NEW.id)<>NEW.expected_sources
        OR (SELECT count(*) FROM rag_revision_chunks WHERE revision_id=NEW.id)<>NEW.expected_chunks THEN
        RAISE EXCEPTION 'Incomplete RAG revision' USING ERRCODE='23514';
      END IF;
    ELSE
      IF current_setting('transaction_isolation')<>'read committed' THEN
        RAISE EXCEPTION 'Document writes require read committed isolation' USING ERRCODE='25000';
      END IF;
      -- SHARE locks held by part inserts conflict with these updates. The one-way
      -- change also prevents later inserts into a version that has been sealed.
      FOR document_id IN SELECT source_version_id FROM rag_revision_documents WHERE revision_id=NEW.id ORDER BY source_version_id LOOP
        UPDATE rag_document_versions SET sealed=true WHERE id=document_id AND NOT sealed;
      END LOOP;
      IF (SELECT count(*) FROM rag_revision_documents WHERE revision_id=NEW.id)<>NEW.expected_sources
        OR (SELECT count(*) FROM rag_revision_legacy_replacements WHERE revision_id=NEW.id)<>NEW.expected_suppressions
        OR (SELECT count(*) FROM rag_revision_legacy_restores WHERE revision_id=NEW.id)<>NEW.expected_restores
        OR (SELECT count(*) FROM rag_revision_document_chunks WHERE revision_id=NEW.id)<>NEW.expected_chunks
        OR (SELECT count(*) FROM rag_revision_documents d JOIN rag_document_blocks b ON b.source_version_id=d.source_version_id WHERE d.revision_id=NEW.id)<>NEW.expected_blocks
        OR EXISTS (SELECT 1 FROM rag_revision_documents d JOIN rag_document_versions v ON v.id=d.source_version_id WHERE d.revision_id=NEW.id AND (
          (SELECT count(*) FROM rag_document_blocks b WHERE b.source_version_id=v.id)<>v.block_count OR
          (SELECT count(*) FROM rag_document_chunks c WHERE c.source_version_id=v.id)<>v.chunk_count OR
          (SELECT count(*) FROM rag_revision_document_chunks c WHERE c.revision_id=NEW.id AND c.source_version_id=v.id)<>v.chunk_count)) THEN
        RAISE EXCEPTION 'Incomplete document revision' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER rag_revision_guard ON rag_revisions;
CREATE TRIGGER rag_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON rag_revisions FOR EACH ROW EXECUTE FUNCTION rag_guard_revision();

CREATE FUNCTION rag_guard_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target rag_revisions%ROWTYPE; profile rag_profiles%ROWTYPE; other_profile rag_profiles%ROWTYPE; previous_id text;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.name='public-documents' AND EXISTS (SELECT 1 FROM rag_revision_legacy_replacements WHERE revision_id=OLD.revision_id) THEN
      RAISE EXCEPTION 'Suppressed legacy requires explicit rollback' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO target FROM rag_revisions WHERE id=NEW.revision_id;
  SELECT * INTO profile FROM rag_profiles WHERE id=target.profile_id;
  IF target.state IS DISTINCT FROM 'ready' OR
    (NEW.name='public' AND (target.data_schema_version<>2 OR target.collection<>'current' OR profile.input_version<>'title-locator-text-v1')) OR
    (NEW.name='public-documents' AND (target.data_schema_version<>3 OR target.collection<>'current' OR profile.input_version<>'title-heading-text-v2')) OR
    (NEW.name='public-archive' AND (target.data_schema_version<>3 OR target.collection<>'archive' OR profile.input_version<>'title-heading-text-v2')) THEN
    RAISE EXCEPTION 'Wrong publication head' USING ERRCODE='23514';
  END IF;
  IF NEW.name IN ('public','public-documents') THEN
    SELECT p.* INTO other_profile FROM rag_heads h JOIN rag_revisions r ON r.id=h.revision_id JOIN rag_profiles p ON p.id=r.profile_id
      WHERE h.name=CASE WHEN NEW.name='public' THEN 'public-documents' ELSE 'public' END;
    IF FOUND AND ROW(profile.provider,profile.model,profile.dimensions) IS DISTINCT FROM ROW(other_profile.provider,other_profile.model,other_profile.dimensions) THEN
      RAISE EXCEPTION 'Incompatible query embedding spaces' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.name='public-documents' THEN
    IF TG_OP='UPDATE' THEN previous_id=OLD.revision_id;
    ELSE SELECT revision_id INTO previous_id FROM rag_heads WHERE name='public-documents'; END IF;
    IF previous_id=NEW.revision_id THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM rag_revision_legacy_replacements old_map WHERE old_map.revision_id=previous_id
      AND NOT EXISTS (SELECT 1 FROM rag_revision_legacy_replacements next_map WHERE next_map.revision_id=NEW.revision_id AND next_map.legacy_source_id=old_map.legacy_source_id)
      AND NOT EXISTS (SELECT 1 FROM rag_revision_legacy_restores restored JOIN rag_heads legacy ON legacy.name='public'
        JOIN rag_revision_sources live ON live.revision_id=legacy.revision_id AND live.source_id=restored.legacy_source_id AND live.source_version_id=restored.legacy_source_version_id
        WHERE restored.revision_id=NEW.revision_id AND restored.legacy_source_id=old_map.legacy_source_id)) THEN
      RAISE EXCEPTION 'Suppressed legacy requires explicit rollback' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM rag_revision_legacy_restores restored WHERE restored.revision_id=NEW.revision_id AND (
      NOT EXISTS (SELECT 1 FROM rag_revision_legacy_replacements old_map WHERE old_map.revision_id=previous_id AND old_map.legacy_source_id=restored.legacy_source_id) OR
      EXISTS (SELECT 1 FROM rag_revision_legacy_replacements next_map WHERE next_map.revision_id=NEW.revision_id AND next_map.legacy_source_id=restored.legacy_source_id) OR
      NOT EXISTS (SELECT 1 FROM rag_heads h JOIN rag_revision_sources live ON live.revision_id=h.revision_id
        JOIN rag_source_versions v ON v.id=live.source_version_id WHERE h.name='public' AND v.status='current'
        AND live.source_id=restored.legacy_source_id AND live.source_version_id=restored.legacy_source_version_id))) THEN
      RAISE EXCEPTION 'Stale legacy rollback target' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM rag_revision_legacy_replacements next_map WHERE next_map.revision_id=NEW.revision_id
      AND NOT EXISTS (SELECT 1 FROM rag_revision_legacy_replacements old_map WHERE old_map.revision_id=previous_id
        AND ROW(old_map.legacy_source_id,old_map.legacy_source_version_id,old_map.document_source_version_id)
          = ROW(next_map.legacy_source_id,next_map.legacy_source_version_id,next_map.document_source_version_id))
      AND (NOT EXISTS (SELECT 1 FROM rag_heads h JOIN rag_revision_sources live ON live.revision_id=h.revision_id
        JOIN rag_source_versions old_source ON old_source.id=live.source_version_id WHERE h.name='public' AND old_source.status='current'
        AND live.source_id=next_map.legacy_source_id AND live.source_version_id=next_map.legacy_source_version_id)
      OR NOT EXISTS (SELECT 1 FROM rag_revision_documents d JOIN rag_document_versions v ON v.id=d.source_version_id
        JOIN rag_source_versions legacy_origin ON legacy_origin.id=next_map.legacy_source_version_id AND legacy_origin.authority=v.authority
        WHERE d.revision_id=NEW.revision_id AND v.id=next_map.document_source_version_id AND v.status='current' AND v.chunk_count>0 AND v.sealed))) THEN
      RAISE EXCEPTION 'Invalid legacy replacement promotion' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rag_head_guard BEFORE INSERT OR UPDATE OR DELETE ON rag_heads FOR EACH ROW EXECUTE FUNCTION rag_guard_head();

REVOKE ALL ON TABLE rag_document_versions,rag_document_blocks,rag_document_chunks,rag_revision_documents,
  rag_revision_document_chunks,rag_revision_legacy_replacements,rag_revision_legacy_restores FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rag_guard_document_version(),rag_guard_document_part(),rag_guard_document_member(),rag_guard_head() FROM PUBLIC;
