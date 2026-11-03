import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bootstrapDecision, manageBootstrapHead, validateBootstrapCache, validateBootstrapDocuments, provisionRoles, importBootstrap, seedEmbeddingCache, assertBootstrapProfile, bootstrapSeedRevision, bootstrapFailure, type BootstrapMarker } from "../scripts/docker-rag-bootstrap";
import { loadApprovedRagDatasets } from "../scripts/rag-import";
import { createEmbeddingProfile, type Embedder } from "../server/rag-embeddings";
import { prepareDocumentChanges, prepareRagCorpus } from "../server/rag-ingest";
import { buildCuratedKnowledgeDocumentV3 } from "../server/rag-curation-contract";
import { documentEmbeddingInputV3, embeddingInputHash } from "../server/rag-embeddings";
import { canonicalHash, type RagImportSession, type SqlResult, type PreparedDocumentCorpus, type RagDocumentImportSession, type RagSearchSnapshot } from "../server/rag-vector-store";

const profile=createEmbeddingProfile({dimensions:3}), old="1".repeat(64), target="2".repeat(64), foreign="3".repeat(64);

test("bootstrap accepts reviewed curation with the same exact input cache guard as extracted documents", async () => {
  const bundle = buildCuratedKnowledgeDocumentV3({
    id: "bootstrap-community", itemId: "bootstrap-community", title: "Syntetická komunitní zkušenost",
    status: "current", verification: "community-experience", applicability: "Pouze testovací situace.",
    reviewedAt: "2026-11-03", reviewAfter: "2027-02-01", factCheckedAt: null,
    observedFrom: "2026-10-01", observedUntil: "2026-10-01",
    limitations: ["Syntetický test, nejde o skutečný obsah chatu."], supportingRefs: [],
    archiveReason: null, versionNote: "Test bootstrapu kurace.",
  }, { text: "Otázka: Jak se domluvit? Odpověď: V testovacím případu pomohla předchozí domluva.", headingPath: ["Test"], tokenCount: 40 });
  const bundles = validateBootstrapDocuments({schemaVersion: 1, revision: 2, bundles: [bundle]});
  assert.equal(bundles[0].document.sourceVersionId, bundle.document.sourceVersionId);
  assert.equal(bundles[0].document.authority, null);
  const p = createEmbeddingProfile({dimensions: 3, inputVersion: "title-heading-text-v2"});
  const input = documentEmbeddingInputV3(bundle.document, bundle.chunks[0], p);
  const entry = {profile: p, input, inputHash: embeddingInputHash(input), vector: [1,0,0]};
  const datasets = await loadApprovedRagDatasets();
  assert.equal(validateBootstrapCache({schemaVersion: 1, entries: [entry]}, datasets, bundles).length, 1);
  assert.throws(() => validateBootstrapCache({schemaVersion: 1, entries: [{...entry,input:"Raw private conversation",inputHash:embeddingInputHash("Raw private conversation")}]}, datasets, bundles));
});
function state() {
  const heads=new Map<string,string>(), markers=new Map<string,BootstrapMarker>();
  const query=async(sql:string, values:unknown[]=[]):Promise<SqlResult>=>{
    const name=String(values[0]);
    if(sql.startsWith("SELECT p.provider"))return {rows:[]};
    if(sql.startsWith("SELECT revision_id"))return {rows:heads.has(name)?[{revision_id:heads.get(name)}]:[]};
    if(sql.startsWith("SELECT applied")){const m=markers.get(name);return {rows:m?[{applied:m.applied,pending_from:m.pendingFrom,pending_target:m.pendingTarget,seed_revision:m.seedRevision,pending_revision:m.pendingRevision}]:[]};}
    if(sql.startsWith("INSERT INTO scs_rag_bootstrap")){markers.set(name,values.length===5?{applied:values[1] as string|null,pendingFrom:values[1] as string|null,pendingTarget:values[2] as string,seedRevision:values[3] as number,pendingRevision:values[4] as number}:{applied:values[1] as string,pendingFrom:null,pendingTarget:null,seedRevision:values[2] as number,pendingRevision:null});return {rows:[]};}
    throw Error("unexpected fake SQL");
  };
  return {heads,markers,query};
}

const curatedCutoff = Date.parse("2026-11-10T00:00:00Z");
const noEmbeddingBudget = { maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 };
function curatedSeed(id: string, reviewAfter = "2026-11-10", reviewedAt = "2026-11-03", official = false, archived = false) {
  return buildCuratedKnowledgeDocumentV3({
    id, itemId: id, title: "Syntetická znalost " + id,
    status: archived ? "archived" : "current",
    verification: official ? "verified-official" : "community-experience",
    applicability: "Pouze syntetický test bootstrapu.", reviewedAt, reviewAfter,
    factCheckedAt: official ? reviewedAt : null,
    observedFrom: "2026-10-01", observedUntil: "2026-10-01",
    limitations: ["Syntetický test bez původních zpráv."],
    supportingRefs: official ? [{ publisher: "silicon-hill", title: "Testovaný veřejný zdroj",
      url: "https://www.siliconhill.cz/pages/clenstvi", locator: "Správa členství",
      factCheckedAt: reviewedAt, reviewAfter }] : [],
    archiveReason: archived ? "Syntetická archivní verze." : null, versionNote: "Test bootstrapu.",
  }, { text: "Syntetická přenositelná odpověď.", headingPath: ["Test"], tokenCount: 35 });
}
function curatedBootstrapFixture() {
  const s = state(), p = createEmbeddingProfile({ dimensions: 3 });
  const dp = createEmbeddingProfile({ dimensions: 3, inputVersion: "title-heading-text-v2" });
  const datasets = { currentDatasets: [{ version: 2, sources: [], chunks: [] }], archiveDatasets: [] };
  const plans = new Map<"current" | "archive", PreparedDocumentCorpus>();
  const prepared: PreparedDocumentCorpus[] = [];
  const stats = { migrations: 0, opened: 0, closed: 0, embeddingCalls: 0, documentPublishAttempts: 0 };
  let failDocumentPublication = false;
  const shared = {
    async prepare() { return "building" as const; },
    async cached(_profile: typeof p, inputs: readonly { inputHash: string }[]) { return new Set(inputs.map(input => input.inputHash)); },
    async uncertain() { return []; },
    async startAttempt() { throw Error("synthetic cache must prevent API work"); },
    async completeAttempt() {}, async failAttempt() {}, async close() { stats.closed++; },
  };
  const dependencies = {
    query: s.query,
    async migrate() { stats.migrations++; },
    async legacy(): Promise<RagImportSession> {
      stats.opened++;
      return { ...shared, async publish(plan) { s.heads.set("public", plan.revisionId); } };
    },
    async documents(): Promise<RagDocumentImportSession> {
      stats.opened++;
      return { ...shared,
        async context(collection) {
          const scope = { kind: collection };
          const heads: RagSearchSnapshot["heads"] = {
            legacy: collection === "current" && s.heads.has("public") ? { name: "public", revisionId: s.heads.get("public")!, profile: p } : null,
            documents: collection === "current" && plans.has("current") ? { name: "public-documents", revisionId: plans.get("current")!.revisionId, profile: dp } : null,
            archive: collection === "archive" && plans.has("archive") ? { name: "public-archive", revisionId: plans.get("archive")!.revisionId, profile: dp } : null,
          };
          const snapshot: RagSearchSnapshot = { id: canonicalHash(["search-view-v1", scope, heads]), scope, heads,
            embeddingSpace: { provider: p.provider, model: p.model, dimensions: p.dimensions } };
          return { collection, snapshot, dataset: plans.get(collection)?.dataset ?? { version: 3, documents: [], blocks: [], chunks: [] }, suppressions: [], legacySources: [] };
        },
        async prepare(plan) { prepared.push(plan); return "building"; },
        async publish(plan) {
          stats.documentPublishAttempts++;
          if (failDocumentPublication) throw Error("synthetic publication interrupted");
          plans.set(plan.collection, plan);
          s.heads.set(plan.collection === "current" ? "public-documents" : "public-archive", plan.revisionId);
        },
      };
    },
    embedder(profile: typeof p): Embedder { return { profile, async embed() { stats.embeddingCalls++; throw Error("unexpected API work"); } }; },
  };
  return { ...s, stats, plans, prepared, datasets, profile: p, dependencies,
    failPublication() { failDocumentPublication = true; },
    resumePublication() { failDocumentPublication = false; },
    run(bundles: Parameters<typeof importBootstrap>[1], seedRevision = 2) { return importBootstrap(datasets, bundles, p, dependencies, noEmbeddingBudget, undefined, seedRevision); },
  };
}

test("ordinary bootstrap restart after curated expiry retains the published dataset without API work", async t => {
  let instant = curatedCutoff - 1;
  t.mock.method(Date, "now", () => instant);
  const f = curatedBootstrapFixture(), bundles = [curatedSeed("short-review"), curatedSeed("long-review", "2026-12-03")];
  await f.run(bundles);
  const heads = structuredClone(f.heads), markers = structuredClone(f.markers), dataset = structuredClone(f.plans.get("current")!.dataset);
  instant = curatedCutoff;
  const result = await f.run(bundles);
  assert.equal(result.find(outcome => outcome.head === "public-documents")?.action, "unchanged");
  assert.deepEqual(f.heads, heads);
  assert.deepEqual(f.markers, markers);
  assert.deepEqual(f.plans.get("current")!.dataset, dataset);
  assert.equal(f.stats.documentPublishAttempts, 1);
  assert.equal(f.stats.embeddingCalls, 0);
  assert.equal(f.stats.opened, f.stats.closed);
});

test("fresh bootstrap after expiry admits only eligible current curated seeds", async t => {
  t.mock.method(Date, "now", () => curatedCutoff);
  const f = curatedBootstrapFixture(), expired = curatedSeed("expired-review"), eligible = curatedSeed("eligible-review", "2026-12-03");
  await f.run([expired, eligible]);
  const plan = f.plans.get("current")!;
  assert.deepEqual(plan.dataset.documents.map(document => document.id), ["eligible-review"]);
  assert.deepEqual(plan.upsertSourceVersionIds, [eligible.document.sourceVersionId]);
  assert.equal(plan.inputs.length, 1);
  assert.equal(f.stats.embeddingCalls, 0);
  assert.equal(f.stats.opened, f.stats.closed);
});

test("curated expiry is half-open at UTC midnight, including an all-expired current seed", async t => {
  let instant = curatedCutoff - 1;
  t.mock.method(Date, "now", () => instant);
  const bundle = curatedSeed("boundary-review"), before = curatedBootstrapFixture();
  await before.run([bundle]);
  assert.equal(before.plans.get("current")!.dataset.documents.length, 1);
  const head = before.heads.get("public-documents");
  instant = curatedCutoff;
  const restarted = await before.run([bundle]);
  assert.equal(restarted.find(outcome => outcome.head === "public-documents")?.action, "unchanged");
  assert.equal(before.heads.get("public-documents"), head);
  for (const at of [curatedCutoff, curatedCutoff + 1]) {
    instant = at;
    const fresh = curatedBootstrapFixture();
    await fresh.run([bundle]);
    assert.deepEqual(fresh.plans.get("current")!.dataset.documents, []);
    assert.deepEqual(fresh.plans.get("current")!.upsertSourceVersionIds, []);
    assert.equal(fresh.stats.embeddingCalls, 0);
    assert.equal(fresh.stats.opened, fresh.stats.closed);
  }
  // The exception belongs to bootstrap admission, not the explicit importer.
  assert.throws(() => prepareDocumentChanges({ collection: "current", snapshot: null,
    dataset: { version: 3, documents: [], blocks: [], chunks: [] }, suppressions: [], legacySources: [] },
  { collection: "current", expectedSnapshotId: null, upserts: [bundle] },
  createEmbeddingProfile({ dimensions: 3, inputVersion: "title-heading-text-v2" }), instant), /invalid-import-data/);
});

test("bootstrap expiry filtering preserves context documents absent from the seed", async t => {
  let instant = curatedCutoff - 1;
  t.mock.method(Date, "now", () => instant);
  const f = curatedBootstrapFixture(), short = curatedSeed("short-review"), long = curatedSeed("long-review", "2026-12-03");
  await f.run([short, long, curatedSeed("retained-context", "2026-12-03")]);
  const dataset = structuredClone(f.plans.get("current")!.dataset), heads = structuredClone(f.heads);
  instant = curatedCutoff;
  await f.run([short, long]);
  assert.deepEqual(f.heads, heads);
  assert.deepEqual(f.plans.get("current")!.dataset, dataset);
  assert.equal(f.stats.documentPublishAttempts, 1);
});

test("malformed expired seeds are validated before migration or any publication", async t => {
  t.mock.method(Date, "now", () => curatedCutoff);
  const bundle = curatedSeed("malformed-expired");
  const corrupted = { ...bundle, chunks: bundle.chunks.map(chunk => ({ ...chunk, text: "Unhashed changed text." })) };
  for (const bundles of [[corrupted], [bundle, bundle]]) {
    const f = curatedBootstrapFixture();
    await assert.rejects(f.run(bundles), /invalid-document-data/);
    assert.equal(f.stats.migrations, 0);
    assert.equal(f.stats.opened, 0);
    assert.equal(f.heads.size, 0);
    assert.equal(f.markers.size, 0);
    assert.equal(f.stats.embeddingCalls, 0);
  }
});

test("future reviewed or fact-checked seeds are rejected rather than filtered away", async t => {
  t.mock.method(Date, "now", () => curatedCutoff);
  for (const official of [false, true]) {
    const f = curatedBootstrapFixture();
    await f.run([]);
    const heads = structuredClone(f.heads), markers = structuredClone(f.markers);
    await assert.rejects(f.run([curatedSeed("future-review", "2026-12-03", "2026-11-11", official)]), /invalid-import-data/);
    assert.deepEqual(f.heads, heads);
    assert.deepEqual(f.markers, markers);
    assert.equal(f.stats.documentPublishAttempts, 0);
    assert.equal(f.stats.embeddingCalls, 0);
    assert.equal(f.stats.opened, f.stats.closed);
  }
});

test("archived curated seeds do not receive the current-upsert expiry exception", async t => {
  t.mock.method(Date, "now", () => curatedCutoff);
  const f = curatedBootstrapFixture();
  await assert.rejects(f.run([curatedSeed("expired-archive", "2026-11-10", "2026-11-03", false, true)]), /invalid-import-data/);
  assert.equal(f.heads.has("public-archive"), false);
  assert.equal(f.stats.documentPublishAttempts, 0);
  assert.equal(f.stats.opened, f.stats.closed);
});

test("bootstrap uses one captured clock for expiry filtering and admission", async t => {
  let reads = 0;
  t.mock.method(Date, "now", () => reads++ === 0 ? curatedCutoff - 1 : curatedCutoff);
  const f = curatedBootstrapFixture();
  await f.run([curatedSeed("captured-clock")]);
  assert.equal(f.plans.get("current")!.dataset.documents.length, 1);
  assert.equal(reads, 1);
});

test("pending publication crossing expiry fails closed even when all current seeds expire", async t => {
  let instant = curatedCutoff - 1;
  t.mock.method(Date, "now", () => instant);
  for (const publishedBefore of [false, true]) {
    instant = curatedCutoff - 1;
    const f = curatedBootstrapFixture(), bundles = [curatedSeed("pending-review")];
    if (publishedBefore) await f.run([curatedSeed("retained-base", "2026-12-03")], 1);
    f.failPublication();
    await assert.rejects(f.run(bundles), /synthetic publication interrupted/);
    const heads = structuredClone(f.heads), markers = structuredClone(f.markers);
    const prepared = f.prepared.length, attempts = f.stats.documentPublishAttempts;
    assert.ok(f.markers.get("public-documents")?.pendingTarget);
    assert.equal(f.heads.has("public-documents"), publishedBefore);
    instant = curatedCutoff;
    f.resumePublication();
    await assert.rejects(f.run(bundles), /bootstrap-seed-revision-conflict/);
    assert.deepEqual(f.heads, heads);
    assert.deepEqual(f.markers, markers);
    assert.equal(f.prepared.length, prepared, "pending import must not be retried with a different target");
    assert.equal(f.stats.documentPublishAttempts, attempts);
    assert.equal(f.stats.embeddingCalls, 0);
    assert.equal(f.stats.opened, f.stats.closed);
  }
});
test("bootstrap preserves externally managed or replaced legacy and v3 heads",async()=>{
  for(const name of ["public","public-documents","public-archive"]){
    const s=state();s.heads.set(name,foreign);let called=false;
    assert.equal((await manageBootstrapHead(s.query,name,target,async()=>{called=true;})).action,"preserved");
    assert.equal(called,false);assert.equal(s.heads.get(name),foreign);assert.equal(s.markers.size,0);
    s.markers.set(name,{applied:old,pendingFrom:null,pendingTarget:null,seedRevision:1,pendingRevision:null});
    await manageBootstrapHead(s.query,name,target,async()=>{called=true;});assert.equal(called,false);
  }
});
test("bootstrap checkpoints recover both sides of publication without repeat API work",async()=>{
  const s=state();let applied=0;
  await assert.rejects(manageBootstrapHead(s.query,"public",old,async()=>{throw Error("before publish");}));
  assert.deepEqual(s.markers.get("public"),{applied:null,pendingFrom:null,pendingTarget:old,seedRevision:0,pendingRevision:1});
  await manageBootstrapHead(s.query,"public",old,async()=>{applied++;s.heads.set("public",old);});
  await assert.rejects(manageBootstrapHead(s.query,"public",target,async()=>{s.heads.set("public",target);throw Error("after publish");},2));
  await manageBootstrapHead(s.query,"public",target,async()=>{applied++;},2);
  assert.equal(applied,1);assert.deepEqual(s.markers.get("public"),{applied:target,pendingFrom:null,pendingTarget:null,seedRevision:2,pendingRevision:null});
  assert.equal(bootstrapDecision(null,{applied:old,pendingFrom:null,pendingTarget:null,seedRevision:1,pendingRevision:null},target),"preserve");
});
test("cache seed accepts only exact approved inputs and compatible profile/vector identity",async()=>{
  const datasets=await loadApprovedRagDatasets(),plan=prepareRagCorpus(datasets.currentDatasets,datasets.archiveDatasets,profile);
  const entry={profile,...plan.inputs[0],vector:[1,0,0]};
  assert.equal(validateBootstrapCache({schemaVersion:1,entries:[entry]},datasets,[]).length,1);
  for(const bad of [{...entry,input:"private query"},{...entry,profile:{...profile,id:old}},{...entry,vector:[1,0]},{...entry,vector:[2,0,0]}])assert.throws(()=>validateBootstrapCache({schemaVersion:1,entries:[bad]},datasets,[]));
  assert.throws(()=>validateBootstrapCache({schemaVersion:1,entries:[entry,entry]},datasets,[]));
  assert.deepEqual(validateBootstrapDocuments({schemaVersion:1,revision:1,bundles:[]}),[]);
  assert.throws(()=>validateBootstrapDocuments({schemaVersion:1,revision:1,bundles:[{document:{},blocks:[],chunks:[]}]}));
});
test("cache seeding is transactional and never overwrites existing vectors",async()=>{
  const datasets=await loadApprovedRagDatasets(),entry={profile,...prepareRagCorpus(datasets.currentDatasets,datasets.archiveDatasets,profile).inputs[0],vector:[1,0,0]};
  const calls:string[]=[];
  const query=async(sql:string):Promise<SqlResult>=>{calls.push(sql);if(sql.startsWith("SELECT provider"))return {rows:[{provider:profile.provider,model:profile.model,dimensions:3,input_version:profile.inputVersion}]};if(sql.startsWith("SELECT input_text"))return {rows:[{input_text:"wrong",dimensions:3,embedding:"[1,0,0]"}]};return {rows:[]};};
  await assert.rejects(seedEmbeddingCache(query,[entry]),/seed-cache-conflict/);
  assert.equal(calls.at(-1),"ROLLBACK");assert.ok(calls.filter(s=>s.startsWith("INSERT")).every(s=>s.includes("ON CONFLICT DO NOTHING")));
  assert.ok(!calls.some(s=>s.startsWith("UPDATE")));
});
test("limited roles are created without administrative privileges and foreign roles are rejected",async()=>{
  const calls:string[]=[];
  await provisionRoles(async sql=>{calls.push(sql);return {rows:sql.startsWith("SELECT current_setting")?[{statements:"none",errors:"panic"}]:[]};},{reader:"a".repeat(64),ingester:"b".repeat(64)});
  const creates=calls.filter(sql=>sql.startsWith("CREATE ROLE"));assert.equal(creates.length,2);
  assert.ok(creates.every(sql=>sql.includes("NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT")));
  await assert.rejects(provisionRoles(async sql=>({rows:sql.startsWith("SELECT current_setting")?[{statements:"none",errors:"panic"}]:sql.startsWith("SELECT")?[{marker:"foreign",rolsuper:false}]:[]}),{reader:"a".repeat(64),ingester:"b".repeat(64)}),/bootstrap-role-conflict/);
  await assert.rejects(provisionRoles(async()=>({rows:[{statements:"all",errors:"error"}]}),{reader:"a".repeat(64),ingester:"b".repeat(64)}),/unsafe-role-logging/);
});
test("startup reuses a preseeded corpus, unchanged restart does not publish and migration failure stops import",async()=>{
  const datasets=await loadApprovedRagDatasets(),plan=prepareRagCorpus(datasets.currentDatasets,datasets.archiveDatasets,profile),s=state();
  let requests=0,published=0,opened=0,closed=0;
  const cache=new Set(plan.inputs.map(i=>i.inputHash));
  const session=():RagImportSession=>({async prepare(){return "building";},async cached(_p,inputs){return new Set(inputs.filter(i=>cache.has(i.inputHash)).map(i=>i.inputHash));},async uncertain(){return [];},async startAttempt(){return "attempt";},async completeAttempt(_id,_p,entries){entries.forEach(e=>cache.add(e.inputHash));},async failAttempt(){},async publish(p){published++;s.heads.set("public",p.revisionId);},async close(){closed++;}});
  const dependencies={query:s.query,migrate:async()=>{},legacy:async()=>{opened++;return session();},documents:async()=>{throw Error("unexpected documents");},embedder:(p:typeof profile):Embedder=>({profile:p,async embed(inputs,options){requests++;options.onAttempt?.(inputs.reduce((n,s)=>n+Buffer.byteLength(s),0));return {vectors:inputs.map(()=>[1,0,0]),usage:{promptTokens:1,totalTokens:1}};}})};
  await importBootstrap(datasets,[],profile,dependencies,{maxEmbeddingInputs:0,maxEmbeddingBytes:0});
  await importBootstrap(datasets,[],profile,dependencies,{maxEmbeddingInputs:0,maxEmbeddingBytes:0});
  assert.equal(requests,0);assert.equal(published,1);assert.equal(opened,closed);
  await assert.rejects(importBootstrap(datasets,[],profile,{...dependencies,migrate:async()=>{throw Error("migration failed");}},{maxEmbeddingInputs:0,maxEmbeddingBytes:0}));
  assert.equal(opened,2);
  s.heads.set("public",foreign);
  await importBootstrap(datasets,[],profile,dependencies,{maxEmbeddingInputs:0,maxEmbeddingBytes:0});
  assert.equal(s.heads.get("public"),foreign);assert.equal(published,1);
});
test("uncertain import is not automatically retried and its session closes",async()=>{
  const datasets=await loadApprovedRagDatasets(),plan=prepareRagCorpus(datasets.currentDatasets,datasets.archiveDatasets,profile),s=state();let closed=false,called=false;
  const session:RagImportSession={async prepare(){return "building";},async cached(){return new Set();},async uncertain(){return [plan.inputs[0].inputHash];},async startAttempt(){throw Error("must not attempt");},async completeAttempt(){},async failAttempt(){},async publish(){throw Error("must not publish");},async close(){closed=true;}};
  await assert.rejects(importBootstrap(datasets,[],profile,{query:s.query,migrate:async()=>{},legacy:async()=>session,documents:async()=>{throw Error();},embedder:p=>({profile:p,async embed(){called=true;throw Error();}})},{maxEmbeddingInputs:256,maxEmbeddingBytes:1048576}),/uncertain-embedding-attempt/);
  assert.equal(called,false);assert.equal(closed,true);assert.equal(s.heads.size,0);
});
test("packaged legacy and full-document seed publish and restart with zero embedding calls",async()=>{
  const datasets=await loadApprovedRagDatasets();
  const bundles=validateBootstrapDocuments(JSON.parse(await readFile(new URL("../server/data/rag/bootstrap-documents.json",import.meta.url),"utf8")));
  const entries=validateBootstrapCache(JSON.parse(await readFile(new URL("../server/data/rag/bootstrap-cache.json",import.meta.url),"utf8")),datasets,bundles);
  assert.ok(bundles.length>0);assert.ok(entries.length>0);
  const p=createEmbeddingProfile(),dp=createEmbeddingProfile({inputVersion:"title-heading-text-v2"}),s=state();
  const cache=new Set(entries.map(e=>e.profile.id+":"+e.inputHash));let calls=0,publications=0,closed=0;
  let documentPlan:PreparedDocumentCorpus|undefined;
  const shared={async prepare(){return "building" as const;},async cached(profile:typeof p,inputs:readonly {inputHash:string}[]){return new Set(inputs.filter(i=>cache.has(profile.id+":"+i.inputHash)).map(i=>i.inputHash));},async uncertain(){return [];},async startAttempt(){throw Error("seed must prevent API");},async completeAttempt(){},async failAttempt(){},async close(){closed++;}};
  const legacy=async():Promise<RagImportSession>=>({...shared,async publish(plan){publications++;s.heads.set("public",plan.revisionId);}});
  const documents=async():Promise<RagDocumentImportSession>=>({...shared,
    async context(collection){
      const scope={kind:collection};
      const heads:RagSearchSnapshot["heads"]={legacy:s.heads.has("public")?{name:"public",revisionId:s.heads.get("public")!,profile:p}:null,documents:documentPlan?{name:"public-documents",revisionId:documentPlan.revisionId,profile:dp}:null,archive:null};
      const snapshot:RagSearchSnapshot={id:canonicalHash(["search-view-v1",scope,heads]),scope,heads,embeddingSpace:{provider:p.provider,model:p.model,dimensions:p.dimensions}};
      return {collection,snapshot,dataset:documentPlan?.dataset??{version:3,documents:[],blocks:[],chunks:[]},suppressions:[],legacySources:[]};
    },async publish(plan){publications++;documentPlan=plan;s.heads.set("public-documents",plan.revisionId);}});
  const deps={query:s.query,migrate:async()=>{},legacy,documents,embedder:(profile:typeof p):Embedder=>({profile,async embed(){calls++;throw Error("unexpected API");}})};
  const first=await importBootstrap(datasets,bundles,p,deps,{maxEmbeddingInputs:0,maxEmbeddingBytes:0});
  assert.equal(first.filter(x=>x.action==="published").length,2);assert.equal(publications,2);
  const snapshot=[...s.heads];
  await importBootstrap(datasets,bundles,p,deps,{maxEmbeddingInputs:0,maxEmbeddingBytes:0});
  assert.deepEqual([...s.heads],snapshot);assert.equal(publications,2);assert.equal(calls,0);assert.equal(closed,4);
});
test("managed seed upgrades are monotonic and a rollback image cannot republish an older corpus",async()=>{
  const s=state();let calls=0;
  const publish=(id:string)=>async()=>{calls++;s.heads.set("public",id);};
  await manageBootstrapHead(s.query,"public",old,publish(old),1);
  await manageBootstrapHead(s.query,"public",target,publish(target),2);
  const marker=structuredClone(s.markers.get("public"));
  assert.equal((await manageBootstrapHead(s.query,"public",old,publish(old),1)).action,"preserved");
  assert.deepEqual(s.markers.get("public"),marker);assert.equal(s.heads.get("public"),target);assert.equal(calls,2);
  await assert.rejects(manageBootstrapHead(s.query,"public",old,publish(old),2),/bootstrap-seed-revision-conflict/);
  assert.equal(calls,2);assert.deepEqual(s.markers.get("public"),marker);
  await manageBootstrapHead(s.query,"public",target,publish(target),3);
  assert.equal(calls,2);assert.equal(s.markers.get("public")?.seedRevision,3);
  const newer=structuredClone(s.markers.get("public"));
  await manageBootstrapHead(s.query,"public",target,publish(target),2);
  assert.deepEqual(s.markers.get("public"),newer);
});
test("pending revision survives older and newer images until its publication is resolved",async()=>{
  const s=state();await manageBootstrapHead(s.query,"public",old,async()=>{s.heads.set("public",old);},1);
  await assert.rejects(manageBootstrapHead(s.query,"public",target,async()=>{throw Error("before publication");},2));
  const pending=structuredClone(s.markers.get("public"));let called=false;
  await assert.rejects(manageBootstrapHead(s.query,"public",foreign,async()=>{called=true;},3),/bootstrap-pending-seed-revision/);
  await assert.rejects(manageBootstrapHead(s.query,"public",foreign,async()=>{called=true;},2),/bootstrap-seed-revision-conflict/);
  await manageBootstrapHead(s.query,"public",old,async()=>{called=true;},1);
  assert.equal(called,false);assert.deepEqual(s.markers.get("public"),pending);
  s.heads.set("public",target); // The older process published and crashed before the marker commit.
  await manageBootstrapHead(s.query,"public",old,async()=>{called=true;},1);
  assert.equal(called,false);assert.equal(s.heads.get("public"),target);assert.deepEqual(s.markers.get("public"),pending);
  await manageBootstrapHead(s.query,"public",target,async()=>{called=true;},2);
  assert.equal(called,false);assert.equal(s.markers.get("public")?.seedRevision,2);assert.equal(s.markers.get("public")?.pendingRevision,null);
});
test("unversioned markers are adopted only for the exact current target, and foreign heads always win",async()=>{
  const s=state();s.heads.set("public",old);s.markers.set("public",{applied:old,pendingFrom:null,pendingTarget:null,seedRevision:0,pendingRevision:null});let called=false;
  assert.equal((await manageBootstrapHead(s.query,"public",target,async()=>{called=true;},1)).action,"preserved");
  assert.equal(s.markers.get("public")?.seedRevision,0);
  await manageBootstrapHead(s.query,"public",old,async()=>{called=true;},1);
  assert.equal(s.markers.get("public")?.seedRevision,1);assert.equal(called,false);
  s.heads.set("public",foreign);const before=structuredClone(s.markers.get("public"));
  await manageBootstrapHead(s.query,"public",target,async()=>{called=true;},1);
  assert.equal(s.heads.get("public"),foreign);assert.deepEqual(s.markers.get("public"),before);
  for(const bad of [0,-1,1.5,2147483648,"1"]){assert.throws(()=>bootstrapSeedRevision({schemaVersion:1,revision:bad,bundles:[]}));}
});
test("profile changes fail before an embedder or publication is reached",async()=>{
  await assertBootstrapProfile(async()=>({rows:[{provider:profile.provider,model:profile.model,dimensions:profile.dimensions,state:"ready"}]}),profile);
  for(const changed of [{model:"text-embedding-3-small"},{dimensions:1536},{provider:"other"},{state:"building"}]){
    await assert.rejects(assertBootstrapProfile(async()=>({rows:[{provider:profile.provider,model:profile.model,dimensions:profile.dimensions,state:"ready",...changed}]}),profile),/bootstrap-profile-change-required/);
  }
  const datasets=await loadApprovedRagDatasets();let called=false,closed=false;
  const session={close:async()=>{closed=true;}} as RagImportSession;
  await assert.rejects(importBootstrap(datasets,[],profile,{query:async()=>({rows:[{provider:profile.provider,model:profile.model,dimensions:1536,state:"ready"}]}),migrate:async()=>{},legacy:async()=>session,documents:async()=>{throw Error();},embedder:()=>{called=true;throw Error();}},{maxEmbeddingInputs:256,maxEmbeddingBytes:1048576}),/bootstrap-profile-change-required/);
  assert.equal(called,false);assert.equal(closed,true);
  assert.deepEqual(bootstrapFailure(Error("bootstrap-profile-change-required")),{ready:false,error:"bootstrap-profile-change-required"});
  assert.deepEqual(bootstrapFailure(Error("postgresql://reader:private-password@host/db")),{ready:false,error:"rag-bootstrap-failed"});
});
