-- Extend the existing publication graph. Historical metadata and embeddings are untouched.
ALTER TABLE rag_schema_version DROP CONSTRAINT rag_schema_version_version_check;
ALTER TABLE rag_schema_version ADD CONSTRAINT rag_schema_version_version_check CHECK (version IN (1,2,3));
ALTER TABLE rag_document_versions ALTER COLUMN authority DROP NOT NULL;

-- The v2 migration used an unnamed multi-column CHECK. Identify that exact purpose,
-- rather than assuming PostgreSQL's generated constraint suffix.
DO $$
DECLARE identity_constraint text; matching integer;
BEGIN
  SELECT count(*),min(conname::text) INTO matching,identity_constraint FROM pg_constraint
    WHERE conrelid='rag_document_versions'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%metadata%'
      AND pg_get_constraintdef(oid) LIKE '%extraction%'
      AND pg_get_constraintdef(oid) LIKE '%complete%';
  IF matching<>1 THEN RAISE EXCEPTION 'Unexpected document identity constraint' USING ERRCODE='23514'; END IF;
  EXECUTE format('ALTER TABLE rag_document_versions DROP CONSTRAINT %I',identity_constraint);
END $$;

ALTER TABLE rag_document_versions ADD CONSTRAINT rag_document_metadata_identity CHECK ((
  metadata->>'sourceVersionId'=id AND metadata->>'id'=source_id
  AND metadata->>'status'=status AND metadata->>'schemaVersion'='3'
  AND (
    (NOT metadata ? 'derivation' AND authority IS NOT NULL
      AND metadata->>'authority'=authority AND metadata->'extraction'->>'complete'='true')
    OR
    (metadata->>'derivation'='knowledge-curation' AND authority IS NULL
      AND metadata->'authority'='null'::jsonb
      AND NOT metadata ?| ARRAY['extraction','url','discoveryUrl','publisher','author','checkedAt']
      AND effective_from IS NULL AND effective_until IS NULL
      AND metadata->'effectiveFrom'='null'::jsonb AND metadata->'effectiveUntil'='null'::jsonb
      AND metadata->>'reviewedAt'=to_char(checked_at AT TIME ZONE 'UTC','YYYY-MM-DD')
      AND metadata->>'reviewAfter'=to_char(review_after AT TIME ZONE 'UTC','YYYY-MM-DD')
      AND jsonb_typeof(metadata->'curation')='object'
      AND metadata->'curation'->>'normalizedSha256' ~ '^[0-9a-f]{64}$'
      AND jsonb_typeof(metadata->'supportingRefs')='array'
      AND (
        (metadata->>'verification'='community-experience'
          AND metadata->'factCheckedAt'='null'::jsonb AND metadata->'supportingRefs'='[]'::jsonb)
        OR
        (metadata->>'verification'='verified-official'
          AND metadata->>'factCheckedAt' ~ '^\d{4}-\d{2}-\d{2}$'
          AND jsonb_array_length(metadata->'supportingRefs') BETWEEN 1 AND 8)
      )
    )
  )
) IS TRUE);
