import { readFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { createEmbeddingProfile, createOpenAIEmbedder, documentEmbeddingInputV3, embeddingInputHash, validateEmbeddingProfile, type Embedder, type EmbeddingProfile } from "../server/rag-embeddings";
import { validateKnowledgeDatasetV3 } from "../server/rag-document-contract";
import { prepareRagCorpus, importPreparedCorpus, prepareDocumentChanges, importPreparedDocumentCorpus } from "../server/rag-ingest";
import { migrateRagSchema, openRagImportSession, openRagDocumentImportSession, canonicalJson, vectorParameter, type PreparedCorpus, type RagImportSession, type RagDocumentImportSession, type SqlResult } from "../server/rag-vector-store";
import type { KnowledgeDocumentBundleV3 } from "../server/rag-knowledge-types";
import { loadApprovedRagDatasets } from "./rag-import";
// @ts-ignore Plain Node helpers are shared with the dependency-free Docker entrypoints.
import { credentialPaths, readCredentials, readPrivateText, ragConnection, RAG_ROLES } from "./docker-rag-secrets.mjs";

type Query = (sql: string, values?: unknown[]) => Promise<SqlResult>;
export type SeedEntry = { profile: EmbeddingProfile; input: string; inputHash: string; vector: number[] };
type Datasets = Awaited<ReturnType<typeof loadApprovedRagDatasets>>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).sort().join(",") === names.sort().join(",");
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const revision = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
export function bootstrapSeedRevision(value: unknown): number {
  if (!object(value) || !keys(value,["schemaVersion","revision","bundles"]) || value.schemaVersion !== 1 || !revision(value.revision) || value.revision === 0) throw Error("invalid-seed-revision");
  return value.revision;
}

export function validateBootstrapDocuments(value: unknown): KnowledgeDocumentBundleV3[] {
  bootstrapSeedRevision(value);
  if (!object(value) || !Array.isArray(value.bundles) || value.bundles.length > 1024) throw Error("invalid-document-seed");
  const bundles = value.bundles.map(bundle => {
    if (!object(bundle) || !keys(bundle, ["document", "blocks", "chunks"])) throw Error("invalid-document-seed");
    const data = validateKnowledgeDatasetV3({ version: 3, documents: [bundle.document], blocks: bundle.blocks, chunks: bundle.chunks });
    return { document: data.documents[0], blocks: data.blocks, chunks: data.chunks };
  });
  validateKnowledgeDatasetV3({ version: 3, documents: bundles.map(b => b.document), blocks: bundles.flatMap(b => [...b.blocks]), chunks: bundles.flatMap(b => [...b.chunks]) });
  return bundles;
}
export function validateBootstrapCache(value: unknown, datasets: Datasets, bundles: readonly KnowledgeDocumentBundleV3[]): SeedEntry[] {
  if (!object(value) || !keys(value, ["schemaVersion", "entries"]) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 10000) throw Error("invalid-cache-seed");
  const allowed = new Map<string, Map<string, string>>(), seen = new Set<string>();
  return value.entries.map(entry => {
    if (!object(entry) || !keys(entry, ["profile", "input", "inputHash", "vector"])) throw Error("invalid-cache-seed");
    const profile = validateEmbeddingProfile(entry.profile as EmbeddingProfile), key = profile.id + ":" + entry.inputHash;
    if (seen.has(key) || typeof entry.input !== "string" || !hash(entry.inputHash) || embeddingInputHash(entry.input) !== entry.inputHash) throw Error("invalid-cache-seed");
    seen.add(key);
    let inputs = allowed.get(profile.id);
    if (!inputs) {
      const pairs = profile.inputVersion === "title-locator-text-v1"
        ? prepareRagCorpus(datasets.currentDatasets, datasets.archiveDatasets, profile).inputs.map(i => [i.inputHash, i.input] as const)
        : bundles.flatMap(bundle => bundle.chunks.map(chunk => { const input = documentEmbeddingInputV3(bundle.document, chunk, profile); return [embeddingInputHash(input), input] as const; }));
      inputs = new Map(pairs); allowed.set(profile.id, inputs);
    }
    if (inputs.get(entry.inputHash) !== entry.input) throw Error("unapproved-seed-input");
    vectorParameter(entry.vector as number[], profile.dimensions);
    return { profile, input: entry.input, inputHash: entry.inputHash, vector: [...entry.vector as number[]] };
  });
}

export type BootstrapMarker = { applied: string | null; pendingFrom: string | null; pendingTarget: string | null; seedRevision:number; pendingRevision:number|null };
export function bootstrapDecision(current: string | null, marker: BootstrapMarker | null, target: string, seedRevision=1): "same" | "import" | "preserve" {
  if (!revision(seedRevision) || seedRevision === 0) throw Error("invalid-seed-revision");
  if (!marker) return current === null ? "import" : "preserve";
  const pending = marker.pendingTarget !== null;
  if (current !== marker.applied && (!pending || (current !== marker.pendingTarget && current !== marker.pendingFrom))) return "preserve";
  if (current === null && marker.applied !== null && (!pending || marker.pendingFrom !== null)) return "preserve";
  const publishedPending = pending && current === marker.pendingTarget;
  const effectiveRevision = publishedPending ? marker.pendingRevision ?? 0 : marker.seedRevision;
  if (effectiveRevision === 0 && !pending) return current === target ? "same" : "preserve";
  if (seedRevision < Math.max(effectiveRevision,marker.pendingRevision ?? 0)) return "preserve";
  if (pending && !publishedPending) {
    if (marker.pendingRevision === null) return current === target ? "same" : "preserve";
    if (seedRevision > marker.pendingRevision) throw Error("bootstrap-pending-seed-revision");
    if (target !== marker.pendingTarget) throw Error("bootstrap-seed-revision-conflict");
    return "import";
  }
  if (effectiveRevision === 0) return current === target ? "same" : "preserve";
  if (seedRevision === effectiveRevision && current !== target) throw Error("bootstrap-seed-revision-conflict");
  return current === target ? "same" : "import";
}
async function marker(query: Query, head: string): Promise<BootstrapMarker | null> {
  const { rows } = await query("SELECT applied,pending_from,pending_target,seed_revision,pending_revision FROM scs_rag_bootstrap WHERE head=$1", [head]);
  if (!rows.length) return null;
  const row = rows[0];
  if (rows.length !== 1 || [row.applied, row.pending_from, row.pending_target].some(v => v !== null && !hash(v)) || !revision(row.seed_revision) || (row.pending_revision !== null && (!revision(row.pending_revision) || row.pending_revision === 0)) || (row.pending_target === null && row.pending_revision !== null)) throw Error("invalid-bootstrap-state");
  return { applied: row.applied as string | null, pendingFrom: row.pending_from as string | null, pendingTarget: row.pending_target as string | null, seedRevision:row.seed_revision, pendingRevision:row.pending_revision as number|null };
}
async function headRevision(query: Query, head: string) {
  const { rows } = await query("SELECT revision_id FROM rag_heads WHERE name=$1", [head]);
  if (rows.length > 1 || (rows.length && !hash(rows[0].revision_id))) throw Error("invalid-head");
  return rows.length ? rows[0].revision_id as string : null;
}
/** Called only while the matching existing importer holds its global advisory lock. */
export async function manageBootstrapHead(query: Query, head: string, target: string, apply: () => Promise<unknown>, seedRevision=1) {
  const current = await headRevision(query, head), saved = await marker(query, head);
  const decision = bootstrapDecision(current, saved, target,seedRevision);
  if (decision === "preserve") return { head, action: "preserved" };
  if (decision === "import") {
    const appliedRevision=saved?.pendingTarget===current ? saved.pendingRevision??0 : saved?.seedRevision??0;
    await query(`INSERT INTO scs_rag_bootstrap(head,applied,pending_from,pending_target,seed_revision,pending_revision) VALUES($1,$2,$2,$3,$4,$5)
      ON CONFLICT(head) DO UPDATE SET applied=$2,pending_from=$2,pending_target=$3,seed_revision=$4,pending_revision=$5`, [head, current, target,appliedRevision,seedRevision]);
    await apply();
    if (await headRevision(query, head) !== target) throw Error("publication-not-confirmed");
  }
  await query(`INSERT INTO scs_rag_bootstrap(head,applied,pending_from,pending_target,seed_revision,pending_revision) VALUES($1,$2,NULL,NULL,$3,NULL)
    ON CONFLICT(head) DO UPDATE SET applied=$2,pending_from=NULL,pending_target=NULL,seed_revision=$3,pending_revision=NULL`, [head, target,seedRevision]);
  return { head, action: decision === "same" ? "unchanged" : "published" };
}

export async function seedEmbeddingCache(query: Query, entries: readonly SeedEntry[]) {
  await query("BEGIN");
  try {
    for (const entry of entries) {
      const p = entry.profile;
      await query("INSERT INTO rag_profiles(id,provider,model,dimensions,input_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [p.id,p.provider,p.model,p.dimensions,p.inputVersion]);
      const profile = await query("SELECT provider,model,dimensions,input_version FROM rag_profiles WHERE id=$1", [p.id]);
      const stored = profile.rows[0];
      if (!stored || canonicalJson(stored) !== canonicalJson({ provider:p.provider,model:p.model,dimensions:p.dimensions,input_version:p.inputVersion })) throw Error("seed-profile-conflict");
      await query("INSERT INTO rag_embedding_cache(profile_id,dimensions,input_hash,input_text,embedding) VALUES($1,$2,$3,$4,$5::vector) ON CONFLICT DO NOTHING", [p.id,p.dimensions,entry.inputHash,entry.input,vectorParameter(entry.vector,p.dimensions)]);
      const cached = await query("SELECT input_text,dimensions,embedding::text AS embedding FROM rag_embedding_cache WHERE profile_id=$1 AND input_hash=$2", [p.id,entry.inputHash]);
      const row=cached.rows[0];
      if (!row || row.input_text !== entry.input || row.dimensions !== p.dimensions) throw Error("seed-cache-conflict");
      vectorParameter(JSON.parse(String(row.embedding)), p.dimensions);
    }
    await query("COMMIT");
  } catch (error) { await query("ROLLBACK"); throw error; }
}

export async function provisionRoles(query: Query, credentials: { reader: string; ingester: string }) {
  // Prevent generated DDL password literals from being copied into error-statement logs.
  await query("SET log_statement = 'none'");
  await query("SET log_min_error_statement = 'panic'");
  const settings=await query("SELECT current_setting('log_statement') AS statements,current_setting('log_min_error_statement') AS errors");
  if(settings.rows[0]?.statements!=="none"||settings.rows[0]?.errors!=="panic")throw Error("unsafe-role-logging");
  for (const key of ["reader", "ingester"] as const) {
    const role = RAG_ROLES[key] as string, password = credentials[key];
    if (!/^[a-f0-9]{64}$/.test(password)) throw Error("invalid-db-credentials");
    const result = await query("SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1", [role]);
    if (!result.rows.length) {
      await query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);
      await query(`COMMENT ON ROLE "${role}" IS 'strahov-docker-rag-v1'`);
    } else if (result.rows.length !== 1 || result.rows[0].marker !== "strahov-docker-rag-v1" || ["rolsuper","rolcreaterole","rolcreatedb","rolreplication","rolbypassrls"].some(k => result.rows[0][k] !== false)) throw Error("bootstrap-role-conflict");
    await query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  }
}

type BootstrapDependencies = {
  query: Query;
  migrate(): Promise<void>;
  legacy(): Promise<RagImportSession>;
  documents(): Promise<RagDocumentImportSession>;
  embedder(profile: EmbeddingProfile): Embedder;
};
export async function assertBootstrapProfile(query:Query,profile:EmbeddingProfile) {
  const result=await query("SELECT p.provider,p.model,p.dimensions,r.state FROM rag_heads h LEFT JOIN rag_revisions r ON r.id=h.revision_id LEFT JOIN rag_profiles p ON p.id=r.profile_id WHERE h.name IN ('public','public-documents','public-archive')");
  if(result.rows.some(row=>row.state!=="ready"||row.provider!==profile.provider||row.model!==profile.model||row.dimensions!==profile.dimensions))throw Error("bootstrap-profile-change-required");
}
export async function importBootstrap(datasets: Datasets, bundles: readonly KnowledgeDocumentBundleV3[], profile: EmbeddingProfile,
  dependencies: BootstrapDependencies, limits: { maxEmbeddingInputs:number; maxEmbeddingBytes:number }, signal?: AbortSignal, seedRevision=1) {
  await dependencies.migrate();
  const remaining = { ...limits };
  const options = () => ({ ...remaining, retryUncertain:false, signal });
  const account = <T extends {embeddedInputs:number;embeddingInputBytes:number}>(result:T) => {
    remaining.maxEmbeddingInputs-=result.embeddedInputs;remaining.maxEmbeddingBytes-=result.embeddingInputBytes;return result;
  };
  const outcomes: { head:string; action:string }[] = [];
  const legacyPlan = prepareRagCorpus(datasets.currentDatasets,datasets.archiveDatasets,profile);
  const legacy = await dependencies.legacy();
  try { await assertBootstrapProfile(dependencies.query,profile);outcomes.push(await manageBootstrapHead(dependencies.query,"public",legacyPlan.revisionId,
    async() => account(await importPreparedCorpus(legacyPlan,legacy,{...options(),embedder:dependencies.embedder(profile)})),seedRevision)); }
  finally { await legacy.close(); }
  const documentProfile = createEmbeddingProfile({model:profile.model,dimensions:profile.dimensions,inputVersion:"title-heading-text-v2"});
  for (const collection of ["current","archive"] as const) {
    const selected=bundles.filter(bundle=>bundle.document.status===(collection==="current"?"current":"archived"));
    if (!selected.length) continue;
    const session=await dependencies.documents();
    try {
      await assertBootstrapProfile(dependencies.query,profile);
      const context=await session.context(collection), head=collection==="current"?"public-documents":"public-archive";
      const plan=prepareDocumentChanges(context,{collection,expectedSnapshotId:context.snapshot?.id??null,upserts:selected},documentProfile);
      outcomes.push(await manageBootstrapHead(dependencies.query,head,plan.revisionId,
        async()=>account(await importPreparedDocumentCorpus(plan,session,{...options(),embedder:dependencies.embedder(documentProfile)})),seedRevision));
    } finally { await session.close(); }
  }
  return outcomes;
}

async function readSeed(path:string) {
  const info=await lstat(path),maximum=64*1024*1024;
  if (!info.isFile()||info.isSymbolicLink()||info.size>maximum)throw Error("invalid-seed-file");
  const bytes=await readFile(path);if(bytes.length>maximum)throw Error("invalid-seed-file");
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)) as unknown;
}
function limit(value:string|undefined,fallback:number,maximum:number) {
  if(value===undefined)return fallback;
  if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>maximum)throw Error("invalid-bootstrap-budget");
  return Number(value);
}
export function bootstrapFailure(error:unknown) {
  const code=error instanceof Error?error.message:"";
  const known=["bootstrap-profile-change-required","bootstrap-seed-revision-conflict","bootstrap-pending-seed-revision","invalid-seed-revision","uncertain-embedding-attempt","embedding-budget","bootstrap-role-conflict","unsafe-role-logging","unsafe-database-logging","import-busy"];
  return {ready:false,error:known.includes(code)?code:"rag-bootstrap-failed"};
}
export async function dockerRagBootstrap(env:NodeJS.ProcessEnv=process.env,signal?:AbortSignal) {
  const connectionFailure=new AbortController();
  signal=signal?AbortSignal.any([signal,connectionFailure.signal]):connectionFailure.signal;
  const paths=credentialPaths(env),owner=await readCredentials(paths.owner,["owner","ingester"]),reader=await readCredentials(paths.reader,["reader"]);
  const apiKey=await readPrivateText(env.OPENAI_API_KEY_FILE||"/run/secrets/openai_api_key");if(!apiKey)throw Error("openai-key-required");
  const datasets=await loadApprovedRagDatasets();
  const documentSeed=await readSeed(env.RAG_DOCUMENT_SEED||"server/data/rag/bootstrap-documents.json");
  const seedRevision=bootstrapSeedRevision(documentSeed),bundles=validateBootstrapDocuments(documentSeed);
  const entries=validateBootstrapCache(await readSeed(env.RAG_CACHE_SEED||"server/data/rag/bootstrap-cache.json"),datasets,bundles);
  const profile=createEmbeddingProfile({model:env.OPENAI_EMBEDDING_MODEL||undefined,dimensions:env.OPENAI_EMBEDDING_DIMENSIONS===undefined?undefined:Number(env.OPENAI_EMBEDDING_DIMENSIONS)});
  const ownerUrl=ragConnection(RAG_ROLES.owner,owner.owner,env),ingesterUrl=ragConnection(RAG_ROLES.ingester,owner.ingester,env);
  const client=new Client({connectionString:ownerUrl,connectionTimeoutMillis:10000,statement_timeout:30000});
  const query:Query=async(sql,values)=>{if(signal?.aborted)throw Error("bootstrap-aborted");return client.query(sql,values);};
  const onConnectionError=()=>connectionFailure.abort();client.on("error",onConnectionError);
  try {
    await client.connect();
    const logging=await query("SELECT current_setting('log_parameter_max_length') AS normal,current_setting('log_parameter_max_length_on_error') AS errors");
    if(logging.rows[0]?.normal!=="0"||logging.rows[0]?.errors!=="0")throw Error("unsafe-database-logging");
    await query("BEGIN");
    try { await query("SELECT pg_advisory_xact_lock(18472,2)");await provisionRoles(query,{reader:reader.reader,ingester:owner.ingester});await query("COMMIT"); }
    catch(error){await query("ROLLBACK");throw error;}
    await migrateRagSchema({connectionString:ownerUrl,readerRole:RAG_ROLES.reader,ingesterRole:RAG_ROLES.ingester},signal);
    // Seed cache only under the same lock used by all importers; no active head is changed.
    const seedLock=await openRagImportSession({connectionString:ingesterUrl},signal);
    try {
      await assertBootstrapProfile(query,profile);
      await query("CREATE TABLE IF NOT EXISTS scs_rag_bootstrap(head text PRIMARY KEY,applied text,pending_from text,pending_target text)");
      await query("ALTER TABLE scs_rag_bootstrap ADD COLUMN IF NOT EXISTS seed_revision integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS pending_revision integer");
      await query("REVOKE ALL ON scs_rag_bootstrap FROM PUBLIC");
      await seedEmbeddingCache(query,entries);
    } finally { await seedLock.close(); }
    return await importBootstrap(datasets,bundles,profile,{query,migrate:async()=>{},
      legacy:()=>openRagImportSession({connectionString:ingesterUrl},signal),documents:()=>openRagDocumentImportSession({connectionString:ingesterUrl},signal),
      embedder:p=>createOpenAIEmbedder({apiKey,profile:p})},
      {maxEmbeddingInputs:limit(env.RAG_BOOTSTRAP_MAX_INPUTS,256,10000),maxEmbeddingBytes:limit(env.RAG_BOOTSTRAP_MAX_BYTES,1048576,64*1024*1024)},signal,seedRevision);
  } finally { await client.end().catch(()=>{});client.off("error",onConnectionError); }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const controller=new AbortController(),cancel=()=>controller.abort();process.once("SIGTERM",cancel);process.once("SIGINT",cancel);
  dockerRagBootstrap(process.env,controller.signal).then(result=>console.log(JSON.stringify({ready:true,heads:result})),error=>{console.error(JSON.stringify(bootstrapFailure(error)));process.exitCode=1;}).finally(()=>{process.off("SIGTERM",cancel);process.off("SIGINT",cancel);});
}
